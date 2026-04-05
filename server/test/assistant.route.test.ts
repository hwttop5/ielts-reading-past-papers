import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const ORIGINAL_ENV = { ...process.env }
const ORIGINAL_FETCH = global.fetch

async function createTestApp() {
  vi.resetModules()
  const { createApp } = await import('../src/app.js')
  return createApp()
}

function createMockQuestionBankModule() {
  const question = {
    id: 'mock-question',
    title: 'Mock Passage',
    category: 'P1',
    difficulty: 'High',
    htmlPath: '/questionBank/mock.html'
  }
  const summary = {
    id: 'summary-mock-question',
    questionId: 'mock-question',
    title: 'Mock Passage',
    category: 'P1',
    difficulty: 'High',
    topicSummary: 'Mock summary',
    keywords: ['sleep', 'study'],
    questionTypes: ['multiple_choice'],
    content: 'Mock summary content.',
    sourcePath: '/questionBank/mock.html',
    metadata: {
      questionId: 'mock-question',
      title: 'Mock Passage',
      category: 'P1',
      difficulty: 'High',
      sourcePath: '/questionBank/mock.html',
      keywords: ['sleep', 'study'],
      questionTypes: ['multiple_choice']
    }
  }
  const otherSummary = {
    ...summary,
    id: 'summary-related-question',
    questionId: 'related-question',
    title: 'Related Passage',
    htmlPath: undefined,
    content: 'Related summary content.',
    keywords: ['sleep', 'routine'],
    metadata: {
      ...summary.metadata,
      questionId: 'related-question',
      title: 'Related Passage',
      keywords: ['sleep', 'routine']
    }
  }
  const anotherSummary = {
    ...summary,
    id: 'summary-third-question',
    questionId: 'third-question',
    title: 'Third Passage',
    htmlPath: undefined,
    content: 'Third summary content.',
    keywords: ['hunter', 'sleep'],
    metadata: {
      ...summary.metadata,
      questionId: 'third-question',
      title: 'Third Passage',
      keywords: ['hunter', 'sleep']
    }
  }
  const chunk = {
    id: 'question-1',
    questionId: 'mock-question',
    title: 'Mock Passage',
    category: 'P1',
    difficulty: 'High',
    chunkType: 'question_item' as const,
    sensitive: false,
    questionNumbers: ['12'],
    paragraphLabels: ['B'],
    content: 'Question 12: Mock question.',
    sourcePath: '/questionBank/mock.html',
    metadata: {
      questionId: 'mock-question',
      title: 'Mock Passage',
      category: 'P1',
      difficulty: 'High',
      chunkType: 'question_item' as const,
      sensitive: false,
      questionNumbers: ['12'],
      paragraphLabels: ['B'],
      sourcePath: '/questionBank/mock.html',
      questionType: 'multiple_choice'
    }
  }
  const passageChunk = {
    id: 'passage-b',
    questionId: 'mock-question',
    title: 'Mock Passage',
    category: 'P1',
    difficulty: 'High',
    chunkType: 'passage_paragraph' as const,
    sensitive: false,
    questionNumbers: [] as string[],
    paragraphLabels: ['B'],
    content: 'Paragraph B explains how sleep was measured in the mock study.',
    sourcePath: '/questionBank/mock.html',
    metadata: {
      questionId: 'mock-question',
      title: 'Mock Passage',
      category: 'P1',
      difficulty: 'High',
      chunkType: 'passage_paragraph' as const,
      sensitive: false,
      questionNumbers: [] as string[],
      paragraphLabels: ['B'],
      sourcePath: '/questionBank/mock.html',
      questionType: 'multiple_choice'
    }
  }
  const document = {
    question,
    sourcePath: '/questionBank/mock.html',
    passageChunks: [passageChunk],
    questionChunks: [chunk],
    answerKeyChunks: [],
    answerExplanationChunks: [],
    summary,
    qualityReport: {
      questionId: 'mock-question',
      issues: []
    },
    allChunks: [chunk, passageChunk]
  }
  const relatedQuestion = {
    ...question,
    id: 'related-question',
    title: 'Related Passage',
    htmlPath: '/questionBank/related.html'
  }
  const thirdQuestion = {
    ...question,
    id: 'third-question',
    title: 'Third Passage',
    htmlPath: '/questionBank/third.html'
  }
  const relatedDocument = {
    ...document,
    question: relatedQuestion,
    sourcePath: relatedQuestion.htmlPath,
    summary: {
      ...otherSummary,
      sourcePath: relatedQuestion.htmlPath
    }
  }
  const thirdDocument = {
    ...document,
    question: thirdQuestion,
    sourcePath: thirdQuestion.htmlPath,
    summary: {
      ...anotherSummary,
      sourcePath: thirdQuestion.htmlPath
    }
  }

  return {
    question,
    relatedQuestion,
    thirdQuestion,
    summary,
    otherSummary,
    anotherSummary,
    document,
    relatedDocument,
    thirdDocument
  }
}

describe('assistant route integration', () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV }
    delete process.env.QDRANT_URL
    delete process.env.QDRANT_API_KEY
    process.env.LLM_PROVIDER = 'openrouter'
    process.env.LLM_API_KEY = 'test-key'
    process.env.LLM_BASE_URL = 'https://openrouter.ai/api/v1'
    process.env.LLM_CHAT_MODEL = 'openrouter/free'
    process.env.FRONTEND_ORIGIN = 'http://localhost:5175'
  })

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV }
    global.fetch = ORIGINAL_FETCH
    vi.restoreAllMocks()
  })

  it('serves hint responses with only LLM runtime config present', async () => {
    const mockBank = createMockQuestionBankModule()
    vi.doMock('../src/lib/question-bank/index.js', async (importOriginal) => {
      const actual = await importOriginal<typeof import('../src/lib/question-bank/index.js')>()
      return {
        ...actual,
        findQuestionIndexEntry: vi.fn(async () => mockBank.question),
        loadQuestionIndex: vi.fn(async () => [mockBank.question, mockBank.relatedQuestion, mockBank.thirdQuestion]),
        parseReadingNativeDocument: vi.fn(async () => null),
        parseQuestionDocument: vi.fn(async (entry: { id: string }) => {
          if (entry.id === mockBank.relatedQuestion.id) {
            return mockBank.relatedDocument
          }

          if (entry.id === mockBank.thirdQuestion.id) {
            return mockBank.thirdDocument
          }

          return mockBank.document
        })
      }
    })

    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        choices: [
          {
            message: {
              content: '{"answer":"Start with the paragraph that explains how sleep was measured.","followUps":["Look for the measurement paragraph.","Track the evidence sentence."]}'
            }
          }
        ]
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      })
    ) as typeof fetch

    const app = await createTestApp()
    try {
      const response = await app.inject({
        method: 'POST',
        url: '/api/assistant/query',
        payload: {
          questionId: 'mock-question',
          mode: 'hint',
          locale: 'en',
          userQuery: 'Where should I start?'
        }
      })

      expect(response.statusCode).toBe(200)
      const payload = response.json()
      expect(payload.answer).toContain('sleep was measured')
      expect(payload.citations.length).toBeGreaterThan(0)
      expect(payload.followUps).toEqual(['Look for the measurement paragraph.', 'Track the evidence sentence.'])
    } finally {
      await app.close()
    }
  }, 30_000)

  it('accepts structured attachments and focus question numbers in the request payload', async () => {
    const mockBank = createMockQuestionBankModule()
    vi.doMock('../src/lib/question-bank/index.js', async (importOriginal) => {
      const actual = await importOriginal<typeof import('../src/lib/question-bank/index.js')>()
      return {
        ...actual,
        findQuestionIndexEntry: vi.fn(async () => mockBank.question),
        loadQuestionIndex: vi.fn(async () => [mockBank.question, mockBank.relatedQuestion, mockBank.thirdQuestion]),
        parseReadingNativeDocument: vi.fn(async () => null),
        parseQuestionDocument: vi.fn(async () => mockBank.document)
      }
    })

    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify({
                answer: 'Use the uploaded notes as a reminder to compare Q12 with the evidence sentence.',
                answerSections: [
                  { type: 'direct_answer', text: 'Use the uploaded notes as a reminder to compare Q12 with the evidence sentence.' }
                ],
                followUps: ['Re-check Q12 against the passage evidence.'],
                confidence: 'high',
                missingContext: []
              })
            }
          }
        ]
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      })
    ) as typeof fetch

    const app = await createTestApp()
    try {
      const response = await app.inject({
        method: 'POST',
        url: '/api/assistant/query',
        payload: {
          questionId: 'mock-question',
          mode: 'hint',
          locale: 'en',
          userQuery: 'Use my notes for Q12.',
          focusQuestionNumbers: ['12'],
          attachments: [
            {
              name: 'notes.txt',
              type: 'text/plain',
              text: 'I keep mixing up the method sentence.',
              truncated: false
            }
          ],
          attemptContext: {
            selectedAnswers: { '12': 'A' },
            wrongQuestions: ['12'],
            submitted: false
          }
        }
      })

      expect(response.statusCode).toBe(200)
      const payload = response.json()
      expect(payload.answerSections?.[0]?.type).toBe('direct_answer')
      expect(payload.confidence).toBe('high')
      expect(global.fetch).toHaveBeenCalledOnce()
    } finally {
      await app.close()
    }
  }, 30_000)

  it('rejects invalid structured assistant payloads', async () => {
    const mockBank = createMockQuestionBankModule()
    vi.doMock('../src/lib/question-bank/index.js', async (importOriginal) => {
      const actual = await importOriginal<typeof import('../src/lib/question-bank/index.js')>()
      return {
        ...actual,
        findQuestionIndexEntry: vi.fn(async () => mockBank.question),
        loadQuestionIndex: vi.fn(async () => [mockBank.question]),
        parseReadingNativeDocument: vi.fn(async () => null),
        parseQuestionDocument: vi.fn(async () => mockBank.document)
      }
    })

    const app = await createTestApp()
    try {
      const response = await app.inject({
        method: 'POST',
        url: '/api/assistant/query',
        payload: {
          questionId: 'mock-question',
          mode: 'review',
          locale: 'en',
          attemptContext: {
            wrongQuestions: ['Q12']
          }
        }
      })

      expect(response.statusCode).toBe(400)
      expect(response.json().error).toBe('invalid_request')
    } finally {
      await app.close()
    }
  }, 30_000)

  it('keeps similar mode local and does not call the external provider', async () => {
    const mockBank = createMockQuestionBankModule()
    vi.doMock('../src/lib/question-bank/index.js', async (importOriginal) => {
      const actual = await importOriginal<typeof import('../src/lib/question-bank/index.js')>()
      return {
        ...actual,
        findQuestionIndexEntry: vi.fn(async () => mockBank.question),
        loadQuestionIndex: vi.fn(async () => [mockBank.question, mockBank.relatedQuestion, mockBank.thirdQuestion]),
        parseReadingNativeDocument: vi.fn(async () => null),
        parseQuestionDocument: vi.fn(async (entry: { id: string }) => {
          if (entry.id === mockBank.relatedQuestion.id) {
            return mockBank.relatedDocument
          }

          if (entry.id === mockBank.thirdQuestion.id) {
            return mockBank.thirdDocument
          }

          return mockBank.document
        })
      }
    })

    global.fetch = vi.fn(() => {
      throw new Error('fetch should not be called for similar mode')
    }) as typeof fetch

    const app = await createTestApp()
    try {
      const response = await app.inject({
        method: 'POST',
        url: '/api/assistant/query',
        payload: {
          questionId: 'mock-question',
          mode: 'similar',
          locale: 'en',
          userQuery: 'Recommend similar passages.'
        }
      })

      expect(response.statusCode).toBe(200)
      const payload = response.json()
      expect(payload.recommendedQuestions).toBeDefined()
      expect(payload.recommendedQuestions.length).toBeGreaterThan(0)
      expect(global.fetch).not.toHaveBeenCalled()
    } finally {
      await app.close()
    }
  }, 30_000)
})
