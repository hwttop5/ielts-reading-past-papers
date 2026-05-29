import { expect, test } from '@playwright/test'

async function openWoodPractice(page: import('@playwright/test').Page, viewport: { width: number; height: number }) {
  await page.route('**/api/contact-ad', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        enabled: false,
        title: '消息通知',
        markdown: '',
        updatedAt: '2026-05-29T00:00:00.000Z'
      })
    })
  })
  await page.setViewportSize(viewport)
  await page.goto('/practice-mode?id=p1-medium-119&mode=single', {
    waitUntil: 'networkidle',
    timeout: 90000
  })
  await page.waitForSelector('.native-practice-shell', { timeout: 60000 })
}

async function chooseRadio(page: import('@playwright/test').Page, questionId: string, answer: string) {
  const selected = await page.evaluate(({ questionId, answer }) => {
    const input = Array.from(document.querySelectorAll(`input[data-question="${questionId}"]`)).find((element) => {
      const label = element.closest('label')?.textContent?.replace(/\s+/g, ' ').trim()
      return label === answer
    })
    if (!(input instanceof HTMLInputElement)) {
      return false
    }
    input.click()
    return input.checked
  }, { questionId, answer })
  expect(selected).toBe(true)
}

test.describe('highlight and Wood scoring regressions', () => {
  test('scores Wood numeric aliases as 13/13 and keeps TFNG radio values available', async ({ page }) => {
    await openWoodPractice(page, { width: 1280, height: 900 })

    const choices = {
      q1: 'FALSE',
      q2: 'TRUE',
      q3: 'NOT GIVEN',
      q4: 'FALSE',
      q5: 'NOT GIVEN',
      q6: 'TRUE'
    }
    for (const [questionId, answer] of Object.entries(choices)) {
      await chooseRadio(page, questionId, answer)
    }

    const textAnswers = {
      q7: 'shipping costs',
      q8: 'export sector',
      q9: '60,000',
      q10: 'softwood',
      q11: 'sustainability',
      q12: 'Scandinavian countries',
      q13: 'wood substitutes'
    }
    for (const [questionId, answer] of Object.entries(textAnswers)) {
      await page.locator(`input[data-question="${questionId}"]`).fill(answer)
    }

    await expect(page.locator('input[data-question="q1"]').nth(1)).toHaveAttribute('value', 'FALSE')
    await page.getByRole('button', { name: 'Submit', exact: true }).click()

    await expect(page.locator('.score-pill')).toHaveText('13/13')
    const q9Review = page.locator('.review-card').filter({ has: page.locator('.review-badge', { hasText: 'Q9' }) })
    await expect(q9Review).toContainText('Correct')
    await expect(q9Review).toContainText('60,000')
  })

  test('highlights only the selected answer text and removes a plain highlight by click', async ({ page }) => {
    await openWoodPractice(page, { width: 1280, height: 900 })

    const selection = await page.evaluate(async () => {
      const root = document.querySelector('.question-pane')
      const target = Array.from(root?.querySelectorAll('[data-highlight-node-path]') || [])
        .find((element) => element.textContent?.trim() === 'TRUE')
      if (!target?.firstChild) {
        return { ok: false, reason: 'target not found' }
      }
      target.scrollIntoView({ block: 'center', inline: 'nearest' })
      await new Promise((resolve) => window.setTimeout(resolve, 50))
      const rect = target.getBoundingClientRect()
      const range = document.createRange()
      range.selectNodeContents(target.firstChild)
      const browserSelection = window.getSelection()
      browserSelection?.removeAllRanges()
      browserSelection?.addRange(range)
      target.dispatchEvent(new MouseEvent('mouseup', {
        bubbles: true,
        clientX: rect.left + 5,
        clientY: rect.top + 5
      }))
      return {
        ok: true,
        path: target.getAttribute('data-highlight-node-path')
      }
    })

    expect(selection).toMatchObject({ ok: true })
    expect(String(selection.path)).toContain('2000.0.1')
    await expect(page.locator('.selection-toolbar')).toBeVisible()

    await page.locator('.selection-toolbar .selection-btn', { hasText: 'Highlight' }).click()
    const marks = page.locator('.question-pane mark.native-highlight')
    await expect(marks).toHaveCount(1)
    await expect(marks.first()).toHaveText('TRUE')

    await marks.first().click()
    await expect(page.locator('.selection-toolbar')).toBeVisible()
    await page.locator('.selection-toolbar .selection-btn', { hasText: 'Remove' }).click()
    await expect(page.locator('.question-pane mark.native-highlight')).toHaveCount(0)
  })

  test('keeps the Wood layout stable on tablet and desktop widths', async ({ page }) => {
    for (const viewport of [
      { width: 768, height: 1024 },
      { width: 1440, height: 1000 }
    ]) {
      await openWoodPractice(page, viewport)
      const q1RadioOptions = page.locator('.question-item').filter({ hasText: 'Settlers realised' }).locator('.radio-options')
      await expect(q1RadioOptions).toBeVisible()
      const direction = await q1RadioOptions.evaluate((element) => getComputedStyle(element).flexDirection)
      expect(direction).toBe('column')
    }
  })
})
