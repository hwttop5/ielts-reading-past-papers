#!/usr/bin/env python3
"""Compare two evaluation_summary.json files and explain whether the new run improved."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any, Dict, Iterable, Tuple


def load_json(path: Path) -> Dict[str, Any]:
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def pct(value: float) -> str:
    return f"{value * 100:.2f}%"


def num(value: float, digits: int = 4) -> str:
    return f"{value:.{digits}f}"


def get_metric(summary: Dict[str, Any], section: str, key: str) -> float:
    payload = summary.get(section) or {}
    return float(payload.get(key, 0) or 0)


def delta_line(label: str, base: float, new: float, *, percent: bool = False) -> str:
    formatter = pct if percent else num
    diff = new - base
    diff_text = pct(diff) if percent else num(diff)
    return f"| {label} | {formatter(base)} | {formatter(new)} | {diff_text} |"


def semantic_readout(summary: Dict[str, Any]) -> str:
    semantic = summary.get("semantic_retrieval") or {}
    return (
        f"hits={semantic.get('samples_with_semantic_hits', 0)}, "
        f"avg_used={semantic.get('avg_semantic_chunk_count', 0):.2f}, "
        f"avg_candidates={semantic.get('avg_semantic_candidate_count', 0):.2f}, "
        f"contribution={pct(float(semantic.get('semantic_contribution_rate', 0) or 0))}, "
        f"skip_rate={pct(float(semantic.get('semantic_skip_rate', 0) or 0))}"
    )


def bucket_rows(summary: Dict[str, Any], field: str, metric: str, limit: int = 5) -> Iterable[Tuple[str, Dict[str, Any]]]:
    mapping = summary.get(field) or {}
    items = list(mapping.items())
    items.sort(key=lambda item: float(item[1].get(metric, 0) or 0), reverse=True)
    return items[:limit]


def format_bucket_section(summary: Dict[str, Any], field: str, title: str, metric: str) -> list[str]:
    mapping = summary.get(field) or {}
    lines = [f"## {title}", ""]
    if not mapping:
        lines.append("- Not available in this summary artifact.")
        lines.append("")
        return lines
    for name, payload in bucket_rows(summary, field, metric):
        denominators = payload.get("metric_denominators") or {}
        status_counts = payload.get("status_counts") or {}
        lines.append(
            f"- `{name}`: hit={pct(float(payload.get('question_hit_rate', 0) or 0))}, "
            f"style={pct(float(payload.get('style_match_rate', 0) or 0))}, "
            f"answer={num(float(payload.get('avg_answer_score', 0) or 0), 3)}, "
            f"valid={status_counts.get('evaluated', 0)}, "
            f"invalid={status_counts.get('dataset_invalid', 0) + status_counts.get('request_invalid', 0)}, "
            f"retrieval_n={denominators.get('retrieval', 0)}"
        )
    lines.append("")
    return lines


def main() -> None:
    parser = argparse.ArgumentParser(description="Compare two evaluation summaries.")
    parser.add_argument("--baseline", type=Path, required=True)
    parser.add_argument("--new", type=Path, required=True)
    parser.add_argument(
        "--output",
        type=Path,
        default=Path(__file__).resolve().parents[1] / "RAG_EVALUATION_COMPARISON.md",
    )
    args = parser.parse_args()

    baseline = load_json(args.baseline)
    current = load_json(args.new)

    b_hit = get_metric(baseline, "retrieval_metrics", "question_hit_rate")
    c_hit = get_metric(current, "retrieval_metrics", "question_hit_rate")
    b_legacy_hit = get_metric(baseline, "retrieval_metrics", "legacy_question_hit_rate")
    c_legacy_hit = get_metric(current, "retrieval_metrics", "legacy_question_hit_rate")
    b_noise = get_metric(baseline, "retrieval_metrics", "avg_noise_penalty")
    c_noise = get_metric(current, "retrieval_metrics", "avg_noise_penalty")
    b_heading = get_metric(baseline, "retrieval_metrics", "heading_list_hit_rate")
    c_heading = get_metric(current, "retrieval_metrics", "heading_list_hit_rate")
    b_answer = get_metric(baseline, "answer_metrics", "avg_answer_score")
    c_answer = get_metric(current, "answer_metrics", "avg_answer_score")
    b_style = get_metric(baseline, "answer_metrics", "style_match_rate")
    c_style = get_metric(current, "answer_metrics", "style_match_rate")
    b_latency = float(baseline.get("avg_latency_ms", 0) or 0)
    c_latency = float(current.get("avg_latency_ms", 0) or 0)

    lines = [
        "# RAG Evaluation Comparison",
        "",
        "This report compares two real `evaluation_summary.json` artifacts.",
        "",
        f"- Baseline: `{args.baseline.as_posix()}`",
        f"- New run: `{args.new.as_posix()}`",
        f"- Baseline mode: {(baseline.get('environment') or {}).get('mode', 'legacy_or_unknown')}",
        f"- New mode: {(current.get('environment') or {}).get('mode', 'legacy_or_unknown')}",
        "",
        "| Metric | Baseline | New | Delta |",
        "| --- | --- | --- | --- |",
        delta_line("Question hit rate", b_hit, c_hit, percent=True),
        delta_line("Legacy question hit rate", b_legacy_hit, c_legacy_hit, percent=True),
        delta_line("Avg noise penalty", b_noise, c_noise),
        delta_line("Heading list hit rate", b_heading, c_heading, percent=True),
        delta_line("Avg answer score", b_answer, c_answer),
        delta_line("Style match rate", b_style, c_style, percent=True),
        delta_line("Avg latency (ms)", b_latency, c_latency, percent=False),
        "",
        "## Sample Status",
        "",
        f"- Baseline valid/invalid/unsupported: {baseline.get('valid_samples', 0)} / {baseline.get('invalid_samples', 0)} / {baseline.get('unsupported_samples', 0)}",
        f"- New valid/invalid/unsupported: {current.get('valid_samples', 0)} / {current.get('invalid_samples', 0)} / {current.get('unsupported_samples', 0)}",
        "",
        "## Semantic Retrieval Contribution",
        "",
        f"- Baseline: {semantic_readout(baseline)}",
        f"- New: {semantic_readout(current)}",
        "",
        "## Interpretation",
        "",
    ]

    hit_delta = c_hit - b_hit
    style_delta = c_style - b_style
    latency_delta = c_latency - b_latency
    semantic_delta = float((current.get("semantic_retrieval") or {}).get("semantic_contribution_rate", 0) or 0) - float((baseline.get("semantic_retrieval") or {}).get("semantic_contribution_rate", 0) or 0)

    if hit_delta > 0.01 or style_delta > 0.01:
        lines.append("- The new run improved at least one primary effectiveness metric on valid samples.")
    else:
        lines.append("- The new run did not materially improve primary effectiveness metrics on valid samples.")

    if latency_delta > 0:
        lines.append(f"- Latency increased by {latency_delta:.1f} ms on successful samples.")
    elif latency_delta < 0:
        lines.append(f"- Latency decreased by {abs(latency_delta):.1f} ms on successful samples.")
    else:
        lines.append("- Latency was unchanged.")

    if current.get("invalid_samples", 0):
        lines.append("- Invalid dataset samples are separated from the primary denominator; compare valid-sample metrics first.")

    if semantic_delta > 0.02 and (hit_delta > 0 or style_delta > 0):
        lines.append("- Semantic retrieval contributed more often in the new run and coincided with effectiveness gains.")
    elif latency_delta > 0 and semantic_delta <= 0:
        lines.append("- Semantic retrieval got more expensive without increasing contribution; keep it gated or disabled by default.")
    else:
        lines.append("- Semantic retrieval still needs a fresh full run to prove whether it is worth the added cost.")

    if not (current.get("environment") or {}).get("full_metrics_supported", False):
        lines.append("- The new run is degraded, so RAGAS LLM metrics are still incomplete.")

    lines.append("")
    lines.extend(format_bucket_section(current, "by_question_type", "New Run: By Question Type", "question_hit_rate"))
    lines.extend(format_bucket_section(current, "by_route", "New Run: By Route", "question_hit_rate"))
    lines.extend(format_bucket_section(current, "by_style", "New Run: By Style", "style_match_rate"))

    args.output.parent.mkdir(parents=True, exist_ok=True)
    with open(args.output, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))
    print(f"Wrote {args.output}")


if __name__ == "__main__":
    main()
