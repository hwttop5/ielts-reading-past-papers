/**
 * One-off: open production practice page, open AI assistant, click「给我提示」,
 * log stream/query responses (status, content-type, body preview) and assistant DOM counts.
 * Run: npx tsx scripts/debug-vercel-assistant.mts
 */
import { chromium } from 'playwright-core'

const URL =
  'https://ielts-reading-past-papers.vercel.app/practice-mode?id=p1-low-02&from=browse&page=1&pageSize=12'

async function main(): Promise<void> {
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()

  const lines: string[] = []
  const log = (obj: Record<string, unknown>): void => {
    const s = JSON.stringify(obj)
    lines.push(s)
    console.log(s)
  }

  page.on('console', (msg) => {
    log({ type: 'browser_console', level: msg.type(), text: msg.text().slice(0, 500) })
  })

  page.on('response', async (response) => {
    const u = response.url()
    if (!u.includes('/api/assistant/')) {
      return
    }
    if (response.request().method() === 'OPTIONS') {
      return
    }
    const status = response.status()
    const ct = response.headers()['content-type'] ?? ''
    let bodyPreview = ''
    let bodyLen = -1
    try {
      const buf = await response.text()
      bodyLen = buf.length
      bodyPreview = buf.slice(0, 500)
      let followUpsLen: number | null = null
      let followUpsSample: string[] | null = null
      try {
        const parsed = JSON.parse(buf) as { followUps?: unknown }
        if (Array.isArray(parsed.followUps)) {
          followUpsLen = parsed.followUps.length
          followUpsSample = parsed.followUps.slice(0, 3).map(String)
        }
      } catch {
        /* not single JSON */
      }
      log({
        type: 'network',
        path: u.includes('/stream') ? 'stream' : 'query',
        status,
        contentType: ct,
        bodyLen,
        bodyPreview,
        followUpsLen,
        followUpsSample
      })
    } catch {
      bodyPreview = '(unreadable)'
      log({
        type: 'network',
        path: u.includes('/stream') ? 'stream' : 'query',
        status,
        contentType: ct,
        bodyLen,
        bodyPreview
      })
    }
  })

  log({ type: 'step', message: 'goto', url: URL })
  await page.goto(URL, { waitUntil: 'networkidle', timeout: 120000 })

  const fab = page.locator('.assistant-fab')
  await fab.waitFor({ state: 'visible', timeout: 60000 })
  log({ type: 'step', message: 'open_assistant' })
  await fab.click()

  // First welcome card is always the hint shortcut (see welcomeShortcuts order).
  const firstShortcut = page.locator('.assistant-welcome .assistant-suggestion').first()
  await firstShortcut.waitFor({ state: 'visible', timeout: 30000 })
  log({ type: 'step', message: 'click_first_welcome_shortcut_hint' })
  await firstShortcut.click()

  await page.waitForTimeout(12000)

  const userChips = await page.locator('.assistant-user-chip').count()
  const responses = await page.locator('.assistant-response').count()
  const followUpChips = await page.locator('.follow-up-chip').count()
  const responseText = await page.locator('.assistant-message-text').first().textContent().catch(() => null)

  log({
    type: 'dom',
    userChipCount: userChips,
    assistantResponseCount: responses,
    followUpChipCount: followUpChips,
    firstMessageTextPreview: responseText?.slice(0, 200) ?? null
  })

  await browser.close()
}

main().catch((e) => {
  console.error(JSON.stringify({ type: 'fatal', error: String(e) }))
  process.exit(1)
})
