export type PracticeRouteMode = 'single' | 'review' | 'simulation'
export type PracticeFontScale = 'small' | 'medium' | 'large'
export type HighlightScope = 'passage' | 'questions'

export interface ReadingTextNode {
  type: 'text'
  text: string
}

export interface ReadingElementNode {
  type: 'element'
  tag: string
  attrs: Record<string, string>
  children: ReadingAstNode[]
}

export interface ReadingChoiceInputNode {
  type: 'choiceInput'
  inputType: 'radio' | 'checkbox'
  fieldName: string
  questionId: string
  questionIds: string[]
  value: string
  attrs: Record<string, string>
}

export interface ReadingTextInputNode {
  type: 'textInput'
  questionId: string
  fieldName: string
  attrs: Record<string, string>
}

export interface ReadingTextareaNode {
  type: 'textarea'
  questionId: string
  fieldName: string
  attrs: Record<string, string>
}

export interface ReadingSelectOption {
  value: string
  label: string
}

export interface ReadingSelectNode {
  type: 'select'
  questionId: string
  fieldName: string
  attrs: Record<string, string>
  options: ReadingSelectOption[]
}

export interface ReadingDropzoneNode {
  type: 'dropzone'
  appearance: 'paragraph' | 'match' | 'summary'
  questionId: string
  paragraph: string
  labelText: string
  attrs: Record<string, string>
}

export interface ReadingOptionChipNode {
  type: 'optionChip'
  poolId: string
  value: string
  label: string
  attrs: Record<string, string>
}

export type ReadingAstNode =
  | ReadingTextNode
  | ReadingElementNode
  | ReadingChoiceInputNode
  | ReadingTextInputNode
  | ReadingTextareaNode
  | ReadingSelectNode
  | ReadingDropzoneNode
  | ReadingOptionChipNode

export interface ReadingPassageBlock {
  blockId: string
  kind: string
  nodes: ReadingAstNode[]
}

export interface ReadingExplanationItem {
  questionId: string
  questionNumber: number | null
  text: string
}

export interface ReadingExplanationSection {
  sectionTitle: string
  mode: string
  questionRange: {
    start?: number
    end?: number
  } | null
  text: string
  items: ReadingExplanationItem[]
}

export interface ReadingQuestionGroup {
  groupId: string
  kind: string
  questionIds: string[]
  allowOptionReuse: boolean
  leadNodes: ReadingAstNode[]
  contentNodes: ReadingAstNode[]
  explanationSection: ReadingExplanationSection | null
}

export interface ReadingQuestionItem {
  questionId: string
  displayNumber: string
  anchorId: string
}

export interface ReadingPoolOption {
  poolId: string
  value: string
  label: string
}

export interface ReadingChoiceField {
  name: string
  inputType: 'radio' | 'checkbox'
  questionIds: string[]
}

export interface ReadingExamDocument {
  schemaVersion: 'ReadingExamDocumentV1'
  examId: string
  meta: {
    title: string
    originalTitle?: string
    category?: string
    frequency?: string
    pdfFilename?: string
    legacyPath?: string
    legacyFilename?: string
    questionIntroHtml?: string
  }
  explanationKey: string | null
  passageBlocks: ReadingPassageBlock[]
  questionGroups: ReadingQuestionGroup[]
  questionItems: ReadingQuestionItem[]
  options: ReadingPoolOption[]
  answerKey: Record<string, string | string[]>
  questionOrder: string[]
  questionDisplayMap: Record<string, string>
  paragraphAnchors: Record<string, string>
  questionAnchors: Record<string, string>
  fields: {
    choiceGroups: ReadingChoiceField[]
    textQuestions: string[]
    selectQuestions: string[]
    textareaQuestions: string[]
    dropzoneQuestions: string[]
  }
  totalQuestions: number
}

export interface ReadingExplanationDocument {
  schemaVersion: 'ReadingExplanationDocumentV1'
  examId: string
  meta: Record<string, unknown>
  passageNotes: Array<{
    label: string
    text: string
  }>
  questionSections: ReadingExplanationSection[]
  questionMap: Record<string, ReadingExplanationItem>
}

export interface ReadingNativeManifestEntry {
  examId: string
  title: string
  category: string
  totalQuestions: number
  examPath: string
  explanationPath: string | null
}

export interface ReadingNativeManifest {
  generatedAt: string
  exams: Record<string, ReadingNativeManifestEntry>
}

export interface PracticeDropzoneValue {
  value: string
  label: string
  poolId: string
}

export interface PracticeDraftState {
  choiceGroups: Record<string, string[]>
  textAnswers: Record<string, string>
  selectAnswers: Record<string, string>
  textareaAnswers: Record<string, string>
  dropzoneAnswers: Record<string, PracticeDropzoneValue | null>
}

export interface PracticeHighlightRecord {
  id?: string
  scope: HighlightScope
  text: string
  startPath?: string
  startOffset?: number
  endPath?: string
  endOffset?: number
}

export interface PracticeScrollState {
  passageTop: number
  questionsTop: number
}

export interface PracticeSessionDraft {
  answers: Record<string, string | string[]>
  markedQuestions: string[]
  highlights: PracticeHighlightRecord[]
  scrollState: PracticeScrollState
}

export interface PracticeAnswerComparisonEntry {
  questionId: string
  userAnswer: string | string[]
  correctAnswer: string | string[]
  isCorrect: boolean | null
}

export interface PracticeScoreInfo {
  correct: number
  total: number
  totalQuestions: number
  accuracy: number
  percentage: number
  details: Record<string, PracticeAnswerComparisonEntry>
  source: 'native_vue_practice'
}

export interface PracticeSessionResult {
  answers: Record<string, string | string[]>
  answerComparison: Record<string, PracticeAnswerComparisonEntry>
  correctAnswers: Record<string, string | string[]>
  scoreInfo: PracticeScoreInfo
  metadata: {
    examId: string
    examTitle: string
    category: string
    frequency: string
    type: 'reading'
    practiceMode: PracticeRouteMode
    markedQuestions: string[]
    highlights: PracticeHighlightRecord[]
  }
}
