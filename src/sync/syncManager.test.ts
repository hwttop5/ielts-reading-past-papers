import { setActivePinia, createPinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '@/store/authStore'
import { usePracticeStore } from '@/store/practiceStore'
import { useAchievementStore } from '@/store/achievementStore'
import { useSettingStore } from '@/store/settingStore'
import { installSyncManager, loadLocalStores, syncNow } from './syncManager'

vi.mock('@/api/authSync', () => ({
  getCurrentSession: vi.fn(),
  registerAccount: vi.fn(),
  loginAccount: vi.fn(),
  logoutAccount: vi.fn(),
  pullSyncSnapshot: vi.fn(),
  pushSyncSnapshot: vi.fn()
}))

import { getCurrentSession, pullSyncSnapshot, pushSyncSnapshot } from '@/api/authSync'

function flushPromises() {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

function baseSnapshot(overrides: Record<string, unknown> = {}) {
  const now = Date.now()
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
    },
    ...overrides
  }
}

describe('sync manager', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.className = ''
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation(() => ({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn()
      }))
    })
    setActivePinia(createPinia())
    vi.mocked(getCurrentSession).mockReset()
    vi.mocked(pullSyncSnapshot).mockReset()
    vi.mocked(pushSyncSnapshot).mockReset()
  })

  it('keeps guest startup local-only', async () => {
    vi.mocked(getCurrentSession).mockResolvedValue({ user: null, csrfToken: null })
    installSyncManager()
    loadLocalStores()

    const authStore = useAuthStore()
    await authStore.bootstrapSession()
    await flushPromises()

    expect(pullSyncSnapshot).not.toHaveBeenCalled()
    expect(pushSyncSnapshot).not.toHaveBeenCalled()
  })

  it('bootstraps an existing session by merging local visitor data and remote data', async () => {
    localStorage.setItem('ielts_practice', JSON.stringify([
      {
        id: 'local-record',
        questionId: 'local',
        questionTitle: 'Local',
        category: 'P1',
        time: 1710000000000,
        duration: 60,
        correctAnswers: 8,
        totalQuestions: 10,
        accuracy: 80,
        score: 8
      }
    ]))
    localStorage.setItem('ielts_settings', JSON.stringify({
      theme: 'dark',
      language: 'en',
      showTutorial: false,
      autoSave: true
    }))

    vi.mocked(getCurrentSession).mockResolvedValue({
      user: { id: 'user-1', email: 'user@example.com', createdAt: 1710000000000 },
      csrfToken: 'csrf-token'
    })
    vi.mocked(pullSyncSnapshot).mockResolvedValue({
      revision: 2,
      snapshot: baseSnapshot({
        practice: {
          records: [
            {
              id: 'remote-record',
              questionId: 'remote',
              questionTitle: 'Remote',
              category: 'P2',
              time: 1710000001000,
              duration: 90,
              correctAnswers: 9,
              totalQuestions: 10,
              accuracy: 90,
              score: 9
            }
          ],
          deletedRecordIds: [],
          clearedAt: null,
          updatedAt: 1710000001000
        },
        settings: {
          theme: 'light',
          language: 'zh',
          showTutorial: true,
          autoSave: true,
          updatedAt: 1
        }
      })
    })
    vi.mocked(pushSyncSnapshot).mockImplementation(async (_csrf, payload) => ({
      revision: 3,
      snapshot: payload.snapshot,
      mergedAt: 1710000002000,
      clientRevision: 2,
      serverRevision: 3,
      clientWasStale: false
    }))

    installSyncManager()
    loadLocalStores()
    const authStore = useAuthStore()
    await authStore.bootstrapSession()
    await flushPromises()

    const practiceStore = usePracticeStore()
    const settingStore = useSettingStore()
    expect(practiceStore.records.map((record) => record.id).sort()).toEqual(['local-record', 'remote-record'])
    expect(settingStore.theme).toBe('dark')
    expect(settingStore.language).toBe('en')
    expect(pushSyncSnapshot).toHaveBeenCalledOnce()
  })

  it('keeps local data when a sync push fails', async () => {
    vi.mocked(getCurrentSession).mockResolvedValue({
      user: { id: 'user-1', email: 'user@example.com', createdAt: 1710000000000 },
      csrfToken: 'csrf-token'
    })
    vi.mocked(pullSyncSnapshot).mockResolvedValue({
      revision: 0,
      snapshot: baseSnapshot()
    })
    vi.mocked(pushSyncSnapshot)
      .mockResolvedValueOnce({
        revision: 1,
        snapshot: baseSnapshot(),
        mergedAt: 1710000002000,
        clientRevision: 0,
        serverRevision: 1,
        clientWasStale: false
      })
      .mockRejectedValueOnce(new Error('network down'))

    installSyncManager()
    loadLocalStores()
    const authStore = useAuthStore()
    await authStore.bootstrapSession()
    await flushPromises()

    const practiceStore = usePracticeStore()
    practiceStore.add({
      questionId: 'p1-high-05',
      questionTitle: 'Question',
      category: 'P1',
      duration: 60,
      correctAnswers: 7,
      totalQuestions: 10,
      accuracy: 70,
      score: 7
    })

    await syncNow()
    expect(practiceStore.records).toHaveLength(1)
    expect(practiceStore.records[0].questionId).toBe('p1-high-05')
  })

  it('restores remote preferences into settings, theme, and language', async () => {
    vi.mocked(getCurrentSession).mockResolvedValue({
      user: { id: 'user-1', email: 'user@example.com', createdAt: 1710000000000 },
      csrfToken: 'csrf-token'
    })
    vi.mocked(pullSyncSnapshot).mockResolvedValue({
      revision: 0,
      snapshot: baseSnapshot({
        settings: {
          theme: 'dark',
          language: 'en',
          showTutorial: false,
          autoSave: false,
          updatedAt: 1710000001000
        }
      })
    })
    vi.mocked(pushSyncSnapshot).mockImplementation(async (_csrf, payload) => ({
      revision: 1,
      snapshot: payload.snapshot,
      mergedAt: 1710000002000,
      clientRevision: 0,
      serverRevision: 1,
      clientWasStale: false
    }))

    installSyncManager()
    loadLocalStores()
    await useAuthStore().bootstrapSession()
    await flushPromises()

    const settingStore = useSettingStore()
    expect(settingStore.theme).toBe('dark')
    expect(settingStore.language).toBe('en')
    expect(localStorage.getItem('ielts_theme')).toBe('dark')
    expect(localStorage.getItem('ielts-language')).toBe('en')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })

  it('exports cleared practice records in the next snapshot', async () => {
    vi.mocked(getCurrentSession).mockResolvedValue({
      user: { id: 'user-1', email: 'user@example.com', createdAt: 1710000000000 },
      csrfToken: 'csrf-token'
    })
    vi.mocked(pullSyncSnapshot).mockResolvedValue({ revision: 0, snapshot: baseSnapshot() })
    vi.mocked(pushSyncSnapshot).mockImplementation(async (_csrf, payload) => ({
      revision: 1,
      snapshot: payload.snapshot,
      mergedAt: Date.now(),
      clientRevision: payload.baseRevision ?? 0,
      serverRevision: 1,
      clientWasStale: false
    }))

    installSyncManager()
    loadLocalStores()
    await useAuthStore().bootstrapSession()
    await flushPromises()

    const practiceStore = usePracticeStore()
    practiceStore.add({
      questionId: 'p1-high-05',
      questionTitle: 'Question',
      category: 'P1',
      duration: 60,
      correctAnswers: 7,
      totalQuestions: 10,
      accuracy: 70,
      score: 7
    })
    practiceStore.clear()
    await syncNow()

    const latestCall = vi.mocked(pushSyncSnapshot).mock.calls.at(-1)
    expect(latestCall?.[1].snapshot.practice.records).toEqual([])
    expect(latestCall?.[1].snapshot.practice.clearedAt).toEqual(expect.any(Number))
  })

  it('exports deleted practice record tombstones in the next snapshot', async () => {
    vi.mocked(getCurrentSession).mockResolvedValue({
      user: { id: 'user-1', email: 'user@example.com', createdAt: 1710000000000 },
      csrfToken: 'csrf-token'
    })
    vi.mocked(pullSyncSnapshot).mockResolvedValue({ revision: 0, snapshot: baseSnapshot() })
    vi.mocked(pushSyncSnapshot).mockImplementation(async (_csrf, payload) => ({
      revision: 1,
      snapshot: payload.snapshot,
      mergedAt: Date.now(),
      clientRevision: payload.baseRevision ?? 0,
      serverRevision: 1,
      clientWasStale: false
    }))

    installSyncManager()
    loadLocalStores()
    await useAuthStore().bootstrapSession()
    await flushPromises()

    const practiceStore = usePracticeStore()
    practiceStore.add({
      id: 'record-to-delete',
      time: 1710000001000,
      questionId: 'p1-high-05',
      questionTitle: 'Question',
      category: 'P1',
      duration: 60,
      correctAnswers: 7,
      totalQuestions: 10,
      accuracy: 70,
      score: 7
    })
    practiceStore.deleteRecord('record-to-delete')
    await syncNow()

    const latestCall = vi.mocked(pushSyncSnapshot).mock.calls.at(-1)
    expect(latestCall?.[1].snapshot.practice.records).toEqual([])
    expect(latestCall?.[1].snapshot.practice.deletedRecordIds).toContain('record-to-delete')
  })
})
