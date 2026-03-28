import type {
  AssistantCitation,
  AssistantQueryRequest,
  AssistantQueryResponse,
  AssistantReviewItem,
  SimilarQuestionRecommendation
} from '../../types/assistant.js'
import type {
  ParsedQuestionDocument,
  QuestionIndexEntry,
  QuestionSummaryDoc,
  RagChunk
} from '../../types/question-bank.js'
import { compactMultiline, extractJsonObject, safeJsonParse, toExcerpt, uniqueValues } from '../utils/text.js'
import { buildAssistantPrompt } from './prompt.js'
import { createAssistantChatProvider, type AssistantChatProvider } from './provider.js'
import { findQuestionIndexEntry, loadQuestionIndex, parseQuestionDocument } from '../question-bank/index.js'

interface AssistantLogger {
  info?: (...args: unknown[]) => void
  warn?: (...args: unknown[]) => void
}

interface AssistantServiceDeps {
  provider?: AssistantChatProvider | null
  logger?: AssistantLogger
  questionLoader?: (questionId: string) => Promise<QuestionIndexEntry>
  documentLoader?: (question: QuestionIndexEntry) => Promise<ParsedQuestionDocument>
  summariesLoader?: () => Promise<QuestionSummaryDoc[]>
}

interface ParsedModelResponse {
  answer: string
  followUps: string[]
}

const LOCAL_CONTEXT_LIMIT = 5
const PASSAGE_CONTEXT_FALLBACK_LIMIT = 2
const SEARCH_STOPWORDS = new Set([
  'about', 'above', 'after', 'again', 'against', 'among', 'because', 'before', 'being', 'below', 'between',
  'could', 'does', 'doing', 'from', 'have', 'into', 'more', 'most', 'only', 'other', 'same', 'should',
  'than', 'that', 'their', 'there', 'these', 'they', 'this', 'those', 'through', 'under', 'using', 'very',
  'what', 'when', 'where', 'which', 'while', 'with', 'would', 'your', 'answer', 'answers', 'question',
  'questions', 'paragraph', 'section', 'shared', 'instructions', 'prompt', 'true', 'false', 'given',
  'option', 'options'
])

const parsedDocumentCache = new Map<string, Promise<ParsedQuestionDocument>>()
let allSummariesPromise: Promise<QuestionSummaryDoc[]> | null = null

function resolveLocale(request: AssistantQueryRequest): 'zh' | 'en' {
  return request.locale === 'en' ? 'en' : 'zh'
}

function buildCitations(chunks: RagChunk[]): AssistantCitation[] {
  return chunks.map((chunk) => ({
    chunkType: chunk.chunkType,
    questionNumbers: chunk.questionNumbers,
    paragraphLabels: chunk.paragraphLabels,
    excerpt: chunk.content
  }))
}

function buildFallbackFollowUps(mode: AssistantQueryRequest['mode'], locale: 'zh' | 'en'): string[] {
  if (locale === 'zh') {
    switch (mode) {
      case 'hint':
        return ['先回到我提到的段落找线索。', '先标出题干里的关键词和对比词。', '先排除一个最弱干扰项。']
      case 'explain':
        return ['把题干和证据句逐句对照。', '重点找同义改写，不要只盯原词。', '用一句话复述判断逻辑。']
      case 'review':
        return ['先重新看一遍证据句。', '写下你误判的原因。', '再做一道同类题巩固。']
      case 'similar':
        return ['先做我推荐的第一篇。', '比较两篇题型和定位方式。', '做完后再核对证据。']
    }
  }

  switch (mode) {
    case 'hint':
      return ['Re-check the paragraph I pointed to.', 'Mark the stem keywords and contrast words.', 'Eliminate one weak distractor first.']
    case 'explain':
      return ['Compare the stem with the evidence sentence.', 'Look for paraphrases instead of exact words.', 'Summarize the logic in one sentence.']
    case 'review':
      return ['Review the cited evidence again.', 'Note why your first choice failed.', 'Try one similar question next.']
    case 'similar':
      return ['Try the first recommended passage.', 'Compare the shared question type.', 'Review the evidence after you finish.']
  }
}

export function parseModelResponse(content: string, mode: AssistantQueryRequest['mode'], locale: 'zh' | 'en'): ParsedModelResponse {
  const jsonText = extractJsonObject(content)
  const parsed = jsonText ? safeJsonParse<ParsedModelResponse>(jsonText) : null

  if (parsed?.answer) {
    return {
      answer: parsed.answer.trim(),
      followUps: parsed.followUps?.filter(Boolean).slice(0, 3) ?? buildFallbackFollowUps(mode, locale)
    }
  }

  const salvaged = salvageModelResponse(content)
  if (salvaged?.answer) {
    return {
      answer: salvaged.answer,
      followUps: salvaged.followUps.length > 0 ? salvaged.followUps : buildFallbackFollowUps(mode, locale)
    }
  }

  return {
    answer: content.trim(),
    followUps: buildFallbackFollowUps(mode, locale)
  }
}

function decodeLooseJsonString(value: string): string {
  const parsed = safeJsonParse<string>(`"${value}"`)
  if (typeof parsed === 'string') {
    return parsed.trim()
  }

  return value
    .replace(/\\"/g, '"')
    .replace(/\\n/g, '\n')
    .replace(/\\\\/g, '\\')
    .trim()
}

function salvageModelResponse(content: string): ParsedModelResponse | null {
  const answerMatch = content.match(/["']answer["']\s*:\s*"([\s\S]*?)"\s*(?:,?\s*["']followUps["']\s*:|[}\n])/i)
  const followUpsBlockMatch = content.match(/["']followUps["']\s*:\s*\[([\s\S]*?)\]/i)

  if (!answerMatch) {
    return null
  }

  const followUps = followUpsBlockMatch
    ? Array.from(followUpsBlockMatch[1].matchAll(/"((?:\\.|[^"])*)"|'((?:\\.|[^'])*)'/g))
        .map((match) => decodeLooseJsonString(match[1] ?? match[2] ?? ''))
        .filter(Boolean)
        .slice(0, 3)
    : []

  return {
    answer: decodeLooseJsonString(answerMatch[1]),
    followUps
  }
}

function extractQuestionPromptText(content: string): string {
  const promptMatch = content.match(/Prompt:\s*([\s\S]+)/i)
  const source = promptMatch?.[1] ?? content

  return source
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/^(TRUE|FALSE|NOT GIVEN|YES|NO|Options:|Question type:|Shared instructions:|Section:|Questions?\b)/i.test(line))
    .slice(0, 3)
    .join(' ')
}

function tokenizeSearchTerms(value: string): string[] {
  return uniqueValues(
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .split(/\s+/)
      .map((token) => token.trim())
      .filter((token) => token.length >= 3 && !SEARCH_STOPWORDS.has(token))
  )
}

function scorePassageChunkRelevance(chunk: RagChunk, terms: string[], index: number): number {
  const chunkTerms = new Set(tokenizeSearchTerms(chunk.content))
  const overlap = terms.reduce((score, term) => score + (chunkTerms.has(term) ? 1 : 0), 0)
  return overlap * 3 - index * 0.01
}

function pickSupplementalPassageChunks(
  passageChunks: RagChunk[],
  request: AssistantQueryRequest,
  focusQuestionChunks: RagChunk[]
): RagChunk[] {
  if (passageChunks.length === 0) {
    return []
  }

  const searchTerms = tokenizeSearchTerms([
    request.userQuery ?? '',
    ...focusQuestionChunks.map((chunk) => extractQuestionPromptText(chunk.content))
  ].join(' '))

  if (searchTerms.length === 0) {
    return passageChunks.slice(0, PASSAGE_CONTEXT_FALLBACK_LIMIT)
  }

  return passageChunks
    .map((chunk, index) => ({
      chunk,
      score: scorePassageChunkRelevance(chunk, searchTerms, index)
    }))
    .sort((left, right) => right.score - left.score)
    .slice(0, PASSAGE_CONTEXT_FALLBACK_LIMIT)
    .map((entry) => entry.chunk)
}

function filterChunksForMode(chunks: RagChunk[], mode: AssistantQueryRequest['mode']): RagChunk[] {
  switch (mode) {
    case 'hint':
      return chunks.filter((chunk) => !chunk.sensitive && ['passage_paragraph', 'question_item'].includes(chunk.chunkType))
    case 'explain':
      return chunks.filter((chunk) => !chunk.sensitive && ['passage_paragraph', 'question_item'].includes(chunk.chunkType))
    case 'review':
      return chunks.filter((chunk) =>
        ['passage_paragraph', 'question_item', 'answer_key', 'answer_explanation'].includes(chunk.chunkType)
      )
    case 'similar':
      return chunks
  }
}

function buildSimilarReason(current: QuestionSummaryDoc, candidate: QuestionSummaryDoc, locale: 'zh' | 'en'): string {
  const sharedKeywords = candidate.keywords.filter((keyword) => current.keywords.includes(keyword)).slice(0, 3)
  const sharedTypes = candidate.questionTypes.filter((type) => current.questionTypes.includes(type)).slice(0, 2)

  if (locale === 'zh') {
    const parts = [
      sharedKeywords.length > 0 ? `共同主题线索：${sharedKeywords.join('、')}` : '',
      sharedTypes.length > 0 ? `共同题型：${sharedTypes.join('、')}` : '',
      candidate.category === current.category ? `同一文章分类：${candidate.category}` : ''
    ].filter(Boolean)

    return parts.join('；') || '主题接近，解题思路也和当前题组相似。'
  }

  const parts = [
    sharedKeywords.length > 0 ? `Shared topic cues: ${sharedKeywords.join(', ')}` : '',
    sharedTypes.length > 0 ? `Shared question types: ${sharedTypes.join(', ')}` : '',
    candidate.category === current.category ? `Same passage category: ${candidate.category}` : ''
  ].filter(Boolean)

  return parts.join('. ') || 'Similar passage topic and IELTS reasoning pattern.'
}

function formatQuestionType(questionType: string | undefined, locale: 'zh' | 'en'): string {
  if (locale === 'zh') {
    switch (questionType) {
      case 'paragraph_matching':
        return '段落匹配题'
      case 'true_false_not_given':
        return '判断题（True / False / Not Given）'
      case 'yes_no_not_given':
        return '判断题（Yes / No / Not Given）'
      case 'matching':
        return '配对题'
      case 'multiple_choice':
        return '选择题'
      case 'sentence_completion':
        return '句子填空题'
      case 'radio_choice':
        return '单选题'
      case 'dropdown_choice':
        return '下拉选择题'
      default:
        return '雅思阅读题'
    }
  }

  switch (questionType) {
    case 'paragraph_matching':
      return 'paragraph matching'
    case 'true_false_not_given':
      return 'True / False / Not Given'
    case 'yes_no_not_given':
      return 'Yes / No / Not Given'
    case 'matching':
      return 'matching'
    case 'multiple_choice':
      return 'multiple choice'
    case 'sentence_completion':
      return 'sentence completion'
    case 'radio_choice':
      return 'single-choice selection'
    case 'dropdown_choice':
      return 'dropdown selection'
    default:
      return 'IELTS reading question'
  }
}

function extractCorrectAnswer(chunk: RagChunk): string {
  const match = chunk.content.match(/Correct answer:\s*([^\n]+)/i)
  return match?.[1]?.trim() ?? ''
}

function parseReviewItem(chunk: RagChunk): AssistantReviewItem {
  const lines = chunk.content.split('\n').map((line) => line.trim()).filter(Boolean)
  const explanationLines: string[] = []
  const evidenceLines: string[] = []
  let currentSection: 'explanation' | 'evidence' | null = null
  let questionNumber = chunk.questionNumbers[0] ?? ''
  let correctAnswer = ''
  let paragraphLabel = chunk.paragraphLabels[0]

  for (const line of lines) {
    const questionMatch = line.match(/^Question\s+(\d{1,3})/i)
    if (questionMatch) {
      questionNumber = questionMatch[1]
      currentSection = null
      continue
    }

    const paragraphMatch = line.match(/^Paragraph:\s*(.+)$/i)
    if (paragraphMatch) {
      paragraphLabel = paragraphMatch[1].trim()
      currentSection = null
      continue
    }

    const answerMatch = line.match(/^Correct answer:\s*(.+)$/i)
    if (answerMatch) {
      correctAnswer = answerMatch[1].trim()
      currentSection = null
      continue
    }

    const explanationMatch = line.match(/^Explanation:\s*(.*)$/i)
    if (explanationMatch) {
      currentSection = 'explanation'
      if (explanationMatch[1]) {
        explanationLines.push(explanationMatch[1])
      }
      continue
    }

    const evidenceMatch = line.match(/^(?:Evidence|Original evidence|原文依据|原文)[:：]\s*(.*)$/i)
    if (evidenceMatch) {
      currentSection = 'evidence'
      if (evidenceMatch[1]) {
        evidenceLines.push(evidenceMatch[1])
      }
      continue
    }

    if (currentSection === 'explanation') {
      explanationLines.push(line)
      continue
    }

    if (currentSection === 'evidence') {
      evidenceLines.push(line)
    }
  }

  return {
    questionNumber,
    correctAnswer,
    explanation: compactMultiline(explanationLines.join('\n')),
    evidence: compactMultiline(evidenceLines.join('\n')),
    paragraphLabel
  }
}

function describeQuestionType(questionType: string | undefined, locale: 'zh' | 'en'): string {
  if (questionType === 'heading_matching') {
    return locale === 'zh' ? '标题匹配题' : 'heading matching'
  }

  if (questionType === 'multiple_select') {
    return locale === 'zh' ? '多选题' : 'multiple-select question'
  }

  return formatQuestionType(questionType, locale)
}

function extractExplanation(chunk: RagChunk): string {
  const match = chunk.content.match(/Explanation:\s*([\s\S]+)/i)
  return match?.[1]?.trim() ?? chunk.content
}

function intersectionCount(left: string[], right: string[]): number {
  const rightSet = new Set(right)
  return left.filter((value) => rightSet.has(value)).length
}

async function defaultQuestionLoader(questionId: string): Promise<QuestionIndexEntry> {
  const question = await findQuestionIndexEntry(questionId)
  if (!question) {
    throw new Error(`Unknown questionId: ${questionId}`)
  }

  return question
}

async function getParsedDocument(question: QuestionIndexEntry): Promise<ParsedQuestionDocument> {
  const existing = parsedDocumentCache.get(question.id)
  if (existing) {
    return existing
  }

  const pending = parseQuestionDocument(question)
  parsedDocumentCache.set(question.id, pending)
  return pending
}

async function getAllSummaries(): Promise<QuestionSummaryDoc[]> {
  if (allSummariesPromise) {
    return allSummariesPromise
  }

  allSummariesPromise = loadQuestionIndex()
    .then(async (questions) => Promise.all(questions.map((question) => getParsedDocument(question))))
    .then((documents) => documents.map((document) => document.summary))

  return allSummariesPromise
}

function extractMentionedQuestionNumbers(request: AssistantQueryRequest, availableQuestionNumbers: Set<string>): string[] {
  const source = `${request.userQuery ?? ''}\n${request.history?.map((item) => item.content).join('\n') ?? ''}`
  const matches = Array.from(source.matchAll(/\b(?:question|q)\s*(\d{1,3})\b/gi))
    .map((match) => match[1])
    .filter((value) => availableQuestionNumbers.has(value))

  return uniqueValues(matches)
}

function extractReferencedParagraphLabels(chunks: RagChunk[]): string[] {
  const labels = chunks.flatMap((chunk) =>
    Array.from(chunk.content.matchAll(/\bParagraph\s+([A-Z])\b/g)).map((match) => match[1])
  )

  return uniqueValues(labels)
}

function pickFocusQuestionNumbers(document: ParsedQuestionDocument, request: AssistantQueryRequest): string[] {
  const wrongQuestions = request.attemptContext?.wrongQuestions?.filter(Boolean) ?? []
  if (wrongQuestions.length > 0) {
    return wrongQuestions
  }

  const availableQuestionNumbers = new Set(document.questionChunks.flatMap((chunk) => chunk.questionNumbers))
  const mentioned = extractMentionedQuestionNumbers(request, availableQuestionNumbers)
  if (mentioned.length > 0) {
    return mentioned
  }

  const firstQuestion = document.questionChunks[0]?.questionNumbers[0]
  return firstQuestion ? [firstQuestion] : []
}

function collectReviewItems(
  request: AssistantQueryRequest,
  answerExplanationChunks: RagChunk[]
): AssistantReviewItem[] {
  const selectedAnswers = request.attemptContext?.selectedAnswers ?? {}
  const availableQuestionNumbers = new Set(answerExplanationChunks.flatMap((chunk) => chunk.questionNumbers))
  const mentionedQuestionNumbers = extractMentionedQuestionNumbers(request, availableQuestionNumbers)
  const targetQuestionNumbers = mentionedQuestionNumbers.length > 0
    ? new Set(mentionedQuestionNumbers)
    : null

  return answerExplanationChunks
    .filter((chunk) => targetQuestionNumbers ? chunk.questionNumbers.some((value) => targetQuestionNumbers.has(value)) : true)
    .map((chunk) => {
      const item = parseReviewItem(chunk)
      return {
        ...item,
        selectedAnswer: selectedAnswers[item.questionNumber]
      }
    })
    .sort((left, right) => Number(left.questionNumber) - Number(right.questionNumber))
}

function buildReviewSummary(
  question: QuestionIndexEntry,
  request: AssistantQueryRequest,
  reviewItems: AssistantReviewItem[]
): string {
  const locale = resolveLocale(request)
  const availableQuestionNumbers = new Set(reviewItems.map((item) => item.questionNumber))
  const mentionedQuestionNumbers = extractMentionedQuestionNumbers(request, availableQuestionNumbers)

  if (reviewItems.length === 0) {
    return locale === 'zh'
      ? `暂时没有找到《${question.title}》的标准解析。`
      : `No official answer explanations are available yet for "${question.title}".`
  }

  return locale === 'zh'
    ? mentionedQuestionNumbers.length > 0
      ? `以下是你指定题号的标准解析，共 ${reviewItems.length} 题。`
      : `《${question.title}》共整理出 ${reviewItems.length} 题标准解析，已按题号展示。`
    : mentionedQuestionNumbers.length > 0
      ? `Showing the official review for the requested ${reviewItems.length} question(s).`
      : `There are ${reviewItems.length} official review entries for "${question.title}", shown below as cards.`
}

function rankChunksLocally(document: ParsedQuestionDocument, request: AssistantQueryRequest): RagChunk[] {
  const allowed = filterChunksForMode(document.allChunks, request.mode)
  const focusQuestionNumbers = new Set(pickFocusQuestionNumbers(document, request))
  const focusQuestionChunks = allowed.filter((chunk) =>
    chunk.chunkType === 'question_item' && chunk.questionNumbers.some((value) => focusQuestionNumbers.has(value))
  )
  const focusAnswerChunks = allowed.filter((chunk) =>
    ['answer_key', 'answer_explanation'].includes(chunk.chunkType) &&
    chunk.questionNumbers.some((value) => focusQuestionNumbers.has(value))
  )
  const referencedParagraphs = new Set(extractReferencedParagraphLabels(focusQuestionChunks))
  const focusPassageChunks = allowed.filter((chunk) =>
    chunk.chunkType === 'passage_paragraph' &&
    chunk.paragraphLabels.some((label) => referencedParagraphs.has(label))
  )
  const supplementalPassageChunks = focusPassageChunks.length === 0
    ? pickSupplementalPassageChunks(
        allowed.filter((chunk) => chunk.chunkType === 'passage_paragraph'),
        request,
        focusQuestionChunks
      )
    : []

  const targeted = uniqueValues([
    ...focusAnswerChunks,
    ...focusQuestionChunks,
    ...focusPassageChunks,
    ...supplementalPassageChunks
  ])

  if (targeted.length > 0) {
    return targeted.slice(0, LOCAL_CONTEXT_LIMIT)
  }

  return allowed
    .map((chunk) => {
      let score = 0

      if (chunk.questionNumbers.some((value) => focusQuestionNumbers.has(value))) {
        score += 4
      }

      if (request.mode === 'review' && chunk.chunkType === 'answer_explanation') {
        score += 4
      }

      if (chunk.chunkType === 'question_item') {
        score += 2
      }

      if (chunk.chunkType === 'passage_paragraph') {
        score += 1
      }

      return { chunk, score }
    })
    .sort((left, right) => right.score - left.score)
    .slice(0, LOCAL_CONTEXT_LIMIT)
    .map((entry) => entry.chunk)
}

function collectReviewContextChunks(document: ParsedQuestionDocument, request: AssistantQueryRequest): RagChunk[] {
  const focusQuestionNumbers = new Set(pickFocusQuestionNumbers(document, request))
  const answerExplanations = document.answerExplanationChunks.filter((chunk) =>
    focusQuestionNumbers.size === 0 || chunk.questionNumbers.some((value) => focusQuestionNumbers.has(value))
  )
  const answerKeys = document.answerKeyChunks.filter((chunk) =>
    focusQuestionNumbers.size === 0 || chunk.questionNumbers.some((value) => focusQuestionNumbers.has(value))
  )
  const questionChunks = document.questionChunks.filter((chunk) =>
    focusQuestionNumbers.size === 0 || chunk.questionNumbers.some((value) => focusQuestionNumbers.has(value))
  )

  const targeted = uniqueValues([
    ...answerExplanations,
    ...answerKeys,
    ...questionChunks
  ])

  if (targeted.length > 0) {
    return targeted.slice(0, LOCAL_CONTEXT_LIMIT)
  }

  return uniqueValues([
    ...document.answerExplanationChunks,
    ...document.answerKeyChunks,
    ...document.questionChunks
  ]).slice(0, LOCAL_CONTEXT_LIMIT)
}

function buildLocalHint(question: QuestionIndexEntry, contextChunks: RagChunk[], locale: 'zh' | 'en'): string {
  const questionChunk = contextChunks.find((chunk) => chunk.chunkType === 'question_item')
  const passageChunk = contextChunks.find((chunk) => chunk.chunkType === 'passage_paragraph')
  const focusQuestion = questionChunk?.questionNumbers[0]
  const questionType = describeQuestionType(questionChunk?.metadata.questionType, locale)
  const paragraphHint = passageChunk?.paragraphLabels[0]

  if (locale === 'zh') {
    const parts = [
      `这篇《${question.title}》建议先从${focusQuestion ? `第 ${focusQuestion} 题` : '这组题的第一题'}入手。`,
      `先把它当作${questionType}来做：先看清题目要求，再划出题干里的名词、动词和对比词。`,
      paragraphHint
        ? `优先回到我引用的 ${paragraphHint} 段附近找证据，重点核对句意，而不是机械匹配原词。`
        : '优先回看我引用的证据句，重点核对句意，而不是机械匹配原词。',
      '先排除一个明显不成立的选项或段落，再决定最终答案。'
    ]

    return parts.join('')
  }

  const parts = [
    `For ${question.title}, start with ${focusQuestion ? `Q${focusQuestion}` : 'the first question in the set'}.`,
    `Treat it as ${questionType}: read the instruction carefully, then mark the key noun, verb, and contrast word before scanning.`,
    paragraphHint
      ? `Begin by checking the cited evidence around paragraph ${paragraphHint}, then confirm meaning rather than exact keyword matches.`
      : 'Use the cited evidence to confirm meaning rather than matching exact words.',
    'Eliminate one weak option or one wrong paragraph before deciding on the final answer.'
  ]

  return parts.join(' ')
}

function buildLocalExplanation(question: QuestionIndexEntry, contextChunks: RagChunk[], locale: 'zh' | 'en'): string {
  const questionChunk = contextChunks.find((chunk) => chunk.chunkType === 'question_item')
  const passageChunk = contextChunks.find((chunk) => chunk.chunkType === 'passage_paragraph')
  const questionType = describeQuestionType(questionChunk?.metadata.questionType, locale)
  const focusQuestion = questionChunk?.questionNumbers[0]
  const paragraphHint = passageChunk?.paragraphLabels[0]

  if (locale === 'zh') {
    const parts = [
      `做《${question.title}》这组题，最稳妥的方法是先把${focusQuestion ? `第 ${focusQuestion} 题` : '当前题组'}当作${questionType}来处理。`,
      '第一步先读题目要求，判断它到底要你找事实、同义改写、对比关系还是分类信息。',
      paragraphHint
        ? `第二步回到我引用的 ${paragraphHint} 段附近，把题干和原文逐句对照，优先找同义改写，不要只看是否出现相同单词。`
        : '第二步把题干和我引用的证据句逐句对照，优先找同义改写，不要只看是否出现相同单词。',
      '只有当整句话放回原文语境里仍然完全成立时，再锁定答案。'
    ]

    return parts.join('')
  }

  const parts = [
    `The safest way to work through ${question.title} is to treat ${focusQuestion ? `Q${focusQuestion}` : 'this set'} as ${questionType}.`,
    'First, read the task instruction and identify what kind of evidence the question wants: fact, paraphrase, comparison, or classification.',
    paragraphHint
      ? `Then scan the cited evidence around paragraph ${paragraphHint} and compare the wording against the stem for paraphrases, not identical vocabulary.`
      : 'Then compare the cited evidence against the stem for paraphrases, not identical vocabulary.',
    'Only lock in an answer after the full sentence still makes logical sense in context.'
  ]

  return parts.join(' ')
}

function buildLocalReview(contextChunks: RagChunk[], locale: 'zh' | 'en'): string {
  const explanations = contextChunks.filter((chunk) => chunk.chunkType === 'answer_explanation').slice(0, 2)
  if (explanations.length === 0) {
    return locale === 'zh'
      ? '我暂时没有找到这道错题的完整解析，所以建议你先回看我引用的证据，再把你的答案和标准答案逐项对比。'
      : 'I could not find a detailed explanation for the exact wrong item, so review the cited evidence again and compare your chosen wording against the official answer.'
  }

  return explanations
    .map((chunk) => {
      const questionNumber = chunk.questionNumbers[0] ?? 'unknown'
      const correctAnswer = extractCorrectAnswer(chunk)
      const explanation = extractExplanation(chunk)
      const explanationExcerpt = toExcerpt(explanation, locale === 'zh' ? 220 : 240)
      return locale === 'zh'
        ? `第 ${questionNumber} 题的正确答案是 ${correctAnswer}。解析摘录：${explanationExcerpt}`
        : `Q${questionNumber}: the correct answer is ${correctAnswer}. Explanation excerpt: ${explanationExcerpt}`
    })
    .join(locale === 'zh' ? '\n\n' : ' ')
}

function buildLocalAnswer(question: QuestionIndexEntry, request: AssistantQueryRequest, contextChunks: RagChunk[]): string {
  const locale = resolveLocale(request)
  switch (request.mode) {
    case 'hint':
      return buildLocalHint(question, contextChunks, locale)
    case 'explain':
      return buildLocalExplanation(question, contextChunks, locale)
    case 'review':
      return buildLocalReview(contextChunks, locale)
    case 'similar':
      return locale === 'zh'
        ? `我找到了一些适合在《${question.title}》之后继续练习的相关文章。`
        : `I found follow-up passages related to ${question.title}.`
  }
}

function buildLocalSimilarScore(current: QuestionSummaryDoc, candidate: QuestionSummaryDoc): number {
  const keywordScore = intersectionCount(current.keywords, candidate.keywords) * 2
  const typeScore = intersectionCount(current.questionTypes, candidate.questionTypes) * 1.5
  const categoryScore = current.category === candidate.category ? 0.5 : 0
  return keywordScore + typeScore + categoryScore
}

export class AssistantService {
  private readonly provider: AssistantChatProvider | null
  private readonly logger: AssistantLogger
  private readonly questionLoader: (questionId: string) => Promise<QuestionIndexEntry>
  private readonly documentLoader: (question: QuestionIndexEntry) => Promise<ParsedQuestionDocument>
  private readonly summariesLoader: () => Promise<QuestionSummaryDoc[]>

  constructor(deps: AssistantServiceDeps = {}) {
    this.provider = deps.provider === undefined ? createAssistantChatProvider() : deps.provider
    this.logger = deps.logger ?? console
    this.questionLoader = deps.questionLoader ?? defaultQuestionLoader
    this.documentLoader = deps.documentLoader ?? getParsedDocument
    this.summariesLoader = deps.summariesLoader ?? getAllSummaries
  }

  private logFallback(reason: string, error: unknown) {
    this.logger.warn?.(
      {
        reason,
        detail: error instanceof Error ? error.message : String(error)
      },
      'Assistant provider unavailable; falling back to local response.'
    )
  }

  private async getQuestion(questionId: string): Promise<QuestionIndexEntry> {
    return this.questionLoader(questionId)
  }

  private async generateAnswer(
    question: QuestionIndexEntry,
    request: AssistantQueryRequest,
    contextChunks: RagChunk[]
  ): Promise<ParsedModelResponse> {
    if (!this.provider) {
      throw new Error('Assistant provider is not configured.')
    }

    const prompt = buildAssistantPrompt({
      mode: request.mode,
      locale: resolveLocale(request),
      question,
      userQuery: request.userQuery,
      history: request.history,
      attemptContext: request.attemptContext,
      recentPractice: request.recentPractice,
      contextChunks
    })

    const content = await this.provider.generate(prompt)
    return parseModelResponse(content, request.mode, resolveLocale(request))
  }

  private async buildLocalSimilarResponse(question: QuestionIndexEntry, request: AssistantQueryRequest): Promise<AssistantQueryResponse> {
    const locale = resolveLocale(request)
    const currentDocument = await this.documentLoader(question)
    const summaries = await this.summariesLoader()
    const ranked = summaries
      .filter((summary) => summary.questionId !== question.id)
      .map((summary) => ({
        summary,
        score: buildLocalSimilarScore(currentDocument.summary, summary)
      }))
      .sort((left, right) => right.score - left.score)
      .slice(0, 3)

    const recommendedQuestions: SimilarQuestionRecommendation[] = ranked.map(({ summary }) => ({
      questionId: summary.questionId,
      title: summary.title,
      reason: buildSimilarReason(currentDocument.summary, summary, locale)
    }))

    const citations = ranked.map(({ summary }) => ({
      chunkType: 'question_summary',
      questionNumbers: [],
      paragraphLabels: [],
      excerpt: toExcerpt(summary.content)
    }))

    return {
      answer: locale === 'zh'
        ? `我找到了一些适合在《${question.title}》之后继续练习的相关文章。`
        : `I found ${recommendedQuestions.length} related passages you can practice after "${question.title}".`,
      citations,
      followUps: buildFallbackFollowUps('similar', locale),
      recommendedQuestions
    }
  }

  private async buildLocalReviewResponse(question: QuestionIndexEntry, request: AssistantQueryRequest): Promise<AssistantQueryResponse> {
    const document = await this.documentLoader(question)
    const reviewItems = collectReviewItems(request, document.answerExplanationChunks)

    return {
      answer: buildReviewSummary(question, request, reviewItems),
      citations: [],
      followUps: buildFallbackFollowUps('review', resolveLocale(request)),
      reviewItems
    }
  }

  private async buildModelReviewResponse(question: QuestionIndexEntry, request: AssistantQueryRequest): Promise<AssistantQueryResponse> {
    const document = await this.documentLoader(question)
    const reviewItems = collectReviewItems(request, document.answerExplanationChunks)
    const contextChunks = collectReviewContextChunks(document, request)

    if (reviewItems.length === 0 || contextChunks.length === 0) {
      return this.buildLocalReviewResponse(question, request)
    }

    const modelResponse = await this.generateAnswer(question, request, contextChunks)

    return {
      answer: modelResponse.answer,
      citations: [],
      followUps: uniqueValues(modelResponse.followUps).slice(0, 3),
      reviewItems
    }
  }

  private async queryLocally(question: QuestionIndexEntry, request: AssistantQueryRequest): Promise<AssistantQueryResponse> {
    if (request.mode === 'similar') {
      return this.buildLocalSimilarResponse(question, request)
    }

    if (request.mode === 'review') {
      return this.buildLocalReviewResponse(question, request)
    }

    const document = await this.documentLoader(question)
    const contextChunks = rankChunksLocally(document, request)
    const citations = buildCitations(contextChunks)

    if (citations.length === 0) {
      throw new Error('No supporting citations were available for the assistant response.')
    }

    return {
      answer: buildLocalAnswer(question, request, contextChunks),
      citations,
      followUps: buildFallbackFollowUps(request.mode, resolveLocale(request))
    }
  }

  private async queryWithProvider(question: QuestionIndexEntry, request: AssistantQueryRequest): Promise<AssistantQueryResponse> {
    if (request.mode === 'similar') {
      return this.buildLocalSimilarResponse(question, request)
    }

    if (request.mode === 'review') {
      return this.buildModelReviewResponse(question, request)
    }

    const document = await this.documentLoader(question)
    const contextChunks = rankChunksLocally(document, request)
    const citations = buildCitations(contextChunks)

    if (citations.length === 0) {
      throw new Error('No supporting citations were available for the assistant response.')
    }

    const modelResponse = await this.generateAnswer(question, request, contextChunks)

    return {
      answer: modelResponse.answer,
      citations,
      followUps: uniqueValues(modelResponse.followUps).slice(0, 3)
    }
  }

  async query(request: AssistantQueryRequest): Promise<AssistantQueryResponse> {
    const question = await this.getQuestion(request.questionId)

    if (!this.provider) {
      return this.queryLocally(question, request)
    }

    try {
      return await this.queryWithProvider(question, request)
    } catch (error) {
      this.logFallback(request.mode, error)
      return this.queryLocally(question, request)
    }
  }
}
