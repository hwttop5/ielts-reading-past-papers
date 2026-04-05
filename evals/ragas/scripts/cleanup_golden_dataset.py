#!/usr/bin/env python3
"""
Clean up Golden dataset by replacing null/None question types with 'general'.
"""

import json
from pathlib import Path

GOLDEN_DATASET_PATH = Path(__file__).parent.parent / "datasets" / "golden_samples.json"


def main():
    print(f"Loading {GOLDEN_DATASET_PATH}...")
    with open(GOLDEN_DATASET_PATH, 'r', encoding='utf-8') as f:
        data = json.load(f)

    # Count before
    null_count = sum(1 for s in data if s.get('expectedQuestionType') is None)
    print(f"Samples with null question type: {null_count}")

    # Replace None with 'general'
    changed = 0
    for sample in data:
        if sample.get('expectedQuestionType') is None:
            sample['expectedQuestionType'] = 'general'
            changed += 1

    print(f"Changed {changed} samples")

    # Save back
    with open(GOLDEN_DATASET_PATH, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

    print(f"Saved to {GOLDEN_DATASET_PATH}")

    # Verify
    types = {}
    for sample in data:
        qt = sample.get('expectedQuestionType', 'unknown')
        types[qt] = types.get(qt, 0) + 1

    print("\nQuestion type distribution:")
    for qt, count in sorted(types.items(), key=lambda x: -x[1]):
        print(f"  {qt}: {count}")


if __name__ == '__main__':
    main()
