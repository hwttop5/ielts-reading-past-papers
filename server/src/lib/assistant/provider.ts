import { env } from '../../config/env.js'

export interface AssistantPrompt {
  system: string
  user: string
}

export interface AssistantChatProvider {
  generate(prompt: AssistantPrompt): Promise<string>
}

interface OpenRouterMessageContentPart {
  type?: string
  text?: string
}

interface OpenRouterChatResponse {
  choices?: Array<{
    message?: {
      content?: string | OpenRouterMessageContentPart[]
    }
  }>
}

function withTrailingSlash(value: string): string {
  return value.endsWith('/') ? value : `${value}/`
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function buildResponseText(payload: OpenRouterChatResponse): string {
  const content = payload.choices?.[0]?.message?.content

  if (typeof content === 'string') {
    return content.trim()
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => (typeof part?.text === 'string' ? part.text : ''))
      .join('\n')
      .trim()
  }

  return ''
}

export class OpenRouterChatProvider implements AssistantChatProvider {
  private readonly fetchImpl: typeof fetch

  constructor(fetchImpl: typeof fetch = fetch) {
    this.fetchImpl = fetchImpl
  }

  async generate(prompt: AssistantPrompt): Promise<string> {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), env.LLM_TIMEOUT_MS)

    try {
      const response = await this.fetchImpl(new URL('chat/completions', withTrailingSlash(env.LLM_BASE_URL)), {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Authorization': `Bearer ${env.LLM_API_KEY}`,
          'Content-Type': 'application/json',
          ...(env.LLM_APP_URL ? { 'HTTP-Referer': env.LLM_APP_URL } : {}),
          ...(env.LLM_APP_NAME ? { 'X-Title': env.LLM_APP_NAME } : {})
        },
        body: JSON.stringify({
          model: env.LLM_CHAT_MODEL,
          messages: [
            { role: 'system', content: prompt.system },
            { role: 'user', content: prompt.user }
          ],
          temperature: 0.3
        })
      })

      if (!response.ok) {
        const detail = (await response.text().catch(() => '')).trim()
        throw new Error(`LLM provider request failed with ${response.status}${detail ? `: ${detail}` : ''}`)
      }

      const payload = await response.json() as OpenRouterChatResponse
      const text = buildResponseText(payload)
      if (!text) {
        throw new Error('LLM provider returned an empty assistant response.')
      }

      return text
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('LLM provider request timed out.')
      }

      throw new Error(toErrorMessage(error))
    } finally {
      clearTimeout(timeout)
    }
  }
}

export function createAssistantChatProvider(fetchImpl: typeof fetch = fetch): AssistantChatProvider | null {
  if (!env.LLM_API_KEY) {
    return null
  }

  switch (env.LLM_PROVIDER) {
    case 'openrouter':
      return new OpenRouterChatProvider(fetchImpl)
  }
}
