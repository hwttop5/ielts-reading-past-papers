import { test, expect } from '@playwright/test'

test.describe('Dropzone drag auto-scroll', () => {
  test('drags a lower matching option into q9 at large font size', async ({ page }) => {
    test.setTimeout(120000)
    await page.setViewportSize({ width: 1440, height: 900 })

    await page.goto('/practice-mode?id=p1-high-01&mode=single', {
      waitUntil: 'networkidle',
      timeout: 90000
    })

    await page.getByRole('button', { name: 'L', exact: true }).click()

    const questionPane = page.locator('.question-pane')
    const option = page.getByRole('button', { name: 'D Holland', exact: true })
    const q9Dropzone = page.locator('.native-dropzone[data-question="q9"]')

    await questionPane.evaluate((element) => {
      const pane = element as HTMLElement
      pane.scrollTop = pane.scrollHeight
    })
    await expect(option).toBeVisible()

    const optionBox = await option.boundingBox()
    const paneBox = await questionPane.boundingBox()
    expect(optionBox).toBeTruthy()
    expect(paneBox).toBeTruthy()
    if (!optionBox || !paneBox) {
      return
    }

    const optionCenter = {
      x: optionBox.x + optionBox.width / 2,
      y: optionBox.y + optionBox.height / 2
    }

    await page.mouse.move(optionCenter.x, optionCenter.y)
    await page.mouse.down()
    await page.mouse.move(optionCenter.x, paneBox.y + 10, { steps: 24 })

    await expect.poll(async () => {
      const dropBox = await q9Dropzone.boundingBox()
      const currentPaneBox = await questionPane.boundingBox()
      if (!dropBox || !currentPaneBox) {
        return false
      }
      return dropBox.y >= currentPaneBox.y && dropBox.y + dropBox.height <= currentPaneBox.y + currentPaneBox.height
    }, { timeout: 6000 }).toBe(true)

    const dropBox = await q9Dropzone.boundingBox()
    expect(dropBox).toBeTruthy()
    if (!dropBox) {
      await page.mouse.up()
      return
    }

    await page.mouse.move(dropBox.x + dropBox.width / 2, dropBox.y + dropBox.height / 2, { steps: 12 })
    await page.mouse.up()

    await expect(q9Dropzone).toContainText('D Holland')
    const scrollTop = await questionPane.evaluate((element) => (element as HTMLElement).scrollTop)
    expect(scrollTop).toBeGreaterThan(0)
  })
})
