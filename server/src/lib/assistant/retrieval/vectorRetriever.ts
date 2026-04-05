import type { AssistantSemanticSearch } from '../semantic.js'
import type { RagChunk } from '../../../types/question-bank.js'

/**
 * Thin adapter around {@link AssistantSemanticSearch.searchChunks} for LangChain-style call sites.
 */
export async function retrieveChunksByEmbedding(
  semantic: AssistantSemanticSearch,
  input: { questionId: string; queryText: string; limit: number }
): Promise<RagChunk[]> {
  return semantic.searchChunks(input)
}
