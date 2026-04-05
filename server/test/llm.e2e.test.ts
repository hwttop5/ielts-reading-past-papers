/**
 * LLM 端到端性能测试
 * 测试实际 API 调用的响应时间（使用当前配置的模型）
 */

import { describe, it, expect } from 'vitest'
import { ChatOpenAI } from '@langchain/openai'
import { HumanMessage, SystemMessage } from '@langchain/core/messages'
import { env } from '../src/config/env.js'

interface TimingResult {
  totalMs: number
  ttftMs?: number  // Time to first token
  model: string
}

async function measureLLMCall(iterations: number = 5): Promise<TimingResult[]> {
  const results: TimingResult[] = []

  const chatModel = new ChatOpenAI({
    model: env.LLM_CHAT_MODEL,
    apiKey: env.LLM_API_KEY,
    temperature: 0.3,
    timeout: env.LLM_TIMEOUT_MS,
    maxRetries: 0,
    configuration: {
      baseURL: env.LLM_BASE_URL
    }
  })

  const testPrompt: { system: string; user: string } = {
    system: '你是一个 IELTS Reading 助教。请简洁地回答用户问题。',
    user: '第 1 题怎么做？请给出解题思路和定位方法。'
  }

  for (let i = 0; i < iterations; i++) {
    const start = Date.now()
    try {
      // 使用流式调用测量 TTFT
      const stream = await chatModel.stream([
        new SystemMessage(testPrompt.system),
        new HumanMessage(testPrompt.user)
      ])

      let ttftMeasured = false
      for await (const chunk of stream) {
        if (!ttftMeasured) {
          const ttftMs = Date.now() - start
          results.push({ totalMs: 0, ttftMs, model: env.LLM_CHAT_MODEL! })
          ttftMeasured = true
        }
      }

      const totalMs = Date.now() - start
      results[results.length - 1].totalMs = totalMs

      console.log(`  #${i + 1}: TTFT=${results[results.length - 1].ttftMs}ms | Total=${totalMs}ms`)
    } catch (error) {
      const errorMs = Date.now() - start
      results.push({
        totalMs: errorMs,
        ttftMs: errorMs,
        model: env.LLM_CHAT_MODEL!
      })
      console.error(`  #${i + 1}: ERROR after ${errorMs}ms - ${error instanceof Error ? error.message : 'Unknown'}`)
    }
  }

  return results
}

describe('LLM 端到端性能测试', () => {
  it('测量当前配置模型的实际响应时间', async () => {
    console.log('\n' + '='.repeat(80))
    console.log('LLM 端到端性能测试')
    console.log('='.repeat(80))
    console.log(`当前模型：${env.LLM_CHAT_MODEL}`)
    console.log(`超时设置：${env.LLM_TIMEOUT_MS}ms`)
    console.log(`API Base: ${env.LLM_BASE_URL}`)
    console.log('')

    const results = await measureLLMCall(5)

    const validResults = results.filter(r => r.totalMs < env.LLM_TIMEOUT_MS)
    const avgTTFT = validResults.reduce((sum, r) => sum + (r.ttftMs || 0), 0) / validResults.length
    const avgTotal = validResults.reduce((sum, r) => sum + r.totalMs, 0) / validResults.length

    console.log('\n' + '='.repeat(80))
    console.log('📊 测试结果')
    console.log('='.repeat(80))
    console.log(`有效请求：${validResults.length}/${results.length}`)
    console.log(`平均首字时间 (TTFT): ${avgTTFT.toFixed(0)}ms`)
    console.log(`平均总响应时间：${avgTotal.toFixed(0)}ms`)
    console.log('')

    if (avgTTFT > 3000) {
      console.log('⚠️  警告：首字时间超过 3 秒，可能需要：')
      console.log('   1. 检查网络连接')
      console.log('   2. 确认 API Key 配额充足')
      console.log('   3. 考虑使用更快的模型')
    } else if (avgTTFT > 1500) {
      console.log('⚠️  提示：首字时间在 1.5-3 秒之间，属于正常范围但可以优化')
    } else {
      console.log('✅ 首字时间良好 (<1.5 秒)')
    }

    expect(validResults.length).toBeGreaterThan(0)
  }, 120000)
})
