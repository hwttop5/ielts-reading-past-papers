import { describe, expect, it, vi } from 'vitest'
import { AssistantService, parseModelResponse } from '../src/lib/assistant/service.js'
import type { QuestionIndexEntry, ParsedQuestionDocument, RagChunk, QuestionSummaryDoc } from '../src/types/question-bank.js'

function createChunk(overrides: Partial<RagChunk>): RagChunk {
  const chunkType = overrides.chunkType ?? 'question_item'
  const questionId = overrides.questionId ?? 'sample-question'
  const title = overrides.title ?? 'Sample Passage'
  const category = overrides.category ?? 'P1'
  const difficulty = overrides.difficulty ?? 'High'
  const questionNumbers = overrides.questionNumbers ?? ['12']
  const paragraphLabels = overrides.paragraphLabels ?? ['B']
  const sourcePath = overrides.sourcePath ?? '/questionBank/sample.html'

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

function createSummary(question: QuestionIndexEntry): QuestionSummaryDoc {
  return {
    id: `summary-${question.id}`,
    questionId: question.id,
    title: question.title,
    category: question.category,
    difficulty: question.difficulty,
    topicSummary: 'A short summary',
    keywords: ['sleep', 'study'],
    questionTypes: ['multiple_choice'],
    content: 'Summary content about the sample passage.',
    sourcePath: question.htmlPath,
    metadata: {
      questionId: question.id,
      title: question.title,
      category: question.category,
      difficulty: question.difficulty,
      sourcePath: question.htmlPath,
      keywords: ['sleep', 'study'],
      questionTypes: ['multiple_choice']
    }
  }
}

function createDocument(question: QuestionIndexEntry): ParsedQuestionDocument {
  const questionChunk = createChunk({
    id: 'question-1',
    chunkType: 'question_item',
    questionId: question.id,
    title: question.title,
    category: question.category,
    difficulty: question.difficulty,
    content: 'Question 12: Which paragraph explains the core finding?'
  })
  const passageChunk = createChunk({
    id: 'passage-1',
    chunkType: 'passage_paragraph',
    questionId: question.id,
    title: question.title,
    category: question.category,
    difficulty: question.difficulty,
    content: 'Paragraph B explains how the study measured sleep duration in hunter-gatherer communities.'
  })
  const answerKeyChunk = createChunk({
    id: 'answer-key-1',
    chunkType: 'answer_key',
    questionId: question.id,
    title: question.title,
    category: question.category,
    difficulty: question.difficulty,
    content: 'Correct answer: B'
  })
  const answerExplanationChunk = createChunk({
    id: 'answer-explanation-1',
    chunkType: 'answer_explanation',
    questionId: question.id,
    title: question.title,
    category: question.category,
    difficulty: question.difficulty,
    content: [
      'Question 12',
      'Paragraph: B',
      'Correct answer: B',
      'Explanation: Paragraph B describes the exact measurement method used in the study.',
      'Evidence: The researchers tracked the sleep duration of modern hunter-gatherer groups.'
    ].join('\n')
  })

  return {
    question,
    sourcePath: question.htmlPath,
    passageChunks: [passageChunk],
    questionChunks: [questionChunk],
    answerKeyChunks: [answerKeyChunk],
    answerExplanationChunks: [answerExplanationChunk],
    summary: createSummary(question),
    qualityReport: {
      questionId: question.id,
      issues: []
    },
    allChunks: [passageChunk, questionChunk, answerKeyChunk, answerExplanationChunk]
  }
}

describe('AssistantService', () => {
  const question: QuestionIndexEntry = {
    id: 'sample-question',
    title: 'Sample Passage',
    category: 'P1',
    difficulty: 'High',
    htmlPath: '/questionBank/sample.html'
  }
  const document = createDocument(question)

  it('uses the provider response when wrapped JSON is returned', async () => {
    const provider = {
      generate: vi.fn().mockResolvedValue('```json\n{"answer":"Start with paragraph B.","followUps":["Check paragraph B first.","Track the measurement method."]}\n```')
    }
    const service = new AssistantService({
      provider,
      questionLoader: async () => question,
      documentLoader: async () => document,
      summariesLoader: async () => [document.summary]
    })

    const response = await service.query({
      questionId: question.id,
      mode: 'hint',
      locale: 'en',
      userQuery: 'Where should I start?'
    })

    expect(response.answer).toBe('Start with paragraph B.')
    expect(response.followUps).toEqual(['Check paragraph B first.', 'Track the measurement method.'])
    expect(response.citations.length).toBeGreaterThan(0)
    expect(provider.generate).toHaveBeenCalledOnce()
  })

  it('salvages answer fields from loose JSON-like model output', () => {
    const parsed = parseModelResponse(
      '{"answer":"TRUE"\n"followUps":["回顾前文，确认 assumed to be similar 的含义"]}',
      'hint',
      'zh'
    )

    expect(parsed.answer).toBe('TRUE')
    expect(parsed.followUps).toEqual(['回顾前文，确认 assumed to be similar 的含义'])
  })

  it('falls back to the local deterministic response when the provider fails', async () => {
    const service = new AssistantService({
      provider: {
        generate: vi.fn().mockRejectedValue(new Error('rate limited'))
      },
      logger: {
        warn: vi.fn()
      },
      questionLoader: async () => question,
      documentLoader: async () => document,
      summariesLoader: async () => [document.summary]
    })

    const response = await service.query({
      questionId: question.id,
      mode: 'hint',
      locale: 'en',
      userQuery: 'Where should I start?'
    })

    expect(response.answer).toContain('start with Q12')
    expect(response.followUps).toHaveLength(3)
  })

  it('returns provider-generated review text while keeping local review cards', async () => {
    const service = new AssistantService({
      provider: {
        generate: vi.fn().mockResolvedValue('{"answer":"Your mistake was choosing a paragraph that mentioned sleep generally instead of the measurement method in paragraph B.","followUps":["Re-read paragraph B.","Compare the stem with the method sentence."]}')
      },
      questionLoader: async () => question,
      documentLoader: async () => document,
      summariesLoader: async () => [document.summary]
    })

    const response = await service.query({
      questionId: question.id,
      mode: 'review',
      locale: 'en',
      userQuery: 'Why was I wrong?',
      attemptContext: {
        wrongQuestions: ['12'],
        selectedAnswers: { '12': 'A' },
        score: 1
      }
    })

    expect(response.answer).toContain('paragraph B')
    expect(response.reviewItems).toHaveLength(1)
    expect(response.reviewItems?.[0]?.correctAnswer).toBe('B')
    expect(response.followUps).toEqual(['Re-read paragraph B.', 'Compare the stem with the method sentence.'])
  })

  it('adds passage context when the question chunk does not reference a paragraph label', async () => {
    const provider = {
      generate: vi.fn().mockResolvedValue('{"answer":"Start from paragraph B and compare the assumption carefully.","followUps":["Check paragraph B first."]}')
    }

    const questionOnlyChunk = createChunk({
      id: 'question-without-paragraph',
      chunkType: 'question_item',
      questionId: question.id,
      title: question.title,
      category: question.category,
      difficulty: question.difficulty,
      questionNumbers: ['1'],
      paragraphLabels: [],
      content: [
        'Question 1',
        'Prompt:',
        'Scientists studied hunter-gatherer societies because their sleep patterns are assumed to be similar to those of humans more than 10,000 years ago.',
        'TRUE',
        'FALSE',
        'NOT GIVEN'
      ].join('\n'),
      metadata: {
        questionType: 'radio_choice'
      } as RagChunk['metadata']
    })

    const unrelatedPassage = createChunk({
      id: 'passage-a',
      chunkType: 'passage_paragraph',
      questionId: question.id,
      title: question.title,
      category: question.category,
      difficulty: question.difficulty,
      questionNumbers: [],
      paragraphLabels: ['A'],
      content: 'Paragraph A describes why industrial societies often sleep in darker rooms.'
    })

    const relevantPassage = createChunk({
      id: 'passage-b',
      chunkType: 'passage_paragraph',
      questionId: question.id,
      title: question.title,
      category: question.category,
      difficulty: question.difficulty,
      questionNumbers: [],
      paragraphLabels: ['B'],
      content: 'Paragraph B states that these societies are thought to sleep the way humans did more than 10,000 years ago.'
    })

    const customDocument: ParsedQuestionDocument = {
      ...document,
      questionChunks: [questionOnlyChunk],
      passageChunks: [unrelatedPassage, relevantPassage],
      allChunks: [questionOnlyChunk, unrelatedPassage, relevantPassage]
    }

    const service = new AssistantService({
      provider,
      questionLoader: async () => question,
      documentLoader: async () => customDocument,
      summariesLoader: async () => [customDocument.summary]
    })

    const response = await service.query({
      questionId: question.id,
      mode: 'hint',
      locale: 'en',
      userQuery: 'Where should I look first?'
    })

    expect(response.citations.some((citation) => citation.chunkType === 'passage_paragraph')).toBe(true)
    expect(provider.generate).toHaveBeenCalledOnce()

    const promptArg = provider.generate.mock.calls[0]?.[0]
    expect(promptArg.user).toContain('Paragraph B states')
  })
})
