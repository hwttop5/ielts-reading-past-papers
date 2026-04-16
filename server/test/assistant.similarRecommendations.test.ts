import { describe, expect, it } from 'vitest'
import {
  getSharedKeywords,
  scoreQuestionSummarySimilarity
} from '../src/lib/assistant/similarRecommendations.js'
import type { QuestionSummaryDoc } from '../src/types/question-bank.js'

function summary(overrides: Partial<QuestionSummaryDoc>): QuestionSummaryDoc {
  return {
    id: `${overrides.questionId ?? 'question'}:summary`,
    questionId: overrides.questionId ?? 'question',
    title: overrides.title ?? 'Sample Passage',
    category: overrides.category ?? 'P1',
    difficulty: overrides.difficulty ?? 'high',
    topicSummary: overrides.topicSummary ?? '',
    keywords: overrides.keywords ?? [],
    questionTypes: overrides.questionTypes ?? [],
    content: overrides.content ?? '',
    sourcePath: overrides.sourcePath ?? '/questionBank/sample.html',
    metadata: {
      questionId: overrides.questionId ?? 'question',
      title: overrides.title ?? 'Sample Passage',
      category: overrides.category ?? 'P1',
      difficulty: overrides.difficulty ?? 'high',
      sourcePath: overrides.sourcePath ?? '/questionBank/sample.html',
      keywords: overrides.keywords ?? [],
      questionTypes: overrides.questionTypes ?? []
    }
  }
}

describe('static similar recommendation scoring', () => {
  it('prioritizes specific tea-topic passages over generic history matches', () => {
    const current = summary({
      questionId: 'p1-high-01',
      title: 'A Brief History of Tea',
      category: 'P1',
      difficulty: 'high',
      keywords: ['history', 'tea'],
      questionTypes: ['matching']
    })
    const teaHistory = summary({
      questionId: 'p1-high-90',
      title: 'The History of Tea',
      category: 'P1',
      difficulty: 'high',
      keywords: ['history', 'tea'],
      questionTypes: ['true_false_not_given']
    })
    const teaTrade = summary({
      questionId: 'p1-low-68',
      title: 'The Clipper Races',
      category: 'P1',
      difficulty: 'low',
      keywords: ['tea', 'china', 'trade'],
      questionTypes: ['true_false_not_given']
    })
    const socialHistory = summary({
      questionId: 'p3-low-43',
      title: 'What is social history',
      category: 'P3',
      difficulty: 'low',
      keywords: ['history', 'social'],
      questionTypes: ['matching']
    })

    expect(scoreQuestionSummarySimilarity(current, teaHistory)).toBeGreaterThan(scoreQuestionSummarySimilarity(current, socialHistory))
    expect(scoreQuestionSummarySimilarity(current, teaTrade)).toBeGreaterThan(scoreQuestionSummarySimilarity(current, socialHistory))
    expect(getSharedKeywords(current, socialHistory)).toEqual(['history'])
  })
})
