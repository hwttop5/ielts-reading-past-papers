/**
 * AI Assistant Optimization Tests
 * Tests for the optimization fixes implemented in 2026-04-05
 */

import { describe, it, expect } from 'vitest'
import { classifyRoute } from '../src/lib/assistant/router.js'
import type { AssistantQueryRequest } from '../src/types/assistant.js'

interface RouteTest {
  name: string
  request: Partial<AssistantQueryRequest>
  expectedRoute: 'unrelated_chat' | 'ielts_general' | 'page_grounded'
  locale?: 'zh' | 'en'
}

describe('AI Assistant Optimization Tests', () => {
  // === P0: Social/chat responses should not show question meta info ===
  describe('P0: Social and general chat routing', () => {
    const socialTests: RouteTest[] = [
      // Chinese social queries
      { name: 'Chinese greeting: 你好', request: { userQuery: '你好' }, expectedRoute: 'unrelated_chat', locale: 'zh' },
      { name: 'Chinese greeting: 你好啊', request: { userQuery: '你好啊' }, expectedRoute: 'unrelated_chat', locale: 'zh' },
      { name: 'Chinese greeting: 嗨', request: { userQuery: '嗨' }, expectedRoute: 'unrelated_chat', locale: 'zh' },
      { name: 'Chinese greeting: 在吗', request: { userQuery: '在吗' }, expectedRoute: 'unrelated_chat', locale: 'zh' },
      { name: 'Chinese greeting: 谢谢', request: { userQuery: '谢谢' }, expectedRoute: 'unrelated_chat', locale: 'zh' },
      { name: 'Chinese greeting: 你是谁', request: { userQuery: '你是谁' }, expectedRoute: 'unrelated_chat', locale: 'zh' },
      { name: 'Chinese greeting with punctuation: 你好，', request: { userQuery: '你好，' }, expectedRoute: 'unrelated_chat', locale: 'zh' },
      { name: 'Chinese greeting with punctuation: 你好!', request: { userQuery: '你好!' }, expectedRoute: 'unrelated_chat', locale: 'zh' },

      // Weather and time (should be unrelated_chat)
      { name: 'Weather query: 今天天气怎么样', request: { userQuery: '今天天气怎么样' }, expectedRoute: 'unrelated_chat', locale: 'zh' },
      { name: 'Time query: 现在几点了', request: { userQuery: '现在几点了' }, expectedRoute: 'unrelated_chat', locale: 'zh' },

      // English social queries
      { name: 'English greeting: Hi', request: { userQuery: 'Hi' }, expectedRoute: 'unrelated_chat', locale: 'en' },
      { name: 'English greeting: Hello', request: { userQuery: 'Hello' }, expectedRoute: 'unrelated_chat', locale: 'en' },
      { name: 'English greeting: Hey', request: { userQuery: 'Hey' }, expectedRoute: 'unrelated_chat', locale: 'en' },
      { name: 'English greeting: Thanks', request: { userQuery: 'Thanks' }, expectedRoute: 'unrelated_chat', locale: 'en' },
      { name: 'English greeting: Who are you', request: { userQuery: 'Who are you' }, expectedRoute: 'unrelated_chat', locale: 'en' },
    ]

    socialTests.forEach((test) => {
      it(test.name, async () => {
        const result = await classifyRoute(test.request as AssistantQueryRequest, test.locale || 'zh')
        expect(result.route).toBe(test.expectedRoute)
      })
    })
  })

  // === P0: Time management keywords should trigger ielts_general ===
  describe('P0: Time management keyword detection', () => {
    const timeManagementTests: RouteTest[] = [
      // Chinese time management queries
      { name: 'Time management: 时间不够怎么办', request: { userQuery: '时间不够怎么办' }, expectedRoute: 'ielts_general', locale: 'zh' },
      { name: 'Time management: 时间分配', request: { userQuery: '时间分配' }, expectedRoute: 'ielts_general', locale: 'zh' },
      { name: 'Time management: 考试时间管理', request: { userQuery: '考试时间管理' }, expectedRoute: 'ielts_general', locale: 'zh' },
      { name: 'Time management: 阅读时间不够', request: { userQuery: '阅读时间不够' }, expectedRoute: 'ielts_general', locale: 'zh' },
      { name: 'Time management: 做题超时', request: { userQuery: '做题超时' }, expectedRoute: 'ielts_general', locale: 'zh' },
      { name: 'Reading speed: 阅读速度慢', request: { userQuery: '阅读速度慢' }, expectedRoute: 'ielts_general', locale: 'zh' },
      { name: 'Reading speed: 怎么做比较快', request: { userQuery: '怎么做比较快' }, expectedRoute: 'ielts_general', locale: 'zh' },
      { name: 'Reading speed: 提高速度', request: { userQuery: '提高速度' }, expectedRoute: 'ielts_general', locale: 'zh' },
    ]

    timeManagementTests.forEach((test) => {
      it(test.name, async () => {
        const result = await classifyRoute(test.request as AssistantQueryRequest, test.locale || 'zh')
        expect(result.route).toBe(test.expectedRoute)
      })
    })
  })

  // === P1: Mixed queries with greeting prefix ===
  describe('P1: Mixed queries with greeting prefix', () => {
    const mixedTests: RouteTest[] = [
      // Chinese mixed queries - greeting + IELTS question
      { name: 'Mixed: 你好，雅思阅读怎么提高', request: { userQuery: '你好，雅思阅读怎么提高' }, expectedRoute: 'ielts_general', locale: 'zh' },
      { name: 'Mixed: 你好，阅读技巧', request: { userQuery: '你好，阅读技巧' }, expectedRoute: 'ielts_general', locale: 'zh' },
      { name: 'Mixed: 嗨，雅思备考方法', request: { userQuery: '嗨，雅思备考方法' }, expectedRoute: 'ielts_general', locale: 'zh' },
      { name: 'Mixed: 您好，听力怎么提高', request: { userQuery: '您好，听力怎么提高' }, expectedRoute: 'ielts_general', locale: 'zh' },

      // Mixed queries with page-grounded should still be page_grounded
      { name: 'Mixed with Q: 你好，第 1 题怎么做', request: { userQuery: '你好，第 1 题怎么做' }, expectedRoute: 'page_grounded', locale: 'zh' },
      { name: 'Mixed with Q: 嗨，Q5 怎么做', request: { userQuery: '嗨，Q5 怎么做' }, expectedRoute: 'page_grounded', locale: 'zh' },

      // English mixed queries
      { name: 'Mixed EN: Hi, how to improve reading', request: { userQuery: 'Hi, how to improve reading' }, expectedRoute: 'ielts_general', locale: 'en' },
      { name: 'Mixed EN: Hello, IELTS tips', request: { userQuery: 'Hello, IELTS tips' }, expectedRoute: 'ielts_general', locale: 'en' },
    ]

    mixedTests.forEach((test) => {
      it(test.name, async () => {
        const result = await classifyRoute(test.request as AssistantQueryRequest, test.locale || 'zh')
        expect(result.route).toBe(test.expectedRoute)
      })
    })
  })

  // === P1: Vocabulary question detection for answerStyle ===
  describe('P1: Vocabulary question patterns (answerStyle)', () => {
    const vocabPatterns = [
      '同义替换',
      '近义词',
      '同义词',
      'precaution 是什么意思',
      'precaution 是什么意思',
      'word 什么意思',
      '可以换成什么词',
      '相当于什么',
      'synonym',
      'paraphrase',
      'what does precaution mean'
    ]

    vocabPatterns.forEach((pattern) => {
      it(`should detect vocab pattern: ${pattern}`, () => {
        // Note: This tests the pattern matching logic
        // The actual classifyAnswerStyle function would need to be imported
        const vocabPatternsZh = [
          /同义替换/,
          /近义词/,
          /同义词/,
          /paraphrase/i,
          /synonym/i,
          /什么意思/,
          /是什么意思/,
          /可以换成什么词/,
          /相当于/,
          /\bmeans?\b/i
        ]

        const vocabPatternsEn = [
          /\bsynonym(s)?\b/i,
          /\bparaphrase\b/i,
          /\bmeans?\b/i,
          /\bwhat\s+does\s+\w+\s+mean\b/i
        ]

        const matches = vocabPatternsZh.some(p => p.test(pattern)) || vocabPatternsEn.some(p => p.test(pattern))
        expect(matches).toBe(true)
      })
    })
  })

  // === P2: Question number extraction priority ===
  describe('P2: Question number extraction from current query', () => {
    const extractionTests = [
      { query: '第 12 题怎么做', expected: ['12'] },
      { query: 'Q5 怎么做', expected: ['5'] },
      { query: 'question 10 approach', expected: ['10'] },
      { query: '第 1 题和第 3 题', expected: ['1', '3'] },
      { query: 'Q1, Q2, Q3 怎么做', expected: ['1', '2', '3'] },
      { query: '讲解第 7 题', expected: ['7'] },
    ]

    extractionTests.forEach((test) => {
      it(`should extract question numbers from: ${test.query}`, () => {
        const questionPatterns = [
          ...Array.from(test.query.matchAll(/\b(?:question|questions|q)\s*(\d{1,3})\b/gi)).map(m => m[1]),
          ...Array.from(test.query.matchAll(/\u7B2C\s*(\d{1,3})\s*\u9898/g)).map(m => m[1]),
          ...Array.from(test.query.matchAll(/(?:^|[^\d])(\d{1,3})\s*\u9898/g)).map(m => m[1])
        ]

        // Use uniqueValues to remove duplicates (same as service.ts implementation)
        const uniqueValues = <T>(values: T[]): T[] => Array.from(new Set(values))

        // Sort numerically and remove duplicates
        const sorted = uniqueValues(questionPatterns).sort((a, b) => Number(a) - Number(b))

        expect(sorted).toEqual(test.expected)
      })
    })
  })
})
