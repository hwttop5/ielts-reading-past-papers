import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { requireCsrfToken, requireSessionClaims } from '../lib/session.js'
import { getSyncState, mergeAndSaveSyncState } from '../lib/userStore.js'
import { normalizeSyncSnapshot } from '../lib/sync.js'
import type { SyncMergeResult, SyncSnapshot } from '../types/sync.js'

const syncPushSchema = z.object({
  baseRevision: z.number().int().nonnegative().nullable().optional(),
  snapshot: z.unknown()
})

export async function registerSyncRoutes(app: FastifyInstance) {
  app.get('/api/sync/pull', async (request, reply) => {
    const claims = requireSessionClaims(app, request, reply)
    if (!claims) {
      return
    }

    const state = getSyncState(claims.sub)
    reply.send({
      revision: state.revision,
      snapshot: state.snapshot
    })
  })

  app.post('/api/sync/push', async (request, reply) => {
    const claims = requireSessionClaims(app, request, reply)
    if (!claims) {
      return
    }

    if (!requireCsrfToken(request, reply, claims)) {
      return
    }

    let payload: z.infer<typeof syncPushSchema>
    try {
      payload = syncPushSchema.parse(request.body)
    } catch (error) {
      reply.code(400).send({
        error: 'invalid_request',
        message: error instanceof Error ? error.message : 'Invalid sync payload.'
      })
      return
    }

    const snapshot = normalizeSyncSnapshot(payload.snapshot)
    const merged = mergeAndSaveSyncState(claims.sub, snapshot, payload.baseRevision ?? null)
    const response: SyncMergeResult = {
      revision: merged.revision,
      snapshot: merged.snapshot,
      mergedAt: merged.updatedAt,
      clientRevision: merged.clientRevision,
      serverRevision: merged.revision,
      clientWasStale: merged.clientWasStale
    }

    reply.send(response)
  })
}
