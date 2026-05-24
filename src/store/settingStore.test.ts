import { setActivePinia, createPinia } from 'pinia'
import { beforeEach, afterEach, describe, expect, it } from 'vitest'
import { useSettingStore } from './settingStore'
import { readSyncMetadata } from '@/sync/localSyncMetadata'

describe('Setting Store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
  })

  afterEach(() => {
    localStorage.clear()
  })

  it('keeps default settings out of sync metadata on first load', () => {
    const store = useSettingStore()
    store.load()

    expect(store.theme).toBe('light')
    expect(store.language).toBe('zh')
    expect(readSyncMetadata().settings.updatedAt).toBe(0)
  })

  it('marks stored settings as syncable when loading legacy values', () => {
    localStorage.setItem('ielts_settings', JSON.stringify({
      theme: 'dark',
      language: 'en',
      showTutorial: false,
      autoSave: false
    }))
    localStorage.setItem('ielts_theme', 'dark')
    localStorage.setItem('ielts-language', 'en')

    const store = useSettingStore()
    store.load()

    expect(store.theme).toBe('dark')
    expect(store.language).toBe('en')
    expect(readSyncMetadata().settings.updatedAt).toBeGreaterThan(0)
  })
})
