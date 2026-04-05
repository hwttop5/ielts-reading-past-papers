export type AssistantMode = 'hint' | 'explain' | 'review' | 'similar'
export type AssistantLocale = 'zh' | 'en'
export type AssistantAnswerSectionType = 'direct_answer' | 'reasoning' | 'evidence' | 'next_step'
export type AssistantConfidence = 'high' | 'medium' | 'low'

export interface AssistantHistoryItem {
  role: 'user' | 'assistant'
  content: string
}

export interface AssistantAttachment {
  name: string
  type: string
  text?: string
  truncated?: boolean
}

export interface AttemptContext {
  selectedAnswers?: Record<string, string>
  score?: number
  wrongQuestions?: string[]
  submitted?: boolean
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
  attachments?: AssistantAttachment[]
  focusQuestionNumbers?: string[]
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

export interface AssistantAnswerSection {
  type: AssistantAnswerSectionType
  text: string
}

export interface AssistantQueryResponse {
  answer: string
  citations: AssistantCitation[]
  followUps: string[]
  answerSections?: AssistantAnswerSection[]
  usedQuestionNumbers?: string[]
  usedParagraphLabels?: string[]
  confidence?: AssistantConfidence
  missingContext?: string[]
  recommendedQuestions?: SimilarQuestionRecommendation[]
  reviewItems?: AssistantReviewItem[]
}
