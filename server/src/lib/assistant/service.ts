import type {
  AssistantAnswerSection,
  AssistantAnswerSectionType,
  AssistantCitation,
  AssistantConfidence,
  AssistantQueryRequest,
  AssistantQueryResponse,
  AssistantReviewItem,
  SimilarQuestionRecommendation
} from '../../types/assistant.js'
import type { ParsedQuestionDocument, QuestionIndexEntry, QuestionSummaryDoc, RagChunk } from '../../types/question-bank.js'
import { compactMultiline, extractJsonObject, safeJsonParse, toExcerpt, uniqueValues } from '../utils/text.js'
import { buildAssistantPrompt } from './prompt.js'
import { createAssistantChatProvider, type AssistantChatProvider } from './provider.js'
import { createAssistantSemanticSearch, type AssistantSemanticSearch } from './semantic.js'
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
  semanticSearch?: AssistantSemanticSearch | null
}

interface ParsedModelResponse {
  answer: string
  answerSections: AssistantAnswerSection[]
  followUps: string[]
  confidence: AssistantConfidence
  missingContext: string[]
  parseStrategy: 'json' | 'salvaged' | 'plain'
}

interface RetrievalContext {
  chunks: RagChunk[]
  focusQuestionNumbers: string[]
  usedQuestionNumbers: string[]
  usedParagraphLabels: string[]
  missingContext: string[]
}

const SECTION_TYPES: AssistantAnswerSectionType[] = ['direct_answer', 'reasoning', 'evidence', 'next_step']
const MODE_CONTEXT_LIMIT: Record<'hint' | 'explain' | 'review', number> = { hint: 6, explain: 8, review: 10 }
const MODE_SEMANTIC_LIMIT: Record<'hint' | 'explain' | 'review', number> = { hint: 8, explain: 10, review: 12 }
const PASSAGE_CONTEXT_FALLBACK_LIMIT = 3
const MAX_SIMILAR_RECOMMENDATIONS = 3
const SEARCH_STOPWORDS = new Set([
  'about', 'above', 'after', 'again', 'against', 'among', 'because', 'before', 'being', 'below', 'between',
  'could', 'does', 'doing', 'from', 'have', 'into', 'more', 'most', 'only', 'other', 'same', 'should',
  'than', 'that', 'their', 'there', 'these', 'they', 'this', 'those', 'through', 'under', 'using', 'very',
  'what', 'when', 'where', 'which', 'while', 'with', 'would', 'your', 'answer', 'answers', 'question',
  'questions', 'paragraph', 'section', 'shared', 'instructions', 'prompt', 'true', 'false', 'given',
  'option', 'options', 'passage', 'review', 'hint', 'explain'
])

const parsedDocumentCache = new Map<string, Promise<ParsedQuestionDocument>>()
let allSummariesPromise: Promise<QuestionSummaryDoc[]> | null = null

function resolveLocale(request: AssistantQueryRequest): 'zh' | 'en' {
  return request.locale === 'en' ? 'en' : 'zh'
}

function createAnswerSection(type: AssistantAnswerSectionType, text: string): AssistantAnswerSection | null {
  const normalized = compactMultiline(text)
  return normalized ? { type, text: normalized } : null
}

function buildAnswerFromSections(sections: AssistantAnswerSection[], fallback = ''): string {
  return sections.length > 0 ? sections.map((section) => section.text).join('\n\n') : compactMultiline(fallback)
}

function normalizeConfidence(value: unknown, missingContext: string[]): AssistantConfidence {
  if (value === 'high' || value === 'medium' || value === 'low') {
    return value
  }
  if (missingContext.length >= 2) {
    return 'low'
  }
  return missingContext.length === 1 ? 'medium' : 'high'
}

function dedupeChunks(chunks: RagChunk[]): RagChunk[] {
  const byId = new Map<string, RagChunk>()
  for (const chunk of chunks) {
    if (chunk?.id && !byId.has(chunk.id)) {
      byId.set(chunk.id, chunk)
    }
  }
  return Array.from(byId.values())
}

function dedupeSummaries(summaries: QuestionSummaryDoc[]): QuestionSummaryDoc[] {
  const byQuestionId = new Map<string, QuestionSummaryDoc>()
  for (const summary of summaries) {
    if (summary?.questionId && !byQuestionId.has(summary.questionId)) {
      byQuestionId.set(summary.questionId, summary)
    }
  }
  return Array.from(byQuestionId.values())
}

function buildCitations(chunks: RagChunk[]): AssistantCitation[] {
  const relevantChunks = chunks.some((chunk) => chunk.chunkType !== 'question_item')
    ? chunks.filter((chunk) => chunk.chunkType !== 'question_item')
    : chunks

  return relevantChunks.slice(0, 3).map((chunk) => ({
    chunkType: chunk.chunkType,
    questionNumbers: chunk.questionNumbers,
    paragraphLabels: chunk.paragraphLabels,
    excerpt: toExcerpt(chunk.content, 220)
  }))
}

function countChunkTypes(chunks: RagChunk[]): Record<string, number> {
  return chunks.reduce<Record<string, number>>((counts, chunk) => {
    counts[chunk.chunkType] = (counts[chunk.chunkType] ?? 0) + 1
    return counts
  }, {})
}

function buildFallbackFollowUps(mode: AssistantQueryRequest['mode'], locale: 'zh' | 'en'): string[] {
  if (locale === 'zh') {
    switch (mode) {
      case 'hint':
        return ['先回到我指出的段落核对线索。', '先标出题干中的关键词和转折词。', '先排除一个明显不成立的干扰项。']
      case 'explain':
        return ['把题干和证据句逐句对照。', '重点找同义改写，不要只盯原词。', '用一句话复述你的判断逻辑。']
      case 'review':
        return ['先重看我引用的证据句。', '写下你第一次误判的原因。', '再做一道相同题型巩固。']
      case 'similar':
        return ['先做我排在第一位的推荐文章。', '比较两篇题型和定位方式。', '做完后再复盘证据句。']
    }
  }

  switch (mode) {
    case 'hint':
      return ['Re-check the paragraph I pointed you to.', 'Mark the stem keywords and contrast words.', 'Eliminate one weak distractor first.']
    case 'explain':
      return ['Compare the stem with the evidence sentence.', 'Look for paraphrases instead of exact words.', 'Summarize the logic in one sentence.']
    case 'review':
      return ['Review the cited evidence again.', 'Note why your first choice failed.', 'Try one similar question next.']
    case 'similar':
      return ['Try the first recommended passage.', 'Compare the shared question type.', 'Review the evidence after you finish.']
  }
}

function normalizeAnswerSections(sections: unknown, fallbackAnswer: string): AssistantAnswerSection[] {
  const normalized = Array.isArray(sections)
    ? sections
        .map((item) => {
          if (!item || typeof item !== 'object') {
            return null
          }
          const type = (item as { type?: string }).type
          const text = (item as { text?: string }).text
          if (!type || typeof text !== 'string' || !SECTION_TYPES.includes(type as AssistantAnswerSectionType)) {
            return null
          }
          return createAnswerSection(type as AssistantAnswerSectionType, text)
        })
        .filter((section): section is AssistantAnswerSection => Boolean(section))
    : []

  if (normalized.length > 0) {
    return normalized
  }

  const fallback = compactMultiline(fallbackAnswer)
  if (!fallback) {
    return []
  }

  const paragraphs = fallback.split(/\n{2,}/).map((part) => compactMultiline(part)).filter(Boolean)
  if (paragraphs.length <= 1) {
    return [{ type: 'direct_answer', text: fallback }]
  }

  return paragraphs.slice(0, SECTION_TYPES.length).map((text, index) => ({ type: SECTION_TYPES[index], text }))
}

function decodeLooseJsonString(value: string): string {
  const parsed = safeJsonParse<string>(`"${value}"`)
  return typeof parsed === 'string'
    ? parsed.trim()
    : value.replace(/\\"/g, '"').replace(/\\n/g, '\n').replace(/\\\\/g, '\\').trim()
}

function salvageModelResponse(content: string): Partial<ParsedModelResponse> | null {
  const answerMatch = content.match(/["']answer["']\s*:\s*"([\s\S]*?)"\s*(?:,?\s*["'](?:answerSections|followUps|confidence|missingContext)["']\s*:|[}\n])/i)
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

  return { answer: decodeLooseJsonString(answerMatch[1]), followUps }
}

export function parseModelResponse(content: string, mode: AssistantQueryRequest['mode'], locale: 'zh' | 'en'): ParsedModelResponse {
  const jsonText = extractJsonObject(content)
  const parsed = jsonText ? safeJsonParse<Record<string, unknown>>(jsonText) : null

  if (parsed && typeof parsed.answer === 'string') {
    const missingContext = Array.isArray(parsed.missingContext)
      ? parsed.missingContext.filter((value): value is string => typeof value === 'string').map((value) => compactMultiline(value)).filter(Boolean)
      : []
    const answerSections = normalizeAnswerSections(parsed.answerSections, parsed.answer)

    return {
      answer: buildAnswerFromSections(answerSections, parsed.answer),
      answerSections,
      followUps: Array.isArray(parsed.followUps)
        ? parsed.followUps.filter((value): value is string => typeof value === 'string').map((value) => compactMultiline(value)).filter(Boolean).slice(0, 3)
        : buildFallbackFollowUps(mode, locale),
      confidence: normalizeConfidence(parsed.confidence, missingContext),
      missingContext,
      parseStrategy: 'json'
    }
  }

  const salvaged = salvageModelResponse(content)
  if (salvaged?.answer) {
    const answerSections = normalizeAnswerSections([], salvaged.answer)
    return {
      answer: buildAnswerFromSections(answerSections, salvaged.answer),
      answerSections,
      followUps: salvaged.followUps?.length ? salvaged.followUps : buildFallbackFollowUps(mode, locale),
      confidence: 'medium',
      missingContext: [],
      parseStrategy: 'salvaged'
    }
  }

  const answer = compactMultiline(content)
  const answerSections = normalizeAnswerSections([], answer)
  return {
    answer: buildAnswerFromSections(answerSections, answer),
    answerSections,
    followUps: buildFallbackFollowUps(mode, locale),
    confidence: 'medium',
    missingContext: [],
    parseStrategy: 'plain'
  }
}

function sortQuestionNumbers(values: string[]): string[] {
  return [...values].sort((left, right) => Number(left) - Number(right))
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

function extractQuestionPromptText(content: string): string {
  const promptMatch = content.match(/Prompt:\s*([\s\S]+)/i)
  const source = promptMatch?.[1] ?? content

  return source
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/^(TRUE|FALSE|NOT GIVEN|YES|NO|Options:|Question type:|Shared instructions:|Section:|Questions?\b)/i.test(line))
    .slice(0, 4)
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

function extractMentionedQuestionNumbers(request: AssistantQueryRequest, availableQuestionNumbers: Set<string>): string[] {
  const source = [
    request.userQuery ?? '',
    request.focusQuestionNumbers?.join(' ') ?? ''
  ].join('\n')

  const matches = [
    ...Array.from(source.matchAll(/\b(?:question|questions|q)\s*(\d{1,3})\b/gi)).map((match) => match[1]),
    ...Array.from(source.matchAll(/\u7B2C\s*(\d{1,3})\s*\u9898/g)).map((match) => match[1]),
    ...Array.from(source.matchAll(/(?:^|[^\d])(\d{1,3})\s*\u9898/g)).map((match) => match[1])
  ].filter((value) => availableQuestionNumbers.has(value))

  return sortQuestionNumbers(uniqueValues(matches))
}

function extractReferencedParagraphLabels(chunks: RagChunk[]): string[] {
  const labels = chunks.flatMap((chunk) => [
    ...chunk.paragraphLabels,
    ...Array.from(chunk.content.matchAll(/\bParagraph\s+([A-Z])\b/g)).map((match) => match[1])
  ])

  return uniqueValues(labels)
}

function filterChunksForMode(chunks: RagChunk[], mode: AssistantQueryRequest['mode']): RagChunk[] {
  switch (mode) {
    case 'hint':
      return chunks.filter((chunk) => !chunk.sensitive && ['passage_paragraph', 'question_item'].includes(chunk.chunkType))
    case 'explain':
      return chunks.filter((chunk) => !chunk.sensitive && ['passage_paragraph', 'question_item'].includes(chunk.chunkType))
    case 'review':
      return chunks.filter((chunk) => ['passage_paragraph', 'question_item', 'answer_key', 'answer_explanation'].includes(chunk.chunkType))
    case 'similar':
      return chunks
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

    const evidenceMatch = line.match(/^(?:Evidence|Original evidence|原文依据|原文)[:：]?\s*(.*)$/i)
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
  if (locale === 'zh') {
    switch (questionType) {
      case 'heading_matching':
        return '标题匹配题'
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
      case 'multiple_select':
        return '多选题'
      case 'radio_choice':
        return '单选题'
      case 'dropdown_choice':
        return '下拉选择题'
      default:
        return '雅思阅读题'
    }
  }

  switch (questionType) {
    case 'heading_matching':
      return 'heading matching'
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
    case 'multiple_select':
      return 'multiple-select question'
    case 'radio_choice':
      return 'single-choice selection'
    case 'dropdown_choice':
      return 'dropdown selection'
    default:
      return 'IELTS reading question'
  }
}

function buildWeakCategorySet(items: AssistantQueryRequest['recentPractice'] = []): Set<string> {
  if (!items.length) {
    return new Set()
  }

  const stats = new Map<string, { total: number; count: number }>()
  for (const item of items) {
    const current = stats.get(item.category) ?? { total: 0, count: 0 }
    stats.set(item.category, { total: current.total + item.accuracy, count: current.count + 1 })
  }

  return new Set(
    Array.from(stats.entries())
      .map(([category, value]) => ({ category, average: value.total / value.count }))
      .sort((left, right) => left.average - right.average)
      .slice(0, 2)
      .map((entry) => entry.category)
  )
}

function buildSimilarReason(current: QuestionSummaryDoc, candidate: QuestionSummaryDoc, locale: 'zh' | 'en', weakCategories: Set<string>): string {
  const sharedKeywords = candidate.keywords.filter((keyword) => current.keywords.includes(keyword)).slice(0, 3)
  const sharedTypes = candidate.questionTypes.filter((type) => current.questionTypes.includes(type)).slice(0, 2)
  const isWeakCategory = weakCategories.has(candidate.category)

  if (locale === 'zh') {
    const parts = [
      sharedKeywords.length > 0 ? `共同主题线索：${sharedKeywords.join('、')}` : '',
      sharedTypes.length > 0 ? `共同题型：${sharedTypes.join('、')}` : '',
      candidate.category === current.category ? `同一文章分类：${candidate.category}` : '',
      isWeakCategory ? `还能补你最近较弱的 ${candidate.category} 分类。` : ''
    ].filter(Boolean)

    return parts.join('；') || '主题和解题路径都和当前文章接近。'
  }

  const parts = [
    sharedKeywords.length > 0 ? `Shared topic cues: ${sharedKeywords.join(', ')}` : '',
    sharedTypes.length > 0 ? `Shared question types: ${sharedTypes.join(', ')}` : '',
    candidate.category === current.category ? `Same passage category: ${candidate.category}` : '',
    isWeakCategory ? 'Also helps a weaker recent category.' : ''
  ].filter(Boolean)

  return parts.join('. ') || 'Similar passage topic and IELTS reasoning pattern.'
}

function localSimilarityScore(current: QuestionSummaryDoc, candidate: QuestionSummaryDoc): number {
  const keywordScore = current.keywords.filter((keyword) => candidate.keywords.includes(keyword)).length * 2
  const typeScore = current.questionTypes.filter((type) => candidate.questionTypes.includes(type)).length * 1.5
  const categoryScore = current.category === candidate.category ? 0.5 : 0
  return keywordScore + typeScore + categoryScore
}

function buildSearchTerms(request: AssistantQueryRequest, focusQuestionChunks: RagChunk[]): string[] {
  return tokenizeSearchTerms([
    request.userQuery ?? '',
    request.attachments?.map((attachment) => attachment.text ?? '').join(' ') ?? '',
    ...focusQuestionChunks.map((chunk) => extractQuestionPromptText(chunk.content))
  ].join(' '))
}

function pickSupplementalPassageChunks(passageChunks: RagChunk[], request: AssistantQueryRequest, focusQuestionChunks: RagChunk[]): RagChunk[] {
  if (passageChunks.length === 0) {
    return []
  }

  const searchTerms = buildSearchTerms(request, focusQuestionChunks)
  if (searchTerms.length === 0) {
    return passageChunks.slice(0, PASSAGE_CONTEXT_FALLBACK_LIMIT)
  }

  return passageChunks
    .map((chunk, index) => ({ chunk, score: scorePassageChunkRelevance(chunk, searchTerms, index) }))
    .sort((left, right) => right.score - left.score)
    .slice(0, PASSAGE_CONTEXT_FALLBACK_LIMIT)
    .map((entry) => entry.chunk)
}

function buildSemanticQueryText(request: AssistantQueryRequest, focusQuestionChunks: RagChunk[]): string {
  const selectedAnswers = request.attemptContext?.selectedAnswers
    ? Object.entries(request.attemptContext.selectedAnswers).map(([key, value]) => `${key}=${value}`).join(' ')
    : ''

  return compactMultiline([
    request.userQuery ?? '',
    request.attachments?.map((attachment) => attachment.text ?? '').join('\n') ?? '',
    selectedAnswers,
    ...focusQuestionChunks.map((chunk) => chunk.content)
  ].join('\n'))
}

function scoreContextChunk(
  chunk: RagChunk,
  request: AssistantQueryRequest,
  focusQuestionNumbers: Set<string>,
  searchTerms: string[],
  semanticRankMap: Map<string, number>
): number {
  let score = 0
  const chunkTokens = new Set(tokenizeSearchTerms(chunk.content))

  if (chunk.questionNumbers.some((value) => focusQuestionNumbers.has(value))) {
    score += 6
  }
  if (request.mode === 'review' && chunk.chunkType === 'answer_explanation') {
    score += 6
  }
  if (request.mode === 'review' && chunk.chunkType === 'answer_key') {
    score += 3
  }
  if (chunk.chunkType === 'question_item') {
    score += request.mode === 'explain' ? 4 : 3
  }
  if (chunk.chunkType === 'passage_paragraph') {
    score += request.mode === 'hint' ? 4 : 3
  }
  if (chunk.paragraphLabels.length > 0) {
    score += 1
  }

  for (const term of searchTerms) {
    if (chunkTokens.has(term)) {
      score += 1
    }
  }

  if (semanticRankMap.has(chunk.id)) {
    score += Math.max(0, 4 - semanticRankMap.get(chunk.id)!)
  }

  return score
}

function buildMissingContextMessages(request: AssistantQueryRequest, chunks: RagChunk[], locale: 'zh' | 'en'): string[] {
  const missing: string[] = []
  if (!chunks.some((chunk) => chunk.chunkType === 'question_item')) {
    missing.push(locale === 'zh' ? '当前没有检索到题干内容。' : 'No question prompt was retrieved.')
  }
  if (request.mode !== 'similar' && !chunks.some((chunk) => chunk.chunkType === 'passage_paragraph')) {
    missing.push(locale === 'zh' ? '当前没有检索到足够的文章证据段落。' : 'No supporting passage paragraph was retrieved.')
  }
  if (request.mode === 'review' && !chunks.some((chunk) => chunk.chunkType === 'answer_explanation')) {
    missing.push(locale === 'zh' ? '当前没有检索到对应题号的官方解析。' : 'No official answer explanation was retrieved for the selected question.')
  }
  if (request.attachments?.some((attachment) => !attachment.text)) {
    missing.push(locale === 'zh' ? '部分附件没有可用的文本提取结果。' : 'Some attachments could not be parsed as text.')
  }
  return uniqueValues(missing)
}

function pickFocusQuestionNumbers(document: ParsedQuestionDocument, request: AssistantQueryRequest): string[] {
  const availableQuestionNumbers = new Set(document.questionChunks.flatMap((chunk) => chunk.questionNumbers))
  const explicit = request.focusQuestionNumbers?.filter((value) => availableQuestionNumbers.has(value)) ?? []
  if (explicit.length > 0) {
    return sortQuestionNumbers(uniqueValues(explicit))
  }

  const mentioned = extractMentionedQuestionNumbers(request, availableQuestionNumbers)
  if (mentioned.length > 0) {
    return mentioned
  }

  const wrongQuestions = request.attemptContext?.wrongQuestions?.filter((value) => availableQuestionNumbers.has(value)) ?? []
  if (wrongQuestions.length > 0) {
    return sortQuestionNumbers(uniqueValues(wrongQuestions)).slice(0, request.mode === 'review' ? 4 : 3)
  }

  const allQuestions = sortQuestionNumbers(Array.from(availableQuestionNumbers))
  return request.mode === 'explain' ? allQuestions.slice(0, Math.min(3, allQuestions.length)) : allQuestions.slice(0, 1)
}

function collectReviewItems(request: AssistantQueryRequest, answerExplanationChunks: RagChunk[]): AssistantReviewItem[] {
  const selectedAnswers = request.attemptContext?.selectedAnswers ?? {}
  const availableQuestionNumbers = new Set(answerExplanationChunks.flatMap((chunk) => chunk.questionNumbers))
  const mentionedQuestionNumbers = extractMentionedQuestionNumbers(request, availableQuestionNumbers)
  const targetQuestionNumbers = mentionedQuestionNumbers.length > 0 ? new Set(mentionedQuestionNumbers) : null

  return answerExplanationChunks
    .filter((chunk) => targetQuestionNumbers ? chunk.questionNumbers.some((value) => targetQuestionNumbers.has(value)) : true)
    .map((chunk) => {
      const item = parseReviewItem(chunk)
      return { ...item, selectedAnswer: selectedAnswers[item.questionNumber] }
    })
    .sort((left, right) => Number(left.questionNumber) - Number(right.questionNumber))
}

function shouldMaskHintLabels(chunks: RagChunk[]): boolean {
  const questionChunk = chunks.find((chunk) => chunk.chunkType === 'question_item')
  const questionType = questionChunk?.metadata.questionType
  if (questionType === 'paragraph_matching' || questionType === 'heading_matching') {
    return true
  }

  const normalizedContent = questionChunk?.content.toLowerCase() ?? ''
  return /\bwhich\s+(paragraph|section|heading)\b/.test(normalizedContent)
}

function sanitizeHintText(value: string, maskParagraphLabels: boolean): string {
  if (!value) {
    return value
  }

  let sanitized = value
    .replace(/\b(?:correct answer|answer is|choose|pick)\s+([A-Z])\b/gi, 'use the strongest supported option')
    .replace(/\boption\s+([A-Z])\b/gi, 'that option')
    .replace(/\bheading\s+([A-Z])\b/gi, 'the relevant heading')

  if (maskParagraphLabels) {
    sanitized = sanitized
      .replace(/\bparagraph\s+([A-Z])\b/gi, 'the relevant paragraph')
      .replace(/\bsection\s+([A-Z])\b/gi, 'the relevant section')
      .replace(/段落\s*([A-Z])/g, '相关段落')
  }

  return compactMultiline(sanitized)
}

function sanitizeHintResponse(response: AssistantQueryResponse, maskParagraphLabels: boolean): AssistantQueryResponse {
  const sanitizedAnswerSections = response.answerSections?.map((section) => ({
    ...section,
    text: sanitizeHintText(section.text, maskParagraphLabels)
  }))

  return {
    ...response,
    answer: sanitizeHintText(response.answer, maskParagraphLabels),
    answerSections: sanitizedAnswerSections,
    followUps: response.followUps.map((item) => sanitizeHintText(item, maskParagraphLabels)),
    usedParagraphLabels: maskParagraphLabels ? [] : response.usedParagraphLabels,
    citations: response.citations.map((citation) => ({
      ...citation,
      paragraphLabels: maskParagraphLabels ? [] : citation.paragraphLabels,
      excerpt: sanitizeHintText(citation.excerpt, maskParagraphLabels)
    }))
  }
}

function buildHintSections(question: QuestionIndexEntry, context: RetrievalContext, locale: 'zh' | 'en', contextChunks: RagChunk[]): AssistantAnswerSection[] {
  const questionChunk = contextChunks.find((chunk) => chunk.chunkType === 'question_item')
  const passageChunk = contextChunks.find((chunk) => chunk.chunkType === 'passage_paragraph')
  const focusQuestion = context.focusQuestionNumbers[0]
  const questionType = describeQuestionType(questionChunk?.metadata.questionType, locale)
  const paragraphHint = passageChunk?.paragraphLabels[0]
  const evidenceText = passageChunk ? toExcerpt(passageChunk.content, locale === 'zh' ? 160 : 180) : ''

  return [
    createAnswerSection('direct_answer', locale === 'zh'
      ? `${question.title} 这组题建议先从${focusQuestion ? `第 ${focusQuestion} 题` : '当前题组'}入手，优先回到${paragraphHint ? `段落 ${paragraphHint}` : '我引用的证据段'}附近找线索。`
      : `For ${question.title}, start with ${focusQuestion ? `Q${focusQuestion}` : 'the current question set'} and begin near ${paragraphHint ? `paragraph ${paragraphHint}` : 'the cited evidence area'}.`),
    createAnswerSection('reasoning', locale === 'zh'
      ? `先把它当作${questionType}来做：先看清题干要求，再标出关键词、对比词和限定词，然后用这些线索去缩小范围。`
      : `Treat it as ${questionType}: read the stem carefully, mark the key nouns, contrast words, and limits, then use those cues to narrow the search window.`),
    evidenceText ? createAnswerSection('evidence', locale === 'zh' ? `你现在最值得核对的证据是：${evidenceText}` : `The most useful evidence to inspect next is: ${evidenceText}`) : null,
    createAnswerSection('next_step', locale === 'zh'
      ? '先排除一个明显不成立的选项或段落，再决定最终答案，避免一上来就锁死。'
      : 'Eliminate one clearly weak option or paragraph first, then decide on the final answer instead of locking in too early.')
  ].filter((section): section is AssistantAnswerSection => Boolean(section))
}

function buildExplainSections(question: QuestionIndexEntry, context: RetrievalContext, locale: 'zh' | 'en', contextChunks: RagChunk[]): AssistantAnswerSection[] {
  const focusQuestions = context.focusQuestionNumbers.length > 0 ? context.focusQuestionNumbers.join(', ') : 'the current set'
  const questionChunk = contextChunks.find((chunk) => chunk.chunkType === 'question_item')
  const passageChunk = contextChunks.find((chunk) => chunk.chunkType === 'passage_paragraph')
  const questionType = describeQuestionType(questionChunk?.metadata.questionType, locale)
  const paragraphHint = passageChunk?.paragraphLabels[0]
  const evidenceText = passageChunk ? toExcerpt(passageChunk.content, locale === 'zh' ? 180 : 220) : ''

  return [
    createAnswerSection('direct_answer', locale === 'zh'
      ? `${question.title} 这组题最稳的做法，是把 Q${focusQuestions} 当作 ${questionType} 来处理，并先锁定最相关的证据段。`
      : `The safest way to work through ${question.title} is to handle Q${focusQuestions} as ${questionType} and lock onto the most relevant evidence paragraph first.`),
    createAnswerSection('reasoning', locale === 'zh'
      ? '先判断题目到底要找事实、对比、分类还是同义改写，再把题干和原文逐句对照，不要只看有没有出现完全相同的单词。'
      : 'First decide whether the task is asking for fact, comparison, classification, or paraphrase, then compare the stem against the passage sentence by sentence rather than chasing exact word matches.'),
    evidenceText ? createAnswerSection('evidence', locale === 'zh'
      ? `${paragraphHint ? `段落 ${paragraphHint}` : '相关证据段'}里最关键的线索是：${evidenceText}`
      : `The key clue in ${paragraphHint ? `paragraph ${paragraphHint}` : 'the supporting passage'} is: ${evidenceText}`) : null,
    createAnswerSection('next_step', locale === 'zh'
      ? '把你最终判断写成一句完整的话，只有放回原文语境后仍然完全成立，才说明你的答案真的站得住。'
      : 'State your final judgment as one full sentence; if it still holds when you place it back into the original passage context, the answer is much more likely to be sound.')
  ].filter((section): section is AssistantAnswerSection => Boolean(section))
}

function buildReviewSections(question: QuestionIndexEntry, request: AssistantQueryRequest, reviewItems: AssistantReviewItem[], locale: 'zh' | 'en'): AssistantAnswerSection[] {
  const item = reviewItems[0]
  if (!item) {
    return [
      createAnswerSection('direct_answer', locale === 'zh' ? `我暂时没有找到《${question.title}》对应题号的官方解析。` : `I could not find the official explanation for the selected item in "${question.title}".`),
      createAnswerSection('next_step', locale === 'zh' ? '先回到我引用的证据段，再把你的答案和标准答案逐项比对。' : 'Go back to the cited evidence, then compare your choice against the official answer one point at a time.')
    ].filter((section): section is AssistantAnswerSection => Boolean(section))
  }

  const submitted = request.attemptContext?.submitted
  const selectedLabel = item.selectedAnswer ?? (locale === 'zh' ? '未记录' : 'not recorded')

  return [
    createAnswerSection('direct_answer', locale === 'zh'
      ? `${submitted ? '这道错题' : '按你当前草稿来看'}，Q${item.questionNumber} 你选的是 ${selectedLabel}，但标准答案是 ${item.correctAnswer}。`
      : `${submitted ? 'For this reviewed mistake' : 'Based on your current draft'}, you chose ${selectedLabel} for Q${item.questionNumber}, but the official answer is ${item.correctAnswer}.`),
    createAnswerSection('reasoning', locale === 'zh' ? item.explanation || '当前只拿到了答案，没有拿到更细的官方解析。' : item.explanation || 'The official answer is available, but the detailed explanation is limited.'),
    createAnswerSection('evidence', locale === 'zh' ? item.evidence || '当前没有抽取到更明确的原文证据。' : item.evidence || 'No explicit passage evidence was extracted for this item.'),
    createAnswerSection('next_step', locale === 'zh'
      ? '下次先确认题干到底在问什么，再用证据句逐项排除干扰项，不要只因为局部词汇相似就下结论。'
      : 'Next time, confirm what the stem is really asking, then eliminate distractors against the evidence sentence instead of trusting partial word overlap.')
  ].filter((section): section is AssistantAnswerSection => Boolean(section))
}

function buildSimilarSections(question: QuestionIndexEntry, recommendedQuestions: SimilarQuestionRecommendation[], locale: 'zh' | 'en'): AssistantAnswerSection[] {
  return [
    createAnswerSection('direct_answer', locale === 'zh'
      ? `我为《${question.title}》挑了 ${recommendedQuestions.length} 篇下一步最值得练的相关文章。`
      : `I picked ${recommendedQuestions.length} follow-up passages worth practicing after "${question.title}".`),
    createAnswerSection('reasoning', locale === 'zh'
      ? recommendedQuestions[0]?.reason || '这些文章和当前文章在主题或题型上更接近。'
      : recommendedQuestions[0]?.reason || 'These passages are closer to the current topic or question pattern.'),
    createAnswerSection('next_step', locale === 'zh'
      ? '优先做列表里的第一篇，做完再回来看你在哪一步开始偏离证据。'
      : 'Start with the first recommendation, then review where your reasoning began to drift from the evidence.')
  ].filter((section): section is AssistantAnswerSection => Boolean(section))
}

export class AssistantService {
  private readonly provider: AssistantChatProvider | null
  private readonly logger: AssistantLogger
  private readonly questionLoader: (questionId: string) => Promise<QuestionIndexEntry>
  private readonly documentLoader: (question: QuestionIndexEntry) => Promise<ParsedQuestionDocument>
  private readonly summariesLoader: () => Promise<QuestionSummaryDoc[]>
  private readonly semanticSearch: AssistantSemanticSearch | null

  constructor(deps: AssistantServiceDeps = {}) {
    this.provider = deps.provider === undefined ? createAssistantChatProvider() : deps.provider
    this.logger = deps.logger ?? {}
    this.questionLoader = deps.questionLoader ?? defaultQuestionLoader
    this.documentLoader = deps.documentLoader ?? getParsedDocument
    this.summariesLoader = deps.summariesLoader ?? getAllSummaries
    this.semanticSearch = deps.semanticSearch === undefined ? createAssistantSemanticSearch() : deps.semanticSearch
  }

  private logFallback(reason: string, error: unknown) {
    this.logger.warn?.({ reason, detail: error instanceof Error ? error.message : String(error) }, 'Assistant provider unavailable; falling back to local response.')
  }

  private logRetrievalMetrics(questionId: string, request: AssistantQueryRequest, context: RetrievalContext) {
    this.logger.info?.({
      mode: request.mode,
      questionId,
      focusQuestionNumbers: context.focusQuestionNumbers,
      chunkCount: context.chunks.length,
      chunkTypes: countChunkTypes(context.chunks),
      usedQuestionNumbers: context.usedQuestionNumbers,
      usedParagraphLabels: context.usedParagraphLabels,
      missingContextCount: context.missingContext.length
    }, 'Assistant retrieval context collected.')
  }

  private logModelResponseMetrics(questionId: string, request: AssistantQueryRequest, response: ParsedModelResponse) {
    const payload = {
      mode: request.mode,
      questionId,
      parseStrategy: response.parseStrategy,
      answerSectionCount: response.answerSections.length,
      missingContextCount: response.missingContext.length
    }

    if (response.parseStrategy === 'json') {
      this.logger.info?.(payload, 'Assistant model response parsed.')
      return
    }

    this.logger.warn?.(payload, 'Assistant model response required recovery parsing.')
  }

  private finalizeResponse(request: AssistantQueryRequest, contextChunks: RagChunk[], response: AssistantQueryResponse): AssistantQueryResponse {
    if (request.mode !== 'hint') {
      return response
    }

    return sanitizeHintResponse(response, shouldMaskHintLabels(contextChunks))
  }

  private async getQuestion(questionId: string): Promise<QuestionIndexEntry> {
    return this.questionLoader(questionId)
  }

  private async generateAnswer(question: QuestionIndexEntry, request: AssistantQueryRequest, context: RetrievalContext): Promise<ParsedModelResponse> {
    if (!this.provider) {
      throw new Error('Assistant provider is not configured.')
    }

    const prompt = buildAssistantPrompt({
      mode: request.mode,
      locale: resolveLocale(request),
      question,
      userQuery: request.userQuery,
      history: request.history,
      attachments: request.attachments,
      focusQuestionNumbers: context.focusQuestionNumbers,
      attemptContext: request.attemptContext,
      recentPractice: request.recentPractice,
      contextChunks: context.chunks
    })

    const parsed = parseModelResponse(await this.provider.generate(prompt), request.mode, resolveLocale(request))
    this.logModelResponseMetrics(question.id, request, parsed)
    return parsed
  }

  private async collectContext(question: QuestionIndexEntry, document: ParsedQuestionDocument, request: AssistantQueryRequest): Promise<RetrievalContext> {
    const focusQuestionNumbers = pickFocusQuestionNumbers(document, request)
    const focusSet = new Set(focusQuestionNumbers)
    const budget = MODE_CONTEXT_LIMIT[request.mode as 'hint' | 'explain' | 'review']
    const allowed = filterChunksForMode(document.allChunks, request.mode)

    const focusQuestionChunks = allowed.filter((chunk) => chunk.chunkType === 'question_item' && (focusSet.size === 0 || chunk.questionNumbers.some((value) => focusSet.has(value))))
    const focusAnswerChunks = request.mode === 'review'
      ? allowed.filter((chunk) => ['answer_key', 'answer_explanation'].includes(chunk.chunkType) && (focusSet.size === 0 || chunk.questionNumbers.some((value) => focusSet.has(value))))
      : []
    const referencedParagraphs = new Set([...extractReferencedParagraphLabels(focusQuestionChunks), ...extractReferencedParagraphLabels(focusAnswerChunks)])
    const focusPassageChunks = allowed.filter((chunk) => chunk.chunkType === 'passage_paragraph' && chunk.paragraphLabels.some((label) => referencedParagraphs.has(label)))
    const supplementalPassages = focusPassageChunks.length === 0 ? pickSupplementalPassageChunks(allowed.filter((chunk) => chunk.chunkType === 'passage_paragraph'), request, focusQuestionChunks) : []
    const deterministic = dedupeChunks([...focusQuestionChunks, ...focusAnswerChunks, ...focusPassageChunks, ...supplementalPassages])

    let semanticChunks: RagChunk[] = []
    if (this.semanticSearch) {
      try {
        const queryText = buildSemanticQueryText(request, focusQuestionChunks)
        if (queryText) {
          semanticChunks = filterChunksForMode(await this.semanticSearch.searchChunks({
            questionId: question.id,
            queryText,
            limit: MODE_SEMANTIC_LIMIT[request.mode as 'hint' | 'explain' | 'review']
          }), request.mode)
        }
      } catch (error) {
        this.logger.warn?.({ mode: request.mode, detail: error instanceof Error ? error.message : String(error) }, 'Semantic chunk search failed; continuing with deterministic context.')
      }
    }

    const semanticRankMap = new Map<string, number>()
    semanticChunks.forEach((chunk, index) => semanticRankMap.set(chunk.id, index))
    const searchTerms = buildSearchTerms(request, focusQuestionChunks)
    const merged = dedupeChunks([...deterministic, ...semanticChunks])
    const finalChunks = dedupeChunks(
      [...deterministic, ...merged.sort((left, right) => (
        scoreContextChunk(right, request, focusSet, searchTerms, semanticRankMap) -
        scoreContextChunk(left, request, focusSet, searchTerms, semanticRankMap)
      ))]
    ).slice(0, budget)

    const context = {
      chunks: finalChunks,
      focusQuestionNumbers,
      usedQuestionNumbers: sortQuestionNumbers(uniqueValues(finalChunks.flatMap((chunk) => chunk.questionNumbers))),
      usedParagraphLabels: uniqueValues(finalChunks.flatMap((chunk) => chunk.paragraphLabels)).sort(),
      missingContext: buildMissingContextMessages(request, finalChunks, resolveLocale(request))
    }

    this.logRetrievalMetrics(question.id, request, context)
    return context
  }

  private async buildSimilarResponse(question: QuestionIndexEntry, request: AssistantQueryRequest): Promise<AssistantQueryResponse> {
    const locale = resolveLocale(request)
    const currentDocument = await this.documentLoader(question)
    const summaries = await this.summariesLoader()
    const recentPractice = request.recentPractice ?? []
    const recentIds = new Set(recentPractice.map((item) => item.questionId))
    const weakCategories = buildWeakCategorySet(recentPractice)

    let semanticSummaries: QuestionSummaryDoc[] = []
    if (this.semanticSearch) {
      try {
        semanticSummaries = await this.semanticSearch.searchSummaries({
          queryText: compactMultiline([currentDocument.summary.content, recentPractice.map((item) => `${item.category} ${item.accuracy}`).join(' ')].join('\n')),
          limit: 12,
          excludeQuestionIds: [question.id]
        })
      } catch (error) {
        this.logger.warn?.({ detail: error instanceof Error ? error.message : String(error) }, 'Semantic summary search failed; falling back to local similarity scoring.')
      }
    }

    const semanticRankMap = new Map<string, number>()
    semanticSummaries.forEach((summary, index) => semanticRankMap.set(summary.questionId, index))

    const ranked = dedupeSummaries([...semanticSummaries, ...summaries])
      .filter((summary) => summary.questionId !== question.id)
      .map((summary) => {
        let score = localSimilarityScore(currentDocument.summary, summary)
        if (semanticRankMap.has(summary.questionId)) {
          score += Math.max(0, 6 - semanticRankMap.get(summary.questionId)!)
        }
        if (weakCategories.has(summary.category)) {
          score += 1.5
        }
        if (recentIds.has(summary.questionId)) {
          score -= 8
        }
        return { summary, score }
      })
      .sort((left, right) => right.score - left.score)

    const preferred = ranked.filter(({ summary }) => !recentIds.has(summary.questionId))
    const fallback = ranked.filter(({ summary }) => recentIds.has(summary.questionId))
    const recommendations = [...preferred, ...fallback].slice(0, MAX_SIMILAR_RECOMMENDATIONS)
    const recommendedQuestions: SimilarQuestionRecommendation[] = recommendations.map(({ summary }) => ({
      questionId: summary.questionId,
      title: summary.title,
      reason: buildSimilarReason(currentDocument.summary, summary, locale, weakCategories)
    }))
    const answerSections = buildSimilarSections(question, recommendedQuestions, locale)

    this.logger.info?.({
      mode: 'similar',
      questionId: question.id,
      semanticCandidateCount: semanticSummaries.length,
      candidateCount: ranked.length,
      recommendedCount: recommendedQuestions.length,
      recentPracticeCount: recentPractice.length
    }, 'Assistant similar recommendations ranked.')

    return {
      answer: buildAnswerFromSections(answerSections),
      answerSections,
      citations: recommendations.map(({ summary }) => ({ chunkType: 'question_summary', questionNumbers: [], paragraphLabels: [], excerpt: toExcerpt(summary.content) })),
      followUps: buildFallbackFollowUps('similar', locale),
      recommendedQuestions,
      confidence: recommendedQuestions.length >= 3 ? 'high' : 'medium',
      missingContext: []
    }
  }

  private buildLocalTutoringResponse(question: QuestionIndexEntry, request: AssistantQueryRequest, context: RetrievalContext): AssistantQueryResponse {
    const locale = resolveLocale(request)
    const answerSections = request.mode === 'hint' ? buildHintSections(question, context, locale, context.chunks) : buildExplainSections(question, context, locale, context.chunks)
    return this.finalizeResponse(request, context.chunks, {
      answer: buildAnswerFromSections(answerSections),
      answerSections,
      citations: buildCitations(context.chunks),
      followUps: buildFallbackFollowUps(request.mode, locale),
      usedQuestionNumbers: context.usedQuestionNumbers,
      usedParagraphLabels: context.usedParagraphLabels,
      confidence: normalizeConfidence(undefined, context.missingContext),
      missingContext: context.missingContext
    })
  }

  private buildLocalReviewResponse(question: QuestionIndexEntry, request: AssistantQueryRequest, context: RetrievalContext, reviewItems: AssistantReviewItem[]): AssistantQueryResponse {
    const answerSections = buildReviewSections(question, request, reviewItems, resolveLocale(request))
    return {
      answer: buildAnswerFromSections(answerSections),
      answerSections,
      citations: buildCitations(context.chunks),
      followUps: buildFallbackFollowUps('review', resolveLocale(request)),
      reviewItems,
      usedQuestionNumbers: context.usedQuestionNumbers,
      usedParagraphLabels: context.usedParagraphLabels,
      confidence: normalizeConfidence(undefined, context.missingContext),
      missingContext: context.missingContext
    }
  }

  private buildGroundedResponse(context: RetrievalContext, modelResponse: ParsedModelResponse, citations: AssistantCitation[]) {
    return {
      answer: modelResponse.answer,
      answerSections: modelResponse.answerSections,
      citations,
      followUps: uniqueValues(modelResponse.followUps).slice(0, 3),
      usedQuestionNumbers: context.usedQuestionNumbers,
      usedParagraphLabels: context.usedParagraphLabels,
      confidence: normalizeConfidence(modelResponse.confidence, [...context.missingContext, ...modelResponse.missingContext]),
      missingContext: uniqueValues([...context.missingContext, ...modelResponse.missingContext])
    }
  }

  private async queryLocally(question: QuestionIndexEntry, request: AssistantQueryRequest): Promise<AssistantQueryResponse> {
    if (request.mode === 'similar') {
      return this.buildSimilarResponse(question, request)
    }

    const document = await this.documentLoader(question)
    const context = await this.collectContext(question, document, request)
    if (request.mode === 'review') {
      return this.buildLocalReviewResponse(question, request, context, collectReviewItems(request, document.answerExplanationChunks))
    }
    return this.buildLocalTutoringResponse(question, request, context)
  }

  private async queryWithProvider(question: QuestionIndexEntry, request: AssistantQueryRequest): Promise<AssistantQueryResponse> {
    if (request.mode === 'similar') {
      return this.buildSimilarResponse(question, request)
    }

    const document = await this.documentLoader(question)
    const context = await this.collectContext(question, document, request)
    const citations = buildCitations(context.chunks)

    if (request.mode === 'review') {
      const reviewItems = collectReviewItems(request, document.answerExplanationChunks)
      if (reviewItems.length === 0 || context.chunks.length === 0) {
        return this.buildLocalReviewResponse(question, request, context, reviewItems)
      }
      return { ...this.buildGroundedResponse(context, await this.generateAnswer(question, request, context), citations), reviewItems }
    }

    if (context.chunks.length === 0) {
      return this.buildLocalTutoringResponse(question, request, context)
    }

    return this.finalizeResponse(
      request,
      context.chunks,
      this.buildGroundedResponse(context, await this.generateAnswer(question, request, context), citations)
    )
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
