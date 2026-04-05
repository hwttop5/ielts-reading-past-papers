import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { env } from '../config/env.js'
import { AssistantService } from '../lib/assistant/service.js'
import type { AssistantQueryRequest } from '../types/assistant.js'

const requestSchema = z.object({
  questionId: z.string().trim().min(1),
  locale: z.enum(['zh', 'en']).default('zh').optional(),
  userQuery: z.string().trim().max(12000).optional(),
  history: z.array(
    z.object({
      role: z.enum(['user', 'assistant']),
      content: z.string().trim().min(1).max(1500)
    })
  ).max(6).optional(),
  attachments: z.array(
    z.object({
      name: z.string().trim().min(1).max(255),
      type: z.string().trim().min(1).max(120),
      text: z.string().trim().max(6000).optional(),
      truncated: z.boolean().optional()
    })
  ).max(6).optional(),
  focusQuestionNumbers: z.array(z.string().trim().regex(/^\d{1,3}$/)).max(8).optional(),
  attemptContext: z.object({
    selectedAnswers: z.record(z.string(), z.string()).optional(),
    score: z.number().min(0).optional(),
    wrongQuestions: z.array(z.string().trim().regex(/^\d{1,3}$/)).max(30).optional(),
    submitted: z.boolean().optional()
  }).optional(),
  recentPractice: z.array(
    z.object({
      questionId: z.string().trim().min(1),
      accuracy: z.number().min(0).max(100),
      category: z.string().trim().min(1),
      duration: z.number().min(0)
    })
  ).max(10).optional(),
  promptKind: z.enum(['preset', 'freeform', 'followup']).optional(),
  // New fields for unified protocol
  surface: z.enum(['chat_widget', 'selection_popover', 'review_workspace']).optional(),
  action: z.enum([
    'chat',
    'translate',
    'explain_selection',
    'find_paraphrases',
    'find_antonyms',
    'extract_keywords',
    'locate_evidence',
    'analyze_mistake',
    'review_set',
    'recommend_drills'
  ]).optional(),
  selectedContext: z.object({
    text: z.string().trim().max(2000),
    scope: z.enum(['passage', 'question']),
    questionNumbers: z.array(z.string().trim().regex(/^\d{1,3}$/)).optional(),
    paragraphLabels: z.array(z.string().trim().regex(/^[A-H]$/i)).optional()
  }).optional(),
  practiceContext: z.object({
    submitted: z.boolean().optional(),
    score: z.number().min(0).optional(),
    wrongQuestions: z.array(z.string().trim().regex(/^\d{1,3}$/)).max(30).optional(),
    selectedAnswers: z.record(z.string(), z.string()).optional(),
    currentQuestionNumbers: z.array(z.string().trim().regex(/^\d{1,3}$/)).max(15).optional()
  }).optional(),
  // Search control fields
  searchMode: z.enum(['auto', 'off', 'required']).optional(),
  allowWebSearch: z.boolean().optional()
})

const rateLimitStore = new Map<string, { count: number; resetAt: number }>()

function getClientIp(request: FastifyRequest): string {
  const forwarded = request.headers['x-forwarded-for']
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0].trim()
  }

  return request.ip
}

function isLocalhostIp(ip: string): boolean {
  if (ip === '127.0.0.1' || ip === '::1' || ip === 'localhost') {
    return true
  }
  // IPv4-mapped IPv6
  return ip === '::ffff:127.0.0.1'
}

/** Include serialized RAG chunks in JSON when CI/local eval needs them. */
export function shouldIncludeAssistantEvalRetrieval(request: FastifyRequest): boolean {
  if (env.ASSISTANT_INCLUDE_RETRIEVAL) {
    return true
  }
  const raw = request.headers['x-assistant-eval']
  const v = Array.isArray(raw) ? raw[0] : raw
  const headerOn =
    v === '1' || v === 'true' || (typeof v === 'string' && v.toLowerCase() === 'on')
  if (!headerOn) {
    return false
  }
  if (process.env.NODE_ENV === 'development') {
    return true
  }
  return isLocalhostIp(getClientIp(request))
}

function enforceRateLimit(request: FastifyRequest, reply: FastifyReply) {
  const ip = getClientIp(request)
  // Local dev: avoid 429 while iterating on the assistant UI (see server/.env.example RATE_LIMIT_*)
  if (process.env.NODE_ENV === 'development' && isLocalhostIp(ip)) {
    return
  }
  const windowMs = env.RATE_LIMIT_WINDOW_MINUTES * 60 * 1000
  const now = Date.now()
  const current = rateLimitStore.get(ip)

  if (!current || current.resetAt <= now) {
    rateLimitStore.set(ip, { count: 1, resetAt: now + windowMs })
    return
  }

  if (current.count >= env.RATE_LIMIT_MAX) {
    reply.code(429).send({
      error: 'rate_limit_exceeded',
      message: `Too many assistant requests. Try again after ${new Date(current.resetAt).toISOString()}.`
    })
    return
  }

  current.count += 1
  rateLimitStore.set(ip, current)
}

export async function registerAssistantRoutes(app: FastifyInstance) {
  const service = new AssistantService({ logger: app.log })

  app.post('/api/assistant/query', async (request, reply) => {
    enforceRateLimit(request, reply)
    if (reply.sent) {
      return
    }

    let payload: AssistantQueryRequest

    try {
      payload = requestSchema.parse(request.body)
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Invalid assistant request payload.'
      reply.code(400).send({
        error: 'invalid_request',
        message: msg
      })
      return
    }

    try {
      const includeRetrieval = shouldIncludeAssistantEvalRetrieval(request)
      const response = await service.query(payload, { includeRetrieval })
      reply.send(response)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Assistant request failed.'
      // Use 400 (not 404) so dev proxies/browsers reliably forward JSON error bodies; message still explains unknown id.
      const statusCode = message.startsWith('Unknown questionId') ? 400 : 502
      reply.code(statusCode).send({
        error: 'assistant_unavailable',
        message
      })
    }
  })

  // Stream endpoint for progressive response
  app.post('/api/assistant/query/stream', async (request, reply) => {
    enforceRateLimit(request, reply)
    if (reply.sent) {
      return
    }

    // Check if streaming is enabled
    if (!env.ASSISTANT_STREAM_ENABLED) {
      // Fallback to non-streaming endpoint - just process as regular query
      const payload: AssistantQueryRequest = requestSchema.parse(request.body)
      const includeRetrieval = shouldIncludeAssistantEvalRetrieval(request)
      const response = await service.query(payload, { includeRetrieval })
      return reply.send(response)
    }

    let payload: AssistantQueryRequest

    try {
      payload = requestSchema.parse(request.body)
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Invalid assistant request payload.'
      reply.code(400).send({
        error: 'invalid_request',
        message: msg
      })
      return
    }

    try {
      reply.header('Content-Type', 'application/x-ndjson')
      reply.header('Cache-Control', 'no-cache')
      reply.header('X-Accel-Buffering', 'no')

      // Start streaming
      const stream = await service.queryStream(payload)

      for await (const chunk of stream) {
        reply.raw.write(JSON.stringify(chunk) + '\n')
      }

      reply.raw.end()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Assistant stream request failed.'
      reply.code(502).send({
        error: 'assistant_unavailable',
        message
      })
    }
  })
}
