import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const hoisted = vi.hoisted(() => {
  const invokeMock = vi.fn().mockResolvedValue({ content: 'LLM response text' })
  const ChatOpenAIMock = vi.fn(function MockChatOpenAI(this: { invoke: typeof invokeMock }, config: Record<string, unknown>) {
    this.invoke = invokeMock
    return this
  })
  return { ChatOpenAIMock, invokeMock }
})

vi.mock('@langchain/openai', () => ({
  ChatOpenAI: hoisted.ChatOpenAIMock
}))

const ORIGINAL_ENV = { ...process.env }

async function loadProviderModule() {
  vi.resetModules()
  return import('../src/lib/assistant/provider.js')
}

describe('assistant provider selection', () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV }
    hoisted.invokeMock.mockReset()
    hoisted.invokeMock.mockResolvedValue({ content: 'LLM response text' })
    hoisted.ChatOpenAIMock.mockClear()
  })

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV }
    vi.clearAllMocks()
  })

  it('uses OpenRouter-specific headers when openrouter is configured', async () => {
    process.env.LLM_PROVIDER = 'openrouter'
    process.env.LLM_API_KEY = 'openrouter-test-key'
    process.env.LLM_BASE_URL = 'https://openrouter.ai/api/v1'
    process.env.LLM_CHAT_MODEL = 'stepfun/step-3.5-flash:free'
    process.env.LLM_APP_URL = 'http://localhost:5175'
    process.env.LLM_APP_NAME = 'IELTS Reading Past Papers'

    const { createAssistantChatProvider } = await loadProviderModule()
    const provider = createAssistantChatProvider()

    expect(provider).not.toBeNull()

    await provider?.generate({
      system: 'System prompt',
      user: 'User prompt'
    })

    expect(hoisted.invokeMock).toHaveBeenCalledOnce()
    expect(hoisted.ChatOpenAIMock).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: 'openrouter-test-key',
        model: 'stepfun/step-3.5-flash:free',
        configuration: expect.objectContaining({
          baseURL: 'https://openrouter.ai/api/v1',
          defaultHeaders: expect.objectContaining({
            'HTTP-Referer': 'http://localhost:5175',
            'X-Title': 'IELTS Reading Past Papers'
          })
        })
      })
    )
  })

  it('uses Coding Plan defaults and omits OpenRouter-only headers', async () => {
    process.env.LLM_PROVIDER = 'coding-plan'
    process.env.LLM_API_KEY = 'coding-plan-test-key'
    delete process.env.LLM_BASE_URL
    // Empty string prevents dotenv (on env re-import) from re-injecting LLM_CHAT_MODEL from .env
    process.env.LLM_CHAT_MODEL = ''
    process.env.LLM_APP_URL = 'http://localhost:5175'
    process.env.LLM_APP_NAME = 'IELTS Reading Past Papers'

    const { createAssistantChatProvider } = await loadProviderModule()
    const provider = createAssistantChatProvider()

    expect(provider).not.toBeNull()

    await provider?.generate({
      system: 'System prompt',
      user: 'User prompt'
    })

    expect(hoisted.invokeMock).toHaveBeenCalledOnce()
    const firstCall = hoisted.ChatOpenAIMock.mock.calls[0]?.[0] as Record<string, unknown>
    expect(firstCall?.configuration).toMatchObject({
      baseURL: 'https://coding.dashscope.aliyuncs.com/v1'
    })
    const headers = (firstCall?.configuration as { defaultHeaders?: Record<string, string> })?.defaultHeaders ?? {}
    expect(headers['HTTP-Referer']).toBeUndefined()
    expect(headers['X-Title']).toBeUndefined()
    expect(firstCall?.model).toBe('qwen3.5-plus')
  })

  it('returns null when the LLM API key is missing', async () => {
    process.env.LLM_API_KEY = ''

    const { createAssistantChatProvider } = await loadProviderModule()

    expect(createAssistantChatProvider()).toBeNull()
  })
})
