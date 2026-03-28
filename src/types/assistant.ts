export type AssistantMode = 'hint' | 'explain' | 'review' | 'similar'
export type AssistantLocale = 'zh' | 'en'

export interface AssistantHistoryItem {
  role: 'user' | 'assistant'
  content: string
}

export interface AttemptContext {
  selectedAnswers?: Record<string, string>
  score?: number
  wrongQuestions?: string[]
}

export interface RecentPracticeItem {
  questionId: string
  accuracy: number
  category: string
  duration: number
}

export interface AssistantQueryRequest {
  questionId: string
  mode: AssistantMode
  locale?: AssistantLocale
  userQuery?: string
  history?: AssistantHistoryItem[]
  attemptContext?: AttemptContext
  recentPractice?: RecentPracticeItem[]
}

export interface AssistantCitation {
  chunkType: string
  questionNumbers?: string[]
  paragraphLabels?: string[]
  excerpt: string
}

export interface SimilarQuestionRecommendation {
  questionId: string
  title: string
  reason: string
}

export interface AssistantReviewItem {
  questionNumber: string
  selectedAnswer?: string
  correctAnswer: string
  explanation: string
  evidence: string
  paragraphLabel?: string
}

export interface AssistantQueryResponse {
  answer: string
  citations: AssistantCitation[]
  followUps: string[]
  recommendedQuestions?: SimilarQuestionRecommendation[]
  reviewItems?: AssistantReviewItem[]
}
