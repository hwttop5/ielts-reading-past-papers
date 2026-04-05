import { describe, expect, it } from 'vitest'
import type { RagChunk } from '../src/types/question-bank.js'
import type { AssistantContextRoute } from '../src/lib/assistant/contextRoute.js'
import { budgetFinalChunks } from '../src/lib/assistant/retrieval/mergeContext.js'

function chunk(id: string, type: RagChunk['chunkType'], content: string): RagChunk {
  return {
    id,
    questionId: 'q1',
    title: 'T',
    category: 'P1',
    difficulty: 'High',
    chunkType: type,
    sensitive: false,
    questionNumbers: type === 'question_item' ? ['1'] : [],
    paragraphLabels: type === 'passage_paragraph' ? ['A'] : [],
    content,
    sourcePath: '/x',
    metadata: {
      questionId: 'q1',
      title: 'T',
      category: 'P1',
      difficulty: 'High',
      chunkType: type,
      sensitive: false,
      questionNumbers: [],
      paragraphLabels: [],
      sourcePath: '/x',
      questionType: 'multiple_choice'
    }
  }
}

describe('budgetFinalChunks', () => {
  const tutorRoute = 'tutor' as AssistantContextRoute
  const similarRoute = 'similar' as AssistantContextRoute

  it('reserves about one third of budget for passages in tutor route', () => {
    const passages = Array.from({ length: 5 }, (_, i) => chunk(`p${i}`, 'passage_paragraph', `P${i}`))
    const questions = Array.from({ length: 10 }, (_, i) => chunk(`q${i}`, 'question_item', `Q${i}`))
    const sorted = [...passages, ...questions]
    const out = budgetFinalChunks(tutorRoute, sorted, 6)
    const passageCount = out.filter((c) => c.chunkType === 'passage_paragraph').length
    expect(passageCount).toBeGreaterThanOrEqual(1)
    expect(out.length).toBeLessThanOrEqual(6)
  })

  it('slices similar route by budget without passage split rule', () => {
    const sorted = [chunk('a', 'question_item', 'a'), chunk('b', 'passage_paragraph', 'b')]
    const out = budgetFinalChunks(similarRoute, sorted, 1)
    expect(out).toHaveLength(1)
  })
})
