#!/usr/bin/env python3
"""Audit the golden dataset without making quality predictions."""

from __future__ import annotations

import argparse
import json
from collections import Counter
from datetime import datetime
from pathlib import Path
from typing import Any, Dict


REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_DATASET = Path(__file__).parent / "datasets" / "golden_samples.json"
QUESTION_INDEX_PATH = REPO_ROOT / "src" / "utils" / "questionIndex.json"


def load_json(path: Path) -> Any:
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def build_audit(dataset_path: Path) -> Dict[str, Any]:
    samples = load_json(dataset_path)
    question_ids = {item["id"] for item in load_json(QUESTION_INDEX_PATH)}

    invalid_samples = [
        {
            "id": sample["id"],
            "questionId": sample["questionId"],
            "reason": "unknown_question_id",
        }
        for sample in samples
        if sample["questionId"] not in question_ids
    ]

    return {
        "generated_at": datetime.now().isoformat(),
        "dataset_path": str(dataset_path),
        "total_samples": len(samples),
        "invalid_sample_count": len(invalid_samples),
        "invalid_samples": invalid_samples,
        "by_question_type": dict(Counter(sample.get("expectedQuestionType") or "general" for sample in samples)),
        "by_style": dict(Counter(sample.get("expectedStyle") or "full_tutoring" for sample in samples)),
        "by_locale": dict(Counter(sample.get("locale") or "zh" for sample in samples)),
        "by_response_kind": dict(Counter(sample.get("expectedResponseKind") or "grounded" for sample in samples)),
    }


def write_outputs(audit: Dict[str, Any], output_dir: Path) -> tuple[Path, Path]:
    output_dir.mkdir(parents=True, exist_ok=True)
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    json_path = output_dir / f"dataset_audit_{ts}.json"
    md_path = output_dir / f"dataset_audit_{ts}.md"

    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(audit, f, indent=2, ensure_ascii=False)

    lines = [
        "# Golden Dataset Audit",
        "",
        f"- Generated at: {audit['generated_at']}",
        f"- Dataset: `{audit['dataset_path']}`",
        f"- Total samples: {audit['total_samples']}",
        f"- Invalid sample count: {audit['invalid_sample_count']}",
        "",
        "## Question Types",
        "",
    ]
    for key, value in sorted((audit.get("by_question_type") or {}).items()):
        lines.append(f"- `{key}`: {value}")
    lines.extend(["", "## Styles", ""])
    for key, value in sorted((audit.get("by_style") or {}).items()):
        lines.append(f"- `{key}`: {value}")
    lines.extend(["", "## Invalid Samples", ""])
    if audit["invalid_samples"]:
        for item in audit["invalid_samples"]:
            lines.append(f"- `{item['id']}` / `{item['questionId']}`: {item['reason']}")
    else:
        lines.append("- None")
    lines.append("")

    with open(md_path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))

    return json_path, md_path


def main() -> None:
    parser = argparse.ArgumentParser(description="Audit the golden dataset without running the assistant.")
    parser.add_argument("--dataset", type=Path, default=DEFAULT_DATASET)
    parser.add_argument("--output-dir", type=Path, default=Path(__file__).parent / "results")
    args = parser.parse_args()

    audit = build_audit(args.dataset)
    json_path, md_path = write_outputs(audit, args.output_dir)
    print(f"Wrote {json_path}")
    print(f"Wrote {md_path}")


if __name__ == "__main__":
    main()
