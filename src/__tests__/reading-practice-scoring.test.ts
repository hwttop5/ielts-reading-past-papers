import { describe, expect, it } from 'vitest'
import woodExamJson from '@/generated/reading-native/exams/p1-medium-119.json'
import slowFoodExamJson from '@/generated/reading-native/exams/p1-low-34.json'
import {
  buildPracticeSessionResult,
  compareAnswers,
  questionWeight
} from '@/utils/readingPractice'
import type { ReadingExamDocument } from '@/types/readingNative'

const woodExam = woodExamJson as ReadingExamDocument
const slowFoodExam = slowFoodExamJson as ReadingExamDocument

describe('reading practice scoring', () => {
  it('treats answer arrays as acceptable aliases for one question', () => {
    expect(compareAnswers('60,000', ['60,000', '60000', '60 000'])).toBe(true)
    expect(compareAnswers('60000', ['60,000', '60000', '60 000'])).toBe(true)
    expect(compareAnswers('60 000', ['60,000', '60000', '60 000'])).toBe(true)
    expect(questionWeight(['ring', 'gold ring'])).toBe(1)
  })

  it('treats slash-separated scalar answers as one-question aliases', () => {
    expect(compareAnswers('4', '4/four')).toBe(true)
    expect(compareAnswers('four', '4/four')).toBe(true)
    expect(questionWeight('4/four')).toBe(1)
  })

  it('scores Wood Q9 numeric aliases without inflating the denominator', () => {
    const answers = {
      q1: 'FALSE',
      q2: 'TRUE',
      q3: 'NOT GIVEN',
      q4: 'FALSE',
      q5: 'NOT GIVEN',
      q6: 'TRUE',
      q7: 'shipping costs',
      q8: 'export sector',
      q9: '60,000',
      q10: 'softwood',
      q11: 'sustainability',
      q12: 'Scandinavian countries',
      q13: 'wood substitutes'
    }

    const result = buildPracticeSessionResult({
      exam: woodExam,
      answers,
      markedQuestions: [],
      highlights: [],
      mode: 'single'
    })

    expect(result.answerComparison.q9.isCorrect).toBe(true)
    expect(result.scoreInfo.correct).toBe(13)
    expect(result.scoreInfo.totalQuestions).toBe(13)
  })

  it('keeps generated exam score totals aligned with declared totals', async () => {
    const modules = import.meta.glob('../generated/reading-native/exams/*.json', { eager: true })
    const offenders = Object.entries(modules).flatMap(([file, module]) => {
      const exam = (module as { default: ReadingExamDocument }).default
      const calculated = (exam.questionOrder || []).reduce(
        (sum, questionId) => sum + questionWeight(exam.answerKey?.[questionId] || ''),
        0
      )
      return calculated === exam.totalQuestions
        ? []
        : [`${file}: expected ${exam.totalQuestions}, got ${calculated}`]
    })

    expect(offenders).toEqual([])
  })

  it('keeps slash-alias scalar answers from inflating single-question exams', () => {
    const result = buildPracticeSessionResult({
      exam: slowFoodExam,
      answers: {
        q1: 'TRUE',
        q2: 'FALSE',
        q3: 'TRUE',
        q4: 'NOT GIVEN',
        q5: 'FALSE',
        q6: 'NOT GIVEN',
        q7: 'unique',
        q8: 'limited',
        q9: 'unchanging',
        q10: 'eggs',
        q11: 'four',
        q12: 'chefs',
        q13: 'consumers'
      },
      markedQuestions: [],
      highlights: [],
      mode: 'single'
    })

    expect(result.answerComparison.q11.isCorrect).toBe(true)
    expect(result.scoreInfo.correct).toBe(13)
    expect(result.scoreInfo.totalQuestions).toBe(13)
  })
})
