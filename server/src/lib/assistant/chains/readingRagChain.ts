import { HumanMessage, SystemMessage } from '@langchain/core/messages'
import { ChatOpenAI } from '@langchain/openai'
import { env } from '../../../config/env.js'
import type { AssistantPrompt } from '../provider.js'

type AssistantLlmProvider = typeof env.LLM_PROVIDER

interface OpenAiCompatibleHeadersConfig {
  provider: AssistantLlmProvider
  appUrl?: string
  appName?: string
}

function buildOpenRouterHeaders(config: OpenAiCompatibleHeadersConfig): Record<string, string> {
  const headers: Record<string, string> = {}
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

function messageContentToString(content: unknown): string {
  if (typeof content === 'string') {
    return content.trim()
  }
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'object' && part !== null && 'text' in part && typeof (part as { text?: string }).text === 'string') {
          return (part as { text: string }).text
        }
        return ''
      })
      .join('\n')
      .trim()
  }
  return ''
}

/**
 * Shared ChatOpenAI instance factory for assistant tutoring and web synthesis (OpenAI-compatible APIs).
 */
export function createReadingChatModel(): ChatOpenAI | null {
  if (!env.LLM_API_KEY) {
    return null
  }

  return new ChatOpenAI({
    model: env.LLM_CHAT_MODEL,
    apiKey: env.LLM_API_KEY,
    temperature: 0.3,
    timeout: env.LLM_TIMEOUT_MS,
    maxRetries: 0,
    configuration: {
      baseURL: env.LLM_BASE_URL,
      defaultHeaders: buildOpenRouterHeaders({
        provider: env.LLM_PROVIDER,
        appUrl: env.LLM_APP_URL,
        appName: env.LLM_APP_NAME
      })
    }
  })
}

export async function invokeAssistantPrompt(model: ChatOpenAI, prompt: AssistantPrompt): Promise<string> {
  const result = await model.invoke([new SystemMessage(prompt.system), new HumanMessage(prompt.user)])
  const text = messageContentToString(result.content)
  if (!text) {
    throw new Error('LLM provider returned an empty assistant response.')
  }
  return text
}
