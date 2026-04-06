"""
Ragas-based evaluation for IELTS Reading AI Assistant RAG system.

This module provides retrieval and answer quality evaluation using Ragas metrics
with custom metrics for question hit detection and noise penalty.
"""

import json
import os
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional

from dotenv import load_dotenv

# Match server/.env loading (server uses LLM_*; Ragas defaults to OPENAI_*).
_REPO_ROOT = Path(__file__).resolve().parents[2]
load_dotenv(_REPO_ROOT / "server" / ".env")


def _sync_ragas_env_from_server() -> None:
    """Copy LLM_* into OPENAI_* so LangChain/Ragas pick up the same key and base URL."""
    if not (os.getenv("OPENAI_API_KEY") or "").strip() and (os.getenv("LLM_API_KEY") or "").strip():
        os.environ["OPENAI_API_KEY"] = os.environ["LLM_API_KEY"].strip()
    if not (os.getenv("OPENAI_BASE_URL") or "").strip() and (os.getenv("LLM_BASE_URL") or "").strip():
        os.environ["OPENAI_BASE_URL"] = os.environ["LLM_BASE_URL"].strip().rstrip("/")
    # Embeddings client (LangChain reads OPENAI_API_BASE); server prefers EMBEDDING_* then OPENAI_EMBEDDING_BASE_URL.
    if not (os.getenv("OPENAI_API_BASE") or "").strip():
        emb = (
            (os.getenv("EMBEDDING_BASE_URL") or "").strip()
            or (os.getenv("OPENAI_EMBEDDING_BASE_URL") or "").strip()
        )
        llm_base = (os.getenv("LLM_BASE_URL") or "").strip()
        if emb:
            os.environ["OPENAI_API_BASE"] = emb.rstrip("/")
        elif llm_base:
            os.environ["OPENAI_API_BASE"] = llm_base.rstrip("/")


_sync_ragas_env_from_server()

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent.parent / "server" / "src"))

try:
    from ragas import evaluate
    from ragas.embeddings.base import embedding_factory
    from ragas.llms import llm_factory
    from ragas.metrics import (
        answer_relevancy,
        answer_similarity,
        context_precision,
        context_recall,
        faithfulness,
    )
    from datasets import Dataset
    RAGAS_AVAILABLE = True
except ImportError:
    RAGAS_AVAILABLE = False
    print("Warning: Ragas not installed. Run: pip install ragas datasets")


@dataclass
class EvalSample:
    """A single evaluation sample."""
    id: str
    questionId: str
    mode: str
    locale: str
    userQuery: str
    focusQuestionNumbers: List[str]
    expected_answer: str
    expected_evidence: Optional[Dict[str, Any]]
    official_explanation: Optional[str]
    query_variants: List[str]
    expectedStyle: str
    expectedResponseKind: Optional[str] = None
    attachments: Optional[List[Dict]] = None
    expectedQuestionType: Optional[str] = None  # e.g., 'heading_matching', 'paragraph_matching'
    headingListRequired: bool = False  # Whether heading list should be retrieved
    # Align with server AssistantQueryRequest (mode is legacy / documentation only)
    attemptContext: Optional[Dict[str, Any]] = None
    surface: Optional[str] = None
    action: Optional[str] = None
    promptKind: Optional[str] = None
    practiceContext: Optional[Dict[str, Any]] = None
    expectedAssistantRoute: Optional[str] = None  # For replay when API omits assistantRoute


@dataclass
class EvalResult:
    """Result of evaluating a single sample."""
    sample_id: str
    question_id: str
    mode: str
    user_query: str
    retrieved_chunks: List[Dict]
    generated_answer: str
    expected_answer: str
    expected_evidence: Optional[Dict]
    # Ragas metrics
    context_precision: float = 0.0
    context_recall: float = 0.0
    faithfulness: float = 0.0
    answer_relevancy: float = 0.0
    answer_similarity: float = 0.0
    # Custom metrics
    question_hit: bool = False
    noise_penalty: float = 0.0
    heading_list_hit: bool = False  # Whether heading list was retrieved (for heading_matching)
    style_match: bool = True  # Whether answer style matches expected
    # Metadata
    latency_ms: float = 0.0
    error: Optional[str] = None
    assistant_route: Optional[str] = None
    raw_api_response: Optional[Dict[str, Any]] = None


def load_golden_dataset(dataset_path: str) -> List[EvalSample]:
    """Load golden evaluation dataset from JSON file."""
    with open(dataset_path, 'r', encoding='utf-8') as f:
        data = json.load(f)

    samples = []
    for item in data:
        samples.append(EvalSample(
            id=item['id'],
            questionId=item['questionId'],
            mode=item['mode'],
            locale=item['locale'],
            userQuery=item['userQuery'],
            focusQuestionNumbers=item.get('focusQuestionNumbers', []),
            expected_answer=item['expected_answer'],
            expected_evidence=item.get('expected_evidence'),
            official_explanation=item.get('official_explanation'),
            query_variants=item.get('query_variants', []),
            expectedStyle=item.get('expectedStyle', 'full_tutoring'),
            expectedResponseKind=item.get('expectedResponseKind'),
            attachments=item.get('attachments'),
            expectedQuestionType=item.get('expectedQuestionType'),
            headingListRequired=item.get('headingListRequired', False),
            attemptContext=item.get('attemptContext'),
            surface=item.get('surface'),
            action=item.get('action'),
            promptKind=item.get('promptKind'),
            practiceContext=item.get('practiceContext'),
            expectedAssistantRoute=item.get('expectedAssistantRoute')
        ))
    return samples


def effective_assistant_route(sample: EvalSample, result: EvalResult) -> Optional[str]:
    return result.assistant_route or sample.expectedAssistantRoute


def should_skip_evidence_retrieval_metrics(sample: EvalSample, result: EvalResult) -> bool:
    """Skip paragraph-level hit/noise for social, general chat, or samples with no expected evidence."""
    route = effective_assistant_route(sample, result)
    if route in ('ielts_general', 'unrelated_chat'):
        return True
    if sample.expectedResponseKind == 'social':
        return True
    if sample.expected_evidence is None:
        return True
    return False


def compute_question_hit(
    retrieved_chunks: List[Dict],
    expected_evidence: Optional[Dict],
    focus_question_numbers: List[str],
    question_type: Optional[str] = None,
    heading_list_required: bool = False
) -> bool:
    """
    Check if retrieved chunks contain the expected evidence.

    Criteria:
    - For explicit question number queries: must hit corresponding question_item
    - For evidence-needed queries: must hit correct passage_paragraph
    - For review requests: prioritize answer_explanation
    - For heading_matching: must retrieve both heading list AND target paragraph
    """
    if not expected_evidence:
        return True  # No evidence expected (e.g., social questions)

    expected_paragraphs = set(expected_evidence.get('paragraphLabels', []))
    expected_chunk_type = expected_evidence.get('chunkType')
    key_phrases = expected_evidence.get('keyPhrases', [])

    if not retrieved_chunks:
        return False

    # Special handling for heading_matching questions
    heading_list_found = False
    if question_type == 'heading_matching' or heading_list_required:
        # Check if heading list is retrieved
        heading_list_found = any(
            'List of Headings' in chunk.get('content', '') or
            'heading_matching' in chunk.get('metadata', {}).get('questionType', '').lower()
            for chunk in retrieved_chunks
        )
        if heading_list_required and not heading_list_found:
            return False

    # For heading_matching, we need both heading list AND target paragraph
    if question_type == 'heading_matching' or heading_list_required:
        if not heading_list_found:
            return False
        # Now check if target paragraph is also retrieved
        # For heading_matching, paragraph match OR key phrase match is sufficient
        for chunk in retrieved_chunks:
            chunk_type = chunk.get('chunkType', '')
            paragraph_labels = set(chunk.get('paragraphLabels', []))
            content = chunk.get('content', '').lower()

            # Skip the heading list chunk itself for paragraph matching
            if 'List of Headings' in chunk.get('content', ''):
                continue

            # Check chunk type match
            if expected_chunk_type and chunk_type != expected_chunk_type:
                continue

            # Check paragraph label match
            if expected_paragraphs and not paragraph_labels.intersection(expected_paragraphs):
                continue

            # Check key phrase presence
            if key_phrases:
                phrase_matches = sum(1 for phrase in key_phrases if phrase.lower() in content)
                if phrase_matches >= len(key_phrases) * 0.5:  # At least 50% of key phrases
                    return True
            elif expected_paragraphs and paragraph_labels.intersection(expected_paragraphs):
                return True

        # If we have heading list but no paragraph match, check if key phrases
        # are in the heading list content itself
        if heading_list_found and key_phrases:
            for chunk in retrieved_chunks:
                if 'List of Headings' in chunk.get('content', ''):
                    content = chunk.get('content', '').lower()
                    phrase_matches = sum(1 for phrase in key_phrases if phrase.lower() in content)
                    if phrase_matches >= len(key_phrases) * 0.5:
                        return True

        return False

    # Regular (non-heading_matching) question hit logic
    for chunk in retrieved_chunks:
        chunk_type = chunk.get('chunkType', '')
        paragraph_labels = set(chunk.get('paragraphLabels', []))
        content = chunk.get('content', '').lower()

        # Check chunk type match
        if expected_chunk_type and chunk_type != expected_chunk_type:
            continue

        # Check paragraph label match
        if expected_paragraphs and not paragraph_labels.intersection(expected_paragraphs):
            continue

        # Check key phrase presence
        if key_phrases:
            phrase_matches = sum(1 for phrase in key_phrases if phrase.lower() in content)
            if phrase_matches >= len(key_phrases) * 0.5:  # At least 50% of key phrases
                return True
        elif expected_paragraphs and paragraph_labels.intersection(expected_paragraphs):
            return True

    return False


def compute_heading_list_hit(retrieved_chunks: List[Dict]) -> bool:
    """
    Check if heading list is retrieved (for heading_matching questions).

    Criteria:
    - At least one chunk contains 'List of Headings' in content
    - Or at least one chunk has questionType='heading_matching'
    """
    for chunk in retrieved_chunks:
        content = chunk.get('content', '')
        question_type = chunk.get('metadata', {}).get('questionType', '')

        if 'List of Headings' in content:
            return True
        if question_type == 'heading_matching':
            return True

    return False


def evaluate_style_match(
    generated_answer: str,
    expected_style: str,
    question_type: Optional[str] = None,
    response_kind: Optional[str] = None
) -> bool:
    """
    Evaluate whether the generated answer matches the expected style.

    Styles:
    - vocab_paraphrase: Should be concise (<150 chars), direct synonym list, no tutoring template
    - paragraph_focus: Should focus on paragraph content, no extended reasoning
    - full_tutoring: Should include reasoning, evidence, and structured explanation

    Args:
        generated_answer: The LLM-generated answer text
        expected_style: One of 'vocab_paraphrase', 'paragraph_focus', 'full_tutoring'
        question_type: Optional question type for additional context
        response_kind: Optional response kind (e.g., 'social', 'tool_result')

    Returns:
        True if style matches, False otherwise
    """
    answer_text = generated_answer.lower()
    answer_len = len(generated_answer)

    # Social/tool responses have different expectations
    if response_kind in ['social', 'tool_result']:
        return True  # These are evaluated differently

    if expected_style == 'vocab_paraphrase':
        # Vocab questions should be concise and direct
        # Should NOT use full tutoring template phrases
        tutoring_phrases = ['解题思路', '首先', '步骤', '定位', '段落', '证据', 'reasoning', 'step']
        uses_tutoring_template = any(phrase in answer_text for phrase in tutoring_phrases)

        # Should be relatively short (<200 chars for vocab answers)
        is_too_long = answer_len > 200

        # Should provide synonyms or definitions directly
        has_content = len(answer_text.strip()) > 0

        return has_content and not uses_tutoring_template and not is_too_long

    elif expected_style == 'paragraph_focus':
        # Should focus on paragraph content without extended reasoning
        # Check for excessive structural markers
        structural_markers = ['步骤', '第一步', '第二步', '首先', '其次', '最后', 'conclusion']
        has_excessive_structure = any(marker in answer_text for marker in structural_markers)

        # Should reference paragraph content
        paragraph_refs = ['段落', 'paragraph', 'section', '文中', '原文']
        has_paragraph_ref = any(ref in answer_text for ref in paragraph_refs)

        # Should not be too brief (needs actual content)
        is_too_brief = answer_len < 30

        return has_paragraph_ref and not has_excessive_structure and not is_too_brief

    elif expected_style == 'full_tutoring':
        # Full tutoring mode should have structured explanation
        # At least some reasoning or evidence should be present
        reasoning_indicators = ['因为', '所以', '定位', '对应', 'because', 'therefore', 'matches', 'evidence']
        has_reasoning = any(indicator in answer_text for indicator in reasoning_indicators)

        # Should not be extremely brief
        is_extremely_brief = answer_len < 20

        return has_reasoning or not is_extremely_brief

    # Default: accept if we reach here
    return True


def compute_noise_penalty(
    retrieved_chunks: List[Dict],
    expected_evidence: Optional[Dict],
    question_id: str,
    question_type: Optional[str] = None
) -> float:
    """
    Calculate penalty for irrelevant content in retrieved chunks.

    Penalty factors:
    - Including chunks from wrong question IDs
    - Including chunks from unrelated paragraphs
    - Including sensitive chunks (answer_key, answer_explanation) when not needed

    Special handling for heading_matching:
    - Same question ID chunks are NOT noise (heading list is shared across questions)
    - Relaxed paragraph distance penalty (heading_matching needs broader context)
    """
    if not expected_evidence:
        return 0.0  # No evidence expected, no noise penalty

    expected_paragraphs = set(expected_evidence.get('paragraphLabels', []))
    expected_chunk_type = expected_evidence.get('chunkType')

    if not retrieved_chunks:
        return 0.0

    penalty = 0.0
    total_chunks = len(retrieved_chunks)

    # heading_matching needs broader context, relax penalties
    is_heading_matching = question_type == 'heading_matching'
    wrong_id_penalty = 0.15 if is_heading_matching else 0.3  # Reduced for heading_matching
    unrelated_paragraph_penalty = 0.1 if is_heading_matching else 0.2  # Reduced for heading_matching

    for chunk in retrieved_chunks:
        chunk_question_id = chunk.get('questionId', '')
        chunk_type = chunk.get('chunkType', '')
        paragraph_labels = set(chunk.get('paragraphLabels', []))

        # Penalty for wrong question ID
        # For heading_matching, same question ID chunks are NOT noise (heading list is shared)
        if chunk_question_id != question_id and expected_chunk_type != 'summary':
            if is_heading_matching and chunk_question_id.startswith(question_id.split('-')[0]):
                # Same paper group (e.g., p1-high-01 Q1 and p1-high-01 Q2) - not noise for heading_matching
                pass
            else:
                penalty += wrong_id_penalty

        # Penalty for unrelated paragraphs (more than 2 paragraphs away)
        if expected_paragraphs and paragraph_labels:
            expected_ords = {ord(p) for p in expected_paragraphs}
            chunk_ords = {ord(p) for p in paragraph_labels}
            if not expected_ords.intersection(chunk_ords):
                # Check if paragraphs are far apart
                min_expected = min(expected_ords) if expected_ords else 0
                max_expected = max(expected_ords) if expected_ords else 0
                chunk_ord = min(chunk_ords) if chunk_ords else 0
                # For heading_matching, allow wider paragraph range (4 instead of 2)
                paragraph_tolerance = 4 if is_heading_matching else 2
                if chunk_ord < min_expected - paragraph_tolerance or chunk_ord > max_expected + paragraph_tolerance:
                    penalty += unrelated_paragraph_penalty

        # Penalty for sensitive chunks when not expected
        if chunk_type in ['answer_key', 'answer_explanation'] and expected_chunk_type not in ['answer_key', 'answer_explanation']:
            penalty += 0.1

    return min(penalty / total_chunks, 1.0)  # Normalize to [0, 1]


def build_ragas_dataset(
    samples: List[EvalSample],
    responses: List[EvalResult]
) -> Dataset:
    """
    Build a HuggingFace Dataset for Ragas evaluation.

    Required columns:
    - question: The user query
    - answer: The generated answer
    - contexts: List of retrieved context strings
    - ground_truth: The expected answer
    """
    questions = []
    answers = []
    contexts = []
    ground_truths = []

    for sample, result in zip(samples, responses):
        if result.error:
            continue  # Skip failed evaluations

        questions.append(result.user_query)
        answers.append(result.generated_answer)
        contexts.append([chunk.get('content', '') for chunk in result.retrieved_chunks])
        ground_truths.append(result.expected_answer)

    return Dataset.from_dict({
        'question': questions,
        'answer': answers,
        'contexts': contexts,
        'ground_truth': ground_truths
    })


def run_ragas_evaluation(
    dataset: Dataset,
    output_path: str
) -> Dict[str, float]:
    """
    Run Ragas evaluation and save results.

    Returns aggregate metrics dictionary.
    """
    if not RAGAS_AVAILABLE:
        print("Error: Ragas not available. Install with: pip install ragas datasets")
        return {}

    if len(dataset) == 0:
        print("Warning: Ragas skipped (empty dataset — no successful samples).")
        return {}

    # Ragas 0.2 + nest_asyncio 在 Python 3.14 上会触发 "Timeout should be used inside a task"，指标全 NaN
    if sys.version_info >= (3, 14) and os.getenv("RAGAS_FORCE", "").strip() not in ("1", "true", "yes"):
        skip_path = output_path.replace(".json", "_skipped.txt")
        with open(skip_path, "w", encoding="utf-8") as f:
            f.write(
                "Ragas LLM metrics skipped on Python 3.14+ (incompatible nest_asyncio executor). "
                "Use Python 3.12/3.13 for full Ragas scores, or set RAGAS_FORCE=1 to attempt anyway.\n"
            )
        print(f"Warning: Ragas LLM metrics skipped on Python {sys.version_info.major}.{sys.version_info.minor}. See {skip_path}")
        return {}

    # 与 server 一致：助手用 LLM_CHAT_MODEL；Ragas 默认曾是 gpt-4o-mini，需显式对齐
    chat_model = (
        os.getenv("LLM_CHAT_MODEL")
        or os.getenv("OPENAI_CHAT_MODEL")
        or "gpt-4o-mini"
    )
    base = (os.getenv("OPENAI_BASE_URL") or os.getenv("LLM_BASE_URL") or "").strip() or None
    if base:
        base = base.rstrip("/")
    ragas_llm = llm_factory(model=chat_model, base_url=base)
    embed_model = (
        (os.getenv("EMBEDDING_MODEL") or "").strip()
        or (os.getenv("OPENAI_EMBED_MODEL") or "").strip()
        or "text-embedding-3-small"
    )
    _saved_key = os.environ.get("OPENAI_API_KEY")
    _saved_base = os.environ.get("OPENAI_API_BASE")
    try:
        emb_url = (os.getenv("EMBEDDING_BASE_URL") or "").strip()
        if emb_url:
            os.environ["OPENAI_API_BASE"] = emb_url.rstrip("/")
            os.environ["OPENAI_API_KEY"] = (os.getenv("EMBEDDING_API_KEY") or "-").strip()
        elif (os.getenv("OPENAI_EMBEDDING_BASE_URL") or "").strip():
            os.environ["OPENAI_API_BASE"] = os.getenv("OPENAI_EMBEDDING_BASE_URL", "").strip().rstrip("/")
        ragas_embeddings = embedding_factory(model=embed_model)
    finally:
        if _saved_key is None:
            os.environ.pop("OPENAI_API_KEY", None)
        else:
            os.environ["OPENAI_API_KEY"] = _saved_key
        if _saved_base is None:
            os.environ.pop("OPENAI_API_BASE", None)
        else:
            os.environ["OPENAI_API_BASE"] = _saved_base

    try:
        result = evaluate(
            dataset,
            metrics=[
                context_precision,
                context_recall,
                faithfulness,
                answer_relevancy,
            ],
            llm=ragas_llm,
            embeddings=ragas_embeddings,
        )
    except Exception as e:
        err_path = output_path.replace(".json", "_error.txt")
        with open(err_path, "w", encoding="utf-8") as ef:
            ef.write(str(e))
        print(f"Warning: Ragas evaluate() failed ({e}). See {err_path}")
        return {}

    # Save detailed results
    df = result.to_pandas()
    df.to_csv(output_path.replace('.json', '_details.csv'), index=False)

    # Compute aggregate metrics (Ragas may add string columns; skip non-numeric)
    import pandas as pd

    aggregate = {}
    skip = {"question", "answer", "contexts", "ground_truth"}
    for col in df.columns:
        if col in skip:
            continue
        if pd.api.types.is_numeric_dtype(df[col]):
            aggregate[col] = float(df[col].mean(skipna=True))

    # Save aggregate metrics
    with open(output_path, 'w') as f:
        json.dump(aggregate, f, indent=2)

    return aggregate


def evaluate_retrieval_quality(
    samples: List[EvalSample],
    responses: List[EvalResult],
    output_dir: str
) -> Dict[str, Any]:
    """
    Evaluate retrieval quality with custom metrics.

    Returns:
    - question_hit_rate: Percentage of queries that retrieved correct evidence
    - avg_noise_penalty: Average penalty for irrelevant retrievals
    - heading_list_hit_rate: Percentage of heading_matching queries that retrieved heading list
    - ragas_metrics: Standard Ragas retrieval metrics
    """
    os.makedirs(output_dir, exist_ok=True)

    # Compute custom metrics (only samples with expected passage-level evidence)
    question_hits = []
    noise_penalties = []
    heading_list_hits = []
    heading_list_total = 0
    skipped_evidence_metrics = 0
    route_counts: Dict[str, int] = {}

    for sample, result in zip(samples, responses):
        if result.error:
            continue
        r = effective_assistant_route(sample, result) or 'unknown'
        route_counts[r] = route_counts.get(r, 0) + 1
        if should_skip_evidence_retrieval_metrics(sample, result):
            skipped_evidence_metrics += 1
            continue

        hit = compute_question_hit(
            result.retrieved_chunks,
            result.expected_evidence,
            sample.focusQuestionNumbers,
            question_type=sample.expectedQuestionType,
            heading_list_required=sample.headingListRequired
        )
        question_hits.append(hit)

        penalty = compute_noise_penalty(
            result.retrieved_chunks,
            result.expected_evidence,
            sample.questionId,
            question_type=sample.expectedQuestionType
        )
        noise_penalties.append(penalty)

        # Track heading_list_hit for heading_matching questions
        if sample.headingListRequired or sample.expectedQuestionType == 'heading_matching':
            heading_list_total += 1
            heading_list_hit = compute_heading_list_hit(result.retrieved_chunks)
            heading_list_hits.append(heading_list_hit)

    ev_samples: List[EvalSample] = []
    ev_responses: List[EvalResult] = []
    for sample, result in zip(samples, responses):
        if result.error or should_skip_evidence_retrieval_metrics(sample, result):
            continue
        ev_samples.append(sample)
        ev_responses.append(result)

    ragas_metrics: Dict[str, float] = {}
    if ev_samples:
        ragas_dataset = build_ragas_dataset(ev_samples, ev_responses)
        ragas_output = os.path.join(output_dir, 'ragas_retrieval.json')
        ragas_metrics = run_ragas_evaluation(ragas_dataset, ragas_output)

    return {
        'question_hit_rate': sum(question_hits) / len(question_hits) if question_hits else 0.0,
        'avg_noise_penalty': sum(noise_penalties) / len(noise_penalties) if noise_penalties else 0.0,
        'heading_list_hit_rate': sum(heading_list_hits) / len(heading_list_hits) if heading_list_hits else 0.0,
        'ragas_metrics': ragas_metrics,
        'num_samples': len(question_hits),
        'num_errors': len([r for r in responses if r.error]),
        'skipped_evidence_metrics': skipped_evidence_metrics,
        'assistant_route_counts': route_counts,
        'heading_matching_total': heading_list_total,
        'heading_matching_hits': sum(heading_list_hits) if heading_list_hits else 0
    }


def evaluate_answer_quality(
    samples: List[EvalSample],
    responses: List[EvalResult],
    output_dir: str
) -> Dict[str, Any]:
    """
    Evaluate answer quality.

    Criteria:
    - Must not mix unrelated Q numbers, paragraphs, or attachment info
    - Vocabulary questions should not use full tutoring template
    - Identity/social questions should not redirect to current passage
    - Style match: vocab_paraphrase should be concise, paragraph_focus should focus on content
    """
    os.makedirs(output_dir, exist_ok=True)

    answer_scores = []
    style_violations = []
    style_matches = []

    for sample, result in zip(samples, responses):
        if result.error:
            continue

        score = 1.0  # Start with perfect score

        # Check for content mixing
        answer_text = result.generated_answer.lower()

        # Penalize if answer includes unrelated question numbers
        if sample.focusQuestionNumbers:
            for chunk in result.retrieved_chunks:
                chunk_qnums = chunk.get('questionNumbers', [])
                for qnum in chunk_qnums:
                    if qnum not in sample.focusQuestionNumbers and qnum in answer_text:
                        score -= 0.1

        # Check style match using the new evaluate_style_match function
        style_match = evaluate_style_match(
            result.generated_answer,
            sample.expectedStyle,
            question_type=sample.expectedQuestionType,
            response_kind=sample.expectedResponseKind
        )
        style_matches.append(style_match)

        if not style_match:
            style_violations.append((sample.id, f'style_mismatch_{sample.expectedStyle}'))
            score -= 0.2

        # Additional specific checks
        if sample.expectedStyle == 'vocab_paraphrase' and not style_match:
            style_violations.append((sample.id, 'vocab_used_full_tutoring'))
            score -= 0.2

        if sample.expectedResponseKind == 'social':
            # Social questions should not redirect to passage
            if any(phrase in answer_text for phrase in ['passage', '段落', '文章']):
                style_violations.append((sample.id, 'social_redirected_to_passage'))
                score -= 0.3

        answer_scores.append(max(score, 0.0))

    # Build Ragas dataset for answer similarity
    ragas_dataset = build_ragas_dataset(samples, responses)

    ragas_output = os.path.join(output_dir, 'ragas_answer.json')
    ragas_metrics = run_ragas_evaluation(ragas_dataset, ragas_output)

    return {
        'avg_answer_score': sum(answer_scores) / len(answer_scores) if answer_scores else 0.0,
        'style_match_rate': sum(style_matches) / len(style_matches) if style_matches else 0.0,
        'style_violations': style_violations,
        'ragas_metrics': ragas_metrics,
        'num_samples': len(answer_scores)
    }


if __name__ == '__main__':
    # Test loading dataset
    dataset_path = Path(__file__).parent / 'datasets' / 'golden_samples.json'
    samples = load_golden_dataset(str(dataset_path))
    print(f"Loaded {len(samples)} evaluation samples")

    for sample in samples[:3]:
        print(f"  - {sample.id}: {sample.userQuery[:50]}...")
