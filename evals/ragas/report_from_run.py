#!/usr/bin/env python3
"""Generate a markdown report from a real evaluation_summary.json run artifact."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any, Dict, Iterable, Tuple


def load_summary(path: Path) -> Dict[str, Any]:
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def top_buckets(mapping: Dict[str, Any], key: str, limit: int = 6) -> Iterable[Tuple[str, Dict[str, Any]]]:
    items = list(mapping.items())
    items.sort(key=lambda item: item[1].get(key, 0), reverse=True)
    return items[:limit]


def format_bucket_lines(mapping: Dict[str, Any], label: str, metric: str) -> list[str]:
    lines = [f"## {label}", ""]
    if not mapping:
        lines.append("- None")
        lines.append("")
        return lines
    for name, payload in top_buckets(mapping, metric):
        denominators = payload.get("metric_denominators", {})
        status_counts = payload.get("status_counts", {})
        lines.append(
            f"- `{name}`: hit={payload.get('question_hit_rate', 0):.2%}, "
            f"style={payload.get('style_match_rate', 0):.2%}, "
            f"answer={payload.get('avg_answer_score', 0):.3f}, "
            f"valid={status_counts.get('evaluated', 0)}, "
            f"invalid={status_counts.get('dataset_invalid', 0) + status_counts.get('request_invalid', 0)}, "
            f"unsupported={status_counts.get('unsupported', 0)}, "
            f"retrieval_n={denominators.get('retrieval', 0)}"
        )
    lines.append("")
    return lines


def write_run_report(summary_path: Path, output_path: Path, config_note: str = "") -> Path:
    summary = load_summary(summary_path)
    env = summary.get("environment") or {}
    retrieval = summary.get("retrieval_metrics") or {}
    answer = summary.get("answer_metrics") or {}
    semantic = summary.get("semantic_retrieval") or {}

    lines = [
        "# IELTS Reading Assistant Evaluation Report",
        "",
        f"- Generated at: {summary.get('timestamp', '')}",
        f"- Summary file: `{summary_path.as_posix()}`",
        f"- Python: {env.get('python_version', 'unknown')}",
        f"- RAGAS mode: {'full' if env.get('full_metrics_supported') else 'degraded'}",
        f"- Replay file: `{summary.get('replay_file') or 'none'}`",
        "",
        "## Run Status",
        "",
        f"- Total samples: {summary.get('total_samples', 0)}",
        f"- Valid samples: {summary.get('valid_samples', 0)}",
        f"- Invalid samples: {summary.get('invalid_samples', 0)}",
        f"- Unsupported samples: {summary.get('unsupported_samples', 0)}",
        f"- Assistant error samples: {summary.get('assistant_error_samples', 0)}",
        f"- Successful evaluations: {summary.get('successful_evaluations', 0)}",
        f"- Failed evaluations: {summary.get('failed_evaluations', 0)}",
        f"- Avg latency (successful): {summary.get('avg_latency_ms', 0):.1f} ms",
        "",
    ]

    if config_note:
        lines.extend(["## Config Note", "", config_note, ""])
    if env.get("reason"):
        lines.extend(["## Environment Note", "", f"- {env['reason']}", ""])

    lines.extend(
        [
            "## Retrieval",
            "",
            f"- Question hit rate: {retrieval.get('question_hit_rate', 0):.2%}",
            f"- Legacy question hit rate: {retrieval.get('legacy_question_hit_rate', 0):.2%}",
            f"- Avg noise penalty: {retrieval.get('avg_noise_penalty', 0):.4f}",
            f"- Heading list hit rate: {retrieval.get('heading_list_hit_rate', 0):.2%}",
            f"- Retrieval denominator: {summary.get('metric_denominators', {}).get('retrieval_primary', 0)}",
            "",
            "## Answer Quality",
            "",
            f"- Avg answer score: {answer.get('avg_answer_score', 0):.4f}",
            f"- Style match rate: {answer.get('style_match_rate', 0):.2%}",
            f"- Style violations: {len(answer.get('style_violations') or [])}",
            "",
            "## Semantic Retrieval",
            "",
            f"- Samples with semantic hits: {semantic.get('samples_with_semantic_hits', 0)}",
            f"- Avg semantic chunk count: {semantic.get('avg_semantic_chunk_count', 0):.2f}",
            f"- Avg semantic candidate count: {semantic.get('avg_semantic_candidate_count', 0):.2f}",
            f"- Avg deterministic chunk count: {semantic.get('avg_deterministic_chunk_count', 0):.2f}",
            f"- Semantic contribution rate: {semantic.get('semantic_contribution_rate', 0):.2%}",
            f"- Semantic skip rate: {semantic.get('semantic_skip_rate', 0):.2%}",
            "",
        ]
    )

    lines.extend(format_bucket_lines(summary.get("by_question_type") or {}, "By Question Type", "question_hit_rate"))
    lines.extend(format_bucket_lines(summary.get("by_route") or {}, "By Route", "question_hit_rate"))
    lines.extend(format_bucket_lines(summary.get("by_style") or {}, "By Style", "style_match_rate"))

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))
    return output_path


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate a markdown report from evaluation_summary.json")
    parser.add_argument("summary", type=Path, help="Path to evaluation_summary.json")
    parser.add_argument(
        "--output",
        type=Path,
        default=None,
        help="Optional output markdown path. Defaults to EVALUATION_REPORT.md beside the summary.",
    )
    parser.add_argument("--config-note", type=str, default="", help="Optional config note to include.")
    args = parser.parse_args()

    output = args.output or args.summary.with_name("EVALUATION_REPORT.md")
    path = write_run_report(args.summary, output, config_note=args.config_note)
    print(f"Wrote {path}")


if __name__ == "__main__":
    main()
