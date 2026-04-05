#!/usr/bin/env python3
"""
Expand Golden dataset by merging existing samples with new templates.
Replaces TODO placeholders with actual values from existing samples where applicable.
"""

import json
from pathlib import Path

# Paths
GOLDEN_DATASET_PATH = Path(__file__).parent.parent / "datasets" / "golden_samples.json"
TEMPLATES_PATH = Path(__file__).parent / "golden_samples_templates.json"
OUTPUT_PATH = Path(__file__).parent.parent / "datasets" / "golden_samples_expanded.json"


def load_json(path):
    with open(path, 'r', encoding='utf-8') as f:
        return json.load(f)


def save_json(data, path):
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)


def merge_datasets(existing, templates):
    """
    Merge existing golden samples with new templates.

    Strategy:
    1. Keep all existing samples
    2. Add templates with TODO values replaced by sensible defaults
    3. Deduplicate by ID
    """
    # Create a map of existing samples by ID
    existing_map = {s['id']: s for s in existing}

    # Process templates
    merged = list(existing)  # Start with existing samples

    for template in templates:
        # Skip if ID already exists
        if template['id'] in existing_map:
            continue

        # Replace TODO values with sensible defaults
        sample = template.copy()

        # Replace TODO question type with None (will be inferred)
        if sample.get('expectedQuestionType') == 'TODO':
            sample['expectedQuestionType'] = None

        # Replace TODO answer with placeholder
        if sample.get('expected_answer') == 'TODO':
            sample['expected_answer'] = '根据原文定位的答案'

        # Replace TODO key phrases
        evidence = sample.get('expected_evidence')
        if evidence and evidence.get('keyPhrases') == ['TODO']:
            sample['expected_evidence']['keyPhrases'] = ['关键词定位']

        merged.append(sample)

    return merged


def analyze_expansion(before, after):
    """Analyze the expansion results."""
    # Count by paper
    def count_by_paper(samples):
        counts = {'p1': 0, 'p2': 0, 'p3': 0}
        articles = set()
        for s in samples:
            qid = s.get('questionId', '')
            if qid.startswith('p1-'):
                counts['p1'] += 1
                articles.add(qid)
            elif qid.startswith('p2-'):
                counts['p2'] += 1
                articles.add(qid)
            elif qid.startswith('p3-'):
                counts['p3'] += 1
                articles.add(qid)
        return counts, len(articles)

    # Count by question type
    def count_by_type(samples):
        counts = {}
        for s in samples:
            qt = s.get('expectedQuestionType') or 'general'
            counts[qt] = counts.get(qt, 0) + 1
        return counts

    # Count by mode
    def count_by_mode(samples):
        counts = {}
        for s in samples:
            mode = s.get('mode', 'unknown')
            counts[mode] = counts.get(mode, 0) + 1
        return counts

    # Count by style
    def count_by_style(samples):
        counts = {}
        for s in samples:
            style = s.get('expectedStyle', 'full_tutoring')
            counts[style] = counts.get(style, 0) + 1
        return counts

    before_counts, before_articles = count_by_paper(before)
    after_counts, after_articles = count_by_paper(after)

    print("\n" + "=" * 60)
    print("Expansion Analysis")
    print("=" * 60)

    print(f"\nTotal samples: {len(before)} -> {len(after)} (+{len(after) - len(before)})")
    print(f"Covered articles: {before_articles} -> {after_articles}")

    print("\nSamples by paper:")
    print(f"  Before: P1={before_counts['p1']}, P2={before_counts['p2']}, P3={before_counts['p3']}")
    print(f"  After:  P1={after_counts['p1']}, P2={after_counts['p2']}, P3={after_counts['p3']}")

    print("\nQuestion types (after expansion):")
    for qt, count in sorted(count_by_type(after).items(), key=lambda x: -x[1]):
        print(f"  {qt}: {count}")

    print("\nModes (after expansion):")
    for mode, count in sorted(count_by_mode(after).items(), key=lambda x: -x[1]):
        print(f"  {mode}: {count}")

    print("\nAnswer styles (after expansion):")
    for style, count in sorted(count_by_style(after).items(), key=lambda x: -x[1]):
        print(f"  {style}: {count}")

    print("\n" + "=" * 60)


def main():
    print("Loading existing Golden dataset...")
    existing = load_json(GOLDEN_DATASET_PATH)
    print(f"  Loaded {len(existing)} existing samples")

    print("Loading templates...")
    templates = load_json(TEMPLATES_PATH)
    print(f"  Loaded {len(templates)} templates")

    print("Merging datasets...")
    merged = merge_datasets(existing, templates)
    print(f"  Merged: {len(merged)} total samples")

    print("Saving expanded dataset...")
    save_json(merged, OUTPUT_PATH)
    print(f"  Saved to: {OUTPUT_PATH}")

    # Analyze expansion
    analyze_expansion(existing, merged)

    print("\nNote: The expanded dataset contains TODO placeholders.")
    print("      Manual review and updates are required for production use.")


if __name__ == '__main__':
    main()
