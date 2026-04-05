import type { AssistantQueryRequest } from '../../../types/assistant.js'
import type { RagChunk } from '../../../types/question-bank.js'
import { dedupeChunks } from './dedupe.js'

/**
 * Apply passage / non-passage budget split (matches AssistantService.collectContext behavior).
 */
export function budgetFinalChunks(request: AssistantQueryRequest, sortedChunks: RagChunk[], budget: number): RagChunk[] {
  if (request.mode === 'similar') {
    return sortedChunks.slice(0, budget)
  }

  const passageChunks = sortedChunks.filter((chunk) => chunk.chunkType === 'passage_paragraph')
  const nonPassageChunks = sortedChunks.filter((chunk) => chunk.chunkType !== 'passage_paragraph')

  if (passageChunks.length === 0) {
    return sortedChunks.slice(0, budget)
  }

  const minPassageBudget = Math.max(1, Math.floor(budget / 3))
  const actualPassageBudget = Math.min(minPassageBudget, passageChunks.length)
  const actualQuestionBudget = budget - actualPassageBudget

  return dedupeChunks([
    ...passageChunks.slice(0, actualPassageBudget),
    ...nonPassageChunks.slice(0, actualQuestionBudget)
  ]).slice(0, budget)
}
