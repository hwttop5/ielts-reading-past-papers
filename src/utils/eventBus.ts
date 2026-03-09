import { ref } from 'vue'

// 创建一个简单的事件总线
export const eventBus = {
  on: (event: string, handler: Function) => {
    window.addEventListener(`app-${event}`, handler as EventListener)
  },
  off: (event: string, handler: Function) => {
    window.removeEventListener(`app-${event}`, handler as EventListener)
  },
  emit: (event: string, data?: any) => {
    window.dispatchEvent(new CustomEvent(`app-${event}`, { detail: data }))
  }
}

// 练习记录更新事件
export const PRACTICE_UPDATED = 'practice-updated'
// 成就解锁事件
export const ACHIEVEMENT_UNLOCKED = 'achievement-unlocked'
