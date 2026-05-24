import type { AchievementSyncState, PracticeSyncRecord, PracticeSyncState, SettingsSyncState, SyncSnapshot } from '@/types/sync'

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function toStringValue(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value.trim() : fallback
}

function toFiniteNumber(value: unknown, fallback = 0): number {
  const next = Number(value)
  return Number.isFinite(next) ? next : fallback
}

function toBooleanValue(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function toNullableNumber(value: unknown): number | null {
  const next = Number(value)
  return Number.isFinite(next) ? next : null
}

function normalizePracticeRecord(value: unknown): PracticeSyncRecord | null {
  if (!isRecord(value)) {
    return null
  }

  const id = toStringValue(value.id)
  if (!id) {
    return null
  }

  return {
    ...value,
    id,
    time: toFiniteNumber(value.time, Date.now())
  }
}

function normalizePracticeState(value: unknown, now: number): PracticeSyncState {
  if (!isRecord(value)) {
    return {
      records: [],
      deletedRecordIds: [],
      clearedAt: null,
      updatedAt: now
    }
  }

  const records = Array.isArray(value.records)
    ? value.records.map((entry) => normalizePracticeRecord(entry)).filter((entry): entry is PracticeSyncRecord => Boolean(entry))
    : []

  return {
    records,
    deletedRecordIds: Array.isArray(value.deletedRecordIds)
      ? value.deletedRecordIds.map((entry) => toStringValue(entry)).filter(Boolean)
      : [],
    clearedAt: toNullableNumber(value.clearedAt),
    updatedAt: toFiniteNumber(value.updatedAt, now)
  }
}

function normalizeAchievementState(value: unknown, now: number): AchievementSyncState {
  if (!isRecord(value)) {
    return {
      unlocked: [],
      resetAt: null,
      updatedAt: now
    }
  }

  return {
    unlocked: Array.isArray(value.unlocked)
      ? value.unlocked
          .map((entry) => {
            if (!isRecord(entry)) {
              return null
            }
            const id = toStringValue(entry.id)
            if (!id) {
              return null
            }
            return {
              id,
              unlockedAt: toFiniteNumber(entry.unlockedAt, now)
            }
          })
          .filter((entry): entry is { id: string; unlockedAt: number } => Boolean(entry))
      : [],
    resetAt: toNullableNumber(value.resetAt),
    updatedAt: toFiniteNumber(value.updatedAt, now)
  }
}

function normalizeSettingsState(value: unknown, now: number): SettingsSyncState {
  if (!isRecord(value)) {
    return {
      theme: 'light',
      language: 'zh',
      showTutorial: true,
      autoSave: true,
      updatedAt: now
    }
  }

  const theme = value.theme
  const language = value.language

  return {
    theme: theme === 'dark' || theme === 'auto' ? theme : 'light',
    language: language === 'en' ? 'en' : 'zh',
    showTutorial: toBooleanValue(value.showTutorial, true),
    autoSave: toBooleanValue(value.autoSave, true),
    updatedAt: toFiniteNumber(value.updatedAt, now)
  }
}

export function createDefaultSyncSnapshot(now = Date.now()): SyncSnapshot {
  return {
    version: 1,
    updatedAt: now,
    practice: {
      records: [],
      deletedRecordIds: [],
      clearedAt: null,
      updatedAt: now
    },
    achievements: {
      unlocked: [],
      resetAt: null,
      updatedAt: now
    },
    settings: {
      theme: 'light',
      language: 'zh',
      showTutorial: true,
      autoSave: true,
      updatedAt: now
    }
  }
}

export function normalizeSyncSnapshot(value: unknown, now = Date.now()): SyncSnapshot {
  if (!isRecord(value)) {
    return createDefaultSyncSnapshot(now)
  }

  const practice = normalizePracticeState(value.practice, now)
  const achievements = normalizeAchievementState(value.achievements, now)
  const settings = normalizeSettingsState(value.settings, now)
  const updatedAt = toFiniteNumber(value.updatedAt, Math.max(practice.updatedAt, achievements.updatedAt, settings.updatedAt, now))

  return {
    version: 1,
    updatedAt,
    practice,
    achievements,
    settings
  }
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values))
}

function mergePracticeState(serverState: PracticeSyncState, incomingState: PracticeSyncState, now: number): PracticeSyncState {
  const deletedRecordIds = uniqueStrings([...serverState.deletedRecordIds, ...incomingState.deletedRecordIds])
  const clearedAt = Math.max(serverState.clearedAt ?? 0, incomingState.clearedAt ?? 0) || null
  const byId = new Map<string, PracticeSyncRecord>()

  for (const record of [...serverState.records, ...incomingState.records]) {
    const normalized = normalizePracticeRecord(record)
    if (!normalized) {
      continue
    }

    const previous = byId.get(normalized.id)
    if (!previous || normalized.time >= previous.time) {
      byId.set(normalized.id, normalized)
    }
  }

  const records = Array.from(byId.values())
    .filter((record) => !deletedRecordIds.includes(record.id))
    .filter((record) => !clearedAt || record.time > clearedAt)
    .sort((left, right) => right.time - left.time)

  return {
    records,
    deletedRecordIds,
    clearedAt,
    updatedAt: Math.max(serverState.updatedAt, incomingState.updatedAt, now)
  }
}

function mergeAchievementState(serverState: AchievementSyncState, incomingState: AchievementSyncState, now: number): AchievementSyncState {
  const resetAt = Math.max(serverState.resetAt ?? 0, incomingState.resetAt ?? 0) || null
  const byId = new Map<string, { id: string; unlockedAt: number }>()

  for (const item of [...serverState.unlocked, ...incomingState.unlocked]) {
    if (!item || typeof item.id !== 'string') {
      continue
    }

    const unlockedAt = toFiniteNumber(item.unlockedAt, now)
    if (resetAt && unlockedAt <= resetAt) {
      continue
    }

    const previous = byId.get(item.id)
    if (!previous || unlockedAt >= previous.unlockedAt) {
      byId.set(item.id, { id: item.id, unlockedAt })
    }
  }

  const unlocked = Array.from(byId.values()).sort((left, right) => right.unlockedAt - left.unlockedAt)

  return {
    unlocked,
    resetAt,
    updatedAt: Math.max(serverState.updatedAt, incomingState.updatedAt, now)
  }
}

function mergeSettingsState(serverState: SettingsSyncState, incomingState: SettingsSyncState, now: number): SettingsSyncState {
  const winner = incomingState.updatedAt >= serverState.updatedAt ? incomingState : serverState
  return {
    theme: winner.theme,
    language: winner.language,
    showTutorial: winner.showTutorial,
    autoSave: winner.autoSave,
    updatedAt: Math.max(serverState.updatedAt, incomingState.updatedAt, now)
  }
}

export function mergeSyncSnapshots(serverSnapshot: SyncSnapshot, incomingSnapshot: SyncSnapshot, now = Date.now()): SyncSnapshot {
  const normalizedServer = normalizeSyncSnapshot(serverSnapshot, now)
  const normalizedIncoming = normalizeSyncSnapshot(incomingSnapshot, now)

  return {
    version: 1,
    updatedAt: now,
    practice: mergePracticeState(normalizedServer.practice, normalizedIncoming.practice, now),
    achievements: mergeAchievementState(normalizedServer.achievements, normalizedIncoming.achievements, now),
    settings: mergeSettingsState(normalizedServer.settings, normalizedIncoming.settings, now)
  }
}
