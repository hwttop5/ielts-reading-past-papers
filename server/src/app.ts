import Fastify from 'fastify'
import { env, getAssistantRuntimeMode, hasAssistantLlmConfig } from './config/env.js'
import { registerAssistantRoutes } from './routes/assistant.js'

function buildAllowedOrigins(configuredOrigin: string): string[] {
  const configured = configuredOrigin
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)

  const allowed = new Set(configured)

  for (const origin of configured) {
    if (origin.includes('localhost')) {
      allowed.add(origin.replace('localhost', '127.0.0.1'))
    }

    if (origin.includes('127.0.0.1')) {
      allowed.add(origin.replace('127.0.0.1', 'localhost'))
    }
  }

  return Array.from(allowed)
}

export async function createApp() {
  const app = Fastify({
    logger: true
  })
  const allowedOrigins = buildAllowedOrigins(env.FRONTEND_ORIGIN)
  const fallbackOrigin = allowedOrigins[0] || env.FRONTEND_ORIGIN

  app.addHook('onRequest', async (request, reply) => {
    const origin = request.headers.origin
    if (origin && allowedOrigins.includes(origin)) {
      reply.header('Access-Control-Allow-Origin', origin)
    } else {
      reply.header('Access-Control-Allow-Origin', fallbackOrigin)
    }

    reply.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
    reply.header('Access-Control-Allow-Headers', 'Content-Type, Authorization')

    if (request.method === 'OPTIONS') {
      reply.code(204).send()
    }
  })

  app.get('/health', async () => ({
    status: 'ok'
  }))

  await registerAssistantRoutes(app)
  app.log.info(
    {
      assistantMode: getAssistantRuntimeMode(),
      llmProvider: env.LLM_PROVIDER,
      llmModel: hasAssistantLlmConfig() ? env.LLM_CHAT_MODEL : null
    },
    'Assistant runtime initialized.'
  )
  return app
}
