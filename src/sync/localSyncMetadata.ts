import type { AchievementSyncState, PracticeSyncState, SettingsSyncState } from '@/types/sync'

export const SYNC_META_STORAGE_KEY = 'ielts_sync_meta'

export interface SyncMetadata {
  revision: number | null
  lastSyncedAt: number | null
  practice: Pick<PracticeSyncState, 'deletedRecordIds' | 'clearedAt' | 'updatedAt'>
  achievements: Pick<AchievementSyncState, 'resetAt' | 'updatedAt'>
  settings: Pick<SettingsSyncState, 'updatedAt'>
}

export function createDefaultSyncMetadata(now = Date.now()): SyncMetadata {
  return {
    revision: null,
    lastSyncedAt: null,
    practice: {
      deletedRecordIds: [],
      clearedAt: null,
      updatedAt: now
    },
    achievements: {
      resetAt: null,
      updatedAt: now
    },
    settings: {
      updatedAt: 0
    }
  }
}

function finiteNumber(value: unknown, fallback: number): number {
  const next = Number(value)
  return Number.isFinite(next) ? next : fallback
}

function nullableNumber(value: unknown): number | null {
  const next = Number(value)
  return Number.isFinite(next) ? next : null
}

function uniqueStrings(values: unknown): string[] {
  if (!Array.isArray(values)) {
    return []
  }

  return Array.from(new Set(values.map((entry) => String(entry || '').trim()).filter(Boolean)))
}

export function readSyncMetadata(now = Date.now()): SyncMetadata {
  if (typeof localStorage === 'undefined') {
    return createDefaultSyncMetadata(now)
  }

  const raw = localStorage.getItem(SYNC_META_STORAGE_KEY)
  if (!raw) {
    return createDefaultSyncMetadata(now)
  }

  try {
    const parsed = JSON.parse(raw) as Partial<SyncMetadata>
    return {
      revision: nullableNumber(parsed.revision),
      lastSyncedAt: nullableNumber(parsed.lastSyncedAt),
      practice: {
        deletedRecordIds: uniqueStrings(parsed.practice?.deletedRecordIds),
        clearedAt: nullableNumber(parsed.practice?.clearedAt),
        updatedAt: finiteNumber(parsed.practice?.updatedAt, now)
      },
      achievements: {
        resetAt: nullableNumber(parsed.achievements?.resetAt),
        updatedAt: finiteNumber(parsed.achievements?.updatedAt, now)
      },
      settings: {
        updatedAt: finiteNumber(parsed.settings?.updatedAt, now)
      }
    }
  } catch {
    return createDefaultSyncMetadata(now)
  }
}

export function writeSyncMetadata(metadata: SyncMetadata): void {
  if (typeof localStorage === 'undefined') {
    return
  }

  localStorage.setItem(SYNC_META_STORAGE_KEY, JSON.stringify(metadata))
}

export function updateSyncMetadata(updater: (metadata: SyncMetadata, now: number) => SyncMetadata): SyncMetadata {
  const now = Date.now()
  const next = updater(readSyncMetadata(now), now)
  writeSyncMetadata(next)
  return next
}

export function setSyncRevision(revision: number, syncedAt = Date.now()): void {
  updateSyncMetadata((metadata) => ({
    ...metadata,
    revision,
    lastSyncedAt: syncedAt
  }))
}

export function applyRemoteMetadata(payload: {
  revision: number
  syncedAt?: number
  practice: Pick<PracticeSyncState, 'deletedRecordIds' | 'clearedAt' | 'updatedAt'>
  achievements: Pick<AchievementSyncState, 'resetAt' | 'updatedAt'>
  settings: Pick<SettingsSyncState, 'updatedAt'>
}): void {
  const syncedAt = payload.syncedAt ?? Date.now()
  writeSyncMetadata({
    revision: payload.revision,
    lastSyncedAt: syncedAt,
    practice: {
      deletedRecordIds: Array.from(new Set(payload.practice.deletedRecordIds)),
      clearedAt: payload.practice.clearedAt,
      updatedAt: payload.practice.updatedAt
    },
    achievements: {
      resetAt: payload.achievements.resetAt,
      updatedAt: payload.achievements.updatedAt
    },
    settings: {
      updatedAt: payload.settings.updatedAt
    }
  })
}

export function touchPracticeSync(now = Date.now()): void {
  updateSyncMetadata((metadata) => ({
    ...metadata,
    practice: {
      ...metadata.practice,
      updatedAt: now
    }
  }))
}

export function markPracticeRecordDeleted(id: string, now = Date.now()): void {
  const normalizedId = id.trim()
  if (!normalizedId) {
    return
  }

  updateSyncMetadata((metadata) => ({
    ...metadata,
    practice: {
      ...metadata.practice,
      deletedRecordIds: Array.from(new Set([...metadata.practice.deletedRecordIds, normalizedId])),
      updatedAt: now
    }
  }))
}

export function markPracticeRecordsCleared(now = Date.now()): void {
  updateSyncMetadata((metadata) => ({
    ...metadata,
    practice: {
      ...metadata.practice,
      clearedAt: now,
      updatedAt: now
    }
  }))
}

export function touchAchievementSync(now = Date.now()): void {
  updateSyncMetadata((metadata) => ({
    ...metadata,
    achievements: {
      ...metadata.achievements,
      updatedAt: now
    }
  }))
}

export function markAchievementsReset(now = Date.now()): void {
  updateSyncMetadata((metadata) => ({
    ...metadata,
    achievements: {
      resetAt: now,
      updatedAt: now
    }
  }))
}

export function touchSettingsSync(now = Date.now()): void {
  updateSyncMetadata((metadata) => ({
    ...metadata,
    settings: {
      updatedAt: now
    }
  }))
}
