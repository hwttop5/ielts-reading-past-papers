/**
 * 完整请求链路性能测试
 * 模拟真实用户请求，测试从 API 入口到响应的完整链路
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { QuestionIndexEntry, ParsedQuestionDocument, RagChunk } from '../src/types/question-bank.js'

function createMockDocument(): ParsedQuestionDocument {
  const questionChunks: RagChunk[] = [{
    id: 'q1',
    questionId: 'test-001',
    title: 'Test Passage',
    category: 'P1',
    difficulty: 'Medium',
    chunkType: 'question_item',
    sensitive: false,
    questionNumbers: ['1', '2', '3'],
    paragraphLabels: [],
    content: 'Questions 1-3',
    sourcePath: '/test.html',
    metadata: {
      questionId: 'test-001',
      title: 'Test Passage',
      category: 'P1',
      difficulty: 'Medium',
      chunkType: 'question_item',
      sensitive: false,
      questionNumbers: ['1', '2', '3'],
      paragraphLabels: [],
      sourcePath: '/test.html',
      questionType: 'multiple_choice'
    }
  }]

  const passageChunks: RagChunk[] = [{
    id: 'p1',
    questionId: 'test-001',
    title: 'Test Passage',
    category: 'P1',
    difficulty: 'Medium',
    chunkType: 'passage_paragraph',
    sensitive: false,
    questionNumbers: [],
    paragraphLabels: ['A'],
    content: 'Paragraph A content',
    sourcePath: '/test.html',
    metadata: {
      questionId: 'test-001',
      title: 'Test Passage',
      category: 'P1',
      difficulty: 'Medium',
      chunkType: 'passage_paragraph',
      sensitive: false,
      questionNumbers: [],
      paragraphLabels: ['A'],
      sourcePath: '/test.html'
    }
  }]

  return {
    question: {
      id: 'test-001',
      title: 'Test Passage',
      category: 'P1',
      difficulty: 'Medium',
      htmlPath: '/test.html',
      pdfPath: '/test.pdf'
    },
    sourcePath: '/test.html',
    summary: {
      id: 'summary-001',
      questionId: 'test-001',
      title: 'Test Passage',
      category: 'P1',
      difficulty: 'Medium',
      topicSummary: 'Test',
      keywords: [],
      questionTypes: [],
      content: 'Test',
      sourcePath: '/test.html',
      metadata: {
        questionId: 'test-001',
        title: 'Test Passage',
        category: 'P1',
        difficulty: 'Medium',
        sourcePath: '/test.html',
        keywords: [],
        questionTypes: []
      }
    },
    questionChunks,
    passageChunks,
    answerKeyChunks: [],
    answerExplanationChunks: [],
    allChunks: [...questionChunks, ...passageChunks],
    qualityReport: { questionId: 'test-001', issues: [] }
  }
}

describe('完整请求链路性能分析', () => {
  let mockDocument: ParsedQuestionDocument

  beforeEach(() => {
    mockDocument = createMockDocument()
  })

  it('测量页面接地查询的完整链路时间', async () => {
    console.log('\n' + '='.repeat(80))
    console.log('完整请求链路性能分析 - page_grounded 查询')
    console.log('='.repeat(80))

    const { AssistantService } = await import('../src/lib/assistant/service.js')
    const service = new AssistantService({
      questionLoader: async () => ({
        id: 'test-001',
        title: 'Test Passage',
        category: 'P1',
        difficulty: 'Medium',
        htmlPath: '/test.html',
        pdfPath: '/test.pdf'
      }),
      documentLoader: async () => {
        const start = Date.now()
        // 模拟文档加载延迟
        await new Promise(resolve => setTimeout(resolve, 50))
        console.log(`  📄 documentLoader: ${Date.now() - start}ms`)
        return mockDocument
      },
      summariesLoader: async () => []
    })

    const timings: number[] = []

    // 测试 5 次
    for (let i = 0; i < 5; i++) {
      const start = Date.now()
      const response = await service.query({
        questionId: 'test-001',
        mode: 'hint',
        locale: 'zh',
        userQuery: '第 1 题怎么做',
        surface: 'chat_widget'
      })
      const total = Date.now() - start
      timings.push(total)
      console.log(`  请求 #${i + 1}: ${total}ms - responseKind: ${response.responseKind}`)
    }

    const avgTime = timings.reduce((a, b) => a + b, 0) / timings.length
    console.log('\n' + '-'.repeat(80))
    console.log(`平均响应时间：${avgTime.toFixed(0)}ms`)
    console.log('')
  }, 60000)

  it('测量无关聊天查询的响应时间（应该最快）', async () => {
    console.log('\n' + '='.repeat(80))
    console.log('完整请求链路性能分析 - unrelated_chat 查询')
    console.log('='.repeat(80))

    const { AssistantService } = await import('../src/lib/assistant/service.js')
    const service = new AssistantService({
      questionLoader: async () => ({
        id: 'test-001',
        title: 'Test Passage',
        category: 'P1',
        difficulty: 'Medium',
        htmlPath: '/test.html',
        pdfPath: '/test.pdf'
      }),
      documentLoader: async () => mockDocument,
      summariesLoader: async () => []
    })

    const timings: number[] = []

    for (let i = 0; i < 5; i++) {
      const start = Date.now()
      const response = await service.query({
        questionId: 'test-001',
        mode: 'hint',
        locale: 'zh',
        userQuery: '你好',
        surface: 'chat_widget'
      })
      const total = Date.now() - start
      timings.push(total)
      console.log(`  请求 #${i + 1}: ${total}ms - responseKind: ${response.responseKind}`)
    }

    const avgTime = timings.reduce((a, b) => a + b, 0) / timings.length
    console.log('\n' + '-'.repeat(80))
    console.log(`平均响应时间：${avgTime.toFixed(0)}ms`)
    console.log('')
  }, 30000)

  it('测量雅思通用查询的响应时间', async () => {
    console.log('\n' + '='.repeat(80))
    console.log('完整请求链路性能分析 - ielts_general 查询')
    console.log('='.repeat(80))

    const { AssistantService } = await import('../src/lib/assistant/service.js')
    const service = new AssistantService({
      questionLoader: async () => ({
        id: 'test-001',
        title: 'Test Passage',
        category: 'P1',
        difficulty: 'Medium',
        htmlPath: '/test.html',
        pdfPath: '/test.pdf'
      }),
      documentLoader: async () => mockDocument,
      summariesLoader: async () => []
    })

    const timings: number[] = []

    for (let i = 0; i < 5; i++) {
      const start = Date.now()
      const response = await service.query({
        questionId: 'test-001',
        mode: 'hint',
        locale: 'zh',
        userQuery: 'IELTS 阅读怎么提高速度',
        surface: 'chat_widget'
      })
      const total = Date.now() - start
      timings.push(total)
      console.log(`  请求 #${i + 1}: ${total}ms - responseKind: ${response.responseKind}`)
    }

    const avgTime = timings.reduce((a, b) => a + b, 0) / timings.length
    console.log('\n' + '-'.repeat(80))
    console.log(`平均响应时间：${avgTime.toFixed(0)}ms`)
    console.log('')
  }, 60000)
})
