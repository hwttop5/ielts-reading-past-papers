import type { AssistantQueryRequest } from '../../types/assistant.js'

/**
 * Controls retrieval budget and how verbose the tutor reply should be.
 * - full_tutoring: default RAG + multi-section answers
 * - vocab_paraphrase: word/synonym questions; avoid full question-type walkthrough
 * - paragraph_focus: user asks about one paragraph's content or gist
 */
export type AnswerStyle = 'full_tutoring' | 'vocab_paraphrase' | 'paragraph_focus'

const VOCAB_PATTERNS_ZH = [
  /同义替换/,
  /近义词/,
  /同义词/,
  /paraphrase/i,
  /synonym/i,
  /改写/,
  /的\s*同义/,
  /什么意思/,
  /是什么意思/,
  /替换词/,
  /哪些词可以替换/,
  /相当于/,
  /有什么词能替换/,
  /可以换成什么词/,
  /precaution|vocabulary|word|meaning/i,  // Explicit word meaning queries
  /\bmeans\b|\bmean\b/i
]

const VOCAB_PATTERNS_EN = [
  /\bsynonym(s)?\b/i,
  /\bparaphrase\b/i,
  /\bmeans?\b.*\b(in context)?\b/i,
  /\bwhat\s+word\s+(can\s+I\s+use|can\s+replace)\b/i,
  /\bequivalent\s+to\b/i,
  /\bwhat\s+does\s+\w+\s+mean\b/i,  // Explicit "what does X mean" queries
  /\bmeaning\s+of\b/i
]

const PARAGRAPH_FOCUS_ZH = [
  /段落\s*[A-H].* 内容/,
  /段落\s*[A-H].* 原文/,
  /段落\s*[A-H].* 大意/,
  /段落\s*[A-H].* 讲/,
  /第\s*[A-H]\s*段.* 内容/,
  /第\s*[A-H]\s*段.* 原文/,
  /第\s*[A-H]\s*段.* 大意/,
  /第\s*[A-H]\s*段.* 讲/,
  /Paragraph\s*[A-H].* 内容/i,
  /Paragraph\s*[A-H].* 原文/i,
  /Paragraph\s*[A-H].* 大意/i,
  /Paragraph\s*[A-H].* 讲/i
]

const PARAGRAPH_FOCUS_EN = [
  /\bparagraph\s+[A-H]\b.*\b(content|text|about|say|main idea)\b/i,
  /\bwhat\s+(does|is)\s+paragraph\s+[A-H]\b/i
]

function normalizedQuery(request: AssistantQueryRequest): string {
  return (request.userQuery || '').trim().replace(/[？?]+$/g, '').trim()
}

/**
 * Classify how the learner's message should be answered (brevity vs full tutoring).
 * Does not replace intent routing (social/general_chat); only applies to grounded tutoring paths.
 */
export function classifyAnswerStyle(request: AssistantQueryRequest, locale: 'zh' | 'en'): AnswerStyle {
  const q = normalizedQuery(request)
  if (q.length < 2) {
    return 'full_tutoring'
  }

  if (locale === 'zh') {
    for (const p of VOCAB_PATTERNS_ZH) {
      if (p.test(q)) {
        return 'vocab_paraphrase'
      }
    }
    for (const p of PARAGRAPH_FOCUS_ZH) {
      if (p.test(q)) {
        return 'paragraph_focus'
      }
    }
  } else {
    for (const p of VOCAB_PATTERNS_EN) {
      if (p.test(q)) {
        return 'vocab_paraphrase'
      }
    }
    for (const p of PARAGRAPH_FOCUS_EN) {
      if (p.test(q)) {
        return 'paragraph_focus'
      }
    }
  }

  return 'full_tutoring'
}
