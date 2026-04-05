/**
 * Reading-native document loader
 *
 * Loads IELTS reading practice documents from the pre-generated JSON files
 * in src/generated/reading-native/ directory.
 */

import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { repoRoot } from '../../config/paths.js'
import type {
  ParsedQuestionDocument,
  QuestionIndexEntry,
  QuestionSummaryDoc,
  RagChunk,
  RagChunkMetadata
} from '../../types/question-bank.js'
import { compactMultiline, uniqueValues } from '../utils/text.js'
import { buildQualityReport } from './qualityCheck.js'

// Inline type definitions to avoid cross-directory imports
interface ReadingPassageBlock {
  blockId: string
  kind: string
  nodes: ReadingAstNode[]
}

interface ReadingQuestionGroup {
  groupId: string
  kind: string
  questionIds: string[]
  allowOptionReuse: boolean
  leadNodes: ReadingAstNode[]
  contentNodes: ReadingAstNode[]
}

interface ReadingQuestionItem {
  questionId: string
  displayNumber: string
  anchorId: string
}

interface ReadingPoolOption {
  poolId: string
  value: string
  label: string
}

type ReadingAstNode = {
  type: 'text'
  text: string
} | {
  type: 'element'
  tag: string
  attrs: Record<string, string>
  children: ReadingAstNode[]
} | {
  type: string
  [key: string]: unknown
}

interface ReadingExamDocument {
  schemaVersion: string
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
    choiceGroups: Array<{ name: string; inputType: string; questionIds: string[] }>
    textQuestions: string[]
    selectQuestions: string[]
    textareaQuestions: string[]
    dropzoneQuestions: string[]
  }
  totalQuestions: number
}

interface ReadingExplanationItem {
  questionId: string
  questionNumber: number | null
  text: string
}

interface ReadingExplanationSection {
  sectionTitle: string
  mode: string
  questionRange: { start?: number; end?: number } | null
  text: string
  items: ReadingExplanationItem[]
}

interface ReadingExplanationDocument {
  schemaVersion: string
  examId: string
  meta: Record<string, unknown>
  passageNotes: Array<{ label: string; text: string }>
  questionSections: ReadingExplanationSection[]
  questionMap: Record<string, ReadingExplanationItem>
}

interface ReadingNativeManifestEntry {
  examId: string
  title: string
  category: 'P1' | 'P2' | 'P3'
  totalQuestions: number
  examPath: string
  explanationPath: string | null
}

interface ReadingNativeManifest {
  generatedAt: string
  exams: Record<string, ReadingNativeManifestEntry>
}

const STOPWORDS = new Set([
  'about', 'after', 'again', 'against', 'almost', 'also', 'among', 'around', 'because',
  'been', 'before', 'being', 'between', 'could', 'every', 'from', 'have', 'having', 'into',
  'itself', 'just', 'more', 'most', 'need', 'other', 'over', 'same', 'should', 'such',
  'than', 'that', 'their', 'there', 'these', 'they', 'this', 'through', 'under', 'very',
  'were', 'what', 'when', 'where', 'which', 'while', 'with', 'would', 'your'
])

const examDocumentCache = new Map<string, ReadingExamDocument>()
const explanationDocumentCache = new Map<string, ReadingExplanationDocument>()

function buildChunkMetadata(
  question: QuestionIndexEntry,
  chunkType: RagChunk['chunkType'],
  sensitive: boolean,
  questionNumbers: string[],
  paragraphLabels: string[],
  sourcePath: string,
  questionType?: string
): RagChunkMetadata {
  return {
    questionId: question.id,
    title: question.title,
    category: question.category,
    difficulty: question.difficulty || 'unknown',
    chunkType,
    sensitive,
    questionNumbers,
    paragraphLabels,
    sourcePath,
    questionType
  }
}

function buildChunkId(questionId: string, chunkType: RagChunk['chunkType'], suffix: string): string {
  return `${questionId}:${chunkType}:${suffix}`
}

function buildChunk(
  question: QuestionIndexEntry,
  sourcePath: string,
  chunkType: RagChunk['chunkType'],
  sensitive: boolean,
  suffix: string,
  content: string,
  questionNumbers: string[] = [],
  paragraphLabels: string[] = [],
  questionType?: string
): RagChunk {
  const normalizedContent = compactMultiline(content)

  return {
    id: buildChunkId(question.id, chunkType, suffix),
    questionId: question.id,
    title: question.title,
    category: question.category,
    difficulty: question.difficulty || 'unknown',
    chunkType,
    sensitive,
    questionNumbers,
    paragraphLabels,
    content: normalizedContent,
    sourcePath,
    metadata: buildChunkMetadata(
      question,
      chunkType,
      sensitive,
      questionNumbers,
      paragraphLabels,
      sourcePath,
      questionType
    )
  }
}

function extractTextFromNodes(nodes: ReadingAstNode[]): string {
  const texts: string[] = []

  const walk = (nodeList: ReadingAstNode[]) => {
    for (const node of nodeList) {
      if (node.type === 'text' && 'text' in node && typeof node.text === 'string') {
        texts.push(node.text.trim())
      } else if ('children' in node && Array.isArray(node.children)) {
        walk(node.children)
      }
    }
  }

  walk(nodes)
  return texts.filter(Boolean).join(' ')
}

function extractPassageParagraphs(exam: ReadingExamDocument, sourcePath: string): RagChunk[] {
  const chunks: RagChunk[] = []
  const VALID_PARAGRAPH_LABELS = new Set(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'])

  for (const block of exam.passageBlocks) {
    const paragraphElements = block.nodes.filter(
      (node): node is ReadingAstNode & { type: 'element'; tag: string; children: ReadingAstNode[] } =>
        node.type === 'element' && node.tag === 'p' && 'children' in node
    )

    // Extract paragraph label from multiple sources, in priority order:
    // 1. Explicit label from dropzone paragraph attribute
    // 2. First <strong> element content (e.g., <strong>A</strong>)
    // 3. blockId only if it matches passage-[A-H] pattern
    let extractedLabel: string | null = null

    // Check for dropzone nodes with paragraph attribute
    for (const node of block.nodes) {
      if (node.type === 'dropzone' && 'paragraph' in node && typeof node.paragraph === 'string') {
        const label = node.paragraph.toUpperCase()
        if (VALID_PARAGRAPH_LABELS.has(label)) {
          extractedLabel = label
          break
        }
      }
    }

    // Check for <strong>A</strong> or similar at the start of paragraph elements
    if (!extractedLabel) {
      for (const p of paragraphElements) {
        const firstChild = p.children?.[0]
        if (firstChild && 'type' in firstChild && firstChild.type === 'element' && firstChild.tag === 'strong' && 'children' in firstChild && Array.isArray(firstChild.children)) {
          const text = extractTextFromNodes(firstChild.children)
          if (text && VALID_PARAGRAPH_LABELS.has(text.toUpperCase())) {
            extractedLabel = text.toUpperCase()
            break
          }
        }
      }
    }

    // Fallback to blockId only if it matches passage-[A-H]
    if (!extractedLabel) {
      const paragraphId = block.blockId
      const labelMatch = paragraphId?.match(/passage-([A-H])$/i)
      if (labelMatch) {
        extractedLabel = labelMatch[1].toUpperCase()
      }
    }

    for (const p of paragraphElements) {
      const text = extractTextFromNodes(p.children || [])
      if (!text) continue

      // Skip boilerplate intro paragraphs like "You should spend about 20 minutes..."
      if (/^you should spend about/i.test(text) || /^reading passage/i.test(text)) {
        continue
      }

      chunks.push(
        buildChunk(
          { id: exam.examId, title: exam.meta.title, category: exam.meta.category || 'P1', difficulty: exam.meta.frequency || 'unknown' } as QuestionIndexEntry,
          sourcePath,
          'passage_paragraph',
          false,
          extractedLabel || block.blockId,
          text,
          [],
          extractedLabel ? [extractedLabel] : [],
          undefined
        )
      )
    }
  }

  if (chunks.length === 0) {
    for (const block of exam.passageBlocks) {
      const text = extractTextFromNodes(block.nodes)
      if (text && !/^you should spend about/i.test(text) && !/^reading passage/i.test(text)) {
        chunks.push(
          buildChunk(
            { id: exam.examId, title: exam.meta.title, category: exam.meta.category || 'P1', difficulty: exam.meta.frequency || 'unknown' } as QuestionIndexEntry,
            sourcePath,
            'passage_paragraph',
            false,
            block.blockId,
            text,
            [],
            [],
            undefined
          )
        )
      }
    }
  }

  return chunks
}

function inferQuestionType(group: ReadingQuestionGroup): string {
  const kind = group.kind || ''

  if (kind.includes('heading') || (kind.includes('matching') && group.leadNodes?.some(n => /heading/i.test(String(n))))) {
    return 'heading_matching'
  }

  if (kind.includes('paragraph') && kind.includes('matching')) {
    return 'paragraph_matching'
  }

  if (kind.includes('true') || kind.includes('false') || kind.includes('not given')) {
    return 'true_false_not_given'
  }

  if (kind.includes('yes') || kind.includes('no') || kind.includes('not given')) {
    return 'yes_no_not_given'
  }

  if (kind.includes('matching')) {
    return 'matching'
  }

  if (kind.includes('multiple') || kind.includes('select')) {
    return 'multiple_select'
  }

  if (kind.includes('choice')) {
    return 'multiple_choice'
  }

  if (kind.includes('completion') || kind.includes('fill') || kind.includes('gap')) {
    return 'sentence_completion'
  }

  return 'unknown'
}

function extractQuestionChunks(exam: ReadingExamDocument, sourcePath: string): RagChunk[] {
  const chunks: RagChunk[] = []

  // Build reverse mapping from question anchors to paragraph labels
  const questionToParagraph = new Map<string, string>()
  if (exam.paragraphAnchors) {
    for (const [paragraphLabel, anchorId] of Object.entries(exam.paragraphAnchors)) {
      // Find which question ID corresponds to this anchor
      for (const [questionId, qAnchorId] of Object.entries(exam.questionAnchors || {})) {
        if (qAnchorId === anchorId) {
          questionToParagraph.set(questionId, paragraphLabel)
          break
        }
      }
    }
  }

  // Fallback: for questions without paragraph anchors, use answerKey if it contains paragraph labels (A-H)
  const VALID_PARAGRAPH_LABELS = new Set(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'])
  for (const [questionId, answer] of Object.entries(exam.answerKey)) {
    if (!questionToParagraph.has(questionId) && typeof answer === 'string' && VALID_PARAGRAPH_LABELS.has(answer)) {
      questionToParagraph.set(questionId, answer)
    }
  }

  for (const group of exam.questionGroups) {
    const questionType = inferQuestionType(group)

    for (const questionId of group.questionIds) {
      const displayNumber = exam.questionDisplayMap[questionId] || questionId.replace('q', '')
      const leadText = group.leadNodes ? extractTextFromNodes(group.leadNodes) : ''
      const contentText = group.contentNodes ? extractTextFromNodes(group.contentNodes) : ''

      const combinedText = [
        `Question ${displayNumber}`,
        leadText ? `Instructions: ${leadText}` : '',
        contentText ? `Content: ${contentText}` : '',
        `Question type: ${questionType}`
      ].filter(Boolean).join('\n')

      // For paragraph matching questions, include the associated paragraph label
      const paragraphLabel = questionToParagraph.get(questionId)
      const paragraphLabels = paragraphLabel ? [paragraphLabel] : []

      chunks.push(
        buildChunk(
          { id: exam.examId, title: exam.meta.title, category: exam.meta.category || 'P1', difficulty: exam.meta.frequency || 'unknown' } as QuestionIndexEntry,
          sourcePath,
          'question_item',
          false,
          questionId,
          combinedText,
          [displayNumber],
          paragraphLabels,
          questionType
        )
      )
    }
  }

  return chunks
}

function extractAnswerKeyChunks(exam: ReadingExamDocument, sourcePath: string): RagChunk[] {
  const chunks: RagChunk[] = []

  for (const [questionId, answer] of Object.entries(exam.answerKey)) {
    const answerText = Array.isArray(answer) ? answer.join(', ') : answer
    const displayNumber = exam.questionDisplayMap[questionId] || questionId.replace('q', '')

    chunks.push(
      buildChunk(
        { id: exam.examId, title: exam.meta.title, category: exam.meta.category || 'P1', difficulty: exam.meta.frequency || 'unknown' } as QuestionIndexEntry,
        sourcePath,
        'answer_key',
        true,
        questionId,
        `Question ${displayNumber}\nCorrect answer: ${answerText}`,
        [displayNumber],
        []
      )
    )
  }

  return chunks
}

function extractExplanationChunks(exam: ReadingExamDocument, explanation: ReadingExplanationDocument | null, sourcePath: string): RagChunk[] {
  const chunks: RagChunk[] = []

  if (!explanation) {
    return chunks
  }

  for (const section of explanation.questionSections) {
    const sectionText = section.text || ''

    for (const item of section.items) {
      const displayNumber = item.questionNumber?.toString() || exam.questionDisplayMap[item.questionId]?.replace('q', '') || item.questionId.replace('q', '')

      const content = [
        `Question ${displayNumber}`,
        sectionText ? `Explanation:\n${sectionText}` : '',
        item.text ? `Detail:\n${item.text}` : ''
      ].filter(Boolean).join('\n')

      chunks.push(
        buildChunk(
          { id: exam.examId, title: exam.meta.title, category: exam.meta.category || 'P1', difficulty: exam.meta.frequency || 'unknown' } as QuestionIndexEntry,
          sourcePath,
          'answer_explanation',
          true,
          item.questionId,
          content,
          [displayNumber],
          []
        )
      )
    }
  }

  return chunks
}

function extractPassageNoteChunks(exam: ReadingExamDocument, explanation: ReadingExplanationDocument | null, sourcePath: string): RagChunk[] {
  const chunks: RagChunk[] = []
  const VALID_PARAGRAPH_LABELS = new Set(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'])

  if (!explanation?.passageNotes?.length) {
    return chunks
  }

  for (const note of explanation.passageNotes) {
    const label = note.label || ''
    // Only extract single letter A-H as paragraph label
    const labelMatch = label.match(/^\s*(?:Paragraph\s*)?([A-H])\s*$/i)
    const paragraphLabel = labelMatch ? labelMatch[1].toUpperCase() : null

    // Only include passage notes that have valid paragraph labels
    if (paragraphLabel && VALID_PARAGRAPH_LABELS.has(paragraphLabel)) {
      chunks.push(
        buildChunk(
          { id: exam.examId, title: exam.meta.title, category: exam.meta.category || 'P1', difficulty: exam.meta.frequency || 'unknown' } as QuestionIndexEntry,
          sourcePath,
          'passage_paragraph',
          false,
          `note-${paragraphLabel}`,
          note.text || '',
          [],
          [paragraphLabel]
        )
      )
    }
  }

  return chunks
}

function extractKeywords(exam: ReadingExamDocument, passageText: string): string[] {
  const source = `${exam.meta.title} ${passageText}`
  const scores = new Map<string, number>()
  const matches = source.match(/[A-Za-z][A-Za-z'-]{2,}/g) || []

  for (const rawWord of matches) {
    const word = rawWord.toLowerCase()
    if (STOPWORDS.has(word)) continue
    scores.set(word, (scores.get(word) || 0) + 1)
  }

  return Array.from(scores.entries())
    .sort((left, right) => right[1] - left[1])
    .slice(0, 10)
    .map(([word]) => word)
}

function buildSummaryDoc(
  exam: ReadingExamDocument,
  sourcePath: string,
  passageChunks: RagChunk[],
  questionChunks: RagChunk[]
): QuestionSummaryDoc {
  const passageText = passageChunks.map(c => c.content).join(' ')
  const questionTypes = uniqueValues(
    questionChunks.map(c => c.metadata.questionType).filter((t): t is string => Boolean(t))
  )
  const keywords = extractKeywords(exam, passageText)

  const topicSummary = passageChunks.slice(0, 3).map(c => c.content).join(' ')

  const content = compactMultiline([
    `Title: ${exam.meta.title}`,
    `Category: ${exam.meta.category || ''}`,
    `Difficulty: ${exam.meta.frequency || ''}`,
    questionTypes.length > 0 ? `Question types: ${questionTypes.join(', ')}` : '',
    keywords.length > 0 ? `Keywords: ${keywords.join(', ')}` : '',
    topicSummary ? `Topic summary: ${topicSummary}` : ''
  ].filter(Boolean).join('\n'))

  return {
    id: `${exam.examId}:summary`,
    questionId: exam.examId,
    title: exam.meta.title,
    category: exam.meta.category || 'P1',
    difficulty: exam.meta.frequency || 'unknown',
    topicSummary,
    keywords,
    questionTypes,
    content,
    sourcePath,
    metadata: {
      questionId: exam.examId,
      title: exam.meta.title,
      category: exam.meta.category || 'P1',
      difficulty: exam.meta.frequency || 'unknown',
      sourcePath,
      keywords,
      questionTypes
    }
  }
}

async function loadManifest(): Promise<ReadingNativeManifest> {
  const manifestPath = resolve(repoRoot, 'src/generated/reading-native/manifest.json')
  const raw = await readFile(manifestPath, 'utf8')
  return JSON.parse(raw) as ReadingNativeManifest
}

async function loadExamDocument(examId: string): Promise<ReadingExamDocument | null> {
  const cached = examDocumentCache.get(examId)
  if (cached) return cached

  try {
    const manifest = await loadManifest()
    const entry = manifest.exams[examId]
    if (!entry) return null

    const examPath = resolve(repoRoot, 'src/generated/reading-native', entry.examPath.replace(/^\.\//, ''))
    const raw = await readFile(examPath, 'utf8')
    const exam = JSON.parse(raw) as ReadingExamDocument
    examDocumentCache.set(examId, exam)
    return exam
  } catch {
    return null
  }
}

async function loadExplanationDocument(examId: string): Promise<ReadingExplanationDocument | null> {
  const cached = explanationDocumentCache.get(examId)
  if (cached) return cached

  try {
    const manifest = await loadManifest()
    const entry = manifest.exams[examId]
    if (!entry?.explanationPath) return null

    const explanationPath = resolve(repoRoot, 'src/generated/reading-native', entry.explanationPath.replace(/^\.\//, ''))
    const raw = await readFile(explanationPath, 'utf8')
    const explanation = JSON.parse(raw) as ReadingExplanationDocument
    explanationDocumentCache.set(examId, explanation)
    return explanation
  } catch {
    return null
  }
}

function toQuestionIndexEntry(exam: ReadingExamDocument): QuestionIndexEntry {
  return {
    id: exam.examId,
    title: exam.meta.title,
    category: exam.meta.category as 'P1' | 'P2' | 'P3' || 'P1',
    difficulty: exam.meta.frequency || 'unknown',
    htmlPath: exam.meta.legacyPath || `/generated/reading-native/exams/${exam.examId}.json`
  }
}

export async function parseReadingNativeDocument(question: QuestionIndexEntry): Promise<ParsedQuestionDocument | null> {
  const exam = await loadExamDocument(question.id)
  if (!exam) return null

  const sourcePath = `/generated/reading-native/exams/${exam.examId}.json`
  const explanation = await loadExplanationDocument(exam.examId)

  const passageChunks = extractPassageParagraphs(exam, sourcePath)
  const passageNoteChunks = extractPassageNoteChunks(exam, explanation, sourcePath)
  const allPassageChunks = [...passageChunks, ...passageNoteChunks]

  const questionChunks = extractQuestionChunks(exam, sourcePath)
  const answerKeyChunks = extractAnswerKeyChunks(exam, sourcePath)
  const answerExplanationChunks = extractExplanationChunks(exam, explanation, sourcePath)

  const summary = buildSummaryDoc(exam, sourcePath, allPassageChunks, questionChunks)

  const baseDocument = {
    question: toQuestionIndexEntry(exam),
    sourcePath,
    passageChunks: allPassageChunks,
    questionChunks,
    answerKeyChunks,
    answerExplanationChunks,
    summary,
    allChunks: [...allPassageChunks, ...questionChunks, ...answerKeyChunks, ...answerExplanationChunks]
  }

  return {
    ...baseDocument,
    qualityReport: buildQualityReport(baseDocument)
  }
}

export { loadExamDocument, loadExplanationDocument, loadManifest }
export { examDocumentCache, explanationDocumentCache }
