import type { FastifyInstance } from 'fastify'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

const ORIGINAL_ENV = { ...process.env }
const ORIGINAL_FETCH = global.fetch

async function withTestApp<T>(run: (context: { app: FastifyInstance; dir: string }) => Promise<T>): Promise<T> {
  const dir = mkdtempSync(join(tmpdir(), 'ielts-contact-ad-'))
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
  const { resetContactAdCacheForTests } = await import('../src/lib/contactAd.js')
  resetContactAdCacheForTests()
  const app = await createApp()

  try {
    return await run({ app, dir })
  } finally {
    await app.close()
    closeDatabase()
    rmSync(dir, { recursive: true, force: true })
  }
}

function issueResponse(body: string, title = 'Issue Fallback Title', bodyHtml?: string, updatedAt = '2026-05-27T12:00:00Z'): Response {
  return new Response(
    JSON.stringify({
      title,
      body,
      body_html: bodyHtml,
      updated_at: updatedAt
    }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json'
      }
    }
  )
}

function getCachePaths(dir: string) {
  const root = resolve(dir, 'contact-ad-cache')
  return {
    assetDir: resolve(root, 'assets'),
    snapshotPath: resolve(root, 'snapshot.json')
  }
}

describe('contact ad route', () => {
  afterEach(async () => {
    process.env = { ...ORIGINAL_ENV }
    global.fetch = ORIGINAL_FETCH
    vi.restoreAllMocks()
    vi.resetModules()
    const { resetContactAdCacheForTests } = await import('../src/lib/contactAd.js')
    resetContactAdCacheForTests()
  })

  it('syncs the GitHub issue title, body, and updated_at into the local mirror', async () => {
    const bodyHtml = '<h2>New notice</h2><ul><li>First item</li><li>Second item</li></ul><p><a href="https://example.com">View details</a></p>'
    global.fetch = vi.fn(async () =>
      issueResponse(
        `## New notice

- First item
- Second item

[View details](https://example.com)`,
        'Latest announcement',
        bodyHtml,
        '2026-05-27T12:00:00+08:00'
      )
    ) as typeof fetch

    await withTestApp(async ({ app, dir }) => {
      const { syncContactAdMirror } = await import('../src/lib/contactAd.js')
      await syncContactAdMirror()

      const response = await app.inject({
        method: 'GET',
        url: '/api/contact-ad'
      })

      expect(response.statusCode).toBe(200)
      expect(response.headers['cache-control']).toBe('no-store')
      expect(response.json()).toEqual({
        html: bodyHtml,
        title: 'Latest announcement',
        updatedAt: '2026-05-27T12:00:00+08:00',
        markdown: '## New notice\n\n- First item\n- Second item\n\n[View details](https://example.com)'
      })

      const { snapshotPath } = getCachePaths(dir)
      expect(existsSync(snapshotPath)).toBe(true)
      expect(JSON.parse(readFileSync(snapshotPath, 'utf8'))).toMatchObject({
        lastRemoteUpdatedAt: '2026-05-27T12:00:00+08:00',
        payload: {
          html: bodyHtml,
          title: 'Latest announcement',
          updatedAt: '2026-05-27T12:00:00+08:00',
          markdown: '## New notice\n\n- First item\n- Second item\n\n[View details](https://example.com)'
        }
      })

      const second = await app.inject({
        method: 'GET',
        url: '/api/contact-ad'
      })
      expect(second.statusCode).toBe(200)
      expect(second.json()).toEqual(response.json())
      expect(global.fetch).toHaveBeenCalledTimes(1)
    })
  })

  it('treats frontmatter-like lines in the body as normal markdown content', async () => {
    global.fetch = vi.fn(async () =>
      issueResponse(
        `---
enabled: false
title: Ignore this
updatedAt: 2000-01-01
---

Body content`,
        'Issue Title Source',
        undefined,
        '2026-05-27T12:00:00+08:00'
      )
    ) as typeof fetch

    await withTestApp(async ({ app }) => {
      const { syncContactAdMirror } = await import('../src/lib/contactAd.js')
      await syncContactAdMirror()

      const response = await app.inject({
        method: 'GET',
        url: '/api/contact-ad'
      })

      expect(response.statusCode).toBe(200)
      expect(response.json()).toEqual({
        title: 'Issue Title Source',
        updatedAt: '2026-05-27T12:00:00+08:00',
        markdown: '---\nenabled: false\ntitle: Ignore this\nupdatedAt: 2000-01-01\n---\n\nBody content'
      })
    })
  })

  it('downloads issue attachment images into the local mirror and serves them without hitting GitHub again on asset requests', async () => {
    const assetId = '7fabadcf-801d-4502-8076-d667dc940902'
    const signedAssetUrl = `https://private-user-images.githubusercontent.com/266475496/598743118-${assetId}.PNG?jwt=test-token&response-content-type=image%2Fpng`
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(
        issueResponse(
          `![Telegram 二维码](https://github.com/user-attachments/assets/${assetId})`,
          'Latest announcement',
          `<p><img src="${signedAssetUrl.replace(/&/g, '&amp;')}" alt="Telegram 二维码"></p>`,
          '2026-05-27T12:00:00+08:00'
        )
      )
      .mockResolvedValueOnce(
        new Response('fake-image-bytes', {
          status: 200,
          headers: {
            'Content-Type': 'image/png'
          }
        })
      ) as typeof fetch

    await withTestApp(async ({ app, dir }) => {
      const { syncContactAdMirror } = await import('../src/lib/contactAd.js')
      await syncContactAdMirror()

      const response = await app.inject({
        method: 'GET',
        url: '/api/contact-ad'
      })

      expect(response.statusCode).toBe(200)
      expect(response.json()).toEqual({
        html: `<p><img src="/api/contact-ad/assets/${assetId}" alt="Telegram 二维码"></p>`,
        title: 'Latest announcement',
        updatedAt: '2026-05-27T12:00:00+08:00',
        markdown: `![Telegram 二维码](/api/contact-ad/assets/${assetId})`
      })

      const assetResponse = await app.inject({
        method: 'GET',
        url: `/api/contact-ad/assets/${assetId}`
      })

      expect(assetResponse.statusCode).toBe(200)
      expect(assetResponse.headers['content-type']).toContain('image/png')
      expect(assetResponse.headers['cache-control']).toBe('private, max-age=300')
      expect(assetResponse.body).toBe('fake-image-bytes')

      const { assetDir } = getCachePaths(dir)
      expect(existsSync(resolve(assetDir, `${assetId}.png`))).toBe(true)
      expect(global.fetch).toHaveBeenCalledTimes(2)
    })
  })

  it('writes an empty-state local snapshot when the issue body is empty', async () => {
    global.fetch = vi.fn(async () =>
      issueResponse('   \n\n', 'Hidden announcement', undefined, '2026-05-27T12:00:00+08:00')
    ) as typeof fetch

    await withTestApp(async ({ app, dir }) => {
      const { syncContactAdMirror } = await import('../src/lib/contactAd.js')
      await syncContactAdMirror()

      const response = await app.inject({
        method: 'GET',
        url: '/api/contact-ad'
      })

      expect(response.statusCode).toBe(200)
      expect(response.json()).toEqual({
        title: '消息通知',
        updatedAt: '2026-05-27T12:00:00+08:00',
        markdown: ''
      })

      const { snapshotPath } = getCachePaths(dir)
      expect(JSON.parse(readFileSync(snapshotPath, 'utf8'))).toMatchObject({
        lastRemoteUpdatedAt: '2026-05-27T12:00:00+08:00',
        payload: {
          title: '消息通知',
          updatedAt: '2026-05-27T12:00:00+08:00',
          markdown: ''
        }
      })
    })
  })

  it('keeps serving the last local snapshot when the upstream source fails', async () => {
    global.fetch = vi.fn(async () =>
      issueResponse('Cached body', 'Cached announcement', undefined, '2026-05-27T12:00:00+08:00')
    ) as typeof fetch

    await withTestApp(async ({ app }) => {
      const { syncContactAdMirror } = await import('../src/lib/contactAd.js')
      await syncContactAdMirror()

      const first = await app.inject({
        method: 'GET',
        url: '/api/contact-ad'
      })
      expect(first.json()).toEqual({
        title: 'Cached announcement',
        updatedAt: '2026-05-27T12:00:00+08:00',
        markdown: 'Cached body'
      })

      global.fetch = vi.fn(async () => new Response('boom', { status: 500 })) as typeof fetch
      await syncContactAdMirror()

      const second = await app.inject({
        method: 'GET',
        url: '/api/contact-ad'
      })
      expect(second.json()).toEqual(first.json())
    })
  })

  it('serves only the local snapshot on request paths when no local mirror is available', async () => {
    global.fetch = vi.fn(async () => new Response('boom', { status: 500 })) as typeof fetch

    await withTestApp(async ({ app }) => {
      const { syncContactAdMirror } = await import('../src/lib/contactAd.js')
      await syncContactAdMirror()

      const fetchCallsBeforeRequest = vi.mocked(global.fetch).mock.calls.length
      const response = await app.inject({
        method: 'GET',
        url: '/api/contact-ad'
      })

      expect(response.statusCode).toBe(200)
      expect(response.json()).toEqual({
        title: '消息通知',
        markdown: ''
      })
      expect(vi.mocked(global.fetch).mock.calls.length).toBe(fetchCallsBeforeRequest)
    })
  })

  it('returns 404 for unknown contact ad asset ids', async () => {
    global.fetch = vi.fn(async () =>
      issueResponse('Body', 'Asset announcement', undefined, '2026-05-27T12:00:00+08:00')
    ) as typeof fetch

    await withTestApp(async ({ app }) => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/contact-ad/assets/not-a-valid-asset-id'
      })

      expect(response.statusCode).toBe(404)
      expect(response.json()).toEqual({ error: 'contact_ad_asset_not_found' })
    })
  })

  it('does not overwrite the local mirror when the upstream updated_at is unchanged', async () => {
    global.fetch = vi.fn(async () =>
      issueResponse('First body', 'First title', undefined, '2026-05-27T12:00:00+08:00')
    ) as typeof fetch

    await withTestApp(async ({ app }) => {
      const { syncContactAdMirror } = await import('../src/lib/contactAd.js')
      await syncContactAdMirror()

      const first = await app.inject({
        method: 'GET',
        url: '/api/contact-ad'
      })
      expect(first.json()).toEqual({
        title: 'First title',
        updatedAt: '2026-05-27T12:00:00+08:00',
        markdown: 'First body'
      })

      global.fetch = vi.fn(async () =>
        issueResponse('Second body', 'Second title', undefined, '2026-05-27T12:00:00+08:00')
      ) as typeof fetch

      await syncContactAdMirror()

      const second = await app.inject({
        method: 'GET',
        url: '/api/contact-ad'
      })
      expect(second.json()).toEqual(first.json())
      expect(global.fetch).toHaveBeenCalledTimes(1)
    })
  })

  it('updates the local mirror when the upstream updated_at changes', async () => {
    global.fetch = vi.fn(async () =>
      issueResponse('First body', 'First title', undefined, '2026-05-27T12:00:00+08:00')
    ) as typeof fetch

    await withTestApp(async ({ app }) => {
      const { syncContactAdMirror } = await import('../src/lib/contactAd.js')
      await syncContactAdMirror()

      const first = await app.inject({
        method: 'GET',
        url: '/api/contact-ad'
      })
      expect(first.json()).toEqual({
        title: 'First title',
        updatedAt: '2026-05-27T12:00:00+08:00',
        markdown: 'First body'
      })

      global.fetch = vi.fn(async () =>
        issueResponse('Second body', 'Second title', undefined, '2026-05-27T12:05:00+08:00')
      ) as typeof fetch

      await syncContactAdMirror()

      const second = await app.inject({
        method: 'GET',
        url: '/api/contact-ad'
      })
      expect(second.json()).toEqual({
        title: 'Second title',
        updatedAt: '2026-05-27T12:05:00+08:00',
        markdown: 'Second body'
      })
    })
  })
})
