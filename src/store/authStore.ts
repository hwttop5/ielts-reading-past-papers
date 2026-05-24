import { defineStore } from 'pinia'
import { getCurrentSession, loginAccount, logoutAccount, registerAccount } from '@/api/authSync'
import type { LoginRequest, SessionUser } from '@/types/auth'
import { AUTH_SESSION_CHANGED, eventBus } from '@/utils/eventBus'

export type AuthStatus = 'idle' | 'loading' | 'guest' | 'authenticated' | 'error'

export interface AuthSessionState {
  user: SessionUser | null
  csrfToken: string | null
  status: AuthStatus
  error: string
}

function emptyState(): AuthSessionState {
  return {
    user: null,
    csrfToken: null,
    status: 'idle',
    error: ''
  }
}

export const useAuthStore = defineStore('auth', {
  state: (): AuthSessionState => emptyState(),

  getters: {
    isAuthenticated: (state) => Boolean(state.user && state.csrfToken)
  },

  actions: {
    emitSessionChanged(source: 'bootstrap' | 'login' | 'register' | 'logout') {
      eventBus.emit(AUTH_SESSION_CHANGED, {
        source,
        user: this.user,
        csrfToken: this.csrfToken
      })
    },

    setSession(user: SessionUser | null, csrfToken: string | null, source: 'bootstrap' | 'login' | 'register' | 'logout') {
      this.user = user
      this.csrfToken = csrfToken
      this.status = user ? 'authenticated' : 'guest'
      this.error = ''
      this.emitSessionChanged(source)
    },

    async bootstrapSession() {
      this.status = 'loading'
      try {
        const response = await getCurrentSession()
        this.setSession(response.user, response.csrfToken, 'bootstrap')
      } catch (error) {
        this.user = null
        this.csrfToken = null
        this.status = 'guest'
        this.error = error instanceof Error ? error.message : 'Failed to load session.'
        this.emitSessionChanged('bootstrap')
      }
    },

    async register(payload: LoginRequest) {
      this.status = 'loading'
      this.error = ''
      try {
        const response = await registerAccount(payload)
        this.setSession(response.user, response.csrfToken, 'register')
        return response
      } catch (error) {
        this.status = 'guest'
        this.error = error instanceof Error ? error.message : 'Registration failed.'
        throw error
      }
    },

    async login(payload: LoginRequest) {
      this.status = 'loading'
      this.error = ''
      try {
        const response = await loginAccount(payload)
        this.setSession(response.user, response.csrfToken, 'login')
        return response
      } catch (error) {
        this.status = 'guest'
        this.error = error instanceof Error ? error.message : 'Login failed.'
        throw error
      }
    },

    async logout() {
      const csrfToken = this.csrfToken
      try {
        if (csrfToken) {
          await logoutAccount(csrfToken)
        }
      } catch {
        // best-effort logout; local state should still fall back to guest mode
      } finally {
        this.setSession(null, null, 'logout')
      }
    },

    reset() {
      Object.assign(this.$state, emptyState())
    }
  }
})
