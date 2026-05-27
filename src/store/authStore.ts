import { defineStore } from 'pinia'
import {
  confirmPasswordReset,
  getCurrentSession,
  loginAccount,
  logoutAccount,
  registerAccount,
  requestPasswordReset
} from '@/api/authSync'
import type { LoginRequest, PasswordResetConfirmRequest, PasswordResetRequest, SessionUser } from '@/types/auth'
import { AUTH_SESSION_CHANGED, eventBus } from '@/utils/eventBus'

export type AuthStatus = 'idle' | 'loading' | 'guest' | 'authenticated' | 'error'
type AuthSessionChangeSource = 'bootstrap' | 'login' | 'register' | 'logout' | 'password-reset'

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
    emitSessionChanged(source: AuthSessionChangeSource) {
      eventBus.emit(AUTH_SESSION_CHANGED, {
        source,
        user: this.user,
        csrfToken: this.csrfToken
      })
    },

    setSession(user: SessionUser | null, csrfToken: string | null, source: AuthSessionChangeSource) {
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

    async requestPasswordReset(payload: PasswordResetRequest) {
      this.error = ''
      try {
        return await requestPasswordReset(payload)
      } catch (error) {
        this.error = error instanceof Error ? error.message : 'Password reset request failed.'
        throw error
      }
    },

    async confirmPasswordReset(payload: PasswordResetConfirmRequest) {
      this.status = 'loading'
      this.error = ''
      try {
        const response = await confirmPasswordReset(payload)
        this.setSession(response.user, response.csrfToken, 'password-reset')
        return response
      } catch (error) {
        this.status = 'guest'
        this.error = error instanceof Error ? error.message : 'Password reset failed.'
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
