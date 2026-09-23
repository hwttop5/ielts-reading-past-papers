import type { ReadingQuestionItem, PracticeSessionResult, PracticeHighlightRecord } from './readingNative'

export interface SuitePassageState {
  ready: boolean
  error: string
  questionItems: ReadingQuestionItem[]
  answerMap: Record<string, string | string[]>
  markedQuestions: string[]
  activeQuestionId: string
  submitted: boolean
}
export interface SuitePassageSnapshot {
  id: string
  title: string
  result: PracticeSessionResult
  highlights: PracticeHighlightRecord[]
  markedQuestions: string[]
}
export interface SuitePassageHandle {
  getState(): SuitePassageState
  submitForSuite(): SuitePassageSnapshot | null
  restoreSuiteResult(snapshot: SuitePassageSnapshot): void
  clearSuiteDraft(): void
  navigateToQuestion(questionId: string, anchorId: string): Promise<void>
  toggleReview(questionId: string): void
  reload(): Promise<void>
}
