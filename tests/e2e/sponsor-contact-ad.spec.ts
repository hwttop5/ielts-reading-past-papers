import { expect, test } from '@playwright/test'

const STORAGE_KEY = 'ielts-reading-past-papers:sponsor-contact-ad'

async function waitForAutoOpenWindow() {
  await new Promise((resolve) => setTimeout(resolve, 700))
}

test.describe('Sponsor contact ad', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript((key) => {
      const clearGuardKey = `${key}:test-cleared`
      if (window.sessionStorage.getItem(clearGuardKey)) {
        return
      }
      window.localStorage.removeItem(key)
      window.sessionStorage.setItem(clearGuardKey, '1')
    }, STORAGE_KEY)
  })

  test('auto opens issue-backed markdown content and keeps the manual entry available', async ({ page }) => {
    await page.route('**/api/contact-ad', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          title: '消息通知',
          updatedAt: '2026-05-27T12:00:00+08:00',
          markdown:
            '## 公告\n\n- 第一条\n- 第二条\n\n| Telegram | QQ |\n| --- | --- |\n| ![Telegram 二维码](https://example.com/telegram.png) | ![QQ 二维码](https://example.com/qq.png) |\n\n[查看详情](https://example.com)'
        })
      })
    })

    await page.goto('/home', { waitUntil: 'networkidle' })

    await expect(page.getByTestId('sponsor-contact-action')).toHaveAttribute('title', '消息通知')
    await expect(page.getByTestId('sponsor-contact-campaign-icon')).toHaveText('campaign')
    await expect(page.locator('.header-right > button[data-testid="sponsor-contact-action"] + a.quick-action')).toHaveCount(1)
    await expect(page.getByTestId('sponsor-ad-modal')).toBeVisible()
    await expect(page.locator('.sponsor-ad-title')).toHaveText('消息通知')
    await expect(page.getByTestId('sponsor-ad-markdown')).toContainText('第一条')
    await expect(page.getByTestId('sponsor-ad-markdown')).toContainText('第二条')
    await expect(page.getByTestId('sponsor-ad-markdown').getByRole('link', { name: '查看详情' })).toHaveAttribute('href', 'https://example.com')
    await expect(page.getByTestId('sponsor-ad-markdown').locator('img')).toHaveCount(2)
    await expect(page.getByTestId('sponsor-ad-markdown').locator('img').nth(0)).toHaveAttribute('alt', 'Telegram 二维码')
    await expect(page.getByTestId('sponsor-ad-markdown').locator('img').nth(1)).toHaveAttribute('alt', 'QQ 二维码')
    await expect(page.locator('.sponsor-ad-qr-card')).toHaveCount(0)
    await expect(page.locator('.sponsor-ad-actions button')).toHaveCount(2)
    await expect(page.getByTestId('sponsor-ad-close-today').locator('.sponsor-ad-button-label')).toHaveText('今日已读')
    await expect(page.getByTestId('sponsor-ad-close-today')).toHaveClass(/sponsor-ad-primary/)
    await expect(page.getByTestId('sponsor-ad-close-forever')).toHaveClass(/sponsor-ad-secondary/)

    await page.getByTestId('sponsor-ad-close-today').click()
    await expect(page.getByTestId('sponsor-ad-modal')).toBeHidden()

    await page.reload({ waitUntil: 'networkidle' })
    await waitForAutoOpenWindow()
    await expect(page.getByTestId('sponsor-ad-modal')).toBeHidden()

    await page.getByTestId('sponsor-contact-action').click()
    await expect(page.getByTestId('sponsor-ad-modal')).toBeVisible()

    await page.getByTestId('sponsor-ad-close-forever').click()
    await expect(page.getByTestId('sponsor-ad-modal')).toBeHidden()

    await page.reload({ waitUntil: 'networkidle' })
    await waitForAutoOpenWindow()
    await expect(page.getByTestId('sponsor-ad-modal')).toBeHidden()

    await page.getByTestId('sponsor-contact-action').click()
    await expect(page.getByTestId('sponsor-ad-modal')).toBeVisible()
  })

  test('keeps the trigger button and shows an empty state when the issue body is empty', async ({ page }) => {
    await page.route('**/api/contact-ad', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          title: '消息通知',
          updatedAt: '2026-05-27T12:00:00+08:00',
          markdown: ''
        })
      })
    })

    await page.goto('/home', { waitUntil: 'networkidle' })
    await waitForAutoOpenWindow()

    await expect(page.getByTestId('sponsor-contact-action')).toBeVisible()
    await expect(page.getByTestId('sponsor-ad-modal')).toHaveCount(0)

    await page.getByTestId('sponsor-contact-action').click()
    await expect(page.getByTestId('sponsor-ad-modal')).toBeVisible()
    await expect(page.locator('.sponsor-ad-title')).toHaveText('消息通知')
    await expect(page.getByTestId('sponsor-ad-markdown')).toContainText('暂无公告')
  })

  test('keeps the page usable and shows the empty-state entry when the API fails', async ({ page }) => {
    await page.route('**/api/contact-ad', async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'upstream_failed'
        })
      })
    })

    await page.goto('/home', { waitUntil: 'networkidle' })
    await waitForAutoOpenWindow()

    await expect(page.getByTestId('sponsor-contact-action')).toBeVisible()
    await expect(page.getByTestId('sponsor-ad-modal')).toHaveCount(0)
    await expect(page.locator('.fixed-header')).toBeVisible()
  })
})
