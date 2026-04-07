#!/usr/bin/env node
/**
 * Smoke-check assistant API after deploy (no RAG).
 * Usage: node scripts/check-deployment.mjs <assistantBaseUrl>
 * Example: node scripts/check-deployment.mjs https://<your-assistant-host>
 */
const base = (process.argv[2] || '').replace(/\/$/, '')
if (!base || !base.startsWith('http')) {
  console.error('Usage: node scripts/check-deployment.mjs <assistantBaseUrl>')
  process.exit(1)
}

const url = `${base}/health`
const res = await fetch(url, { headers: { Accept: 'application/json' } })
const text = await res.text()
let json
try {
  json = JSON.parse(text)
} catch {
  console.error(`Not JSON from ${url} (HTTP ${res.status}):\n${text.slice(0, 500)}`)
  process.exit(1)
}

if (!res.ok) {
  console.error(`HTTP ${res.status} from ${url}`)
  console.error(json)
  process.exit(1)
}

const { status, assistantRuntimeMode, semanticSearchConfigured } = json
console.log('OK', { status, assistantRuntimeMode, semanticSearchConfigured })

if (status !== 'ok') {
  process.exit(1)
}
// No-RAG production: expect semanticSearchConfigured === false and assistantRuntimeMode === 'llm-enabled'
if (process.env.EXPECT_NO_RAG === '1' && semanticSearchConfigured !== false) {
  console.error('EXPECT_NO_RAG=1 but semanticSearchConfigured is not false — unset QDRANT_/EMBEDDING_ on the host.')
  process.exit(1)
}
if (
  process.env.EXPECT_NO_RAG === '1' &&
  assistantRuntimeMode !== 'llm-enabled'
) {
  console.error(
    'EXPECT_NO_RAG=1 but assistantRuntimeMode is',
    assistantRuntimeMode,
    '(expected llm-enabled)'
  )
  process.exit(1)
}
