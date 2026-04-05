import { env } from '../../config/env.js'
import { createReadingChatModel, invokeAssistantPrompt } from './chains/readingRagChain.js'

export interface AssistantPrompt {
  system: string
  user: string
}

export interface AssistantChatProvider {
  generate(prompt: AssistantPrompt): Promise<string>
}

export interface WebSearchResult {
  title: string
  url: string
  snippet: string
  sourceType?: string
}

export interface WebSearchProvider {
  search(query: string, numResults?: number): Promise<WebSearchResult[]>
}

class LangChainAssistantChatProvider implements AssistantChatProvider {
  constructor(private readonly model: NonNullable<ReturnType<typeof createReadingChatModel>>) {}

  async generate(prompt: AssistantPrompt): Promise<string> {
    return invokeAssistantPrompt(this.model, prompt)
  }
}

export function createAssistantChatProvider(): AssistantChatProvider | null {
  const model = createReadingChatModel()
  if (!model) {
    return null
  }

  return new LangChainAssistantChatProvider(model)
}

interface TavilySearchResponse {
  results: Array<{
    title: string
    url: string
    content: string
    score?: number
  }>
  answer?: string
  query?: string
}

export class TavilyWebSearchProvider implements WebSearchProvider {
  private readonly apiKey: string
  private readonly fetchImpl: typeof fetch

  constructor(apiKey: string, fetchImpl: typeof fetch = fetch) {
    this.apiKey = apiKey
    this.fetchImpl = fetchImpl
  }

  async search(query: string, numResults: number = 5): Promise<WebSearchResult[]> {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10000)

    try {
      const response = await this.fetchImpl('https://api.tavily.com/search', {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({
          query,
          num_results: numResults,
          include_answer: true,
          search_depth: 'basic'
        })
      })

      if (!response.ok) {
        const detail = (await response.text().catch(() => '')).trim()
        throw new Error(`Tavily search request failed with ${response.status}${detail ? `: ${detail}` : ''}`)
      }

      const payload = await response.json() as TavilySearchResponse
      return payload.results.slice(0, numResults).map((result) => ({
        title: result.title,
        url: result.url,
        snippet: result.content,
        sourceType: 'web'
      }))
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('Tavily search request timed out.')
      }
      throw error
    } finally {
      clearTimeout(timeout)
    }
  }
}

export function createWebSearchProvider(fetchImpl: typeof fetch = fetch): WebSearchProvider | null {
  if (!env.TAVILY_API_KEY) {
    return null
  }
  return new TavilyWebSearchProvider(env.TAVILY_API_KEY, fetchImpl)
}
