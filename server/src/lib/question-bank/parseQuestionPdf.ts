import { execFile } from 'node:child_process'
import { resolve } from 'node:path'
import { promisify } from 'node:util'
import { publicRoot, serverRoot } from '../../config/paths.js'
import type {
  ParsedQuestionDocument,
  QuestionIndexEntry,
  QuestionSummaryDoc,
  RagChunk,
  RagChunkMetadata
} from '../../types/question-bank.js'
import { compactMultiline, normalizeWhitespace, uniqueValues } from '../utils/text.js'
import { buildQualityReport } from './qualityCheck.js'

const execFileAsync = promisify(execFile)
const pythonScriptPath = resolve(serverRoot, 'scripts/extract_question_pdf.py')

interface ExtractedPdfItem {
  text: string
  x: number
  y: number
  w: number
  h: number
}

interface ExtractedPdfPage {
  pageNumber: number
  kind: 'text' | 'ocr' | 'empty'
  text: string
  lines: string[]
  items: ExtractedPdfItem[]
}

interface ExtractedPdfDocument {
  pages: ExtractedPdfPage[]
}

interface PdfQuestionSection {
  header: string
  questionNumbers: string[]
  sharedInstructions: string
  promptByQuestion: Map<string, string>
  optionMap: Map<string, string>
}

interface QuestionChunkDetail {
  chunk: RagChunk
  optionMap: Map<string, string>
}

const STOPWORDS = new Set([
  'about', 'after', 'again', 'against', 'almost', 'also', 'among', 'around', 'because',
  'been', 'before', 'being', 'between', 'could', 'every', 'from', 'have', 'having', 'into',
  'itself', 'just', 'more', 'most', 'need', 'other', 'over', 'same', 'should', 'such',
  'than', 'that', 'their', 'there', 'these', 'they', 'this', 'through', 'under', 'very',
  'were', 'what', 'when', 'where', 'which', 'while', 'with', 'would', 'your'
])

const extractedPdfCache = new Map<string, Promise<ExtractedPdfDocument>>()

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
    difficulty: question.difficulty,
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
    difficulty: question.difficulty,
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

function normalizePdfText(value: string): string {
  return normalizeWhitespace(
    value
      .replace(/\u2013|\u2014|\u2212/g, '-')
      .replace(/每/g, '-')
      .replace(/＊/g, "'")
      .replace(/([A-Za-z])\uFFFD+\s*s\b/g, "$1's")
      .replace(/\uFFFD+/g, '')
      .replace(/[※§]/g, '')
  )
}

function cleanPdfLine(value: string): string {
  return normalizePdfText(value)
}

function inferQuestionType(
  instructions: string,
  sectionText: string,
  optionKeys: string[],
  textInputCount: number
): string {
  const source = `${instructions}\n${sectionText}`.toLowerCase()
  const hasRomanOptions = optionKeys.length > 0 && optionKeys.every((value) => /^[ivxlcdm]+$/i.test(value))
  const hasLetterOptions = optionKeys.some((value) => /^[a-z]$/i.test(value))

  if (source.includes('choose the correct heading') || source.includes('list of headings') || hasRomanOptions) {
    return 'heading_matching'
  }

  if (source.includes('which paragraph contains')) {
    return 'paragraph_matching'
  }

  if (source.includes('true false not given')) {
    return 'true_false_not_given'
  }

  if (source.includes('yes no not given')) {
    return 'yes_no_not_given'
  }

  if (source.includes('match each') || source.includes('look at the following') || source.includes('list of ideas')) {
    return 'matching'
  }

  if (source.includes('choose two letters') || source.includes('choose three letters') || source.includes('select two')) {
    return 'multiple_select'
  }

  if (source.includes('choose the correct letter') || hasLetterOptions) {
    return 'multiple_choice'
  }

  if (textInputCount > 0 || /complete|fill/i.test(source)) {
    return 'sentence_completion'
  }

  return 'unknown'
}

function resolvePdfSourcePath(question: QuestionIndexEntry): { absolutePath: string; sourcePath: string } {
  if (!question.pdfPath) {
    throw new Error(`Question ${question.id} does not have a pdfPath.`)
  }

  const sourcePath = question.pdfPath
  const absolutePath = sourcePath.startsWith('/')
    ? resolve(publicRoot, `.${sourcePath}`)
    : resolve(publicRoot, sourcePath)

  return { absolutePath, sourcePath }
}

async function extractPdfDocument(question: QuestionIndexEntry): Promise<ExtractedPdfDocument> {
  const { absolutePath } = resolvePdfSourcePath(question)
  const cached = extractedPdfCache.get(absolutePath)

  if (cached) {
    return cached
  }

  const pending = execFileAsync(process.env.PYTHON_BIN ?? 'python', [pythonScriptPath, absolutePath], {
    maxBuffer: 32 * 1024 * 1024
  }).then(({ stdout }) => JSON.parse(stdout) as ExtractedPdfDocument)

  extractedPdfCache.set(absolutePath, pending)
  return pending
}

function isQuestionHeaderLine(line: string): boolean {
  return /^Questions?\s+\d+/i.test(line)
}

function isOptionListHeader(line: string): boolean {
  return /^List of /i.test(line)
}

function isTableHeaderLine(line: string): boolean {
  return ['题号', '答案', '关键定位句', '解析', '段落', '正确标题'].some((value) => line.includes(value))
}

function expandQuestionNumbers(header: string): string[] {
  const normalized = normalizePdfText(header)
  const numbers = normalized.match(/\d{1,3}/g)?.map((value) => Number(value)) ?? []

  if (numbers.length === 0) {
    return []
  }

  if (numbers.length === 2) {
    const [start, end] = numbers
    if (/[-–]/.test(normalized) && end >= start) {
      return Array.from({ length: end - start + 1 }, (_, index) => String(start + index))
    }

    if (/\band\b/i.test(normalized)) {
      return numbers.map((value) => String(value))
    }
  }

  return uniqueValues(numbers.map((value) => String(value)))
}

function splitPageLines(page: ExtractedPdfPage): { passageLines: string[]; questionLines: string[] } {
  const lines = page.lines.map(cleanPdfLine).filter(Boolean)
  const firstQuestionIndex = lines.findIndex((line) => isQuestionHeaderLine(line))

  if (firstQuestionIndex === -1) {
    return { passageLines: lines, questionLines: [] }
  }

  return {
    passageLines: lines.slice(0, firstQuestionIndex),
    questionLines: lines.slice(firstQuestionIndex)
  }
}

function sanitizePassageLines(question: QuestionIndexEntry, lines: string[]): string[] {
  return lines.filter((line) => {
    if (!line) {
      return false
    }

    if (/^READING PASSAGE \d+/i.test(line)) {
      return false
    }

    if (/^You should spend about/i.test(line)) {
      return false
    }

    if (line === question.title) {
      return false
    }

    return true
  })
}

function extractPassageChunks(
  question: QuestionIndexEntry,
  sourcePath: string,
  pages: ExtractedPdfPage[]
): RagChunk[] {
  const passagePages = pages
    .filter((page) => page.kind === 'text')
    .map((page) => {
      const split = splitPageLines(page)
      return {
        pageNumber: page.pageNumber,
        text: compactMultiline(sanitizePassageLines(question, split.passageLines).join('\n'))
      }
    })
    .filter((page) => Boolean(page.text))

  const combinedText = passagePages.map((page) => page.text).join('\n')
  const chunks: RagChunk[] = []
  const paragraphPattern = /(?:^|\n)([A-H])\s+([\s\S]*?)(?=\n[A-H]\s+|\Z)/g
  let match: RegExpExecArray | null

  while ((match = paragraphPattern.exec(combinedText)) !== null) {
    const label = cleanPdfLine(match[1]).toUpperCase()
    const content = compactMultiline(match[2])

    if (!label || !content) {
      continue
    }

    chunks.push(
      buildChunk(
        question,
        sourcePath,
        'passage_paragraph',
        false,
        label,
        `Paragraph ${label}\n${content}`,
        [],
        [label]
      )
    )
  }

  if (chunks.length > 0) {
    return chunks
  }

  return passagePages.map((page) =>
    buildChunk(
      question,
      sourcePath,
      'passage_paragraph',
      false,
      `page-${page.pageNumber}`,
      `Passage excerpt from page ${page.pageNumber}\n${page.text}`
    )
  )
}

function extractOptionMap(lines: string[]): Map<string, string> {
  const optionMap = new Map<string, string>()
  let currentKey: string | null = null
  let collecting = false

  for (const line of lines) {
    if (isOptionListHeader(line)) {
      collecting = true
      currentKey = null
      continue
    }

    const match = line.match(/^([A-Z]|[ivxlcdm]+)\s+(.+)$/i)
    if (match) {
      collecting = true
      currentKey = match[1]
      optionMap.set(currentKey, cleanPdfLine(match[2]))
      continue
    }

    if (!collecting || !currentKey) {
      continue
    }

    if (isQuestionHeaderLine(line) || /^\d{1,3}\s+/.test(line)) {
      currentKey = null
      continue
    }

    optionMap.set(currentKey, compactMultiline(`${optionMap.get(currentKey) ?? ''}\n${line}`))
  }

  return optionMap
}

function parseQuestionSections(pages: ExtractedPdfPage[]): PdfQuestionSection[] {
  const questionLines = pages
    .filter((page) => page.kind === 'text')
    .flatMap((page) => splitPageLines(page).questionLines.map(cleanPdfLine))
    .filter(Boolean)

  const sections: PdfQuestionSection[] = []
  let currentHeader = ''
  let currentLines: string[] = []

  const flushSection = () => {
    if (!currentHeader) {
      return
    }

    const sectionQuestionNumbers = expandQuestionNumbers(currentHeader)
    if (sectionQuestionNumbers.length === 0) {
      currentHeader = ''
      currentLines = []
      return
    }

    const optionMap = extractOptionMap(currentLines)
    const firstQuestionIndex = currentLines.findIndex((line) => {
      const match = line.match(/^(\d{1,3})\s+(.+)$/)
      return Boolean(match && sectionQuestionNumbers.includes(match[1]))
    })
    const optionListIndex = currentLines.findIndex((line) => isOptionListHeader(line))
    const promptByQuestion = new Map<string, string>()
    let sharedInstructions = ''

    if (firstQuestionIndex !== -1) {
      sharedInstructions = compactMultiline(currentLines.slice(0, firstQuestionIndex).join('\n'))
      const bodyEnd = optionListIndex !== -1 && optionListIndex > firstQuestionIndex
        ? optionListIndex
        : currentLines.length
      const bodyLines = currentLines.slice(firstQuestionIndex, bodyEnd)
      let currentQuestionNumber = ''
      let currentPromptLines: string[] = []

      const pushPrompt = () => {
        if (!currentQuestionNumber || currentPromptLines.length === 0) {
          return
        }

        promptByQuestion.set(currentQuestionNumber, compactMultiline(currentPromptLines.join('\n')))
      }

      for (const line of bodyLines) {
        const match = line.match(/^(\d{1,3})\s+(.+)$/)
        if (match && sectionQuestionNumbers.includes(match[1])) {
          pushPrompt()
          currentQuestionNumber = match[1]
          currentPromptLines = [match[2]]
          continue
        }

        if (!currentQuestionNumber) {
          continue
        }

        currentPromptLines.push(line)
      }

      pushPrompt()
    } else {
      const stemLines = optionListIndex === -1 ? currentLines : currentLines.slice(0, optionListIndex)
      sharedInstructions = compactMultiline(stemLines.join('\n'))
      for (const questionNumber of sectionQuestionNumbers) {
        promptByQuestion.set(questionNumber, sharedInstructions)
      }
    }

    sections.push({
      header: currentHeader,
      questionNumbers: sectionQuestionNumbers,
      sharedInstructions,
      promptByQuestion,
      optionMap
    })

    currentHeader = ''
    currentLines = []
  }

  for (const line of questionLines) {
    if (isQuestionHeaderLine(line)) {
      flushSection()
      currentHeader = line
      currentLines = []
      continue
    }

    if (!currentHeader) {
      continue
    }

    currentLines.push(line)
  }

  flushSection()
  return sections
}

function buildQuestionChunks(
  question: QuestionIndexEntry,
  sourcePath: string,
  sections: PdfQuestionSection[]
): { chunks: RagChunk[]; details: Map<string, QuestionChunkDetail> } {
  const chunks: RagChunk[] = []
  const details = new Map<string, QuestionChunkDetail>()

  for (const section of sections) {
    for (const questionNumber of section.questionNumbers) {
      const prompt = section.promptByQuestion.get(questionNumber) ?? section.sharedInstructions
      if (!prompt) {
        continue
      }

      const questionType = inferQuestionType(
        section.sharedInstructions,
        prompt,
        Array.from(section.optionMap.keys()),
        0
      )

      const optionText = Array.from(section.optionMap.entries())
        .map(([key, value]) => `${key} ${value}`)
        .join(' | ')

      const content = [
        `Question ${questionNumber}`,
        `Section: ${section.header}`,
        section.sharedInstructions ? `Shared instructions:\n${section.sharedInstructions}` : '',
        prompt ? `Prompt:\n${prompt}` : '',
        optionText ? `Options: ${optionText}` : '',
        `Question type: ${questionType}`
      ]
        .filter(Boolean)
        .join('\n')

      const chunk = buildChunk(
        question,
        sourcePath,
        'question_item',
        false,
        questionNumber,
        content,
        [questionNumber],
        [],
        questionType
      )

      chunks.push(chunk)
      details.set(questionNumber, { chunk, optionMap: section.optionMap })
    }
  }

  return { chunks, details }
}

function tokenizeForMatch(value: string): string[] {
  const tokens = normalizePdfText(value)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 2 && !STOPWORDS.has(token))

  return uniqueValues(tokens)
}

function scoreOptionMatch(rowText: string, optionValue: string): number {
  const normalizedRow = normalizePdfText(rowText).toLowerCase()
  const normalizedOption = normalizePdfText(optionValue).toLowerCase()
  const compactRow = normalizedRow.replace(/[^a-z0-9]/g, '')
  const compactOption = normalizedOption.replace(/[^a-z0-9]/g, '')
  let score = 0

  if (!normalizedOption) {
    return score
  }

  if (normalizedRow.includes(normalizedOption)) {
    score += 8
  }

  if (compactOption.length > 6 && compactRow.includes(compactOption)) {
    score += 6
  }

  const optionTokens = tokenizeForMatch(normalizedOption)
  const rowTokens = new Set(tokenizeForMatch(normalizedRow))

  for (const token of optionTokens) {
    if (rowTokens.has(token)) {
      score += 1
    }
  }

  for (let index = 0; index < optionTokens.length - 1; index += 1) {
    const tokenPair = `${optionTokens[index]}${optionTokens[index + 1]}`
    if (tokenPair.length > 6 && compactRow.includes(tokenPair)) {
      score += 2
    }
  }

  return score
}

function inferAnswerFromRow(rowLines: string[], detail: QuestionChunkDetail | undefined): string {
  const nonEmptyLines = rowLines.map(cleanPdfLine).filter(Boolean)
  if (nonEmptyLines.length === 0) {
    return 'Unavailable from PDF OCR'
  }

  const rowText = nonEmptyLines.join('\n')
  let bestKey = ''
  let bestValue = ''
  let bestScore = 0

  if (detail && detail.optionMap.size > 0) {
    for (const [key, value] of detail.optionMap.entries()) {
      const score = scoreOptionMatch(rowText, value)
      if (score > bestScore) {
        bestScore = score
        bestKey = key
        bestValue = value
      }
    }
  }

  if (bestScore >= 2 && bestKey) {
    return `${bestKey} - ${bestValue}`
  }

  for (const line of nonEmptyLines.slice(0, 3)) {
    const romanMatch = line.match(/^([ivxlcdm]+)\s*-\s*(.+)$/i)
    if (romanMatch) {
      return `${romanMatch[1].toLowerCase()} - ${romanMatch[2]}`
    }

    const letterMatch = line.match(/^([A-Z])(?:\s*-\s*(.+))?$/)
    if (letterMatch) {
      const optionValue = detail?.optionMap.get(letterMatch[1])
      return optionValue ? `${letterMatch[1]} - ${optionValue}` : letterMatch[1]
    }
  }

  if (!detail || detail.optionMap.size === 0) {
    return nonEmptyLines[0]
  }

  const optionKeys = new Set(Array.from(detail.optionMap.keys()))
  const explicitLetterMatches = Array.from(rowText.matchAll(/\b([A-Z])\b/g))
    .map((match) => match[1])
    .filter((value) => optionKeys.has(value))

  if (explicitLetterMatches.length > 0) {
    const optionValue = detail.optionMap.get(explicitLetterMatches[0])
    return optionValue ? `${explicitLetterMatches[0]} - ${optionValue}` : explicitLetterMatches[0]
  }

  return nonEmptyLines[0]
}

function sanitizeOcrExplanationLines(rowLines: string[]): string[] {
  return rowLines
    .map((line) => cleanPdfLine(line))
    .map((line) => {
      const asciiCount = Array.from(line).filter((character) => character.charCodeAt(0) <= 127).length
      const nonAsciiCount = Math.max(0, line.length - asciiCount)

      if (nonAsciiCount === 0) {
        return line
      }

      if (asciiCount === 0) {
        return ''
      }

      const englishSegments = line.match(/[A-Za-z0-9"'().,:;!?/\-\s]{8,}/g)
      if (!englishSegments || englishSegments.length === 0) {
        return ''
      }

      return normalizeWhitespace(englishSegments.join(' '))
    })
    .filter(Boolean)
}

function createRowChunks(
  question: QuestionIndexEntry,
  sourcePath: string,
  questionNumber: string,
  rowLines: string[],
  detail: QuestionChunkDetail | undefined
): { answerKey: RagChunk; answerExplanation: RagChunk } {
  const rowText = compactMultiline(sanitizeOcrExplanationLines(rowLines).join('\n'))
  const answer = inferAnswerFromRow(rowLines, detail)

  return {
    answerKey: buildChunk(
      question,
      sourcePath,
      'answer_key',
      true,
      questionNumber,
      `Question ${questionNumber}\nCorrect answer: ${answer}`,
      [questionNumber]
    ),
    answerExplanation: buildChunk(
      question,
      sourcePath,
      'answer_explanation',
      true,
      questionNumber,
      `Question ${questionNumber}\nCorrect answer: ${answer}\nExplanation:\n${rowText}`,
      [questionNumber]
    )
  }
}

function parseAnswerRowsForSection(
  question: QuestionIndexEntry,
  sourcePath: string,
  sectionHeader: string,
  sectionLines: string[],
  detailMap: Map<string, QuestionChunkDetail>
): { answerKeys: RagChunk[]; answerExplanations: RagChunk[] } {
  const questionNumbers = expandQuestionNumbers(sectionHeader)
  if (questionNumbers.length === 0) {
    return { answerKeys: [], answerExplanations: [] }
  }

  const firstDetail = detailMap.get(questionNumbers[0])
  const questionType = firstDetail?.chunk.metadata.questionType
  const contentLines = sectionLines.filter((line) => !isTableHeaderLine(line))

  const explicitStarts = contentLines
    .map((line, index) => {
      const match = line.match(/^(\d{1,3})\b[\s.:：-]*(.*)$/)
      if (!match || !questionNumbers.includes(match[1])) {
        return null
      }

      return {
        index,
        questionNumber: match[1],
        leadingText: cleanPdfLine(match[2])
      }
    })
    .filter((entry): entry is { index: number; questionNumber: string; leadingText: string } => entry !== null)

  const rows: Array<{ questionNumber: string; lines: string[] }> = []

  if (explicitStarts.length > 0) {
    const leadingQuestionNumbers = questionNumbers.filter(
      (value) => Number(value) < Number(explicitStarts[0].questionNumber)
    )
    const leadingLines = contentLines.slice(0, explicitStarts[0].index)

    if (leadingQuestionNumbers.length === 1 && leadingLines.length > 0) {
      rows.push({
        questionNumber: leadingQuestionNumbers[0],
        lines: leadingLines
      })
    }

    for (let index = 0; index < explicitStarts.length; index += 1) {
      const current = explicitStarts[index]
      const next = explicitStarts[index + 1]
      rows.push({
        questionNumber: current.questionNumber,
        lines: [
          ...(current.leadingText ? [current.leadingText] : []),
          ...contentLines.slice(current.index + 1, next?.index ?? contentLines.length)
        ]
      })
    }
  } else if (questionType === 'heading_matching') {
    const answerLineIndexes = contentLines
      .map((line, index) => ({ line, index }))
      .filter(({ line }) => /^([ivxlcdm]+)\s*-\s*/i.test(line))

    for (let index = 0; index < answerLineIndexes.length; index += 1) {
      const current = answerLineIndexes[index]
      const next = answerLineIndexes[index + 1]
      rows.push({
        questionNumber: questionNumbers[index] ?? questionNumbers[questionNumbers.length - 1],
        lines: contentLines.slice(current.index, next?.index ?? contentLines.length)
      })
    }
  }

  if (rows.length === 0) {
    return { answerKeys: [], answerExplanations: [] }
  }

  const answerKeys: RagChunk[] = []
  const answerExplanations: RagChunk[] = []

  for (const row of rows) {
    const chunks = createRowChunks(question, sourcePath, row.questionNumber, row.lines, detailMap.get(row.questionNumber))
    answerKeys.push(chunks.answerKey)
    answerExplanations.push(chunks.answerExplanation)
  }

  return { answerKeys, answerExplanations }
}

function extractAnswerChunks(
  question: QuestionIndexEntry,
  sourcePath: string,
  pages: ExtractedPdfPage[],
  detailMap: Map<string, QuestionChunkDetail>
): { answerKeyChunks: RagChunk[]; answerExplanationChunks: RagChunk[] } {
  const answerKeyChunks: RagChunk[] = []
  const answerExplanationChunks: RagChunk[] = []

  for (const page of pages.filter((entry) => entry.kind === 'ocr')) {
    const headers = page.lines
      .map((line, index) => ({ line: cleanPdfLine(line), index }))
      .filter(({ line }) => /^(?:Q|Questions)\s*\d+/i.test(line))

    for (let index = 0; index < headers.length; index += 1) {
      const current = headers[index]
      const next = headers[index + 1]
      const bodyLines = page.lines.slice(current.index + 1, next?.index ?? page.lines.length).map(cleanPdfLine).filter(Boolean)
      const chunks = parseAnswerRowsForSection(question, sourcePath, current.line, bodyLines, detailMap)
      answerKeyChunks.push(...chunks.answerKeys)
      answerExplanationChunks.push(...chunks.answerExplanations)
    }
  }

  return {
    answerKeyChunks: uniqueValues(answerKeyChunks),
    answerExplanationChunks: uniqueValues(answerExplanationChunks)
  }
}

function extractKeywords(question: QuestionIndexEntry, passageChunks: RagChunk[], questionChunks: RagChunk[]): string[] {
  const source = [
    question.title,
    ...passageChunks.slice(0, 4).map((chunk) => chunk.content),
    ...questionChunks.map((chunk) => chunk.content)
  ].join(' ')

  const scores = new Map<string, number>()
  const matches = source.match(/[A-Za-z][A-Za-z'-]{2,}/g) ?? []

  for (const rawWord of matches) {
    const word = rawWord.toLowerCase()
    if (STOPWORDS.has(word)) {
      continue
    }

    scores.set(word, (scores.get(word) ?? 0) + 1)
  }

  return Array.from(scores.entries())
    .sort((left, right) => right[1] - left[1])
    .slice(0, 10)
    .map(([word]) => word)
}

function buildSummaryDoc(
  question: QuestionIndexEntry,
  sourcePath: string,
  passageChunks: RagChunk[],
  questionChunks: RagChunk[]
): QuestionSummaryDoc {
  const topicSummary = passageChunks
    .slice(0, 3)
    .map((chunk) => chunk.content)
    .join(' ')

  const questionTypes = uniqueValues(
    questionChunks
      .map((chunk) => chunk.metadata.questionType)
      .filter((value): value is string => Boolean(value))
  )

  const keywords = extractKeywords(question, passageChunks, questionChunks)

  const content = compactMultiline([
    `Title: ${question.title}`,
    `Category: ${question.category}`,
    `Difficulty: ${question.difficulty}`,
    questionTypes.length > 0 ? `Question types: ${questionTypes.join(', ')}` : '',
    keywords.length > 0 ? `Keywords: ${keywords.join(', ')}` : '',
    topicSummary ? `Topic summary: ${topicSummary}` : ''
  ].filter(Boolean).join('\n'))

  return {
    id: `${question.id}:summary`,
    questionId: question.id,
    title: question.title,
    category: question.category,
    difficulty: question.difficulty,
    topicSummary,
    keywords,
    questionTypes,
    content,
    sourcePath,
    metadata: {
      questionId: question.id,
      title: question.title,
      category: question.category,
      difficulty: question.difficulty,
      sourcePath,
      keywords,
      questionTypes
    }
  }
}

export async function parseQuestionPdf(question: QuestionIndexEntry): Promise<ParsedQuestionDocument> {
  const extraction = await extractPdfDocument(question)
  const { sourcePath } = resolvePdfSourcePath(question)

  const passageChunks = extractPassageChunks(question, sourcePath, extraction.pages)
  const sections = parseQuestionSections(extraction.pages)
  const { chunks: questionChunks, details } = buildQuestionChunks(question, sourcePath, sections)
  const { answerKeyChunks, answerExplanationChunks } = extractAnswerChunks(question, sourcePath, extraction.pages, details)
  const summary = buildSummaryDoc(question, sourcePath, passageChunks, questionChunks)

  const baseDocument = {
    question,
    sourcePath,
    passageChunks,
    questionChunks,
    answerKeyChunks,
    answerExplanationChunks,
    summary,
    allChunks: [...passageChunks, ...questionChunks, ...answerKeyChunks, ...answerExplanationChunks]
  }

  return {
    ...baseDocument,
    qualityReport: buildQualityReport(baseDocument)
  }
}
