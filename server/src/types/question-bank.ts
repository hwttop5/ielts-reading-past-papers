export type RagChunkType =
  | 'passage_paragraph'
  | 'question_item'
  | 'answer_key'
  | 'answer_explanation'

export interface QuestionIndexEntry {
  id: string
  title: string
  titleCN?: string
  category: 'P1' | 'P2' | 'P3'
  difficulty: string
  htmlPath: string
  pdfPath?: string
}

export interface RagChunkMetadata {
  questionId: string
  title: string
  category: string
  difficulty: string
  chunkType: RagChunkType
  sensitive: boolean
  questionNumbers: string[]
  paragraphLabels: string[]
  sourcePath: string
  questionType?: string
}

export interface RagChunk {
  id: string
  questionId: string
  title: string
  category: string
  difficulty: string
  chunkType: RagChunkType
  sensitive: boolean
  questionNumbers: string[]
  paragraphLabels: string[]
  content: string
  sourcePath: string
  metadata: RagChunkMetadata
}

export interface QuestionSummaryDoc {
  id: string
  questionId: string
  title: string
  category: string
  difficulty: string
  topicSummary: string
  keywords: string[]
  questionTypes: string[]
  content: string
  sourcePath: string
  metadata: {
    questionId: string
    title: string
    category: string
    difficulty: string
    sourcePath: string
    keywords: string[]
    questionTypes: string[]
  }
}

export interface QuestionQualityIssue {
  level: 'warning' | 'error'
  message: string
}

export interface QuestionQualityReport {
  questionId: string
  issues: QuestionQualityIssue[]
}

export interface ParsedQuestionDocument {
  question: QuestionIndexEntry
  sourcePath: string
  passageChunks: RagChunk[]
  questionChunks: RagChunk[]
  answerKeyChunks: RagChunk[]
  answerExplanationChunks: RagChunk[]
  summary: QuestionSummaryDoc
  qualityReport: QuestionQualityReport
  allChunks: RagChunk[]
}

export interface StoredVectorPoint<TPayload> {
  id: string
  vector: number[]
  payload: TPayload
}
