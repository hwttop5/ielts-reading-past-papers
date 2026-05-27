import { expect, test } from '@playwright/test'

test.describe('dropzone word option regression', () => {
  test('submits The Pearls word-list dropzone answers as semantic answer keys', async ({ page }) => {
    test.setTimeout(120000)
    await page.setViewportSize({ width: 1440, height: 1200 })

    await page.goto('/practice-mode?id=p1-high-110&mode=single', {
      waitUntil: 'networkidle',
      timeout: 90000
    })

    async function dragOptionToQuestion(optionText: string, questionId: string) {
      const questionPane = page.locator('.question-pane')
      await questionPane.evaluate((element) => {
        ;(element as HTMLElement).scrollTop = 640
      })
      await page.waitForTimeout(100)

      const option = page.getByRole('button', { name: optionText, exact: true })
      const dropzone = page.locator(`.native-dropzone[data-question="${questionId}"]`)
      const optionBox = await option.boundingBox()
      const dropzoneBox = await dropzone.boundingBox()
      expect(optionBox).toBeTruthy()
      expect(dropzoneBox).toBeTruthy()
      if (!optionBox || !dropzoneBox) {
        return
      }

      await page.mouse.move(optionBox.x + optionBox.width / 2, optionBox.y + optionBox.height / 2, { steps: 10 })
      await page.mouse.down()
      await page.mouse.move(dropzoneBox.x + dropzoneBox.width / 2, dropzoneBox.y + dropzoneBox.height / 2, { steps: 30 })
      await page.mouse.up()
      await expect(dropzone).toContainText(optionText)
    }

    await dragOptionToQuestion('J Persia', 'q5')
    await dragOptionToQuestion('K Mallorca', 'q6')

    await page.getByRole('button', { name: 'Submit', exact: true }).click()

    const q5Review = page.locator('.review-card').filter({ has: page.locator('.review-badge', { hasText: 'Q5' }) })
    const q6Review = page.locator('.review-card').filter({ has: page.locator('.review-badge', { hasText: 'Q6' }) })

    await expect(q5Review).toContainText('Correct')
    await expect(q5Review).toContainText('Your answer')
    await expect(q5Review).toContainText('J')
    await expect(q5Review).not.toContainText('word-J')

    await expect(q6Review).toContainText('Correct')
    await expect(q6Review).toContainText('Your answer')
    await expect(q6Review).toContainText('K')
    await expect(q6Review).not.toContainText('word-K')
  })
})
