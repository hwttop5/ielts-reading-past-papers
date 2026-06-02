import type { FastifyInstance } from 'fastify'
import { loadContactAd, loadContactAdAsset, startContactAdSyncScheduler } from '../lib/contactAd.js'

export async function registerContactAdRoutes(app: FastifyInstance) {
  const shouldStartContactAdSync = process.env.NODE_ENV !== 'test'
  const stopContactAdSync = shouldStartContactAdSync
    ? startContactAdSyncScheduler({ logger: app.log })
    : () => undefined
  app.addHook('onClose', async () => {
    stopContactAdSync()
  })

  app.get('/api/contact-ad', async (_request, reply) => {
    const payload = await loadContactAd({ logger: app.log })
    reply.header('Cache-Control', 'no-store')
    reply.send(payload)
  })

  app.get('/api/contact-ad/assets/:assetId', async (request, reply) => {
    const { assetId } = request.params as { assetId?: string }
    const asset = assetId ? await loadContactAdAsset(assetId, { logger: app.log }) : null

    if (!asset) {
      reply.code(404).send({ error: 'contact_ad_asset_not_found' })
      return
    }

    reply.header('Cache-Control', 'private, max-age=300')
    reply.type(asset.contentType)
    reply.send(asset.body)
  })
}
