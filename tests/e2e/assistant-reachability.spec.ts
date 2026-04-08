import { test, expect } from '@playwright/test'

/** Requires `npm run dev:web` + assistant on 8787. Asserts POST /api/assistant/* works via Vite proxy. */
async function sendAssistantMessage(page: import('@playwright/test').Page, base: string) {
  const failures: string[] = []
  page.on('requestfailed', (req) => {
    failures.push(`${req.method()} ${req.url()} — ${req.failure()?.errorText ?? 'unknown'}`)
  })
  await page.goto(`${base}/practice-mode?id=p1-high-01`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForSelector('.assistant-fab', { timeout: 60000 })
  await page.locator('.assistant-fab').click()
  await page.waitForSelector('.assistant-input', { timeout: 15000 })
  await page.locator('.assistant-input').fill('你好')
  await page.locator('.assistant-send').click()
  await page.waitForTimeout(18000)
  const hasErr = await page
    .getByText(/智能助手后端当前不可达|Assistant backend is not reachable/)
    .isVisible()
    .catch(() => false)
  return { failures, hasErr: hasErr ? 1 : 0, url: page.url() }
}

test.describe('assistant reachability (local dev)', () => {
  test('localhost:5175 — no backend-unreachable bubble', async ({ page }) => {
    const r = await sendAssistantMessage(page, 'http://localhost:5175')
    expect(r.failures, `requestfailed: ${JSON.stringify(r.failures)}`).toEqual([])
    expect(r.hasErr).toBe(0)
  })

  test('127.0.0.1:5175 — same', async ({ page }) => {
    const r = await sendAssistantMessage(page, 'http://127.0.0.1:5175')
    expect(r.failures, `requestfailed: ${JSON.stringify(r.failures)}`).toEqual([])
    expect(r.hasErr).toBe(0)
  })
})
