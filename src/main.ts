import { createApp } from 'vue'
import { createPinia } from 'pinia'
import Antd from 'ant-design-vue'
import 'ant-design-vue/dist/reset.css'

import './styles/index.css'

import App from './App.vue'
import router from './router'
import { loadAssistantPublicConfig } from './api/assistant'

async function bootstrap() {
  await loadAssistantPublicConfig()

  const app = createApp(App)

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

  app.use(createPinia())
  app.use(router)
  app.use(Antd)

  app.mount('#app')
}

void bootstrap()
