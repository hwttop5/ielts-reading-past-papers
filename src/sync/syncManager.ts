import { computed, ref } from 'vue'
import { getLocalizedApiErrorMessage } from '@/api/authErrors'
import { pullSyncSnapshot, pushSyncSnapshot } from '@/api/authSync'
import { useAuthStore } from '@/store/authStore'
import { useAchievementStore } from '@/store/achievementStore'
import { usePracticeStore } from '@/store/practiceStore'
import { useSettingStore } from '@/store/settingStore'
import { useThemeStore } from '@/store/themeStore'
import { setLocale, useI18n } from '@/i18n'
import {
  AUTH_SESSION_CHANGED,
  SYNC_LOCAL_CHANGED,
  SYNC_REMOTE_APPLIED,
  eventBus
} from '@/utils/eventBus'
import {
  applyRemoteMetadata,
  readSyncMetadata,
  setSyncRevision,
  touchAchievementSync,
  touchPracticeSync,
  touchSettingsSync
} from './localSyncMetadata'
import { createDefaultSyncSnapshot, mergeSyncSnapshots, normalizeSyncSnapshot } from '@/utils/syncSnapshot'

export type SyncStatus = 'idle' | 'guest' | 'bootstrapping' | 'syncing' | 'synced' | 'error'

const syncStatus = ref<SyncStatus>('idle')
const syncMessage = ref('')
const lastSyncedAt = ref<number | null>(null)
const lastError = ref('')

let installed = false
let bootstrapRunning = false
let bootstrapRetryQueued = false
let syncTimer: ReturnType<typeof setTimeout> | null = null
let syncRunning = false
let syncRetryQueued = false

function getLocalStores() {
  return {
    authStore: useAuthStore(),
    practiceStore: usePracticeStore(),
    achievementStore: useAchievementStore(),
    settingStore: useSettingStore(),
    themeStore: useThemeStore()
  }
}

export function loadLocalStores(): void {
  const { practiceStore, achievementStore, settingStore, themeStore } = getLocalStores()
  practiceStore.load()
  achievementStore.load()
  settingStore.load()
  themeStore.initTheme()
}

function buildLocalSnapshot() {
  const { practiceStore, achievementStore, settingStore } = getLocalStores()
  const practice = practiceStore.getSyncState()
  const achievements = achievementStore.getSyncState()
  const settings = settingStore.getSyncState()

  return normalizeSyncSnapshot({
    ...createDefaultSyncSnapshot(),
    updatedAt: Math.max(practice.updatedAt, achievements.updatedAt, settings.updatedAt, Date.now()),
    practice,
    achievements,
    settings
  })
}

function applySnapshot(snapshot: ReturnType<typeof normalizeSyncSnapshot>, revision: number, mergedAt: number): void {
  const { practiceStore, achievementStore, settingStore, themeStore } = getLocalStores()
  practiceStore.replaceFromSync(snapshot.practice.records)
  achievementStore.replaceFromSync(snapshot.achievements.unlocked)
  settingStore.replaceFromSync({
    theme: snapshot.settings.theme,
    language: snapshot.settings.language,
    showTutorial: snapshot.settings.showTutorial,
    autoSave: snapshot.settings.autoSave
  })
  themeStore.setTheme(snapshot.settings.theme)
  setLocale(snapshot.settings.language)
  applyRemoteMetadata({
    revision,
    syncedAt: mergedAt,
    practice: snapshot.practice,
    achievements: snapshot.achievements,
    settings: snapshot.settings
  })
  setSyncRevision(revision, mergedAt)
  lastSyncedAt.value = mergedAt
  syncStatus.value = 'synced'
  syncMessage.value = ''
  lastError.value = ''
  eventBus.emit(SYNC_REMOTE_APPLIED, { revision, mergedAt })
}

function getSyncErrorMessage(error: unknown): string {
  const { t } = useI18n()
  return getLocalizedApiErrorMessage(error, t, 'sync.requestFailed')
}

async function bootstrapRemoteSync(): Promise<void> {
  const { authStore } = getLocalStores()
  if (!authStore.isAuthenticated || !authStore.csrfToken || !authStore.user) {
    syncStatus.value = 'guest'
    syncMessage.value = ''
    lastError.value = ''
    return
  }

  if (bootstrapRunning) {
    bootstrapRetryQueued = true
    return
  }

  bootstrapRunning = true
  syncStatus.value = 'bootstrapping'
  syncMessage.value = 'bootstrap'
  lastError.value = ''

  try {
    const remote = await pullSyncSnapshot()
    const localSnapshot = buildLocalSnapshot()
    const merged = mergeSyncSnapshots(remote.snapshot, localSnapshot, Date.now())
    const pushed = await pushSyncSnapshot(authStore.csrfToken, {
      baseRevision: remote.revision,
      snapshot: merged
    })
    applySnapshot(pushed.snapshot, pushed.revision, pushed.mergedAt)
  } catch (error) {
    syncStatus.value = 'error'
    syncMessage.value = 'bootstrap'
    lastError.value = getSyncErrorMessage(error)
  } finally {
    bootstrapRunning = false
    if (syncRetryQueued) {
      syncRetryQueued = false
      void flushSync()
    }
    if (bootstrapRetryQueued) {
      bootstrapRetryQueued = false
      void bootstrapRemoteSync()
    }
  }
}

async function flushSync(): Promise<void> {
  const { authStore } = getLocalStores()
  if (!authStore.isAuthenticated || !authStore.csrfToken || !authStore.user) {
    syncStatus.value = 'guest'
    syncMessage.value = ''
    return
  }

  const metadata = readSyncMetadata()
  const baseRevision = metadata.revision
  if (baseRevision === null) {
    await bootstrapRemoteSync()
    return
  }

  if (syncRunning) {
    syncRetryQueued = true
    return
  }

  syncRunning = true
  syncStatus.value = 'syncing'
  syncMessage.value = 'push'

  try {
    const localSnapshot = buildLocalSnapshot()
    const pushed = await pushSyncSnapshot(authStore.csrfToken, {
      baseRevision,
      snapshot: localSnapshot
    })
    applySnapshot(pushed.snapshot, pushed.revision, pushed.mergedAt)
  } catch (error) {
    syncStatus.value = 'error'
    syncMessage.value = 'push'
    lastError.value = getSyncErrorMessage(error)
  } finally {
    syncRunning = false
    if (syncRetryQueued) {
      syncRetryQueued = false
      void flushSync()
    }
  }
}

function queueSync(): void {
  const { authStore } = getLocalStores()
  if (!authStore.isAuthenticated) {
    syncStatus.value = 'guest'
    syncMessage.value = ''
    return
  }

  if (bootstrapRunning || syncRunning) {
    syncRetryQueued = true
    return
  }

  if (syncTimer) {
    clearTimeout(syncTimer)
  }

  syncStatus.value = 'syncing'
  syncMessage.value = 'scheduled'
  syncTimer = setTimeout(() => {
    syncTimer = null
    void flushSync()
  }, 1200)
}

function handleAuthChanged(): void {
  void bootstrapRemoteSync()
}

function handleLocalChanged(): void {
  queueSync()
}

export function installSyncManager(): void {
  if (installed) {
    return
  }

  installed = true
  eventBus.on(AUTH_SESSION_CHANGED, handleAuthChanged)
  eventBus.on(SYNC_LOCAL_CHANGED, handleLocalChanged)
}

export async function bootstrapSyncAfterAuth(): Promise<void> {
  await bootstrapRemoteSync()
}

export async function syncNow(): Promise<void> {
  if (syncTimer) {
    clearTimeout(syncTimer)
    syncTimer = null
  }
  await flushSync()
}

export function markLocalDataImported(): void {
  touchPracticeSync()
  touchAchievementSync()
  touchSettingsSync()
  eventBus.emit(SYNC_LOCAL_CHANGED, { scope: 'backup-import' })
}

export function useSyncManager() {
  return {
    status: computed(() => syncStatus.value),
    message: computed(() => syncMessage.value),
    lastSyncedAt: computed(() => lastSyncedAt.value),
    lastError: computed(() => lastError.value),
    installSyncManager,
    loadLocalStores,
    bootstrapSyncAfterAuth,
    syncNow,
    markLocalDataImported
  }
}
