import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { env } from '../config/env.js'
import { AssistantService } from '../lib/assistant/service.js'
import type { AssistantQueryRequest } from '../types/assistant.js'

const requestSchema = z.object({
  questionId: z.string().trim().min(1),
  mode: z.enum(['hint', 'explain', 'review', 'similar']),
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
  ).max(10).optional()
})

const rateLimitStore = new Map<string, { count: number; resetAt: number }>()

function getClientIp(request: FastifyRequest): string {
  const forwarded = request.headers['x-forwarded-for']
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0].trim()
  }

  return request.ip
}

function enforceRateLimit(request: FastifyRequest, reply: FastifyReply) {
  const ip = getClientIp(request)
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
      reply.code(400).send({
        error: 'invalid_request',
        message: error instanceof Error ? error.message : 'Invalid assistant request payload.'
      })
      return
    }

    try {
      const response = await service.query(payload)
      reply.send(response)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Assistant request failed.'
      const statusCode = message.startsWith('Unknown questionId') ? 404 : 502
      reply.code(statusCode).send({
        error: 'assistant_unavailable',
        message
      })
    }
  })
}
