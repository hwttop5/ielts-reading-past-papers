"""Lightweight tests for eval helpers (no Ragas API calls)."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from evaluator import (
    EvalResult,
    EvalSample,
    should_skip_evidence_retrieval_metrics,
    compute_question_hit,
)


def test_skip_general_route():
    sample = EvalSample(
        id="x",
        questionId="q",
        mode="hint",
        locale="zh",
        userQuery="hi",
        focusQuestionNumbers=[],
        expected_answer="",
        expected_evidence={"paragraphLabels": ["A"], "chunkType": "passage_paragraph"},
        official_explanation=None,
        query_variants=[],
        expectedStyle="full_tutoring",
    )
    result = EvalResult(
        sample_id="x",
        question_id="q",
        mode="hint",
        user_query="hi",
        retrieved_chunks=[],
        generated_answer="",
        expected_answer="",
        expected_evidence=sample.expected_evidence,
        assistant_route="ielts_general",
    )
    assert should_skip_evidence_retrieval_metrics(sample, result) is True


def test_hit_with_chunks():
    chunks = [
        {
            "chunkType": "passage_paragraph",
            "paragraphLabels": ["A"],
            "content": "偶然的发现 神农帝 干叶落入沸水",
            "metadata": {"questionType": "general"},
        }
    ]
    ev = {
        "paragraphLabels": ["A"],
        "chunkType": "passage_paragraph",
        "keyPhrases": ["偶然的发现", "神农帝"],
    }
    assert (
        compute_question_hit(chunks, ev, ["1"], question_type="general", heading_list_required=False)
        is True
    )


if __name__ == "__main__":
    test_skip_general_route()
    test_hit_with_chunks()
    print("ok")
