import type { ParsedQuestionDocument, QuestionQualityIssue, QuestionQualityReport } from '../../types/question-bank.js'

export function buildQualityReport(document: Omit<ParsedQuestionDocument, 'qualityReport'>): QuestionQualityReport {
  const issues: QuestionQualityIssue[] = []

  if (document.passageChunks.length === 0) {
    issues.push({ level: 'error', message: 'No passage paragraphs were extracted.' })
  }

  if (document.questionChunks.length === 0) {
    issues.push({ level: 'error', message: 'No question items were extracted.' })
  }

  if (document.answerKeyChunks.length === 0) {
    issues.push({ level: 'warning', message: 'No answer keys were extracted from the inline script.' })
  }

  if (document.answerExplanationChunks.length === 0) {
    issues.push({ level: 'warning', message: 'No answer explanations were extracted.' })
  }

  const questionNumbers = new Set(
    document.questionChunks.flatMap((chunk) => chunk.questionNumbers)
  )

  for (const questionNumber of questionNumbers) {
    const hasAnswerKey = document.answerKeyChunks.some((chunk) => chunk.questionNumbers.includes(questionNumber))
    if (!hasAnswerKey) {
      issues.push({
        level: 'warning',
        message: `Missing answer key for question ${questionNumber}.`
      })
    }

    const hasExplanation = document.answerExplanationChunks.some((chunk) => chunk.questionNumbers.includes(questionNumber))
    if (!hasExplanation) {
      issues.push({
        level: 'warning',
        message: `Missing answer explanation for question ${questionNumber}.`
      })
    }
  }

  return {
    questionId: document.question.id,
    issues
  }
}
