import { defineStore } from 'pinia'

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
      if (raw) {
        const settings = JSON.parse(raw)
        Object.assign(this.$state, settings)
      }
    },

    save() {
      localStorage.setItem('ielts_settings', JSON.stringify(this.$state))
    },

    updateSettings(settings: Partial<SettingState>) {
      Object.assign(this.$state, settings)
      this.save()
    }
  }
})
