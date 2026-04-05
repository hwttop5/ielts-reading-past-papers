/**
 * One-off: capture README demo screenshots (requires `npm run dev` on 5175/8787).
 * Usage: node scripts/capture-readme-screenshots.mjs
 */
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

const __dirname = dirname(fileURLToPath(import.meta.url))
const outDir = join(__dirname, '..', 'docs', 'screenshots')
mkdirSync(outDir, { recursive: true })

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })

try {
  await page.goto('http://localhost:5175/browse', { waitUntil: 'networkidle', timeout: 120000 })
  await page.waitForTimeout(2500)
  await page.screenshot({ path: join(outDir, 'browse-question-bank.png') })

  await page.goto('http://localhost:5175/practice-mode?id=p1-low-02', {
    waitUntil: 'networkidle',
    timeout: 120000
  })
  await page.waitForSelector('.nav-shell', { timeout: 90000 })
  await page.waitForTimeout(4000)
  await page.screenshot({ path: join(outDir, 'practice-reading.png') })

  const fab = page.locator('.assistant-fab')
  await fab.waitFor({ state: 'visible', timeout: 30000 })
  await fab.click()
  await page.waitForSelector('.assistant-dialog', { state: 'visible', timeout: 15000 })
  await page.waitForTimeout(600)
  await page.screenshot({ path: join(outDir, 'ai-assistant.png') })

  console.log('Wrote PNGs to', outDir)
} finally {
  await browser.close()
}
