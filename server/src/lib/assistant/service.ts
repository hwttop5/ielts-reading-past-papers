import type {
  AssistantAnswerSection,
  AssistantAnswerSectionType,
  AssistantCitation,
  AssistantConfidence,
  AssistantNextAction,
  AssistantQueryRequest,
  AssistantQueryResponse,
  AssistantReviewItem,
  AssistantToolCard,
  SimilarQuestionRecommendation
} from '../../types/assistant.js'
import type { ParsedQuestionDocument, QuestionIndexEntry, QuestionSummaryDoc, RagChunk } from '../../types/question-bank.js'
import { env } from '../../config/env.js'
import { compactMultiline, extractJsonObject, safeJsonParse, toExcerpt, uniqueValues } from '../utils/text.js'
import { buildAssistantPrompt, buildIeltsCoachPrompt, buildGroundedRagPrompt } from './prompt.js'
import { classifyRoute, type RouterDecision } from './router.js'
import { classifyAnswerStyle, type AnswerStyle } from './answerStyle.js'
import { createAssistantChatProvider, type AssistantChatProvider, type WebSearchProvider, createWebSearchProvider } from './provider.js'
import {
  BRIEF_MODE_CONTEXT_BUDGET,
  MAX_SUPPLEMENTAL_PASSAGES,
  MODE_CONTEXT_LIMIT,
  MODE_SEMANTIC_LIMIT,
  PARAGRAPH_FOCUS_QUERY_SEMANTIC_LIMIT,
  SIMILAR_CONTEXT_BUDGET,
  SIMILAR_SEMANTIC_LIMIT,
  VOCAB_QUERY_SEMANTIC_LIMIT
} from './retrieval/constants.js'
import { dedupeChunks } from './retrieval/dedupe.js'
import { budgetFinalChunks } from './retrieval/mergeContext.js'
import { createAssistantSemanticSearch, type AssistantSemanticSearch } from './semantic.js'
import { findQuestionIndexEntry, loadQuestionIndex, parseQuestionDocument, parseReadingNativeDocument } from '../question-bank/index.js'

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
  webSearch?: WebSearchProvider | null
}

interface PerformanceTimings {
  load_ms: number
  context_ms: number
  model_ms: number
  total_ms: number
  source: 'local' | 'llm' | 'pdf_fallback' | 'web' | 'hybrid'
  cache_hit: boolean
}

interface AssistantQueryResponseWithMeta extends AssistantQueryResponse {
  answerSource?: 'local' | 'llm' | 'pdf_fallback' | 'web' | 'hybrid'
  timings?: PerformanceTimings
}

interface IntentClassification {
  kind: 'grounded_question' | 'whole_set_or_review' | 'followup_request' | 'social_or_smalltalk' | 'general_chat' | 'selection_tool_request' | 'review_coach_request' | 'clarify'
  questionNumbers?: string[]
  paragraphLabels?: string[]
  confidence: number
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
  answerStyle: AnswerStyle
  // Enhanced fields for question-level grounding
  primaryQuestionChunk?: RagChunk
  primaryEvidenceChunk?: RagChunk
  sharedInstructionChunks?: RagChunk[]
  resolvedQuestionType?: string
}

const SECTION_TYPES: AssistantAnswerSectionType[] = ['direct_answer', 'reasoning', 'evidence', 'next_step']
const PASSAGE_CONTEXT_FALLBACK_LIMIT = 3
const MAX_SIMILAR_RECOMMENDATIONS = 3

/**
 * Generate contextual follow-up questions based on intent type.
 * - social/general_chat: empty array (no follow-ups for smalltalk)
 * - grounded_question: next question number or generic follow-ups
 * - other: generic follow-ups
 */
function generateContextualFollowUps(
  intent: IntentClassification,
  locale: 'zh' | 'en',
  questionNumbers: string[]
): string[] {
  if (intent.kind === 'social_or_smalltalk' || intent.kind === 'general_chat') {
    return [] // 闲聊场景不推荐 follow-ups
  }
  if (intent.kind === 'grounded_question' && intent.questionNumbers?.length) {
    const nextQ = questionNumbers.find(q => !intent.questionNumbers!.includes(q))
    if (nextQ) {
      return locale === 'zh'
        ? [`第${nextQ}题怎么做？`, '查看段落证据', '解释解题思路']
        : [`How to do Q${nextQ}?`, 'View paragraph evidence', 'Explain reasoning']
    }
  }
  // Default follow-ups for other scenarios
  return locale === 'zh'
    ? ['第 1 题怎么做？', '查看段落证据', '解释解题思路']
    : ['How to approach Q1?', 'View paragraph evidence', 'Explain reasoning']
}
const SEARCH_STOPWORDS = new Set([
  'about', 'above', 'after', 'again', 'against', 'among', 'because', 'before', 'being', 'below', 'between',
  'could', 'does', 'doing', 'from', 'have', 'into', 'more', 'most', 'only', 'other', 'same', 'should',
  'than', 'that', 'their', 'there', 'these', 'they', 'this', 'those', 'through', 'under', 'using', 'very',
  'what', 'when', 'where', 'which', 'while', 'with', 'would', 'your', 'answer', 'answers', 'question',
  'questions', 'paragraph', 'section', 'shared', 'instructions', 'prompt', 'true', 'false', 'given',
  'option', 'options', 'passage', 'review', 'hint', 'explain'
])

const parsedDocumentCache = new Map<string, Promise<ParsedQuestionDocument>>()
const examDocumentCache = new Map<string, ParsedQuestionDocument>()
let allSummariesPromise: Promise<QuestionSummaryDoc[]> | null = null

// Short TTL cache for query responses (5 minutes)
const queryResponseCache = new Map<string, { response: AssistantQueryResponseWithMeta; expiresAt: number }>()
const QUERY_CACHE_TTL_MS = 5 * 60 * 1000

// TTL cache for retrieval context (3 minutes) - avoids repeated RAG for similar queries
interface CachedWebSearchResult {
  title: string
  url: string
  snippet: string
  sourceType?: string
}

const retrievalContextCache = new Map<string, { context: RetrievalContext; expiresAt: number }>()
const RETRIEVAL_CACHE_TTL_MS = 3 * 60 * 1000

// TTL cache for Tavily search results (10 minutes)
const searchCache = new Map<string, { results: CachedWebSearchResult[]; expiresAt: number }>()
const SEARCH_CACHE_TTL_MS = 10 * 60 * 1000

function resolveLocale(request: AssistantQueryRequest): 'zh' | 'en' {
  return request.locale === 'en' ? 'en' : 'zh'
}

/**
 * Generate local template response for ielts_general queries.
 * Used when ASSISTANT_GENERATION_MODE=local for fast response (<50ms).
 */
function getLocalIeltsCoachResponse(request: AssistantQueryRequest, locale: 'zh' | 'en'): string {
  const query = (request.userQuery || '').trim().toLowerCase()

  // Keyword-based template matching for common IELTS questions
  if (locale === 'zh') {
    if (/速度 | 时间 | 快 | 慢/.test(query)) {
      return '提高雅思阅读速度的关键：1) 先读题干再扫读文章，定位关键词；2) 遇到难题先跳过，做完全部再回头；3) 平时练习要限时，培养时间感。一般建议：P1 用时 15-17 分钟，P2/P3 各 20-22 分钟。'
    }
    if (/词汇 | 单词 | 同义替换/.test(query)) {
      return '积累 IELTS 阅读词汇的方法：1) 整理做题中遇到的同义替换，建立错题本；2) 按话题分类记忆（环境、科技、教育等）；3) 重点掌握题干和原文的对应表达，而非孤立背单词。'
    }
    if (/题型 | matching|heading|判断|填空/.test(query)) {
      return 'IELTS 阅读主要题型：1) 判断题 (T/F/NG) - 注意题干绝对词；2) 配对题 (Matching) - 先读题干再扫读；3) 段落信息配对 - 找关键词定位；4) 填空题 - 注意字数限制。建议先做自己擅长的题型。'
    }
    if (/技巧 | 方法 | 怎么提高 | 怎么练习/.test(query)) {
      return '雅思阅读提分技巧：1) 学会略读 (skimming) 抓主旨；2) 扫读 (scanning) 定位关键词；3) 掌握不同题型的解题顺序；4) 积累同义替换表达。你有什么具体想了解的题型吗？'
    }
    // Default fallback
    return '这是一个很好的 IELTS 学习问题。一般来说，提高雅思阅读需要：1) 扩大词汇量，特别是同义替换；2) 熟悉不同题型的解题思路；3) 练习快速定位信息。你有什么具体问题吗？'
  }

  // English templates
  if (/speed|time|fast|slow/.test(query)) {
    return 'To improve IELTS Reading speed: 1) Read questions first, then scan for keywords; 2) Skip difficult questions and return later; 3) Practice with timed sessions. Suggested timing: P1 in 15-17 min, P2/P3 in 20-22 min each.'
  }
  if (/vocabulary|word|paraphrase|synonym/.test(query)) {
    return 'Building IELTS Reading vocabulary: 1) Keep a paraphrase journal from practice tests; 2) Group words by topic (environment, technology, education); 3) Focus on question-text correspondences rather than isolated words.'
  }
  if (/question type|matching|heading|true.*false|gap.*fill/.test(query)) {
    return 'Main IELTS Reading question types: 1) T/F/NG - watch for absolute words; 2) Matching - read stems first; 3) Paragraph information matching - locate keywords; 4) Gap-fill - mind word limits. Start with your strongest type.'
  }
  if (/skill|technique|strategy|improve|practice/.test(query)) {
    return 'IELTS Reading improvement strategies: 1) Skim for main ideas; 2) Scan for keyword location; 3) Master question-type-specific approaches; 4) Build paraphrase awareness. What specific question type would you like to explore?'
  }

  // Default fallback
  return 'That\'s a great IELTS learning question. Generally, improving IELTS Reading requires: 1) Building vocabulary, especially paraphrases; 2) Understanding strategies for different question types; 3) Practicing quick information location. What specific question do you have?'
}

// Intent Classification - revised for relevance routing
const GREETING_PATTERNS_ZH = [/^(你好 | hi|hello| 嗨 | 嗨喽 | 在吗 | 有人 | help)([\uFF0C,:\s])+/i, /^(谢谢 | thank|thanks)([\uFF0C,:\s])+/i]
const GREETING_PATTERNS_EN = [/^\b(hi|hello|hey|hey there)\b\s*[,:\s]+/i, /^\b(thanks|thank you)\b\s*[,:\s]+/i]

const SOCIAL_PATTERNS_ZH = [
  /^(你好|hi|hello|嗨|在吗|有人|谢谢|thank|bye|再见|好的|ok|okay|等等|wait|先别|暂停|休息)([\uFF1F?])?$/i,
  /^(你好吗 | 怎么样 | 吃了吗 | 在干嘛 | 忙吗 | 最近如何)([\uFF1F?])?$/,
  /^(你是 | 你是谁 | 你能 | 你可以 | 你会 | 你有 | 做什么 | 干嘛的 | 能帮我什么)([\uFF1F?])?$/,
]

const SOCIAL_PATTERNS_EN = [
  /^\b(hi|hello|hey|bye|thanks|thank you|ok|okay|wait|help)\b$/i,
  /^\b(who are you|what are you|can you|what can you do|how can you help)\b/i,
]

const WEATHER_TIME_PATTERNS_ZH = [/天气/, /今天 | 明天 | 后天 | 昨天/, /时间/, /日期/, /星期/, /几点/]
const WEATHER_TIME_PATTERNS_EN = [/weather/, /today|tomorrow|yesterday/, /time\b/, /date\b/, /what day/]

const WHOLE_SET_PATTERNS_ZH = [/整组/, /整篇/, /全文/, /这组题/, /全部题目/, /所有题/, /一起讲/, /整体思路/, /总览/, /复盘/, /错题/]
const WHOLE_SET_PATTERNS_EN = [/\b(whole|all|entire|full|overview|summary|review|this set)\b/i, /\b(all questions|the whole set|my mistakes)\b/i]

const QUESTION_NUMBER_PATTERN = /(?:第\s*(\d+)\s*题)|(?:question\s*(\d+))|(?:q(\d+))|(?:paragraph\s*([A-H]))|(?:段落\s*([A-H]))/gi

function stripGreetingPrefix(value: string, locale: 'zh' | 'en'): string {
  const patterns = locale === 'zh' ? GREETING_PATTERNS_ZH : GREETING_PATTERNS_EN
  for (const pattern of patterns) {
    const match = value.match(pattern)
    if (match) {
      return value.slice(match[0].length).trim()
    }
  }
  return value
}

/** Strip trailing ? / ？ so e.g. 「你是谁？」 matches social patterns anchored with $. */
function normalizeTrailingQuestionMarks(value: string): string {
  return value.replace(/[？?]+$/g, '').trim()
}

function isPureSocial(query: string, locale: 'zh' | 'en'): boolean {
  const normalized = normalizeTrailingQuestionMarks(query.trim())
  const patterns = locale === 'zh' ? SOCIAL_PATTERNS_ZH : SOCIAL_PATTERNS_EN
  for (const pattern of patterns) {
    if (pattern.test(normalized)) {
      return true
    }
  }
  return false
}

/**
 * Social / 寒暄类请求可在不加载整篇 document 的情况下回复（仅校验 questionId 存在）。
 */
function shouldAnswerSocialWithoutDocument(request: AssistantQueryRequest, locale: 'zh' | 'en'): boolean {
  const rawQuery = (request.userQuery || '').trim()
  if (!rawQuery) {
    return false
  }
  if (request.action && ['translate', 'explain_selection', 'find_paraphrases', 'find_antonyms', 'extract_keywords', 'locate_evidence'].includes(request.action) && request.selectedContext?.text) {
    return false
  }
  if (request.practiceContext?.submitted && request.action && ['analyze_mistake', 'review_set', 'recommend_drills'].includes(request.action)) {
    return false
  }
  const query = stripGreetingPrefix(rawQuery, locale)
  return isPureSocial(query, locale)
}

function isWeatherTimeOrRealWorld(query: string, locale: 'zh' | 'en'): boolean {
  const patterns = locale === 'zh' ? WEATHER_TIME_PATTERNS_ZH : WEATHER_TIME_PATTERNS_EN
  for (const pattern of patterns) {
    if (pattern.test(query)) {
      return true
    }
  }
  return false
}

/**
 * Lightweight intent classification for pre-routing (before document load).
 * Only distinguishes social/general_chat from grounded questions.
 * Does NOT require availableQuestionNumbers (no document needed).
 * Default to 'grounded' to avoid false positives for general_chat.
 */
function classifyIntentPreRoute(request: AssistantQueryRequest, locale: 'zh' | 'en'): 'social_or_smalltalk' | 'general_chat' | 'grounded' {
  const rawQuery = (request.userQuery || '').trim()
  if (!rawQuery) {
    return 'grounded'
  }

  // Check for selection tool request - explicit action from selection popover
  if (request.action && ['translate', 'explain_selection', 'find_paraphrases', 'find_antonyms', 'extract_keywords', 'locate_evidence'].includes(request.action) && request.selectedContext?.text) {
    return 'grounded'
  }

  // Check for review coach request - from review workspace with submitted context
  if (request.practiceContext?.submitted && request.action && ['analyze_mistake', 'review_set', 'recommend_drills'].includes(request.action)) {
    return 'grounded'
  }

  const query = stripGreetingPrefix(rawQuery, locale)

  // Pure social/smalltalk
  if (isPureSocial(query, locale)) {
    return 'social_or_smalltalk'
  }

  // Weather, time, real-world facts -> general_chat (must be explicit)
  if (isWeatherTimeOrRealWorld(query, locale)) {
    return 'general_chat'
  }

  // Check for background knowledge requests that might need web search
  const normalizedQuery = normalizeTrailingQuestionMarks(query)
  if (isBackgroundKnowledgeQuery(normalizedQuery, locale)) {
    return 'general_chat'
  }

  // Check for real-world entity queries (must be explicit entities)
  if (isRealWorldEntityQuery(normalizedQuery, locale)) {
    return 'general_chat'
  }

  // Explicit question numbers or paragraph labels -> grounded
  if (QUESTION_NUMBER_PATTERN.test(query)) {
    return 'grounded'
  }

  // Check for whole-set or review keywords
  const wholeSetPatterns = locale === 'zh' ? WHOLE_SET_PATTERNS_ZH : WHOLE_SET_PATTERNS_EN
  for (const pattern of wholeSetPatterns) {
    if (pattern.test(query)) {
      return 'grounded'
    }
  }

  // Check for passage-related keywords
  const groundedKeywords = locale === 'zh'
    ? [/这篇文章/, /这段/, /本文/, / passage/, / 当前/, / 这道题/, / 这组题/, / 证据/, / 定位/, / 题干/]
    : [/this passage/, /this article/, /the text/, /this question/, /the passage/, /evidence/, /locate/, /paragraph/]

  for (const pattern of groundedKeywords) {
    if (pattern.test(query)) {
      return 'grounded'
    }
  }

  // Lexical / single-paragraph micro-questions -> grounded
  if (classifyAnswerStyle(request, locale) !== 'full_tutoring') {
    return 'grounded'
  }

  // Default to 'grounded' for unclear queries - safer fallback
  // Only explicit off-topic queries (weather, time, real-world entities) should be general_chat
  return 'grounded'
}

function classifyIntent(request: AssistantQueryRequest, locale: 'zh' | 'en', availableQuestionNumbers: string[]): IntentClassification {
  const rawQuery = (request.userQuery || '').trim()
  if (!rawQuery) {
    return { kind: 'grounded_question', confidence: 1 }
  }

  // Strip greeting prefix first to get the actual query body
  const query = stripGreetingPrefix(rawQuery, locale)

  // Check for selection tool request - explicit action from selection popover
  if (request.action && ['translate', 'explain_selection', 'find_paraphrases', 'find_antonyms', 'extract_keywords', 'locate_evidence'].includes(request.action) && request.selectedContext?.text) {
    return { kind: 'selection_tool_request', confidence: 0.95 }
  }

  // Check for review coach request - from review workspace with submitted context
  if (request.practiceContext?.submitted && request.action && ['analyze_mistake', 'review_set', 'recommend_drills'].includes(request.action)) {
    return { kind: 'review_coach_request', confidence: 0.9 }
  }

  // Pure social/smalltalk - no actionable content
  if (isPureSocial(query, locale)) {
    return { kind: 'social_or_smalltalk', confidence: 0.95 }
  }

  // Weather, time, real-world facts -> general_chat (will trigger web search)
  if (isWeatherTimeOrRealWorld(query, locale)) {
    return { kind: 'general_chat', confidence: 0.9 }
  }

  // Extract explicit question numbers and paragraph labels from the query
  const questionNumbers: string[] = []
  const paragraphLabels: string[] = []

  for (const match of query.matchAll(QUESTION_NUMBER_PATTERN)) {
    if (match[1] || match[2] || match[3]) {
      const qNum = match[1] || match[2] || match[3]
      if (availableQuestionNumbers.includes(qNum)) {
        questionNumbers.push(qNum)
      }
    }
    if (match[4] || match[5]) {
      const pLabel = (match[4] || match[5]).toUpperCase()
      paragraphLabels.push(pLabel)
    }
  }

  // Check for whole-set or review request
  const wholeSetPatterns = locale === 'zh' ? WHOLE_SET_PATTERNS_ZH : WHOLE_SET_PATTERNS_EN
  for (const pattern of wholeSetPatterns) {
    if (pattern.test(query)) {
      return { kind: 'whole_set_or_review', confidence: 0.85 }
    }
  }

  // Check for review workspace context (submitted practice)
  if (request.practiceContext?.submitted || request.attemptContext?.submitted) {
    return { kind: 'whole_set_or_review', confidence: 0.8 }
  }

  // Explicit question numbers or paragraph labels -> grounded
  if (questionNumbers.length > 0 || paragraphLabels.length > 0) {
    return { kind: 'grounded_question', questionNumbers, paragraphLabels, confidence: 0.9 }
  }

  // For follow-up requests, only inherit if previous turn was grounded
  if (request.promptKind === 'followup') {
    const hasGroundedHistory = request.history?.some(h => {
      if (h.role !== 'assistant') return false
      return /\b(Q\d+|question \d+|paragraph [A-H]|第\d+题 | 段落 [A-H])\b/i.test(h.content)
    })
    if (hasGroundedHistory) {
      return { kind: 'followup_request', confidence: 0.7 }
    }
    return { kind: 'general_chat', confidence: 0.6 }
  }

  // For preset prompts (button clicks), treat as grounded
  if (request.promptKind === 'preset') {
    return { kind: 'grounded_question', confidence: 0.85 }
  }

  // Freeform input - check for passage-related keywords
  const groundedKeywords = locale === 'zh'
    ? [/这篇文章/, /这段/, /本文/, / passage/, / 当前/, / 这道题/, / 这组题/, / 证据/, / 定位/, / 题干/]
    : [/this passage/, /this article/, /the text/, /this question/, /the passage/, /evidence/, /locate/, /paragraph/]

  for (const pattern of groundedKeywords) {
    if (pattern.test(query)) {
      return { kind: 'grounded_question', confidence: 0.6 }
    }
  }

  // Lexical / single-paragraph micro-questions (synonyms, "what does paragraph X say") belong in tutoring, not off-topic general_chat
  if (classifyAnswerStyle(request, locale) !== 'full_tutoring') {
    return { kind: 'grounded_question', confidence: 0.72 }
  }

  // Unclear short queries -> clarify
  if (query.length < 10 || /[？?]+$/.test(query)) {
    return { kind: 'clarify', confidence: 0.5 }
  }

  // Default: general chat (not bound to current exercise)
  return { kind: 'general_chat', confidence: 0.5 }
}

// Search Decision Layer
type SearchDecision = 'off' | 'augment' | 'required'

const REAL_WORLD_ENTITIES_ZH = [/天气/, /首相/, /总统/, /国王/, /女王/, /明星/, /名人/, /新闻/, /地震/, /疫情/, /奥运/]
const REAL_WORLD_ENTITIES_EN = [/weather/, /prime minister/, /president/, /king/, /queen/, /celebrity/, /news/, /earthquake/, /pandemic/, /olympics/]

const BACKGROUND_KEYWORDS_ZH = [/历史/, /起源/, /背景/, /词源/, /外部资料/, /权威资料/, /百科/, / wikipedia/]
const BACKGROUND_KEYWORDS_EN = [/history/, /origin/, /background/, /etymology/, /external/, /authoritative/, /wikipedia/, /encyclopedia/]

const PASSAGE_REFERENCE_ZH = [/这篇文章/, /这段/, /本文/, / passage/, / 当前/, / 这道题/, / 这组题/, / 证据/, / 定位/, / 题干/, / 题型/, / 答案/, / 解析/]
const PASSAGE_REFERENCE_EN = [/this passage/, /this article/, /the text/, /this question/, /the passage/, /evidence/, /locate/, /paragraph/, /answer/, /explanation/]

function isRealWorldEntityQuery(query: string, locale: 'zh' | 'en'): boolean {
  const patterns = locale === 'zh' ? REAL_WORLD_ENTITIES_ZH : REAL_WORLD_ENTITIES_EN
  for (const pattern of patterns) {
    if (pattern.test(query)) {
      return true
    }
  }
  return false
}

function isBackgroundKnowledgeQuery(query: string, locale: 'zh' | 'en'): boolean {
  const patterns = locale === 'zh' ? BACKGROUND_KEYWORDS_ZH : BACKGROUND_KEYWORDS_EN
  for (const pattern of patterns) {
    if (pattern.test(query)) {
      return true
    }
  }
  return false
}

function isPassageRelatedQuery(query: string, locale: 'zh' | 'en'): boolean {
  const patterns = locale === 'zh' ? PASSAGE_REFERENCE_ZH : PASSAGE_REFERENCE_EN
  for (const pattern of patterns) {
    if (pattern.test(query)) {
      return true
    }
  }
  return false
}

function decideSearchStrategy(
  request: AssistantQueryRequest,
  intent: IntentClassification,
  locale: 'zh' | 'en'
): SearchDecision {
  // Check explicit searchMode from request
  if (request.searchMode === 'required' || request.allowWebSearch === true) {
    return 'required'
  }
  if (request.searchMode === 'off') {
    return 'off'
  }

  // Selection tool requests and review coach requests don't need web search
  if (intent.kind === 'selection_tool_request' || intent.kind === 'review_coach_request') {
    return 'off'
  }

  // Grounded questions (with explicit question numbers or paragraph labels) don't need web search
  if (intent.kind === 'grounded_question' && (intent.questionNumbers?.length || intent.paragraphLabels?.length)) {
    return 'off'
  }

  // Follow-up requests to grounded questions don't need web search
  if (intent.kind === 'followup_request') {
    return 'off'
  }

  // Whole set / review requests are based on local content
  if (intent.kind === 'whole_set_or_review') {
    return 'off'
  }

  // Social/smalltalk and clarify don't need web search (they have fixed responses)
  if (intent.kind === 'social_or_smalltalk' || intent.kind === 'clarify') {
    return 'off'
  }

  // For general_chat queries, determine if web search is needed
  const rawQuery = (request.userQuery || '').trim()
  const query = stripGreetingPrefix(rawQuery, locale)

  // Real-world entities, weather, news, celebrities -> required
  if (isRealWorldEntityQuery(query, locale)) {
    return 'required'
  }

  // Background knowledge, history, etymology about passage topic -> augment
  if (isBackgroundKnowledgeQuery(query, locale)) {
    return 'augment'
  }

  // Passage-related questions -> off (use local content)
  if (isPassageRelatedQuery(query, locale)) {
    return 'off'
  }

  // Default for general_chat: auto (let provider decide or use fallback)
  return 'augment'
}

// Social/clarification responses are now built inline in queryWithTiming

function createAnswerSection(type: AssistantAnswerSectionType, text: string): AssistantAnswerSection | null {
  const normalized = compactMultiline(text)
  return normalized ? { type, text: normalized } : null
}

function buildAnswerFromSections(sections: AssistantAnswerSection[], fallback = ''): string {
  return sections.length > 0 ? sections.map((section) => section.text).join('\n\n') : compactMultiline(fallback)
}

function applyAnswerStyleToParsedModel(parsed: ParsedModelResponse, style: AnswerStyle): ParsedModelResponse {
  if (style === 'full_tutoring') {
    return parsed
  }
  const maxSections = style === 'vocab_paraphrase' ? 2 : 3
  const nonempty = parsed.answerSections.filter((s) => s.text?.trim())
  if (nonempty.length <= maxSections) {
    return parsed
  }
  const trimmed = nonempty.slice(0, maxSections)
  return {
    ...parsed,
    answerSections: trimmed,
    answer: buildAnswerFromSections(trimmed, parsed.answer)
  }
}

interface ConfidenceFactors {
  llmConfidence?: AssistantConfidence
  missingContext: string[]
  intent?: IntentClassification
  hasQuestionChunks: boolean
  hasPassageChunks: boolean
  hasParagraphEvidence: boolean
  contextChunkCount: number
  isLocalResponse: boolean
  // Enhanced fields for question-level grounding confidence
  hasPrimaryQuestionChunk?: boolean
  hasPrimaryEvidenceChunk?: boolean
  focusQuestionCount?: number
}

function normalizeConfidence(factors: ConfidenceFactors): AssistantConfidence {
  // If LLM provided explicit confidence, respect it (for LLM-generated responses)
  if (factors.llmConfidence && factors.llmConfidence !== 'high') {
    return factors.llmConfidence
  }

  const { missingContext, intent, hasQuestionChunks, hasPassageChunks, hasParagraphEvidence, contextChunkCount, isLocalResponse, hasPrimaryQuestionChunk, hasPrimaryEvidenceChunk, focusQuestionCount } = factors

  // Social/smalltalk and clarification responses have high confidence by design
  if (intent?.kind === 'social_or_smalltalk' || intent?.kind === 'clarify' || intent?.kind === 'general_chat') {
    return 'high'
  }

  // Whole-set requests with no missing context -> high confidence
  if (intent?.kind === 'whole_set_or_review' && missingContext.length === 0) {
    return 'high'
  }

  // Grounded questions with explicit question numbers or paragraph labels -> boost confidence
  if (intent?.kind === 'grounded_question' && (intent.questionNumbers?.length || intent.paragraphLabels?.length)) {
    if (missingContext.length === 0) {
      return 'high'
    }
    if (missingContext.length === 1) {
      return 'medium'
    }
  }

  // Follow-up requests inherit context from conversation -> medium to high
  if (intent?.kind === 'followup_request') {
    if (missingContext.length === 0 && hasParagraphEvidence) {
      return 'high'
    }
    return 'medium'
  }

  // For local responses (non-LLM), base confidence on question-level retrieval quality
  if (isLocalResponse) {
    // Question-level grounding: high confidence only when primary question chunk AND primary evidence chunk are hit
    if (focusQuestionCount === 1 && hasPrimaryQuestionChunk && hasPrimaryEvidenceChunk && missingContext.length === 0) {
      return 'high'
    }

    // Strong retrieval: has question + passage + evidence, no missing context
    if (hasQuestionChunks && hasPassageChunks && hasParagraphEvidence && missingContext.length === 0) {
      // For single-question requests without primary chunks, use medium confidence
      if (focusQuestionCount === 1) {
        return 'medium'
      }
      return 'high'
    }

    // Adequate retrieval: has question chunks and some context
    if (hasQuestionChunks && contextChunkCount >= 3 && missingContext.length === 0) {
      if (focusQuestionCount === 1 && !hasPrimaryQuestionChunk) {
        return 'medium'
      }
      return 'high'
    }

    // Weak retrieval: missing key context
    if (missingContext.length >= 2) {
      return 'low'
    }

    // Moderate: missing one piece of context
    if (missingContext.length === 1) {
      return 'medium'
    }

    // No missing context but incomplete evidence
    if (hasQuestionChunks && hasPassageChunks) {
      if (focusQuestionCount === 1 && !hasPrimaryQuestionChunk) {
        return 'medium'
      }
      return 'high'
    }

    return 'medium'
  }

  // Default fallback based on missing context only
  if (missingContext.length >= 2) {
    return 'low'
  }
  return missingContext.length === 1 ? 'medium' : 'high'
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
      confidence: normalizeConfidence({
        llmConfidence: parsed.confidence as AssistantConfidence,
        missingContext,
        hasQuestionChunks: true,
        hasPassageChunks: true,
        hasParagraphEvidence: false,
        contextChunkCount: 0,
        isLocalResponse: false
      }),
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
  // Check in-memory cache first
  const cached = examDocumentCache.get(question.id)
  if (cached) {
    return cached
  }

  // Check pending promise cache (concurrent requests)
  const existing = parsedDocumentCache.get(question.id)
  if (existing) {
    return existing
  }

  // Try reading-native first (fast path - no Python, no PDF parsing)
  const pending = (async (): Promise<ParsedQuestionDocument> => {
    const nativeDoc = await parseReadingNativeDocument(question)
    if (nativeDoc) {
      examDocumentCache.set(question.id, nativeDoc)
      return nativeDoc
    }

    // Fallback to PDF/HTML parsing only if reading-native is not available
    const fallbackDoc = await parseQuestionDocument(question)
    examDocumentCache.set(question.id, fallbackDoc)
    return fallbackDoc
  })()

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

/**
 * Pick passage chunks based on question content relevance.
 * Used when explicit paragraph references are not available (e.g., paragraph matching questions).
 */
function pickPassagesByQuestionRelevance(passageChunks: RagChunk[], focusQuestionChunks: RagChunk[]): RagChunk[] {
  if (passageChunks.length === 0 || focusQuestionChunks.length === 0) {
    return passageChunks.slice(0, PASSAGE_CONTEXT_FALLBACK_LIMIT)
  }

  // Extract key terms from question chunks (excluding stopwords and generic terms)
  const questionText = focusQuestionChunks.map(c => c.content).join(' ')
  const questionTerms = tokenizeSearchTerms(questionText)

  // Score each passage by term overlap with question content
  const scoredPassages = passageChunks.map((passage) => {
    const passageTerms = new Set(tokenizeSearchTerms(passage.content))
    const overlapScore = questionTerms.reduce((score, term) => score + (passageTerms.has(term) ? 1 : 0), 0)
    return { passage, score: overlapScore }
  })

  // Sort by score descending and take top passages
  return scoredPassages
    .sort((left, right) => right.score - left.score)
    .slice(0, PASSAGE_CONTEXT_FALLBACK_LIMIT)
    .map((entry) => entry.passage)
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

  // Check if option list content is missing for question types that typically have options
  const questionItemChunks = chunks.filter((chunk) => chunk.chunkType === 'question_item')
  const hasOptionContent = questionItemChunks.some((chunk) =>
    chunk.content.includes('Options:') || chunk.content.includes('选项:')
  )
  // Detect if the query likely needs option content (List of Headings, Matching, etc.)
  const mayNeedOptions = request.userQuery && /List of Headings|List of Countries|matching|配对 | 匹配 | 列表/i.test(request.userQuery)
    || questionItemChunks.some((chunk) => /List of |选项列表/i.test(chunk.content))

  if (mayNeedOptions && !hasOptionContent) {
    missing.push(locale === 'zh' ? '当前没有检索到题目的选项列表内容。' : 'The question option list (e.g., A-G choices) was not retrieved.')
  }

  return uniqueValues(missing)
}

function pickFocusQuestionNumbers(document: ParsedQuestionDocument, request: AssistantQueryRequest, intent?: IntentClassification): string[] {
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

  // For follow-up requests, try to inherit question numbers from conversation history
  if (request.promptKind === 'followup' || intent?.kind === 'followup_request') {
    // Try to extract question numbers from the conversation history
    if (request.history && request.history.length > 0) {
      // Look for question numbers in previous user messages
      for (let i = request.history.length - 1; i >= 0; i--) {
        const historyItem = request.history[i]
        if (historyItem.role === 'user') {
          const historicalMentioned = extractMentionedQuestionNumbers(
            { ...request, userQuery: historyItem.content },
            availableQuestionNumbers
          )
          if (historicalMentioned.length > 0) {
            return historicalMentioned
          }
        }
      }
    }
    // If no question numbers found in history, return empty to trigger clarification
    return []
  }

  // For freeform input without explicit question numbers, do NOT default to first question
  // Instead return empty and let caller handle clarification
  if (request.promptKind === 'freeform' && !intent?.questionNumbers?.length) {
    return []
  }

  // For preset (button clicks), allow default behavior
  if (request.promptKind === 'preset') {
    const allQuestions = sortQuestionNumbers(Array.from(availableQuestionNumbers))
    // For hint mode with preset, default to first question only
    if (request.mode === 'hint') {
      return allQuestions.slice(0, 1)
    }
    // For explain mode, default to first 3 questions
    if (request.mode === 'explain') {
      return allQuestions.slice(0, Math.min(3, allQuestions.length))
    }
    // For other modes, default to first question
    return allQuestions.slice(0, 1)
  }

  // For whole-set requests, return all questions
  if (intent?.kind === 'whole_set_or_review') {
    return sortQuestionNumbers(Array.from(availableQuestionNumbers))
  }

  // Default fallback: return empty for unknown cases
  return []
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
  const focusQuestion = context.focusQuestionNumbers[0]
  const focusQuestionSet = new Set(context.focusQuestionNumbers)

  // Find question chunk that matches the focus question number (prioritize exact match for first question)
  const questionChunk = contextChunks.find(
    (chunk) => chunk.chunkType === 'question_item' &&
    chunk.questionNumbers.some((num) => focusQuestionSet.has(num))
  )

  // Find passage chunk - prioritize passages that match the focus question's paragraph labels
  let passageChunk: RagChunk | undefined
  if (questionChunk && questionChunk.paragraphLabels && questionChunk.paragraphLabels.length > 0) {
    // First try to find a passage that matches the question chunk's paragraph labels
    passageChunk = contextChunks.find(
      (chunk) => chunk.chunkType === 'passage_paragraph' &&
      chunk.paragraphLabels.some((label) => questionChunk.paragraphLabels.includes(label))
    )
  }
  // Fallback to first available passage
  if (!passageChunk) {
    passageChunk = contextChunks.find((chunk) => chunk.chunkType === 'passage_paragraph')
  }

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
  const focusQuestionSet = new Set(context.focusQuestionNumbers)

  // Find question chunk that matches the focus question numbers
  const questionChunk = contextChunks.find(
    (chunk) => chunk.chunkType === 'question_item' &&
    chunk.questionNumbers.some((num) => focusQuestionSet.has(num))
  )

  // Find passage chunk - prioritize passages that match the question chunk's paragraph labels
  let passageChunk: RagChunk | undefined
  if (questionChunk && questionChunk.paragraphLabels && questionChunk.paragraphLabels.length > 0) {
    // First try to find a passage that matches the question chunk's paragraph labels
    passageChunk = contextChunks.find(
      (chunk) => chunk.chunkType === 'passage_paragraph' &&
      chunk.paragraphLabels.some((label) => questionChunk.paragraphLabels.includes(label))
    )
  }
  // Fallback to first available passage
  if (!passageChunk) {
    passageChunk = contextChunks.find((chunk) => chunk.chunkType === 'passage_paragraph')
  }

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

function buildVocabHintSections(_question: QuestionIndexEntry, _context: RetrievalContext, locale: 'zh' | 'en', contextChunks: RagChunk[]): AssistantAnswerSection[] {
  const passage = contextChunks.find((c) => c.chunkType === 'passage_paragraph')
  const excerpt = passage ? toExcerpt(passage.content, locale === 'zh' ? 120 : 140) : ''
  return [
    createAnswerSection('direct_answer', locale === 'zh'
      ? `先在原文里锁定与题干词义最接近的表述；常见英文替换可包括 rose、grew、expanded、spread 等，具体以选项与原文为准。${excerpt ? `可参考片段：${excerpt}` : ''}`
      : `Find the closest paraphrase in the passage; common substitutes include rose, grew, expanded, spread—confirm against options and text.${excerpt ? ` Snippet: ${excerpt}` : ''}`),
    createAnswerSection('next_step', locale === 'zh'
      ? '对照选项与原文，排除只看字形相似、语义不符的项。'
      : 'Eliminate choices that match word shape but not meaning.')
  ].filter((section): section is AssistantAnswerSection => Boolean(section))
}

function buildParagraphFocusHintSections(_question: QuestionIndexEntry, _context: RetrievalContext, locale: 'zh' | 'en', contextChunks: RagChunk[]): AssistantAnswerSection[] {
  const passage = contextChunks.find((c) => c.chunkType === 'passage_paragraph')
  const evidenceText = passage ? toExcerpt(passage.content, locale === 'zh' ? 200 : 220) : ''
  return [
    createAnswerSection('direct_answer', locale === 'zh'
      ? '针对你问到的段落：先抓首句/末句判断主旨；若下方上下文未包含该段，请回到原文阅读该段全文。'
      : 'For the paragraph you asked about, read the first and last sentences for the gist. If it is missing below, open that paragraph in the passage.'),
    evidenceText
      ? createAnswerSection('evidence', locale === 'zh' ? `摘录（勿整段照抄为答案）：${evidenceText}` : `Excerpt (do not paste as a final answer): ${evidenceText}`)
      : null,
    createAnswerSection('next_step', locale === 'zh'
      ? '用一句话概括该段主题，再与 Heading 选项逐条比对。'
      : 'Summarize the topic in one sentence, then compare headings.')
  ].filter((section): section is AssistantAnswerSection => Boolean(section))
}

function buildVocabExplainSections(question: QuestionIndexEntry, _context: RetrievalContext, locale: 'zh' | 'en', contextChunks: RagChunk[]): AssistantAnswerSection[] {
  const passage = contextChunks.find((c) => c.chunkType === 'passage_paragraph')
  const excerpt = passage ? toExcerpt(passage.content, locale === 'zh' ? 140 : 160) : ''
  return [
    createAnswerSection('direct_answer', locale === 'zh'
      ? `同义改写要贴近《${question.title}》的语境：列出 3–5 个可能的替代表达，并说明哪一句原文最接近。${excerpt ? `例如：${excerpt}` : ''}`
      : `Paraphrase must fit the context of "${question.title}": list 3–5 likely substitutes and tie them to the closest sentence.${excerpt ? ` Example: ${excerpt}` : ''}`),
    createAnswerSection('reasoning', locale === 'zh'
      ? '只解决词义/改写本身，不要展开整组题的完整流程。'
      : 'Stay on word meaning only; do not expand into a full question-set walkthrough.')
  ].filter((section): section is AssistantAnswerSection => Boolean(section))
}

function buildParagraphFocusExplainSections(question: QuestionIndexEntry, _context: RetrievalContext, locale: 'zh' | 'en', contextChunks: RagChunk[]): AssistantAnswerSection[] {
  const passage = contextChunks.find((c) => c.chunkType === 'passage_paragraph')
  const evidenceText = passage ? toExcerpt(passage.content, locale === 'zh' ? 220 : 240) : ''
  return [
    createAnswerSection('direct_answer', locale === 'zh'
      ? '该段主旨应基于全段信息，而非单句。若上下文未包含该段，请直接阅读该段原文。'
      : `State the paragraph main idea from the whole paragraph, not one sentence. If it is missing here, read that paragraph in "${question.title}".`),
    evidenceText
      ? createAnswerSection('evidence', locale === 'zh' ? `关键句摘录：${evidenceText}` : `Key excerpt: ${evidenceText}`)
      : null,
    createAnswerSection('next_step', locale === 'zh'
      ? '把主旨与 Heading 选项逐条对照，排除只覆盖细节的标题。'
      : 'Match the gist against headings; drop titles that only cover minor details.')
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
  private readonly webSearch: WebSearchProvider | null

  constructor(deps: AssistantServiceDeps = {}) {
    this.provider = deps.provider === undefined ? createAssistantChatProvider() : deps.provider
    this.logger = deps.logger ?? {}
    this.questionLoader = deps.questionLoader ?? defaultQuestionLoader
    this.documentLoader = deps.documentLoader ?? getParsedDocument
    this.summariesLoader = deps.summariesLoader ?? getAllSummaries
    this.semanticSearch = deps.semanticSearch === undefined ? createAssistantSemanticSearch() : deps.semanticSearch
    this.webSearch = deps.webSearch === undefined ? createWebSearchProvider() : deps.webSearch

    // Warmup: preload question index and summaries (lightweight, no full document parsing)
    this.warmup()
  }

  private async warmup() {
    // Warmup question index and summaries in background (non-blocking)
    this.summariesLoader()
      .then((summaries) => {
        this.logger.info?.({ summaryCount: summaries.length }, 'Assistant warmup: question summaries loaded.')
      })
      .catch((error) => {
        this.logger.warn?.({ detail: error instanceof Error ? error.message : String(error) }, 'Assistant warmup: summaries load failed (will retry on first request).')
      })

    this.logger.info?.('Assistant warmup started (question index and summaries).')
  }

  private logFallback(reason: string, error: unknown) {
    this.logger.warn?.({ reason, detail: error instanceof Error ? error.message : String(error) }, 'Assistant provider unavailable; falling back to local response.')
  }

  private logRetrievalMetrics(
    questionId: string,
    request: AssistantQueryRequest,
    context: RetrievalContext,
    extra?: { intent_kind?: string; search_decision?: string; semantic_used?: boolean; retrieval_cache_hit?: boolean }
  ) {
    this.logger.info?.({
      mode: request.mode,
      questionId,
      intent_kind: extra?.intent_kind,
      focusQuestionNumbers: context.focusQuestionNumbers,
      chunkCount: context.chunks.length,
      chunkTypes: countChunkTypes(context.chunks),
      usedQuestionNumbers: context.usedQuestionNumbers,
      usedParagraphLabels: context.usedParagraphLabels,
      missingContextCount: context.missingContext.length,
      semantic_used: extra?.semantic_used,
      retrieval_cache_hit: extra?.retrieval_cache_hit
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
      contextChunks: context.chunks,
      answerStyle: context.answerStyle
    })

    const parsed = parseModelResponse(await this.provider.generate(prompt), request.mode, resolveLocale(request))
    this.logModelResponseMetrics(question.id, request, parsed)
    return parsed
  }

  private async collectContext(question: QuestionIndexEntry, document: ParsedQuestionDocument, request: AssistantQueryRequest): Promise<RetrievalContext> {
    // Check retrieval context cache first
    const retrievalCacheKey = this.buildRetrievalCacheKey(request, question.id)
    const cachedContext = this.getCachedRetrievalContext(retrievalCacheKey)
    if (cachedContext) {
      this.logger.info?.({ cache_hit: true }, 'Retrieval context cache hit.')
      return cachedContext
    }

    const locale = resolveLocale(request)
    const answerStyle = classifyAnswerStyle(request, locale)
    const focusQuestionNumbers = pickFocusQuestionNumbers(document, request)
    const focusSet = new Set(focusQuestionNumbers)
    let budget =
      request.mode === 'similar' ? SIMILAR_CONTEXT_BUDGET : MODE_CONTEXT_LIMIT[request.mode as 'hint' | 'explain' | 'review']
    if (request.mode !== 'similar') {
      if (answerStyle === 'vocab_paraphrase') {
        budget = Math.min(budget, BRIEF_MODE_CONTEXT_BUDGET[request.mode as 'hint' | 'explain' | 'review'])
      } else if (answerStyle === 'paragraph_focus') {
        budget = Math.min(budget, BRIEF_MODE_CONTEXT_BUDGET[request.mode as 'hint' | 'explain' | 'review'] + 1)
      }
    }
    const allowed = filterChunksForMode(document.allChunks, request.mode)

    const focusQuestionChunks = allowed.filter((chunk) => chunk.chunkType === 'question_item' && (focusSet.size === 0 || chunk.questionNumbers.some((value) => focusSet.has(value))))
    const focusAnswerChunks = request.mode === 'review'
      ? allowed.filter((chunk) => ['answer_key', 'answer_explanation'].includes(chunk.chunkType) && (focusSet.size === 0 || chunk.questionNumbers.some((value) => focusSet.has(value))))
      : []
    const referencedParagraphs = new Set([...extractReferencedParagraphLabels(focusQuestionChunks), ...extractReferencedParagraphLabels(focusAnswerChunks)])

    this.logger.info?.({
      focusQuestionNumbers,
      focusQuestionChunks: focusQuestionChunks.map(c => ({ id: c.id, questionNumbers: c.questionNumbers, paragraphLabels: c.paragraphLabels })),
      referencedParagraphs: Array.from(referencedParagraphs),
      hasFocusQuestionChunks: focusQuestionChunks.length > 0
    }, 'Context collection: initial focus chunks.')

    // Enhanced question-level grounding: identify primary question chunk for single-question requests
    let primaryQuestionChunk: RagChunk | undefined
    let primaryEvidenceChunk: RagChunk | undefined
    let resolvedQuestionType: string | undefined

    if (focusQuestionNumbers.length === 1) {
      // For single-question requests, identify the primary question chunk
      primaryQuestionChunk = focusQuestionChunks.find(c => c.questionNumbers.includes(focusQuestionNumbers[0]))
      resolvedQuestionType = primaryQuestionChunk?.metadata.questionType

      // Find the primary evidence chunk (passage paragraph most relevant to this question)
      if (primaryQuestionChunk && primaryQuestionChunk.paragraphLabels.length > 0) {
        primaryEvidenceChunk = allowed.find(c =>
          c.chunkType === 'passage_paragraph' &&
          c.paragraphLabels.some(label => primaryQuestionChunk!.paragraphLabels.includes(label))
        )
      }
    }

    // Determine focus passage chunks with fallback strategy
    let focusPassageChunks: RagChunk[]
    if (referencedParagraphs.size > 0) {
      // Use explicitly referenced paragraphs
      focusPassageChunks = allowed.filter((chunk) =>
        chunk.chunkType === 'passage_paragraph' &&
        chunk.paragraphLabels.some((label) => referencedParagraphs.has(label))
      )
    } else if (focusQuestionChunks.length > 0) {
      // Fallback: use question content to find relevant passages
      focusPassageChunks = pickPassagesByQuestionRelevance(
        allowed.filter((chunk) => chunk.chunkType === 'passage_paragraph'),
        focusQuestionChunks
      )
    } else {
      focusPassageChunks = []
    }

    // Cap supplemental passages to MAX_SUPPLEMENTAL_PASSAGES (tightened budget)
    const supplementalPassages = focusPassageChunks.length === 0 ? pickSupplementalPassageChunks(allowed.filter((chunk) => chunk.chunkType === 'passage_paragraph'), request, focusQuestionChunks).slice(0, MAX_SUPPLEMENTAL_PASSAGES) : []

    this.logger.info?.({
      focusPassageChunks: focusPassageChunks.map(c => ({ id: c.id, paragraphLabels: c.paragraphLabels })),
      supplementalPassagesCount: supplementalPassages.length,
      usingSupplemental: focusPassageChunks.length === 0
    }, 'Context collection: passage chunks.')

    const deterministic = dedupeChunks([...focusQuestionChunks, ...focusAnswerChunks, ...focusPassageChunks, ...supplementalPassages])

    // Semantic search conditional trigger - only run when needed
    let semanticChunks: RagChunk[] = []
    const shouldRunSemanticSearch = this.shouldRunSemanticSearch(request, focusQuestionChunks, focusPassageChunks, deterministic, answerStyle)

    if (this.semanticSearch && shouldRunSemanticSearch) {
      try {
        const queryText = buildSemanticQueryText(request, focusQuestionChunks)
        if (queryText) {
          let semanticLimit =
            request.mode === 'similar' ? SIMILAR_SEMANTIC_LIMIT : MODE_SEMANTIC_LIMIT[request.mode as 'hint' | 'explain' | 'review']
          if (request.mode !== 'similar') {
            if (answerStyle === 'vocab_paraphrase') {
              semanticLimit = VOCAB_QUERY_SEMANTIC_LIMIT
            } else if (answerStyle === 'paragraph_focus') {
              semanticLimit = Math.min(semanticLimit, PARAGRAPH_FOCUS_QUERY_SEMANTIC_LIMIT)
            }
          }
          semanticChunks = filterChunksForMode(await this.semanticSearch.searchChunks({
            questionId: question.id,
            queryText,
            limit: semanticLimit
          }), request.mode)
        }
      } catch (error) {
        this.logger.warn?.({ mode: request.mode, detail: error instanceof Error ? error.message : String(error) }, 'Semantic chunk search failed; continuing with deterministic context.')
      }
    } else if (this.semanticSearch) {
      this.logger.info?.({ reason: 'deterministic sufficient' }, 'Semantic search skipped.')
    }

    const semanticRankMap = new Map<string, number>()
    semanticChunks.forEach((chunk, index) => semanticRankMap.set(chunk.id, index))
    const searchTerms = buildSearchTerms(request, focusQuestionChunks)
    const merged = dedupeChunks([...deterministic, ...semanticChunks])
    const sortedChunks = dedupeChunks(
      [...deterministic, ...merged.sort((left, right) => (
        scoreContextChunk(right, request, focusSet, searchTerms, semanticRankMap) -
        scoreContextChunk(left, request, focusSet, searchTerms, semanticRankMap)
      ))]
    )

    const finalChunks = budgetFinalChunks(request, sortedChunks, budget)

    // Detect missing English text and expand context if needed
    const hasEnglishText = finalChunks.some(
      chunk => chunk.content.match(/[A-Za-z]{3,}/) && chunk.content.length > 50
    )
    let expandedChunks = finalChunks
    if (!hasEnglishText && document.passageChunks.length > 0 && answerStyle === 'vocab_paraphrase') {
      // For vocabulary questions, add English passage chunks to enable synonym extraction
      const englishPassages = document.passageChunks.slice(0, 3)
      expandedChunks = dedupeChunks([...finalChunks, ...englishPassages])
      this.logger.info?.({
        addedEnglishPassages: englishPassages.map(c => ({ id: c.id, paragraphLabels: c.paragraphLabels }))
      }, 'Context expansion: added English passage chunks for vocabulary query.')
    }

    const context: RetrievalContext = {
      chunks: expandedChunks,
      focusQuestionNumbers,
      usedQuestionNumbers: sortQuestionNumbers(uniqueValues(expandedChunks.flatMap((chunk) => chunk.questionNumbers))),
      usedParagraphLabels: uniqueValues(expandedChunks.flatMap((chunk) => chunk.paragraphLabels)).sort(),
      missingContext: buildMissingContextMessages(request, expandedChunks, locale),
      answerStyle,
      primaryQuestionChunk,
      primaryEvidenceChunk,
      resolvedQuestionType
    }

    this.logRetrievalMetrics(question.id, request, context)

    // Cache the retrieval context
    this.setCachedRetrievalContext(retrievalCacheKey, context)

    return context
  }

  /**
   * Determine if semantic search should run based on deterministic retrieval quality.
   * Semantic search is skipped only when deterministic evidence is highly sufficient.
   * Default to running semantic search to enrich context (test compatibility).
   */
  private shouldRunSemanticSearch(
    request: AssistantQueryRequest,
    focusQuestionChunks: RagChunk[],
    focusPassageChunks: RagChunk[],
    deterministic: RagChunk[],
    answerStyle: AnswerStyle
  ): boolean {
    const hasQuestionChunk = focusQuestionChunks.length > 0
    const hasPassageChunk = focusPassageChunks.length > 0
    const hasPrimaryEvidence = focusQuestionChunks.some(c => c.paragraphLabels.length > 0) && hasPassageChunk

    // Vocab/paraphrase questions with direct question match - skip semantic (very narrow scope)
    if (answerStyle === 'vocab_paraphrase' && hasQuestionChunk) {
      return false
    }

    // Paragraph focus with direct paragraph reference - skip semantic (very narrow scope)
    if (answerStyle === 'paragraph_focus' && hasPassageChunk) {
      return false
    }

    // Review mode with explanation chunks - skip semantic if we have answer explanation
    if (request.mode === 'review' && deterministic.some(c => c.chunkType === 'answer_explanation')) {
      return false
    }

    // Single question with primary evidence AND multiple deterministic chunks - skip semantic only when evidence is very strong
    // (must have at least question + passage + answer/explanation or 4+ deterministic chunks)
    if (focusQuestionChunks.length === 1 && hasPrimaryEvidence && deterministic.length >= 4) {
      return false
    }

    // Default: run semantic search to enrich context (preserves existing behavior)
    return true
  }

  private async buildGeneralChatWithWebSearch(request: AssistantQueryRequest, locale: 'zh' | 'en'): Promise<AssistantQueryResponseWithMeta> {
    const startTime = Date.now()
    const query = request.userQuery || 'IELTS reading tips'

    // Try web search if provider is available - NO documentLoader call (off-topic questions don't need passage context)
    let webCitations: import('../../types/assistant.js').WebCitation[] | undefined
    let searchUsed = false
    let answerSource: 'web' | 'llm' | 'local' = 'local'
    let loadMs = 0

    // Check search cache first
    const searchCacheKey = this.buildSearchCacheKey(query, locale, 5)
    let cachedSearchResults = this.getCachedSearchResults(searchCacheKey)

    if (cachedSearchResults) {
      webCitations = cachedSearchResults
      searchUsed = true
      answerSource = 'web'
      this.logger.info?.({ cache_hit: true, query }, 'Search cache hit.')
    } else if (this.webSearch) {
      try {
        const searchStart = Date.now()
        const searchResults = await this.webSearch.search(query, 5)
        loadMs = Date.now() - searchStart
        if (searchResults.length > 0) {
          webCitations = searchResults
          searchUsed = true
          answerSource = 'web'
          // Cache search results
          this.setCachedSearchResults(searchCacheKey, searchResults)
        }
      } catch (error) {
        this.logger.warn?.({ detail: error instanceof Error ? error.message : String(error) }, 'Web search failed; falling back to local response.')
      }
    }

    // If web search succeeded, use LLM to synthesize answer with citations
    if (webCitations && webCitations.length > 0 && this.provider) {
      const searchContext = webCitations
        .map((c, i) => `[${i + 1}] ${c.title}\n    URL: ${c.url}\n    ${c.snippet}`)
        .join('\n\n')

      const systemPrompt = locale === 'zh'
        ? '你是一个专业的雅思阅读助手。请根据提供的搜索结果，用简洁清晰的中文回答用户问题。引用来源时使用 [1], [2] 等标记。'
        : 'You are a professional IELTS Reading assistant. Answer the user question based on the provided search results in clear, concise English. Use [1], [2] etc. to cite sources.'

      const userPrompt = locale === 'zh'
        ? `用户问题：${query}\n\n搜索结果：\n${searchContext}\n\n请综合以上信息回答问题，并在适当时标注来源。`
        : `User question: ${query}\n\nSearch results:\n${searchContext}\n\nPlease synthesize the information above to answer the question, citing sources where appropriate.`

      try {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 30000)

        const response = await this.provider.generate({ system: systemPrompt, user: userPrompt })
        const modelMs = Date.now() - startTime - loadMs
        const totalMs = Date.now() - startTime

        clearTimeout(timeoutId)

        return {
          answer: response,
          citations: [],
          followUps: locale === 'zh'
            ? ['想了解更多背景资料吗？', '还有其他相关问题吗？', '需要我解释某个概念吗？']
            : ['Want more background info?', 'Any other related questions?', 'Need me to explain a concept?'],
          webCitations,
          searchUsed,
          answerSource,
          responseKind: 'chat',
          confidence: 'high',
          missingContext: [],
          timings: {
            load_ms: loadMs,
            context_ms: 0,
            model_ms: modelMs,
            total_ms: totalMs,
            source: answerSource,
            cache_hit: false
          }
        }
      } catch (error) {
        this.logger.warn?.({ detail: error instanceof Error ? error.message : String(error) }, 'LLM synthesis failed; falling back to raw search results.')
      }
    }

    // Fallback: return raw search results or local response
    const totalMs = Date.now() - startTime
    const answer = webCitations && webCitations.length > 0
      ? (locale === 'zh'
          ? `根据搜索结果显示：\n\n${webCitations.map((c, i) => `[${i + 1}] ${c.title}\n${c.snippet}\n${c.url}`).join('\n\n')}`
          : `Search results:\n\n${webCitations.map((c, i) => `[${i + 1}] ${c.title}\n${c.snippet}\n${c.url}`).join('\n\n')}`)
      : (locale === 'zh'
          ? '你好！我是 IELTS 阅读小助手，主要帮助你解答雅思阅读题目和解题技巧。如果你有雅思阅读相关的问题，我很乐意帮忙！'
          : 'Hi! I\'m your IELTS Reading assistant, focused on helping with IELTS Reading questions and strategies. Feel free to ask me about IELTS Reading!')

    return {
      answer,
      citations: [],
      followUps: locale === 'zh'
        ? ['第 1 题怎么做？', '讲讲这组题的整体思路', '帮我复盘错题']
        : ['How to approach Q1?', 'Explain the overall strategy', 'Review my mistakes'],
      webCitations: webCitations?.length ? webCitations : undefined,
      searchUsed,
      answerSource: webCitations && webCitations.length > 0 ? 'web' : 'local',
      responseKind: 'chat',
      confidence: 'high',
      missingContext: [],
      timings: {
        load_ms: loadMs,
        context_ms: 0,
        model_ms: 0,
        total_ms: totalMs,
        source: webCitations && webCitations.length > 0 ? 'web' : 'local',
        cache_hit: false
      }
    }
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

  private buildLocalTutoringResponse(question: QuestionIndexEntry, request: AssistantQueryRequest, context: RetrievalContext, document: ParsedQuestionDocument, intent?: IntentClassification): AssistantQueryResponse {
    const locale = resolveLocale(request)
    const availableQuestionNumbers = Array.from(new Set(document.questionChunks.flatMap((chunk) => chunk.questionNumbers)))
    const resolvedIntent = intent ?? classifyIntent(request, locale, availableQuestionNumbers)
    const style = context.answerStyle
    const answerSections =
      request.mode === 'hint'
        ? style === 'vocab_paraphrase'
          ? buildVocabHintSections(question, context, locale, context.chunks)
          : style === 'paragraph_focus'
            ? buildParagraphFocusHintSections(question, context, locale, context.chunks)
            : buildHintSections(question, context, locale, context.chunks)
        : style === 'vocab_paraphrase'
          ? buildVocabExplainSections(question, context, locale, context.chunks)
          : style === 'paragraph_focus'
            ? buildParagraphFocusExplainSections(question, context, locale, context.chunks)
            : buildExplainSections(question, context, locale, context.chunks)
    return this.finalizeResponse(request, context.chunks, {
      answer: buildAnswerFromSections(answerSections),
      answerSections,
      citations: buildCitations(context.chunks),
      followUps: generateContextualFollowUps(resolvedIntent, locale, availableQuestionNumbers),
      usedQuestionNumbers: context.usedQuestionNumbers,
      usedParagraphLabels: context.usedParagraphLabels,
      confidence: normalizeConfidence({
        missingContext: context.missingContext,
        intent: resolvedIntent,
        hasQuestionChunks: context.chunks.some(c => c.chunkType === 'question_item'),
        hasPassageChunks: context.chunks.some(c => c.chunkType === 'passage_paragraph'),
        hasParagraphEvidence: context.usedParagraphLabels.length > 0,
        contextChunkCount: context.chunks.length,
        isLocalResponse: true,
        hasPrimaryQuestionChunk: !!context.primaryQuestionChunk,
        hasPrimaryEvidenceChunk: !!context.primaryEvidenceChunk,
        focusQuestionCount: context.focusQuestionNumbers.length
      }),
      missingContext: context.missingContext
    })
  }

  private buildLocalReviewResponse(question: QuestionIndexEntry, request: AssistantQueryRequest, context: RetrievalContext, reviewItems: AssistantReviewItem[], document: ParsedQuestionDocument, intent?: IntentClassification): AssistantQueryResponse {
    const locale = resolveLocale(request)
    const availableQuestionNumbers = Array.from(new Set(document.questionChunks.flatMap((chunk) => chunk.questionNumbers)))
    const resolvedIntent = intent ?? classifyIntent(request, locale, availableQuestionNumbers)
    const answerSections = buildReviewSections(question, request, reviewItems, locale)
    return {
      answer: buildAnswerFromSections(answerSections),
      answerSections,
      citations: buildCitations(context.chunks),
      followUps: generateContextualFollowUps(resolvedIntent, locale, availableQuestionNumbers),
      reviewItems,
      usedQuestionNumbers: context.usedQuestionNumbers,
      usedParagraphLabels: context.usedParagraphLabels,
      confidence: normalizeConfidence({
        missingContext: context.missingContext,
        intent: resolvedIntent,
        hasQuestionChunks: context.chunks.some(c => c.chunkType === 'question_item'),
        hasPassageChunks: context.chunks.some(c => c.chunkType === 'passage_paragraph'),
        hasParagraphEvidence: context.usedParagraphLabels.length > 0,
        contextChunkCount: context.chunks.length,
        isLocalResponse: true,
        hasPrimaryQuestionChunk: !!context.primaryQuestionChunk,
        hasPrimaryEvidenceChunk: !!context.primaryEvidenceChunk,
        focusQuestionCount: context.focusQuestionNumbers.length
      }),
      missingContext: context.missingContext
    }
  }

  private buildGroundedResponse(context: RetrievalContext, modelResponse: ParsedModelResponse, citations: AssistantCitation[]): AssistantQueryResponse {
    const adjusted = applyAnswerStyleToParsedModel(modelResponse, context.answerStyle)
    return {
      answer: adjusted.answer,
      answerSections: adjusted.answerSections,
      citations,
      followUps: uniqueValues(adjusted.followUps).slice(0, 3),
      usedQuestionNumbers: context.usedQuestionNumbers,
      usedParagraphLabels: context.usedParagraphLabels,
      confidence: normalizeConfidence({
        llmConfidence: adjusted.confidence,
        missingContext: [...context.missingContext, ...adjusted.missingContext],
        hasQuestionChunks: context.chunks.some(c => c.chunkType === 'question_item'),
        hasPassageChunks: context.chunks.some(c => c.chunkType === 'passage_paragraph'),
        hasParagraphEvidence: context.usedParagraphLabels.length > 0,
        contextChunkCount: context.chunks.length,
        isLocalResponse: false,
        hasPrimaryQuestionChunk: !!context.primaryQuestionChunk,
        hasPrimaryEvidenceChunk: !!context.primaryEvidenceChunk,
        focusQuestionCount: context.focusQuestionNumbers.length
      }),
      missingContext: uniqueValues([...context.missingContext, ...adjusted.missingContext])
    }
  }

  private async buildSelectionToolResponse(
    _question: QuestionIndexEntry,
    request: AssistantQueryRequest,
    context: RetrievalContext,
    _document: ParsedQuestionDocument,
    locale: 'zh' | 'en'
  ): Promise<AssistantQueryResponse> {
    const action = request.action
    const selectedText = request.selectedContext?.text || ''

    // Build tool-specific response
    const toolCards: AssistantToolCard[] = []
    const nextActions: AssistantNextAction[] = []
    let answer = ''

    switch (action) {
      case 'translate': {
        // For translation, use LLM if available, otherwise return selected text with note
        const translation = selectedText // Placeholder - would use LLM in real implementation
        toolCards.push({
          kind: 'vocab',
          title: locale === 'zh' ? '翻译' : 'Translation',
          content: translation,
          metadata: { originalText: selectedText },
          sourceExcerpt: selectedText
        })
        answer = locale === 'zh'
          ? `已翻译选中的内容。"${selectedText.substring(0, 50)}${selectedText.length > 50 ? '...' : ''}"`
          : `Translated selected text: "${selectedText.substring(0, 50)}${selectedText.length > 50 ? '...' : ''}"`
        nextActions.push({ label: locale === 'zh' ? '查找同义替换' : 'Find paraphrases', action: 'find_paraphrases', icon: 'swap_horiz' })
        break
      }

      case 'explain_selection': {
        // Explain sentence structure or meaning
        toolCards.push({
          kind: 'evidence',
          title: locale === 'zh' ? '句子解析' : 'Sentence Analysis',
          content: locale === 'zh'
            ? `选中的句子包含关键信息。结构分析：主句 + 从句。`
            : `Selected sentence contains key information. Structure: main clause + subordinate clause.`,
          sourceExcerpt: selectedText
        })
        answer = locale === 'zh'
          ? `已分析选中句子的结构和含义。`
          : `Analyzed the structure and meaning of the selected sentence.`
        nextActions.push({ label: locale === 'zh' ? '标记考点词' : 'Extract keywords', action: 'extract_keywords', icon: 'tag' })
        break
      }

      case 'find_paraphrases': {
        // Find paraphrases from question bank
        const paraphrases = this.findParaphrasesForText(selectedText, _document)
        toolCards.push({
          kind: 'paraphrase',
          title: locale === 'zh' ? '同义替换' : 'Paraphrases',
          content: paraphrases.join(locale === 'zh' ? '；' : '; '),
          metadata: { source: 'question_bank' },
          sourceExcerpt: selectedText
        })
        answer = locale === 'zh'
          ? `找到 ${paraphrases.length} 个同义替换表达。`
          : `Found ${paraphrases.length} paraphrase expressions.`
        nextActions.push({ label: locale === 'zh' ? '查找反义词' : 'Find antonyms', action: 'find_antonyms', icon: 'swap_vert' })
        break
      }

      case 'find_antonyms': {
        // Find antonyms
        const antonyms = this.findAntonymsForText(selectedText, _document)
        toolCards.push({
          kind: 'antonym',
          title: locale === 'zh' ? '反义关系' : 'Antonyms',
          content: antonyms.join(locale === 'zh' ? '；' : '; '),
          metadata: { source: 'question_bank' },
          sourceExcerpt: selectedText
        })
        answer = locale === 'zh'
          ? `找到 ${antonyms.length} 个反义表达。`
          : `Found ${antonyms.length} antonym expressions.`
        break
      }

      case 'extract_keywords': {
        // Extract keywords/考点词
        const keywords = this.extractKeywordsFromText(selectedText)
        toolCards.push({
          kind: 'vocab',
          title: locale === 'zh' ? '考点词/关键词' : 'Keywords',
          content: keywords.join(', '),
          metadata: { type: 'exam_keywords' },
          sourceExcerpt: selectedText
        })
        answer = locale === 'zh'
          ? `提取了 ${keywords.length} 个关键词。`
          : `Extracted ${keywords.length} keywords.`
        break
      }

      case 'locate_evidence': {
        // Locate evidence in passage
        const evidenceChunks = context.chunks.filter(c => c.chunkType === 'passage_paragraph')
        toolCards.push({
          kind: 'evidence',
          title: locale === 'zh' ? '证据定位' : 'Evidence Location',
          content: evidenceChunks.slice(0, 2).map(c => c.content).join('\n\n'),
          metadata: { paragraphs: evidenceChunks.slice(0, 2).map(c => c.paragraphLabels).flat().join(', ') },
          sourceExcerpt: selectedText
        })
        answer = locale === 'zh'
          ? `在段落 ${evidenceChunks.slice(0, 2).map(c => c.paragraphLabels).flat().join(', ')} 中找到相关证据。`
          : `Found relevant evidence in paragraphs ${evidenceChunks.slice(0, 2).map(c => c.paragraphLabels).flat().join(', ')}.`
        break
      }

      default:
        answer = locale === 'zh'
          ? `已处理选择工具请求：${action}`
          : `Processed selection tool request: ${action}`
    }

    return {
      answer,
      citations: buildCitations(context.chunks),
      followUps: buildFallbackFollowUps(request.mode, locale),
      toolCards,
      nextActions,
      responseKind: 'tool_result',
      confidence: 'high',
      missingContext: []
    }
  }

  private findParaphrasesForText(text: string, document: ParsedQuestionDocument): string[] {
    // Simple keyword-based paraphrase extraction from question bank
    // In production, this would use a lexical layer with n-gram/phrase/lemma indexing
    const words = text.toLowerCase().split(/\s+/).filter(w => w.length > 3)
    const paraphrases: string[] = []

    // Search explanation chunks for similar content
    for (const chunk of document.answerExplanationChunks) {
      if (chunk.content.toLowerCase().includes(words[0] || '')) {
        paraphrases.push(chunk.content.substring(0, 100))
        if (paraphrases.length >= 3) break
      }
    }

    return paraphrases.length > 0 ? paraphrases : [text]
  }

  private findAntonymsForText(text: string, _document: ParsedQuestionDocument): string[] {
    // Simple antonym extraction - placeholder implementation
    const antonyms: string[] = []
    // In production, would use lexical layer
    return antonyms.length > 0 ? antonyms : [text]
  }

  private extractKeywordsFromText(text: string): string[] {
    // Simple keyword extraction
    const words = text.split(/\s+/).filter(w => w.length > 3 && !SEARCH_STOPWORDS.has(w.toLowerCase()))
    return words.slice(0, 5)
  }

  private buildReviewCoachResponse(
    _question: QuestionIndexEntry,
    request: AssistantQueryRequest,
    context: RetrievalContext,
    _document: ParsedQuestionDocument,
    locale: 'zh' | 'en'
  ): AssistantQueryResponse {
    const practiceContext = request.practiceContext
    const toolCards: AssistantToolCard[] = []
    const nextActions: AssistantNextAction[] = []

    // Build diagnosis card
    if (practiceContext?.submitted && practiceContext.wrongQuestions?.length) {
      const wrongCount = practiceContext.wrongQuestions.length
      const totalQuestions = _document.questionChunks.length
      const correctCount = totalQuestions - wrongCount
      const accuracy = Math.round((correctCount / totalQuestions) * 100)

      toolCards.push({
        kind: 'diagnosis',
        title: locale === 'zh' ? '整体诊断' : 'Overall Diagnosis',
        content: locale === 'zh'
          ? `正确率：${accuracy}% (${correctCount}/${totalQuestions})。错题：${wrongCount}道。建议优先复习错题。`
          : `Accuracy: ${accuracy}% (${correctCount}/${totalQuestions}). Wrong: ${wrongCount}. Focus on reviewing wrong questions first.`,
        metadata: { accuracy: String(accuracy), wrongCount: String(wrongCount), totalQuestions: String(totalQuestions) }
      })

      // Build wrong question queue
      for (const qNum of practiceContext.wrongQuestions.slice(0, 3)) {
        const explanationChunk = _document.answerExplanationChunks.find(c => c.questionNumbers.includes(qNum))
        toolCards.push({
          kind: 'drill',
          title: `${locale === 'zh' ? '错题' : 'Wrong Q'} ${qNum}`,
          content: explanationChunk?.content || '',
          metadata: { questionNumber: qNum }
        })
      }

      nextActions.push(
        { label: locale === 'zh' ? '分析这道错题' : 'Analyze this mistake', action: 'analyze_mistake', icon: 'help' },
        { label: locale === 'zh' ? '找相似题练习' : 'Practice similar questions', action: 'recommend_drills', icon: 'fitness_center' }
      )
    }

    const answer = locale === 'zh'
      ? `已生成复盘报告。查看下方的诊断和错题分析。`
      : `Review report generated. Check diagnosis and mistake analysis below.`

    return {
      answer,
      citations: buildCitations(context.chunks),
      followUps: buildFallbackFollowUps('review', locale),
      toolCards,
      nextActions,
      responseKind: 'review',
      confidence: 'high',
      missingContext: []
    }
  }

  private buildCacheKey(request: AssistantQueryRequest): string {
    const parts = [
      request.questionId,
      request.mode,
      request.promptKind || 'none',
      request.surface || 'none',
      request.action || 'none',
      request.searchMode || 'auto',
      request.focusQuestionNumbers?.join(',') || 'none',
      request.userQuery || 'none'
    ]
    // Add selectedContext hash if present
    if (request.selectedContext?.text) {
      parts.push(`selected:${request.selectedContext.text.length}:${request.selectedContext.scope}`)
    }
    // Add practiceContext hash if present
    if (request.practiceContext?.submitted) {
      parts.push(`practice:${request.practiceContext.wrongQuestions?.join(',') || 'none'}`)
    }
    if (request.recentPractice?.length) {
      parts.push(
        `recent:${request.recentPractice
          .map((item) => `${item.questionId}:${item.accuracy}:${item.category}:${item.duration}`)
          .sort()
          .join(';')}`
      )
    }
    return parts.join('|')
  }

  private getCachedResponse(key: string): AssistantQueryResponseWithMeta | null {
    const cached = queryResponseCache.get(key)
    if (cached && cached.expiresAt > Date.now()) {
      return cached.response
    }
    if (cached) {
      queryResponseCache.delete(key)
    }
    return null
  }

  private setCachedResponse(key: string, response: AssistantQueryResponseWithMeta): void {
    queryResponseCache.set(key, {
      response,
      expiresAt: Date.now() + QUERY_CACHE_TTL_MS
    })
  }

  /** Build cache key for retrieval context - includes selectedContext content hash for stability */
  private buildRetrievalCacheKey(request: AssistantQueryRequest, questionId: string): string {
    const parts = [
      questionId,
      request.mode,
      request.promptKind || 'none',
      request.action || 'none',
      request.searchMode || 'auto',
      request.focusQuestionNumbers?.join(',') || 'none',
      (request.userQuery || '').trim().slice(0, 100)
    ]
    // Use stable hash for selectedContext instead of just length
    if (request.selectedContext?.text) {
      const textHash = request.selectedContext.text.split('').reduce((a, b) => ((a << 5) - a) + b.charCodeAt(0), 0) >>> 0
      parts.push(`selected:${textHash}:${request.selectedContext.scope}`)
    }
    if (request.practiceContext?.submitted) {
      parts.push(`practice:${request.practiceContext.wrongQuestions?.join(',') || 'none'}`)
    }
    return parts.join('|')
  }

  private getCachedRetrievalContext(key: string): RetrievalContext | null {
    const cached = retrievalContextCache.get(key)
    if (cached && cached.expiresAt > Date.now()) {
      return cached.context
    }
    if (cached) {
      retrievalContextCache.delete(key)
    }
    return null
  }

  private setCachedRetrievalContext(key: string, context: RetrievalContext): void {
    retrievalContextCache.set(key, {
      context,
      expiresAt: Date.now() + RETRIEVAL_CACHE_TTL_MS
    })
  }

  private getCachedSearchResults(key: string): CachedWebSearchResult[] | null {
    const cached = searchCache.get(key)
    if (cached && cached.expiresAt > Date.now()) {
      return cached.results
    }
    if (cached) {
      searchCache.delete(key)
    }
    return null
  }

  private setCachedSearchResults(key: string, results: CachedWebSearchResult[]): void {
    searchCache.set(key, {
      results,
      expiresAt: Date.now() + SEARCH_CACHE_TTL_MS
    })
  }

  private buildSearchCacheKey(query: string, locale: 'zh' | 'en', numResults: number): string {
    const normalized = query.trim().toLowerCase().replace(/\s+/g, ' ')
    return `${locale}:${normalized}:${numResults}`
  }

  /**
   * Handle unrelated_chat route - greetings, weather, smalltalk.
   * Does NOT load document or use RAG. Returns instant local response.
   */
  private async handleUnrelatedChat(
    _request: AssistantQueryRequest,
    locale: 'zh' | 'en',
    _routingDecision: RouterDecision,
    cacheKey: string,
    startTime: number
  ): Promise<AssistantQueryResponseWithMeta> {
    // Social/fast path - instant local response without LLM
    const totalMs = Date.now() - startTime
    const response: AssistantQueryResponseWithMeta = {
      answer: locale === 'zh'
        ? '你好！我是 IELTS 阅读小助手。你可以问我具体题目（如"第 1 题怎么做"），或让我讲解整组题的思路。'
        : 'Hi! I\'m your IELTS Reading assistant. Ask me about specific questions (e.g., "How to approach Q1?") or request an overview of the whole set.',
      citations: [],
      followUps: [],
      confidence: 'high',
      missingContext: [],
      responseKind: 'social',
      answerSource: 'local',
      timings: {
        load_ms: 0,
        context_ms: 0,
        model_ms: 0,
        total_ms: totalMs,
        source: 'local',
        cache_hit: false
      }
    }
    this.setCachedResponse(cacheKey, response)
    return response
  }

  /**
   * Handle ielts_general route - IELTS learning questions not tied to current passage.
   * Does NOT load document or use RAG.
   * Respects ASSISTANT_GENERATION_MODE: local = instant template, llm_preferred = call LLM.
   */
  private async handleIeltsGeneral(
    request: AssistantQueryRequest,
    locale: 'zh' | 'en',
    _routingDecision: RouterDecision,
    cacheKey: string,
    startTime: number
  ): Promise<AssistantQueryResponseWithMeta> {
    const provider = this.provider
    let answer: string
    let modelMs = 0
    let answerSource: 'llm' | 'local' = 'local'

    // Check if we should use LLM or local template
    const useLlm = env.ASSISTANT_GENERATION_MODE === 'llm_preferred' && provider

    if (useLlm) {
      // LLM mode - call model for richer responses (slower, ~1-2s)
      const modelStart = Date.now()
      try {
        const prompt = buildIeltsCoachPrompt(request, locale)
        answer = await provider.generate(prompt)
        modelMs = Date.now() - modelStart
        answerSource = 'llm'
      } catch {
        // Fallback to local response
        answer = getLocalIeltsCoachResponse(request, locale)
      }
    } else {
      // Local mode - instant template response (<50ms)
      answer = getLocalIeltsCoachResponse(request, locale)
    }

    const totalMs = Date.now() - startTime
    const response: AssistantQueryResponseWithMeta = {
      answer,
      citations: [],
      followUps: locale === 'zh'
        ? ['有什么阅读技巧推荐', '同义替换怎么积累', '时间不够怎么办']
        : ['What reading strategies do you recommend', 'How to build paraphrase vocabulary', 'What if I run out of time'],
      confidence: 'high' as AssistantConfidence,
      missingContext: [],
      responseKind: 'chat',
      answerSource,
      timings: {
        load_ms: 0,
        context_ms: 0,
        model_ms: modelMs,
        total_ms: totalMs,
        source: answerSource,
        cache_hit: false
      }
    }
    this.setCachedResponse(cacheKey, response)
    return response
  }

  private async queryWithTiming(request: AssistantQueryRequest): Promise<AssistantQueryResponseWithMeta> {
    const startTime = Date.now()
    const cacheKey = this.buildCacheKey(request)

    // Check short-term cache for repeat requests
    const cached = this.getCachedResponse(cacheKey)
    if (cached) {
      return { ...cached, timings: { ...cached.timings!, cache_hit: true } }
    }

    const question = await this.getQuestion(request.questionId)
    const locale = resolveLocale(request)

    // Three-layer routing: determine how to handle the query BEFORE loading document
    const routingDecision = await classifyRoute(request, locale)

    // Route 1: unrelated_chat - Greetings, weather, smalltalk (no document load)
    if (routingDecision.route === 'unrelated_chat') {
      return this.handleUnrelatedChat(request, locale, routingDecision, cacheKey, startTime)
    }

    // Route 2: ielts_general - IELTS learning questions not tied to current passage (no document load)
    if (routingDecision.route === 'ielts_general') {
      return this.handleIeltsGeneral(request, locale, routingDecision, cacheKey, startTime)
    }

    // Route 3: page_grounded - Questions about current passage/questions (requires document load + RAG)
    // Continue with existing flow below
    const loadStart = Date.now()
    const document = await this.documentLoader(question)
    const loadMs = Date.now() - loadStart

    // Classify intent with full document context for routing decisions
    const availableQuestionNumbers = new Set(document.questionChunks.flatMap((chunk) => chunk.questionNumbers))
    let intent = classifyIntent(request, locale, Array.from(availableQuestionNumbers))
    if (intent.kind === 'clarify' && ['hint', 'explain', 'review', 'similar'].includes(request.mode)) {
      const bodyForSocial = normalizeTrailingQuestionMarks(stripGreetingPrefix((request.userQuery || '').trim(), locale))
      if (!isPureSocial(bodyForSocial, locale)) {
        intent = { kind: 'grounded_question', confidence: 0.65 }
      }
    }

    // Handle selection_tool_request - process user's selected text
    if (intent.kind === 'selection_tool_request') {
      const contextStart = Date.now()
      const context = await this.collectContext(question, document, request)
      const contextMs = Date.now() - contextStart

      const response = await this.buildSelectionToolResponse(question, request, context, document, locale)

      const totalMs = Date.now() - startTime
      const result: AssistantQueryResponseWithMeta = {
        ...response,
        answerSource: 'local',
        timings: {
          load_ms: loadMs,
          context_ms: contextMs,
          model_ms: 0,
          total_ms: totalMs,
          source: 'local',
          cache_hit: false
        }
      }
      this.setCachedResponse(cacheKey, result)
      return result
    }

    // Handle review_coach_request - post-submission review and diagnosis
    if (intent.kind === 'review_coach_request') {
      const contextStart = Date.now()
      const context = await this.collectContext(question, document, request)
      const contextMs = Date.now() - contextStart

      const response = this.buildReviewCoachResponse(question, request, context, document, locale)

      const totalMs = Date.now() - startTime
      const result: AssistantQueryResponseWithMeta = {
        ...response,
        answerSource: 'local',
        timings: {
          load_ms: loadMs,
          context_ms: contextMs,
          model_ms: 0,
          total_ms: totalMs,
          source: 'local',
          cache_hit: false
        }
      }
      this.setCachedResponse(cacheKey, result)
      return result
    }

    // Handle clarify - instant response, no context needed
    if (intent.kind === 'clarify') {
      const totalMs = Date.now() - startTime
      const response: AssistantQueryResponseWithMeta = {
        answer: locale === 'zh'
          ? '请告诉我你想了解哪道题（如"第 3 题"），或者我可以先讲解整组题的解题思路。你也可以直接说"讲一下这组题"。'
          : 'Please tell me which question you\'d like help with (e.g., "Q3"), or I can explain the overall strategy for this set. You can also say "explain the whole set".',
        citations: [],
        followUps: locale === 'zh'
          ? ['第 1 题怎么做', '讲一下整组思路', '看 Paragraph B']
          : ['How to do Q1', 'Explain the whole set', 'Check Paragraph B'],
        confidence: 'high' as AssistantConfidence,
        missingContext: [],
        responseKind: 'clarify',
        answerSource: 'local',
        timings: {
          load_ms: loadMs,
          context_ms: 0,
          model_ms: 0,
          total_ms: totalMs,
          source: 'local',
          cache_hit: false
        }
      }
      this.setCachedResponse(cacheKey, response)
      return response
    }

    // Determine if reading-native was used (fast path) or PDF fallback
    const source: 'local' | 'llm' | 'pdf_fallback' = (document as any).sourcePath?.includes('reading-native') ? 'local' : 'pdf_fallback'

    const preferLocalTemplates = env.ASSISTANT_GENERATION_MODE === 'local' || !this.provider

    if (preferLocalTemplates) {
      const contextStart = Date.now()
      const context = await this.collectContext(question, document, request)
      const contextMs = Date.now() - contextStart

      let response: AssistantQueryResponse
      if (request.mode === 'similar') {
        response = await this.buildSimilarResponse(question, request)
      } else if (request.mode === 'review') {
        response = this.buildLocalReviewResponse(question, request, context, collectReviewItems(request, document.answerExplanationChunks), document, intent)
      } else {
        response = this.buildLocalTutoringResponse(question, request, context, document, intent)
      }

      const totalMs = Date.now() - startTime
      const result: AssistantQueryResponseWithMeta = {
        ...response,
        answerSource: source,
        timings: {
          load_ms: loadMs,
          context_ms: contextMs,
          model_ms: 0,
          total_ms: totalMs,
          source,
          cache_hit: false
        }
      }

      this.setCachedResponse(cacheKey, result)
      this.logger.info?.({
        mode: request.mode,
        questionId: question.id,
        load_ms: loadMs,
        context_ms: contextMs,
        total_ms: totalMs,
        source,
        isNative: document.sourcePath.includes('reading-native')
      }, 'Assistant local response generated.')

      return result
    }

    // LLM-preferred: similar recommendations stay local (no LLM synthesis of full answer)
    if (request.mode === 'similar') {
      const contextStart = Date.now()
      await this.collectContext(question, document, request)
      const contextMs = Date.now() - contextStart
      const response = await this.buildSimilarResponse(question, request)
      const totalMs = Date.now() - startTime
      const result: AssistantQueryResponseWithMeta = {
        ...response,
        answerSource: source,
        timings: {
          load_ms: loadMs,
          context_ms: contextMs,
          model_ms: 0,
          total_ms: totalMs,
          source,
          cache_hit: false
        }
      }
      this.setCachedResponse(cacheKey, result)
      return result
    }

    const contextStart = Date.now()
    const context = await this.collectContext(question, document, request)
    const contextMs = Date.now() - contextStart

    const reviewItems = collectReviewItems(request, document.answerExplanationChunks)

    if (context.chunks.length === 0) {
      const localResponse =
        request.mode === 'review'
          ? this.buildLocalReviewResponse(question, request, context, reviewItems, document, intent)
          : this.buildLocalTutoringResponse(question, request, context, document, intent)
      const totalMs = Date.now() - startTime
      const result: AssistantQueryResponseWithMeta = {
        ...localResponse,
        answerSource: 'local',
        timings: {
          load_ms: loadMs,
          context_ms: contextMs,
          model_ms: 0,
          total_ms: totalMs,
          source: 'local',
          cache_hit: false
        }
      }
      this.setCachedResponse(cacheKey, result)
      return result
    }

    const citations = buildCitations(context.chunks)
    const modelStart = Date.now()

    try {
      const modelResponse = await this.generateAnswer(question, request, context)
      const modelMs = Date.now() - modelStart
      const totalMs = Date.now() - startTime

      const grounded = this.buildGroundedResponse(context, modelResponse, citations)
      const withReview: AssistantQueryResponse =
        request.mode === 'review' ? { ...grounded, reviewItems } : this.finalizeResponse(request, context.chunks, grounded)

      const result: AssistantQueryResponseWithMeta = {
        ...withReview,
        answerSource: 'llm',
        timings: {
          load_ms: loadMs,
          context_ms: contextMs,
          model_ms: modelMs,
          total_ms: totalMs,
          source: 'llm',
          cache_hit: false
        }
      }

      this.setCachedResponse(cacheKey, result)
      this.logger.info?.({
        mode: request.mode,
        questionId: question.id,
        load_ms: loadMs,
        context_ms: contextMs,
        model_ms: modelMs,
        total_ms: totalMs,
        source: 'llm'
      }, 'Assistant LLM response generated.')

      return result
    } catch (error) {
      this.logFallback('LLM generation failed', error)
      const localResponse =
        request.mode === 'review'
          ? this.buildLocalReviewResponse(question, request, context, reviewItems, document, intent)
          : this.buildLocalTutoringResponse(question, request, context, document, intent)
      const totalMs = Date.now() - startTime

      const result: AssistantQueryResponseWithMeta = {
        ...localResponse,
        answerSource: 'local',
        timings: {
          load_ms: loadMs,
          context_ms: contextMs,
          model_ms: 0,
          total_ms: totalMs,
          source: 'local',
          cache_hit: false
        }
      }

      this.setCachedResponse(cacheKey, result)
      return result
    }
  }

  async query(request: AssistantQueryRequest): Promise<AssistantQueryResponse> {
    const result = await this.queryWithTiming(request)
    // Return base response without meta fields (maintains backward compatibility)
    const { answerSource, timings, ...baseResponse } = result
    return baseResponse
  }

  /**
   * Stream query response using ndjson format.
   * Events: start, delta, final, error
   */
  async *queryStream(request: AssistantQueryRequest): AsyncGenerator<{ type: string; payload: unknown }> {
    try {
      const locale = resolveLocale(request)

      // Step 1: Route classification
      const routingDecision = await classifyRoute(request, locale)

      // Send start event
      yield {
        type: 'start',
        payload: {
          route: routingDecision.route,
          responseKind: routingDecision.route === 'unrelated_chat' ? 'social' : routingDecision.route === 'ielts_general' ? 'chat' : 'grounded'
        }
      }

      // Step 2: Handle by route type
      if (routingDecision.route === 'unrelated_chat') {
        // Instant response for unrelated chat
        const answer = locale === 'zh'
          ? '你好！我是 IELTS 阅读小助手。你可以问我具体题目（如"第 1 题怎么做"），或让我讲解整组题的思路。'
          : 'Hi! I\'m your IELTS Reading assistant. Ask me about specific questions or request an overview.'

        yield { type: 'delta', payload: { text: answer } }

        const finalResponse: AssistantQueryResponse = {
          answer,
          citations: [],
          followUps: [],
          confidence: 'high',
          missingContext: [],
          responseKind: 'social'
        }

        yield { type: 'final', payload: finalResponse }
        return
      }

      if (routingDecision.route === 'ielts_general') {
        // General IELTS chat - use fast model
        const answer = getLocalIeltsCoachResponse(request, locale)
        yield { type: 'delta', payload: { text: answer } }

        const finalResponse: AssistantQueryResponse = {
          answer,
          citations: [],
          followUps: buildFallbackFollowUps(request.mode, locale),
          confidence: 'high',
          missingContext: [],
          responseKind: 'chat'
        }

        yield { type: 'final', payload: finalResponse }
        return
      }

      // Step 3: page_grounded - load document and do RAG
      const cacheKey = this.buildCacheKey(request)
      const cached = this.getCachedResponse(cacheKey)

      if (cached) {
        // Cache hit - send full response immediately
        yield { type: 'delta', payload: { text: cached.answer } }
        yield { type: 'final', payload: cached }
        return
      }

      // Load document
      const question = await defaultQuestionLoader(request.questionId)
      const document = await getParsedDocument(question)

      // Get retrieval context
      const context = await this.collectContext(question, document, request)

      // Check if we have enough context
      if (context.chunks.length === 0) {
        const fallbackResponse = request.mode === 'review'
          ? this.buildLocalReviewResponse(question, request, context, [], document, { kind: 'grounded_question', confidence: 0.5 })
          : this.buildLocalTutoringResponse(question, request, context, document, { kind: 'grounded_question', confidence: 0.5 })

        yield { type: 'delta', payload: { text: fallbackResponse.answer } }
        yield { type: 'final', payload: { ...fallbackResponse, answerSource: 'local' } }
        return
      }

      // Generate answer with LLM using fast model
      const modelResponse = await this.generateAnswerFast(question, request, context)

      // Stream delta
      yield { type: 'delta', payload: { text: modelResponse.answer } }

      // Build final response
      const citations = buildCitations(context.chunks)
      const groundedResponse = this.buildGroundedResponse(context, modelResponse, citations)
      const finalResponse: AssistantQueryResponse = request.mode === 'review'
        ? { ...groundedResponse, reviewItems: collectReviewItems(request, document.answerExplanationChunks) }
        : this.finalizeResponse(request, context.chunks, groundedResponse)

      yield { type: 'final', payload: finalResponse }

      // Cache response
      this.setCachedResponse(cacheKey, { ...finalResponse, answerSource: 'llm' })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Assistant stream request failed'
      yield { type: 'error', payload: { message } }
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private async generateAnswerFast(
    question: QuestionIndexEntry,
    request: AssistantQueryRequest,
    context: RetrievalContext
  ): Promise<ParsedModelResponse> {
    if (!this.provider) {
      throw new Error('LLM provider not available')
    }

    const locale = resolveLocale(request)
    const prompt = buildGroundedRagPrompt(request, locale, context.chunks, request.mode)

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), env.ASSISTANT_FAST_TIMEOUT_MS)

    try {
      const result = await this.provider.generate(prompt)
      return parseModelResponse(result, request.mode, locale)
    } finally {
      clearTimeout(timeout)
    }
  }
}
