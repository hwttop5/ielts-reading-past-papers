import type { RagChunk } from '../../types/question-bank.js'
import type { AssistantRetrievedChunk } from '../../types/assistant.js'

/** Avoid multi‑MB JSON in eval responses; key phrases usually appear early. */
const MAX_EVAL_CHUNK_CHARS = 24_000

export function serializeRetrievedChunksForEval(chunks: RagChunk[]): AssistantRetrievedChunk[] {
  return chunks.map((c) => {
    const content =
      c.content.length > MAX_EVAL_CHUNK_CHARS ? `${c.content.slice(0, MAX_EVAL_CHUNK_CHARS)}…` : c.content
    return {
      id: c.id,
      questionId: c.questionId,
      chunkType: c.chunkType,
      questionNumbers: c.questionNumbers,
      paragraphLabels: c.paragraphLabels,
      content,
      metadata: {
        questionType: c.metadata.questionType,
        chunkType: c.metadata.chunkType,
        sensitive: c.metadata.sensitive
      }
    }
  })
}
