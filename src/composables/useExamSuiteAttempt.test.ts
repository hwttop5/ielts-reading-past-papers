import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useExamSuiteAttempt, EXAM_SUITE_HISTORY_KEY } from './useExamSuiteAttempt'
import { buildSuiteAttempt, prepareSuite } from '@/utils/examSuite'
import { buildPracticeSessionResult } from '@/utils/readingPractice'
import type { ExamSuiteAttempt, ExamSuitePassageResult, SuitePassages } from '@/types/examSuite'

let record: ExamSuiteAttempt
beforeEach(async () => {
  localStorage.clear()
  const suite = await prepareSuite(['p1-high-01', 'p2-high-09', 'p3-high-04'])
  record = buildSuiteAttempt({ attemptId: 'attempt-1', durationSeconds: 2000, passages: suite.passages.map((exam) => ({
    id: exam.examId, title: exam.meta.title, highlights: [], markedQuestions: [],
    result: buildPracticeSessionResult({ exam, answers: {}, markedQuestions: [], highlights: [], mode: 'simulation' })
  })) as SuitePassages<ExamSuitePassageResult> })
})
afterEach(() => { vi.restoreAllMocks(); localStorage.clear() })

describe('suite completion history', () => {
  it('saves once per attempt, restores the result and keeps separate attempts', () => {
    const store = useExamSuiteAttempt()
    expect(store.save(record)).toBe(true)
    expect(store.save(record)).toBe(true)
    expect(store.history.value).toHaveLength(1)
    expect(useExamSuiteAttempt().get(record.attemptId)?.totalQuestions).toBe(40)
    store.save({ ...record, attemptId: 'attempt-2' })
    expect(store.history.value).toHaveLength(2)
  })
  it('limits completed history to the latest 50 records', () => {
    const store = useExamSuiteAttempt()
    for (let index = 0; index < 52; index += 1) store.save({ ...record, attemptId: `attempt-${index}`, completedAt: new Date(index * 1000).toISOString() })
    expect(store.history.value).toHaveLength(50)
    expect(store.history.value[0].attemptId).toBe('attempt-51')
    expect(store.get('attempt-0')).toBeNull()
  })
  it('retains unsaved data in memory and reports quota failures explicitly', () => {
    const store = useExamSuiteAttempt()
    const spy = vi.spyOn(localStorage, 'setItem').mockImplementation(() => { throw new Error('Quota') })
    expect(store.save(record)).toBe(false)
    expect(store.get(record.attemptId)?.passages).toHaveLength(3)
    expect(store.storageError.value).toBeTruthy()
    spy.mockRestore()
    expect(store.save(record)).toBe(true)
    expect(store.storageError.value).toBeNull()
  })
  it('does not overwrite damaged storage and retains current result for retry', () => {
    localStorage.setItem(EXAM_SUITE_HISTORY_KEY, '{broken')
    const store = useExamSuiteAttempt()
    expect(store.storageError.value).toBeTruthy()
    expect(store.save(record)).toBe(false)
    expect(localStorage.getItem(EXAM_SUITE_HISTORY_KEY)).toBe('{broken')
    expect(store.get(record.attemptId)).not.toBeNull()
  })
})
