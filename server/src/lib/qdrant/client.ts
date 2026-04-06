import { requireQdrantEnv } from '../../config/env.js'
import { toQdrantPointId } from './point-id.js'
import type { QuestionSummaryDoc, RagChunk, StoredVectorPoint } from '../../types/question-bank.js'

interface QdrantResponse<T> {
  status: string
  result: T
}

type QdrantPayload = RagChunk | QuestionSummaryDoc

interface QdrantPoint<TPayload> {
  id: string
  vector?: number[]
  payload?: TPayload
}

interface QdrantSearchResult<TPayload> {
  id: string | number
  score?: number
  vector?: number[]
  payload?: TPayload
}

function buildHeaders() {
  const { QDRANT_API_KEY } = requireQdrantEnv()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  }

  if (QDRANT_API_KEY) {
    headers['api-key'] = QDRANT_API_KEY
  }

  return headers
}

function getQdrantBaseUrl(): string {
  const { QDRANT_URL } = requireQdrantEnv()
  if (!QDRANT_URL) {
    throw new Error('Missing QDRANT_URL in server/.env')
  }

  return QDRANT_URL.endsWith('/') ? QDRANT_URL : `${QDRANT_URL}/`
}

async function qdrantRequest<TResponse>(path: string, init: RequestInit = {}): Promise<TResponse> {
  const baseUrl = getQdrantBaseUrl()
  const url = new URL(path, baseUrl)
  const response = await fetch(url, {
    ...init,
    headers: {
      ...buildHeaders(),
      ...(init.headers ?? {})
    }
  })

  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw new Error(`Qdrant request failed: ${response.status} ${response.statusText}${detail ? ` — ${detail}` : ''}`)
  }

  return response.json() as Promise<TResponse>
}

export class QdrantClient {
  /**
   * Keyword index on `questionId` speeds up question-scoped filters.
   * Safe to call on existing collections; ignores duplicate-index responses.
   */
  async ensureQuestionIdPayloadIndex(collectionName: string) {
    const baseUrl = getQdrantBaseUrl()
    const indexUrl = new URL(`collections/${collectionName}/index`, baseUrl)
    indexUrl.searchParams.set('wait', 'true')
    const response = await fetch(indexUrl, {
      method: 'PUT',
      headers: buildHeaders(),
      body: JSON.stringify({
        field_name: 'questionId',
        field_schema: 'keyword'
      })
    })

    if (response.ok) {
      return
    }

    const text = await response.text()
    if (response.status === 409 || /already exists/i.test(text)) {
      return
    }

    throw new Error(`Failed to create payload index on ${collectionName}.questionId: ${response.status} ${text}`)
  }

  async ensureCollection(name: string, vectorSize: number) {
    const baseUrl = getQdrantBaseUrl()
    const collectionUrl = new URL(`collections/${name}`, baseUrl)
    const existing = await fetch(collectionUrl, { headers: buildHeaders() })

    if (existing.ok) {
      await this.ensureQuestionIdPayloadIndex(name)
      return
    }

    if (existing.status !== 404) {
      throw new Error(`Failed to inspect Qdrant collection ${name}: ${existing.status} ${existing.statusText}`)
    }

    await qdrantRequest(`collections/${name}`, {
      method: 'PUT',
      body: JSON.stringify({
        vectors: {
          size: vectorSize,
          distance: 'Cosine'
        }
      })
    })

    await this.ensureQuestionIdPayloadIndex(name)
  }

  async upsertPoints(name: string, points: StoredVectorPoint<QdrantPayload>[]) {
    if (points.length === 0) {
      return
    }

    await qdrantRequest(`collections/${name}/points?wait=true`, {
      method: 'PUT',
      body: JSON.stringify({
        points: points.map((p) => ({
          id: toQdrantPointId(p.id),
          vector: p.vector,
          payload: p.payload
        }))
      })
    })
  }

  async searchPoints<TPayload>(
    name: string,
    vector: number[],
    filter?: Record<string, unknown>,
    limit = 8
  ): Promise<StoredVectorPoint<TPayload>[]> {
    const response = await qdrantRequest<QdrantResponse<Array<QdrantSearchResult<TPayload>>>>(
      `collections/${name}/points/search`,
      {
        method: 'POST',
        body: JSON.stringify({
          vector,
          limit,
          with_payload: true,
          with_vector: true,
          filter
        })
      }
    )

    return response.result
      .filter((point): point is Required<Pick<QdrantSearchResult<TPayload>, 'id' | 'vector' | 'payload'>> => (
        Array.isArray(point.vector) && point.payload !== undefined
      ))
      .map((point) => ({
        id: String(point.id),
        vector: point.vector,
        payload: point.payload
      }))
  }

  async scrollPoints<TPayload>(name: string, filter?: Record<string, unknown>, limit = 256): Promise<StoredVectorPoint<TPayload>[]> {
    const response = await qdrantRequest<QdrantResponse<{ points: Array<QdrantPoint<TPayload>> }>>(
      `collections/${name}/points/scroll`,
      {
        method: 'POST',
        body: JSON.stringify({
          limit,
          with_payload: true,
          with_vector: true,
          filter
        })
      }
    )

    return response.result.points
      .filter((point): point is Required<QdrantPoint<TPayload>> => Array.isArray(point.vector) && point.payload !== undefined)
      .map((point) => ({
        id: String(point.id),
        vector: point.vector,
        payload: point.payload
      }))
  }
}
