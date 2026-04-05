import { describe, expect, it, vi } from 'vitest'
import { AssistantService, parseModelResponse } from '../src/lib/assistant/service.js'
import type { AssistantSemanticSearch } from '../src/lib/assistant/semantic.js'
import type { ParsedQuestionDocument, QuestionIndexEntry, QuestionSummaryDoc, RagChunk } from '../src/types/question-bank.js'

function createChunk(overrides: Partial<RagChunk>): RagChunk {
  const chunkType = overrides.chunkType ?? 'question_item'
  const questionId = overrides.questionId ?? 'eval-question'
  const title = overrides.title ?? 'Eval Passage'
  const category = overrides.category ?? 'P1'
  const difficulty = overrides.difficulty ?? 'High'
  const questionNumbers = overrides.questionNumbers ?? ['12']
  const paragraphLabels = overrides.paragraphLabels ?? ['B']
  const sourcePath = overrides.sourcePath ?? '/questionBank/eval.html'

  return {
    id: overrides.id ?? `${chunkType}-${questionNumbers.join('-') || 'base'}`,
    questionId,
    title,
    category,
    difficulty,
    chunkType,
    sensitive: overrides.sensitive ?? false,
    questionNumbers,
    paragraphLabels,
    content: overrides.content ?? 'Sample chunk content.',
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

function createQuestion(overrides: Partial<QuestionIndexEntry> = {}): QuestionIndexEntry {
  return {
    id: overrides.id ?? 'eval-question',
    title: overrides.title ?? 'Eval Passage',
    category: overrides.category ?? 'P1',
    difficulty: overrides.difficulty ?? 'High',
    htmlPath: overrides.htmlPath ?? '/questionBank/eval.html'
  }
}

function createSummary(question: QuestionIndexEntry, overrides: Partial<QuestionSummaryDoc> = {}): QuestionSummaryDoc {
  return {
    id: overrides.id ?? `summary-${question.id}`,
    questionId: overrides.questionId ?? question.id,
    title: overrides.title ?? question.title,
    category: overrides.category ?? question.category,
    difficulty: overrides.difficulty ?? question.difficulty,
    topicSummary: overrides.topicSummary ?? 'A short IELTS reading summary.',
    keywords: overrides.keywords ?? ['sleep', 'study'],
    questionTypes: overrides.questionTypes ?? ['multiple_choice'],
    content: overrides.content ?? 'Summary content about sleep and field studies.',
    sourcePath: overrides.sourcePath ?? question.htmlPath,
    metadata: {
      questionId: overrides.questionId ?? question.id,
      title: overrides.title ?? question.title,
      category: overrides.category ?? question.category,
      difficulty: overrides.difficulty ?? question.difficulty,
      sourcePath: overrides.sourcePath ?? question.htmlPath,
      keywords: overrides.keywords ?? ['sleep', 'study'],
      questionTypes: overrides.questionTypes ?? ['multiple_choice']
    }
  }
}

function createDocument(question: QuestionIndexEntry, overrides: Partial<ParsedQuestionDocument> = {}): ParsedQuestionDocument {
  const questionChunk12 = createChunk({
    id: 'question-12',
    questionId: question.id,
    title: question.title,
    category: question.category,
    difficulty: question.difficulty,
    chunkType: 'question_item',
    questionNumbers: ['12'],
    paragraphLabels: ['B'],
    content: 'Question 12: Which paragraph explains how the study measured sleep duration?'
  })
  const questionChunk13 = createChunk({
    id: 'question-13',
    questionId: question.id,
    title: question.title,
    category: question.category,
    difficulty: question.difficulty,
    chunkType: 'question_item',
    questionNumbers: ['13'],
    paragraphLabels: ['C'],
    content: 'Question 13: Which finding contrasts modern urban sleep with hunter-gatherer sleep?'
  })
  const passageChunkB = createChunk({
    id: 'passage-b',
    questionId: question.id,
    title: question.title,
    category: question.category,
    difficulty: question.difficulty,
    chunkType: 'passage_paragraph',
    questionNumbers: [],
    paragraphLabels: ['B'],
    content: 'Paragraph B explains how the researchers measured sleep duration in hunter-gatherer communities.'
  })
  const passageChunkC = createChunk({
    id: 'passage-c',
    questionId: question.id,
    title: question.title,
    category: question.category,
    difficulty: question.difficulty,
    chunkType: 'passage_paragraph',
    questionNumbers: [],
    paragraphLabels: ['C'],
    content: 'Paragraph C contrasts segmented urban sleep with more stable sleep timing in hunter-gatherer groups.'
  })
  const answerKey12 = createChunk({
    id: 'answer-key-12',
    questionId: question.id,
    title: question.title,
    category: question.category,
    difficulty: question.difficulty,
    chunkType: 'answer_key',
    questionNumbers: ['12'],
    paragraphLabels: ['B'],
    content: 'Correct answer: B'
  })
  const answerExplanation12 = createChunk({
    id: 'answer-explanation-12',
    questionId: question.id,
    title: question.title,
    category: question.category,
    difficulty: question.difficulty,
    chunkType: 'answer_explanation',
    questionNumbers: ['12'],
    paragraphLabels: ['B'],
    content: [
      'Question 12',
      'Paragraph: B',
      'Correct answer: B',
      'Explanation: Paragraph B describes the measurement method directly.',
      'Evidence: The researchers measured sleep duration in hunter-gatherer communities.'
    ].join('\n')
  })

  const baseDocument: ParsedQuestionDocument = {
    question,
    sourcePath: question.htmlPath,
    passageChunks: [passageChunkB, passageChunkC],
    questionChunks: [questionChunk12, questionChunk13],
    answerKeyChunks: [answerKey12],
    answerExplanationChunks: [answerExplanation12],
    summary: createSummary(question),
    qualityReport: {
      questionId: question.id,
      issues: []
    },
    allChunks: [questionChunk12, questionChunk13, passageChunkB, passageChunkC, answerKey12, answerExplanation12]
  }

  return {
    ...baseDocument,
    ...overrides,
    summary: overrides.summary ?? baseDocument.summary
  }
}

describe('assistant eval suite', () => {
  const question = createQuestion()
  const document = createDocument(question)

  it('parses strict JSON into structured answer sections', () => {
    const parsed = parseModelResponse(
      JSON.stringify({
        answer: 'Start with the measurement paragraph.',
        answerSections: [
          { type: 'direct_answer', text: 'Start with the measurement paragraph.' },
          { type: 'evidence', text: 'Look for the sentence describing how sleep duration was measured.' }
        ],
        followUps: ['Compare the method sentence with the stem.'],
        confidence: 'high',
        missingContext: []
      }),
      'hint',
      'en'
    )

    expect(parsed.parseStrategy).toBe('json')
    expect(parsed.answerSections).toHaveLength(2)
    expect(parsed.confidence).toBe('high')
  })

  it('salvages malformed JSON-like output', () => {
    const parsed = parseModelResponse(
      '{"answer":"TRUE"\n"followUps":["Check the supporting sentence again."]}',
      'hint',
      'en'
    )

    expect(parsed.parseStrategy).toBe('salvaged')
    expect(parsed.answer).toBe('TRUE')
    expect(parsed.followUps).toEqual(['Check the supporting sentence again.'])
  })

  it('masks paragraph labels in hint mode when the label is the answer space', async () => {
    const paragraphMatchingQuestion = createChunk({
      id: 'paragraph-question',
      questionId: question.id,
      title: question.title,
      category: question.category,
      difficulty: question.difficulty,
      chunkType: 'question_item',
      questionNumbers: ['1'],
      paragraphLabels: ['B'],
      content: 'Question 1: Which paragraph contains the description of the measurement method?',
      metadata: {
        questionType: 'paragraph_matching'
      } as RagChunk['metadata']
    })
    const paragraphDocument = createDocument(question, {
      questionChunks: [paragraphMatchingQuestion],
      allChunks: [paragraphMatchingQuestion, document.passageChunks[0]]
    })

    const service = new AssistantService({
      provider: null,
      questionLoader: async () => question,
      documentLoader: async () => paragraphDocument,
      summariesLoader: async () => [paragraphDocument.summary]
    })

    const response = await service.query({
      questionId: question.id,
      mode: 'hint',
      locale: 'en',
      userQuery: 'Give me a hint for Q1.'
    })

    expect(response.answer).not.toMatch(/paragraph\s+B/i)
    expect(response.usedParagraphLabels ?? []).toHaveLength(0)
    expect(response.citations.every((citation) => (citation.paragraphLabels ?? []).length === 0)).toBe(true)
  })

  it('reports missing context when hint evidence is incomplete', async () => {
    const questionOnlyDocument = createDocument(question, {
      passageChunks: [],
      allChunks: document.questionChunks
    })

    const service = new AssistantService({
      provider: null,
      questionLoader: async () => question,
      documentLoader: async () => questionOnlyDocument,
      summariesLoader: async () => [questionOnlyDocument.summary]
    })

    const response = await service.query({
      questionId: question.id,
      mode: 'hint',
      locale: 'en',
      userQuery: 'Where should I look first?'
    })

    expect(response.missingContext?.length).toBeGreaterThan(0)
    expect(response.confidence).toBe('medium')
  })

  it('sanitizes provider hints that try to reveal the paragraph label directly', async () => {
    const paragraphMatchingQuestion = createChunk({
      id: 'paragraph-question-provider',
      questionId: question.id,
      title: question.title,
      category: question.category,
      difficulty: question.difficulty,
      chunkType: 'question_item',
      questionNumbers: ['1'],
      paragraphLabels: ['B'],
      content: 'Question 1: Which paragraph contains the description of the measurement method?',
      metadata: {
        questionType: 'paragraph_matching'
      } as RagChunk['metadata']
    })
    const paragraphDocument = createDocument(question, {
      questionChunks: [paragraphMatchingQuestion],
      allChunks: [paragraphMatchingQuestion, document.passageChunks[0]]
    })

    const service = new AssistantService({
      provider: {
        generate: vi.fn().mockResolvedValue('{"answer":"The answer is paragraph B.","answerSections":[{"type":"direct_answer","text":"The answer is paragraph B."}],"followUps":["Check paragraph B first."],"confidence":"high","missingContext":[]}')      },
      questionLoader: async () => question,
      documentLoader: async () => paragraphDocument,
      summariesLoader: async () => [paragraphDocument.summary]
    })

    const response = await service.query({
      questionId: question.id,
      mode: 'hint',
      locale: 'en',
      userQuery: 'Give me a hint for Q1.'
    })

    expect(response.answer).not.toMatch(/paragraph\s+B/i)
    expect(response.followUps.join(' ')).not.toMatch(/paragraph\s+B/i)
  })

  it('covers multi-question explain requests without collapsing to one item', async () => {
    const service = new AssistantService({
      provider: null,
      questionLoader: async () => question,
      documentLoader: async () => document,
      summariesLoader: async () => [document.summary]
    })

    const response = await service.query({
      questionId: question.id,
      mode: 'explain',
      locale: 'en',
      userQuery: 'Explain Q12 and Q13 together.',
      focusQuestionNumbers: ['12', '13']
    })

    expect(response.usedQuestionNumbers).toEqual(expect.arrayContaining(['12', '13']))
    expect(response.answer).toContain('Q12, 13')
  })

  it('keeps draft review context before submission', async () => {
    const service = new AssistantService({
      provider: null,
      questionLoader: async () => question,
      documentLoader: async () => document,
      summariesLoader: async () => [document.summary]
    })

    const response = await service.query({
      questionId: question.id,
      mode: 'review',
      locale: 'en',
      userQuery: 'Check Q12 before I submit.',
      attemptContext: {
        selectedAnswers: { '12': 'A' },
        wrongQuestions: ['12'],
        submitted: false
      }
    })

    expect(response.reviewItems?.[0]?.selectedAnswer).toBe('A')
    expect(response.answer).toContain('Based on your current draft')
  })

  it('keeps submitted review wording distinct from draft review wording', async () => {
    const service = new AssistantService({
      provider: null,
      questionLoader: async () => question,
      documentLoader: async () => document,
      summariesLoader: async () => [document.summary]
    })

    const response = await service.query({
      questionId: question.id,
      mode: 'review',
      locale: 'en',
      userQuery: 'Review my submitted mistake.',
      attemptContext: {
        selectedAnswers: { '12': 'A' },
        wrongQuestions: ['12'],
        submitted: true
      }
    })

    expect(response.answer).toContain('For this reviewed mistake')
  })

  it('deprioritizes recently practiced similar passages', async () => {
    const relatedQuestion = createQuestion({ id: 'related-question', title: 'Related Passage', htmlPath: '/questionBank/related.html' })
    const thirdQuestion = createQuestion({ id: 'third-question', title: 'Third Passage', htmlPath: '/questionBank/third.html' })
    const relatedSummary = createSummary(relatedQuestion, {
      questionId: relatedQuestion.id,
      title: relatedQuestion.title,
      keywords: ['sleep', 'study']
    })
    const thirdSummary = createSummary(thirdQuestion, {
      questionId: thirdQuestion.id,
      title: thirdQuestion.title,
      keywords: ['sleep', 'hunter']
    })

    const service = new AssistantService({
      provider: null,
      questionLoader: async () => question,
      documentLoader: async () => document,
      summariesLoader: async () => [document.summary, relatedSummary, thirdSummary]
    })

    const response = await service.query({
      questionId: question.id,
      mode: 'similar',
      locale: 'en',
      recentPractice: [
        { questionId: 'related-question', accuracy: 95, category: 'P1', duration: 600 }
      ]
    })

    expect(response.recommendedQuestions?.[0]?.questionId).toBe('third-question')
  })

  it('boosts weaker recent categories in similar recommendations', async () => {
    const sameCategoryQuestion = createQuestion({ id: 'same-category', title: 'Same Category Passage', htmlPath: '/questionBank/same-category.html' })
    const weakCategoryQuestion = createQuestion({ id: 'weak-category', title: 'Weak Category Passage', category: 'P2', htmlPath: '/questionBank/weak-category.html' })
    const sameCategorySummary = createSummary(sameCategoryQuestion, {
      questionId: sameCategoryQuestion.id,
      title: sameCategoryQuestion.title,
      category: 'P1',
      keywords: ['sleep'],
      questionTypes: ['multiple_choice']
    })
    const weakCategorySummary = createSummary(weakCategoryQuestion, {
      questionId: weakCategoryQuestion.id,
      title: weakCategoryQuestion.title,
      category: 'P2',
      keywords: ['sleep'],
      questionTypes: ['multiple_choice']
    })

    const service = new AssistantService({
      provider: null,
      questionLoader: async () => question,
      documentLoader: async () => document,
      summariesLoader: async () => [document.summary, sameCategorySummary, weakCategorySummary]
    })

    const response = await service.query({
      questionId: question.id,
      mode: 'similar',
      locale: 'en',
      recentPractice: [
        { questionId: 'old-p2', accuracy: 20, category: 'P2', duration: 900 },
        { questionId: 'old-p3', accuracy: 55, category: 'P3', duration: 750 },
        { questionId: 'old-p1', accuracy: 95, category: 'P1', duration: 600 }
      ]
    })

    expect(response.recommendedQuestions?.[0]?.questionId).toBe('weak-category')
  })

  it('falls back cleanly when semantic chunk retrieval fails', async () => {
    const semanticSearch: AssistantSemanticSearch = {
      searchChunks: vi.fn(async () => {
        throw new Error('qdrant unavailable')
      }),
      searchSummaries: vi.fn(async () => [])
    }

    const service = new AssistantService({
      provider: null,
      questionLoader: async () => question,
      documentLoader: async () => document,
      summariesLoader: async () => [document.summary],
      semanticSearch,
      logger: {
        warn: vi.fn(),
        info: vi.fn()
      }
    })

    const response = await service.query({
      questionId: question.id,
      mode: 'hint',
      locale: 'en',
      userQuery: 'Help with Q12.'
    })

    expect(response.citations.length).toBeGreaterThan(0)
    expect(semanticSearch.searchChunks).toHaveBeenCalledOnce()
  })

  it('uses semantic chunk matches to enrich the grounded context', async () => {
    const sparseDocument = createDocument(question, {
      passageChunks: [],
      allChunks: document.questionChunks
    })
    const semanticPassage = createChunk({
      id: 'semantic-passage',
      questionId: question.id,
      title: question.title,
      category: question.category,
      difficulty: question.difficulty,
      chunkType: 'passage_paragraph',
      questionNumbers: [],
      paragraphLabels: ['B'],
      content: 'Paragraph B explains the exact sleep measurement procedure used in the field study.'
    })
    const semanticSearch: AssistantSemanticSearch = {
      searchChunks: vi.fn(async () => [semanticPassage]),
      searchSummaries: vi.fn(async () => [])
    }

    const service = new AssistantService({
      provider: null,
      questionLoader: async () => question,
      documentLoader: async () => sparseDocument,
      summariesLoader: async () => [sparseDocument.summary],
      semanticSearch
    })

    const response = await service.query({
      questionId: question.id,
      mode: 'explain',
      locale: 'en',
      userQuery: 'Explain Q12.'
    })

    expect(response.citations.some((citation) => citation.excerpt.includes('sleep measurement procedure'))).toBe(true)
    expect(response.usedParagraphLabels).toEqual(expect.arrayContaining(['B']))
  })

  it('falls back to the local response when the provider errors and keeps citations grounded', async () => {
    const service = new AssistantService({
      provider: {
        generate: vi.fn().mockRejectedValue(new Error('timeout'))
      },
      questionLoader: async () => question,
      documentLoader: async () => document,
      summariesLoader: async () => [document.summary],
      logger: {
        warn: vi.fn(),
        info: vi.fn()
      }
    })

    const response = await service.query({
      questionId: question.id,
      mode: 'explain',
      locale: 'en',
      userQuery: 'Explain Q12.'
    })

    expect(response.answerSections?.length).toBeGreaterThan(0)
    expect(response.citations.length).toBeGreaterThan(0)
  })
})
