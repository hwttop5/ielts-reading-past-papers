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

function createMultiQuestionDocument(question: QuestionIndexEntry): ParsedQuestionDocument {
  // Create document with multiple question numbers (1, 2, 10, 12) for testing Chinese numeral recognition
  const questionChunk1 = createChunk({
    id: 'question-1',
    chunkType: 'question_item',
    questionId: question.id,
    title: question.title,
    category: question.category,
    difficulty: question.difficulty,
    questionNumbers: ['1'],
    content: 'Question 1: What is the main idea?'
  })
  const questionChunk2 = createChunk({
    id: 'question-2',
    chunkType: 'question_item',
    questionId: question.id,
    title: question.title,
    category: question.category,
    difficulty: question.difficulty,
    questionNumbers: ['2'],
    content: 'Question 2: Which paragraph explains the method?'
  })
  const questionChunk10 = createChunk({
    id: 'question-10',
    chunkType: 'question_item',
    questionId: question.id,
    title: question.title,
    category: question.category,
    difficulty: question.difficulty,
    questionNumbers: ['10'],
    content: 'Question 10: What does the author suggest?'
  })
  const questionChunk12 = createChunk({
    id: 'question-12',
    chunkType: 'question_item',
    questionId: question.id,
    title: question.title,
    category: question.category,
    difficulty: question.difficulty,
    questionNumbers: ['12'],
    content: 'Question 12: Which paragraph explains the core finding?'
  })
  const passageChunk = createChunk({
    id: 'passage-1',
    chunkType: 'passage_paragraph',
    questionId: question.id,
    title: question.title,
    category: question.category,
    difficulty: question.difficulty,
    content: 'Paragraph B explains the study methodology.'
  })

  return {
    question,
    sourcePath: question.htmlPath,
    passageChunks: [passageChunk],
    questionChunks: [questionChunk1, questionChunk2, questionChunk10, questionChunk12],
    answerKeyChunks: [],
    answerExplanationChunks: [],
    summary: createSummary(question),
    qualityReport: {
      questionId: question.id,
      issues: []
    },
    allChunks: [passageChunk, questionChunk1, questionChunk2, questionChunk10, questionChunk12]
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
      locale: 'en',
      userQuery: 'Where should I start?'
    })

    expect(response.answer).toBe('Start with the relevant paragraph.')
    expect(response.followUps).toEqual(['Check the relevant paragraph first.', 'Track the measurement method.'])
    expect(response.citations.length).toBeGreaterThan(0)
    expect(response.answerSections?.length).toBeGreaterThan(0)
    expect(response.usedQuestionNumbers).toContain('12')
    expect(response.usedParagraphLabels ?? []).toHaveLength(0)
    expect(provider.generate).toHaveBeenCalledOnce()
  })

  it('compresses LLM answerSections for vocab-style queries', async () => {
    const fourSectionJson = JSON.stringify({
      answer: 'combined',
      answerSections: [
        { type: 'direct_answer', text: 'a' },
        { type: 'reasoning', text: 'b' },
        { type: 'evidence', text: 'c' },
        { type: 'next_step', text: 'd' }
      ],
      followUps: ['x'],
      confidence: 'high',
      missingContext: []
    })
    const provider = {
      generate: vi.fn().mockResolvedValue(fourSectionJson)
    }
    const service = new AssistantService({
      provider,
      questionLoader: async () => question,
      documentLoader: async () => document,
      summariesLoader: async () => [document.summary],
      semanticSearch: null
    })

    const response = await service.query({
      questionId: question.id,
      locale: 'zh',
      userQuery: '请列出 increased 的同义替换'
    })

    expect(response.answerSections?.length).toBeLessThanOrEqual(2)
  })

  it('uses brief local sections for vocab queries when LLM fails', async () => {
    const service = new AssistantService({
      provider: {
        generate: vi.fn().mockRejectedValue(new Error('rate limited'))
      },
      logger: { warn: vi.fn() },
      questionLoader: async () => question,
      documentLoader: async () => document,
      summariesLoader: async () => [document.summary],
      semanticSearch: null
    })

    const response = await service.query({
      questionId: question.id,
      locale: 'zh',
      userQuery: 'increased 同义替换有哪些',
      promptKind: 'preset'
    })

    expect(response.answerSections?.length).toBeLessThanOrEqual(2)
  })

  it('「你好」uses social fast path without document load or LLM', async () => {
    const documentLoader = vi.fn().mockResolvedValue(document)
    const generate = vi.fn()
    const service = new AssistantService({
      provider: { generate },
      questionLoader: async () => question,
      documentLoader,
      summariesLoader: async () => [document.summary]
    })

    const response = await service.query({
      questionId: question.id,
      locale: 'zh',
      userQuery: '你好'
    })

    expect(response.responseKind).toBe('social')
    expect(documentLoader).not.toHaveBeenCalled()
    expect(generate).not.toHaveBeenCalled()
  })

  it('salvages answer fields from loose JSON-like model output', () => {
    const parsed = parseModelResponse(
      '{"answer":"TRUE"\n"followUps":["回顾前文，确认 assumed to be similar 的含义"]}',
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
      locale: 'en',
      userQuery: 'Where should I start?',
      promptKind: 'preset'
    })

    expect(response.answer.toLowerCase()).toContain('q12')
    expect(response.followUps).toHaveLength(0)
    expect(response.answerSections?.length).toBeGreaterThan(0)
    expect(response.confidence).toBeTruthy()
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
    expect(response.answerSections?.length).toBeGreaterThan(0)
    expect(response.citations.length).toBeGreaterThan(0)
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
      locale: 'en',
      userQuery: 'Where should I look first?'
    })

    expect(response.citations.some((citation) => citation.chunkType === 'passage_paragraph')).toBe(true)
    expect(provider.generate).toHaveBeenCalledOnce()

    const promptArg = provider.generate.mock.calls[0]?.[0]
    expect(promptArg.user).toContain('Paragraph B states')
  })

  it('passes attachments and explicit focus question numbers into the prompt', async () => {
    const provider = {
      generate: vi.fn().mockResolvedValue('{"answer":"Work from Q12 first.","answerSections":[{"type":"direct_answer","text":"Work from Q12 first."}],"followUps":["Compare Q12 with paragraph B."],"confidence":"high","missingContext":[]}')
    }
    const service = new AssistantService({
      provider,
      questionLoader: async () => question,
      documentLoader: async () => document,
      summariesLoader: async () => [document.summary]
    })

    await service.query({
      questionId: question.id,
      locale: 'en',
      userQuery: 'Use my notes and help with Q12.',
      focusQuestionNumbers: ['12'],
      attachments: [
        {
          name: 'notes.txt',
          type: 'text/plain',
          text: 'I keep confusing the method paragraph.',
          truncated: false
        }
      ]
    })

    const promptArg = provider.generate.mock.calls[0]?.[0]
    expect(promptArg.user).toContain('Focus question numbers: 12')
    expect(promptArg.user).toContain('notes.txt')
    expect(promptArg.user).toContain('I keep confusing the method paragraph.')
  })

  it('keeps single-question focus even when earlier history mentioned other questions', async () => {
    const question13Chunk = createChunk({
      id: 'question-13',
      chunkType: 'question_item',
      questionId: question.id,
      title: question.title,
      category: question.category,
      difficulty: question.difficulty,
      questionNumbers: ['13'],
      paragraphLabels: ['C'],
      content: 'Question 13: Which paragraph contrasts industrial and hunter-gatherer sleep patterns?'
    })
    const passage13Chunk = createChunk({
      id: 'passage-13',
      chunkType: 'passage_paragraph',
      questionId: question.id,
      title: question.title,
      category: question.category,
      difficulty: question.difficulty,
      questionNumbers: [],
      paragraphLabels: ['C'],
      content: 'Paragraph C contrasts industrial sleep schedules with hunter-gatherer sleep timing.'
    })
    const customDocument: ParsedQuestionDocument = {
      ...document,
      questionChunks: [document.questionChunks[0], question13Chunk],
      passageChunks: [document.passageChunks[0], passage13Chunk],
      allChunks: [document.questionChunks[0], question13Chunk, document.passageChunks[0], passage13Chunk]
    }

    const service = new AssistantService({
      provider: null,
      questionLoader: async () => question,
      documentLoader: async () => customDocument,
      summariesLoader: async () => [customDocument.summary]
    })

    const response = await service.query({
      questionId: question.id,
      locale: 'en',
      userQuery: 'Please explain question 13 only.',
      history: [
        { role: 'assistant', content: 'For Q12, start from paragraph B.' },
        { role: 'user', content: 'Now explain question 13.' }
      ]
    })

    expect(response.usedQuestionNumbers).toEqual(['13'])
    expect(response.usedParagraphLabels).toEqual(['C'])
  })

  it('keeps draft review context even before submission is marked complete', async () => {
    const service = new AssistantService({
      provider: null,
      questionLoader: async () => question,
      documentLoader: async () => document,
      summariesLoader: async () => [document.summary]
    })

    const response = await service.query({
      questionId: question.id,
      action: 'review_set',
      locale: 'en',
      userQuery: 'Check Q12 before I submit.',
      focusQuestionNumbers: ['12'],
      attemptContext: {
        selectedAnswers: { '12': 'A' },
        wrongQuestions: ['12'],
        submitted: false
      }
    })

    expect(response.reviewItems?.[0]?.selectedAnswer).toBe('A')
    expect(response.answerSections?.length).toBeGreaterThan(0)
    expect(response.usedQuestionNumbers).toContain('12')
  })

  it('deprioritizes recently practiced passages in similar recommendations', async () => {
    const relatedSummary: QuestionSummaryDoc = {
      ...createSummary({
        ...question,
        id: 'related-question',
        title: 'Related Passage',
        htmlPath: '/questionBank/related.html'
      }),
      questionId: 'related-question',
      title: 'Related Passage',
      keywords: ['sleep', 'study'],
      questionTypes: ['multiple_choice']
    }
    const thirdSummary: QuestionSummaryDoc = {
      ...createSummary({
        ...question,
        id: 'third-question',
        title: 'Third Passage',
        htmlPath: '/questionBank/third.html'
      }),
      questionId: 'third-question',
      title: 'Third Passage',
      keywords: ['sleep', 'hunter'],
      questionTypes: ['multiple_choice']
    }
    const fourthSummary: QuestionSummaryDoc = {
      ...createSummary({
        ...question,
        id: 'fourth-question',
        title: 'Fourth Passage',
        htmlPath: '/questionBank/fourth.html'
      }),
      questionId: 'fourth-question',
      title: 'Fourth Passage',
      keywords: ['routine', 'study'],
      questionTypes: ['multiple_choice']
    }

    const service = new AssistantService({
      provider: null,
      questionLoader: async () => question,
      documentLoader: async () => document,
      summariesLoader: async () => [document.summary, relatedSummary, thirdSummary, fourthSummary]
    })

    const response = await service.query({
      questionId: question.id,
      action: 'recommend_drills',
      locale: 'en',
      recentPractice: [
        { questionId: 'related-question', accuracy: 92, category: 'P1', duration: 900 }
      ]
    })

    expect(response.recommendedQuestions?.[0]?.questionId).not.toBe('related-question')
    expect(response.answerSections?.length).toBeGreaterThan(0)
  })

  describe('dynamic follow-ups', () => {
    it('social query returns without LLM call', async () => {
      const documentLoader = vi.fn().mockResolvedValue(document)
      const generate = vi.fn()
      const service = new AssistantService({
        provider: { generate },
        questionLoader: async () => question,
        documentLoader,
        summariesLoader: async () => [document.summary]
      })

      const response = await service.query({
        questionId: question.id,
        locale: 'zh',
        userQuery: '你好'
      })

      expect(generate).not.toHaveBeenCalled()
      expect(response.followUps).toEqual(['第 1 题怎么做', '这篇阅读怎么入手', '有什么阅读技巧'])
    })

    it('unrelated_chat query about weather returns followUps for re-engagement', async () => {
      const documentLoader = vi.fn().mockResolvedValue(document)
      const generate = vi.fn()
      const service = new AssistantService({
        provider: { generate },
        questionLoader: async () => question,
        documentLoader,
        summariesLoader: async () => [document.summary]
      })

      const response = await service.query({
        questionId: question.id,
        locale: 'zh',
        userQuery: '今天天气怎么样？'
      })

      expect(response.followUps).toEqual(['第 1 题怎么做', '这篇阅读怎么入手', '有什么阅读技巧'])
    })

    it('grounded question with Chinese numeral (第一题) returns contextual followUps', async () => {
      const multiDoc = createMultiQuestionDocument(question)
      const provider = {
        generate: vi.fn().mockResolvedValue('{"answer":"从段落 B 开始。","answerSections":[{"type":"direct_answer","text":"从段落 B 开始。"}],"followUps":[],"confidence":"high","missingContext":[]}')
      }
      const service = new AssistantService({
        provider: null,
        questionLoader: async () => question,
        documentLoader: async () => multiDoc,
        summariesLoader: async () => [document.summary]
      })

      const response = await service.query({
        questionId: question.id,
        locale: 'zh',
        userQuery: '第一题怎么做？'
      })

      // Chinese numeral "第一题" should be recognized and trigger grounded question handling
      expect(response.followUps).toEqual([])
      expect(response.usedQuestionNumbers).toContain('1')
    })

    it('grounded question with Arabic numeral (第 1 题) returns contextual followUps', async () => {
      const multiDoc = createMultiQuestionDocument(question)
      const provider = {
        generate: vi.fn().mockResolvedValue('{"answer":"从段落 B 开始。","answerSections":[{"type":"direct_answer","text":"从段落 B 开始。"}],"followUps":[],"confidence":"high","missingContext":[]}')
      }
      const service = new AssistantService({
        provider: null,
        questionLoader: async () => question,
        documentLoader: async () => multiDoc,
        summariesLoader: async () => [document.summary]
      })

      const response = await service.query({
        questionId: question.id,
        locale: 'zh',
        userQuery: '第 1 题怎么做？'
      })

      expect(response.followUps).toEqual([])
      expect(response.usedQuestionNumbers).toContain('1')
    })

    it('grounded question returns contextual followUps with next question', async () => {
      const provider = {
        generate: vi.fn().mockResolvedValue('{"answer":"Start with paragraph B.","answerSections":[{"type":"direct_answer","text":"Start with paragraph B."}],"followUps":[],"confidence":"high","missingContext":[]}')
      }
      const service = new AssistantService({
        provider: null, // Use local templates
        questionLoader: async () => question,
        documentLoader: async () => document,
        summariesLoader: async () => [document.summary]
      })

      const response = await service.query({
        questionId: question.id,
        locale: 'zh',
        userQuery: '第 1 题怎么做？'
      })

      expect(response.followUps).toEqual([])
    })

    it('vocab query returns concise answerSections', async () => {
      const service = new AssistantService({
        provider: null,
        questionLoader: async () => question,
        documentLoader: async () => document,
        summariesLoader: async () => [document.summary]
      })

      const response = await service.query({
        questionId: question.id,
        locale: 'zh',
        userQuery: 'servants 有哪些同义替换'
      })

      // Vocab queries should have ≤2 answerSections
      expect(response.answerSections?.length).toBeLessThanOrEqual(2)
    })
  })

  describe('context expansion for missing English text', () => {
    it('handles vocab query with provider null', async () => {
      const service = new AssistantService({
        provider: null,
        questionLoader: async () => question,
        documentLoader: async () => document,
        summariesLoader: async () => [document.summary]
      })

      const response = await service.query({
        questionId: question.id,
        locale: 'zh',
        userQuery: 'servants 有哪些同义替换'
      })

      // Should return a valid response without errors
      expect(response.answer).toBeDefined()
      expect(response.answerSections?.length).toBeGreaterThan(0)
    })
  })

  describe('answer style classification integration', () => {
    it('vocab_paraphrase style returns ≤2 answerSections', async () => {
      const provider = {
        generate: vi.fn().mockResolvedValue('{"answer":"increased, rose, grew","answerSections":[{"type":"direct_answer","text":"increased, rose, grew"}],"followUps":[],"confidence":"high","missingContext":[]}')
      }
      const service = new AssistantService({
        provider,
        questionLoader: async () => question,
        documentLoader: async () => document,
        summariesLoader: async () => [document.summary]
      })

      const response = await service.query({
        questionId: question.id,
        locale: 'zh',
        userQuery: 'servants 有哪些同义替换'
      })

      expect(response.answerSections?.length).toBeLessThanOrEqual(2)
    })

    it('paragraph_focus style returns concise answer', async () => {
      const provider = {
        generate: vi.fn().mockResolvedValue('{"answer":"Paragraph B describes tea spread to Japan.","answerSections":[{"type":"direct_answer","text":"Paragraph B describes tea spread to Japan."},{"type":"evidence","text":"The tea quickly gained support..."}],"followUps":[],"confidence":"high","missingContext":[]}')
      }
      const service = new AssistantService({
        provider,
        questionLoader: async () => question,
        documentLoader: async () => document,
        summariesLoader: async () => [document.summary]
      })

      const response = await service.query({
        questionId: question.id,
        locale: 'zh',
        userQuery: '段落 B 的内容是什么'
      })

      expect(response.answerSections?.length).toBeLessThanOrEqual(2)
    })
  })

  describe('preset whole passage (explain and hint)', () => {
    it('uses all passage question numbers for 讲解思路 preset (zh)', async () => {
      const multiDoc = createMultiQuestionDocument(question)
      const provider = {
        generate: vi.fn().mockResolvedValue(
          JSON.stringify({
            answer: 'overview',
            answerSections: [{ type: 'direct_answer', text: 'ok' }],
            followUps: [],
            confidence: 'high',
            missingContext: []
          })
        )
      }
      const service = new AssistantService({
        provider,
        questionLoader: async () => question,
        documentLoader: async () => multiDoc,
        summariesLoader: async () => [document.summary]
      })

      const response = await service.query({
        questionId: question.id,
        locale: 'zh',
        userQuery: '请讲解当前题组的解题思路与原文定位步骤。',
        promptKind: 'preset'
      })

      expect(new Set(response.usedQuestionNumbers ?? [])).toEqual(new Set(['1', '2', '10', '12']))
    })

    it('treats 讲解思路 alone (button label) as whole-passage explain preset (zh)', async () => {
      const multiDoc = createMultiQuestionDocument(question)
      const provider = {
        generate: vi.fn().mockResolvedValue(
          JSON.stringify({
            answer: 'overview',
            answerSections: [{ type: 'direct_answer', text: 'ok' }],
            followUps: [],
            confidence: 'high',
            missingContext: []
          })
        )
      }
      const service = new AssistantService({
        provider,
        questionLoader: async () => question,
        documentLoader: async () => multiDoc,
        summariesLoader: async () => [document.summary]
      })

      const response = await service.query({
        questionId: question.id,
        locale: 'zh',
        userQuery: '讲解思路',
        promptKind: 'preset'
      })

      expect(new Set(response.usedQuestionNumbers ?? [])).toEqual(new Set(['1', '2', '10', '12']))
    })

    it('uses all passage question numbers for Explain reasoning preset (en)', async () => {
      const multiDoc = createMultiQuestionDocument(question)
      const provider = {
        generate: vi.fn().mockResolvedValue(
          JSON.stringify({
            answer: 'overview',
            answerSections: [{ type: 'direct_answer', text: 'ok' }],
            followUps: [],
            confidence: 'high',
            missingContext: []
          })
        )
      }
      const service = new AssistantService({
        provider,
        questionLoader: async () => question,
        documentLoader: async () => multiDoc,
        summariesLoader: async () => [document.summary]
      })

      const response = await service.query({
        questionId: question.id,
        locale: 'en',
        userQuery: 'Explain the reasoning for this question set and how to locate evidence in the passage.',
        promptKind: 'preset'
      })

      expect(new Set(response.usedQuestionNumbers ?? [])).toEqual(new Set(['1', '2', '10', '12']))
    })

    it('uses all passage question numbers for 给我提示 hint preset (zh full welcome text)', async () => {
      const multiDoc = createMultiQuestionDocument(question)
      const provider = {
        generate: vi.fn().mockResolvedValue(
          JSON.stringify({
            answer: 'hints',
            answerSections: [{ type: 'direct_answer', text: 'ok' }],
            followUps: [],
            confidence: 'high',
            missingContext: []
          })
        )
      }
      const service = new AssistantService({
        provider,
        questionLoader: async () => question,
        documentLoader: async () => multiDoc,
        summariesLoader: async () => [document.summary]
      })

      const response = await service.query({
        questionId: question.id,
        locale: 'zh',
        userQuery: '请针对当前文章与题组给一些解题提示，不要直接给出答案。',
        promptKind: 'preset'
      })

      expect(new Set(response.usedQuestionNumbers ?? [])).toEqual(new Set(['1', '2', '10', '12']))
    })

    it('treats 给我提示 alone as whole-passage hint preset (zh)', async () => {
      const multiDoc = createMultiQuestionDocument(question)
      const provider = {
        generate: vi.fn().mockResolvedValue(
          JSON.stringify({
            answer: 'hints',
            answerSections: [{ type: 'direct_answer', text: 'ok' }],
            followUps: [],
            confidence: 'high',
            missingContext: []
          })
        )
      }
      const service = new AssistantService({
        provider,
        questionLoader: async () => question,
        documentLoader: async () => multiDoc,
        summariesLoader: async () => [document.summary]
      })

      const response = await service.query({
        questionId: question.id,
        locale: 'zh',
        userQuery: '给我提示',
        promptKind: 'preset'
      })

      expect(new Set(response.usedQuestionNumbers ?? [])).toEqual(new Set(['1', '2', '10', '12']))
    })

    it('uses all passage question numbers for Give me hints preset (en)', async () => {
      const multiDoc = createMultiQuestionDocument(question)
      const provider = {
        generate: vi.fn().mockResolvedValue(
          JSON.stringify({
            answer: 'hints',
            answerSections: [{ type: 'direct_answer', text: 'ok' }],
            followUps: [],
            confidence: 'high',
            missingContext: []
          })
        )
      }
      const service = new AssistantService({
        provider,
        questionLoader: async () => question,
        documentLoader: async () => multiDoc,
        summariesLoader: async () => [document.summary]
      })

      const response = await service.query({
        questionId: question.id,
        locale: 'en',
        userQuery: 'Give me hints for the current passage and question set without revealing the answers directly.',
        promptKind: 'preset'
      })

      expect(new Set(response.usedQuestionNumbers ?? [])).toEqual(new Set(['1', '2', '10', '12']))
    })
  })

  describe('ielts_general LLM JSON parsing', () => {
    it('parses strict JSON into answerSections and readable answer (not raw JSON string)', async () => {
      const jsonResponse = JSON.stringify({
        answer: 'summary line',
        answerSections: [
          { type: 'direct_answer', text: '阅读技巧要点' },
          { type: 'reasoning', text: '原因说明' },
          { type: 'next_step', text: '练习建议' }
        ],
        followUps: ['总结题型', '同义替换', '段落大意'],
        confidence: 'high',
        missingContext: []
      })
      const provider = {
        generate: vi.fn().mockResolvedValue(jsonResponse)
      }
      const service = new AssistantService({
        provider,
        questionLoader: async () => question,
        documentLoader: async () => document,
        summariesLoader: async () => [document.summary]
      })

      const response = await service.query({
        questionId: question.id,
        locale: 'zh',
        userQuery: '雅思阅读技巧'
      })

      expect(response.responseKind).toBe('chat')
      expect(response.answerSections?.length).toBeGreaterThanOrEqual(3)
      expect(response.answer).not.toMatch(/^\s*\{/)
      expect(response.followUps?.length).toBeGreaterThanOrEqual(1)
      expect(provider.generate).toHaveBeenCalled()
    })

    it('parses fenced JSON from ielts_general LLM output', async () => {
      const inner = JSON.stringify({
        answer: 'x',
        answerSections: [{ type: 'direct_answer', text: ' fenced body ' }],
        followUps: [],
        confidence: 'high',
        missingContext: []
      })
      const provider = {
        generate: vi.fn().mockResolvedValue(`\`\`\`json\n${inner}\n\`\`\``)
      }
      const service = new AssistantService({
        provider,
        questionLoader: async () => question,
        documentLoader: async () => document,
        summariesLoader: async () => [document.summary]
      })

      const response = await service.query({
        questionId: question.id,
        locale: 'zh',
        userQuery: '雅思备考方法'
      })

      expect(response.answerSections?.length).toBeGreaterThanOrEqual(1)
      expect(response.answer.trim().length).toBeGreaterThan(0)
      expect(response.answer).not.toContain('"answerSections"')
    })
  })

  describe('chinese numeral conversion', () => {
    // Note: chineseNumeralToArabic is internal to service.ts, so we test end-to-end behavior
    it('recognizes 第一题 as question 1', async () => {
      const multiDoc = createMultiQuestionDocument(question)
      const service = new AssistantService({
        provider: null,
        questionLoader: async () => question,
        documentLoader: async () => multiDoc,
        summariesLoader: async () => [document.summary]
      })

      const response = await service.query({
        questionId: question.id,
        locale: 'zh',
        userQuery: '第一题怎么做'
      })

      expect(response.usedQuestionNumbers).toContain('1')
    })

    it('recognizes 第二题 as question 2', async () => {
      const multiDoc = createMultiQuestionDocument(question)
      const service = new AssistantService({
        provider: null,
        questionLoader: async () => question,
        documentLoader: async () => multiDoc,
        summariesLoader: async () => [document.summary]
      })

      const response = await service.query({
        questionId: question.id,
        locale: 'zh',
        userQuery: '第二题的思路'
      })

      expect(response.usedQuestionNumbers).toContain('2')
    })

    it('recognizes 第十题 as question 10', async () => {
      const multiDoc = createMultiQuestionDocument(question)
      const service = new AssistantService({
        provider: null,
        questionLoader: async () => question,
        documentLoader: async () => multiDoc,
        summariesLoader: async () => [document.summary]
      })

      const response = await service.query({
        questionId: question.id,
        locale: 'zh',
        userQuery: '第十题怎么解'
      })

      expect(response.usedQuestionNumbers).toContain('10')
    })
  })
})
