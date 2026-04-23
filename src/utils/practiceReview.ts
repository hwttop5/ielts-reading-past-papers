import type { PracticeRecord } from '@/store/practiceStore'

export function canReviewPracticeRecord(record: PracticeRecord | null | undefined): boolean {
  return Boolean(record?.id && (record?.resultSnapshot?.metadata?.examId || record?.questionId) && record?.resultSnapshot)
}

export function buildPracticeReviewRoute(record: PracticeRecord) {
  return {
    path: '/practice-mode',
    query: {
      id: record.resultSnapshot?.metadata?.examId || record.questionId,
      mode: 'review',
      recordId: record.id
    }
  }
}
