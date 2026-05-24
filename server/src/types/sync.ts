export type SyncSettingTheme = 'light' | 'dark' | 'auto'
export type SyncSettingLanguage = 'zh' | 'en'

export interface PracticeRecord {
  id: string
  time: number
  [key: string]: unknown
}

export interface PracticeSyncState {
  records: PracticeRecord[]
  deletedRecordIds: string[]
  clearedAt: number | null
  updatedAt: number
}

export interface AchievementUnlockState {
  id: string
  unlockedAt: number
}

export interface AchievementSyncState {
  unlocked: AchievementUnlockState[]
  resetAt: number | null
  updatedAt: number
}

export interface SettingsSyncState {
  theme: SyncSettingTheme
  language: SyncSettingLanguage
  showTutorial: boolean
  autoSave: boolean
  updatedAt: number
}

export interface SyncSnapshot {
  version: 1
  updatedAt: number
  practice: PracticeSyncState
  achievements: AchievementSyncState
  settings: SettingsSyncState
}

export interface SyncMergeResult {
  revision: number
  snapshot: SyncSnapshot
  mergedAt: number
  clientRevision: number
  serverRevision: number
  clientWasStale: boolean
}
