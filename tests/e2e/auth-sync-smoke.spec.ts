import { expect, test } from '@playwright/test'

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:5175'
const PASSWORD = 'password123'

function guestPracticeRecord() {
  return {
    id: `e2e-record-${Date.now()}`,
    questionId: 'p1-high-05',
    questionTitle: 'E2E synced practice',
    category: 'P1',
    time: Date.now(),
    duration: 60,
    correctAnswers: 8,
    totalQuestions: 10,
    accuracy: 80,
    score: 8
  }
}

test.describe('auth sync smoke', () => {
  test('keeps guest data usable, syncs it after registration, and leaves it local after logout', async ({ browser, page }) => {
    test.setTimeout(120000)

    const email = `e2e-sync-${Date.now()}@example.com`
    const record = guestPracticeRecord()

    await page.addInitScript(({ record }) => {
      localStorage.setItem('ielts_practice', JSON.stringify([record]))
      localStorage.setItem(
        'ielts_settings',
        JSON.stringify({
          theme: 'light',
          language: 'en',
          showTutorial: true,
          autoSave: true
        })
      )
      localStorage.setItem('ielts-language', 'en')
      localStorage.setItem('ielts_theme', 'light')
    }, { record })

    await page.goto(`${BASE_URL}/practice`, { waitUntil: 'networkidle', timeout: 90000 })
    await expect(page.getByText(record.questionTitle)).toBeVisible()
    await expect(page.getByText('Guest', { exact: true })).toBeVisible()

    await page.getByTestId('account-entry').click()
    await page.getByRole('button', { name: 'Register' }).first().click()
    await page.getByTestId('auth-email').fill(email)
    await page.getByTestId('auth-password').fill(PASSWORD)

    const syncPush = page.waitForResponse((response) =>
      response.url().includes('/api/sync/push') && response.status() === 200
    )
    await page.getByTestId('auth-submit').click()
    await syncPush
    await expect(page.getByText(record.questionTitle)).toBeVisible()

    const cookies = await page.context().cookies()
    const secondContext = await browser.newContext()
    await secondContext.addCookies(cookies)
    const secondPage = await secondContext.newPage()

    try {
      await secondPage.goto(`${BASE_URL}/practice`, { waitUntil: 'networkidle', timeout: 90000 })
      await expect(secondPage.getByText(record.questionTitle)).toBeVisible({ timeout: 20000 })

      await secondPage.getByTestId('account-entry').click()
      await expect(secondPage.getByTestId('account-email')).toContainText(email)
      await secondPage.getByRole('button', { name: 'Log out' }).click()
      await expect(secondPage.getByText(record.questionTitle)).toBeVisible()
      await expect(secondPage.getByText('Guest', { exact: true })).toBeVisible()
    } finally {
      await secondContext.close()
    }
  })
})
