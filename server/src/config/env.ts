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
  LLM_PROVIDER: z.enum(['openrouter', 'coding-plan']).default('openrouter'),
  LLM_API_KEY: z.string().trim().optional(),
  LLM_BASE_URL: z.string().trim().optional(),
  LLM_CHAT_MODEL: z.string().trim().optional(),
  LLM_TIMEOUT_MS: z.coerce.number().int().positive().default(35000),
  LLM_APP_URL: z.string().trim().optional(),
  LLM_APP_NAME: z.string().trim().default('IELTS Reading Past Papers'),
  OPENAI_API_KEY: z.string().trim().optional(),
  /** Optional; defaults to OpenAI API when unset. Use when embeddings must go through a proxy or compatible gateway (e.g. domestic). */
  OPENAI_EMBEDDING_BASE_URL: z.string().trim().optional(),
  OPENAI_CHAT_MODEL: z.string().trim().default('gpt-4.1-mini'),
  OPENAI_EMBED_MODEL: z.string().trim().default('text-embedding-3-small'),
  TAVILY_API_KEY: z.string().trim().optional(),
  QDRANT_URL: z.string().trim().optional(),
  QDRANT_API_KEY: z.string().trim().optional(),
  QDRANT_COLLECTION_CHUNKS: z.string().trim().default('ielts_question_chunks_v1'),
  QDRANT_COLLECTION_SUMMARIES: z.string().trim().default('ielts_question_summaries_v1'),
  /** Vector backend provider: 'qdrant' | 'chroma'. Defaults to 'qdrant'. */
  ASSISTANT_VECTOR_BACKEND: z.enum(['qdrant', 'chroma']).default('qdrant'),
  /** Chroma host URL (required when ASSISTANT_VECTOR_BACKEND=chroma) */
  CHROMA_HOST: z.string().trim().optional(),
  FRONTEND_ORIGIN: z.string().trim().default('http://localhost:5175'),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(30),
  RATE_LIMIT_WINDOW_MINUTES: z.coerce.number().int().positive().default(60),
  PORT: z.coerce.number().int().positive().default(8787),
  /** `local` = template-only tutoring; `llm_preferred` = use RAG+LLM for hint/explain/review when LLM_API_KEY is set */
  ASSISTANT_GENERATION_MODE: z.enum(['local', 'llm_preferred']).default('llm_preferred'),
  /** Router model for intent classification (defaults to LLM_CHAT_MODEL if not set) */
  ASSISTANT_ROUTER_MODEL: z.string().trim().optional(),
  ASSISTANT_ROUTER_TIMEOUT_MS: z.coerce.number().int().positive().default(15000),
  // process.env / .env values are always strings when set (e.g. "true"); accept boolean or common string forms.
  ASSISTANT_ROUTER_ENABLED: z.preprocess(
    (val) => {
      if (val === undefined || val === null || val === '') {
        return true
      }
      if (typeof val === 'boolean') {
        return val
      }
      const s = String(val).trim().toLowerCase()
      if (['true', '1', 'yes', 'on'].includes(s)) {
        return true
      }
      if (['false', '0', 'no', 'off'].includes(s)) {
        return false
      }
      return true
    },
    z.boolean()
  ),
  /** Fast model for answer generation (defaults to LLM_CHAT_MODEL if not set) */
  ASSISTANT_FAST_MODEL: z.string().trim().optional(),
  ASSISTANT_FAST_TIMEOUT_MS: z.coerce.number().int().positive().default(25000),
  /** Stream response mode */
  ASSISTANT_STREAM_ENABLED: z.preprocess(
    (val) => {
      if (val === undefined || val === null || val === '') {
        return false
      }
      if (typeof val === 'boolean') {
        return val
      }
      const s = String(val).trim().toLowerCase()
      return ['true', '1', 'yes', 'on'].includes(s)
    },
    z.boolean()
  ).default(false)
})

const parsedEnv = envSchema.parse(process.env)

function getDefaultLlmBaseUrl(provider: typeof parsedEnv.LLM_PROVIDER) {
  switch (provider) {
    case 'coding-plan':
      return 'https://coding.dashscope.aliyuncs.com/v1'
    case 'openrouter':
      return 'https://openrouter.ai/api/v1'
  }
}

function getDefaultLlmChatModel(provider: typeof parsedEnv.LLM_PROVIDER) {
  switch (provider) {
    case 'coding-plan':
      return 'qwen3.5-plus'
    case 'openrouter':
      return 'stepfun/step-3.5-flash:free'
  }
}

export const env = {
  ...parsedEnv,
  LLM_BASE_URL: parsedEnv.LLM_BASE_URL || getDefaultLlmBaseUrl(parsedEnv.LLM_PROVIDER),
  LLM_CHAT_MODEL: parsedEnv.LLM_CHAT_MODEL || getDefaultLlmChatModel(parsedEnv.LLM_PROVIDER),
  ASSISTANT_ROUTER_MODEL: parsedEnv.ASSISTANT_ROUTER_MODEL || parsedEnv.LLM_CHAT_MODEL || getDefaultLlmChatModel(parsedEnv.LLM_PROVIDER),
  ASSISTANT_FAST_MODEL: parsedEnv.ASSISTANT_FAST_MODEL || parsedEnv.LLM_CHAT_MODEL || getDefaultLlmChatModel(parsedEnv.LLM_PROVIDER),
  ASSISTANT_ROUTER_ENABLED: parsedEnv.ASSISTANT_ROUTER_ENABLED ?? true,
  ASSISTANT_STREAM_ENABLED: parsedEnv.ASSISTANT_STREAM_ENABLED ?? false
}

export function hasAssistantLlmConfig() {
  return Boolean(env.LLM_API_KEY)
}

export function hasAssistantSemanticSearchConfig() {
  const vectorBackend = env.ASSISTANT_VECTOR_BACKEND

  if (vectorBackend === 'chroma') {
    return Boolean(env.OPENAI_API_KEY && env.CHROMA_HOST)
  }

  // Default to Qdrant
  return Boolean(env.OPENAI_API_KEY && env.QDRANT_URL)
}

export function hasWebSearchConfig() {
  return Boolean(env.TAVILY_API_KEY)
}

export function getAssistantRuntimeMode() {
  if (hasAssistantLlmConfig() && hasAssistantSemanticSearchConfig()) {
    return 'llm-enabled-hybrid-retrieval'
  }

  if (hasAssistantLlmConfig()) {
    return 'llm-enabled'
  }

  return 'local-fallback'
}

export function isRouterEnabled() {
  return env.ASSISTANT_ROUTER_ENABLED && hasAssistantLlmConfig()
}

export function requireAssistantEnv() {
  if (!env.OPENAI_API_KEY) {
    throw new Error('Missing OPENAI_API_KEY in server/.env')
  }

  const vectorBackend = env.ASSISTANT_VECTOR_BACKEND

  if (vectorBackend === 'chroma') {
    if (!env.CHROMA_HOST) {
      throw new Error('Missing CHROMA_HOST in server/.env (required when ASSISTANT_VECTOR_BACKEND=chroma)')
    }
  } else {
    if (!env.QDRANT_URL) {
      throw new Error('Missing QDRANT_URL in server/.env')
    }
  }

  return env
}
