import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const ORIGINAL_ENV = { ...process.env }
const ORIGINAL_FETCH = global.fetch

async function loadProviderModule() {
  vi.resetModules()
  return import('../src/lib/assistant/provider.js')
}

describe('assistant provider selection', () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV }
  })

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV }
    global.fetch = ORIGINAL_FETCH
    vi.restoreAllMocks()
  })

  it('uses OpenRouter-specific headers when openrouter is configured', async () => {
    process.env.LLM_PROVIDER = 'openrouter'
    process.env.LLM_API_KEY = 'openrouter-test-key'
    process.env.LLM_BASE_URL = 'https://openrouter.ai/api/v1'
    process.env.LLM_CHAT_MODEL = 'stepfun/step-3.5-flash:free'
    process.env.LLM_APP_URL = 'http://localhost:5175'
    process.env.LLM_APP_NAME = 'IELTS Reading Past Papers'

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        choices: [
          {
            message: {
              content: 'OpenRouter response'
            }
          }
        ]
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      })
    )

    const { createAssistantChatProvider } = await loadProviderModule()
    const provider = createAssistantChatProvider(fetchMock as typeof fetch)

    expect(provider).not.toBeNull()

    await provider?.generate({
      system: 'System prompt',
      user: 'User prompt'
    })

    expect(fetchMock).toHaveBeenCalledOnce()

    const [url, requestInit] = fetchMock.mock.calls[0] as [URL, RequestInit]
    expect(url.toString()).toBe('https://openrouter.ai/api/v1/chat/completions')
    expect(requestInit.headers).toMatchObject({
      'Authorization': 'Bearer openrouter-test-key',
      'Content-Type': 'application/json',
      'HTTP-Referer': 'http://localhost:5175',
      'X-Title': 'IELTS Reading Past Papers'
    })

    const body = JSON.parse(String(requestInit.body))
    expect(body.model).toBe('stepfun/step-3.5-flash:free')
  })

  it('uses Coding Plan defaults and omits OpenRouter-only headers', async () => {
    process.env.LLM_PROVIDER = 'coding-plan'
    process.env.LLM_API_KEY = 'coding-plan-test-key'
    delete process.env.LLM_BASE_URL
    delete process.env.LLM_CHAT_MODEL
    process.env.LLM_APP_URL = 'http://localhost:5175'
    process.env.LLM_APP_NAME = 'IELTS Reading Past Papers'

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        choices: [
          {
            message: {
              content: 'Coding Plan response'
            }
          }
        ]
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      })
    )

    const { createAssistantChatProvider } = await loadProviderModule()
    const provider = createAssistantChatProvider(fetchMock as typeof fetch)

    expect(provider).not.toBeNull()

    await provider?.generate({
      system: 'System prompt',
      user: 'User prompt'
    })

    expect(fetchMock).toHaveBeenCalledOnce()

    const [url, requestInit] = fetchMock.mock.calls[0] as [URL, RequestInit]
    expect(url.toString()).toBe('https://coding.dashscope.aliyuncs.com/v1/chat/completions')

    const headers = requestInit.headers as Record<string, string>
    expect(headers).toMatchObject({
      'Authorization': 'Bearer coding-plan-test-key',
      'Content-Type': 'application/json'
    })
    expect(headers['HTTP-Referer']).toBeUndefined()
    expect(headers['X-Title']).toBeUndefined()

    const body = JSON.parse(String(requestInit.body))
    expect(body.model).toBe('qwen3.5-plus')
  })

  it('returns null when the LLM API key is missing', async () => {
    process.env.LLM_API_KEY = ''

    const { createAssistantChatProvider } = await loadProviderModule()

    expect(createAssistantChatProvider()).toBeNull()
  })
})
