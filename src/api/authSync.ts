import { getAssistantApiBaseUrl } from '@/api/assistant'
import type {
  AuthSessionResponse,
  CurrentSessionResponse,
  LoginRequest,
  LogoutResponse,
  PasswordResetConfirmRequest,
  PasswordResetRequest,
  PasswordResetRequestResponse,
  RegisterRequest
} from '@/types/auth'
import type { SyncMergeResult, SyncPullResponse, SyncPushRequest } from '@/types/sync'

export class ApiRequestError extends Error {
  status: number
  code: string

  constructor(status: number, code: string, message: string) {
    super(message)
    this.name = 'ApiRequestError'
    this.status = status
    this.code = code
  }
}

function buildApiUrl(path: string): string {
  const base = getAssistantApiBaseUrl()
  return base ? `${base}${path}` : path
}

async function readJsonResponse<T>(response: Response): Promise<T> {
  const text = await response.text()
  let data: unknown = null
  if (text) {
    try {
      data = JSON.parse(text)
    } catch (error) {
      if (!response.ok) {
        throw new ApiRequestError(response.status, 'request_failed', `Request failed with HTTP ${response.status}.`)
      }
      throw error
    }
  }

  if (!response.ok) {
    const errorData = data && typeof data === 'object' ? data as { error?: unknown; message?: unknown } : null
    const code = typeof errorData?.error === 'string' && errorData.error ? errorData.error : 'request_failed'
    const message = typeof errorData?.message === 'string' && errorData.message
      ? errorData.message
      : `Request failed with HTTP ${response.status}.`
    throw new ApiRequestError(
      response.status,
      code,
      message
    )
  }

  return data as T
}

async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  let response: Response
  try {
    response = await fetch(buildApiUrl(path), {
      ...init,
      headers,
      credentials: 'include'
    })
  } catch (error) {
    throw new ApiRequestError(
      0,
      'network_error',
      error instanceof Error && error.message ? error.message : 'Network request failed.'
    )
  }

  return readJsonResponse<T>(response)
}

export function getCurrentSession(): Promise<CurrentSessionResponse> {
  return apiRequest<CurrentSessionResponse>('/api/auth/me')
}

export function registerAccount(payload: RegisterRequest): Promise<AuthSessionResponse> {
  return apiRequest<AuthSessionResponse>('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify(payload)
  })
}

export function loginAccount(payload: LoginRequest): Promise<AuthSessionResponse> {
  return apiRequest<AuthSessionResponse>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify(payload)
  })
}

export function logoutAccount(csrfToken: string): Promise<LogoutResponse> {
  return apiRequest<LogoutResponse>('/api/auth/logout', {
    method: 'POST',
    headers: {
      'X-CSRF-Token': csrfToken
    }
  })
}

export function requestPasswordReset(payload: PasswordResetRequest): Promise<PasswordResetRequestResponse> {
  return apiRequest<PasswordResetRequestResponse>('/api/auth/password-reset/request', {
    method: 'POST',
    body: JSON.stringify(payload)
  })
}

export function confirmPasswordReset(payload: PasswordResetConfirmRequest): Promise<AuthSessionResponse> {
  return apiRequest<AuthSessionResponse>('/api/auth/password-reset/confirm', {
    method: 'POST',
    body: JSON.stringify(payload)
  })
}

export function pullSyncSnapshot(): Promise<SyncPullResponse> {
  return apiRequest<SyncPullResponse>('/api/sync/pull')
}

export function pushSyncSnapshot(csrfToken: string, payload: SyncPushRequest): Promise<SyncMergeResult> {
  return apiRequest<SyncMergeResult>('/api/sync/push', {
    method: 'POST',
    headers: {
      'X-CSRF-Token': csrfToken
    },
    body: JSON.stringify(payload)
  })
}
