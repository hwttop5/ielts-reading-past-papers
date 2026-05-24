import { defineStore } from 'pinia'
import { setLocale } from '@/i18n'
import { SYNC_LOCAL_CHANGED, eventBus } from '@/utils/eventBus'
import { touchSettingsSync, readSyncMetadata } from '@/sync/localSyncMetadata'

export interface SettingState {
  theme: 'light' | 'dark' | 'auto'
  language: 'zh' | 'en'
  showTutorial: boolean
  autoSave: boolean
}

export const useSettingStore = defineStore('setting', {
  state: (): SettingState => ({
    theme: 'light',
    language: 'zh',
    showTutorial: true,
    autoSave: true
  }),

  actions: {
    load() {
      const raw = localStorage.getItem('ielts_settings')
      let hasStoredSettings = false
      if (raw) {
        try {
          const settings = JSON.parse(raw) as Partial<SettingState>
          Object.assign(this.$state, settings)
          hasStoredSettings = true
        } catch {
          // ignore malformed settings
        }
      }

      const legacyTheme = localStorage.getItem('ielts_theme') as SettingState['theme'] | null
      if (legacyTheme === 'light' || legacyTheme === 'dark' || legacyTheme === 'auto') {
        this.theme = legacyTheme
        hasStoredSettings = true
      }

      const legacyLanguage = localStorage.getItem('ielts-language') as SettingState['language'] | null
      if (legacyLanguage === 'zh' || legacyLanguage === 'en') {
        this.language = legacyLanguage
        hasStoredSettings = true
      }

      if (hasStoredSettings && readSyncMetadata().settings.updatedAt === 0) {
        touchSettingsSync()
      }

      this.persist(false)
    },

    persist(trackSync = true) {
      localStorage.setItem('ielts_settings', JSON.stringify(this.$state))
      localStorage.setItem('ielts_theme', this.theme)
      localStorage.setItem('ielts-language', this.language)
      setLocale(this.language)
      if (trackSync) {
        touchSettingsSync()
        eventBus.emit(SYNC_LOCAL_CHANGED, { scope: 'settings' })
      }
    },

    replaceFromSync(nextState: SettingState & { updatedAt?: number }) {
      Object.assign(this.$state, nextState)
      this.persist(false)
    },

    getSyncState() {
      const meta = readSyncMetadata()
      return {
        theme: this.theme,
        language: this.language,
        showTutorial: this.showTutorial,
        autoSave: this.autoSave,
        updatedAt: meta.settings.updatedAt
      }
    },

    updateSettings(settings: Partial<SettingState>, trackSync = true) {
      Object.assign(this.$state, settings)
      this.persist(trackSync)
    }
  }
})
