import { describe, expect, it, vi } from 'vitest'
import { invokeAssistantPrompt } from '../src/lib/assistant/chains/readingRagChain.js'

describe('readingRagChain invokeAssistantPrompt', () => {
  it('passes system and user messages to the model', async () => {
    const invoke = vi.fn().mockResolvedValue({ content: 'ok' })
    const model = { invoke } as unknown as import('@langchain/openai').ChatOpenAI

    const text = await invokeAssistantPrompt(model, {
      system: 'SYS',
      user: 'USER'
    })

    expect(text).toBe('ok')
    expect(invoke).toHaveBeenCalledOnce()
    const messages = invoke.mock.calls[0]?.[0] as Array<{ content?: unknown }>
    expect(messages?.length).toBe(2)
    expect(messages?.[0]?.content).toBe('SYS')
    expect(messages?.[1]?.content).toBe('USER')
  })
})
