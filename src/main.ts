import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { Modal } from 'ant-design-vue'
import 'ant-design-vue/dist/reset.css'

import './styles/index.css'

import App from './App.vue'
import router from './router'
import { installBaiduTongji } from './analytics/baiduTongji'
import { loadAssistantPublicConfig } from './api/assistant'
import { setupPwa } from './pwa'
import { runAppMigration } from './utils/appMigration'
import { usePracticeStore } from './store/practiceStore'
import { useAchievementStore } from './store/achievementStore'
import { useSettingStore } from './store/settingStore'
import { useThemeStore } from './store/themeStore'
import { useAuthStore } from './store/authStore'
import { installSyncManager, loadLocalStores } from './sync/syncManager'

function bootstrap() {
  void loadAssistantPublicConfig()

  if (typeof window !== 'undefined') {
    runAppMigration()
  }

  const app = createApp(App)
  const pinia = createPinia()

  // Global error handlers for debugging
  app.config.errorHandler = (err, instance, info) => {
    console.error('[Vue Global ErrorHandler]', err)
    console.error('[Error info]', info)
    console.error('[Component instance]', instance)
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('error', (event) => {
      console.error('[Window Error]', event.error)
      console.error('[Error source]', event.filename, event.lineno, event.colno)
    })
    window.addEventListener('unhandledrejection', (event) => {
      console.error('[Unhandled Promise Rejection]', event.reason)
    })
  }

  app.use(pinia)
  installBaiduTongji(router)
  app.use(router)
  app.use(Modal)

  usePracticeStore(pinia)
  useAchievementStore(pinia)
  useSettingStore(pinia)
  useThemeStore(pinia)
  loadLocalStores()
  installSyncManager()
  void useAuthStore(pinia).bootstrapSession()

  app.mount('#app')
  setupPwa()
}

bootstrap()
