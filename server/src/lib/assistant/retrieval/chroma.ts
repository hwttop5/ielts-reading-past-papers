/**
 * Chroma Vector Store Provider Implementation
 *
 * Uses Chroma's TypeScript SDK for vector storage with hybrid search capabilities.
 * https://docs.trychroma.com/
 */

import { OpenAIEmbeddings } from '@langchain/openai'
import { env, hasAssistantSemanticSearchConfig } from '../../../config/env.js'
import type { QuestionSummaryDoc, RagChunk, StoredVectorPoint } from '../../../types/question-bank.js'
import type {
  VectorStoreProvider,
  ChunkSemanticSearchInput,
  SummarySemanticSearchInput,
  CollectionMetadata
} from './provider.js'

// Chroma types (inline to avoid external dependencies in type definitions)
interface ChromaQueryResult<TMetadata = Record<string, unknown>> {
  ids: string[]
  embeddings: number[][]
  documents: string[]
  metadatas: TMetadata[]
  distances?: number[]
}

// Lazy load ChromaClient to avoid import errors if package not installed
let ChromaClientClass: any = null

async function loadChromaClient(): Promise<any> {
  if (ChromaClientClass) {
    return ChromaClientClass
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    // @ts-expect-error chromadb is an optional dependency
    const { ChromaClient } = await import('chromadb')
    ChromaClientClass = ChromaClient
    return ChromaClient
  } catch (error) {
    throw new Error(
      'ChromaDB package not installed. Run: npm install chromadb'
    )
  }
}

/**
 * Chroma-based semantic search implementation
 */
export class ChromaAssistantSemanticSearch implements VectorStoreProvider {
  readonly providerName = 'chroma'

  private readonly embeddings: OpenAIEmbeddings
  private client: any = null
  private initialized = false

  constructor(
    embeddings: OpenAIEmbeddings = new OpenAIEmbeddings({
      apiKey: env.OPENAI_API_KEY,
      model: env.OPENAI_EMBED_MODEL,
      ...(env.OPENAI_EMBEDDING_BASE_URL
        ? { configuration: { baseURL: env.OPENAI_EMBEDDING_BASE_URL } }
        : {})
    })
  ) {
    this.embeddings = embeddings
  }

  private async ensureInitialized(): Promise<void> {
    if (this.initialized) {
      return
    }

    const ChromaClient = await loadChromaClient()

    const chromaUrl = env.CHROMA_HOST || 'http://localhost:8000'
    this.client = new ChromaClient({
      path: chromaUrl
    })

    // Ensure collections exist
    await this.ensureCollections()
    this.initialized = true
  }

  async ensureCollections(): Promise<void> {
    await this.ensureInitialized()

    const collectionNames = [
      env.QDRANT_COLLECTION_CHUNKS || 'assistant_chunks',
      env.QDRANT_COLLECTION_SUMMARIES || 'assistant_summaries'
    ]

    for (const name of collectionNames) {
      try {
        await this.client.getOrCreateCollection({
          name,
          metadata: {
            'hnsw:space': 'cosine'
          }
        })
      } catch (error) {
        console.error(`Failed to ensure collection ${name}:`, error)
      }
    }
  }

  async getCollectionMetadata(name: string): Promise<CollectionMetadata | null> {
    try {
      await this.ensureInitialized()
      const collection = await this.client.getCollection({ name })
      const count = await collection.count()

      // Get vector size from a sample document
      const sample = await collection.get({ ids: [name + ':sample'], include: ['embeddings'], limit: 1 })
      const vectorSize = sample.embeddings?.[0]?.length || 0

      return {
        name,
        vectorSize,
        documentCount: count
      }
    } catch {
      return null
    }
  }

  async searchChunks(input: ChunkSemanticSearchInput): Promise<RagChunk[]> {
    await this.ensureInitialized()

    const collectionName = env.QDRANT_COLLECTION_CHUNKS || 'assistant_chunks'
    const collection = await this.client.getCollection({ name: collectionName })

    const vector = await this.embeddings.embedQuery(input.queryText)

    const results = await collection.query(
      vector,
      input.limit,
      { questionId: input.questionId }, // where filter
      undefined, // whereDocument
      ['metadatas', 'documents', 'embeddings']
    )

    return this.parseChunkResults(results)
  }

  async searchSummaries(input: SummarySemanticSearchInput): Promise<QuestionSummaryDoc[]> {
    await this.ensureInitialized()

    const collectionName = env.QDRANT_COLLECTION_SUMMARIES || 'assistant_summaries'
    const collection = await this.client.getCollection({ name: collectionName })

    const vector = await this.embeddings.embedQuery(input.queryText)

    const results = await collection.query(
      vector,
      Math.max(input.limit * 2, input.limit),
      undefined, // where filter
      undefined, // whereDocument
      ['metadatas', 'documents', 'embeddings']
    )

    const excluded = new Set(input.excludeQuestionIds ?? [])
    const summaries = this.parseSummaryResults(results)

    return summaries.filter((summary) => !excluded.has(summary.questionId)).slice(0, input.limit)
  }

  async upsertChunks(points: StoredVectorPoint<RagChunk>[]): Promise<void> {
    if (points.length === 0) {
      return
    }

    await this.ensureInitialized()

    const collectionName = env.QDRANT_COLLECTION_CHUNKS || 'assistant_chunks'
    const collection = await this.client.getCollection({ name: collectionName })

    const ids = points.map((p) => p.id)
    const embeddings = points.map((p) => p.vector)
    const documents = points.map((p) => p.payload.content)
    const metadatas = points.map((p) => this.flattenMetadata(p.payload))

    await collection.upsert(ids, embeddings, documents, metadatas)
  }

  async upsertSummaries(points: StoredVectorPoint<QuestionSummaryDoc>[]): Promise<void> {
    if (points.length === 0) {
      return
    }

    await this.ensureInitialized()

    const collectionName = env.QDRANT_COLLECTION_SUMMARIES || 'assistant_summaries'
    const collection = await this.client.getCollection({ name: collectionName })

    const ids = points.map((p) => p.id)
    const embeddings = points.map((p) => p.vector)
    const documents = points.map((p) => p.payload.content)
    const metadatas = points.map((p) => this.flattenMetadata(p.payload))

    await collection.upsert(ids, embeddings, documents, metadatas)
  }

  async deleteCollection(name: string): Promise<void> {
    await this.ensureInitialized()
    await this.client.deleteCollection({ name })
  }

  async countDocuments(collectionName: string): Promise<number> {
    await this.ensureInitialized()
    const collection = await this.client.getCollection({ name: collectionName })
    return await collection.count()
  }

  async healthCheck(): Promise<{ healthy: boolean; latency_ms?: number; error?: string }> {
    const startTime = Date.now()

    try {
      await this.ensureInitialized()

      // Try to get collection info
      const collectionName = env.QDRANT_COLLECTION_CHUNKS || 'assistant_chunks'
      const collection = await this.client.getCollection({ name: collectionName })
      await collection.count()

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

  private parseChunkResults(results: ChromaQueryResult): RagChunk[] {
    const chunks: RagChunk[] = []

    for (let i = 0; i < results.ids.length; i++) {
      const metadata = results.metadatas[i]

      if (!metadata) continue

      chunks.push({
        id: results.ids[i],
        questionId: metadata.questionId as string,
        title: metadata.title as string,
        category: metadata.category as string,
        difficulty: metadata.difficulty as string,
        chunkType: metadata.chunkType as RagChunk['chunkType'],
        sensitive: Boolean(metadata.sensitive),
        questionNumbers: (metadata.questionNumbers as string[]) || [],
        paragraphLabels: (metadata.paragraphLabels as string[]) || [],
        content: results.documents[i] || '',
        sourcePath: metadata.sourcePath as string,
        metadata: metadata as any
      })
    }

    return chunks
  }

  private parseSummaryResults(results: ChromaQueryResult): QuestionSummaryDoc[] {
    const summaries: QuestionSummaryDoc[] = []

    for (let i = 0; i < results.ids.length; i++) {
      const metadata = results.metadatas[i]

      if (!metadata) continue

      summaries.push({
        id: results.ids[i],
        questionId: metadata.questionId as string,
        title: metadata.title as string,
        category: metadata.category as string,
        difficulty: metadata.difficulty as string,
        topicSummary: metadata.topicSummary as string,
        keywords: (metadata.keywords as string[]) || [],
        questionTypes: (metadata.questionTypes as string[]) || [],
        content: results.documents[i] || '',
        sourcePath: metadata.sourcePath as string,
        metadata: metadata as any
      })
    }

    return summaries
  }

  private flattenMetadata(payload: RagChunk | QuestionSummaryDoc): Record<string, unknown> {
    const metadata: Record<string, unknown> = {
      questionId: payload.questionId,
      title: payload.title,
      category: payload.category,
      difficulty: payload.difficulty,
      sourcePath: payload.sourcePath
    }

    // Add type-specific fields
    if ('chunkType' in payload) {
      metadata.chunkType = payload.chunkType
      metadata.sensitive = payload.sensitive
      metadata.questionNumbers = payload.questionNumbers
      metadata.paragraphLabels = payload.paragraphLabels
    }

    if ('topicSummary' in payload) {
      metadata.topicSummary = payload.topicSummary
      metadata.keywords = payload.keywords
      metadata.questionTypes = payload.questionTypes
    }

    return metadata
  }
}

/**
 * Factory function to create Chroma provider
 */
export function createChromaSemanticSearch(): VectorStoreProvider | null {
  if (!hasAssistantSemanticSearchConfig()) {
    return null
  }

  // Check if Chroma is configured
  if (!env.CHROMA_HOST) {
    return null
  }

  try {
    return new ChromaAssistantSemanticSearch()
  } catch (error) {
    console.error('Failed to create Chroma provider:', error)
    return null
  }
}
