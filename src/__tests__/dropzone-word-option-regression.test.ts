import { describe, expect, it } from 'vitest'
import p1High110 from '@/generated/reading-native/exams/p1-high-110.json'
import {
  buildPracticeSessionResult,
  collectAnswers,
  createEmptyDraftState,
  hydrateDraftState,
  normalizeDropzoneAnswerValue
} from '@/utils/readingPractice'
import type { PracticeDraftState, ReadingExamDocument } from '@/types/readingNative'

const pearlExam = p1High110 as ReadingExamDocument

describe('dropzone word option regression', () => {
  it('uses semantic option values for The Pearls summary options', () => {
    const wordPoolOptions = pearlExam.options.filter((option) => option.poolId === 'word-pool')
    expect(wordPoolOptions.map((option) => option.value)).toEqual([
      'A',
      'B',
      'C',
      'D',
      'E',
      'F',
      'G',
      'H',
      'I',
      'J',
      'K'
    ])
    expect(wordPoolOptions.some((option) => /^word-/i.test(option.value))).toBe(false)
    expect(['q5', 'q6', 'q7', 'q8', 'q9', 'q10'].map((questionId) => pearlExam.answerKey[questionId])).toEqual([
      'J',
      'K',
      'C',
      'F',
      'D',
      'G'
    ])
  })

  it('does not leave legacy word-prefixed option values in generated native exams', async () => {
    const modules = import.meta.glob('../generated/reading-native/exams/*.json', { eager: true })

    const offenders = Object.entries(modules).flatMap(([file, module]) => {
      const exam = (module as { default: ReadingExamDocument }).default
      return (exam.options || [])
        .filter((option) => /^word-[A-Za-z0-9]+$/i.test(String(option.value)))
        .map((option) => `${file}:${option.poolId}:${option.value}`)
    })

    expect(offenders).toEqual([])
  })

  it('scores legacy word-prefixed dropzone answers correctly', () => {
    const draftState: PracticeDraftState = {
      ...createEmptyDraftState(),
      dropzoneAnswers: {
        q5: { poolId: 'word-pool', value: 'word-J', label: 'J Persia' },
        q6: { poolId: 'word-pool', value: 'word-K', label: 'K Mallorca' }
      }
    }

    const answers = collectAnswers(pearlExam, draftState)
    const result = buildPracticeSessionResult({
      exam: pearlExam,
      answers,
      markedQuestions: [],
      highlights: [],
      mode: 'single'
    })

    expect(answers.q5).toBe('J')
    expect(answers.q6).toBe('K')
    expect(result.answerComparison.q5.isCorrect).toBe(true)
    expect(result.answerComparison.q6.isCorrect).toBe(true)
  })

  it('hydrates legacy display-label values to current semantic option values', () => {
    expect(normalizeDropzoneAnswerValue(pearlExam, 'word-J', 'word-pool')).toBe('J')
    expect(normalizeDropzoneAnswerValue(pearlExam, 'J Persia', 'word-pool')).toBe('J')

    const draftState = hydrateDraftState(pearlExam, {
      q5: 'word-J',
      q6: 'K Mallorca'
    })

    expect(draftState.dropzoneAnswers.q5?.value).toBe('J')
    expect(draftState.dropzoneAnswers.q5?.label).toBe('J Persia')
    expect(draftState.dropzoneAnswers.q6?.value).toBe('K')
    expect(draftState.dropzoneAnswers.q6?.label).toBe('K Mallorca')
  })
})
