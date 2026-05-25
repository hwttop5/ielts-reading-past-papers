import type { Router } from 'vue-router'

const BAIDU_TONGJI_SCRIPT_ID = 'baidu-tongji-script'
const BAIDU_TONGJI_SCRIPT_BASE = 'https://hm.baidu.com/hm.js?'

type BaiduTongjiValue = string | number | boolean | Record<string, unknown> | (() => boolean) | null | undefined
export type BaiduTongjiCommand = [string, ...BaiduTongjiValue[]]

type BaiduTongjiWindow = Window & {
  _hmt?: BaiduTongjiCommand[]
}

export interface BaiduTongjiOptions {
  enabled?: boolean
  siteId?: string
  document?: Document
  window?: BaiduTongjiWindow
}

export function normalizeBaiduTongjiPath(value: string): string {
  const rawValue = value.trim()
  if (!rawValue) {
    return '/'
  }

  try {
    const baseUrl = typeof window === 'undefined' ? 'https://example.invalid' : window.location.origin
    const url = new URL(rawValue, baseUrl)
    return url.pathname || '/'
  } catch {
    const [withoutHash] = rawValue.split('#')
    const [withoutQuery] = (withoutHash || '/').split('?')
    const pathname = withoutQuery || '/'
    return pathname.startsWith('/') ? pathname : `/${pathname}`
  }
}

export function isBaiduTongjiEnabled(options: BaiduTongjiOptions = {}): boolean {
  const enabled = options.enabled ?? import.meta.env.PROD
  const siteId = (options.siteId ?? import.meta.env.VITE_BAIDU_TONGJI_ID ?? '').trim()
  return enabled && siteId.length > 0
}

function getHmtQueue(targetWindow: BaiduTongjiWindow): BaiduTongjiCommand[] {
  targetWindow._hmt = targetWindow._hmt || []
  return targetWindow._hmt
}

function injectBaiduTongjiScript(siteId: string, targetDocument: Document): void {
  if (targetDocument.getElementById(BAIDU_TONGJI_SCRIPT_ID)) {
    return
  }

  const script = targetDocument.createElement('script')
  script.id = BAIDU_TONGJI_SCRIPT_ID
  script.async = true
  script.src = `${BAIDU_TONGJI_SCRIPT_BASE}${encodeURIComponent(siteId)}`
  targetDocument.head.appendChild(script)
}

function disableAutoUrlChangeTracking(hmt: BaiduTongjiCommand[]): void {
  hmt.push([
    '_requirePlugin',
    'UrlChangeTracker',
    {
      shouldTrackUrlChange: () => false
    }
  ])
}

function trackBaiduPageview(hmt: BaiduTongjiCommand[], rawPath: string): void {
  const pathname = normalizeBaiduTongjiPath(rawPath)
  hmt.push(['_setReferrerOverride', pathname])
  hmt.push(['_trackPageview', pathname])
}

export function installBaiduTongji(router: Router, options: BaiduTongjiOptions = {}): void {
  if (!isBaiduTongjiEnabled(options) || typeof window === 'undefined' || typeof document === 'undefined') {
    return
  }

  const siteId = (options.siteId ?? import.meta.env.VITE_BAIDU_TONGJI_ID ?? '').trim()
  const targetWindow = options.window ?? window
  const targetDocument = options.document ?? document
  const hmt = getHmtQueue(targetWindow)

  hmt.push(['_setAutoPageview', false])
  disableAutoUrlChangeTracking(hmt)
  injectBaiduTongjiScript(siteId, targetDocument)

  router.afterEach((to) => {
    trackBaiduPageview(hmt, to.path)
  })
}
