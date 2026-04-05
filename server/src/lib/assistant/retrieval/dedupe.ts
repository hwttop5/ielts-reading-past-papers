import type { RagChunk } from '../../../types/question-bank.js'

export function dedupeChunks(chunks: RagChunk[]): RagChunk[] {
  const byId = new Map<string, RagChunk>()
  for (const chunk of chunks) {
    if (chunk?.id && !byId.has(chunk.id)) {
      byId.set(chunk.id, chunk)
    }
  }
  return Array.from(byId.values())
}
