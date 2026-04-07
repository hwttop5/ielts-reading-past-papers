#!/usr/bin/env python3
"""
Test cases for heading_matching evaluation logic.
"""

import unittest
from evaluator import (
    compute_question_hit,
    compute_heading_list_hit,
    compute_noise_penalty,
    evaluate_style_match
)


class TestHeadingMatchingEval(unittest.TestCase):
    """Test heading_matching evaluation functions."""

    def test_heading_list_hit_with_text(self):
        """Test heading list detection when 'List of Headings' is in content."""
        chunks = [
            {
                'content': 'List of Headings\ni. The history of tea\nii. Modern tea culture',
                'metadata': {'questionType': 'heading_matching'}
            }
        ]
        self.assertTrue(compute_heading_list_hit(chunks))

    def test_heading_list_hit_with_metadata(self):
        """Test heading list detection via questionType metadata."""
        chunks = [
            {
                'content': 'Some content without heading list',
                'metadata': {'questionType': 'heading_matching'}
            }
        ]
        self.assertTrue(compute_heading_list_hit(chunks))

    def test_heading_list_hit_false(self):
        """Test when heading list is NOT retrieved."""
        chunks = [
            {
                'content': 'Regular passage content about tea',
                'metadata': {'questionType': 'multiple_choice'}
            }
        ]
        self.assertFalse(compute_heading_list_hit(chunks))

    def test_question_hit_heading_matching_success(self):
        """Test question hit for heading_matching with heading list retrieved."""
        retrieved_chunks = [
            {
                'content': 'List of Headings\nviii. A chance discovery',
                'metadata': {'questionType': 'heading_matching'},
                'paragraphLabels': []
            },
            {
                'content': 'Paragraph A: Shen Nung discovered tea...',
                'chunkType': 'question_item',
                'metadata': {'questionType': 'heading_matching'},
                'paragraphLabels': ['A']
            }
        ]
        expected_evidence = {
            'paragraphLabels': ['A'],
            'chunkType': 'question_item',
            'keyPhrases': ['A chance discovery']
        }
        hit = compute_question_hit(
            retrieved_chunks,
            expected_evidence,
            focus_question_numbers=['1'],
            question_type='heading_matching',
            heading_list_required=True
        )
        self.assertTrue(hit)

    def test_question_hit_heading_missing_heading_list(self):
        """Test question hit fails when heading list is missing."""
        retrieved_chunks = [
            {
                'content': 'Paragraph A: Shen Nung discovered tea...',
                'metadata': {'questionType': 'passage_paragraph'},
                'paragraphLabels': ['A']
            }
        ]
        expected_evidence = {
            'paragraphLabels': ['A'],
            'chunkType': 'question_item',
            'keyPhrases': ['A chance discovery']
        }
        hit = compute_question_hit(
            retrieved_chunks,
            expected_evidence,
            focus_question_numbers=['1'],
            question_type='heading_matching',
            heading_list_required=True
        )
        self.assertFalse(hit)

    def test_noise_penalty_heading_matching_relaxed(self):
        """Test that heading_matching has relaxed noise penalty."""
        # Same paper group, different question - should NOT penalize for heading_matching
        retrieved_chunks = [
            {
                'questionId': 'p1-high-01',
                'content': 'Target paragraph',
                'metadata': {},
                'paragraphLabels': ['A']
            },
            {
                'questionId': 'p1-high-02',  # Different question, same paper
                'content': 'Other question content',
                'metadata': {},
                'paragraphLabels': ['B']
            }
        ]
        expected_evidence = {
            'paragraphLabels': ['A'],
            'chunkType': 'question_item'
        }

        penalty_heading = compute_noise_penalty(
            retrieved_chunks,
            expected_evidence,
            question_id='p1-high-01',
            question_type='heading_matching'
        )

        penalty_regular = compute_noise_penalty(
            retrieved_chunks,
            expected_evidence,
            question_id='p1-high-01',
            question_type='multiple_choice'
        )

        # heading_matching should have lower penalty
        self.assertLess(penalty_heading, penalty_regular)


class TestStyleMatch(unittest.TestCase):
    """Test style match evaluation."""

    def test_vocab_paraphrase_success(self):
        """Test vocab_paraphrase style with correct concise answer."""
        answer = "侍从、仆人、随从、attendants、servants"
        self.assertTrue(evaluate_style_match(
            answer,
            expected_style='vocab_paraphrase'
        ))

    def test_vocab_paraphrase_too_long(self):
        """Test vocab_paraphrase rejected when too long."""
        answer = "解题思路：首先，我们需要定位到段落 A，然后通过关键词匹配找到正确答案。步骤如下：第一步..."
        self.assertFalse(evaluate_style_match(
            answer,
            expected_style='vocab_paraphrase'
        ))

    def test_vocab_paraphrase_uses_tutoring_template(self):
        """Test vocab_paraphrase rejected when using tutoring template."""
        answer = "首先，定位段落中的关键词。解题思路：servants 对应侍从。"
        self.assertFalse(evaluate_style_match(
            answer,
            expected_style='vocab_paraphrase'
        ))

    def test_vocab_paraphrase_rejects_walkthrough_markers(self):
        """Test vocab_paraphrase rejected when it expands into a question walkthrough."""
        answer = "For question 8, go back to paragraph A first, then compare option B against the original sentence."
        self.assertFalse(evaluate_style_match(
            answer,
            expected_style='vocab_paraphrase'
        ))

    def test_paragraph_focus_success(self):
        """Test paragraph_focus style with correct content."""
        answer = "段落 D 讲述了茶从亚洲传入欧洲的历史过程，葡萄牙人凭借其海军技术成为首个记录茶的欧洲人。"
        self.assertTrue(evaluate_style_match(
            answer,
            expected_style='paragraph_focus'
        ))

    def test_paragraph_focus_accepts_explicit_missing_notice(self):
        """Test paragraph_focus accepts grounded missing-context answers."""
        answer = "I have not hit the original text for paragraph D yet, so I should not summarize it from memory."
        self.assertTrue(evaluate_style_match(
            answer,
            expected_style='paragraph_focus'
        ))

    def test_full_tutoring_success(self):
        """Test full_tutoring style with reasoning."""
        answer = "定位 Paragraph A 中干叶偶然落入沸水，神农帝发现茶的过程，与'A chance discovery'对应，因此选 viii。"
        self.assertTrue(evaluate_style_match(
            answer,
            expected_style='full_tutoring'
        ))

    def test_social_response_ignored(self):
        """Test that social responses are not penalized."""
        answer = "你好！我是你的 AI 助教，有什么可以帮你的。"
        self.assertTrue(evaluate_style_match(
            answer,
            expected_style='full_tutoring',
            response_kind='social'
        ))


if __name__ == '__main__':
    unittest.main()
