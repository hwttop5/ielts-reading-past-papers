import Database from 'better-sqlite3'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { randomUUID } from 'node:crypto'
import { env } from '../config/env.js'
import type { SessionUser } from '../types/auth.js'
import type { SyncSnapshot } from '../types/sync.js'
import { createDefaultSyncSnapshot, mergeSyncSnapshots, normalizeSyncSnapshot } from './sync.js'

export interface DbUserRow {
  id: string
  email: string
  passwordHash: string
  createdAt: number
  sessionVersion: number
}

export interface DbSyncRow {
  userId: string
  revision: number
  snapshot: SyncSnapshot
  updatedAt: number
}

export interface DbPasswordResetTokenRow {
  id: string
  userId: string
  tokenHash: string
  createdAt: number
  expiresAt: number
  usedAt: number | null
}

let db: Database.Database | null = null

function ensureDirectory(filePath: string): void {
  mkdirSync(dirname(filePath), { recursive: true })
}

function ensureUserSchema(instance: Database.Database): void {
  const userColumns = instance.prepare('PRAGMA table_info(users)').all() as Array<{ name: string }>
  const hasSessionVersion = userColumns.some((column) => column.name === 'session_version')
  if (!hasSessionVersion) {
    instance.exec('ALTER TABLE users ADD COLUMN session_version INTEGER NOT NULL DEFAULT 0')
  }
}

function createDatabase(): Database.Database {
  ensureDirectory(env.SYNC_DATABASE_PATH)
  const instance = new Database(env.SYNC_DATABASE_PATH)
  instance.pragma('journal_mode = WAL')
  instance.pragma('foreign_keys = ON')
  instance.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE COLLATE NOCASE,
      password_hash TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      session_version INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS sync_state (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      revision INTEGER NOT NULL DEFAULT 0,
      snapshot_json TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      used_at INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user_created
      ON password_reset_tokens(user_id, created_at DESC);
  `)
  ensureUserSchema(instance)
  return instance
}

export function getDatabase(): Database.Database {
  if (!db) {
    db = createDatabase()
  }

  return db
}

export function closeDatabase(): void {
  if (db) {
    db.close()
    db = null
  }
}

function ensureSyncRow(userId: string, now = Date.now()): DbSyncRow {
  const database = getDatabase()
  const existing = database
    .prepare('SELECT user_id AS userId, revision, snapshot_json AS snapshotJson, updated_at AS updatedAt FROM sync_state WHERE user_id = ?')
    .get(userId) as { userId: string; revision: number; snapshotJson: string; updatedAt: number } | undefined

  if (existing) {
    return {
      userId: existing.userId,
      revision: existing.revision,
      snapshot: normalizeSyncSnapshot(JSON.parse(existing.snapshotJson), now),
      updatedAt: existing.updatedAt
    }
  }

  const snapshot = createDefaultSyncSnapshot(0)
  database
    .prepare(
      'INSERT INTO sync_state (user_id, revision, snapshot_json, updated_at) VALUES (?, ?, ?, ?)'
    )
    .run(userId, 0, JSON.stringify(snapshot), 0)

  return {
    userId,
    revision: 0,
    snapshot,
    updatedAt: 0
  }
}

export function createUser(email: string, passwordHash: string): SessionUser {
  const database = getDatabase()
  const now = Date.now()
  const id = randomUUID()

  const insertUser = database.prepare(
    'INSERT INTO users (id, email, password_hash, created_at, session_version) VALUES (?, ?, ?, ?, ?)'
  )
  insertUser.run(id, email, passwordHash, now, 0)
  ensureSyncRow(id, now)

  return {
    id,
    email,
    createdAt: now
  }
}

export function getUserByEmail(email: string): DbUserRow | null {
  const database = getDatabase()
  const row = database
    .prepare('SELECT id, email, password_hash AS passwordHash, created_at AS createdAt, session_version AS sessionVersion FROM users WHERE email = ?')
    .get(email) as DbUserRow | undefined

  return row ?? null
}

export function getUserById(id: string): DbUserRow | null {
  const database = getDatabase()
  const row = database
    .prepare('SELECT id, email, password_hash AS passwordHash, created_at AS createdAt, session_version AS sessionVersion FROM users WHERE id = ?')
    .get(id) as DbUserRow | undefined

  return row ?? null
}

export function toSessionUser(row: DbUserRow | SessionUser): SessionUser {
  return {
    id: row.id,
    email: row.email,
    createdAt: row.createdAt
  }
}

export function getOrCreateSyncState(userId: string): DbSyncRow {
  return ensureSyncRow(userId)
}

export function saveSyncState(userId: string, snapshot: SyncSnapshot, revision: number, now = Date.now()): DbSyncRow {
  const database = getDatabase()
  const normalized = normalizeSyncSnapshot(snapshot, now)

  database
    .prepare(
      'INSERT INTO sync_state (user_id, revision, snapshot_json, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET revision = excluded.revision, snapshot_json = excluded.snapshot_json, updated_at = excluded.updated_at'
    )
    .run(userId, revision, JSON.stringify(normalized), now)

  return {
    userId,
    revision,
    snapshot: normalized,
    updatedAt: now
  }
}

export function getSyncState(userId: string): DbSyncRow {
  return ensureSyncRow(userId)
}

export function mergeAndSaveSyncState(
  userId: string,
  incomingSnapshot: SyncSnapshot,
  baseRevision: number | null,
  now = Date.now()
): DbSyncRow & { clientRevision: number; clientWasStale: boolean } {
  const current = ensureSyncRow(userId, now)
  const merged = mergeSyncSnapshots(current.snapshot, incomingSnapshot, now)
  const currentJson = JSON.stringify(normalizeSyncSnapshot(current.snapshot, now))
  const mergedJson = JSON.stringify(merged)
  const changed = mergedJson !== currentJson
  const revision = changed ? current.revision + 1 : current.revision

  const saved = saveSyncState(userId, merged, revision, now)

  return {
    ...saved,
    clientRevision: baseRevision ?? current.revision,
    clientWasStale: baseRevision !== null ? baseRevision !== current.revision : false
  }
}

export function getRecentPasswordResetToken(userId: string, since: number): DbPasswordResetTokenRow | null {
  const database = getDatabase()
  const row = database
    .prepare(
      'SELECT id, user_id AS userId, token_hash AS tokenHash, created_at AS createdAt, expires_at AS expiresAt, used_at AS usedAt FROM password_reset_tokens WHERE user_id = ? AND created_at >= ? ORDER BY created_at DESC LIMIT 1'
    )
    .get(userId, since) as DbPasswordResetTokenRow | undefined

  return row ?? null
}

export function createPasswordResetToken(userId: string, tokenHash: string, expiresAt: number, now = Date.now()): DbPasswordResetTokenRow {
  const database = getDatabase()
  const id = randomUUID()

  const transaction = database.transaction(() => {
    database
      .prepare('UPDATE password_reset_tokens SET used_at = ? WHERE user_id = ? AND used_at IS NULL')
      .run(now, userId)
    database
      .prepare(
        'INSERT INTO password_reset_tokens (id, user_id, token_hash, created_at, expires_at, used_at) VALUES (?, ?, ?, ?, ?, NULL)'
      )
      .run(id, userId, tokenHash, now, expiresAt)
  })
  transaction()

  return {
    id,
    userId,
    tokenHash,
    createdAt: now,
    expiresAt,
    usedAt: null
  }
}

export function getPasswordResetTokenByHash(tokenHash: string): DbPasswordResetTokenRow | null {
  const database = getDatabase()
  const row = database
    .prepare(
      'SELECT id, user_id AS userId, token_hash AS tokenHash, created_at AS createdAt, expires_at AS expiresAt, used_at AS usedAt FROM password_reset_tokens WHERE token_hash = ?'
    )
    .get(tokenHash) as DbPasswordResetTokenRow | undefined

  return row ?? null
}

export function markPasswordResetTokenUsed(id: string, now = Date.now()): void {
  const database = getDatabase()
  database
    .prepare('UPDATE password_reset_tokens SET used_at = ? WHERE id = ? AND used_at IS NULL')
    .run(now, id)
}

export function resetUserPasswordWithToken(userId: string, tokenId: string, passwordHash: string, now = Date.now()): DbUserRow | null {
  const database = getDatabase()
  const transaction = database.transaction(() => {
    const used = database
      .prepare('UPDATE password_reset_tokens SET used_at = ? WHERE id = ? AND user_id = ? AND used_at IS NULL')
      .run(now, tokenId, userId)
    if (used.changes !== 1) {
      return null
    }

    database
      .prepare('UPDATE password_reset_tokens SET used_at = ? WHERE user_id = ? AND used_at IS NULL')
      .run(now, userId)
    database
      .prepare('UPDATE users SET password_hash = ?, session_version = session_version + 1 WHERE id = ?')
      .run(passwordHash, userId)

    return getUserById(userId)
  })

  return transaction()
}
