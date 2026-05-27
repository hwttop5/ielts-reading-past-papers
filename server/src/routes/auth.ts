import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { env } from '../config/env.js'
import {
  clearSessionCookie,
  readSessionClaims,
  requireCsrfToken,
  requireSessionClaims,
  signSessionToken,
  setSessionCookie
} from '../lib/session.js'
import {
  createPasswordResetToken,
  createUser,
  getPasswordResetTokenByHash,
  getRecentPasswordResetToken,
  getUserByEmail,
  getUserById,
  getOrCreateSyncState,
  markPasswordResetTokenUsed,
  resetUserPasswordWithToken,
  toSessionUser
} from '../lib/userStore.js'
import { hashPassword, verifyPassword } from '../lib/password.js'
import { createPasswordResetTokenValue, hashPasswordResetToken } from '../lib/passwordResetToken.js'
import { isPasswordResetMailConfigured, sendPasswordResetEmail } from '../lib/passwordResetMailer.js'
import type {
  AuthSessionResponse,
  CurrentSessionResponse,
  LoginRequest,
  LogoutResponse,
  PasswordResetConfirmRequest,
  PasswordResetRequest,
  PasswordResetRequestResponse,
  RegisterRequest
} from '../types/auth.js'

const authRequestSchema = z.object({
  email: z.string().trim().email().max(255),
  password: z.string().trim().min(8).max(128)
})

const passwordResetRequestSchema = z.object({
  email: z.string().trim().email().max(255),
  locale: z.enum(['zh', 'en']).default('zh').optional()
})

const passwordResetConfirmSchema = z.object({
  token: z.string().trim().min(32).max(256),
  password: z.string().min(8).max(128)
})

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

function buildPasswordResetUrl(token: string): string {
  const url = new URL('/reset-password', env.PASSWORD_RESET_URL_BASE)
  url.searchParams.set('token', token)
  return url.toString()
}

function sendPasswordResetOk(reply: { send: (payload: PasswordResetRequestResponse) => void }): void {
  reply.send({ ok: true })
}

function sendInvalidResetToken(reply: { code: (statusCode: number) => { send: (payload: { error: string; message: string }) => void } }): void {
  reply.code(400).send({
    error: 'invalid_reset_token',
    message: 'Password reset link is invalid or expired.'
  })
}

export async function registerAuthRoutes(app: FastifyInstance) {
  app.get('/api/auth/me', async (request, reply): Promise<CurrentSessionResponse> => {
    const claims = readSessionClaims(app, request)
    if (!claims) {
      return {
        user: null,
        csrfToken: null
      }
    }

    const user = getUserById(claims.sub)
    if (!user) {
      clearSessionCookie(reply)
      return {
        user: null,
        csrfToken: null
      }
    }

    return {
      user: toSessionUser(user),
      csrfToken: claims.csrf
    }
  })

  app.post('/api/auth/register', async (request, reply) => {
    let payload: RegisterRequest
    try {
      payload = authRequestSchema.parse(request.body)
    } catch (error) {
      reply.code(400).send({
        error: 'invalid_request',
        message: error instanceof Error ? error.message : 'Invalid registration payload.'
      })
      return
    }

    const email = normalizeEmail(payload.email)
    const existing = getUserByEmail(email)
    if (existing) {
      reply.code(409).send({
        error: 'account_exists',
        message: 'An account with this email already exists.'
      })
      return
    }

    const passwordHash = await hashPassword(payload.password)
    const user = createUser(email, passwordHash)
    const { token, claims } = signSessionToken(app, user, 0)
    setSessionCookie(reply, token)
    getOrCreateSyncState(user.id)

    reply.send({
      user,
      csrfToken: claims.csrf
    } satisfies AuthSessionResponse)
  })

  app.post('/api/auth/login', async (request, reply) => {
    let payload: LoginRequest
    try {
      payload = authRequestSchema.parse(request.body)
    } catch (error) {
      reply.code(400).send({
        error: 'invalid_request',
        message: error instanceof Error ? error.message : 'Invalid login payload.'
      })
      return
    }

    const email = normalizeEmail(payload.email)
    const user = getUserByEmail(email)
    if (!user) {
      reply.code(401).send({
        error: 'invalid_credentials',
        message: 'Email or password is incorrect.'
      })
      return
    }

    const passwordOk = await verifyPassword(payload.password, user.passwordHash)
    if (!passwordOk) {
      reply.code(401).send({
        error: 'invalid_credentials',
        message: 'Email or password is incorrect.'
      })
      return
    }

    const sessionUser = toSessionUser(user)
    const { token, claims } = signSessionToken(app, sessionUser, user.sessionVersion)
    setSessionCookie(reply, token)
    getOrCreateSyncState(user.id)

    reply.send({
      user: sessionUser,
      csrfToken: claims.csrf
    } satisfies AuthSessionResponse)
  })

  app.post('/api/auth/password-reset/request', async (request, reply): Promise<PasswordResetRequestResponse | void> => {
    let payload: PasswordResetRequest
    try {
      payload = passwordResetRequestSchema.parse(request.body)
    } catch (error) {
      reply.code(400).send({
        error: 'invalid_request',
        message: error instanceof Error ? error.message : 'Invalid password reset request.'
      })
      return
    }

    if (!isPasswordResetMailConfigured()) {
      reply.code(503).send({
        error: 'mail_unavailable',
        message: 'Password reset email is not configured.'
      })
      return
    }

    const email = normalizeEmail(payload.email)
    const user = getUserByEmail(email)
    if (!user) {
      sendPasswordResetOk(reply)
      return
    }

    const now = Date.now()
    const cooldownMs = env.PASSWORD_RESET_COOLDOWN_MINUTES * 60 * 1000
    const recent = getRecentPasswordResetToken(user.id, now - cooldownMs)
    if (recent) {
      sendPasswordResetOk(reply)
      return
    }

    const tokenValue = createPasswordResetTokenValue()
    const tokenHash = hashPasswordResetToken(tokenValue)
    const expiresAt = now + env.PASSWORD_RESET_TOKEN_TTL_MINUTES * 60 * 1000
    const resetToken = createPasswordResetToken(user.id, tokenHash, expiresAt, now)

    try {
      await sendPasswordResetEmail({
        to: user.email,
        resetUrl: buildPasswordResetUrl(tokenValue),
        locale: payload.locale ?? 'zh',
        expiresInMinutes: env.PASSWORD_RESET_TOKEN_TTL_MINUTES
      })
    } catch (error) {
      markPasswordResetTokenUsed(resetToken.id, Date.now())
      app.log.error(
        {
          userId: user.id,
          detail: error instanceof Error ? error.message : String(error)
        },
        'Password reset email failed.'
      )
    }

    sendPasswordResetOk(reply)
  })

  app.post('/api/auth/password-reset/confirm', async (request, reply) => {
    let payload: PasswordResetConfirmRequest
    try {
      payload = passwordResetConfirmSchema.parse(request.body)
    } catch (error) {
      reply.code(400).send({
        error: 'invalid_request',
        message: error instanceof Error ? error.message : 'Invalid password reset confirmation.'
      })
      return
    }

    const now = Date.now()
    const tokenHash = hashPasswordResetToken(payload.token)
    const resetToken = getPasswordResetTokenByHash(tokenHash)
    if (!resetToken || resetToken.usedAt !== null) {
      sendInvalidResetToken(reply)
      return
    }
    if (resetToken.expiresAt <= now) {
      markPasswordResetTokenUsed(resetToken.id, now)
      sendInvalidResetToken(reply)
      return
    }

    const user = getUserById(resetToken.userId)
    if (!user) {
      markPasswordResetTokenUsed(resetToken.id, now)
      sendInvalidResetToken(reply)
      return
    }

    const passwordHash = await hashPassword(payload.password)
    const updatedUser = resetUserPasswordWithToken(user.id, resetToken.id, passwordHash, now)
    if (!updatedUser) {
      sendInvalidResetToken(reply)
      return
    }

    const sessionUser = toSessionUser(updatedUser)
    const { token, claims } = signSessionToken(app, sessionUser, updatedUser.sessionVersion)
    setSessionCookie(reply, token)
    getOrCreateSyncState(updatedUser.id)

    reply.send({
      user: sessionUser,
      csrfToken: claims.csrf
    } satisfies AuthSessionResponse)
  })

  app.post('/api/auth/logout', async (request, reply): Promise<LogoutResponse | void> => {
    const claims = requireSessionClaims(app, request, reply)
    if (!claims) {
      return
    }

    if (!requireCsrfToken(request, reply, claims)) {
      return
    }

    clearSessionCookie(reply)
    reply.send({ ok: true })
  })
}
