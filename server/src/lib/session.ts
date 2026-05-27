import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { randomBytes } from 'node:crypto'
import type { SessionClaims, SessionUser } from '../types/auth.js'
import { getUserById } from './userStore.js'

export const SESSION_COOKIE_NAME = 'ielts_session'
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30

function isProduction() {
  return process.env.NODE_ENV === 'production'
}

export function buildSessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: isProduction() ? ('none' as const) : ('lax' as const),
    secure: isProduction(),
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS
  }
}

function claimSessionVersion(claims: SessionClaims): number {
  return typeof claims.ver === 'number' ? claims.ver : 0
}

function isCurrentSessionVersion(claims: SessionClaims): boolean {
  const user = getUserById(claims.sub)
  if (!user) {
    return false
  }
  return claimSessionVersion(claims) === user.sessionVersion
}

export function buildSessionClaims(user: SessionUser, sessionVersion = 0): SessionClaims {
  return {
    sub: user.id,
    email: user.email,
    csrf: randomBytes(16).toString('hex'),
    ver: sessionVersion
  }
}

export function signSessionToken(app: FastifyInstance, user: SessionUser, sessionVersion = 0): { token: string; claims: SessionClaims } {
  const claims = buildSessionClaims(user, sessionVersion)
  const token = app.jwt.sign(claims, {
    expiresIn: `${SESSION_MAX_AGE_SECONDS}s`
  })
  return { token, claims }
}

export function readSessionClaims(app: FastifyInstance, request: FastifyRequest): SessionClaims | null {
  const token = request.cookies[SESSION_COOKIE_NAME]
  if (!token) {
    return null
  }

  try {
    const claims = app.jwt.verify(token) as SessionClaims
    if (!claims || typeof claims !== 'object') {
      return null
    }
    if (typeof claims.sub !== 'string' || typeof claims.email !== 'string' || typeof claims.csrf !== 'string') {
      return null
    }
    if (claims.ver !== undefined && typeof claims.ver !== 'number') {
      return null
    }
    if (!isCurrentSessionVersion(claims)) {
      return null
    }
    return claims
  } catch {
    return null
  }
}

export function requireSessionClaims(app: FastifyInstance, request: FastifyRequest, reply: FastifyReply): SessionClaims | null {
  const claims = readSessionClaims(app, request)
  if (!claims) {
    clearSessionCookie(reply)
    reply.code(401).send({
      error: 'unauthorized',
      message: 'Authentication required.'
    })
    return null
  }
  return claims
}

export function requireCsrfToken(request: FastifyRequest, reply: FastifyReply, claims: SessionClaims): boolean {
  const raw = request.headers['x-csrf-token']
  const token = Array.isArray(raw) ? raw[0] : raw
  if (typeof token !== 'string' || token !== claims.csrf) {
    reply.code(403).send({
      error: 'csrf_invalid',
      message: 'Invalid CSRF token.'
    })
    return false
  }

  return true
}

export function setSessionCookie(reply: FastifyReply, token: string): void {
  reply.setCookie(SESSION_COOKIE_NAME, token, buildSessionCookieOptions())
}

export function clearSessionCookie(reply: FastifyReply): void {
  reply.clearCookie(SESSION_COOKIE_NAME, buildSessionCookieOptions())
}
