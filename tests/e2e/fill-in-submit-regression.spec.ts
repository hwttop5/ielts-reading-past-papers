import { test, expect } from '@playwright/test'

test.describe('Fill-in submit regression', () => {
  test('submits a fill-in answer when practice history contains damaged records', async ({ page }) => {
    test.setTimeout(120000)

    const runtimeErrors: string[] = []
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        runtimeErrors.push(msg.text())
      }
    })
    page.on('pageerror', (error) => {
      runtimeErrors.push(error.message)
    })

    await page.addInitScript(() => {
      localStorage.setItem(
        'ielts_practice',
        JSON.stringify([
          null,
          {},
          { accuracy: 80, category: 'P1', duration: 30 },
          {
            id: 'valid-history',
            questionId: 'p1-low-02',
            questionTitle: 'History',
            time: Date.now(),
            duration: 45,
            correctAnswers: 8,
            totalQuestions: 13,
            accuracy: 62,
            score: 8,
            category: 'P1'
          }
        ])
      )
    })

    await page.goto('/practice-mode?id=p1-high-05', {
      waitUntil: 'networkidle',
      timeout: 90000
    })

    await page.waitForSelector('.native-text-input', { timeout: 60000 })
    await page.locator('.native-text-input').first().fill('sample answer')
    await page.getByRole('button', { name: 'Submit' }).click()

    await expect(page.locator('.summary-card')).toBeVisible()
    await expect(page.locator('.state-banner', { hasText: 'questionId' })).toHaveCount(0)
    expect(runtimeErrors.filter((entry) => entry.includes('questionId'))).toEqual([])
  })
})
