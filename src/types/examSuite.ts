import type { PracticeHighlightRecord, PracticeSessionResult, ReadingExamDocument } from './readingNative'

export type SuitePassages<T> = [T, T, T]
export interface PreparedExamSuite {
  ids: SuitePassages<string>
  passages: SuitePassages<ReadingExamDocument>
  totalQuestions: 40
  durationSeconds: 3600
}
export interface ExamSuitePassageResult {
  id: string
  title: string
  result: PracticeSessionResult
  highlights: PracticeHighlightRecord[]
  markedQuestions: string[]
}
export interface ExamSuiteAttempt {
  version: 1
  attemptId: string
  passages: SuitePassages<ExamSuitePassageResult>
  completedAt: string
  durationSeconds: number
  correct: number
  totalQuestions: 40
  accuracy: number
}
