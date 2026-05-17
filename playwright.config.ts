import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [
    ['html', { outputFolder: './output/question-nav/playwright-report' }],
    ['list']
  ],
  outputDir: './output/question-nav/test-results',
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:5175',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure'
  },
  // Note: webServer is commented out - assume dev server is already running
  // Run `npm run dev:web` before running tests
  timeout: 60000,
  expect: {
    timeout: 10000
  }
})
