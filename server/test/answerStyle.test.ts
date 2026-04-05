import { describe, expect, it } from 'vitest'
import { classifyAnswerStyle } from '../src/lib/assistant/answerStyle.js'
import type { AssistantQueryRequest } from '../src/types/assistant.js'

function req(partial: Partial<AssistantQueryRequest> & Pick<AssistantQueryRequest, 'userQuery'>): AssistantQueryRequest {
  return {
    questionId: 'q1',
    mode: 'hint',
    ...partial
  } as AssistantQueryRequest
}

describe('classifyAnswerStyle', () => {
  describe('vocab_paraphrase (zh)', () => {
    it('classifies synonym / paraphrase questions', () => {
      expect(classifyAnswerStyle(req({ userQuery: 'increased 的同义替换有哪些？' }), 'zh')).toBe('vocab_paraphrase')
      expect(classifyAnswerStyle(req({ userQuery: '和 spread 近义词有哪些' }), 'zh')).toBe('vocab_paraphrase')
    })

    it('classifies "替换词" questions', () => {
      expect(classifyAnswerStyle(req({ userQuery: 'servants 的替换词' }), 'zh')).toBe('vocab_paraphrase')
      expect(classifyAnswerStyle(req({ userQuery: '有什么词能替换 increased' }), 'zh')).toBe('vocab_paraphrase')
    })

    it('classifies "哪些词可以替换" questions', () => {
      expect(classifyAnswerStyle(req({ userQuery: '哪些词可以替换 servants' }), 'zh')).toBe('vocab_paraphrase')
      expect(classifyAnswerStyle(req({ userQuery: 'servants 有哪些同义替换' }), 'zh')).toBe('vocab_paraphrase')
    })

    it('classifies "相当于" questions', () => {
      expect(classifyAnswerStyle(req({ userQuery: 'servants 相当于哪些词' }), 'zh')).toBe('vocab_paraphrase')
    })

    it('classifies "可以换成什么词" questions', () => {
      expect(classifyAnswerStyle(req({ userQuery: 'servants 可以换成什么词' }), 'zh')).toBe('vocab_paraphrase')
    })

    it('classifies "是什么意思" questions', () => {
      expect(classifyAnswerStyle(req({ userQuery: 'servants 是什么意思' }), 'zh')).toBe('vocab_paraphrase')
      expect(classifyAnswerStyle(req({ userQuery: '这个词是什么意思呀' }), 'zh')).toBe('vocab_paraphrase')
      expect(classifyAnswerStyle(req({ userQuery: '这个词什么意思' }), 'zh')).toBe('vocab_paraphrase')
    })
  })

  describe('paragraph_focus (zh)', () => {
    it('classifies paragraph content questions', () => {
      expect(classifyAnswerStyle(req({ userQuery: '段落 D 内容是什么' }), 'zh')).toBe('paragraph_focus')
      expect(classifyAnswerStyle(req({ userQuery: 'Paragraph C 原文讲什么' }), 'zh')).toBe('paragraph_focus')
    })

    it('classifies "段落 X 讲什么" questions', () => {
      expect(classifyAnswerStyle(req({ userQuery: '段落 A 讲什么' }), 'zh')).toBe('paragraph_focus')
      expect(classifyAnswerStyle(req({ userQuery: '段落 B 大意' }), 'zh')).toBe('paragraph_focus')
    })
  })

  describe('vocab_paraphrase (en)', () => {
    it('classifies English synonym asks', () => {
      expect(classifyAnswerStyle(req({ userQuery: 'synonyms for increased in this passage' }), 'en')).toBe('vocab_paraphrase')
      expect(classifyAnswerStyle(req({ userQuery: 'synonym of spread' }), 'en')).toBe('vocab_paraphrase')
    })

    it('classifies "what word can replace" questions', () => {
      expect(classifyAnswerStyle(req({ userQuery: 'what word can replace servants' }), 'en')).toBe('vocab_paraphrase')
    })

    it('classifies "equivalent to" questions', () => {
      expect(classifyAnswerStyle(req({ userQuery: 'what is equivalent to servants' }), 'en')).toBe('vocab_paraphrase')
    })

    it('classifies "means" questions', () => {
      expect(classifyAnswerStyle(req({ userQuery: 'what does servants mean in context' }), 'en')).toBe('vocab_paraphrase')
    })
  })

  describe('paragraph_focus (en)', () => {
    it('classifies English paragraph content questions', () => {
      expect(classifyAnswerStyle(req({ userQuery: 'what does paragraph A say' }), 'en')).toBe('paragraph_focus')
      expect(classifyAnswerStyle(req({ userQuery: 'paragraph B main idea' }), 'en')).toBe('paragraph_focus')
    })
  })

  describe('full_tutoring (default)', () => {
    it('leaves full tutoring for generic coaching questions', () => {
      expect(classifyAnswerStyle(req({ userQuery: '第 1 题怎么做？' }), 'zh')).toBe('full_tutoring')
      expect(classifyAnswerStyle(req({ userQuery: 'Where should I start?', mode: 'hint' }), 'en')).toBe('full_tutoring')
    })

    it('leaves full tutoring for short or unclear queries', () => {
      expect(classifyAnswerStyle(req({ userQuery: 'a' }), 'zh')).toBe('full_tutoring')
      expect(classifyAnswerStyle(req({ userQuery: 'help' }), 'zh')).toBe('full_tutoring')
    })

    it('leaves full tutoring for review requests', () => {
      expect(classifyAnswerStyle(req({ userQuery: '帮我复盘错题' }), 'zh')).toBe('full_tutoring')
      expect(classifyAnswerStyle(req({ userQuery: 'review my mistakes' }), 'en')).toBe('full_tutoring')
    })
  })
})
