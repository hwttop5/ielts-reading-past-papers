import { config as loadDotenv } from 'dotenv'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { z } from 'zod'
import { serverRoot } from './paths.js'

const envFile = resolve(serverRoot, '.env')

if (existsSync(envFile)) {
  loadDotenv({ path: envFile })
} else {
  loadDotenv()
}

const envSchema = z.object({
  LLM_PROVIDER: z.enum(['openrouter']).default('openrouter'),
  LLM_API_KEY: z.string().trim().optional(),
  LLM_BASE_URL: z.string().trim().default('https://openrouter.ai/api/v1'),
  LLM_CHAT_MODEL: z.string().trim().default('stepfun/step-3.5-flash:free'),
  LLM_TIMEOUT_MS: z.coerce.number().int().positive().default(35000),
  LLM_APP_URL: z.string().trim().optional(),
  LLM_APP_NAME: z.string().trim().default('IELTS Reading Past Papers'),
  OPENAI_API_KEY: z.string().trim().optional(),
  OPENAI_CHAT_MODEL: z.string().trim().default('gpt-4.1-mini'),
  OPENAI_EMBED_MODEL: z.string().trim().default('text-embedding-3-small'),
  QDRANT_URL: z.string().trim().optional(),
  QDRANT_API_KEY: z.string().trim().optional(),
  QDRANT_COLLECTION_CHUNKS: z.string().trim().default('ielts_question_chunks_v1'),
  QDRANT_COLLECTION_SUMMARIES: z.string().trim().default('ielts_question_summaries_v1'),
  FRONTEND_ORIGIN: z.string().trim().default('http://localhost:5173'),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(30),
  RATE_LIMIT_WINDOW_MINUTES: z.coerce.number().int().positive().default(60),
  PORT: z.coerce.number().int().positive().default(8787)
})

export const env = envSchema.parse(process.env)

export function hasAssistantLlmConfig() {
  return Boolean(env.LLM_API_KEY)
}

export function getAssistantRuntimeMode() {
  return hasAssistantLlmConfig() ? 'llm-enabled' : 'local-fallback'
}

export function requireAssistantEnv() {
  if (!env.OPENAI_API_KEY) {
    throw new Error('Missing OPENAI_API_KEY in server/.env')
  }

  if (!env.QDRANT_URL) {
    throw new Error('Missing QDRANT_URL in server/.env')
  }

  return env
}
