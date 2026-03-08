import { defineStore } from 'pinia'

export interface ThemeState {
  theme: 'light' | 'dark' | 'auto'
}

export const useThemeStore = defineStore('theme', {
  state: (): ThemeState => ({
    theme: 'light'
  }),

  actions: {
    setTheme(theme: 'light' | 'dark' | 'auto') {
      this.theme = theme
      localStorage.setItem('ielts_theme', theme)
      this.applyTheme(theme)
    },

    initTheme() {
      const saved = localStorage.getItem('ielts_theme')
      if (saved) {
        this.theme = saved as 'light' | 'dark' | 'auto'
      }
      this.applyTheme(this.theme)
    },

    applyTheme(theme: 'light' | 'dark' | 'auto') {
      const root = document.documentElement
      const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches
      
      if (theme === 'auto') {
        if (systemDark) {
          root.classList.add('dark')
          root.classList.remove('light')
        } else {
          root.classList.add('light')
          root.classList.remove('dark')
        }
      } else if (theme === 'dark') {
        root.classList.add('dark')
        root.classList.remove('light')
      } else {
        root.classList.add('light')
        root.classList.remove('dark')
      }
    }
  }
})
