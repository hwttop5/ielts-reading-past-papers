import { OpenAIEmbeddings } from '@langchain/openai'
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
  /** Dedicated embedding stack (e.g. local TEI OpenAI-compatible `/v1`). Takes precedence over OPENAI_EMBEDDING_BASE_URL / OPENAI_EMBED_MODEL for embedding calls. */
  EMBEDDING_PROVIDER: z.enum(['openai_compatible']).default('openai_compatible'),
  EMBEDDING_BASE_URL: z.string().trim().optional(),
  /** TEI and some gateways accept a placeholder when auth is disabled. */
  EMBEDDING_API_KEY: z.string().trim().optional(),
  EMBEDDING_MODEL: z.string().trim().default('text-embeddings-inference'),
  /** Batch size for embedding document requests. Keep conservative for local TEI to avoid 422 on oversized batches. */
  EMBEDDING_BATCH_SIZE: z.coerce.number().int().positive().default(32),
  /** Optional; defaults to OpenAI API when unset. Use when embeddings must go through a proxy or compatible gateway (e.g. domestic). */
  OPENAI_EMBEDDING_BASE_URL: z.string().trim().optional(),
  OPENAI_CHAT_MODEL: z.string().trim().default('gpt-4.1-mini'),
  OPENAI_EMBED_MODEL: z.string().trim().default('text-embedding-3-small'),
  TAVILY_API_KEY: z.string().trim().optional(),
  QDRANT_URL: z.string().trim().optional(),
  QDRANT_API_KEY: z.string().trim().optional(),
  QDRANT_COLLECTION_CHUNKS: z.string().trim().default('ielts_question_chunks_v1'),
  QDRANT_COLLECTION_SUMMARIES: z.string().trim().default('ielts_question_summaries_v1'),
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
  /** When true, assistant responses may include retrievedChunks for RAG eval (also requires X-Assistant-Eval header unless this alone is set). */
  ASSISTANT_INCLUDE_RETRIEVAL: z.preprocess(
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
  ).default(false),
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

export type ResolvedEmbeddingConfig = {
  /** OpenAI-compatible API base (e.g. `http://127.0.0.1:8080/v1`). Undefined = default OpenAI embeddings endpoint. */
  baseURL: string | undefined
  apiKey: string
  model: string
}

/**
 * Prefer `EMBEDDING_*`; fall back to `OPENAI_EMBEDDING_BASE_URL` + `OPENAI_EMBED_MODEL` + `OPENAI_API_KEY`.
 */
export function getResolvedEmbeddingConfig(): ResolvedEmbeddingConfig {
  const embBase = parsedEnv.EMBEDDING_BASE_URL?.trim()
  if (embBase) {
    return {
      baseURL: embBase.replace(/\/$/, ''),
      apiKey: (parsedEnv.EMBEDDING_API_KEY ?? '-').trim(),
      model: parsedEnv.EMBEDDING_MODEL.trim()
    }
  }

  const legacyBase = parsedEnv.OPENAI_EMBEDDING_BASE_URL?.trim()
  return {
    baseURL: legacyBase ? legacyBase.replace(/\/$/, '') : undefined,
    apiKey: parsedEnv.OPENAI_API_KEY?.trim() ?? '',
    model: parsedEnv.OPENAI_EMBED_MODEL
  }
}

export function createAssistantEmbeddings(): OpenAIEmbeddings {
  const c = getResolvedEmbeddingConfig()
  return new OpenAIEmbeddings({
    apiKey: c.apiKey,
    model: c.model,
    batchSize: env.EMBEDDING_BATCH_SIZE,
    ...(c.baseURL ? { configuration: { baseURL: c.baseURL } } : {})
  })
}

export function hasAssistantSemanticSearchConfig() {
  if (!parsedEnv.QDRANT_URL?.trim()) {
    return false
  }
  const e = getResolvedEmbeddingConfig()
  if (e.baseURL) {
    return true
  }
  return Boolean(e.apiKey)
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

/** Qdrant REST client: only needs Qdrant URL (and optional API key). */
export function requireQdrantEnv() {
  if (!parsedEnv.QDRANT_URL?.trim()) {
    throw new Error('Missing QDRANT_URL in server/.env')
  }

  return env
}

/** Ingest / RAG stack: Qdrant + any embedding endpoint (local TEI or OpenAI). */
export function requireRagIngestEnv() {
  requireQdrantEnv()
  const e = getResolvedEmbeddingConfig()
  if (!e.baseURL && !e.apiKey) {
    throw new Error(
      'Missing embedding configuration: set EMBEDDING_BASE_URL (local TEI) or OPENAI_API_KEY / OPENAI_EMBEDDING_BASE_URL in server/.env'
    )
  }

  return env
}
