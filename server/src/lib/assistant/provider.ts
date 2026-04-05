import { env } from '../../config/env.js'

export interface AssistantPrompt {
  system: string
  user: string
}

export interface AssistantChatProvider {
  generate(prompt: AssistantPrompt): Promise<string>
}

type AssistantLlmProvider = typeof env.LLM_PROVIDER

interface ChatMessageContentPart {
  type?: string
  text?: string
}

interface ChatCompletionsResponse {
  choices?: Array<{
    message?: {
      content?: string | ChatMessageContentPart[]
    }
  }>
}

interface OpenAiCompatibleProviderConfig {
  provider: AssistantLlmProvider
  apiKey: string
  baseUrl: string
  model: string
  timeoutMs: number
  appUrl?: string
  appName?: string
}

function withTrailingSlash(value: string): string {
  return value.endsWith('/') ? value : `${value}/`
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function buildResponseText(payload: ChatCompletionsResponse): string {
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

function buildProviderHeaders(config: OpenAiCompatibleProviderConfig) {
  const headers: Record<string, string> = {
    'Authorization': `Bearer ${config.apiKey}`,
    'Content-Type': 'application/json'
  }

  if (config.provider === 'openrouter') {
    if (config.appUrl) {
      headers['HTTP-Referer'] = config.appUrl
    }

    if (config.appName) {
      headers['X-Title'] = config.appName
    }
  }

  return headers
}

export class OpenAiCompatibleChatProvider implements AssistantChatProvider {
  private readonly fetchImpl: typeof fetch
  private readonly config: OpenAiCompatibleProviderConfig

  constructor(config: OpenAiCompatibleProviderConfig, fetchImpl: typeof fetch = fetch) {
    this.config = config
    this.fetchImpl = fetchImpl
  }

  async generate(prompt: AssistantPrompt): Promise<string> {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs)

    try {
      const response = await this.fetchImpl(new URL('chat/completions', withTrailingSlash(this.config.baseUrl)), {
        method: 'POST',
        signal: controller.signal,
        headers: buildProviderHeaders(this.config),
        body: JSON.stringify({
          model: this.config.model,
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

      const payload = await response.json() as ChatCompletionsResponse
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

  const config: OpenAiCompatibleProviderConfig = {
    provider: env.LLM_PROVIDER,
    apiKey: env.LLM_API_KEY,
    baseUrl: env.LLM_BASE_URL,
    model: env.LLM_CHAT_MODEL,
    timeoutMs: env.LLM_TIMEOUT_MS,
    appUrl: env.LLM_APP_URL,
    appName: env.LLM_APP_NAME
  }

  switch (env.LLM_PROVIDER) {
    case 'openrouter':
    case 'coding-plan':
      return new OpenAiCompatibleChatProvider(config, fetchImpl)
  }
}
