import { describe, expect, it, vi } from 'vitest'
import { buildSuiteAttempt, getSuiteCandidates, prepareSuite, validateSuiteIds } from './examSuite'
import * as readingPractice from './readingPractice'
import { buildPracticeSessionResult } from './readingPractice'
import type { SuitePassages, ExamSuitePassageResult } from '@/types/examSuite'

export const realSuiteIds = ['p1-high-01', 'p2-high-09', 'p3-high-04']

describe('complete exam suites', () => {
  it('filters candidate categories and rejects malformed or wrongly ordered suites', () => {
    const candidates = getSuiteCandidates()
    for (const category of ['P1', 'P2', 'P3'] as const) {
      expect(candidates[category].length).toBeGreaterThan(0)
      expect(candidates[category].every((entry) => entry.category === category)).toBe(true)
    }
    expect(validateSuiteIds(realSuiteIds)).toBeNull()
    expect(validateSuiteIds(realSuiteIds.slice(0, 2))).not.toBeNull()
    expect(validateSuiteIds([...realSuiteIds].reverse())).not.toBeNull()
    expect(validateSuiteIds(['missing', ...realSuiteIds.slice(1)])).not.toBeNull()
  })

  it('loads real independently numbered documents with global display numbers 1–40', async () => {
    const suite = await prepareSuite(realSuiteIds)
    expect(suite.passages.flatMap((document) => document.questionOrder.map((id) => document.questionDisplayMap[id])))
      .toEqual(Array.from({ length: 40 }, (_, index) => String(index + 1)))
    expect(suite.durationSeconds).toBe(3600)
    expect(suite.passages[1].questionOrder[0]).toBe('q1')
  })

  it('validates the numbering of every selectable real passage', async () => {
    const candidates = getSuiteCandidates()
    for (const [index, category] of (['P1', 'P2', 'P3'] as const).entries()) {
      for (const candidate of candidates[category]) {
        const ids = [...realSuiteIds]
        ids[index] = candidate.examId
        await expect(prepareSuite(ids)).resolves.toHaveProperty('totalQuestions', 40)
      }
    }
  })

  it('rejects a document whose displayed number disagrees with its position', async () => {
    const exam = await readingPractice.loadReadingExamDocument(realSuiteIds[1])
    const bad = structuredClone(exam!)
    bad.questionItems[0].displayNumber = '1'
    const original = readingPractice.loadReadingExamDocument
    const spy = vi.spyOn(readingPractice, 'loadReadingExamDocument').mockImplementation((id) => id === realSuiteIds[1] ? Promise.resolve(bad) : original(id))
    try { await expect(prepareSuite(realSuiteIds)).rejects.toThrow('Part 2') } finally { spy.mockRestore() }
  })

  it('combines scores without losing colliding local question IDs', async () => {
    const suite = await prepareSuite(realSuiteIds)
    const passages = suite.passages.map((exam) => ({
      id: exam.examId, title: exam.meta.title, highlights: [], markedQuestions: [],
      result: buildPracticeSessionResult({ exam, answers: {}, markedQuestions: [], highlights: [], mode: 'simulation' })
    })) as SuitePassages<ExamSuitePassageResult>
    passages.forEach((passage, index) => { passage.result.scoreInfo.correct = [10, 11, 12][index] })
    const attempt = buildSuiteAttempt({ attemptId: 'test', passages, durationSeconds: 3000 })
    expect(attempt.correct).toBe(33)
    expect(attempt.totalQuestions).toBe(40)
    expect(attempt.accuracy).toBe(82.5)
    expect(attempt.passages.every((passage) => passage.result.answerComparison.q1)).toBe(true)
    passages[0].result.scoreInfo.correct = 0
    expect(attempt.passages[0].result.scoreInfo.correct).toBe(10)
  })
})
