import type { AssistantAnswerSection, AssistantConfidence, AssistantQueryRequest, AssistantQueryResponse } from '@/types/assistant'

function resolveAssistantApiBaseUrl(): string {
  const configuredBaseUrl = (import.meta.env.VITE_ASSISTANT_API_BASE_URL || '').replace(/\/$/, '')
  if (configuredBaseUrl) {
    return configuredBaseUrl
  }

  if (typeof window !== 'undefined') {
    const { hostname } = window.location
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return 'http://127.0.0.1:8787'
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
    const errorPayload = await response.json().catch(() => null) as { message?: string } | null
    throw new Error(
      errorPayload?.message ||
        (locale === 'en' ? 'Assistant service is unavailable.' : '智能助手服务暂时不可用。')
    )
  }

  const data = await response.json() as AssistantQueryResponse
  return normalizeAssistantResponse(data)
}
