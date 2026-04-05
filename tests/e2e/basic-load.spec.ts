/**
 * Simple test to verify Playwright can load the app
 */

import { test, expect } from '@playwright/test'

test.describe('Basic App Load Test', () => {
  test('should load the practice mode page', async ({ page }) => {
    test.setTimeout(120000)

    // Collect console logs
    const errors: string[] = []
    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(`[CONSOLE ERROR] ${msg.text()}`)
      }
    })
    page.on('pageerror', err => {
      errors.push(`[PAGE ERROR] ${err.message}`)
    })

    // Navigate to exam page
    await page.goto(`/practice-mode?id=p1-low-02`, {
      waitUntil: 'networkidle',
      timeout: 90000
    })

    // Take a screenshot to see what's rendered
    await page.screenshot({ path: 'output/question-nav/test-results/page-load.png' })

    // Check if app div exists
    const app = await page.$('#app')
    expect(app).toBeTruthy()

    // Wait for any content to appear
    await page.waitForTimeout(5000)

    // Check for nav-shell
    const navShell = await page.$('.nav-shell')
    if (!navShell) {
      console.log('Errors:', errors)
      const html = await page.innerHTML('#app')
      console.log('App innerHTML (first 500):', html.substring(0, 500))
    }

    // The page should have loaded exam content
    expect(navShell).toBeTruthy()
  })
})
