import type { AssistantAnswerSection, AssistantConfidence, AssistantQueryRequest, AssistantQueryResponse } from '@/types/assistant'

/** Normalize assistant API root (no trailing slash). */
export function normalizeAssistantBaseUrl(url: string): string {
  return url.trim().replace(/\/$/, '')
}

/** Filled by `public/assistant-api.json` via `loadAssistantPublicConfig()` (runtime, no rebuild). */
let assistantPublicConfigBaseUrl = ''

/**
 * Load optional `/assistant-api.json` from `public/` (deployed as site root).
 * Call once from `main.ts` before mounting the app so the first assistant request sees the URL.
 */
export async function loadAssistantPublicConfig(): Promise<void> {
  if (typeof window === 'undefined') {
    return
  }
  try {
    const res = await fetch('/assistant-api.json', { cache: 'no-store' })
    if (!res.ok) {
      return
    }
    const data = (await res.json()) as { apiBaseUrl?: unknown }
    if (typeof data.apiBaseUrl === 'string' && data.apiBaseUrl.trim()) {
      assistantPublicConfigBaseUrl = normalizeAssistantBaseUrl(data.apiBaseUrl)
    }
  } catch {
    // Missing file or invalid JSON is fine.
  }
}

function resolveEnvAssistantApiBaseUrl(): string {
  const configuredBaseUrl = (import.meta.env.VITE_ASSISTANT_API_BASE_URL || '').replace(/\/$/, '')

  // If VITE_ASSISTANT_API_BASE_URL is explicitly configured, use it (even in dev mode).
  // This allows developers to bypass Vite proxy if needed.
  if (configuredBaseUrl) {
    return configuredBaseUrl
  }

  if (assistantPublicConfigBaseUrl) {
    return assistantPublicConfigBaseUrl
  }

  // Dev: use same-origin `/api/*` so Vite proxies to 8787.
  if (import.meta.env.DEV) {
    return ''
  }

  if (typeof window !== 'undefined') {
    const { hostname } = window.location
    // Same-origin `/api/*` so Vite dev/preview proxy (or nginx) can forward to 8787; avoids CORS and stray 404s.
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]') {
      return ''
    }
  }

  return ''
}

/** Effective base URL for assistant HTTP API (no trailing slash). Empty = same-origin `/api/*`. */
export function getAssistantApiBaseUrl(): string {
  return resolveEnvAssistantApiBaseUrl()
}

function buildAssistantUrl(path: string): string {
  const base = getAssistantApiBaseUrl()
  if (!base) {
    return path
  }

  return `${base}${path}`
}

function isConfidence(value: unknown): value is AssistantConfidence {
  return value === 'high' || value === 'medium' || value === 'low'
}

function normalizeAnswerSections(value: unknown): AssistantAnswerSection[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .map((item) => {
      if (!item || typeof item !== 'object') {
        return null
      }

      const type = (item as { type?: AssistantAnswerSection['type'] }).type
      const text = (item as { text?: string }).text
      if (!type || typeof text !== 'string') {
        return null
      }

      return { type, text: text.trim() }
    })
    .filter((item): item is AssistantAnswerSection => Boolean(item))
}

/** Match server extractJsonObject: unwrap ```json ... ``` so embedded JSON parses. */
function stripMarkdownJsonFence(raw: string): string {
  const codeBlockMatch = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
  if (codeBlockMatch) {
    return codeBlockMatch[1].trim()
  }
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start !== -1 && end > start) {
    return raw.slice(start, end + 1).trim()
  }
  return raw.trim()
}

function extractEmbeddedAnswerPayload(rawAnswer: string): Pick<AssistantQueryResponse, 'answer' | 'followUps' | 'answerSections' | 'confidence' | 'missingContext'> | null {
  const trimmed = stripMarkdownJsonFence(rawAnswer)
  if (!trimmed.startsWith('{') || !trimmed.includes('"answer"')) {
    return null
  }

  try {
    const parsed = JSON.parse(trimmed) as {
      answer?: string
      followUps?: string[]
      answerSections?: AssistantAnswerSection[]
      confidence?: AssistantConfidence
      missingContext?: string[]
    }
    if (typeof parsed.answer === 'string') {
      return {
        answer: parsed.answer.trim(),
        followUps: Array.isArray(parsed.followUps) ? parsed.followUps.filter(Boolean).slice(0, 3) : [],
        answerSections: normalizeAnswerSections(parsed.answerSections),
        confidence: isConfidence(parsed.confidence) ? parsed.confidence : undefined,
        missingContext: Array.isArray(parsed.missingContext) ? parsed.missingContext.filter(Boolean).slice(0, 4) : []
      }
    }
  } catch {
    const answerMatch = trimmed.match(/"answer"\s*:\s*"([\s\S]*?)"\s*(?:,?\s*"(?:answerSections|followUps|confidence|missingContext)"\s*:|[}\n])/i)
    const followUpsBlockMatch = trimmed.match(/"followUps"\s*:\s*\[([\s\S]*?)\]/i)

    if (!answerMatch) {
      return null
    }

    const followUps = followUpsBlockMatch
      ? Array.from(followUpsBlockMatch[1].matchAll(/"((?:\\.|[^"])*)"/g))
          .map((match) => match[1].replace(/\\"/g, '"').replace(/\\n/g, '\n').trim())
          .filter(Boolean)
          .slice(0, 3)
      : []

    return {
      answer: answerMatch[1].replace(/\\"/g, '"').replace(/\\n/g, '\n').trim(),
      followUps,
      answerSections: [],
      missingContext: []
    }
  }

  return null
}

const NDJSON_STREAM_EVENT_TYPES = ['start', 'delta', 'final', 'error'] as const

function isNdjsonStreamEvent(chunk: unknown): chunk is { type: string; payload: unknown } {
  if (typeof chunk !== 'object' || chunk === null || !('type' in chunk)) {
    return false
  }
  const t = (chunk as { type: unknown }).type
  return typeof t === 'string' && (NDJSON_STREAM_EVENT_TYPES as readonly string[]).includes(t)
}

/**
 * When `/api/assistant/query/stream` returns a single JSON body (e.g. ASSISTANT_STREAM_ENABLED=false),
 * the payload is a plain AssistantQueryResponse with no `type` field. Expand to the NDJSON events the UI expects.
 */
function isPlainAssistantResponseBody(chunk: unknown): chunk is AssistantQueryResponse {
  if (typeof chunk !== 'object' || chunk === null) {
    return false
  }
  const c = chunk as { answer?: unknown; type?: unknown }
  return typeof c.answer === 'string' && !isNdjsonStreamEvent(chunk)
}

function expandStreamChunk(chunk: unknown): Array<{ type: string; payload: unknown }> {
  if (isNdjsonStreamEvent(chunk)) {
    return [chunk]
  }
  if (isPlainAssistantResponseBody(chunk)) {
    const normalized = normalizeAssistantResponse(chunk)
    return [
      { type: 'start', payload: { responseKind: normalized.responseKind } },
      { type: 'final', payload: normalized }
    ]
  }
  return [chunk as { type: string; payload: unknown }]
}

/** True when server sent a single JSON document (e.g. stream off), not NDJSON lines. */
function shouldReadAssistantStreamAsSingleJsonDocument(contentTypeHeader: string | null): boolean {
  const ct = (contentTypeHeader || '').toLowerCase()
  if (!ct.includes('application/json')) {
    return false
  }
  if (ct.includes('ndjson') || ct.includes('x-ndjson')) {
    return false
  }
  return true
}

/** Unwrap embedded JSON in `answer` (same as non-stream responses). Use on stream `final` payloads. */
export function normalizeAssistantResponse(payload: AssistantQueryResponse): AssistantQueryResponse {
  const embedded = extractEmbeddedAnswerPayload(payload.answer)
  if (!embedded) {
    return payload
  }

  return {
    ...payload,
    answer: embedded.answer,
    followUps: embedded.followUps.length > 0 ? embedded.followUps : payload.followUps,
    answerSections: embedded.answerSections.length > 0 ? embedded.answerSections : payload.answerSections,
    confidence: embedded.confidence || payload.confidence,
    missingContext: embedded.missingContext.length > 0 ? embedded.missingContext : payload.missingContext
  }
}

export async function queryPracticeAssistant(payload: AssistantQueryRequest): Promise<AssistantQueryResponse> {
  let response: Response
  const locale = payload.locale === 'en' ? 'en' : 'zh'

  try {
    response = await fetch(buildAssistantUrl('/api/assistant/query'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    })
  } catch {
    throw new Error(
      locale === 'en'
        ? 'Assistant backend is not reachable. Start the local assistant, set VITE_ASSISTANT_API_BASE_URL for production builds, or set apiBaseUrl in public/assistant-api.json.'
        : '智能助手后端当前不可达。请启动本地 assistant，或在构建环境配置 VITE_ASSISTANT_API_BASE_URL，或在 public/assistant-api.json 中设置 apiBaseUrl。'
    )
  }

  if (!response.ok) {
    const raw = await response.text()
    let parsed: { message?: string } | null = null
    try {
      parsed = raw ? (JSON.parse(raw) as { message?: string }) : null
    } catch {
      parsed = null
    }
    const fallbackDetail =
      raw.trim().length > 0
        ? raw.slice(0, 400)
        : locale === 'en'
          ? `Assistant request failed (HTTP ${response.status}).`
          : `智能助手请求失败（HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ''}）。请确认 assistant 已启动；本地开发请使用 Vite 并保留对 /api 的代理；线上请检查 VITE_ASSISTANT_API_BASE_URL 与 public/assistant-api.json。`
    throw new Error(parsed?.message || fallbackDetail)
  }

  const data = await response.json() as AssistantQueryResponse
  return normalizeAssistantResponse(data)
}

/**
 * Stream query practice assistant using ndjson format.
 * Events: start, delta, final, error
 */
export async function* queryPracticeAssistantStream(payload: AssistantQueryRequest): AsyncGenerator<{ type: string; payload: unknown }> {
  const locale = payload.locale === 'en' ? 'en' : 'zh'
  let response: Response

  try {
    response = await fetch(buildAssistantUrl('/api/assistant/query/stream'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    })
  } catch {
    throw new Error(
      locale === 'en'
        ? 'Assistant backend is not reachable. Start the local assistant, set VITE_ASSISTANT_API_BASE_URL for production builds, or set apiBaseUrl in public/assistant-api.json.'
        : '智能助手后端当前不可达。请启动本地 assistant，或在构建环境配置 VITE_ASSISTANT_API_BASE_URL，或在 public/assistant-api.json 中设置 apiBaseUrl。'
    )
  }

  if (!response.ok) {
    const raw = await response.text()
    let parsed: { message?: string } | null = null
    try {
      parsed = raw ? (JSON.parse(raw) as { message?: string }) : null
    } catch {
      parsed = null
    }
    const fallbackDetail =
      raw.trim().length > 0
        ? raw.slice(0, 400)
        : locale === 'en'
          ? `Assistant stream request failed (HTTP ${response.status}).`
          : `智能助手流式请求失败（HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ''}）。请检查 VITE_ASSISTANT_API_BASE_URL、assistant-api.json 或后端是否可用。`
    throw new Error(parsed?.message || fallbackDetail)
  }

  const streamContentType = response.headers.get('content-type')
  const useSingleJsonBody = shouldReadAssistantStreamAsSingleJsonDocument(streamContentType)

  if (useSingleJsonBody) {
    const raw = await response.text()
    const trimmedBody = raw.replace(/^\uFEFF/, '').trim()
    if (!trimmedBody) {
      throw new Error(locale === 'en' ? 'Response body is empty.' : '响应体为空。')
    }
    let chunk: Record<string, unknown>
    try {
      chunk = JSON.parse(trimmedBody) as Record<string, unknown>
    } catch {
      throw new Error(locale === 'en' ? 'Invalid assistant stream JSON response.' : '助教流式响应 JSON 无效。')
    }
    for (const ev of expandStreamChunk(chunk)) {
      yield ev
    }
    return
  }

  if (!response.body) {
    throw new Error(locale === 'en' ? 'Response body is empty.' : '响应体为空。')
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        if (!line.trim()) continue
        try {
          const chunk = JSON.parse(line) as Record<string, unknown>
          for (const ev of expandStreamChunk(chunk)) {
            yield ev
          }
        } catch (error) {
          console.warn('Failed to parse stream chunk:', line, error)
        }
      }
    }

    // Process remaining buffer
    if (buffer.trim()) {
      try {
        const chunk = JSON.parse(buffer) as Record<string, unknown>
        for (const ev of expandStreamChunk(chunk)) {
          yield ev
        }
      } catch (error) {
        console.warn('Failed to parse final buffer:', buffer, error)
      }
    }
  } finally {
    reader.releaseLock()
  }
}
