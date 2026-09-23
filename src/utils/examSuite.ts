import questionIndex from './questionIndex.json'
import { getReadingNativeManifest, loadReadingExamDocument } from './readingPractice'
import type { ReadingNativeManifestEntry } from '@/types/readingNative'
import type { ExamSuiteAttempt, ExamSuitePassageResult, PreparedExamSuite, SuitePassages } from '@/types/examSuite'

const availableIds = new Set(questionIndex.filter((entry) => entry.launchMode === 'unified').map((entry) => entry.id))
const categories = ['P1', 'P2', 'P3'] as const
const counts = [13, 13, 14] as const
const starts = [1, 14, 27] as const
export class ExamSuiteValidationError extends Error {}

export function getSuiteCandidates(): Record<typeof categories[number], ReadingNativeManifestEntry[]> {
  const entries = Object.values(getReadingNativeManifest().exams)
  return Object.fromEntries(categories.map((category, index) => [category, entries
    .filter((entry) => availableIds.has(entry.examId) && entry.category === category && entry.totalQuestions === counts[index])
    .sort((a, b) => a.title.localeCompare(b.title) || a.examId.localeCompare(b.examId))])) as Record<typeof categories[number], ReadingNativeManifestEntry[]>
}

export function validateSuiteIds(ids: readonly string[]): string | null {
  if (ids.length !== 3 || new Set(ids).size !== 3) return '请选择三篇不同的文章。'
  const manifest = getReadingNativeManifest().exams
  for (let index = 0; index < 3; index += 1) {
    const entry = manifest[ids[index]]
    if (!entry || !availableIds.has(ids[index]) || entry.category !== categories[index] || entry.totalQuestions !== counts[index]) {
      return `Part ${index + 1} 必须选择包含 ${counts[index]} 道题的 ${categories[index]} 文章。`
    }
  }
  return null
}

export async function prepareSuite(ids: readonly string[]): Promise<PreparedExamSuite> {
  const error = validateSuiteIds(ids)
  if (error) throw new ExamSuiteValidationError(error)
  const documents = await Promise.all(ids.map(loadReadingExamDocument))
  documents.forEach((document, index) => {
    const expectedCount = counts[index]
    const items = document?.questionItems || []
    const valid = document && document.examId === ids[index] && document.meta.category === categories[index]
      && document.totalQuestions === expectedCount && document.questionOrder.length === expectedCount
      && new Set(document.questionOrder).size === expectedCount && items.length === expectedCount
      && new Set(items.map((item) => item.questionId)).size === expectedCount
      && document.questionOrder.every((questionId, offset) => {
        const expected = String(starts[index] + offset)
        const item = items.find((candidate) => candidate.questionId === questionId)
        return item?.displayNumber === expected && document.questionDisplayMap[questionId] === expected
      })
    if (!valid) throw new ExamSuiteValidationError(`Part ${index + 1} 的题目编号不符合完整模考范围，请换一篇文章。`)
  })
  return { ids: [...ids] as SuitePassages<string>, passages: documents as PreparedExamSuite['passages'], totalQuestions: 40, durationSeconds: 3600 }
}

export function buildSuiteAttempt(input: {
  attemptId: string
  passages: SuitePassages<ExamSuitePassageResult>
  durationSeconds: number
  completedAt?: string
}): ExamSuiteAttempt {
  if (!input.attemptId || input.passages.length !== 3 || new Set(input.passages.map((p) => p.id)).size !== 3) {
    throw new ExamSuiteValidationError('完整模考记录必须包含三篇不同文章。')
  }
  input.passages.forEach((passage, index) => {
    const score = passage.result.scoreInfo
    if (passage.result.metadata.examId !== passage.id || score.totalQuestions !== counts[index]
      || !Number.isInteger(score.correct) || score.correct < 0 || score.correct > counts[index]) {
      throw new ExamSuiteValidationError('分篇成绩与完整模考题量不匹配。')
    }
  })
  if (!Number.isFinite(input.durationSeconds) || input.durationSeconds < 0) throw new ExamSuiteValidationError('考试时长无效。')
  const completedAt = input.completedAt || new Date().toISOString()
  if (!Number.isFinite(Date.parse(completedAt))) throw new ExamSuiteValidationError('完成日期无效。')
  const correct = input.passages.reduce((sum, passage) => sum + passage.result.scoreInfo.correct, 0)
  return JSON.parse(JSON.stringify({ version: 1, ...input, completedAt, correct, totalQuestions: 40, accuracy: correct / 40 * 100 })) as ExamSuiteAttempt
}
