import type { Router } from 'vue-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { installBaiduTongji, isBaiduTongjiEnabled, normalizeBaiduTongjiPath } from './baiduTongji'

function createRouterStub() {
  return {
    afterEach: vi.fn()
  } as unknown as Router & { afterEach: ReturnType<typeof vi.fn> }
}

function createDocumentStub() {
  const elements = new Map<string, HTMLScriptElement>()
  return {
    createElement: vi.fn(() => document.createElement('script')),
    getElementById: vi.fn((id: string) => elements.get(id) ?? null),
    head: {
      appendChild: vi.fn((element: HTMLScriptElement) => {
        if (element.id) {
          elements.set(element.id, element)
        }
        return element
      })
    }
  } as unknown as Document
}

describe('baidu tongji analytics', () => {
  afterEach(() => {
    window._hmt = undefined
    document.head.innerHTML = ''
  })

  it('normalizes URLs to pathname only', () => {
    expect(normalizeBaiduTongjiPath('/browse?search=reading#top')).toBe('/browse')
    expect(normalizeBaiduTongjiPath('https://example.com/practice-mode?id=p1-high-01')).toBe('/practice-mode')
    expect(normalizeBaiduTongjiPath('practice')).toBe('/practice')
  })

  it('stays disabled without a site id', () => {
    expect(isBaiduTongjiEnabled({ enabled: true, siteId: '' })).toBe(false)
    expect(isBaiduTongjiEnabled({ enabled: true, siteId: '   ' })).toBe(false)
  })

  it('stays disabled outside production mode', () => {
    expect(isBaiduTongjiEnabled({ enabled: false, siteId: 'test-site-id' })).toBe(false)
  })

  it('does not register router hooks when disabled', () => {
    const router = createRouterStub()

    installBaiduTongji(router, { enabled: true, siteId: '' })
    installBaiduTongji(router, { enabled: false, siteId: 'test-site-id' })

    expect(router.afterEach).not.toHaveBeenCalled()
    expect(window._hmt).toBeUndefined()
    expect(document.querySelector('script[src^="https://hm.baidu.com/hm.js"]')).toBeNull()
  })

  it('injects hm.js and sends pageviews without query or hash', () => {
    const router = createRouterStub()
    const documentStub = createDocumentStub()

    installBaiduTongji(router, { enabled: true, siteId: 'test-site-id', document: documentStub })

    expect(router.afterEach).toHaveBeenCalledOnce()
    expect(documentStub.head.appendChild).toHaveBeenCalledOnce()
    expect((documentStub.head.appendChild as ReturnType<typeof vi.fn>).mock.calls[0][0]).toMatchObject({
      id: 'baidu-tongji-script',
      src: 'https://hm.baidu.com/hm.js?test-site-id'
    })
    expect(window._hmt?.[0]).toEqual(['_setAutoPageview', false])
    expect(window._hmt?.[1]?.[0]).toBe('_requirePlugin')
    expect(window._hmt?.[1]?.[1]).toBe('UrlChangeTracker')

    const urlChangeTrackerOptions = window._hmt?.[1]?.[2] as { shouldTrackUrlChange: () => boolean }
    expect(urlChangeTrackerOptions.shouldTrackUrlChange()).toBe(false)

    const afterEachHook = router.afterEach.mock.calls[0][0] as (to: { path: string }) => void
    afterEachHook({ path: '/browse?search=reading#top' })

    expect(window._hmt).toContainEqual(['_setReferrerOverride', '/browse'])
    expect(window._hmt).toContainEqual(['_trackPageview', '/browse'])
  })
})
