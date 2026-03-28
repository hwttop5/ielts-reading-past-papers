import type { ParsedQuestionDocument, QuestionIndexEntry, QuestionSummaryDoc, RagChunk } from '../../types/question-bank.js'
import { buildQualityReport } from './qualityCheck.js'
import { parseQuestionDocument as parseQuestionHtmlDocument } from './parseQuestionHtml.js'
import { parseQuestionPdf } from './parseQuestionPdf.js'

export async function parseQuestionDocument(question: QuestionIndexEntry): Promise<ParsedQuestionDocument> {
  if (question.pdfPath) {
    try {
      const [pdfDocument, htmlDocument] = await Promise.all([
        parseQuestionPdf(question),
        parseQuestionHtmlFallback(question).catch(() => null)
      ])

      return htmlDocument ? mergeParsedDocuments(question, pdfDocument, htmlDocument) : pdfDocument
    } catch {
      return parseQuestionHtmlFallback(question)
    }
  }

  return parseQuestionHtmlFallback(question)
}

async function parseQuestionHtmlFallback(question: QuestionIndexEntry): Promise<ParsedQuestionDocument> {
  return parseQuestionHtmlDocument(question)
}

function getQuestionChunkKey(chunk: RagChunk): string {
  return chunk.questionNumbers.length > 0 ? chunk.questionNumbers.join(',') : chunk.id
}

function toNumericQuestionNumber(value: string): number {
  const match = value.match(/\d{1,3}/)
  return match ? Number(match[0]) : Number.MAX_SAFE_INTEGER
}

function scoreChunk(chunk: RagChunk): number {
  let score = chunk.content.length

  if (chunk.chunkType === 'question_item' && chunk.metadata.questionType) {
    score += 40
  }

  if (chunk.chunkType === 'answer_explanation') {
    if (/Explanation:/i.test(chunk.content)) {
      score += 80
    }

    if (/Evidence:/i.test(chunk.content) || /原文[:：]/.test(chunk.content)) {
      score += 120
    }

    if (chunk.paragraphLabels.length > 0) {
      score += 20
    }
  }

  return score
}

function chooseBetterChunk(left: RagChunk, right: RagChunk): RagChunk {
  return scoreChunk(right) > scoreChunk(left) ? right : left
}

function mergeChunkSetByKey(
  preferred: RagChunk[],
  fallback: RagChunk[],
  getKey: (chunk: RagChunk) => string
): RagChunk[] {
  const merged = new Map<string, RagChunk>()

  for (const chunk of preferred) {
    merged.set(getKey(chunk), chunk)
  }

  for (const chunk of fallback) {
    const key = getKey(chunk)
    const existing = merged.get(key)
    merged.set(key, existing ? chooseBetterChunk(existing, chunk) : chunk)
  }

  return Array.from(merged.values()).sort((left, right) => {
    const leftNumber = toNumericQuestionNumber(left.questionNumbers[0] ?? '')
    const rightNumber = toNumericQuestionNumber(right.questionNumbers[0] ?? '')
    if (leftNumber !== rightNumber) {
      return leftNumber - rightNumber
    }

    return getKey(left).localeCompare(getKey(right))
  })
}

function scoreChunkSet(chunks: RagChunk[]): number {
  const paragraphCoverage = new Set(chunks.flatMap((chunk) => chunk.paragraphLabels)).size
  const questionCoverage = new Set(chunks.flatMap((chunk) => chunk.questionNumbers)).size
  const contentLength = chunks.reduce((total, chunk) => total + chunk.content.length, 0)

  return paragraphCoverage * 300 + questionCoverage * 200 + chunks.length * 20 + contentLength
}

function chooseBetterChunkSet(left: RagChunk[], right: RagChunk[]): RagChunk[] {
  return scoreChunkSet(right) > scoreChunkSet(left) ? right : left
}

function chooseBetterSummary(left: QuestionSummaryDoc, right: QuestionSummaryDoc): QuestionSummaryDoc {
  const leftScore = left.questionTypes.length * 40 + left.keywords.length * 10 + left.content.length
  const rightScore = right.questionTypes.length * 40 + right.keywords.length * 10 + right.content.length
  return rightScore > leftScore ? right : left
}

function mergeParsedDocuments(
  question: QuestionIndexEntry,
  pdfDocument: ParsedQuestionDocument,
  htmlDocument: ParsedQuestionDocument
): ParsedQuestionDocument {
  const passageChunks = chooseBetterChunkSet(pdfDocument.passageChunks, htmlDocument.passageChunks)
  const questionChunks = mergeChunkSetByKey(pdfDocument.questionChunks, htmlDocument.questionChunks, getQuestionChunkKey)
  const answerKeyChunks = mergeChunkSetByKey(htmlDocument.answerKeyChunks, pdfDocument.answerKeyChunks, getQuestionChunkKey)
  const answerExplanationChunks = mergeChunkSetByKey(
    htmlDocument.answerExplanationChunks,
    pdfDocument.answerExplanationChunks,
    getQuestionChunkKey
  )
  const summary = chooseBetterSummary(pdfDocument.summary, htmlDocument.summary)

  const baseDocument = {
    question,
    sourcePath: pdfDocument.sourcePath,
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
