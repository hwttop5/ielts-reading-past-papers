import { defineStore } from 'pinia'
import type {
  PracticeHighlightRecord,
  PracticeRouteMode,
  PracticeSessionResult
} from '@/types/readingNative'
import { normalizePracticeHighlightRecord } from '@/utils/practiceHighlights'
import { eventBus, PRACTICE_UPDATED, SYNC_LOCAL_CHANGED } from '@/utils/eventBus'
import { markPracticeRecordDeleted, markPracticeRecordsCleared, readSyncMetadata, touchPracticeSync } from '@/sync/localSyncMetadata'

export interface PracticeRecord {
  id: string
  questionId: string
  questionTitle: string
  category: string
  time: number
  duration: number
  correctAnswers: number
  totalQuestions: number
  accuracy: number
  score: number
  mode?: PracticeRouteMode
  markedQuestions?: string[]
  highlights?: PracticeHighlightRecord[]
  resultSnapshot?: PracticeSessionResult
}

export type PracticeRecordInput = Omit<PracticeRecord, 'id' | 'time'> & Partial<Pick<PracticeRecord, 'id' | 'time'>>

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function finiteNumber(value: unknown, fallback = 0): number {
  const next = Number(value)
  return Number.isFinite(next) ? next : fallback
}

function percentageValue(value: unknown): number {
  const next = finiteNumber(value, 0)
  return Math.min(100, Math.max(0, next))
}

function stringList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined
  }
  return value.map((entry) => stringValue(entry)).filter(Boolean)
}

function isPracticeMode(value: unknown): value is PracticeRouteMode {
  return value === 'single' || value === 'review' || value === 'simulation'
}

function highlightList(value: unknown): PracticeHighlightRecord[] | undefined {
  if (!Array.isArray(value)) {
    return undefined
  }
  const highlights = value
    .map((entry) => normalizePracticeHighlightRecord(entry))
    .filter((entry): entry is PracticeHighlightRecord => Boolean(entry))
  return highlights.length ? highlights : undefined
}

function resultSnapshot(value: unknown): PracticeSessionResult | undefined {
  if (!value || typeof value !== 'object') {
    return undefined
  }
  const snapshot = value as PracticeSessionResult
  if (!snapshot.metadata || typeof snapshot.metadata !== 'object') {
    return snapshot
  }
  return {
    ...snapshot,
    metadata: {
      ...snapshot.metadata,
      markedQuestions: stringList(snapshot.metadata.markedQuestions) || [],
      highlights: highlightList(snapshot.metadata.highlights) || []
    }
  }
}

export function normalizePracticeRecord(value: unknown): PracticeRecord | null {
  if (!value || typeof value !== 'object') {
    return null
  }

  const source = value as Record<string, unknown>
  const questionId = stringValue(source.questionId)
  if (!questionId) {
    return null
  }

  const now = Date.now()
  const time = finiteNumber(source.time, now)
  const record: PracticeRecord = {
    id: stringValue(source.id) || `${questionId}-${time}`,
    questionId,
    questionTitle: stringValue(source.questionTitle),
    category: stringValue(source.category),
    time,
    duration: Math.max(0, finiteNumber(source.duration, 0)),
    correctAnswers: Math.max(0, finiteNumber(source.correctAnswers, 0)),
    totalQuestions: Math.max(0, finiteNumber(source.totalQuestions, 0)),
    accuracy: percentageValue(source.accuracy),
    score: Math.max(0, finiteNumber(source.score, finiteNumber(source.correctAnswers, 0)))
  }

  if (isPracticeMode(source.mode)) {
    record.mode = source.mode
  }

  const markedQuestions = stringList(source.markedQuestions)
  if (markedQuestions) {
    record.markedQuestions = markedQuestions
  }

  const highlights = highlightList(source.highlights)
  if (highlights) {
    record.highlights = highlights
  }

  const snapshot = resultSnapshot(source.resultSnapshot)
  if (snapshot) {
    record.resultSnapshot = snapshot
  }

  return record
}

export function normalizePracticeRecords(value: unknown): PracticeRecord[] {
  if (!Array.isArray(value)) {
    return []
  }
  return value.map((entry) => normalizePracticeRecord(entry)).filter((entry): entry is PracticeRecord => Boolean(entry))
}

export const usePracticeStore = defineStore('practice', {
  state: () => ({
    records: [] as PracticeRecord[]
  }),

  getters: {
    totalCount: (state) => state.records.length,
    
    avgAccuracy: (state) => {
      if (state.records.length === 0) return 0
      const sum = state.records.reduce((a, b) => a + b.accuracy, 0)
      return Math.round(sum / state.records.length)
    },
    
    totalTime: (state) => {
      return state.records.reduce((a, b) => a + b.duration, 0)
    },
    
    totalQuestionsAnswered: (state) => {
      return state.records.reduce((a, b) => a + b.totalQuestions, 0)
    }
  },

  actions: {
    persistRecords(trackSync = true) {
      localStorage.setItem('ielts_practice', JSON.stringify(this.records))
      if (trackSync) {
        touchPracticeSync()
        eventBus.emit(PRACTICE_UPDATED, { records: this.records })
        eventBus.emit(SYNC_LOCAL_CHANGED, { scope: 'practice' })
      }
    },

    load() {
      const raw = localStorage.getItem('ielts_practice')
      if (!raw) {
        this.records = []
        return
      }

      try {
        this.records = normalizePracticeRecords(JSON.parse(raw))
        this.persistRecords(false)
      } catch {
        this.records = []
        localStorage.removeItem('ielts_practice')
      }
    },

    replaceFromSync(records: unknown[]) {
      this.records = normalizePracticeRecords(records).sort((left, right) => right.time - left.time)
      this.persistRecords(false)
    },

    getSyncState() {
      const meta = readSyncMetadata()
      return {
        records: normalizePracticeRecords(this.records),
        deletedRecordIds: meta.practice.deletedRecordIds,
        clearedAt: meta.practice.clearedAt,
        updatedAt: meta.practice.updatedAt
      }
    },

    add(record: PracticeRecordInput) {
      const now = Date.now()
      const normalized = normalizePracticeRecord({
        ...record,
        id: record.id || now.toString(),
        time: record.time || now
      })
      if (!normalized) {
        return
      }

      this.records.unshift(normalized)
      this.persistRecords()
    },

    clear() {
      this.records = []
      localStorage.removeItem('ielts_practice')
      markPracticeRecordsCleared()
      eventBus.emit(PRACTICE_UPDATED, { records: this.records })
      eventBus.emit(SYNC_LOCAL_CHANGED, { scope: 'practice' })
    },

    deleteRecord(id: string) {
      const index = this.records.findIndex(r => r.id === id)
      if (index > -1) {
        this.records.splice(index, 1)
        markPracticeRecordDeleted(id)
        this.persistRecords(false)
        eventBus.emit(PRACTICE_UPDATED, { records: this.records })
        eventBus.emit(SYNC_LOCAL_CHANGED, { scope: 'practice' })
      }
    }
  }
})
