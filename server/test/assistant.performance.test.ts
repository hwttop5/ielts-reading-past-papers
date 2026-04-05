import { describe, expect, it, vi } from 'vitest'
import type { ParsedQuestionDocument, RagChunk } from '../src/types/question-bank.js'

function createChunk(overrides: Partial<RagChunk>): RagChunk {
  const chunkType = overrides.chunkType ?? 'question_item'
  const questionId = overrides.questionId ?? 'q1'
  const title = overrides.title ?? 'The Hunter-Gatherer Sleep Study'
  const category = overrides.category ?? 'P1'
  const difficulty = overrides.difficulty ?? 'Medium'
  const questionNumbers = overrides.questionNumbers ?? ['1']
  const paragraphLabels = overrides.paragraphLabels ?? ['A', 'B', 'C', 'D']
  const sourcePath = overrides.sourcePath ?? '/questionBank/reading-native-1.html'

  return {
    id: overrides.id ?? `${chunkType}-1`,
    questionId,
    title,
    category,
    difficulty,
    chunkType,
    sensitive: overrides.sensitive ?? false,
    questionNumbers,
    paragraphLabels,
    content: overrides.content ?? 'Sample content',
    sourcePath,
    metadata: {
      questionId,
      title,
      category,
      difficulty,
      chunkType,
      sensitive: overrides.sensitive ?? false,
      questionNumbers,
      paragraphLabels,
      sourcePath,
      questionType: overrides.metadata?.questionType ?? 'multiple_choice'
    }
  }
}

function createDocument(): ParsedQuestionDocument {
  const questionChunk = createChunk({
    id: 'question-1',
    chunkType: 'question_item',
    questionNumbers: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13'],
    content: 'Questions 1-13: The Hunter-Gatherer Sleep Study'
  })

  const passageChunk1 = createChunk({
    id: 'passage-1',
    chunkType: 'passage_paragraph',
    paragraphLabels: ['A'],
    content: 'Paragraph A: Researchers studied sleep patterns in hunter-gatherer communities.'
  })

  const passageChunk2 = createChunk({
    id: 'passage-2',
    chunkType: 'passage_paragraph',
    paragraphLabels: ['B'],
    content: 'Paragraph B: The study found that participants slept an average of 6.5 hours per night.'
  })

  const passageChunk3 = createChunk({
    id: 'passage-3',
    chunkType: 'passage_paragraph',
    paragraphLabels: ['C'],
    content: 'Paragraph C: Data was collected using activity monitors worn by participants.'
  })

  const passageChunk4 = createChunk({
    id: 'passage-4',
    chunkType: 'passage_paragraph',
    paragraphLabels: ['D'],
    content: 'Paragraph D: The findings challenge common assumptions about modern sleep habits.'
  })

  const answerKeyChunk = createChunk({
    id: 'answer-key-1',
    chunkType: 'answer_key',
    questionNumbers: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13'],
    content: '1-5: B A C D B | 6-10: C A D B C | 11-13: D A B'
  })

  const answerExplanationChunk = createChunk({
    id: 'answer-explanation-1',
    chunkType: 'answer_explanation',
    questionNumbers: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13'],
    content: 'Detailed explanations for all questions.'
  })

  return {
    id: 'doc-q1',
    questionId: 'q1',
    title: 'The Hunter-Gatherer Sleep Study',
    category: 'P1',
    difficulty: 'Medium',
    sourcePath: '/questionBank/reading-native-1.html',
    questionNumbers: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13'],
    questionChunks: [questionChunk],
    passageChunks: [passageChunk1, passageChunk2, passageChunk3, passageChunk4],
    answerKeyChunks: [answerKeyChunk],
    answerExplanationChunks: [answerExplanationChunk],
    summary: {
      id: 'summary-q1',
      questionId: 'q1',
      title: 'The Hunter-Gatherer Sleep Study',
      category: 'P1',
      difficulty: 'Medium',
      topicSummary: 'A study about sleep patterns in hunter-gatherer communities',
      keywords: ['sleep', 'hunter-gatherer', 'study'],
      questionTypes: ['multiple_choice'],
      content: 'Summary content',
      sourcePath: '/questionBank/reading-native-1.html',
      metadata: {
        questionId: 'q1',
        title: 'The Hunter-Gatherer Sleep Study',
        category: 'P1',
        difficulty: 'Medium',
        sourcePath: '/questionBank/reading-native-1.html',
        keywords: ['sleep', 'hunter-gatherer', 'study'],
        questionTypes: ['multiple_choice']
      }
    },
    qualityReport: {
      questionId: 'q1',
      issues: []
    },
    allChunks: [questionChunk, passageChunk1, passageChunk2, passageChunk3, passageChunk4, answerKeyChunk, answerExplanationChunk]
  }
}

describe('AssistantService Performance', () => {
  const mockLLM = vi.fn<
    (messages: Array<{ role: string; content: string }>, options?: { jsonSchema?: unknown }) => Promise<{ content: string }>
  >()

  // Mock LLM response with realistic timing (simulating ~200-500ms latency)
  const setupMockLLM = () => {
    mockLLM.mockImplementation(async () => {
      const latency = Math.random() * 300 + 200
      await new Promise((resolve) => setTimeout(resolve, latency))
      return {
        content: JSON.stringify({
          answer: 'The answer is B. Paragraph B contains the main finding about sleep duration.',
          reasoning: 'The question asks about sleep duration, and Paragraph B directly states the finding.',
          confidence: 'high'
        })
      }
    })
  }

  describe('Response time measurements', () => {
    it('measures tutor hint-style response time', async () => {
      setupMockLLM()
      const document = createDocument()

      const { AssistantService } = await import('../src/lib/assistant/service.js')
      const service = new AssistantService({
        provider: { generate: mockLLM },
        questionLoader: async () => ({ id: 'q1', title: 'Test', category: 'P1', difficulty: 'Medium', htmlPath: '/test.html' }),
        documentLoader: async () => document,
        summariesLoader: async () => [document.summary]
      })

      const start = performance.now()
      const response = await service.query({
        questionId: 'q1',
        locale: 'zh',
        userQuery: '请给我第 1 题一个提示，但不要直接给答案。'
      })
      const elapsed = performance.now() - start

      expect(response.answer).toBeDefined()
      console.log(`[PERF] Tutor hint-style: ${elapsed.toFixed(2)}ms`)
    })

    it('measures explain-style response time', async () => {
      setupMockLLM()
      const document = createDocument()

      const { AssistantService } = await import('../src/lib/assistant/service.js')
      const service = new AssistantService({
        provider: { generate: mockLLM },
        questionLoader: async () => ({ id: 'q1', title: 'Test', category: 'P1', difficulty: 'Medium', htmlPath: '/test.html' }),
        documentLoader: async () => document,
        summariesLoader: async () => [document.summary]
      })

      const start = performance.now()
      const response = await service.query({
        questionId: 'q1',
        locale: 'zh',
        userQuery: '请讲解第 1 题的解题思路和定位过程。'
      })
      const elapsed = performance.now() - start

      expect(response.answer).toBeDefined()
      console.log(`[PERF] Explain-style: ${elapsed.toFixed(2)}ms`)
    })

    it('measures review-set response time', async () => {
      setupMockLLM()
      const document = createDocument()

      const { AssistantService } = await import('../src/lib/assistant/service.js')
      const service = new AssistantService({
        provider: { generate: mockLLM },
        questionLoader: async () => ({ id: 'q1', title: 'Test', category: 'P1', difficulty: 'Medium', htmlPath: '/test.html' }),
        documentLoader: async () => document,
        summariesLoader: async () => [document.summary]
      })

      const start = performance.now()
      const response = await service.query({
        questionId: 'q1',
        action: 'review_set',
        locale: 'zh',
        userQuery: '请结合我的作答，分析第 1 题为什么错了，并指出证据。',
        attemptContext: {
          wrongQuestions: ['1'],
          selectedAnswers: { '1': 'A' },
          score: 0
        }
      })
      const elapsed = performance.now() - start

      expect(response.answer).toBeDefined()
      console.log(`[PERF] Review set: ${elapsed.toFixed(2)}ms`)
    })

    it('measures similar-drill recommendation response time', async () => {
      setupMockLLM()
      const document = createDocument()

      const { AssistantService } = await import('../src/lib/assistant/service.js')
      const service = new AssistantService({
        provider: { generate: mockLLM },
        questionLoader: async () => ({ id: 'q1', title: 'Test', category: 'P1', difficulty: 'Medium', htmlPath: '/test.html' }),
        documentLoader: async () => document,
        summariesLoader: async () => [document.summary]
      })

      const start = performance.now()
      const response = await service.query({
        questionId: 'q1',
        action: 'recommend_drills',
        locale: 'zh',
        userQuery: '请根据我当前练习情况推荐下一组相似练习。',
        recentPractice: [{ questionId: 'q1', accuracy: 0.5, category: 'P1', duration: 60 }]
      })
      const elapsed = performance.now() - start

      expect(response.answer).toBeDefined()
      console.log(`[PERF] Similar drills: ${elapsed.toFixed(2)}ms`)
    })

    it('measures fast path (social) response time', async () => {
      const document = createDocument()

      const { AssistantService } = await import('../src/lib/assistant/service.js')
      const service = new AssistantService({
        provider: { generate: mockLLM },
        questionLoader: async () => ({ id: 'q1', title: 'Test', category: 'P1', difficulty: 'Medium', htmlPath: '/test.html' }),
        documentLoader: async () => document,
        summariesLoader: async () => [document.summary]
      })

      const start = performance.now()
      const response = await service.query({
        questionId: 'q1',
        locale: 'zh',
        userQuery: '你好'
      })
      const elapsed = performance.now() - start

      // Social fast path should not call LLM
      expect(mockLLM).not.toHaveBeenCalled()
      expect(response.answer).toBeDefined()
      console.log(`[PERF] Social fast path: ${elapsed.toFixed(2)}ms (no LLM call)`)

      vi.clearAllMocks()
    })

    it('measures vocab_paraphrase style response time', async () => {
      setupMockLLM()
      const document = createDocument()

      const { AssistantService } = await import('../src/lib/assistant/service.js')
      const service = new AssistantService({
        provider: { generate: mockLLM },
        questionLoader: async () => ({ id: 'q1', title: 'Test', category: 'P1', difficulty: 'Medium', htmlPath: '/test.html' }),
        documentLoader: async () => document,
        summariesLoader: async () => [document.summary]
      })

      const start = performance.now()
      const response = await service.query({
        questionId: 'q1',
        locale: 'zh',
        userQuery: 'increased 的同义替换有哪些？'
      })
      const elapsed = performance.now() - start

      expect(response.answer).toBeDefined()
      console.log(`[PERF] Vocab paraphrase: ${elapsed.toFixed(2)}ms`)
    })

    it('measures paragraph_focus style response time', async () => {
      setupMockLLM()
      const document = createDocument()

      const { AssistantService } = await import('../src/lib/assistant/service.js')
      const service = new AssistantService({
        provider: { generate: mockLLM },
        questionLoader: async () => ({ id: 'q1', title: 'Test', category: 'P1', difficulty: 'Medium', htmlPath: '/test.html' }),
        documentLoader: async () => document,
        summariesLoader: async () => [document.summary]
      })

      const start = performance.now()
      const response = await service.query({
        questionId: 'q1',
        locale: 'zh',
        userQuery: '段落 D 内容是什么'
      })
      const elapsed = performance.now() - start

      expect(response.answer).toBeDefined()
      console.log(`[PERF] Paragraph focus: ${elapsed.toFixed(2)}ms`)
    })
  })

  describe('Average response time across multiple requests', () => {
    it('calculates average response time over 10 requests', async () => {
      setupMockLLM()
      const document = createDocument()

      const { AssistantService } = await import('../src/lib/assistant/service.js')
      const service = new AssistantService({
        provider: { generate: mockLLM },
        questionLoader: async () => ({ id: 'q1', title: 'Test', category: 'P1', difficulty: 'Medium', htmlPath: '/test.html' }),
        documentLoader: async () => document,
        summariesLoader: async () => [document.summary]
      })

      const times: number[] = []
      const numRequests = 10

      for (let i = 0; i < numRequests; i++) {
        const start = performance.now()
        await service.query({
          questionId: 'q1',
          locale: 'zh',
          userQuery: `测试请求 ${i + 1}`
        })
        times.push(performance.now() - start)
      }

      const avg = times.reduce((a, b) => a + b, 0) / numRequests
      const min = Math.min(...times)
      const max = Math.max(...times)

      console.log(`[PERF] Average over ${numRequests} requests:`)
      console.log(`  - Average: ${avg.toFixed(2)}ms`)
      console.log(`  - Min: ${min.toFixed(2)}ms`)
      console.log(`  - Max: ${max.toFixed(2)}ms`)

      expect(avg).toBeGreaterThan(0)
    })
  })
})
