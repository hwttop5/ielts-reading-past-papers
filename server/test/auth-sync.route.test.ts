import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SyncSnapshot } from '../src/types/sync.js'

const ORIGINAL_ENV = { ...process.env }
const PASSWORD = 'password123'
const RESET_ENV = {
  SMTP_HOST: 'smtp.example.test',
  SMTP_PORT: '587',
  SMTP_SECURE: 'false',
  SMTP_FROM: 'IELTS Reading <no-reply@example.test>',
  PASSWORD_RESET_URL_BASE: 'https://ielts.example.test',
  PASSWORD_RESET_TOKEN_TTL_MINUTES: '30',
  PASSWORD_RESET_COOLDOWN_MINUTES: '5'
}

async function withTestApp<T>(run: (app: FastifyInstance) => Promise<T>, envOverrides: Record<string, string> = {}): Promise<T> {
  const dir = mkdtempSync(join(tmpdir(), 'ielts-auth-sync-'))
  process.env = {
    ...ORIGINAL_ENV,
    NODE_ENV: 'test',
    SESSION_JWT_SECRET: 'test-session-secret',
    SYNC_DATABASE_PATH: join(dir, 'sync.sqlite'),
    FRONTEND_ORIGIN: 'http://localhost:5175',
    SMTP_HOST: '',
    SMTP_PORT: '',
    SMTP_SECURE: '',
    SMTP_USER: '',
    SMTP_PASS: '',
    SMTP_FROM: '',
    PASSWORD_RESET_URL_BASE: '',
    ...envOverrides
  }
  vi.resetModules()
  const { createApp } = await import('../src/app.js')
  const { closeDatabase } = await import('../src/lib/userStore.js')
  const app = await createApp()

  try {
    return await run(app)
  } finally {
    await app.close()
    closeDatabase()
    rmSync(dir, { recursive: true, force: true })
  }
}

function getSessionCookie(response: { headers: Record<string, unknown> }): string {
  const raw = response.headers['set-cookie']
  const value = Array.isArray(raw) ? raw[0] : raw
  if (typeof value !== 'string') {
    throw new Error('Missing set-cookie header.')
  }
  return value.split(';')[0]
}

async function register(app: FastifyInstance, email = 'User@Example.com') {
  const response = await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: {
      email,
      password: PASSWORD
    }
  })
  expect(response.statusCode).toBe(200)
  const body = response.json()
  return {
    response,
    cookie: getSessionCookie(response),
    csrfToken: body.csrfToken as string,
    userId: body.user.id as string,
    email: body.user.email as string
  }
}

function snapshot(overrides: Partial<SyncSnapshot> = {}): SyncSnapshot {
  const now = Date.now()
  return {
    version: 1,
    updatedAt: now,
    practice: {
      records: [],
      deletedRecordIds: [],
      clearedAt: null,
      updatedAt: now
    },
    achievements: {
      unlocked: [],
      resetAt: null,
      updatedAt: now
    },
    settings: {
      theme: 'light',
      language: 'zh',
      showTutorial: true,
      autoSave: true,
      updatedAt: now
    },
    ...overrides
  }
}

describe('auth and sync routes', () => {
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV }
    vi.restoreAllMocks()
  })

  it('registers, rejects duplicates, logs in, and requires CSRF on logout', async () => {
    await withTestApp(async (app) => {
      const registered = await register(app)
      expect(registered.email).toBe('user@example.com')

      const duplicate = await app.inject({
        method: 'POST',
        url: '/api/auth/register',
        payload: {
          email: 'user@example.com',
          password: PASSWORD
        }
      })
      expect(duplicate.statusCode).toBe(409)

      const wrongPassword = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: {
          email: 'user@example.com',
          password: 'wrong-password'
        }
      })
      expect(wrongPassword.statusCode).toBe(401)

      const login = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: {
          email: 'user@example.com',
          password: PASSWORD
        }
      })
      expect(login.statusCode).toBe(200)

      const cookie = getSessionCookie(login)
      const me = await app.inject({
        method: 'GET',
        url: '/api/auth/me',
        headers: {
          cookie
        }
      })
      expect(me.statusCode).toBe(200)
      expect(me.json().user.email).toBe('user@example.com')

      const missingCsrf = await app.inject({
        method: 'POST',
        url: '/api/auth/logout',
        headers: {
          cookie
        }
      })
      expect(missingCsrf.statusCode).toBe(403)

      const logout = await app.inject({
        method: 'POST',
        url: '/api/auth/logout',
        headers: {
          cookie,
          'x-csrf-token': login.json().csrfToken
        }
      })
      expect(logout.statusCode).toBe(200)
      expect(logout.json()).toEqual({ ok: true })
    })
  })

  it('generates a persistent production session secret when none is configured', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ielts-auth-secret-'))
    process.env = {
      ...ORIGINAL_ENV,
      NODE_ENV: 'production',
      SESSION_JWT_SECRET: '',
      SYNC_DATABASE_PATH: join(dir, 'sync.sqlite'),
      FRONTEND_ORIGIN: 'https://example.com'
    }
    vi.resetModules()

    try {
      const { env, requireSessionJwtSecret } = await import('../src/config/env.js')
      const firstSecret = requireSessionJwtSecret()
      const secretPath = join(dir, 'session-secret')

      expect(firstSecret).toHaveLength(64)
      expect(env.SESSION_JWT_SECRET).toBe(firstSecret)
      expect(existsSync(secretPath)).toBe(true)
      expect(readFileSync(secretPath, 'utf8').trim()).toBe(firstSecret)

      vi.resetModules()
      const reloaded = await import('../src/config/env.js')
      expect(reloaded.requireSessionJwtSecret()).toBe(firstSecret)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('guards sync routes with session and CSRF', async () => {
    await withTestApp(async (app) => {
      const unauthenticatedPull = await app.inject({
        method: 'GET',
        url: '/api/sync/pull'
      })
      expect(unauthenticatedPull.statusCode).toBe(401)

      const registered = await register(app)
      const forbiddenPush = await app.inject({
        method: 'POST',
        url: '/api/sync/push',
        headers: {
          cookie: registered.cookie
        },
        payload: {
          baseRevision: 0,
          snapshot: snapshot()
        }
      })
      expect(forbiddenPush.statusCode).toBe(403)
    })
  })

  it('returns the same password reset request result for registered and unknown emails', async () => {
    await withTestApp(async (app) => {
      const sent: Array<{ to: string; resetUrl: string; locale: 'zh' | 'en'; expiresInMinutes: number }> = []
      const { setPasswordResetMailerForTests } = await import('../src/lib/passwordResetMailer.js')
      setPasswordResetMailerForTests((payload) => {
        sent.push(payload)
      })

      await register(app)

      const unknown = await app.inject({
        method: 'POST',
        url: '/api/auth/password-reset/request',
        payload: {
          email: 'missing@example.com',
          locale: 'en'
        }
      })
      expect(unknown.statusCode).toBe(200)
      expect(unknown.json()).toEqual({ ok: true })
      expect(sent).toHaveLength(0)

      const known = await app.inject({
        method: 'POST',
        url: '/api/auth/password-reset/request',
        payload: {
          email: 'USER@example.com',
          locale: 'en'
        }
      })
      expect(known.statusCode).toBe(200)
      expect(known.json()).toEqual({ ok: true })
      expect(sent).toHaveLength(1)
      expect(sent[0].to).toBe('user@example.com')
      expect(sent[0].locale).toBe('en')

      const duplicate = await app.inject({
        method: 'POST',
        url: '/api/auth/password-reset/request',
        payload: {
          email: 'user@example.com',
          locale: 'en'
        }
      })
      expect(duplicate.statusCode).toBe(200)
      expect(sent).toHaveLength(1)
    }, RESET_ENV)
  })

  it('requires SMTP configuration before accepting password reset requests', async () => {
    await withTestApp(async (app) => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/password-reset/request',
        payload: {
          email: 'user@example.com'
        }
      })

      expect(response.statusCode).toBe(503)
      expect(response.json().error).toBe('mail_unavailable')
    })
  })

  it('resets a password with a one-time hashed token and invalidates old sessions', async () => {
    await withTestApp(async (app) => {
      const sent: Array<{ resetUrl: string }> = []
      const { setPasswordResetMailerForTests } = await import('../src/lib/passwordResetMailer.js')
      setPasswordResetMailerForTests((payload) => {
        sent.push(payload)
      })

      const registered = await register(app)
      const request = await app.inject({
        method: 'POST',
        url: '/api/auth/password-reset/request',
        payload: {
          email: 'user@example.com'
        }
      })
      expect(request.statusCode).toBe(200)
      expect(sent).toHaveLength(1)

      const resetUrl = new URL(sent[0].resetUrl)
      expect(resetUrl.origin).toBe('https://ielts.example.test')
      expect(resetUrl.pathname).toBe('/reset-password')
      const rawToken = resetUrl.searchParams.get('token')
      expect(rawToken).toBeTruthy()

      const { getDatabase } = await import('../src/lib/userStore.js')
      const tokenRow = getDatabase()
        .prepare('SELECT token_hash AS tokenHash FROM password_reset_tokens')
        .get() as { tokenHash: string }
      expect(tokenRow.tokenHash).toHaveLength(64)
      expect(tokenRow.tokenHash).not.toBe(rawToken)

      const confirm = await app.inject({
        method: 'POST',
        url: '/api/auth/password-reset/confirm',
        payload: {
          token: rawToken,
          password: 'new-password-123'
        }
      })
      expect(confirm.statusCode).toBe(200)
      expect(confirm.json().user.email).toBe('user@example.com')

      const oldSessionSync = await app.inject({
        method: 'GET',
        url: '/api/sync/pull',
        headers: {
          cookie: registered.cookie
        }
      })
      expect(oldSessionSync.statusCode).toBe(401)

      const oldPassword = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: {
          email: 'user@example.com',
          password: PASSWORD
        }
      })
      expect(oldPassword.statusCode).toBe(401)

      const newPassword = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: {
          email: 'user@example.com',
          password: 'new-password-123'
        }
      })
      expect(newPassword.statusCode).toBe(200)

      const reuse = await app.inject({
        method: 'POST',
        url: '/api/auth/password-reset/confirm',
        payload: {
          token: rawToken,
          password: 'another-password-123'
        }
      })
      expect(reuse.statusCode).toBe(400)
      expect(reuse.json().error).toBe('invalid_reset_token')
    }, RESET_ENV)
  })

  it('rejects expired password reset tokens', async () => {
    await withTestApp(async (app) => {
      const sent: Array<{ resetUrl: string }> = []
      const { setPasswordResetMailerForTests } = await import('../src/lib/passwordResetMailer.js')
      setPasswordResetMailerForTests((payload) => {
        sent.push(payload)
      })

      await register(app)
      const request = await app.inject({
        method: 'POST',
        url: '/api/auth/password-reset/request',
        payload: {
          email: 'user@example.com'
        }
      })
      expect(request.statusCode).toBe(200)
      const rawToken = new URL(sent[0].resetUrl).searchParams.get('token')
      expect(rawToken).toBeTruthy()

      const { getDatabase } = await import('../src/lib/userStore.js')
      getDatabase()
        .prepare('UPDATE password_reset_tokens SET expires_at = ?')
        .run(Date.now() - 1)

      const confirm = await app.inject({
        method: 'POST',
        url: '/api/auth/password-reset/confirm',
        payload: {
          token: rawToken,
          password: 'new-password-123'
        }
      })
      expect(confirm.statusCode).toBe(400)
      expect(confirm.json().error).toBe('invalid_reset_token')
    }, RESET_ENV)
  })

  it('merges first-login visitor data into the account snapshot', async () => {
    await withTestApp(async (app) => {
      const registered = await register(app)
      const local = snapshot({
        practice: {
          records: [
            {
              id: 'local-record',
              questionId: 'p1-high-05',
              time: 1710000000000
            }
          ],
          deletedRecordIds: [],
          clearedAt: null,
          updatedAt: 1710000000000
        },
        achievements: {
          unlocked: [{ id: 'first_practice', unlockedAt: 1710000000100 }],
          resetAt: null,
          updatedAt: 1710000000100
        },
        settings: {
          theme: 'dark',
          language: 'en',
          showTutorial: false,
          autoSave: true,
          updatedAt: 1710000000200
        }
      })

      const push = await app.inject({
        method: 'POST',
        url: '/api/sync/push',
        headers: {
          cookie: registered.cookie,
          'x-csrf-token': registered.csrfToken
        },
        payload: {
          baseRevision: 0,
          snapshot: local
        }
      })
      expect(push.statusCode).toBe(200)
      expect(push.json().snapshot.practice.records).toHaveLength(1)
      expect(push.json().snapshot.settings.theme).toBe('dark')

      const pull = await app.inject({
        method: 'GET',
        url: '/api/sync/pull',
        headers: {
          cookie: registered.cookie
        }
      })
      expect(pull.statusCode).toBe(200)
      expect(pull.json().snapshot.practice.records[0].id).toBe('local-record')
      expect(pull.json().snapshot.achievements.unlocked[0].id).toBe('first_practice')
    })
  })

  it('propagates deleted records and full clears through sync merge', async () => {
    await withTestApp(async (app) => {
      const registered = await register(app)
      const baseTime = 1710000000000

      const firstPush = await app.inject({
        method: 'POST',
        url: '/api/sync/push',
        headers: {
          cookie: registered.cookie,
          'x-csrf-token': registered.csrfToken
        },
        payload: {
          baseRevision: 0,
          snapshot: snapshot({
            practice: {
              records: [
                { id: 'record-a', questionId: 'a', time: baseTime },
                { id: 'record-b', questionId: 'b', time: baseTime + 1 }
              ],
              deletedRecordIds: [],
              clearedAt: null,
              updatedAt: baseTime + 1
            }
          })
        }
      })
      expect(firstPush.statusCode).toBe(200)
      const firstRevision = firstPush.json().revision as number

      const deletePush = await app.inject({
        method: 'POST',
        url: '/api/sync/push',
        headers: {
          cookie: registered.cookie,
          'x-csrf-token': registered.csrfToken
        },
        payload: {
          baseRevision: firstRevision,
          snapshot: snapshot({
            practice: {
              records: [{ id: 'record-b', questionId: 'b', time: baseTime + 1 }],
              deletedRecordIds: ['record-a'],
              clearedAt: null,
              updatedAt: baseTime + 2
            }
          })
        }
      })
      expect(deletePush.statusCode).toBe(200)
      expect(deletePush.json().snapshot.practice.records.map((entry: { id: string }) => entry.id)).toEqual(['record-b'])
      expect(deletePush.json().snapshot.practice.deletedRecordIds).toContain('record-a')

      const clearPush = await app.inject({
        method: 'POST',
        url: '/api/sync/push',
        headers: {
          cookie: registered.cookie,
          'x-csrf-token': registered.csrfToken
        },
        payload: {
          baseRevision: deletePush.json().revision,
          snapshot: snapshot({
            practice: {
              records: [],
              deletedRecordIds: ['record-a'],
              clearedAt: baseTime + 10,
              updatedAt: baseTime + 10
            }
          })
        }
      })
      expect(clearPush.statusCode).toBe(200)
      expect(clearPush.json().snapshot.practice.records).toEqual([])
      expect(clearPush.json().snapshot.practice.clearedAt).toBe(baseTime + 10)
    })
  })
})
