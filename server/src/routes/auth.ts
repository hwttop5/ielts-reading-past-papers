import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import {
  clearSessionCookie,
  readSessionClaims,
  requireCsrfToken,
  requireSessionClaims,
  signSessionToken,
  setSessionCookie
} from '../lib/session.js'
import { createUser, getUserByEmail, getUserById, getOrCreateSyncState, toSessionUser } from '../lib/userStore.js'
import { hashPassword, verifyPassword } from '../lib/password.js'
import type { AuthSessionResponse, CurrentSessionResponse, LoginRequest, LogoutResponse, RegisterRequest } from '../types/auth.js'

const authRequestSchema = z.object({
  email: z.string().trim().email().max(255),
  password: z.string().trim().min(8).max(128)
})

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
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
    const { token, claims } = signSessionToken(app, user)
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
    const { token, claims } = signSessionToken(app, sessionUser)
    setSessionCookie(reply, token)
    getOrCreateSyncState(user.id)

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
