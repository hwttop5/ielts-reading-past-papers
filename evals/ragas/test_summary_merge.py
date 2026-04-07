#!/usr/bin/env python3
"""Tests for partial summary merge support."""

from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from run_eval import (
    load_summary_file,
    merge_summary_payload,
    ragas_capability,
    write_merged_metrics_summary_file,
)


class TestSummaryMerge(unittest.TestCase):
    def make_base_summary(self) -> dict:
        return {
            "timestamp": "2026-04-07T11:09:33.424486",
            "environment": {
                "python_version": "3.13.12",
                "full_metrics_supported": True,
                "forced": False,
                "mode": "full",
                "reason": None,
            },
            "total_samples": 141,
            "valid_samples": 137,
            "invalid_samples": 4,
            "unsupported_samples": 0,
            "assistant_error_samples": 0,
            "successful_evaluations": 137,
            "failed_evaluations": 4,
            "sample_status_counts": {"evaluated": 137, "dataset_invalid": 4},
            "avg_latency_ms": 1156.35,
            "retrieval_metrics": {
                "question_hit_rate": 0.45,
                "ragas_metrics": {"context_precision": 0.03},
            },
            "answer_metrics": {
                "avg_answer_score": 0.88,
                "style_match_rate": 0.75,
                "style_violations": [["x", "style"]],
                "ragas_metrics": {},
            },
            "metric_denominators": {
                "answer_primary": 137,
                "retrieval_primary": 102,
                "heading_list_primary": 5,
            },
            "by_question_type": {"general": {"metric_denominators": {"retrieval": 66}}},
            "by_route": {"page_grounded": {"metric_denominators": {"retrieval": 102}}},
            "by_style": {"full_tutoring": {"metric_denominators": {"answer": 104}}},
            "semantic_retrieval": {"samples_with_semantic_hits": 0},
            "replay_file": "baseline_replay.jsonl",
        }

    def test_merge_answers_only_preserves_retrieval_and_buckets(self) -> None:
        base_summary = self.make_base_summary()
        merged = merge_summary_payload(
            base_summary,
            answer_results={
                "avg_answer_score": 0.91,
                "style_match_rate": 0.82,
                "style_violations": [],
                "ragas_metrics": {"faithfulness": 0.61, "answer_relevancy": 0.58},
                "num_samples": 137,
            },
            replay_path="baseline_replay.jsonl",
        )

        self.assertEqual(merged["retrieval_metrics"], base_summary["retrieval_metrics"])
        self.assertEqual(merged["by_route"], base_summary["by_route"])
        self.assertEqual(merged["answer_metrics"]["ragas_metrics"]["faithfulness"], 0.61)
        self.assertEqual(merged["replay_file"], "baseline_replay.jsonl")
        self.assertEqual(merged["environment"], ragas_capability())
        self.assertNotEqual(merged["timestamp"], base_summary["timestamp"])

    def test_merge_retrieval_only_preserves_answer_and_buckets(self) -> None:
        base_summary = self.make_base_summary()
        merged = merge_summary_payload(
            base_summary,
            retrieval_results={
                "question_hit_rate": 0.47,
                "ragas_metrics": {"context_precision": 0.04},
                "heading_matching_total": 5,
            },
            replay_path="hybrid_replay.jsonl",
        )

        self.assertEqual(merged["answer_metrics"], base_summary["answer_metrics"])
        self.assertEqual(merged["by_style"], base_summary["by_style"])
        self.assertEqual(merged["retrieval_metrics"]["question_hit_rate"], 0.47)
        self.assertEqual(merged["replay_file"], "hybrid_replay.jsonl")
        self.assertEqual(merged["environment"], ragas_capability())

    def test_write_merged_metrics_summary_requires_existing_base_summary(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            output_dir = Path(tmp) / "out"
            with self.assertRaises(FileNotFoundError):
                write_merged_metrics_summary_file(
                    str(output_dir),
                    str(Path(tmp) / "missing.json"),
                    retrieval_results=None,
                    answer_results={"avg_answer_score": 0.9, "ragas_metrics": {}},
                    replay_path="baseline_replay.jsonl",
                )

    def test_write_merged_metrics_summary_file_rewrites_summary(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            base_path = tmp_path / "evaluation_summary.json"
            with open(base_path, "w", encoding="utf-8") as f:
                json.dump(self.make_base_summary(), f, indent=2)

            output_dir = tmp_path / "merged"
            write_merged_metrics_summary_file(
                str(output_dir),
                str(base_path),
                retrieval_results=None,
                answer_results={
                    "avg_answer_score": 0.91,
                    "style_match_rate": 0.82,
                    "style_violations": [],
                    "ragas_metrics": {"faithfulness": 0.61, "answer_relevancy": 0.58},
                    "num_samples": 137,
                },
                replay_path="baseline_replay.jsonl",
            )

            merged = load_summary_file(output_dir / "evaluation_summary.json")
            self.assertEqual(merged["answer_metrics"]["style_match_rate"], 0.82)
            self.assertEqual(merged["retrieval_metrics"]["question_hit_rate"], 0.45)


if __name__ == "__main__":
    unittest.main()
