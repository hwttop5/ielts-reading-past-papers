#!/usr/bin/env python3
"""Build a focused regression dataset for style-sensitive assistant responses."""

from __future__ import annotations

import argparse
import json
from pathlib import Path


DEFAULT_STYLES = {"vocab_paraphrase", "paragraph_focus", "full_tutoring"}


def main() -> None:
    parser = argparse.ArgumentParser(description="Create a style regression dataset from golden samples.")
    parser.add_argument(
        "--input",
        type=Path,
        default=Path(__file__).resolve().parents[1] / "datasets" / "golden_samples.json",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=Path(__file__).resolve().parents[1] / "datasets" / "style_regression_samples.json",
    )
    parser.add_argument(
        "--styles",
        type=str,
        default=",".join(sorted(DEFAULT_STYLES)),
        help="Comma-separated expectedStyle values to keep.",
    )
    args = parser.parse_args()

    requested = {item.strip() for item in args.styles.split(",") if item.strip()}
    with open(args.input, encoding="utf-8") as f:
        samples = json.load(f)

    filtered = [sample for sample in samples if (sample.get("expectedStyle") or "full_tutoring") in requested]
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with open(args.output, "w", encoding="utf-8") as f:
        json.dump(filtered, f, ensure_ascii=False, indent=2)

    print(f"Wrote {args.output} with {len(filtered)} samples for styles {sorted(requested)}")


if __name__ == "__main__":
    main()
