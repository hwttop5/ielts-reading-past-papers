/**
 * Qdrant Vector Store Provider Implementation
 *
 * Legacy Qdrant implementation wrapped in the VectorStoreProvider interface.
 */

import { OpenAIEmbeddings } from '@langchain/openai'
import {
  createAssistantEmbeddings,
  env,
  getResolvedEmbeddingConfig,
  hasAssistantSemanticSearchConfig
} from '../../../config/env.js'
import type { QuestionSummaryDoc, RagChunk, StoredVectorPoint } from '../../../types/question-bank.js'
import type {
  VectorStoreProvider,
  ChunkSemanticSearchInput,
  SummarySemanticSearchInput,
  CollectionMetadata
} from './provider.js'
import { QdrantClient } from '../../qdrant/client.js'

/**
 * Build question filter for Qdrant search
 */
function buildQuestionFilter(questionId: string) {
  return {
    must: [
      {
        key: 'questionId',
        match: {
          value: questionId
        }
      }
    ]
  }
}

/**
 * Qdrant-based semantic search implementation
 */
export class QdrantAssistantSemanticSearch implements VectorStoreProvider {
  readonly providerName = 'qdrant'

  private readonly embeddings: OpenAIEmbeddings
  private readonly client: QdrantClient

  constructor(
    embeddings: OpenAIEmbeddings = createAssistantEmbeddings(),
    client: QdrantClient = new QdrantClient()
  ) {
    this.embeddings = embeddings
    this.client = client
  }

  private async embedQueryForE5(queryText: string): Promise<number[]> {
    const prefixed = `query: ${queryText}`
    try {
      return await this.embeddings.embedQuery(prefixed)
    } catch (err: unknown) {
      const emb = getResolvedEmbeddingConfig()
      const hint = emb.baseURL
        ? `Embedding 请求失败（请确认本地 TEI 可用：${emb.baseURL}）。`
        : 'Embedding 请求失败（请检查 OPENAI_API_KEY / OPENAI_EMBEDDING_BASE_URL）。'
      const prev = err instanceof Error ? err.message : String(err)
      throw new Error(`${hint} ${prev}`)
    }
  }

  async searchChunks(input: ChunkSemanticSearchInput): Promise<RagChunk[]> {
    const vector = await this.embedQueryForE5(input.queryText)
    let points: StoredVectorPoint<RagChunk>[]
    try {
      points = await this.client.searchPoints<RagChunk>(
        env.QDRANT_COLLECTION_CHUNKS,
        vector,
        buildQuestionFilter(input.questionId),
        input.limit
      )
    } catch (err: unknown) {
      const prev = err instanceof Error ? err.message : String(err)
      throw new Error(
        `Qdrant 不可用或 chunks 检索失败（请确认 QDRANT_URL 可访问且已灌库 ${env.QDRANT_COLLECTION_CHUNKS}）。 ${prev}`
      )
    }

    return this.uniqueValues(points.map((point: { payload: RagChunk }) => point.payload))
  }

  async searchSummaries(input: SummarySemanticSearchInput): Promise<QuestionSummaryDoc[]> {
    const vector = await this.embedQueryForE5(input.queryText)
    let points: StoredVectorPoint<QuestionSummaryDoc>[]
    try {
      points = await this.client.searchPoints<QuestionSummaryDoc>(
        env.QDRANT_COLLECTION_SUMMARIES,
        vector,
        undefined,
        Math.max(input.limit * 2, input.limit)
      )
    } catch (err: unknown) {
      const prev = err instanceof Error ? err.message : String(err)
      throw new Error(
        `Qdrant 不可用或 summaries 检索失败（请确认 QDRANT_URL 可访问且已灌库 ${env.QDRANT_COLLECTION_SUMMARIES}）。 ${prev}`
      )
    }

    const excluded = new Set(input.excludeQuestionIds ?? [])

    return this.uniqueValues(
      points
        .map((point: { payload: QuestionSummaryDoc }) => point.payload)
        .filter((summary: { questionId: string }) => !excluded.has(summary.questionId))
        .slice(0, input.limit)
    )
  }

  async upsertChunks(points: StoredVectorPoint<RagChunk>[]): Promise<void> {
    await this.client.upsertPoints(env.QDRANT_COLLECTION_CHUNKS, points)
  }

  async upsertSummaries(points: StoredVectorPoint<QuestionSummaryDoc>[]): Promise<void> {
    await this.client.upsertPoints(env.QDRANT_COLLECTION_SUMMARIES, points)
  }

  async ensureCollections(): Promise<void> {
    // Get vector size from embeddings (E5 retrieval uses `query:` prefix)
    const sampleVector = await this.embedQueryForE5('sample')
    const vectorSize = sampleVector.length

    await this.client.ensureCollection(env.QDRANT_COLLECTION_CHUNKS, vectorSize)
    await this.client.ensureCollection(env.QDRANT_COLLECTION_SUMMARIES, vectorSize)
  }

  async getCollectionMetadata(name: string): Promise<CollectionMetadata | null> {
    try {
      // Scroll to get a sample document for vector size
      const samplePoints = await this.client.scrollPoints(name, undefined, 1)

      if (samplePoints.length === 0) {
        return { name, vectorSize: 0, documentCount: 0 }
      }

      const vectorSize = samplePoints[0].vector.length

      // Count total documents
      const count = await this.countDocuments(name)

      return {
        name,
        vectorSize,
        documentCount: count
      }
    } catch {
      return null
    }
  }

  async deleteCollection(_name: string): Promise<void> {
    // Qdrant client doesn't have a delete collection method in the current implementation
    // This would need to be added to the QdrantClient class if needed
    throw new Error('deleteCollection not implemented for Qdrant provider')
  }

  async countDocuments(collectionName: string): Promise<number> {
    try {
      // Use scroll with limit=0 to get count only
      // Note: This is a workaround - QdrantClient may need a dedicated count method
      let offset: string | undefined = undefined
      let count = 0

      do {
        const response = await this.client.scrollPoints(collectionName, undefined, 100)
        count += response.length
        offset = response.length > 0 ? response[response.length - 1].id : undefined
      } while (offset && count < 10000) // Safety limit

      return count
    } catch {
      return 0
    }
  }

  async healthCheck(): Promise<{ healthy: boolean; latency_ms?: number; error?: string }> {
    const startTime = Date.now()

    try {
      // Try to get collection info
      const collectionName = env.QDRANT_COLLECTION_CHUNKS
      await this.client.scrollPoints(collectionName, undefined, 1)

      return {
        healthy: true,
        latency_ms: Date.now() - startTime
      }
    } catch (error: any) {
      return {
        healthy: false,
        latency_ms: Date.now() - startTime,
        error: error.message
      }
    }
  }

  private uniqueValues<T extends { id?: string }>(items: T[]): T[] {
    const seen = new Set<string>()
    return items.filter((item) => {
      if (!item.id) return true
      if (seen.has(item.id)) return false
      seen.add(item.id)
      return true
    })
  }
}

/**
 * Factory function to create Qdrant provider
 */
export function createQdrantSemanticSearch(): VectorStoreProvider | null {
  if (!hasAssistantSemanticSearchConfig()) {
    return null
  }

  if (!env.QDRANT_URL) {
    return null
  }

  try {
    return new QdrantAssistantSemanticSearch()
  } catch (error) {
    console.error('Failed to create Qdrant provider:', error)
    return null
  }
}
