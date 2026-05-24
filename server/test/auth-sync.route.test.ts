import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SyncSnapshot } from '../src/types/sync.js'

const ORIGINAL_ENV = { ...process.env }
const PASSWORD = 'password123'

async function withTestApp<T>(run: (app: FastifyInstance) => Promise<T>): Promise<T> {
  const dir = mkdtempSync(join(tmpdir(), 'ielts-auth-sync-'))
  process.env = {
    ...ORIGINAL_ENV,
    NODE_ENV: 'test',
    SESSION_JWT_SECRET: 'test-session-secret',
    SYNC_DATABASE_PATH: join(dir, 'sync.sqlite'),
    FRONTEND_ORIGIN: 'http://localhost:5175'
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
