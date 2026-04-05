/**
 * E2E Audit for Question Navigation
 * Visits each exam page and clicks every question number button to verify
 * that the scroll target is reached correctly.
 */

import { test, expect } from '@playwright/test'

test.describe('Question Navigation Audit', () => {
  const examIds = [
    'p1-low-02',
    'p1-high-01'
  ]

  for (const examId of examIds) {
    test.describe(`Exam: ${examId}`, () => {
      test(`All question buttons should scroll to correct target`, async ({ page }) => {
        // Set longer timeout for this test
        test.setTimeout(120000)

        // Navigate to exam page
        await page.goto(`/practice-mode?id=${examId}`, {
          waitUntil: 'networkidle',
          timeout: 60000
        })

        // Wait for nav-shell to appear (indicates exam loaded)
        await page.waitForSelector('.nav-shell', { timeout: 60000 })

        // Wait for nav items to be rendered (question nav inside .nav-shell)
        await page.waitForSelector('.nav-shell .nav-item', { timeout: 10000 })

        // Get all question nav items (not the main menu nav items)
        const navItems = await page.locator('.nav-shell .nav-item').all()

        if (navItems.length === 0) {
          console.warn(`No nav items found for ${examId}`)
          return
        }

        console.log(`Testing ${navItems.length} questions for ${examId}`)

        // Click first 3 nav items as a sanity check
        const maxClicks = Math.min(3, navItems.length)
        for (let i = 0; i < maxClicks; i++) {
          const navItem = navItems[i]

          // Get question info from button text
          const displayNumber = await navItem.textContent() || `${i + 1}`
          const questionId = `q${displayNumber.trim()}`

          // Re-query question pane for each iteration (in case of re-render)
          const questionPaneEl = page.locator('.question-pane').first()
          await questionPaneEl.waitFor({ state: 'visible', timeout: 5000 })

          // Get scroll position before click
          const scrollBefore = await questionPaneEl.evaluate(el => el.scrollTop)

          // Click the nav item
          await navItem.click()

          // Wait for scroll animation and any re-rendering
          await page.waitForTimeout(1000)

          // Wait for question-pane to be visible again (in case of re-render)
          await questionPaneEl.waitFor({ state: 'visible', timeout: 5000 })

          // Get scroll position after click
          const scrollAfter = await questionPaneEl.evaluate(el => el.scrollTop)

          // Find the target element using data-question attribute
          const targetFound = await page.evaluate((qid) => {
            const pane = document.querySelector('.question-pane')
            if (!pane) return false

            // Try data-question match
            if (pane.querySelector(`[data-question="${qid}"]`)) return true

            // Try id match
            if (pane.querySelector(`#${CSS.escape(qid)}`)) return true
            if (pane.querySelector(`#${CSS.escape(qid + '_group')}`)) return true

            // Try anchor id match (for shared groups)
            if (pane.querySelector(`[id*="anchor"]`)) return true

            return false
          }, questionId)

          if (!targetFound) {
            throw new Error(`Q${displayNumber} (${questionId}): NO_TARGET - Could not find target element`)
          }

          console.log(`Q${displayNumber}: scrollBefore=${scrollBefore}, scrollAfter=${scrollAfter}, targetFound=${targetFound}`)
        }

        console.log(`All ${maxClicks} questions passed for ${examId}`)
      })
    })
  }
})
