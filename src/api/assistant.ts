import type { AssistantAnswerSection, AssistantConfidence, AssistantQueryRequest, AssistantQueryResponse } from '@/types/assistant'

function resolveAssistantApiBaseUrl(): string {
  const configuredBaseUrl = (import.meta.env.VITE_ASSISTANT_API_BASE_URL || '').replace(/\/$/, '')

  // If VITE_ASSISTANT_API_BASE_URL is explicitly configured, use it (even in dev mode).
  // This allows developers to bypass Vite proxy if needed.
  if (configuredBaseUrl) {
    return configuredBaseUrl
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

const assistantApiBaseUrl = resolveAssistantApiBaseUrl()

function buildAssistantUrl(path: string): string {
  if (!assistantApiBaseUrl) {
    return path
  }

  return `${assistantApiBaseUrl}${path}`
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

function extractEmbeddedAnswerPayload(rawAnswer: string): Pick<AssistantQueryResponse, 'answer' | 'followUps' | 'answerSections' | 'confidence' | 'missingContext'> | null {
  const trimmed = rawAnswer.trim()
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

function normalizeAssistantResponse(payload: AssistantQueryResponse): AssistantQueryResponse {
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
        ? 'Assistant backend is not reachable. Start the local server or configure VITE_ASSISTANT_API_BASE_URL.'
        : '智能助手后端当前不可达。请先启动本地 assistant 服务，或配置 VITE_ASSISTANT_API_BASE_URL。'
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
          : `智能助手请求失败（HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ''}）。请确认 assistant 已启动；本地开发请使用 Vite 并保留对 /api 的代理。`
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
        ? 'Assistant backend is not reachable. Start the local server or configure VITE_ASSISTANT_API_BASE_URL.'
        : '智能助手后端当前不可达。请先启动本地 assistant 服务，或配置 VITE_ASSISTANT_API_BASE_URL。'
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
          : `智能助手流式请求失败（HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ''}）。`
    throw new Error(parsed?.message || fallbackDetail)
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
          const chunk = JSON.parse(line)
          yield chunk
        } catch (error) {
          console.warn('Failed to parse stream chunk:', line, error)
        }
      }
    }

    // Process remaining buffer
    if (buffer.trim()) {
      try {
        const chunk = JSON.parse(buffer)
        yield chunk
      } catch (error) {
        console.warn('Failed to parse final buffer:', buffer, error)
      }
    }
  } finally {
    reader.releaseLock()
  }
}
