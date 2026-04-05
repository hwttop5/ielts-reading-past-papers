import { describe, expect, it } from 'vitest'
import { serializeRetrievedChunksForEval } from '../src/lib/assistant/evalSerialization.js'
import type { RagChunk } from '../src/types/question-bank.js'

function mkChunk(overrides: Partial<RagChunk> = {}): RagChunk {
  const questionId = overrides.questionId ?? 'p1-high-01'
  return {
    id: overrides.id ?? 'c1',
    questionId,
    title: overrides.title ?? 'T',
    category: overrides.category ?? 'P1',
    difficulty: overrides.difficulty ?? 'High',
    chunkType: overrides.chunkType ?? 'passage_paragraph',
    sensitive: overrides.sensitive ?? false,
    questionNumbers: overrides.questionNumbers ?? ['1'],
    paragraphLabels: overrides.paragraphLabels ?? ['A'],
    content: overrides.content ?? 'List of Headings and body text.',
    sourcePath: overrides.sourcePath ?? '/x.html',
    metadata: {
      questionId,
      title: overrides.title ?? 'T',
      category: overrides.category ?? 'P1',
      difficulty: overrides.difficulty ?? 'High',
      chunkType: overrides.chunkType ?? 'passage_paragraph',
      sensitive: overrides.sensitive ?? false,
      questionNumbers: overrides.questionNumbers ?? ['1'],
      paragraphLabels: overrides.paragraphLabels ?? ['A'],
      sourcePath: overrides.sourcePath ?? '/x.html',
      questionType: overrides.metadata?.questionType ?? 'heading_matching'
    }
  }
}

describe('serializeRetrievedChunksForEval', () => {
  it('maps chunk fields for Python eval consumers', () => {
    const rows = serializeRetrievedChunksForEval([mkChunk()])
    expect(rows).toHaveLength(1)
    expect(rows[0].chunkType).toBe('passage_paragraph')
    expect(rows[0].metadata.questionType).toBe('heading_matching')
    expect(rows[0].content).toContain('List of Headings')
  })
})
