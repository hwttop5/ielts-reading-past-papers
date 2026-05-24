export const eventBus = {
  on: (event: string, handler: Function) => {
    window.addEventListener(`app-${event}`, handler as EventListener)
  },
  off: (event: string, handler: Function) => {
    window.removeEventListener(`app-${event}`, handler as EventListener)
  },
  emit: (event: string, data?: unknown) => {
    window.dispatchEvent(new CustomEvent(`app-${event}`, { detail: data }))
  }
}

export const PRACTICE_UPDATED = 'practice-updated'
export const ACHIEVEMENT_UNLOCKED = 'achievement-unlocked'
export const SYNC_LOCAL_CHANGED = 'sync-local-changed'
export const SYNC_REMOTE_APPLIED = 'sync-remote-applied'
export const AUTH_SESSION_CHANGED = 'auth-session-changed'
