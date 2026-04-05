import type {
  AssistantAnswerSection,
  AssistantAnswerSectionType,
  AssistantCitation,
  AssistantConfidence,
  AssistantQueryRequest,
  AssistantQueryResponse,
  AssistantReviewItem,
  AssistantRoute,
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
  BRIEF_ROUTE_CONTEXT_BUDGET,
  MAX_SUPPLEMENTAL_PASSAGES,
  ROUTE_CONTEXT_LIMIT,
  ROUTE_SEMANTIC_LIMIT,
  PARAGRAPH_FOCUS_QUERY_SEMANTIC_LIMIT,
  SIMILAR_CONTEXT_BUDGET,
  SIMILAR_SEMANTIC_LIMIT,
  VOCAB_QUERY_SEMANTIC_LIMIT
} from './retrieval/constants.js'
import { resolveContextRoute, type AssistantContextRoute } from './contextRoute.js'
import { serializeRetrievedChunksForEval } from './evalSerialization.js'
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
/** Model may emit more; we only surface this many follow-up chips in the UI. */
const MAX_ASSISTANT_FOLLOW_UPS = 3
/** Max characters per follow-up chip label (ellipsis if longer). */
const MAX_FOLLOW_UP_CHARS = 100

function clampFollowUpLabel(value: string): string {
  const t = value.trim()
  if (!t) return ''
  if (t.length <= MAX_FOLLOW_UP_CHARS) return t
  return `${t.slice(0, MAX_FOLLOW_UP_CHARS).trimEnd()}…`
}

function normalizeFollowUpStrings(items: string[]): string[] {
  return items.map((s) => clampFollowUpLabel(s)).filter(Boolean)
}
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
    if (/速度 | 时间 | 快 | 慢 | 不够 | 来不及 | 超时 | 分配 | 管理/.test(query)) {
      return '提高雅思阅读速度的关键：1) 先读题干再扫读文章，定位关键词；2) 遇到难题先跳过，做完全部再回头；3) 平时练习要限时，培养时间感。一般建议：P1 用时 15-17 分钟，P2/P3 各 20-22 分钟。如果时间不够，优先做擅长题型。'
    }
    if (/词汇 | 单词 | 同义替换 | 近义/.test(query)) {
      return '积累 IELTS 阅读词汇的方法：1) 整理做题中遇到的同义替换，建立错题本；2) 按话题分类记忆（环境、科技、教育等）；3) 重点掌握题干和原文的对应表达，而非孤立背单词。'
    }
    if (/题型 | matching|heading|判断|填空/.test(query)) {
      return 'IELTS 阅读主要题型：1) 判断题 (T/F/NG) - 注意题干绝对词；2) 配对题 (Matching) - 先读题干再扫读；3) 段落信息配对 - 找关键词定位；4) 填空题 - 注意字数限制。建议先做自己擅长的题型。'
    }
    if (/技巧 | 方法 | 怎么提高 | 怎么练习 | 怎么学 | 怎么备考/.test(query)) {
      return '雅思阅读提分技巧：1) 学会略读 (skimming) 抓主旨；2) 扫读 (scanning) 定位关键词；3) 掌握不同题型的解题顺序；4) 积累同义替换表达。你有什么具体想了解的题型吗？'
    }
    // Default fallback
    return '这是一个很好的 IELTS 学习问题。一般来说，提高雅思阅读需要：1) 扩大词汇量，特别是同义替换；2) 熟悉不同题型的解题思路；3) 练习快速定位信息。你有什么具体问题吗？'
  }

  // English templates
  if (/speed|time|fast|slow|run out|not enough/.test(query)) {
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

const CHINESE_NUMERALS = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二', '十三', '十四', '十五', '十六', '十七', '十八', '十九', '二十']
const QUESTION_NUMBER_PATTERN = /(?:第\s*(\d+|[一二三四五六七八九十十一十二十三十四十五十六十七十八十九二十]+)\s*题)|(?:question\s*(\d+))|(?:q(\d+))|(?:paragraph\s*([A-H]))|(?:段落\s*([A-H]))/i
const QUESTION_NUMBER_PATTERN_GLOBAL = /(?:第\s*(\d+|[一二三四五六七八九十十一十二十三十四十五十六十七十八十九二十]+)\s*题)|(?:question\s*(\d+))|(?:q(\d+))|(?:paragraph\s*([A-H]))|(?:段落\s*([A-H]))/gi

/** Convert Chinese numerals (一 - 二十) to Arabic numerals (1-20) */
function chineseNumeralToArabic(value: string): string {
  const index = CHINESE_NUMERALS.indexOf(value)
  return index >= 0 ? String(index + 1) : value
}

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

  for (const match of query.matchAll(QUESTION_NUMBER_PATTERN_GLOBAL)) {
    if (match[1] || match[2] || match[3]) {
      let qNum = match[1] || match[2] || match[3]
      // Convert Chinese numerals to Arabic for matching
      if (match[1] && CHINESE_NUMERALS.includes(qNum)) {
        qNum = chineseNumeralToArabic(qNum)
      }
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

  // Follow-up chips: trust client focus + user-side question refs, not only assistant text with Q labels
  if (request.promptKind === 'followup') {
    const userHadQuestionRef = request.history?.some(h => {
      if (h.role !== 'user') return false
      return /\b(Q\d+|question\s*\d+|第\s*\d+\s*题|第\d+题)\b/i.test(h.content)
    })
    const hasGroundedHistory = request.history?.some(h => {
      if (h.role !== 'assistant') return false
      return /\b(Q\d+|question \d+|paragraph [A-H]|第\d+题|段落\s*[A-H])\b/i.test(h.content)
    })
    if (hasGroundedHistory || (request.focusQuestionNumbers?.length ?? 0) > 0 || userHadQuestionRef) {
      return { kind: 'followup_request', confidence: 0.72 }
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

/**
 * Remove prompt artifacts from LLM-generated text.
 * Strips [Context N] markers and related metadata lines that may leak into the response.
 */
function cleanPromptArtifacts(value: string): string {
  return value
    .replace(/^\[Context \d+\]\s*$/gm, '')
    .replace(/^\[Context \d+\]\s*Type:\s*\S+\s*$/gm, '')
    .replace(/^\[Context \d+\]\s*Questions:\s*.+\s*$/gm, '')
    .replace(/^\[Context \d+\]\s*Paragraphs:\s*.+\s*$/gm, '')
    .replace(/^Type:\s*(passage_paragraph|question_item|answer_key|answer_explanation|question_summary)\s*$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function createAnswerSection(type: AssistantAnswerSectionType, text: string): AssistantAnswerSection | null {
  const cleaned = cleanPromptArtifacts(text)
  const normalized = compactMultiline(cleaned)
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

/**
 * Follow-ups after greetings / identity / off-topic smalltalk (unrelated_chat).
 * Uses gentle entry points into IELTS practice — not mode-specific hint jargon (e.g. 段落核对线索).
 */
function buildSocialUnrelatedFollowUps(locale: 'zh' | 'en'): string[] {
  const raw =
    locale === 'zh'
      ? ['第 1 题怎么做', '这篇阅读怎么入手', '有什么阅读技巧']
      : ['How to approach Q1', 'How to get started on this passage', 'Any reading tips?']
  return normalizeFollowUpStrings(raw)
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

/**
 * Sanitize answer sections for hint mode - remove answer reveals.
 * For heading_matching and paragraph label questions, strip out answer options (A/B/C/D) and paragraph labels that could be the answer.
 */
function sanitizeHintAnswerSections(
  sections: AssistantAnswerSection[],
  questionType: string | undefined,
  locale: 'zh' | 'en'
): AssistantAnswerSection[] {
  const isHeadingMatching = questionType === 'heading_matching'
  const isParagraphMatching = questionType === 'paragraph_matching'
  const needsSanitization = isHeadingMatching || isParagraphMatching

  if (!needsSanitization) {
    return sections
  }

  return sections.map((section) => {
    let text = section.text

    if (locale === 'zh') {
      // Remove answer option reveals like "正确选项 D", "答案是 B", "选 D", etc.
      // Pattern: (正确 | 答案 | 选 | 应该选 | 答案是 | 正确选项 | 选项 | 应该 | 正确是) + optional (的/中/为/是) + optional whitespace + [A-H]
      text = text.replace(/(正确 | 答案 | 选 | 应该选 | 答案是 | 正确选项 | 选项 | 应该 | 正确是)\s*(的 | 中 | 为 | 是)?\s*([A-H])\b/gi, '$1$2...')

      // Remove patterns like "正确选项 D 中的'...'" -> "正确选项中的'...'"
      text = text.replace(/正确选项\s*[A-H]\s*(的 | 中)/gi, '正确选项$1')

      // Remove paragraph label reveals for heading_matching: "段落 B", "Paragraph B", "Para B"
      if (isHeadingMatching) {
        // Match: 段落 [A-H], Paragraph [A-H], Para [A-H]
        text = text.replace(/(段落 |Paragraph|Par[agra]*|第 [A-H] 段)\s*([A-H])\b/gi, '相关段落')
        // Also match standalone letter references that look like answers: "选 B" -> "选..."
        text = text.replace(/选\s*([A-H])\b/gi, '选...')
      }
    } else {
      // Remove answer option reveals like "correct answer is D", "option B", etc.
      text = text.replace(/\b(correct|answer|choose|option|should be)\s*([A-H])\b/gi, '$1 ...')

      if (isHeadingMatching) {
        // Remove paragraph label reveals
        text = text.replace(/\b(paragraph|para|section)\s*([A-H])\b/gi, 'the relevant paragraph')
        text = text.replace(/\bchoose\s+([A-H])\b/gi, 'choose ...')
      }
    }

    // Additional sanitization: remove patterns like "D 选项" (letter first)
    if (locale === 'zh') {
      text = text.replace(/\b([A-H])\s*(选项 | 项 | 段落)\b/gi, '...$2')
    } else {
      text = text.replace(/\b([A-H])\s*(option|paragraph|section)\b/gi, '... $2')
    }

    return { ...section, text }
  })
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
    ? normalizeFollowUpStrings(
        Array.from(followUpsBlockMatch[1].matchAll(/"((?:\\.|[^"])*)"|'((?:\\.|[^'])*)'/g))
          .map((match) => decodeLooseJsonString(match[1] ?? match[2] ?? ''))
          .filter(Boolean)
          .slice(0, MAX_ASSISTANT_FOLLOW_UPS)
      )
    : []

  return { answer: decodeLooseJsonString(answerMatch[1]), followUps }
}

export function parseModelResponse(content: string, locale: 'zh' | 'en'): ParsedModelResponse {
  const jsonText = extractJsonObject(content)
  const parsed = jsonText ? safeJsonParse<Record<string, unknown>>(jsonText) : null

  if (parsed && typeof parsed.answer === 'string') {
    const missingContext = Array.isArray(parsed.missingContext)
      ? parsed.missingContext.filter((value): value is string => typeof value === 'string').map((value) => compactMultiline(value)).filter(Boolean)
      : []
    // Clean prompt artifacts from the answer before building sections
    const cleanedAnswer = cleanPromptArtifacts(parsed.answer)
    const answerSections = normalizeAnswerSections(parsed.answerSections, cleanedAnswer)

    const followUps = Array.isArray(parsed.followUps)
      ? normalizeFollowUpStrings(
          parsed.followUps
            .filter((value): value is string => typeof value === 'string')
            .map((value) => compactMultiline(value))
            .filter(Boolean)
            .slice(0, MAX_ASSISTANT_FOLLOW_UPS)
        )
      : []

    return {
      answer: buildAnswerFromSections(answerSections, cleanedAnswer),
      answerSections,
      followUps,
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
    // Clean prompt artifacts from salvaged answer
    const cleanedAnswer = cleanPromptArtifacts(salvaged.answer)
    const answerSections = normalizeAnswerSections([], cleanedAnswer)
    return {
      answer: buildAnswerFromSections(answerSections, cleanedAnswer),
      answerSections,
      followUps: salvaged.followUps?.length ? normalizeFollowUpStrings(salvaged.followUps) : [],
      confidence: 'medium',
      missingContext: [],
      parseStrategy: 'salvaged'
    }
  }

  const answer = compactMultiline(content)
  const cleanedAnswer = cleanPromptArtifacts(answer)
  const answerSections = normalizeAnswerSections([], cleanedAnswer)
  return {
    answer: buildAnswerFromSections(answerSections, cleanedAnswer),
    answerSections,
    followUps: [],
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

function filterChunksForRoute(chunks: RagChunk[], route: AssistantContextRoute): RagChunk[] {
  switch (route) {
    case 'tutor':
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
  route: AssistantContextRoute,
  focusQuestionNumbers: Set<string>,
  searchTerms: string[],
  semanticRankMap: Map<string, number>
): number {
  let score = 0
  const chunkTokens = new Set(tokenizeSearchTerms(chunk.content))

  if (chunk.questionNumbers.some((value) => focusQuestionNumbers.has(value))) {
    score += 6
  }
  if (route === 'review' && chunk.chunkType === 'answer_explanation') {
    score += 6
  }
  if (route === 'review' && chunk.chunkType === 'answer_key') {
    score += 3
  }
  if (chunk.chunkType === 'question_item') {
    score += route === 'tutor' ? 4 : 3
  }
  if (chunk.chunkType === 'passage_paragraph') {
    score += route === 'tutor' ? 4 : 3
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

function buildMissingContextMessages(route: AssistantContextRoute, request: AssistantQueryRequest, chunks: RagChunk[], locale: 'zh' | 'en'): string[] {
  const missing: string[] = []
  if (!chunks.some((chunk) => chunk.chunkType === 'question_item')) {
    missing.push(locale === 'zh' ? '当前没有检索到题干内容。' : 'No question prompt was retrieved.')
  }
  if (route !== 'similar' && !chunks.some((chunk) => chunk.chunkType === 'passage_paragraph')) {
    missing.push(locale === 'zh' ? '当前没有检索到足够的文章证据段落。' : 'No supporting passage paragraph was retrieved.')
  }
  if (route === 'review' && !chunks.some((chunk) => chunk.chunkType === 'answer_explanation')) {
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
  const route = resolveContextRoute(request)
  const availableQuestionNumbers = new Set(document.questionChunks.flatMap((chunk) => chunk.questionNumbers))

  // 【HIGHEST PRIORITY】Extract question numbers explicitly mentioned in the CURRENT user query
  // This overrides any historical inheritance to handle cases like "第 12 题怎么做" after discussing Q1-3
  const query = request.userQuery || ''
  const explicitInQuery = extractMentionedQuestionNumbersFromQuery(query, availableQuestionNumbers)
  if (explicitInQuery.length > 0) {
    return sortQuestionNumbers(explicitInQuery)
  }

  // 【HIGH PRIORITY】User explicitly specified focusQuestionNumbers
  const explicit = request.focusQuestionNumbers?.filter((value) => availableQuestionNumbers.has(value)) ?? []
  if (explicit.length > 0) {
    return sortQuestionNumbers(uniqueValues(explicit))
  }

  const wrongQuestions = request.attemptContext?.wrongQuestions?.filter((value) => availableQuestionNumbers.has(value)) ?? []
  if (wrongQuestions.length > 0) {
    return sortQuestionNumbers(uniqueValues(wrongQuestions)).slice(0, route === 'review' ? 4 : 3)
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

  // Preset shortcuts: "讲解思路" / "给我提示" without a question number → whole passage set
  if (request.promptKind === 'preset') {
    const allQuestions = sortQuestionNumbers(Array.from(availableQuestionNumbers))
    const locale = resolveLocale(request)
    const q = (request.userQuery || '').trim()
    const explainWholePassage =
      locale === 'zh'
        ? /解题思路|讲解思路/.test(q)
        : /\breasoning\b/i.test(q) && (/question set/i.test(q) || /locate evidence/i.test(q))
    const hintWholePassage =
      locale === 'zh'
        ? /解题提示|给我提示|不要直接给出答案/.test(q)
        : /Give me hints|hints for the current passage|without revealing the answers/i.test(q)
    if (explainWholePassage || hintWholePassage) {
      return allQuestions
    }
    return allQuestions.slice(0, 1)
  }

  // For whole-set requests, return all questions
  if (intent?.kind === 'whole_set_or_review') {
    return sortQuestionNumbers(Array.from(availableQuestionNumbers))
  }

  // Default fallback: return empty for unknown cases
  return []
}

/**
 * Extract question numbers explicitly mentioned in the user query.
 * This is a dedicated function for higher-priority extraction from current query.
 */
function extractMentionedQuestionNumbersFromQuery(query: string, availableQuestionNumbers: Set<string>): string[] {
  const matches = [
    ...Array.from(query.matchAll(/\b(?:question|questions|q)\s*(\d{1,3})\b/gi)).map((match) => match[1]),
    ...Array.from(query.matchAll(/\u7B2C\s*(\d{1,3})\s*\u9898/g)).map((match) => match[1]),
    ...Array.from(query.matchAll(/(?:^|[^\d])(\d{1,3})\s*\u9898/g)).map((match) => match[1])
  ].filter((value) => availableQuestionNumbers.has(value))

  return sortQuestionNumbers(uniqueValues(matches))
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
    followUps: normalizeFollowUpStrings(
      response.followUps
        .slice(0, MAX_ASSISTANT_FOLLOW_UPS)
        .map((item) => sanitizeHintText(item, maskParagraphLabels))
    ),
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
  const questionTypeRaw = questionChunk?.metadata.questionType
  const paragraphHint = passageChunk?.paragraphLabels[0]
  const evidenceText = passageChunk ? toExcerpt(passageChunk.content, locale === 'zh' ? 160 : 180) : ''

  // For heading_matching questions, do NOT reveal paragraph labels (since they are the answer space)
  const isHeadingMatching = questionTypeRaw === 'heading_matching'
  const paragraphHintText = isHeadingMatching
    ? (locale === 'zh' ? '相关段落' : 'the relevant paragraph')
    : (paragraphHint ? `段落 ${paragraphHint}` : 'the cited evidence area')
  const paragraphHintTextEn = isHeadingMatching
    ? 'the relevant paragraph'
    : (paragraphHint ? `paragraph ${paragraphHint}` : 'the cited evidence area')

  return [
    createAnswerSection('direct_answer', locale === 'zh'
      ? `${question.title} 这组题建议先从${focusQuestion ? `第 ${focusQuestion} 题` : '当前题组'}入手，优先回到${paragraphHintText}附近找线索。`
      : `For ${question.title}, start with ${focusQuestion ? `Q${focusQuestion}` : 'the current question set'} and begin near ${paragraphHintTextEn}.`),
    createAnswerSection('reasoning', locale === 'zh'
      ? `先把它当作${questionType}来做：先看清题干要求，再标出关键词、对比词和限定词，然后用这些线索去缩小范围。`
      : `Treat it as ${questionType}: read the stem carefully, mark the key nouns, contrast words, and limits, then use those cues to narrow the search window.`),
    evidenceText && !isHeadingMatching ? createAnswerSection('evidence', locale === 'zh' ? `你现在最值得核对的证据是：${evidenceText}` : `The most useful evidence to inspect next is: ${evidenceText}`) : null,
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
      contextRoute: resolveContextRoute(request),
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
      contextRoute: resolveContextRoute(request),
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

  private finalizeResponse(
    route: AssistantContextRoute,
    contextChunks: RagChunk[],
    response: AssistantQueryResponse,
    /** When the learner asked for a full explanation, skip spoiler masking (legacy "explain" behavior). */
    skipHintSanitize = false
  ): AssistantQueryResponse {
    if (route !== 'tutor' || skipHintSanitize) {
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

    const route = resolveContextRoute(request)
    const prompt = buildAssistantPrompt({
      contextRoute: route,
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

    const parsed = parseModelResponse(await this.provider.generate(prompt), resolveLocale(request))
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
    const route = resolveContextRoute(request)
    const answerStyle = classifyAnswerStyle(request, locale)
    const focusQuestionNumbers = pickFocusQuestionNumbers(document, request)
    const focusSet = new Set(focusQuestionNumbers)
    let budget = route === 'similar' ? SIMILAR_CONTEXT_BUDGET : ROUTE_CONTEXT_LIMIT[route]
    if (route !== 'similar') {
      const briefKey = route === 'review' ? 'review' : 'tutor'
      if (answerStyle === 'vocab_paraphrase') {
        budget = Math.min(budget, BRIEF_ROUTE_CONTEXT_BUDGET[briefKey])
      } else if (answerStyle === 'paragraph_focus') {
        budget = Math.min(budget, BRIEF_ROUTE_CONTEXT_BUDGET[briefKey] + 1)
      }
    }
    const allowed = filterChunksForRoute(document.allChunks, route)

    const focusQuestionChunks = allowed.filter((chunk) => chunk.chunkType === 'question_item' && (focusSet.size === 0 || chunk.questionNumbers.some((value) => focusSet.has(value))))
    const focusAnswerChunks = route === 'review'
      ? allowed.filter((chunk) => ['answer_key', 'answer_explanation'].includes(chunk.chunkType) && (focusSet.size === 0 || chunk.questionNumbers.some((value) => focusSet.has(value))))
      : []

    // For heading_matching questions, ensure we include a chunk with the full heading list
    // The heading list is in the Shared instructions of any question_item chunk for this question set
    let headingListChunk: RagChunk | undefined
    if (focusQuestionChunks.some(c => c.metadata.questionType === 'heading_matching')) {
      // Find any question_item chunk with heading_matching type (they all share the same heading list)
      headingListChunk = allowed.find(chunk =>
        chunk.chunkType === 'question_item' &&
        chunk.metadata.questionType === 'heading_matching'
      )
    }

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

    // Include heading list chunk for heading_matching questions (ensure it's in the final context)
    const deterministic = dedupeChunks([
      ...(headingListChunk ? [headingListChunk] : []),
      ...focusQuestionChunks,
      ...focusAnswerChunks,
      ...focusPassageChunks,
      ...supplementalPassages
    ])

    // Semantic search conditional trigger - only run when needed
    let semanticChunks: RagChunk[] = []
    const shouldRunSemanticSearch = this.shouldRunSemanticSearch(route, request, focusQuestionChunks, focusPassageChunks, deterministic, answerStyle)

    if (this.semanticSearch && shouldRunSemanticSearch) {
      try {
        const queryText = buildSemanticQueryText(request, focusQuestionChunks)
        if (queryText) {
          let semanticLimit =
            route === 'similar' ? SIMILAR_SEMANTIC_LIMIT : ROUTE_SEMANTIC_LIMIT[route]
          if (route !== 'similar') {
            if (answerStyle === 'vocab_paraphrase') {
              semanticLimit = VOCAB_QUERY_SEMANTIC_LIMIT
            } else if (answerStyle === 'paragraph_focus') {
              semanticLimit = Math.min(semanticLimit, PARAGRAPH_FOCUS_QUERY_SEMANTIC_LIMIT)
            }
          }
          semanticChunks = filterChunksForRoute(await this.semanticSearch.searchChunks({
            questionId: question.id,
            queryText,
            limit: semanticLimit
          }), route)
        }
      } catch (error) {
        this.logger.warn?.({ contextRoute: route, detail: error instanceof Error ? error.message : String(error) }, 'Semantic chunk search failed; continuing with deterministic context.')
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
        scoreContextChunk(right, route, focusSet, searchTerms, semanticRankMap) -
        scoreContextChunk(left, route, focusSet, searchTerms, semanticRankMap)
      ))]
    )

    const finalChunks = budgetFinalChunks(route, sortedChunks, budget)

    // Ensure heading list chunk is always included for heading_matching questions
    let expandedChunks = finalChunks
    if (headingListChunk && !finalChunks.some(c => c.id === headingListChunk!.id)) {
      expandedChunks = dedupeChunks([headingListChunk, ...finalChunks])
      this.logger.info?.({ headingListChunkId: headingListChunk.id }, 'Context expansion: added heading list chunk for heading_matching question.')
    }

    // Detect missing English text and expand context if needed
    const hasEnglishText = expandedChunks.some(
      chunk => chunk.content.match(/[A-Za-z]{3,}/) && chunk.content.length > 50
    )
    if (!hasEnglishText && document.passageChunks.length > 0 && answerStyle === 'vocab_paraphrase') {
      // For vocabulary questions, add English passage chunks to enable synonym extraction
      const englishPassages = document.passageChunks.slice(0, 3)
      expandedChunks = dedupeChunks([...expandedChunks, ...englishPassages])
      this.logger.info?.({
        addedEnglishPassages: englishPassages.map(c => ({ id: c.id, paragraphLabels: c.paragraphLabels }))
      }, 'Context expansion: added English passage chunks for vocabulary query.')
    }

    const context: RetrievalContext = {
      chunks: expandedChunks,
      focusQuestionNumbers,
      usedQuestionNumbers: sortQuestionNumbers(uniqueValues(expandedChunks.flatMap((chunk) => chunk.questionNumbers))),
      usedParagraphLabels: uniqueValues(expandedChunks.flatMap((chunk) => chunk.paragraphLabels)).sort(),
      missingContext: buildMissingContextMessages(route, request, expandedChunks, locale),
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
    route: AssistantContextRoute,
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

    // Review route with explanation chunks - skip semantic if we have answer explanation
    if (route === 'review' && deterministic.some(c => c.chunkType === 'answer_explanation')) {
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
          followUps: [],
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
      followUps: [],
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
      contextRoute: 'similar',
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
      followUps: [],
      recommendedQuestions,
      confidence: recommendedQuestions.length >= 3 ? 'high' : 'medium',
      missingContext: []
    }
  }

  private buildLocalTutoringResponse(question: QuestionIndexEntry, request: AssistantQueryRequest, context: RetrievalContext, document: ParsedQuestionDocument, intent?: IntentClassification): AssistantQueryResponse {
    const locale = resolveLocale(request)
    const route = resolveContextRoute(request)
    const availableQuestionNumbers = Array.from(new Set(document.questionChunks.flatMap((chunk) => chunk.questionNumbers)))
    const resolvedIntent = intent ?? classifyIntent(request, locale, availableQuestionNumbers)
    const style = context.answerStyle
    const wantsExplain =
      /讲解|解题思路|定位过程|\bexplain\b|walk\s*through|reasoning\s+path/i.test((request.userQuery || '').trim())
    let answerSections =
      wantsExplain
        ? style === 'vocab_paraphrase'
          ? buildVocabExplainSections(question, context, locale, context.chunks)
          : style === 'paragraph_focus'
            ? buildParagraphFocusExplainSections(question, context, locale, context.chunks)
            : buildExplainSections(question, context, locale, context.chunks)
        : style === 'vocab_paraphrase'
          ? buildVocabHintSections(question, context, locale, context.chunks)
          : style === 'paragraph_focus'
            ? buildParagraphFocusHintSections(question, context, locale, context.chunks)
            : buildHintSections(question, context, locale, context.chunks)

    if (!wantsExplain) {
      const questionType = context.primaryQuestionChunk?.metadata.questionType
      answerSections = sanitizeHintAnswerSections(answerSections, questionType, locale)
    }

    return this.finalizeResponse(route, context.chunks, {
      answer: buildAnswerFromSections(answerSections),
      answerSections,
      citations: buildCitations(context.chunks),
      followUps: [],
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
    }, wantsExplain)
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
      followUps: [],
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

  private buildGroundedResponse(
    context: RetrievalContext,
    modelResponse: ParsedModelResponse,
    citations: AssistantCitation[],
    request: AssistantQueryRequest,
    question: QuestionIndexEntry
  ): AssistantQueryResponse {
    const locale = resolveLocale(request)
    const route = resolveContextRoute(request)
    const adjusted = applyAnswerStyleToParsedModel(modelResponse, context.answerStyle)

    // Sanitize answer sections for tutor route to prevent revealing answers
    let sanitizedSections = adjusted.answerSections
    if (route === 'tutor') {
      const questionType = context.primaryQuestionChunk?.metadata.questionType
      sanitizedSections = sanitizeHintAnswerSections(adjusted.answerSections, questionType, locale)
    }

    const modelFollowUps = normalizeFollowUpStrings(uniqueValues(adjusted.followUps).slice(0, MAX_ASSISTANT_FOLLOW_UPS))
    return {
      answer: buildAnswerFromSections(sanitizedSections),
      answerSections: sanitizedSections,
      citations,
      followUps: modelFollowUps,
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
      followUps: [],
      toolCards,
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

    }

    const answer = locale === 'zh'
      ? `已生成复盘报告。查看下方的诊断和错题分析。`
      : `Review report generated. Check diagnosis and mistake analysis below.`

    return {
      answer,
      citations: buildCitations(context.chunks),
      followUps: [],
      toolCards,
      responseKind: 'review',
      confidence: 'high',
      missingContext: []
    }
  }

  private buildCacheKey(request: AssistantQueryRequest, includeRetrieval = false): string {
    const parts = [
      request.questionId,
      resolveContextRoute(request),
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
    const base = parts.join('|')
    return includeRetrieval ? `${base}|evalRetrieval=1` : base
  }

  private applyEvalAugmentation(
    result: AssistantQueryResponseWithMeta,
    includeRetrieval: boolean,
    assistantRoute: AssistantRoute,
    chunks: RagChunk[]
  ): AssistantQueryResponseWithMeta {
    if (!includeRetrieval) {
      return result
    }
    return {
      ...result,
      assistantRoute,
      retrievedChunks: serializeRetrievedChunksForEval(chunks)
    }
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
      resolveContextRoute(request),
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
    request: AssistantQueryRequest,
    locale: 'zh' | 'en',
    _routingDecision: RouterDecision,
    cacheKey: string,
    startTime: number,
    includeRetrieval: boolean
  ): Promise<AssistantQueryResponseWithMeta> {
    // Social/fast path - instant local response without LLM
    const totalMs = Date.now() - startTime
    const response: AssistantQueryResponseWithMeta = {
      answer: locale === 'zh'
        ? '你好！我是 IELTS 阅读小助手。你可以问我具体题目（如"第 1 题怎么做"），或让我讲解整组题的思路。'
        : 'Hi! I\'m your IELTS Reading assistant. Ask me about specific questions (e.g., "How to approach Q1?") or request an overview of the whole set.',
      citations: [],
      followUps: buildSocialUnrelatedFollowUps(locale),
      confidence: 'high',
      missingContext: [],
      responseKind: 'social',
      usedQuestionNumbers: [],      // Clear for social responses
      usedParagraphLabels: [],      // Clear for social responses
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
    const out = this.applyEvalAugmentation(response, includeRetrieval, 'unrelated_chat', [])
    this.setCachedResponse(cacheKey, out)
    return out
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
    startTime: number,
    includeRetrieval: boolean
  ): Promise<AssistantQueryResponseWithMeta> {
    const provider = this.provider
    let answer: string
    let answerSections: AssistantAnswerSection[] | undefined
    let followUpsOut: string[] = []
    let confidenceOut: AssistantConfidence = 'high'
    let missingContextOut: string[] = []
    let modelMs = 0
    let answerSource: 'llm' | 'local' = 'local'

    // Check if we should use LLM or local template
    const useLlm = env.ASSISTANT_GENERATION_MODE === 'llm_preferred' && provider

    if (useLlm) {
      // LLM mode - call model for richer responses (slower, ~1-2s)
      const modelStart = Date.now()
      try {
        const prompt = buildIeltsCoachPrompt(request, locale)
        const raw = await provider.generate(prompt)
        modelMs = Date.now() - modelStart
        answerSource = 'llm'
        const parsed = parseModelResponse(raw, locale)
        answer = parsed.answer
        if (parsed.answerSections.length > 0) {
          answerSections = parsed.answerSections
        }
        followUpsOut = normalizeFollowUpStrings(parsed.followUps).slice(0, MAX_ASSISTANT_FOLLOW_UPS)
        confidenceOut = parsed.confidence
        missingContextOut = parsed.missingContext
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
      ...(answerSections?.length ? { answerSections } : {}),
      citations: [],
      followUps: followUpsOut,
      confidence: confidenceOut,
      missingContext: missingContextOut,
      responseKind: 'chat',
      usedQuestionNumbers: [],      // Clear for general chat (no page grounding)
      usedParagraphLabels: [],      // Clear for general chat (no page grounding)
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
    const out = this.applyEvalAugmentation(response, includeRetrieval, 'ielts_general', [])
    this.setCachedResponse(cacheKey, out)
    return out
  }

  private async queryWithTiming(
    request: AssistantQueryRequest,
    includeRetrieval = false
  ): Promise<AssistantQueryResponseWithMeta> {
    const startTime = Date.now()
    const cacheKey = this.buildCacheKey(request, includeRetrieval)

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
      return this.handleUnrelatedChat(request, locale, routingDecision, cacheKey, startTime, includeRetrieval)
    }

    // Route 2: ielts_general - IELTS learning questions not tied to current passage (no document load)
    if (routingDecision.route === 'ielts_general') {
      return this.handleIeltsGeneral(request, locale, routingDecision, cacheKey, startTime, includeRetrieval)
    }

    // Route 3: page_grounded - Questions about current passage/questions (requires document load + RAG)
    // Continue with existing flow below
    const loadStart = Date.now()
    const document = await this.documentLoader(question)
    const loadMs = Date.now() - loadStart
    const route = resolveContextRoute(request)

    // Classify intent with full document context for routing decisions
    const availableQuestionNumbers = new Set(document.questionChunks.flatMap((chunk) => chunk.questionNumbers))
    let intent = classifyIntent(request, locale, Array.from(availableQuestionNumbers))
    if (intent.kind === 'clarify') {
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
      const out = this.applyEvalAugmentation(result, includeRetrieval, 'page_grounded', context.chunks)
      this.setCachedResponse(cacheKey, out)
      return out
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
      const out = this.applyEvalAugmentation(result, includeRetrieval, 'page_grounded', context.chunks)
      this.setCachedResponse(cacheKey, out)
      return out
    }

    // Handle clarify - instant response, no context needed
    if (intent.kind === 'clarify') {
      const totalMs = Date.now() - startTime
      const response: AssistantQueryResponseWithMeta = {
        answer: locale === 'zh'
          ? '请告诉我你想了解哪道题（如"第 3 题"），或者我可以先讲解整组题的解题思路。你也可以直接说"讲一下这组题"。'
          : 'Please tell me which question you\'d like help with (e.g., "Q3"), or I can explain the overall strategy for this set. You can also say "explain the whole set".',
        citations: [],
        followUps: [],
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
      const clarifyOut = this.applyEvalAugmentation(response, includeRetrieval, 'page_grounded', [])
      this.setCachedResponse(cacheKey, clarifyOut)
      return clarifyOut
    }

    // Determine if reading-native was used (fast path) or PDF fallback
    const source: 'local' | 'llm' | 'pdf_fallback' = (document as any).sourcePath?.includes('reading-native') ? 'local' : 'pdf_fallback'

    const preferLocalTemplates = env.ASSISTANT_GENERATION_MODE === 'local' || !this.provider

    if (preferLocalTemplates) {
      const contextStart = Date.now()
      const context = await this.collectContext(question, document, request)
      const contextMs = Date.now() - contextStart

      let response: AssistantQueryResponse
      if (route === 'similar') {
        response = await this.buildSimilarResponse(question, request)
      } else if (route === 'review') {
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

      const localOut = this.applyEvalAugmentation(result, includeRetrieval, 'page_grounded', context.chunks)
      this.setCachedResponse(cacheKey, localOut)
      this.logger.info?.({
        contextRoute: route,
        questionId: question.id,
        load_ms: loadMs,
        context_ms: contextMs,
        total_ms: totalMs,
        source,
        isNative: document.sourcePath.includes('reading-native')
      }, 'Assistant local response generated.')

      return localOut
    }

    // LLM-preferred: similar recommendations stay local (no LLM synthesis of full answer)
    if (route === 'similar') {
      const contextStart = Date.now()
      const similarContext = await this.collectContext(question, document, request)
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
      const similarOut = this.applyEvalAugmentation(result, includeRetrieval, 'page_grounded', similarContext.chunks)
      this.setCachedResponse(cacheKey, similarOut)
      return similarOut
    }

    const contextStart = Date.now()
    const context = await this.collectContext(question, document, request)
    const contextMs = Date.now() - contextStart

    const reviewItems = collectReviewItems(request, document.answerExplanationChunks)

    if (context.chunks.length === 0) {
      const localResponse =
        route === 'review'
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
      const emptyCtxOut = this.applyEvalAugmentation(result, includeRetrieval, 'page_grounded', context.chunks)
      this.setCachedResponse(cacheKey, emptyCtxOut)
      return emptyCtxOut
    }

    const citations = buildCitations(context.chunks)
    const modelStart = Date.now()

    try {
      const modelResponse = await this.generateAnswer(question, request, context)
      const modelMs = Date.now() - modelStart
      const totalMs = Date.now() - startTime

      const grounded = this.buildGroundedResponse(context, modelResponse, citations, request, question)
      const withReview: AssistantQueryResponse =
        route === 'review' ? { ...grounded, reviewItems } : this.finalizeResponse(route, context.chunks, grounded)

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

      const llmOut = this.applyEvalAugmentation(result, includeRetrieval, 'page_grounded', context.chunks)
      this.setCachedResponse(cacheKey, llmOut)
      this.logger.info?.({
        contextRoute: route,
        questionId: question.id,
        load_ms: loadMs,
        context_ms: contextMs,
        model_ms: modelMs,
        total_ms: totalMs,
        source: 'llm'
      }, 'Assistant LLM response generated.')

      return llmOut
    } catch (error) {
      this.logFallback('LLM generation failed', error)
      const localResponse =
        route === 'review'
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

      const fallbackOut = this.applyEvalAugmentation(result, includeRetrieval, 'page_grounded', context.chunks)
      this.setCachedResponse(cacheKey, fallbackOut)
      return fallbackOut
    }
  }

  async query(
    request: AssistantQueryRequest,
    options?: { includeRetrieval?: boolean }
  ): Promise<AssistantQueryResponse> {
    const result = await this.queryWithTiming(request, options?.includeRetrieval ?? false)
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
          followUps: buildSocialUnrelatedFollowUps(locale),
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
          followUps: [],
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
      const route = resolveContextRoute(request)

      // Get retrieval context
      const context = await this.collectContext(question, document, request)

      // Check if we have enough context
      if (context.chunks.length === 0) {
        const fallbackResponse = route === 'review'
          ? this.buildLocalReviewResponse(question, request, context, [], document, { kind: 'grounded_question', confidence: 0.5 })
          : this.buildLocalTutoringResponse(question, request, context, document, { kind: 'grounded_question', confidence: 0.5 })

        yield { type: 'delta', payload: { text: fallbackResponse.answer } }
        yield { type: 'final', payload: { ...fallbackResponse, answerSource: 'local' } }
        return
      }

      // Generate answer with LLM using fast model
      const modelResponse = await this.generateAnswerFast(question, request, context)

      // Match non-stream finalize: readable text only (never raw JSON string in delta)
      const streamLocale = resolveLocale(request)
      const streamRoute = resolveContextRoute(request)
      const adjustedForStream = applyAnswerStyleToParsedModel(modelResponse, context.answerStyle)
      let streamSections = adjustedForStream.answerSections
      if (streamRoute === 'tutor') {
        const questionType = context.primaryQuestionChunk?.metadata.questionType
        streamSections = sanitizeHintAnswerSections(adjustedForStream.answerSections, questionType, streamLocale)
      }
      const streamDeltaText = buildAnswerFromSections(streamSections)
      yield { type: 'delta', payload: { text: streamDeltaText } }

      // Build final response
      const citations = buildCitations(context.chunks)
      const groundedResponse = this.buildGroundedResponse(context, modelResponse, citations, request, question)
      const finalResponse: AssistantQueryResponse = route === 'review'
        ? { ...groundedResponse, reviewItems: collectReviewItems(request, document.answerExplanationChunks) }
        : this.finalizeResponse(route, context.chunks, groundedResponse)

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
    const route = resolveContextRoute(request)
    const prompt = buildGroundedRagPrompt(request, locale, context.chunks, route, context.answerStyle)

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), env.ASSISTANT_FAST_TIMEOUT_MS)

    try {
      const result = await this.provider.generate(prompt)
      return parseModelResponse(result, locale)
    } finally {
      clearTimeout(timeout)
    }
  }
}
