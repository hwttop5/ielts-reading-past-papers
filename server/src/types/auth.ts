export interface RegisterRequest {
  email: string
  password: string
}

export type LoginRequest = RegisterRequest

export interface SessionUser {
  id: string
  email: string
  createdAt: number
}

export interface SessionClaims {
  sub: string
  email: string
  csrf: string
}

export interface AuthSessionResponse {
  user: SessionUser
  csrfToken: string
}

export interface CurrentSessionResponse {
  user: SessionUser | null
  csrfToken: string | null
}

export interface LogoutResponse {
  ok: true
}
