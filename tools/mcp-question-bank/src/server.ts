import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { AssistantService } from '../../../server/src/lib/assistant/service.js'
import {
  findQuestionIndexEntry,
  loadQuestionIndex,
  parseQuestionDocument
} from '../../../server/src/lib/question-bank/index.js'
import type { RagChunkType } from '../../../server/src/types/question-bank.js'

const currentDir = fileURLToPath(new URL('.', import.meta.url))
const repoRoot = resolve(currentDir, '../../..')
const serverDir = resolve(repoRoot, 'server')

function textResult(value: unknown) {
  return {
    content: [
      {
        type: 'text' as const,
        text: typeof value === 'string' ? value : JSON.stringify(value, null, 2)
      }
    ]
  }
}

async function withQuestion(questionId: string) {
  const question = await findQuestionIndexEntry(questionId)
  if (!question) {
    throw new Error(`Unknown questionId: ${questionId}`)
  }

  const parsed = await parseQuestionDocument(question)
  return { question, parsed }
}

function runServerIngest(limit?: number) {
  return new Promise<{ exitCode: number | null; stdout: string; stderr: string }>((resolvePromise) => {
    const args = ['run', 'ingest']
    if (limit && limit > 0) {
      args.push('--', `--limit=${limit}`)
    }

    const child = spawn('npm', args, {
      cwd: serverDir,
      shell: true
    })

    let stdout = ''
    let stderr = ''

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString()
    })

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
    })

    child.on('close', (exitCode) => {
      resolvePromise({ exitCode, stdout, stderr })
    })
  })
}

const server = new McpServer({
  name: 'question-bank-tools',
  version: '1.0.0'
})

server.registerTool(
  'list_questions',
  {
    description: 'List indexed IELTS reading questions with optional category and difficulty filters.',
    inputSchema: {
      category: z.string().optional(),
      difficulty: z.string().optional(),
      limit: z.number().int().positive().max(100).optional()
    }
  },
  async ({ category, difficulty, limit }) => {
    const questions = await loadQuestionIndex()
    const filtered = questions.filter((question) => {
      if (category && question.category !== category) {
        return false
      }

      if (difficulty && question.difficulty !== difficulty) {
        return false
      }

      return true
    })

    return textResult({
      total: filtered.length,
      questions: filtered.slice(0, limit ?? 30)
    })
  }
)

server.registerTool(
  'get_question_context',
  {
    description: 'Parse one question page and return its structured context, summary, and quality report.',
    inputSchema: {
      questionId: z.string().min(1)
    }
  },
  async ({ questionId }) => {
    const { question, parsed } = await withQuestion(questionId)
    return textResult({
      question,
      summary: parsed.summary,
      chunkCounts: {
        passage: parsed.passageChunks.length,
        question: parsed.questionChunks.length,
        answerKey: parsed.answerKeyChunks.length,
        answerExplanation: parsed.answerExplanationChunks.length
      },
      qualityReport: parsed.qualityReport
    })
  }
)

server.registerTool(
  'preview_chunks',
  {
    description: 'Preview parsed chunks for a question, optionally filtered by chunk type or sensitivity.',
    inputSchema: {
      questionId: z.string().min(1),
      chunkType: z.enum(['passage_paragraph', 'question_item', 'answer_key', 'answer_explanation']).optional(),
      includeSensitive: z.boolean().optional()
    }
  },
  async ({ questionId, chunkType, includeSensitive }) => {
    const { parsed } = await withQuestion(questionId)
    const chunks = parsed.allChunks.filter((chunk) => {
      if (chunkType && chunk.chunkType !== chunkType) {
        return false
      }

      if (includeSensitive === false && chunk.sensitive) {
        return false
      }

      return true
    })

    return textResult({
      total: chunks.length,
      chunks
    })
  }
)

server.registerTool(
  'reindex_question_bank',
  {
    description: 'Run the shared ingestion pipeline and push chunks into Qdrant.',
    inputSchema: {
      limit: z.number().int().positive().max(129).optional()
    }
  },
  async ({ limit }) => {
    const result = await runServerIngest(limit)
    return textResult(result)
  }
)

server.registerTool(
  'quality_check_question',
  {
    description: 'Run the parser against a single question and report extraction issues.',
    inputSchema: {
      questionId: z.string().min(1)
    }
  },
  async ({ questionId }) => {
    const { parsed } = await withQuestion(questionId)
    return textResult(parsed.qualityReport)
  }
)

server.registerTool(
  'find_similar_questions',
  {
    description: 'Use the shared assistant similarity retrieval to recommend related questions.',
    inputSchema: {
      questionId: z.string().min(1),
      userQuery: z.string().optional()
    }
  },
  async ({ questionId, userQuery }) => {
    const assistant = new AssistantService()
    const response = await assistant.query({
      questionId,
      action: 'recommend_drills',
      userQuery
    })

    return textResult(response)
  }
)

const transport = new StdioServerTransport()
await server.connect(transport)
