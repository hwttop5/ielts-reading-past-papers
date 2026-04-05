/**
 * LLM 模型性能基准测试
 * 测试 Coding Plan 订阅中所有可用模型的响应速度
 */

import { describe, it, expect } from 'vitest'
import { ChatOpenAI } from '@langchain/openai'
import { HumanMessage, SystemMessage } from '@langchain/core/messages'

interface ModelBenchmark {
  model: string
  avgMs: number
  minMs: number
  maxMs: number
  results: number[]
  errorCount: number
}

// Coding Plan 订阅中的所有可用模型
const MODELS_TO_TEST = [
  'qwen3.5-plus',
  'qwen3-max-2026-01-23',
  'qwen3-coder-next',
  'qwen3-coder-plus',
  // 'glm-5',       // 跳过 - 测试超时
  // 'glm-4.7',     // 跳过 - 需要单独测试
  'kimi-k2.5',
  'MiniMax-M2.5'
]

const TEST_PROMPT: { system: string; user: string } = {
  system: '你是一个 IELTS Reading 助教。请简洁地回答用户问题，直接给出答案和简要理由。',
  user: '第 1 题怎么做？请给出解题思路和定位方法。'
}

const LLM_API_KEY = process.env.LLM_API_KEY || 'sk-sp-2a0f92395eda4dbe8af22a22e2263f3b'
const LLM_BASE_URL = process.env.LLM_BASE_URL || 'https://coding.dashscope.aliyuncs.com/v1'

async function benchmarkModel(model: string, iterations: number = 10): Promise<ModelBenchmark> {
  const chatModel = new ChatOpenAI({
    model,
    apiKey: LLM_API_KEY,
    temperature: 0.3,
    timeout: 20000,
    maxRetries: 0,
    configuration: {
      baseURL: LLM_BASE_URL
    }
  })

  const results: number[] = []
  let errorCount = 0

  for (let i = 0; i < iterations; i++) {
    try {
      const start = Date.now()
      await chatModel.invoke([
        new SystemMessage(TEST_PROMPT.system),
        new HumanMessage(TEST_PROMPT.user)
      ])
      const elapsed = Date.now() - start
      results.push(elapsed)
      console.log(`  [${model}] #${i + 1}: ${elapsed}ms`)
    } catch (error) {
      errorCount++
      results.push(99999) // 错误计为超时
      console.error(`  [${model}] #${i + 1}: ERROR - ${error instanceof Error ? error.message : 'Unknown'}`)
    }
  }

  const validResults = results.filter(r => r < 99999)
  const avgMs = validResults.length > 0
    ? validResults.reduce((a, b) => a + b, 0) / validResults.length
    : 99999
  const minMs = validResults.length > 0 ? Math.min(...validResults) : 99999
  const maxMs = validResults.length > 0 ? Math.max(...validResults) : 99999

  return { model, avgMs, minMs, maxMs, results, errorCount }
}

describe('LLM 模型性能基准测试', () => {
  it('测试所有可用模型并生成排名', async () => {
    console.log('\n' + '='.repeat(80))
    console.log('LLM 模型性能基准测试 (每个模型 10 次迭代)')
    console.log('='.repeat(80))
    console.log(`API Base URL: ${LLM_BASE_URL}`)
    console.log(`测试时间：${new Date().toLocaleString('zh-CN')}`)
    console.log('')

    const benchmarks: ModelBenchmark[] = []

    for (const model of MODELS_TO_TEST) {
      console.log(`\n📊 测试模型：${model}`)
      const result = await benchmarkModel(model, 10)
      benchmarks.push(result)
      console.log(`   平均：${result.avgMs.toFixed(0)}ms | 最快：${result.minMs}ms | 最慢：${result.maxMs}ms | 错误：${result.errorCount}/10`)
    }

    // 按平均速度排名
    const ranked = benchmarks
      .filter(b => b.errorCount < 5) // 排除错误率过高的模型
      .sort((a, b) => a.avgMs - b.avgMs)

    console.log('\n' + '='.repeat(80))
    console.log('🏆 模型性能排名 (按平均响应时间)')
    console.log('='.repeat(80))
    console.log('排名\t模型\t\t\t平均 (ms)\t最快 (ms)\t最慢 (ms)\t错误数')
    console.log('-'.repeat(80))

    ranked.forEach((bench, index) => {
      const rank = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `#${index + 1}`
      const modelDisplay = bench.model.padEnd(20)
      console.log(`${rank}\t${modelDisplay}\t${bench.avgMs.toFixed(0)}\t\t${bench.minMs}\t\t${bench.maxMs}\t\t${bench.errorCount}/10`)
    })

    if (ranked.length >= 2) {
      console.log('\n' + '='.repeat(80))
      console.log('✅ 推荐使用的最快 2 个模型:')
      console.log('='.repeat(80))
      console.log(`1. ${ranked[0].model} - 平均 ${ranked[0].avgMs.toFixed(0)}ms`)
      console.log(`2. ${ranked[1].model} - 平均 ${ranked[1].avgMs.toFixed(0)}ms`)
      console.log('')
      console.log('建议修改 .env 文件:')
      console.log(`LLM_CHAT_MODEL=${ranked[0].model}`)
    }

    // 断言至少有一个模型可用
    expect(ranked.length).toBeGreaterThan(0)
  }, 600000) // 10 分钟超时（6 个模型 × 10 次 × 平均 3 秒 + 缓冲）
})
