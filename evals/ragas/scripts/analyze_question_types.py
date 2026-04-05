#!/usr/bin/env python3
"""
Analyze question type distribution across all IELTS articles.
Generates recommendations for which articles to include in the Golden dataset.

This script analyzes:
1. questionMeta.json for article list
2. Existing golden_samples.json for current coverage
3. Outputs recommended articles for expansion
"""

import json
from collections import defaultdict
from pathlib import Path

# Paths
GOLDEN_DATASET_PATH = Path(__file__).parent.parent / "datasets" / "golden_samples.json"
QUESTION_META_PATH = Path(__file__).parent.parent.parent.parent / "src" / "utils" / "questionMeta.json"


def load_golden_dataset():
    """Load existing golden dataset."""
    with open(GOLDEN_DATASET_PATH, 'r', encoding='utf-8') as f:
        return json.load(f)


def load_question_meta():
    """Load question metadata for all articles."""
    with open(QUESTION_META_PATH, 'r', encoding='utf-8') as f:
        return json.load(f)


def analyze_article_id(article_id: str) -> dict:
    """Extract information from article ID."""
    # Format: p1-high-01, p2-low-08, p3-medium-10, etc.
    parts = article_id.split('-')
    if len(parts) >= 3:
        return {
            'paper': parts[0],  # p1, p2, p3
            'difficulty': parts[1],  # high, medium, low
            'number': parts[2]  # 01, 02, etc.
        }
    return {'paper': 'unknown', 'difficulty': 'unknown', 'number': article_id}


def get_current_coverage(golden_samples):
    """Analyze current Golden dataset coverage."""
    covered_articles = set()
    question_types = defaultdict(int)

    for sample in golden_samples:
        covered_articles.add(sample['questionId'])
        qt = sample.get('expectedQuestionType', 'general')
        question_types[qt] += 1

    return {
        'articles': covered_articles,
        'article_count': len(covered_articles),
        'total_samples': len(golden_samples),
        'question_types': dict(question_types)
    }


def recommend_articles(question_meta, current_coverage, target_count=30):
    """
    Recommend articles for Golden dataset expansion.

    Strategy:
    1. Ensure P1/P2/P3 balance (target_count/3 articles each)
    2. Ensure difficulty balance (high/medium/low)
    3. Prioritize articles not yet covered
    4. Group by paper and difficulty for diverse selection
    """
    # Group articles by paper and difficulty
    grouped = defaultdict(list)
    for article_id in question_meta.keys():
        info = analyze_article_id(article_id)
        key = f"{info['paper']}-{info['difficulty']}"
        # Only include articles not already covered
        if article_id not in current_coverage['articles']:
            grouped[key].append(article_id)

    recommendations = []
    articles_per_paper = max(3, target_count // 3)  # At least 3 per paper

    # Priority order: cover all P1/P2/P3 with mixed difficulties
    # Each paper gets articles_per_paper articles distributed by difficulty
    for paper in ['p1', 'p2', 'p3']:
        paper_groups = [
            (f'{paper}-high', articles_per_paper // 3 + 1),
            (f'{paper}-medium', articles_per_paper // 3),
            (f'{paper}-low', articles_per_paper // 3),
        ]

        paper_count = 0
        for group, max_count in paper_groups:
            if group in grouped and grouped[group] and paper_count < articles_per_paper:
                # Take up to max_count articles from this difficulty
                remaining = articles_per_paper - paper_count
                take_count = min(max_count, remaining, len(grouped[group]))
                selected = grouped[group][:take_count]
                recommendations.extend(selected)
                paper_count += len(selected)

    return recommendations[:target_count]


def generate_sample_templates(article_ids):
    """
    Generate sample templates for each recommended article.

    Each article gets 5-10 samples covering:
    - hint/explain/review modes
    - Different question types (based on what's available)
    - zh/en languages
    """
    templates = []

    for article_id in article_ids:
        info = analyze_article_id(article_id)
        paper = info['paper'].upper()  # P1, P2, P3

        # Base template for hint mode (single question)
        templates.append({
            'id': f"{article_id}_hint_single",
            'questionId': article_id,
            'mode': 'hint',
            'locale': 'zh',
            'userQuery': f"给我第 1 题的提示 ({paper})",
            'focusQuestionNumbers': ['1'],
            'expectedQuestionType': 'TODO',  # Need to fill from actual data
            'headingListRequired': False,
            'expected_answer': 'TODO',
            'expected_evidence': {
                'paragraphLabels': ['A'],
                'chunkType': 'passage_paragraph',
                'keyPhrases': ['TODO']
            },
            'query_variants': [
                f"第 1 题有什么提示？({paper})",
                f"Question 1 hint ({paper})",
            ],
            'expectedStyle': 'full_tutoring'
        })

        # Base template for explain mode
        templates.append({
            'id': f"{article_id}_explain_single",
            'questionId': article_id,
            'mode': 'explain',
            'locale': 'zh',
            'userQuery': f"讲解第 1 题 ({paper})",
            'focusQuestionNumbers': ['1'],
            'expectedQuestionType': 'TODO',
            'headingListRequired': False,
            'expected_answer': 'TODO',
            'expected_evidence': {
                'paragraphLabels': ['A'],
                'chunkType': 'passage_paragraph',
                'keyPhrases': ['TODO']
            },
            'query_variants': [
                f"第 1 题怎么讲解？({paper})",
                f"Question 1 explanation ({paper})",
            ],
            'expectedStyle': 'full_tutoring'
        })

        # Vocabulary/paraphrase template
        templates.append({
            'id': f"{article_id}_vocab_paraphrase",
            'questionId': article_id,
            'mode': 'hint',
            'locale': 'zh',
            'userQuery': f"文中关键词有哪些同义替换？({paper})",
            'focusQuestionNumbers': [],
            'expectedQuestionType': 'vocabulary',
            'headingListRequired': False,
            'expected_answer': 'TODO',
            'expected_evidence': {
                'paragraphLabels': [],
                'chunkType': 'passage_paragraph',
                'keyPhrases': ['TODO']
            },
            'query_variants': [
                f"同义词替换 ({paper})",
                f"Paraphrase key words ({paper})",
            ],
            'expectedStyle': 'vocab_paraphrase'
        })

        # Social greeting template
        templates.append({
            'id': f"{article_id}_social_greeting",
            'questionId': article_id,
            'mode': 'hint',
            'locale': 'zh',
            'userQuery': "你好",
            'focusQuestionNumbers': [],
            'expectedQuestionType': None,
            'headingListRequired': False,
            'expected_answer': '你好！我是你的 AI 助教...',
            'expected_evidence': None,
            'query_variants': ['嗨', '早上好'],
            'expectedStyle': 'full_tutoring',
            'expectedResponseKind': 'social'
        })

    return templates


def main():
    print("=" * 60)
    print("IELTS Reading Golden Dataset Expansion Analysis")
    print("=" * 60)

    # Load data
    print("\n1. Loading data...")
    golden_samples = load_golden_dataset()
    question_meta = load_question_meta()

    print(f"   - Golden dataset: {len(golden_samples)} samples")
    print(f"   - Total articles: {len(question_meta)}")

    # Analyze current coverage
    print("\n2. Current Golden dataset coverage:")
    coverage = get_current_coverage(golden_samples)
    print(f"   - Covered articles: {coverage['article_count']}")
    print(f"   - Articles: {coverage['articles']}")
    print(f"   - Question type distribution:")
    for qt, count in sorted(coverage['question_types'].items(), key=lambda x: -x[1]):
        print(f"     - {qt}: {count}")

    # Get article distribution by paper
    print("\n3. Article distribution by paper:")
    paper_dist = defaultdict(int)
    difficulty_dist = defaultdict(int)
    for article_id in question_meta.keys():
        info = analyze_article_id(article_id)
        paper_dist[info['paper']] += 1
        difficulty_dist[info['difficulty']] += 1

    for paper in ['p1', 'p2', 'p3']:
        print(f"   - {paper.upper()}: {paper_dist[paper]} articles")

    print("\n   By difficulty:")
    for diff in ['high', 'medium', 'low']:
        print(f"   - {diff}: {difficulty_dist[diff]} articles")

    # Recommend articles for expansion
    print("\n4. Recommended articles for expansion:")
    recommendations = recommend_articles(question_meta, coverage, target_count=30)

    # Group recommendations by paper
    by_paper = defaultdict(list)
    for article_id in recommendations:
        info = analyze_article_id(article_id)
        by_paper[info['paper']].append(article_id)

    for paper in ['p1', 'p2', 'p3']:
        print(f"\n   {paper.upper()} ({len(by_paper[paper])} articles):")
        for article_id in by_paper[paper]:
            info = analyze_article_id(article_id)
            print(f"     - {article_id} ({info['difficulty']})")

    # Estimate total samples
    samples_per_article = 7  # Average
    estimated_total = coverage['total_samples'] + len(recommendations) * samples_per_article
    print(f"\n5. Expansion estimate:")
    print(f"   - Current: {coverage['total_samples']} samples")
    print(f"   - Adding {len(recommendations)} articles x ~{samples_per_article} samples")
    print(f"   - Estimated total: ~{estimated_total} samples")

    # Generate templates
    print("\n6. Generating sample templates...")
    templates = generate_sample_templates(recommendations)
    template_path = Path(__file__).parent / "golden_samples_templates.json"
    with open(template_path, 'w', encoding='utf-8') as f:
        json.dump(templates, f, indent=2, ensure_ascii=False)
    print(f"   - Generated {len(templates)} templates")
    print(f"   - Saved to: {template_path}")

    print("\n" + "=" * 60)
    print("Analysis complete!")
    print("=" * 60)


if __name__ == '__main__':
    main()
