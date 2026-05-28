import { createHash, randomUUID } from 'node:crypto'
import { existsSync, rmSync } from 'node:fs'
import { mkdir, readFile, rename, rm, unlink, writeFile } from 'node:fs/promises'
import { basename, dirname, extname, resolve } from 'node:path'
import { env } from '../config/env.js'

const CONTACT_AD_ISSUE_API_URL = 'https://api.github.com/repos/hwttop5/github-actions/issues/1'
const CONTACT_AD_SYNC_INTERVAL_MS = 5 * 60 * 1000
const CONTACT_AD_FETCH_TIMEOUT_MS = 5 * 1000
const CONTACT_AD_ASSET_FETCH_TIMEOUT_MS = 20 * 1000
const CONTACT_AD_CACHE_ROOT = resolve(env.SYNC_DATABASE_PATH, '..', 'contact-ad-cache')
const CONTACT_AD_SNAPSHOT_PATH = resolve(CONTACT_AD_CACHE_ROOT, 'snapshot.json')
const CONTACT_AD_ASSET_ROOT = resolve(CONTACT_AD_CACHE_ROOT, 'assets')

export type ContactAdPayload =
  {
    title: string
    markdown: string
    updatedAt?: string
  }

type ContactAdLogger = {
  info?: (...args: unknown[]) => void
  warn: (...args: unknown[]) => void
}

type ContactAdIssueResponse = {
  title?: unknown
  body?: unknown
  body_html?: unknown
  updated_at?: unknown
}

type LocalContactAdAsset = {
  assetId: string
  contentType: string
  fileName: string
}

type LocalContactAdSnapshot = {
  assets: LocalContactAdAsset[]
  lastRemoteUpdatedAt: string
  payload: ContactAdPayload
  syncedAt: string
}

type RemoteContactAdState =
  {
    bodyHtml?: string
    markdown: string
    payloadUpdatedAt?: string
    title: string
    version: string
  }

type DownloadedContactAdAsset = {
  asset: LocalContactAdAsset
  tempPath: string
}

const EMPTY_CONTACT_AD: ContactAdPayload = {
  title: '消息通知',
  markdown: ''
}
const CONTACT_AD_ASSET_ID_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i
const CONTACT_AD_ISSUE_ASSET_URL_PATTERN =
  /https:\/\/github\.com\/user-attachments\/assets\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/gi
const CONTACT_AD_SIGNED_ASSET_URL_PATTERN = /https:\/\/private-user-images\.githubusercontent\.com\/[^"' )]+/gi

let contactAdSyncInterval: NodeJS.Timeout | null = null
let contactAdSyncPromise: Promise<LocalContactAdSnapshot | null> | null = null

function normalizeAssetId(value: string): string | null {
  const normalized = value.trim().toLowerCase()
  return CONTACT_AD_ASSET_ID_PATTERN.test(normalized) ? normalized : null
}

function decodeHtmlAttribute(value: string): string {
  return value.replace(/&amp;/g, '&')
}

function extractSignedAssetUrls(bodyHtml: string): Map<string, string> {
  const assetUrls = new Map<string, string>()

  for (const match of bodyHtml.matchAll(CONTACT_AD_SIGNED_ASSET_URL_PATTERN)) {
    const decodedUrl = decodeHtmlAttribute(match[0])
    const assetId = decodedUrl.match(CONTACT_AD_ASSET_ID_PATTERN)?.[0]?.toLowerCase()
    if (!assetId) {
      continue
    }

    assetUrls.set(assetId, decodedUrl)
  }

  return assetUrls
}

function rewriteIssueAssetUrls(markdown: string): string {
  return markdown.replace(CONTACT_AD_ISSUE_ASSET_URL_PATTERN, (_match, assetId: string) => {
    const normalizedAssetId = normalizeAssetId(assetId)
    return normalizedAssetId ? `/api/contact-ad/assets/${normalizedAssetId}` : _match
  })
}

function extractIssueAssetIds(markdown: string): string[] {
  const assetIds = new Set<string>()

  for (const match of markdown.matchAll(CONTACT_AD_ISSUE_ASSET_URL_PATTERN)) {
    const assetId = normalizeAssetId(match[1] || '')
    if (assetId) {
      assetIds.add(assetId)
    }
  }

  return Array.from(assetIds)
}

function getRemoteIssueVersion(issue: ContactAdIssueResponse): { payloadUpdatedAt?: string; version: string } {
  const issueUpdatedAt = typeof issue.updated_at === 'string' ? issue.updated_at.trim() : ''

  if (issueUpdatedAt) {
    return {
      payloadUpdatedAt: issueUpdatedAt,
      version: issueUpdatedAt
    }
  }

  return {
    version: createHash('sha256').update(`${String(issue.title || '')}\n${String(issue.body || '')}`).digest('hex')
  }
}

function normalizeContentType(value: string | null): string {
  const raw = (value || '').split(';', 1)[0]?.trim().toLowerCase()
  return raw || 'application/octet-stream'
}

function resolveAssetExtension(contentType: string, assetUrl: string): string {
  switch (contentType) {
    case 'image/png':
      return 'png'
    case 'image/jpeg':
      return 'jpg'
    case 'image/webp':
      return 'webp'
    case 'image/gif':
      return 'gif'
    case 'image/svg+xml':
      return 'svg'
    default:
      break
  }

  try {
    const url = new URL(assetUrl)
    const extension = extname(url.pathname).replace(/^\./, '').trim().toLowerCase()
    if (extension) {
      return extension
    }
  } catch {
    // Ignore URL parsing failures and fall back to a binary extension.
  }

  return 'bin'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function normalizeLocalSnapshot(value: unknown): LocalContactAdSnapshot | null {
  if (!isRecord(value)) {
    return null
  }

  const lastRemoteUpdatedAt = typeof value.lastRemoteUpdatedAt === 'string' ? value.lastRemoteUpdatedAt.trim() : ''
  if (!lastRemoteUpdatedAt) {
    return null
  }

  const payloadValue = value.payload
  const payload: ContactAdPayload =
    isRecord(payloadValue) && typeof payloadValue.title === 'string' && typeof payloadValue.markdown === 'string'
      ? {
          title: payloadValue.title.trim() || EMPTY_CONTACT_AD.title,
          markdown: payloadValue.markdown.replace(/^\uFEFF/, ''),
          updatedAt: typeof payloadValue.updatedAt === 'string' && payloadValue.updatedAt.trim() ? payloadValue.updatedAt.trim() : undefined
        }
      : EMPTY_CONTACT_AD

  const assets = Array.isArray(value.assets)
    ? value.assets
        .map((item) => {
          if (!isRecord(item)) {
            return null
          }

          const assetId = typeof item.assetId === 'string' ? normalizeAssetId(item.assetId) : null
          const contentType = typeof item.contentType === 'string' ? normalizeContentType(item.contentType) : ''
          const fileName = typeof item.fileName === 'string' ? basename(item.fileName.trim()) : ''

          if (!assetId || !contentType || !fileName) {
            return null
          }

          return {
            assetId,
            contentType,
            fileName
          }
        })
        .filter((item): item is LocalContactAdAsset => item !== null)
    : []

  return {
    assets,
    lastRemoteUpdatedAt,
    payload,
    syncedAt: typeof value.syncedAt === 'string' && value.syncedAt.trim() ? value.syncedAt.trim() : new Date(0).toISOString()
  }
}

async function ensureContactAdCacheDirs(): Promise<void> {
  await mkdir(CONTACT_AD_ASSET_ROOT, { recursive: true })
  await mkdir(dirname(CONTACT_AD_SNAPSHOT_PATH), { recursive: true })
}

async function readLocalSnapshot(): Promise<LocalContactAdSnapshot | null> {
  try {
    const raw = await readFile(CONTACT_AD_SNAPSHOT_PATH, 'utf8')
    return normalizeLocalSnapshot(JSON.parse(raw))
  } catch {
    return null
  }
}

function normalizeRemoteIssue(issue: ContactAdIssueResponse): RemoteContactAdState | null {
  if (typeof issue.body !== 'string') {
    return null
  }

  const { payloadUpdatedAt, version } = getRemoteIssueVersion(issue)
  const title = typeof issue.title === 'string' ? issue.title.trim() : ''
  const markdown = typeof issue.body === 'string' ? issue.body.replace(/^\uFEFF/, '') : ''

  if (!title) {
    return null
  }

  return {
    bodyHtml: typeof issue.body_html === 'string' ? issue.body_html : undefined,
    markdown,
    payloadUpdatedAt,
    title,
    version
  }
}

async function fetchRemoteIssue(): Promise<RemoteContactAdState | null> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github.full+json',
    'User-Agent': 'ielts-reading-past-papers-contact-ad',
    'X-GitHub-Api-Version': '2022-11-28'
  }

  if (env.CONTACT_AD_GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${env.CONTACT_AD_GITHUB_TOKEN}`
  }

  const response = await fetch(CONTACT_AD_ISSUE_API_URL, {
    headers,
    signal: AbortSignal.timeout(CONTACT_AD_FETCH_TIMEOUT_MS)
  })

  if (!response.ok) {
    throw new Error(`GitHub issue request failed with HTTP ${response.status}.`)
  }

  return normalizeRemoteIssue((await response.json()) as ContactAdIssueResponse)
}

async function downloadRemoteAssets(markdown: string, bodyHtml: string | undefined): Promise<DownloadedContactAdAsset[]> {
  const assetIds = extractIssueAssetIds(markdown)
  if (assetIds.length === 0) {
    return []
  }

  const signedAssetUrls = extractSignedAssetUrls(bodyHtml || '')
  const downloadedAssets: DownloadedContactAdAsset[] = []

  await ensureContactAdCacheDirs()

  try {
    for (const assetId of assetIds) {
      const assetUrl = signedAssetUrls.get(assetId)
      if (!assetUrl) {
        throw new Error(`Missing signed asset url for contact ad asset ${assetId}.`)
      }

      const response = await fetch(assetUrl, {
        signal: AbortSignal.timeout(CONTACT_AD_ASSET_FETCH_TIMEOUT_MS)
      })

      if (!response.ok) {
        throw new Error(`Contact ad asset download failed with HTTP ${response.status}.`)
      }

      const contentType = normalizeContentType(response.headers.get('content-type'))
      const extension = resolveAssetExtension(contentType, assetUrl)
      const fileName = `${assetId}.${extension}`
      const tempPath = resolve(CONTACT_AD_ASSET_ROOT, `${fileName}.${randomUUID()}.tmp`)
      const body = Buffer.from(await response.arrayBuffer())

      await writeFile(tempPath, body)
      downloadedAssets.push({
        asset: {
          assetId,
          contentType,
          fileName
        },
        tempPath
      })
    }

    return downloadedAssets
  } catch (error) {
    await Promise.all(downloadedAssets.map((asset) => rm(asset.tempPath, { force: true })))
    throw error
  }
}

async function finalizeDownloadedAssets(assets: DownloadedContactAdAsset[]): Promise<LocalContactAdAsset[]> {
  const finalizedAssets: LocalContactAdAsset[] = []

  try {
    for (const downloaded of assets) {
      const finalPath = resolve(CONTACT_AD_ASSET_ROOT, downloaded.asset.fileName)
      await rename(downloaded.tempPath, finalPath)
      finalizedAssets.push(downloaded.asset)
    }

    return finalizedAssets
  } catch (error) {
    await Promise.all(
      assets.map(async (downloaded) => {
        await rm(downloaded.tempPath, { force: true })
        await rm(resolve(CONTACT_AD_ASSET_ROOT, downloaded.asset.fileName), { force: true })
      })
    )
    throw error
  }
}

async function cleanupStaleAssets(previous: LocalContactAdSnapshot | null, current: LocalContactAdSnapshot): Promise<void> {
  if (!previous) {
    return
  }

  const currentFiles = new Set(current.assets.map((asset) => asset.fileName))
  await Promise.all(
    previous.assets
      .filter((asset) => !currentFiles.has(asset.fileName))
      .map((asset) => unlink(resolve(CONTACT_AD_ASSET_ROOT, asset.fileName)).catch(() => undefined))
  )
}

async function persistLocalSnapshot(current: LocalContactAdSnapshot, previous: LocalContactAdSnapshot | null): Promise<void> {
  await ensureContactAdCacheDirs()
  await writeFile(CONTACT_AD_SNAPSHOT_PATH, `${JSON.stringify(current, null, 2)}\n`, 'utf8')
  await cleanupStaleAssets(previous, current)
}

function createEmptySnapshot(version: string, updatedAt?: string): LocalContactAdSnapshot {
  return {
    assets: [],
    lastRemoteUpdatedAt: version,
    payload: {
      ...EMPTY_CONTACT_AD,
      updatedAt
    },
    syncedAt: new Date().toISOString()
  }
}

async function buildLocalSnapshot(remote: RemoteContactAdState): Promise<LocalContactAdSnapshot> {
  if (!remote.markdown.trim()) {
    return createEmptySnapshot(remote.version, remote.payloadUpdatedAt)
  }

  const downloadedAssets = await downloadRemoteAssets(remote.markdown, remote.bodyHtml)
  const assets = await finalizeDownloadedAssets(downloadedAssets)

  return {
    assets,
    lastRemoteUpdatedAt: remote.version,
    payload: {
      title: remote.title,
      markdown: rewriteIssueAssetUrls(remote.markdown),
      updatedAt: remote.payloadUpdatedAt
    },
    syncedAt: new Date().toISOString()
  }
}

async function syncContactAdMirrorInternal(options?: { logger?: ContactAdLogger }): Promise<LocalContactAdSnapshot | null> {
  const previous = await readLocalSnapshot()
  let remote: RemoteContactAdState | null

  try {
    remote = await fetchRemoteIssue()
  } catch (error) {
    options?.logger?.warn?.(error, 'Failed to check contact ad upstream source.')
    return previous
  }

  if (!remote) {
    options?.logger?.warn?.('Contact ad issue payload is invalid; keeping the existing local snapshot.')
    return previous
  }

  if (previous?.lastRemoteUpdatedAt === remote.version) {
    options?.logger?.info?.({ version: remote.version }, 'Contact ad mirror is already up to date.')
    return previous
  }

  try {
    const current = await buildLocalSnapshot(remote)
    await persistLocalSnapshot(current, previous)
    options?.logger?.info?.({ version: remote.version }, 'Contact ad mirror updated from upstream source.')
    return current
  } catch (error) {
    options?.logger?.warn?.(error, 'Failed to refresh the local contact ad mirror; keeping the existing snapshot.')
    return previous
  }
}

export async function syncContactAdMirror(options?: { logger?: ContactAdLogger }): Promise<LocalContactAdSnapshot | null> {
  if (!contactAdSyncPromise) {
    contactAdSyncPromise = syncContactAdMirrorInternal(options).finally(() => {
      contactAdSyncPromise = null
    })
  }

  return contactAdSyncPromise
}

export function startContactAdSyncScheduler(options?: { logger?: ContactAdLogger }): () => void {
  if (contactAdSyncInterval) {
    return () => undefined
  }

  void syncContactAdMirror(options)
  contactAdSyncInterval = setInterval(() => {
    void syncContactAdMirror(options)
  }, CONTACT_AD_SYNC_INTERVAL_MS)
  contactAdSyncInterval.unref?.()

  return () => {
    if (contactAdSyncInterval) {
      clearInterval(contactAdSyncInterval)
      contactAdSyncInterval = null
    }
  }
}

export function resetContactAdCacheForTests(): void {
  if (contactAdSyncInterval) {
    clearInterval(contactAdSyncInterval)
    contactAdSyncInterval = null
  }

  contactAdSyncPromise = null

  if (process.env.NODE_ENV === 'test' && existsSync(CONTACT_AD_CACHE_ROOT)) {
    rmSync(CONTACT_AD_CACHE_ROOT, { recursive: true, force: true })
  }
}

export async function loadContactAd(options?: { logger?: ContactAdLogger }): Promise<ContactAdPayload> {
  const snapshot = await readLocalSnapshot()
  if (!snapshot) {
    return EMPTY_CONTACT_AD
  }

  return snapshot.payload
}

export async function loadContactAdAsset(
  assetId: string,
  options?: { logger?: ContactAdLogger }
): Promise<{ body: Buffer; contentType: string } | null> {
  const normalizedAssetId = normalizeAssetId(assetId)
  if (!normalizedAssetId) {
    return null
  }

  const snapshot = await readLocalSnapshot()
  if (!snapshot) {
    return null
  }

  const asset = snapshot.assets.find((item) => item.assetId === normalizedAssetId)
  if (!asset) {
    return null
  }

  try {
    const body = await readFile(resolve(CONTACT_AD_ASSET_ROOT, asset.fileName))
    return {
      body,
      contentType: asset.contentType
    }
  } catch {
    return null
  }
}
