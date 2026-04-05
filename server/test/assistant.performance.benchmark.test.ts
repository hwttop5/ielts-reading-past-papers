/**
 * AI Assistant Performance Benchmark
 * 100+ test cases for routing accuracy and response time measurement
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { AssistantService } from '../src/lib/assistant/service.js'
import { classifyRoute } from '../src/lib/assistant/router.js'
import type { QuestionIndexEntry, ParsedQuestionDocument, RagChunk, QuestionSummaryDoc } from '../src/types/question-bank.js'

// Mock data
function createMockQuestion(): QuestionIndexEntry {
  return {
    id: 'test-question-001',
    title: 'Cambridge IELTS 15 Test 1 Section 1',
    category: 'P1',
    difficulty: 'Medium',
    htmlPath: '/questionBank/test-001.html',
    pdfPath: '/questionBank/test-001.pdf',
    createdAt: Date.now(),
    updatedAt: Date.now()
  }
}

function createMockDocument(): ParsedQuestionDocument {
  const questionChunks: RagChunk[] = [
    {
      id: 'q1',
      questionId: 'test-question-001',
      title: 'Cambridge IELTS 15 Test 1 Section 1',
      category: 'P1',
      difficulty: 'Medium',
      questionNumbers: ['1', '2', '3'],
      content: 'Questions 1-3',
      chunkType: 'question_item',
      paragraphLabels: [],
      sensitive: false,
      sourcePath: '/questionBank/test-001.html',
      metadata: {
        questionId: 'test-question-001',
        title: 'Cambridge IELTS 15 Test 1 Section 1',
        category: 'P1',
        difficulty: 'Medium',
        chunkType: 'question_item',
        sensitive: false,
        questionNumbers: ['1', '2', '3'],
        paragraphLabels: [],
        sourcePath: '/questionBank/test-001.html'
      }
    }
  ]
  const passageChunks: RagChunk[] = [
    {
      id: 'p1',
      questionId: 'test-question-001',
      title: 'Cambridge IELTS 15 Test 1 Section 1',
      category: 'P1',
      difficulty: 'Medium',
      content: 'Paragraph A content about sleep research',
      paragraphLabels: ['A'],
      chunkType: 'passage_paragraph',
      questionNumbers: [],
      sensitive: false,
      sourcePath: '/questionBank/test-001.html',
      metadata: {
        questionId: 'test-question-001',
        title: 'Cambridge IELTS 15 Test 1 Section 1',
        category: 'P1',
        difficulty: 'Medium',
        chunkType: 'passage_paragraph',
        sensitive: false,
        questionNumbers: [],
        paragraphLabels: ['A'],
        sourcePath: '/questionBank/test-001.html'
      }
    },
    {
      id: 'p2',
      questionId: 'test-question-001',
      title: 'Cambridge IELTS 15 Test 1 Section 1',
      category: 'P1',
      difficulty: 'Medium',
      content: 'Paragraph B content about study findings',
      paragraphLabels: ['B'],
      chunkType: 'passage_paragraph',
      questionNumbers: [],
      sensitive: false,
      sourcePath: '/questionBank/test-001.html',
      metadata: {
        questionId: 'test-question-001',
        title: 'Cambridge IELTS 15 Test 1 Section 1',
        category: 'P1',
        difficulty: 'Medium',
        chunkType: 'passage_paragraph',
        sensitive: false,
        questionNumbers: [],
        paragraphLabels: ['B'],
        sourcePath: '/questionBank/test-001.html'
      }
    }
  ]
  return {
    question: {
      id: 'test-question-001',
      title: 'Cambridge IELTS 15 Test 1 Section 1',
      category: 'P1',
      difficulty: 'Medium',
      htmlPath: '/questionBank/test-001.html',
      pdfPath: '/questionBank/test-001.pdf'
    },
    sourcePath: '/questionBank/test-001.html',
    summary: {
      id: 'summary-001',
      questionId: 'test-question-001',
      title: 'Cambridge IELTS 15 Test 1 Section 1',
      category: 'P1',
      difficulty: 'Medium',
      topicSummary: 'Test passage about sleep research',
      keywords: ['sleep', 'research', 'study'],
      questionTypes: ['multiple_choice'],
      content: 'Test content',
      sourcePath: '/questionBank/test-001.html',
      metadata: {
        questionId: 'test-question-001',
        title: 'Cambridge IELTS 15 Test 1 Section 1',
        category: 'P1',
        difficulty: 'Medium',
        sourcePath: '/questionBank/test-001.html',
        keywords: ['sleep', 'research', 'study'],
        questionTypes: ['multiple_choice']
      }
    },
    questionChunks,
    passageChunks,
    answerKeyChunks: [],
    answerExplanationChunks: [],
    allChunks: [...questionChunks, ...passageChunks],
    qualityReport: {
      questionId: 'test-question-001',
      issues: []
    }
  }
}

// Test case categories
interface TestCase {
  id: number
  category: string
  query: string
  expectedRoute: 'unrelated_chat' | 'ielts_general' | 'page_grounded'
  locale: 'zh' | 'en'
  description: string
}

const testCases: TestCase[] = [
  // === unrelated_chat (1-20) ===
  { id: 1, category: 'greeting_zh', query: '你好', expectedRoute: 'unrelated_chat', locale: 'zh', description: '中文问候' },
  { id: 2, category: 'greeting_zh', query: '你好啊', expectedRoute: 'unrelated_chat', locale: 'zh', description: '中文问候变体' },
  { id: 3, category: 'greeting_zh', query: '嗨', expectedRoute: 'unrelated_chat', locale: 'zh', description: '中文嗨' },
  { id: 4, category: 'greeting_zh', query: '在吗', expectedRoute: 'unrelated_chat', locale: 'zh', description: '中文询问在线' },
  { id: 5, category: 'greeting_zh', query: '谢谢', expectedRoute: 'unrelated_chat', locale: 'zh', description: '中文感谢' },
  { id: 6, category: 'greeting_zh', query: '再见', expectedRoute: 'unrelated_chat', locale: 'zh', description: '中文告别' },
  { id: 7, category: 'greeting_en', query: 'Hi', expectedRoute: 'unrelated_chat', locale: 'en', description: '英文问候' },
  { id: 8, category: 'greeting_en', query: 'Hello', expectedRoute: 'unrelated_chat', locale: 'en', description: '英文问候正式' },
  { id: 9, category: 'greeting_en', query: 'Hey there', expectedRoute: 'unrelated_chat', locale: 'en', description: '英文问候随意' },
  { id: 10, category: 'greeting_en', query: 'Thanks', expectedRoute: 'unrelated_chat', locale: 'en', description: '英文感谢' },
  { id: 11, category: 'greeting_en', query: 'Goodbye', expectedRoute: 'unrelated_chat', locale: 'en', description: '英文告别' },
  { id: 12, category: 'weather_zh', query: '今天天气怎么样', expectedRoute: 'unrelated_chat', locale: 'zh', description: '中文天气询问' },
  { id: 13, category: 'weather_zh', query: '明天会下雨吗', expectedRoute: 'unrelated_chat', locale: 'zh', description: '中文天气预报' },
  { id: 14, category: 'weather_zh', query: '现在几点了', expectedRoute: 'unrelated_chat', locale: 'zh', description: '中文时间询问' },
  { id: 15, category: 'weather_zh', query: '今天是星期几', expectedRoute: 'unrelated_chat', locale: 'zh', description: '中文日期询问' },
  { id: 16, category: 'weather_en', query: 'What is the weather like today', expectedRoute: 'unrelated_chat', locale: 'en', description: '英文天气询问' },
  { id: 17, category: 'weather_en', query: 'What time is it', expectedRoute: 'unrelated_chat', locale: 'en', description: '英文时间询问' },
  { id: 18, category: 'weather_en', query: 'What day is it today', expectedRoute: 'unrelated_chat', locale: 'en', description: '英文日期询问' },
  { id: 19, category: 'smalltalk_zh', query: '你是谁', expectedRoute: 'unrelated_chat', locale: 'zh', description: '中文身份询问' },
  { id: 20, category: 'smalltalk_en', query: 'Who are you', expectedRoute: 'unrelated_chat', locale: 'en', description: '英文身份询问' },

  // === ielts_general (21-45) ===
  { id: 21, category: 'ielts_tips_zh', query: 'IELTS 阅读怎么提高速度', expectedRoute: 'ielts_general', locale: 'zh', description: '中文 IELTS 阅读技巧' },
  { id: 22, category: 'ielts_tips_zh', query: '雅思阅读如何提高', expectedRoute: 'ielts_general', locale: 'zh', description: '中文雅思阅读提高' },
  { id: 23, category: 'ielts_tips_zh', query: '雅思听力技巧', expectedRoute: 'ielts_general', locale: 'zh', description: '中文雅思听力技巧' },
  { id: 24, category: 'ielts_tips_zh', query: '写作怎么提高', expectedRoute: 'ielts_general', locale: 'zh', description: '中文写作提高' },
  { id: 25, category: 'ielts_tips_zh', query: '口语练习方法', expectedRoute: 'ielts_general', locale: 'zh', description: '中文口语方法' },
  { id: 26, category: 'ielts_tips_en', query: 'How to improve IELTS reading speed', expectedRoute: 'ielts_general', locale: 'en', description: '英文 IELTS 阅读提高' },
  { id: 27, category: 'ielts_tips_en', query: 'IELTS listening tips', expectedRoute: 'ielts_general', locale: 'en', description: '英文听力技巧' },
  { id: 28, category: 'ielts_tips_en', query: 'How to improve writing skills', expectedRoute: 'ielts_general', locale: 'en', description: '英文写作提高' },
  { id: 29, category: 'ielts_tips_en', query: 'Speaking practice strategies', expectedRoute: 'ielts_general', locale: 'en', description: '英文口语策略' },
  { id: 30, category: 'question_type_zh', query: 'Matching Headings 怎么做', expectedRoute: 'ielts_general', locale: 'zh', description: '中文 Matching Headings 技巧' },
  { id: 31, category: 'question_type_zh', query: 'True False Not Given 技巧', expectedRoute: 'ielts_general', locale: 'zh', description: '中文 TFNG 技巧' },
  { id: 32, category: 'question_type_zh', query: '填空题怎么做', expectedRoute: 'ielts_general', locale: 'zh', description: '中文填空题技巧' },
  { id: 33, category: 'question_type_zh', query: '选择题技巧', expectedRoute: 'ielts_general', locale: 'zh', description: '中文选择题技巧' },
  { id: 34, category: 'question_type_en', query: 'How to do Matching Headings', expectedRoute: 'ielts_general', locale: 'en', description: '英文 Matching Headings 技巧' },
  { id: 35, category: 'question_type_en', query: 'True False Not Given strategy', expectedRoute: 'ielts_general', locale: 'en', description: '英文 TFNG 策略' },
  { id: 36, category: 'question_type_en', query: 'Fill in the blank tips', expectedRoute: 'ielts_general', locale: 'en', description: '英文填空题技巧' },
  { id: 37, category: 'vocab_zh', query: '同义替换怎么积累', expectedRoute: 'ielts_general', locale: 'zh', description: '中文同义替换积累' },
  { id: 38, category: 'vocab_zh', query: '词汇怎么提高', expectedRoute: 'ielts_general', locale: 'zh', description: '中文词汇提高' },
  { id: 39, category: 'vocab_zh', query: '单词记忆方法', expectedRoute: 'ielts_general', locale: 'zh', description: '中文单词记忆' },
  { id: 40, category: 'vocab_en', query: 'How to build vocabulary', expectedRoute: 'ielts_general', locale: 'en', description: '英文词汇积累' },
  { id: 41, category: 'vocab_en', query: 'Synonym practice tips', expectedRoute: 'ielts_general', locale: 'en', description: '英文同义词练习' },
  { id: 42, category: 'general_strategy_zh', query: '雅思备考方法', expectedRoute: 'ielts_general', locale: 'zh', description: '中文备考方法' },
  { id: 43, category: 'general_strategy_zh', query: '考试时间分配技巧', expectedRoute: 'ielts_general', locale: 'zh', description: '中文时间分配' },
  { id: 44, category: 'general_strategy_en', query: 'IELTS preparation strategy', expectedRoute: 'ielts_general', locale: 'en', description: '英文备考策略' },
  { id: 45, category: 'general_strategy_en', query: 'Time management tips for IELTS', expectedRoute: 'ielts_general', locale: 'en', description: '英文时间管理' },

  // === page_grounded (46-100+) ===
  { id: 46, category: 'question_num_zh', query: '第 1 题怎么做', expectedRoute: 'page_grounded', locale: 'zh', description: '中文第 1 题' },
  { id: 47, category: 'question_num_zh', query: '第 2 题答案是什么', expectedRoute: 'page_grounded', locale: 'zh', description: '中文第 2 题答案' },
  { id: 48, category: 'question_num_zh', query: '第 3 题为什么错了', expectedRoute: 'page_grounded', locale: 'zh', description: '中文第 3 题错误分析' },
  { id: 49, category: 'question_num_zh', query: '第 5 题的证据在哪里', expectedRoute: 'page_grounded', locale: 'zh', description: '中文第 5 题证据' },
  { id: 50, category: 'question_num_zh', query: '第 10 题怎么定位', expectedRoute: 'page_grounded', locale: 'zh', description: '中文第 10 题定位' },
  { id: 51, category: 'question_num_en', query: 'How to do Q1', expectedRoute: 'page_grounded', locale: 'en', description: '英文 Q1' },
  { id: 52, category: 'question_num_en', query: 'Question 2 answer', expectedRoute: 'page_grounded', locale: 'en', description: '英文 Question 2' },
  { id: 53, category: 'question_num_en', query: 'Why is Q3 wrong', expectedRoute: 'page_grounded', locale: 'en', description: '英文 Q3 错误' },
  { id: 54, category: 'question_num_en', query: 'Where is the evidence for Q5', expectedRoute: 'page_grounded', locale: 'en', description: '英文 Q5 证据' },
  { id: 55, category: 'paragraph_zh', query: '段落 A 讲了什么', expectedRoute: 'page_grounded', locale: 'zh', description: '中文段落 A' },
  { id: 56, category: 'paragraph_zh', query: '段落 B 的证据句在哪', expectedRoute: 'page_grounded', locale: 'zh', description: '中文段落 B 证据' },
  { id: 57, category: 'paragraph_zh', query: 'Paragraph C 怎么理解', expectedRoute: 'page_grounded', locale: 'zh', description: '中文 Paragraph C' },
  { id: 58, category: 'paragraph_en', query: 'What does Paragraph A say', expectedRoute: 'page_grounded', locale: 'en', description: '英文 Paragraph A' },
  { id: 59, category: 'paragraph_en', query: 'Find evidence in Paragraph B', expectedRoute: 'page_grounded', locale: 'en', description: '英文 Paragraph B 证据' },
  { id: 60, category: 'passage_zh', query: '这篇文章主要讲什么', expectedRoute: 'page_grounded', locale: 'zh', description: '中文文章主旨' },
  { id: 61, category: 'passage_zh', query: '这篇文章的结构是什么', expectedRoute: 'page_grounded', locale: 'zh', description: '中文文章结构' },
  { id: 62, category: 'passage_zh', query: '这段怎么理解', expectedRoute: 'page_grounded', locale: 'zh', description: '中文段落理解' },
  { id: 63, category: 'passage_zh', query: '本文的中心思想', expectedRoute: 'page_grounded', locale: 'zh', description: '中文中心思想' },
  { id: 64, category: 'passage_en', query: 'What is this passage about', expectedRoute: 'page_grounded', locale: 'en', description: '英文文章主旨' },
  { id: 65, category: 'passage_en', query: 'Summarize the text', expectedRoute: 'page_grounded', locale: 'en', description: '英文文章总结' },
  { id: 66, category: 'mistake_zh', query: '帮我分析错题', expectedRoute: 'page_grounded', locale: 'zh', description: '中文错题分析' },
  { id: 67, category: 'mistake_zh', query: '这道题为什么错了', expectedRoute: 'page_grounded', locale: 'zh', description: '中文题目错误' },
  { id: 68, category: 'mistake_zh', query: '这组题怎么做', expectedRoute: 'page_grounded', locale: 'zh', description: '中文题组解法' },
  { id: 69, category: 'mistake_zh', query: '错题解析', expectedRoute: 'page_grounded', locale: 'zh', description: '中文错题解析' },
  { id: 70, category: 'mistake_zh', query: '证据句在哪里', expectedRoute: 'page_grounded', locale: 'zh', description: '中文证据句' },
  { id: 71, category: 'mistake_zh', query: '定位词是什么', expectedRoute: 'page_grounded', locale: 'zh', description: '中文定位词' },
  { id: 72, category: 'mistake_zh', query: '题干怎么理解', expectedRoute: 'page_grounded', locale: 'zh', description: '中文题干理解' },
  { id: 73, category: 'mistake_en', query: 'Analyze my mistakes', expectedRoute: 'page_grounded', locale: 'en', description: '英文错题分析' },
  { id: 74, category: 'mistake_en', query: 'Why was this question wrong', expectedRoute: 'page_grounded', locale: 'en', description: '英文题目错误' },
  { id: 75, category: 'mistake_en', query: 'Where is the evidence', expectedRoute: 'page_grounded', locale: 'en', description: '英文证据位置' },
  { id: 76, category: 'review_zh', query: '提交后复盘', expectedRoute: 'page_grounded', locale: 'zh', description: '中文提交复盘' },
  { id: 77, category: 'review_zh', query: '这组题一起讲', expectedRoute: 'page_grounded', locale: 'zh', description: '中文整组讲解' },
  { id: 78, category: 'review_zh', query: '全部题目解析', expectedRoute: 'page_grounded', locale: 'zh', description: '中文全部解析' },
  { id: 79, category: 'review_zh', query: '整体思路', expectedRoute: 'page_grounded', locale: 'zh', description: '中文整体思路' },
  { id: 80, category: 'review_en', query: 'Review the whole set', expectedRoute: 'page_grounded', locale: 'en', description: '英文整组复盘' },
  { id: 81, category: 'review_en', query: 'Explain all questions', expectedRoute: 'page_grounded', locale: 'en', description: '英文全部题目' },
  { id: 82, category: 'selection_zh', query: '这句话什么意思', expectedRoute: 'page_grounded', locale: 'zh', description: '中文选中文本' },
  { id: 83, category: 'selection_zh', query: '这个短语怎么理解', expectedRoute: 'page_grounded', locale: 'zh', description: '中文短语理解' },
  { id: 84, category: 'selection_en', query: 'What does this sentence mean', expectedRoute: 'page_grounded', locale: 'en', description: '英文句子意思' },
  { id: 85, category: 'selection_en', query: 'Explain this phrase', expectedRoute: 'page_grounded', locale: 'en', description: '英文短语解释' },
  { id: 86, category: 'specific_q_zh', query: '第 12 题的定位词', expectedRoute: 'page_grounded', locale: 'zh', description: '中文第 12 题定位' },
  { id: 87, category: 'specific_q_zh', query: 'Question 15 怎么做', expectedRoute: 'page_grounded', locale: 'zh', description: '中文 Q15 解法' },
  { id: 88, category: 'specific_q_en', query: 'How to approach question 8', expectedRoute: 'page_grounded', locale: 'en', description: '英文 Q8 解法' },
  { id: 89, category: 'specific_q_en', query: 'Evidence for question 10', expectedRoute: 'page_grounded', locale: 'en', description: '英文 Q10 证据' },
  { id: 90, category: 'paragraph_specific', query: 'Paragraph D 的主要内容', expectedRoute: 'page_grounded', locale: 'zh', description: '中文段落 D' },
  { id: 91, category: 'paragraph_specific', query: '段落 E 的证据', expectedRoute: 'page_grounded', locale: 'zh', description: '中文段落 E 证据' },
  { id: 92, category: 'paragraph_specific', query: 'Section F 怎么理解', expectedRoute: 'page_grounded', locale: 'zh', description: '中文 Section F' },
  { id: 93, category: 'current_context', query: '当前题目的答案', expectedRoute: 'page_grounded', locale: 'zh', description: '中文当前题目' },
  { id: 94, category: 'current_context', query: '这道选择题怎么排除', expectedRoute: 'page_grounded', locale: 'zh', description: '中文选择题排除' },
  { id: 95, category: 'current_context', query: '配对题怎么定位', expectedRoute: 'page_grounded', locale: 'zh', description: '中文配对题定位' },
  { id: 96, category: 'current_context', query: 'This question type strategy', expectedRoute: 'page_grounded', locale: 'en', description: '英文题型策略' },
  { id: 97, category: 'current_context', query: 'Current passage main idea', expectedRoute: 'page_grounded', locale: 'en', description: '英文当前文章主旨' },
  { id: 98, category: 'submit_context', query: 'Submit 后看解析', expectedRoute: 'page_grounded', locale: 'zh', description: '中文提交后解析' },
  { id: 99, category: 'submit_context', query: '提交后查看错题', expectedRoute: 'page_grounded', locale: 'zh', description: '中文提交后错题' },
  { id: 100, category: 'submit_context', query: 'Review after submit', expectedRoute: 'page_grounded', locale: 'en', description: '英文提交后复盘' },

  // === Additional edge cases (101-110) ===
  { id: 101, category: 'edge_short', query: '？', expectedRoute: 'page_grounded', locale: 'zh', description: '中文单问号' },
  { id: 102, category: 'edge_short', query: '？', expectedRoute: 'page_grounded', locale: 'zh', description: '中文单问号' },
  { id: 103, category: 'edge_mixed', query: '你好 IELTS 怎么准备', expectedRoute: 'ielts_general', locale: 'zh', description: '中文混合问候 +IELTS' },
  { id: 104, category: 'edge_mixed', query: 'Hi how to improve reading', expectedRoute: 'ielts_general', locale: 'en', description: '英文混合问候 + 技巧' },
  { id: 105, category: 'edge_long', query: '我想问一下关于雅思阅读中 Matching Headings 题型的具体解题方法和技巧，特别是如何快速定位段落主旨', expectedRoute: 'ielts_general', locale: 'zh', description: '中文长句技巧询问' },
  { id: 106, category: 'edge_long', query: 'Can you help me understand how to approach the paragraph matching questions in IELTS reading section', expectedRoute: 'ielts_general', locale: 'en', description: '英文长句技巧询问' },
  { id: 107, category: 'edge_specific', query: '第 1 题和第 2 题怎么做', expectedRoute: 'page_grounded', locale: 'zh', description: '中文多题号' },
  { id: 108, category: 'edge_specific', query: 'Questions 1 and 2 evidence', expectedRoute: 'page_grounded', locale: 'en', description: '英文多题号' },
  { id: 109, category: 'edge_greeting_page', query: '你好，第 1 题怎么做', expectedRoute: 'page_grounded', locale: 'zh', description: '中文问候 + 题目' },
  { id: 110, category: 'edge_greeting_page', query: 'Hi, how to do Q1', expectedRoute: 'page_grounded', locale: 'en', description: '英文问候 + 题目' },
]

describe('AI Assistant Performance Benchmark (100+ test cases)', () => {
  const results: Array<{
    id: number
    category: string
    query: string
    expectedRoute: string
    actualRoute: string
    correct: boolean
    responseTimeMs: number
    locale: string
    description: string
  }> = []

  let totalCorrect = 0
  let totalIncorrect = 0
  let categoryStats: Record<string, { total: number; correct: number; avgTime: number }> = {}

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Route Classification Accuracy', () => {
    it.each(testCases)(
      'Case #$id: $description ($query)',
      async ({ id, query, expectedRoute, locale, description }) => {
        const startTime = Date.now()

        const result = await classifyRoute(
          {
            questionId: 'test-001',
            userQuery: query,
            locale
          },
          locale
        )

        const responseTime = Date.now() - startTime
        const correct = result.route === expectedRoute

        if (correct) totalCorrect++
        else totalIncorrect++

        // Track category stats
        const category = `${description.split(' ')[0]}`
        if (!categoryStats[category]) {
          categoryStats[category] = { total: 0, correct: 0, avgTime: 0 }
        }
        categoryStats[category].total++
        if (correct) categoryStats[category].correct++
        categoryStats[category].avgTime =
          (categoryStats[category].avgTime * (categoryStats[category].total - 1) + responseTime) /
          categoryStats[category].total

        results.push({
          id,
          category,
          query,
          expectedRoute,
          actualRoute: result.route,
          correct,
          responseTimeMs: responseTime,
          locale,
          description
        })

        expect(result.route).toBe(expectedRoute)
      },
      3000 // 3 second timeout per test
    )
  })

  describe('Service Response Time', () => {
    const mockQuestion = createMockQuestion()
    const mockDocument = createMockDocument()

    it('measures unrelated_chat (social) fast path response time', async () => {
      const service = new AssistantService({
        questionLoader: async () => mockQuestion,
        documentLoader: async () => mockDocument,
        summariesLoader: async () => []
      })

      const startTime = Date.now()
      const response = await service.query({
        questionId: mockQuestion.id,
        locale: 'zh',
        userQuery: '你好'
      })
      const totalTime = Date.now() - startTime

      expect(response.responseKind).toBe('social')
      expect(totalTime).toBeLessThan(100) // Should be instant (<100ms)
      console.log(`[PERF] Social fast path: ${totalTime.toFixed(2)}ms`)
    })

    // Skip this test - requires LLM API key and is environment-dependent
    it.skip('measures page_grounded response time with document load', async () => {
      const service = new AssistantService({
        questionLoader: async () => mockQuestion,
        documentLoader: async () => mockDocument,
        summariesLoader: async () => []
      })

      const startTime = Date.now()
      const response = await service.query({
        questionId: mockQuestion.id,
        locale: 'zh',
        userQuery: '第 1 题怎么做'
      })
      const totalTime = Date.now() - startTime

      expect(response.responseKind).toBeDefined()
      console.log(`[PERF] Page grounded path: ${totalTime.toFixed(2)}ms`)
    })
  })

  describe('Performance Summary', () => {
    it('generates performance report', () => {
      const totalTime = results.reduce((sum, r) => sum + r.responseTimeMs, 0)
      const avgTime = totalTime / results.length
      const accuracy = ((totalCorrect / results.length) * 100).toFixed(2)

      console.log('\n' + '='.repeat(80))
      console.log('AI 小助手性能测试报告 (AI Assistant Performance Report)')
      console.log('='.repeat(80))
      console.log(`\n测试用例总数 (Total Test Cases): ${results.length}`)
      console.log(`分类正确数 (Correct Classifications): ${totalCorrect}`)
      console.log(`分类错误数 (Incorrect Classifications): ${totalIncorrect}`)
      console.log(`路由分类准确率 (Routing Accuracy): ${accuracy}%`)
      console.log(`\n平均响应时间 (Average Response Time): ${avgTime.toFixed(2)}ms`)
      console.log(`总测试时间 (Total Test Time): ${totalTime.toFixed(2)}ms`)

      console.log('\n' + '-'.repeat(80))
      console.log('按类别统计 (Statistics by Category)')
      console.log('-'.repeat(80))

      const sortedCategories = Object.entries(categoryStats)
        .sort((a, b) => b[1].total - a[1].total)

      for (const [category, stats] of sortedCategories) {
        const catAccuracy = ((stats.correct / stats.total) * 100).toFixed(1)
        console.log(`${category}: ${stats.correct}/${stats.total} (${catAccuracy}%), avg ${stats.avgTime.toFixed(1)}ms`)
      }

      console.log('\n' + '-'.repeat(80))
      console.log('错误分析 (Error Analysis)')
      console.log('-'.repeat(80))

      const errors = results.filter(r => !r.correct)
      if (errors.length === 0) {
        console.log('✓ 所有测试用例均通过 (All test cases passed)')
      } else {
        console.log(`发现 ${errors.length} 个错误:`)
        for (const error of errors.slice(0, 10)) {
          console.log(`  - Case #${error.id}: "${error.query}"`)
          console.log(`    期望 (Expected): ${error.expectedRoute}, 实际 (Actual): ${error.actualRoute}`)
        }
        if (errors.length > 10) {
          console.log(`  ... 还有 ${errors.length - 10} 个错误`)
        }
      }

      console.log('\n' + '-'.repeat(80))
      console.log('优化建议 (Optimization Recommendations)')
      console.log('-'.repeat(80))

      // Generate recommendations based on results
      const recommendations: string[] = []

      if (avgTime > 50) {
        recommendations.push('1. 路由响应时间偏慢，建议优化规则匹配逻辑，减少正则表达式数量')
      } else {
        recommendations.push('1. 路由响应时间良好，保持当前性能')
      }

      const greetingAccuracy = categoryStats['中文问候']?.correct && categoryStats['中文问候'].total
        ? (categoryStats['中文问候'].correct / categoryStats['中文问候'].total) * 100
        : 100
      if (greetingAccuracy < 100) {
        recommendations.push('2. 中文问候识别需要改进，建议添加更多问候变体到规则中')
      }

      const ieltsAccuracy = categoryStats['中文 IELTS 阅读技巧']?.correct && categoryStats['中文 IELTS 阅读技巧'].total
        ? (categoryStats['中文 IELTS 阅读技巧'].correct / categoryStats['中文 IELTS 阅读技巧'].total) * 100
        : 100
      if (ieltsAccuracy < 95) {
        recommendations.push('3. IELTS 技巧问题识别准确率有待提高，建议扩展关键词库')
      }

      if (totalIncorrect > 5) {
        recommendations.push('4. 错误率较高，建议添加 LLM 路由作为 fallback，处理规则无法判断的情况')
      }

      recommendations.push('5. 考虑添加路由缓存，对相同查询避免重复分类')
      recommendations.push('6. 建议添加路由日志，便于线上问题排查')

      recommendations.forEach(r => console.log(r))

      console.log('\n' + '='.repeat(80))
    })
  })
})
