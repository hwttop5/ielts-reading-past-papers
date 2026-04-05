/**
 * Vector Store Provider Factory
 *
 * Creates the appropriate vector store provider based on configuration.
 */

import { env, hasAssistantSemanticSearchConfig } from '../../../config/env.js'
import type { VectorStoreProvider } from './provider.js'
import { QdrantAssistantSemanticSearch } from './qdrant.js'
import { ChromaAssistantSemanticSearch } from './chroma.js'

/**
 * Get the configured vector backend provider.
 * Returns null if no valid configuration is found.
 */
export function getVectorStoreProvider(): VectorStoreProvider | null {
  if (!hasAssistantSemanticSearchConfig()) {
    return null
  }

  const backend = env.ASSISTANT_VECTOR_BACKEND

  if (backend === 'chroma') {
    try {
      return new ChromaAssistantSemanticSearch()
    } catch (error) {
      console.error('Failed to initialize Chroma vector provider:', error)
      return null
    }
  }

  // Default to Qdrant
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

// Re-export provider implementations
export { QdrantAssistantSemanticSearch } from './qdrant.js'
export { ChromaAssistantSemanticSearch } from './chroma.js'
