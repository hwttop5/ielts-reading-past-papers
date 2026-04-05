export type AssistantLocale = 'zh' | 'en'
export type AssistantAnswerSectionType = 'direct_answer' | 'reasoning' | 'evidence' | 'next_step'
export type AssistantConfidence = 'high' | 'medium' | 'low'
export type AssistantPromptKind = 'preset' | 'freeform' | 'followup'

// New: Surface indicates which UI entry point triggered the request
export type AssistantSurface = 'chat_widget' | 'selection_popover' | 'review_workspace'

// New: Action indicates the specific operation to perform
export type AssistantAction =
  | 'chat'
  | 'translate'
  | 'explain_selection'
  | 'find_paraphrases'
  | 'find_antonyms'
  | 'extract_keywords'
  | 'locate_evidence'
  | 'analyze_mistake'
  | 'review_set'
  | 'recommend_drills'

// New: Response kind for routing UI rendering
export type AssistantResponseKind = 'chat' | 'grounded' | 'tool_result' | 'review' | 'clarify' | 'social'

// New: Route type for three-layer routing
export type AssistantRoute = 'unrelated_chat' | 'ielts_general' | 'page_grounded'

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

// New: Selected context from user's text selection in the passage
export interface SelectedContext {
  text: string
  scope: 'passage' | 'question'
  questionNumbers?: string[]
  paragraphLabels?: string[]
}

// New: Practice context for review workspace
export interface PracticeContext {
  submitted?: boolean
  score?: number
  wrongQuestions?: string[]
  selectedAnswers?: Record<string, string>
  currentQuestionNumbers?: string[]
}

// New: SearchMode controls whether web search is allowed
export type SearchMode = 'auto' | 'off' | 'required'

// Answer source indicates where the response came from
export type AnswerSource = 'local' | 'llm' | 'pdf_fallback' | 'web' | 'hybrid'

// Web citation for displaying sources
export interface WebCitation {
  title: string
  url: string
  snippet: string
  sourceType?: string
}

export interface AssistantQueryRequest {
  questionId: string
  locale?: AssistantLocale
  userQuery?: string
  history?: AssistantHistoryItem[]
  attachments?: AssistantAttachment[]
  focusQuestionNumbers?: string[]
  attemptContext?: AttemptContext
  recentPractice?: RecentPracticeItem[]
  promptKind?: AssistantPromptKind
  // Unified protocol fields
  surface?: AssistantSurface
  action?: AssistantAction
  selectedContext?: SelectedContext
  practiceContext?: PracticeContext
  // Search control fields
  searchMode?: SearchMode
  allowWebSearch?: boolean
}

/** Serialized RAG chunk for offline evaluation (X-Assistant-Eval / ASSISTANT_INCLUDE_RETRIEVAL). */
export interface AssistantRetrievedChunk {
  id: string
  questionId: string
  chunkType: string
  questionNumbers: string[]
  paragraphLabels: string[]
  content: string
  metadata: {
    questionType?: string
    chunkType?: string
    sensitive?: boolean
  }
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
  responseKind?: AssistantResponseKind
  // Enhanced protocol fields
  toolCards?: AssistantToolCard[]
  // Search metadata
  answerSource?: AnswerSource
  searchUsed?: boolean
  webCitations?: WebCitation[]
  /** Populated only when eval retrieval is enabled (see server routes + env). */
  retrievedChunks?: AssistantRetrievedChunk[]
  /** Router layer (unrelated_chat | ielts_general | page_grounded); set with retrievedChunks for eval. */
  assistantRoute?: AssistantRoute
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

// New: Tool card for selection tools and review workspace
export interface AssistantToolCard {
  kind: 'vocab' | 'evidence' | 'paraphrase' | 'antonym' | 'drill' | 'diagnosis'
  title: string
  content: string
  metadata?: Record<string, string | string[]>
  sourceExcerpt?: string
}

// New: Router decision for three-layer routing
export interface RouterDecision {
  route: AssistantRoute
  reason: string
  confidence: number
  useDocument: boolean
  useRetrieval: boolean
  useWebSearch: boolean
}
