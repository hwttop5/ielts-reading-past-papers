import { ref } from 'vue'
import type { ExamSuiteAttempt } from '@/types/examSuite'
import { buildSuiteAttempt } from '@/utils/examSuite'

export const EXAM_SUITE_HISTORY_KEY = 'ielts_exam_suite_history_v1'

/** Completed suites only. Passage drafts remain owned by their individual sessions. */
export function useExamSuiteAttempt() {
  const history = ref<ExamSuiteAttempt[]>([])
  const storageError = ref<string | null>(null)
  const read = (): ExamSuiteAttempt[] => {
    const raw = localStorage.getItem(EXAM_SUITE_HISTORY_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) throw new Error('Invalid suite history')
    return parsed.map((record) => {
      if (record?.version !== 1) throw new Error('Unsupported suite history')
      return buildSuiteAttempt(record)
    })
  }
  function reload(): boolean {
    try {
      history.value = read()
      storageError.value = null
      return true
    } catch {
      storageError.value = '无法读取本机模考记录。当前成绩仍保留在页面中。'
      return false
    }
  }
  function save(record: ExamSuiteAttempt): boolean {
    // Retain this result in memory even if quota/privacy settings prevent persistence.
    let validated: ExamSuiteAttempt
    try { validated = buildSuiteAttempt(record) } catch {
      storageError.value = '模考记录不完整，无法保存。'
      return false
    }
    const merge = (records: ExamSuiteAttempt[]) => [validated, ...records.filter((item) => item.attemptId !== validated.attemptId)]
      .sort((a, b) => Date.parse(b.completedAt) - Date.parse(a.completedAt)).slice(0, 50)
    history.value = merge(history.value)
    try {
      const next = merge(read())
      localStorage.setItem(EXAM_SUITE_HISTORY_KEY, JSON.stringify(next))
      history.value = next
      storageError.value = null
      return true
    } catch {
      storageError.value = '模考成绩尚未保存到本机，请保持页面打开并重试保存。'
      return false
    }
  }
  reload()
  return { history, storageError, reload, save, get: (attemptId: string) => history.value.find((item) => item.attemptId === attemptId) || null }
}
