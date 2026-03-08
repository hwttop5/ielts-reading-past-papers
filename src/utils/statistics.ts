import { PracticeRecord } from '../store/practiceStore'

export function calculateStatistics(records: PracticeRecord[]) {
  if (records.length === 0) {
    return {
      totalPractice: 0,
      avgAccuracy: 0,
      totalTime: 0,
      totalQuestions: 0,
      categoryStats: {}
    }
  }

  const totalPractice = records.length
  const avgAccuracy = Math.round(
    records.reduce((a, b) => a + b.accuracy, 0) / totalPractice
  )
  const totalTime = records.reduce((a, b) => a + b.duration, 0)
  const totalQuestions = records.reduce((a, b) => a + b.totalQuestions, 0)

  const categoryStats: Record<string, number> = {}
  records.forEach(record => {
    if (!categoryStats[record.category]) {
      categoryStats[record.category] = 0
    }
    categoryStats[record.category] += 1
  })

  return {
    totalPractice,
    avgAccuracy,
    totalTime,
    totalQuestions,
    categoryStats
  }
}

export function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
}

export function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}
