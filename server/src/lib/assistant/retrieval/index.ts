/**
 * Vector Store Provider Factory
 *
 * Semantic search uses Qdrant when QDRANT_URL and a usable embedding endpoint (EMBEDDING_* or legacy OPENAI_*) are configured.
 */

import { hasAssistantSemanticSearchConfig } from '../../../config/env.js'
import type { VectorStoreProvider } from './provider.js'
import { QdrantAssistantSemanticSearch } from './qdrant.js'

/**
 * Get the Qdrant vector store provider.
 * Returns null if no valid configuration is found.
 */
export function getVectorStoreProvider(): VectorStoreProvider | null {
  if (!hasAssistantSemanticSearchConfig()) {
    return null
  }

  try {
    return new QdrantAssistantSemanticSearch()
  } catch (error) {
    console.error('Failed to initialize Qdrant vector provider:', error)
    return null
  }
}

// Re-export types for convenience
export type { VectorStoreProvider } from './provider.js'
export type {
  ChunkSemanticSearchInput,
  SummarySemanticSearchInput,
  CollectionMetadata
} from './provider.js'

// Re-export provider implementation
export { QdrantAssistantSemanticSearch } from './qdrant.js'
