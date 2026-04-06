import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  test: {
    environment: 'node',
    globals: true,
    include: ['test/**/*.test.ts'],
    exclude: [
      '**/node_modules/**',
      '**/*.integration.test.ts',
      // Long-running local LLM benchmarks; run explicitly: npx vitest run test/llm.benchmark.test.ts
      '**/llm.benchmark.test.ts',
      '**/llm.allmodels.benchmark.test.ts',
      '**/assistant.performance.benchmark.test.ts'
    ],
    clearMocks: true,
    restoreMocks: true
  }
})
