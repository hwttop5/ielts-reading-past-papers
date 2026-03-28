import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  test: {
    environment: 'node',
    globals: true,
    include: ['test/**/*.test.ts'],
    clearMocks: true,
    restoreMocks: true
  }
})
