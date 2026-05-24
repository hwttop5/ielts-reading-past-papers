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
}

export interface DbSyncRow {
  userId: string
  revision: number
  snapshot: SyncSnapshot
  updatedAt: number
}

let db: Database.Database | null = null

function ensureDirectory(filePath: string): void {
  mkdirSync(dirname(filePath), { recursive: true })
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
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sync_state (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      revision INTEGER NOT NULL DEFAULT 0,
      snapshot_json TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `)
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
    'INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)'
  )
  insertUser.run(id, email, passwordHash, now)
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
    .prepare('SELECT id, email, password_hash AS passwordHash, created_at AS createdAt FROM users WHERE email = ?')
    .get(email) as DbUserRow | undefined

  return row ?? null
}

export function getUserById(id: string): DbUserRow | null {
  const database = getDatabase()
  const row = database
    .prepare('SELECT id, email, password_hash AS passwordHash, created_at AS createdAt FROM users WHERE id = ?')
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
