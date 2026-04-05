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

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent.parent / "server" / "src"))

try:
    from ragas import evaluate
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
    # Metadata
    latency_ms: float = 0.0
    error: Optional[str] = None


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
            attachments=item.get('attachments')
        ))
    return samples


def compute_question_hit(
    retrieved_chunks: List[Dict],
    expected_evidence: Optional[Dict],
    focus_question_numbers: List[str]
) -> bool:
    """
    Check if retrieved chunks contain the expected evidence.

    Criteria:
    - For explicit question number queries: must hit corresponding question_item
    - For evidence-needed queries: must hit correct passage_paragraph
    - For review requests: prioritize answer_explanation
    """
    if not expected_evidence:
        return True  # No evidence expected (e.g., social questions)

    expected_paragraphs = set(expected_evidence.get('paragraphLabels', []))
    expected_chunk_type = expected_evidence.get('chunkType')
    key_phrases = expected_evidence.get('keyPhrases', [])

    if not retrieved_chunks:
        return False

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


def compute_noise_penalty(
    retrieved_chunks: List[Dict],
    expected_evidence: Optional[Dict],
    question_id: str
) -> float:
    """
    Calculate penalty for irrelevant content in retrieved chunks.

    Penalty factors:
    - Including chunks from wrong question IDs
    - Including chunks from unrelated paragraphs
    - Including sensitive chunks (answer_key, answer_explanation) when not needed
    """
    if not expected_evidence:
        return 0.0  # No evidence expected, no noise penalty

    expected_paragraphs = set(expected_evidence.get('paragraphLabels', []))
    expected_chunk_type = expected_evidence.get('chunkType')

    if not retrieved_chunks:
        return 0.0

    penalty = 0.0
    total_chunks = len(retrieved_chunks)

    for chunk in retrieved_chunks:
        chunk_question_id = chunk.get('questionId', '')
        chunk_type = chunk.get('chunkType', '')
        paragraph_labels = set(chunk.get('paragraphLabels', []))

        # Penalty for wrong question ID (unless it's summary search)
        if chunk_question_id != question_id and expected_chunk_type != 'summary':
            penalty += 0.3

        # Penalty for unrelated paragraphs (more than 2 paragraphs away)
        if expected_paragraphs and paragraph_labels:
            expected_ords = {ord(p) for p in expected_paragraphs}
            chunk_ords = {ord(p) for p in paragraph_labels}
            if not expected_ords.intersection(chunk_ords):
                # Check if paragraphs are far apart
                min_expected = min(expected_ords) if expected_ords else 0
                max_expected = max(expected_ords) if expected_ords else 0
                chunk_ord = min(chunk_ords) if chunk_ords else 0
                if chunk_ord < min_expected - 2 or chunk_ord > max_expected + 2:
                    penalty += 0.2

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

    result = evaluate(
        dataset,
        metrics=[
            context_precision,
            context_recall,
            faithfulness,
            answer_relevancy,
        ]
    )

    # Save detailed results
    df = result.to_pandas()
    df.to_csv(output_path.replace('.json', '_details.csv'), index=False)

    # Compute aggregate metrics
    aggregate = {}
    for col in df.columns:
        if col not in ['question', 'answer', 'contexts', 'ground_truth']:
            aggregate[col] = df[col].mean()

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
    - ragas_metrics: Standard Ragas retrieval metrics
    """
    os.makedirs(output_dir, exist_ok=True)

    # Compute custom metrics
    question_hits = []
    noise_penalties = []

    for sample, result in zip(samples, responses):
        if result.error:
            continue

        hit = compute_question_hit(
            result.retrieved_chunks,
            result.expected_evidence,
            sample.focusQuestionNumbers
        )
        question_hits.append(hit)

        penalty = compute_noise_penalty(
            result.retrieved_chunks,
            result.expected_evidence,
            sample.questionId
        )
        noise_penalties.append(penalty)

    # Build Ragas dataset
    ragas_dataset = build_ragas_dataset(samples, responses)

    # Run Ragas evaluation
    ragas_output = os.path.join(output_dir, 'ragas_retrieval.json')
    ragas_metrics = run_ragas_evaluation(ragas_dataset, ragas_output)

    return {
        'question_hit_rate': sum(question_hits) / len(question_hits) if question_hits else 0.0,
        'avg_noise_penalty': sum(noise_penalties) / len(noise_penalties) if noise_penalties else 0.0,
        'ragas_metrics': ragas_metrics,
        'num_samples': len(question_hits),
        'num_errors': len([r for r in responses if r.error])
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
    """
    os.makedirs(output_dir, exist_ok=True)

    answer_scores = []
    style_violations = []

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

        # Check style violations
        if sample.expectedStyle == 'vocab_paraphrase':
            # Vocab questions should not use full tutoring template
            if any(phrase in answer_text for phrase in ['解题思路', '首先', '步骤']):
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

    # Run Ragas evaluation
    ragas_output = os.path.join(output_dir, 'ragas_answer.json')
    ragas_metrics = run_ragas_evaluation(ragas_dataset, ragas_output)

    return {
        'avg_answer_score': sum(answer_scores) / len(answer_scores) if answer_scores else 0.0,
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
