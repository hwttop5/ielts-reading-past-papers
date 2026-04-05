/**
 * Legacy semantic search interface for backward compatibility.
 *
 * New code should use the VectorStoreProvider interface from ./retrieval/index.js
 */

import type { QuestionSummaryDoc, RagChunk } from '../../types/question-bank.js'
import { getVectorStoreProvider, type VectorStoreProvider } from './retrieval/index.js'

/**
 * @deprecated Use VectorStoreProvider instead
 */
export interface AssistantSemanticSearch {
  searchChunks(input: { questionId: string; queryText: string; limit: number }): Promise<RagChunk[]>
  searchSummaries(input: { queryText: string; limit: number; excludeQuestionIds?: string[] }): Promise<QuestionSummaryDoc[]>
}

/**
 * @deprecated Use QdrantAssistantSemanticSearch from ./retrieval/qdrant.js instead
 */
export class LegacyQdrantAssistantSemanticSearch implements AssistantSemanticSearch {
  private readonly provider: VectorStoreProvider

  constructor(provider?: VectorStoreProvider) {
    this.provider = provider || getVectorStoreProvider()!
  }

  async searchChunks(input: { questionId: string; queryText: string; limit: number }): Promise<RagChunk[]> {
    return this.provider.searchChunks(input)
  }

  async searchSummaries(input: { queryText: string; limit: number; excludeQuestionIds?: string[] }): Promise<QuestionSummaryDoc[]> {
    return this.provider.searchSummaries(input)
  }
}

/**
 * @deprecated Use getVectorStoreProvider() from ./retrieval/index.js instead
 */
export function createAssistantSemanticSearch(): AssistantSemanticSearch | null {
  const provider = getVectorStoreProvider()
  if (!provider) {
    return null
  }

  return new LegacyQdrantAssistantSemanticSearch(provider)
}

/**
 * Get the underlying provider instance for advanced operations.
 */
export function getProvider(): VectorStoreProvider | null {
  return getVectorStoreProvider()
}
