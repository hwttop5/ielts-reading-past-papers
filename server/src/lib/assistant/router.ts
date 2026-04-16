/**
 * Router for AI Assistant - Three-layer routing + on-demand RAG.
 */

import type { RouterDecision, AssistantQueryRequest } from '../../types/assistant.js'
import { env } from '../../config/env.js'
import { ChatOpenAI } from '@langchain/openai'
import { HumanMessage, SystemMessage } from '@langchain/core/messages'
import { buildRouterPrompt } from './prompt.js'

export type { RouterDecision }

function isExplicitToolEntry(request: AssistantQueryRequest): boolean {
  if (request.surface === 'selection_popover') return true
  if (request.surface === 'review_workspace') return true
  if (request.attachments && request.attachments.length > 0) return true
  return false
}

function hasExplicitPageSignal(request: AssistantQueryRequest, locale: 'zh' | 'en'): boolean {
  const query = (request.userQuery || '').trim().toLowerCase()
  // Question numbers: "第 N 题", "Q1", "Question 1", "QN", "question 8"
  if (/\d+(?:\s*题 |\s*Q|uestion)/i.test(query)) return true
  if (/(?:question|q)\s*\d+/i.test(query)) return true
  // Paragraph references with specific labels: "Paragraph A", "段落 A" (not just "paragraph matching")
  if (/paragraph\s*[A-H]|段落\s*[A-H]/i.test(query)) return true
  // Current passage/question references in Chinese - explicit deictic expressions
  // Match: "这篇文章", "这道题", "这组题", "本段落", "错题解析", etc.
  if (locale === 'zh' && /^(这 | 本 | 错 | 解 | 证 | 定 | 当 | 提).*(文章 | 篇 | 道 | 组 | 题 | 析 | 据 | 位 | 干 | 前)/.test(query)) return true
  // Current passage/question references in English - "this question", "the passage", etc.
  // But NOT generic question type discussions like "paragraph matching questions"
  if (locale === 'en' && /\b(this|the|my)\s*(passage|article|text|question|mistake|evidence)\b/i.test(query)) return true
  // Submitted status
  if (request.practiceContext?.submitted || request.attemptContext?.submitted) return true
  // Text selection
  if (request.selectedContext?.text) return true
  return false
}

function preRouteWithRules(request: AssistantQueryRequest, locale: 'zh' | 'en'): 'unrelated_chat' | 'ielts_general' | 'page_grounded' | null {
  const query = (request.userQuery || '').trim()
  if (!query) return 'page_grounded'
  if (isExplicitToolEntry(request)) return 'page_grounded'

  const q = query.trim()

  if (
    request.action === 'recommend_drills' ||
    /相似|类似|同质|同类型|同类题|推荐.*(?:练习|题目|文章)|找.*(?:同类型|类似)|similar\s+(?:practice|passages?|questions?|articles?)|recommend\s+similar/i.test(q)
  ) {
    return 'page_grounded'
  }

  // === unrelated_chat detection (check FIRST - highest priority) ===
  // Chinese greetings and chit-chat -> unrelated_chat
  if (locale === 'zh') {
    // Pure greetings - exact match
    const pureGreetings = new Set(['你好', '你好啊', '嗨', '在吗', '谢谢', '再见', '拜拜', '你是谁', '您好'])
    if (pureGreetings.has(q)) return 'unrelated_chat'

    // Greetings with ONLY trailing punctuation (Chinese or English)
    // Check if it starts with a greeting and the rest is only punctuation
    for (const greeting of pureGreetings) {
      if (q.startsWith(greeting)) {
        const rest = q.slice(greeting.length)
        // Check if rest is only punctuation (no alphanumeric or CJK characters)
        if (/^[\uFF0C\uFF0E\uFF01\uFF1F,.!? \t\n]*$/.test(rest) && rest.trim().length > 0) {
          return 'unrelated_chat'
        }
      }
    }

    // Weather, time, date - but NOT exam time management
    if (q.includes('天气')) return 'unrelated_chat'
    // Time queries that are NOT about exam management (must be explicit real-world time)
    if (q.includes('现在几点了') || q.includes('几点钟')) return 'unrelated_chat'
    if (q.includes('日期') || q.includes('星期')) return 'unrelated_chat'
    // Today/tomorrow/yesterday weather questions
    if (q.includes('今天') || q.includes('明天') || q.includes('昨天')) {
      if (q.includes('下雨') || q.includes('冷') || q.includes('热') || q.includes('晴') || q.includes('阴')) return 'unrelated_chat'
    }
  } else {
    // English greetings - exact match or with trailing punctuation
    if (/^(hi|hello|hey|thanks|thank you|bye|goodbye|who are you)[,.!?]?\s*$/i.test(q)) return 'unrelated_chat'
    if (/^hey\s+(there|you|!)?\s*$/i.test(q)) return 'unrelated_chat'
    // Weather, time, date (not IELTS related)
    if (/weather|what time|what day/i.test(q)) return 'unrelated_chat'
  }

  // === ielts_general detection ===
  if (locale === 'zh') {
    // Handle mixed queries: "你好，雅思阅读怎么提高" - strip greeting and classify the rest
    const withoutGreeting = q.replace(/^(你好 | 你好啊 | 嗨 | 嗨喽 | 您好)[, ，. .!? ？！\s]*/i, '').trim()
    if (withoutGreeting !== q) {
      // Had Chinese greeting prefix, classify the rest
      if (/(ielts|雅思 | 阅读 | 听力 | 写作 | 口语 | 技巧 | 方法 | 策略 | 提高 | 怎么 | 如何 | 备考)/i.test(withoutGreeting)) {
        // But make sure it's not a page-grounded question
        if (!hasExplicitPageSignal({ ...request, userQuery: withoutGreeting }, locale)) {
          return 'ielts_general'
        }
      }
    }

    // IELTS/雅思 + strategy/tips/method keywords
    if (q.includes('IELTS') || q.includes('雅思')) {
      if (q.includes('怎么') || q.includes('如何') || q.includes('技巧') || q.includes('方法') || q.includes('策略') || q.includes('提高')) {
        return 'ielts_general'
      }
    }
    // Skill areas (reading/listening/writing/speaking) + improvement
    if (q.includes('阅读') || q.includes('听力') || q.includes('写作') || q.includes('口语')) {
      if (q.includes('提高') || q.includes('技巧') || q.includes('方法') || q.includes('策略') || q.includes('怎么') || q.includes('如何')) {
        return 'ielts_general'
      }
    }
    // Question type strategies - but NOT "这道题" (this specific question)
    if (!q.startsWith('这道') && !q.startsWith('这题')) {
      if (q.includes('题型') || q.includes('技巧') || q.includes('方法') || q.includes('策略') || q.includes('怎么') || q.includes('如何')) {
        if (q.includes('匹配') || q.includes('填空') || q.includes('选择') || q.includes('判断') || q.includes('Heading')) {
          return 'ielts_general'
        }
      }
      if (q.includes('Matching Headings') || q.includes('True False') || q.includes('判断题')) {
        if (q.includes('怎么') || q.includes('如何') || q.includes('技巧') || q.includes('方法')) {
          return 'ielts_general'
        }
      }
    }
    // Vocabulary and exam prep
    if (q.includes('词汇') || q.includes('同义替换') || q.includes('单词') || q.includes('备考')) {
      if (q.includes('积累') || q.includes('提高') || q.includes('方法') || q.includes('技巧') || q.includes('怎么') || q.includes('如何')) {
        return 'ielts_general'
      }
    }
    // Exam logistics (time management, preparation) - "考试时间分配"
    if (q.includes('考试') || q.includes('备考')) {
      if (q.includes('分配') || q.includes('管理') || q.includes('准备') || q.includes('技巧') || q.includes('方法')) {
        return 'ielts_general'
      }
    }
    // Time management for IELTS - expanded to catch "时间不够怎么办", "做题超时"
    // Match explicit time management keywords with or without '时间'
    if (q.includes('时间') && (q.includes('分配') || q.includes('管理') || q.includes('不够') || q.includes('来不及'))) {
      return 'ielts_general'
    }
    // Match '超时', '来不及', '不够' with '做题' or '考试' context
    if ((q.includes('做题') || q.includes('考试') || q.includes('阅读')) && (q.includes('超时') || q.includes('来不及') || q.includes('不够'))) {
      return 'ielts_general'
    }
    // General time/speed questions about IELTS reading (not specific page-grounded)
    if (q.includes('速度') || q.includes('快') || q.includes('慢')) {
      if (q.includes('阅读') || q.includes('雅思') || q.includes('怎么') || q.includes('如何') || q.includes('提高')) {
        return 'ielts_general'
      }
    }
  } else {
    // Handle mixed queries: "Hi, how to improve reading" - strip greeting and classify the rest
    const withoutGreeting = q.replace(/^(hi|hello|hey)[,.]?\s*/i, '').trim()
    if (withoutGreeting !== q) {
      // Had a greeting prefix, classify the rest
      if (/(ielts|reading|listening|writing|speaking|practice|tips|strategy|improve|how to)/i.test(withoutGreeting)) {
        // But make sure it's not a page-grounded question
        if (!hasExplicitPageSignal({ ...request, userQuery: withoutGreeting }, locale)) {
          return 'ielts_general'
        }
      }
    }
    // IELTS + strategy/tips
    if (q.toLowerCase().includes('ielts')) {
      if (/how|tips|skills|strategy|improve/i.test(q)) return 'ielts_general'
    }
    // Skill areas + improvement - "speaking practice", "reading tips", etc.
    if (/^(reading|listening|writing|speaking)\s/i.test(q) || /\s(reading|listening|writing|speaking)\s/i.test(q)) {
      if (/practice|improve|tips|skills|strategy|how/i.test(q)) return 'ielts_general'
    }
    // Question type strategies - but NOT "this question"
    if (!/this question/i.test(q)) {
      if (/Matching Headings|True.*False|question type/i.test(q)) {
        if (/how|tips|strategy/i.test(q)) return 'ielts_general'
      }
      if (/fill in|blank|multiple choice/i.test(q)) {
        if (/tips|strategy|how/i.test(q)) return 'ielts_general'
      }
      // Generic question type discussions (paragraph matching, etc.) - but NOT specific question numbers
      if (/paragraph matching|question approach/i.test(q)) {
        if (/(reading|IELTS|question|type)/i.test(q)) return 'ielts_general'
      }
      // "how to approach/do/understand" without specific question numbers
      if (/how to (approach|understand|do)/i.test(q)) {
        // Only classify as ielts_general if it's NOT about a specific question number
        // Exclude: "how to approach question 8", "how to do question 1", etc.
        if (!/(question|q)\s*\d+|第\s*\d+\s*题/i.test(q)) {
          if (/(reading|IELTS|question type|general strategy)/i.test(q)) return 'ielts_general'
        }
      }
    }
    // Vocabulary and exam prep
    if (/vocabulary|synonym|exam|test|preparation/i.test(q)) {
      if (/build|improve|tips|strategy|how/i.test(q)) return 'ielts_general'
    }
    // Time management for exams
    if (/time management|time allocation|exam time/i.test(q)) return 'ielts_general'
  }

  return null
}

/**
 * Create router model instance (reserved for future LLM-based routing).
 */
function createRouterModel(): ChatOpenAI | null {
  if (!env.LLM_API_KEY) return null
  return new ChatOpenAI({
    model: env.ASSISTANT_ROUTER_MODEL,
    apiKey: env.LLM_API_KEY,
    temperature: 0,
    timeout: env.ASSISTANT_ROUTER_TIMEOUT_MS,
    maxRetries: 0,
    configuration: { baseURL: env.LLM_BASE_URL }
  })
}

/**
 * Classify route using LLM router (reserved for future use).
 */
async function classifyWithLLMRouter(request: AssistantQueryRequest, locale: 'zh' | 'en'): Promise<RouterDecision> {
  const model = createRouterModel()
  if (!model) {
    return { route: 'page_grounded', reason: 'Router unavailable', confidence: 0.5, useDocument: true, useRetrieval: true, useWebSearch: false }
  }
  try {
    const prompt = buildRouterPrompt(request, locale)
    const result = await model.invoke([new SystemMessage(prompt.system), new HumanMessage(prompt.user)])
    const content = typeof result.content === 'string' ? result.content : JSON.stringify(result.content)
    const jsonMatch = content.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('No JSON in router response')
    const parsed = JSON.parse(jsonMatch[0])
    const route = ['unrelated_chat', 'ielts_general', 'page_grounded'].includes(parsed.route) ? parsed.route : 'page_grounded'
    return {
      route,
      reason: parsed.reason || 'Router classification',
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.7,
      useDocument: route === 'page_grounded',
      useRetrieval: route === 'page_grounded',
      useWebSearch: route !== 'page_grounded'
    }
  } catch (error) {
    return { route: 'page_grounded', reason: `Router error: ${error instanceof Error ? error.message : 'Unknown'}`, confidence: 0.5, useDocument: true, useRetrieval: true, useWebSearch: false }
  }
}

/**
 * Main routing function - uses rule-based routing with safe fallback.
 * LLM-based routing is reserved for future use.
 */
export async function classifyRoute(request: AssistantQueryRequest, locale: 'zh' | 'en'): Promise<RouterDecision> {
  if (!env.ASSISTANT_ROUTER_ENABLED) {
    return { route: 'page_grounded', reason: 'Router disabled', confidence: 1, useDocument: true, useRetrieval: true, useWebSearch: false }
  }
  const preRouteResult = preRouteWithRules(request, locale)
  if (preRouteResult !== null) {
    return { route: preRouteResult, reason: 'Rule-based', confidence: 0.9, useDocument: preRouteResult === 'page_grounded', useRetrieval: preRouteResult === 'page_grounded', useWebSearch: preRouteResult !== 'page_grounded' }
  }
  // For uncertain cases, default to page_grounded (safer fallback)
  // LLM router can be enabled later if needed
  return { route: 'page_grounded', reason: 'Default fallback', confidence: 0.5, useDocument: true, useRetrieval: true, useWebSearch: false }
}

/**
 * Get route-specific system prompt.
 */
export function getRouteSystemPrompt(route: string, locale: 'zh' | 'en'): string {
  if (route === 'unrelated_chat') {
    return locale === 'zh' ? '友好回应日常问题，可温和引导回 IELTS 学习。' : 'Respond warmly to off-topic queries, gently guide back to IELTS.'
  }
  if (route === 'ielts_general') {
    return locale === 'zh' ? '提供通用 IELTS 学习建议，不引用当前文章。' : 'Provide general IELTS learning advice without referencing current passage.'
  }
  return locale === 'zh' ? '基于提供的文章内容和题目信息回答，引用段落证据和题号。' : 'Answer based on provided passage and questions, cite paragraph evidence and question numbers.'
}
