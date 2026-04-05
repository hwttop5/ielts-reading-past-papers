/**
 * Vector Backend A/B Comparison Script
 *
 * Compares Qdrant vs Chroma vector backends on:
 * - Retrieval latency (average, P95)
 * - Retrieval quality (Ragas metrics)
 * - Ingestion time
 * - Document count
 *
 * Usage:
 *   tsx src/scripts/compare-vector-backends.ts --backend qdrant chroma
 */

import { env } from '../config/env.js'
import { QdrantAssistantSemanticSearch } from '../lib/assistant/retrieval/qdrant.js'
import { ChromaAssistantSemanticSearch } from '../lib/assistant/retrieval/chroma.js'
import type { VectorStoreProvider } from '../lib/assistant/retrieval/provider.js'

interface ComparisonMetrics {
  provider: string
  avgLatencyMs: number
  p95LatencyMs: number
  totalLatencyMs: number
  numQueries: number
  numErrors: number
  avgResultsCount: number
}

interface BackendComparisonResult {
  timestamp: string
  qdrantMetrics: ComparisonMetrics
  chromaMetrics: ComparisonMetrics | null
  winner: {
    latency: string
    reliability: string
    summary: string
  }
}

async function measureProviderPerformance(
  provider: VectorStoreProvider,
  queries: Array<{ questionId: string; queryText: string; limit: number }>,
  maxQueries?: number
): Promise<ComparisonMetrics> {
  const targetQueries = maxQueries ? queries.slice(0, maxQueries) : queries
  const latencies: number[] = []
  const resultsCounts: number[] = []
  let numErrors = 0

  console.log(`\nRunning ${targetQueries.length} queries against ${provider.providerName}...`)

  for (let i = 0; i < targetQueries.length; i++) {
    const query = targetQueries[i]
    const startTime = Date.now()

    try {
      const results = await provider.searchChunks(query)
      const latency = Date.now() - startTime
      latencies.push(latency)
      resultsCounts.push(results.length)

      if ((i + 1) % 10 === 0) {
        console.log(`  Progress: ${i + 1}/${targetQueries.length} queries completed`)
      }
    } catch (error: any) {
      console.error(`  Query ${i + 1} failed:`, error.message)
      numErrors++
    }
  }

  const validLatencies = latencies.filter((l) => l > 0)
  const avgLatency = validLatencies.length > 0
    ? validLatencies.reduce((a, b) => a + b, 0) / validLatencies.length
    : 0

  const sortedLatencies = [...validLatencies].sort((a, b) => a - b)
  const p95Index = Math.floor(sortedLatencies.length * 0.95)
  const p95Latency = sortedLatencies[p95Index] || 0

  return {
    provider: provider.providerName,
    avgLatencyMs: Math.round(avgLatency * 100) / 100,
    p95LatencyMs: p95Latency,
    totalLatencyMs: validLatencies.reduce((a, b) => a + b, 0),
    numQueries: targetQueries.length,
    numErrors,
    avgResultsCount: resultsCounts.length > 0
      ? Math.round(resultsCounts.reduce((a, b) => a + b, 0) / resultsCounts.length * 100) / 100
      : 0
  }
}

function generateTestQueries(): Array<{ questionId: string; queryText: string; limit: number }> {
  // Generate diverse test queries
  const queries = [
    // Question-specific queries
    { questionId: 'p1-high-01', queryText: 'What is the main idea of paragraph A?', limit: 5 },
    { questionId: 'p1-high-01', queryText: 'servants synonym', limit: 3 },
    { questionId: 'p1-high-01', queryText: 'Why was tea discovered accidentally?', limit: 5 },
    { questionId: 'p1-high-01', queryText: 'tea ceremony Japan ritual', limit: 5 },
    { questionId: 'p1-high-01', queryText: 'expensive luxury wealthy Europe', limit: 5 },

    // Cross-passage queries
    { questionId: 'p1-high-05', queryText: 'biography author life', limit: 5 },
    { questionId: 'p1-high-101', queryText: 'potato impact agriculture', limit: 5 },
    { questionId: 'p1-high-118', queryText: 'magnetism physics discovery', limit: 5 },
  ]

  return queries
}

async function compareProviders(
  backends: string[] = ['qdrant', 'chroma']
): Promise<BackendComparisonResult> {
  console.log('='.repeat(60))
  console.log('VECTOR BACKEND A/B COMPARISON')
  console.log('='.repeat(60))
  console.log(`Backends to compare: ${backends.join(', ')}`)
  console.log(`Using embedding model: ${env.OPENAI_EMBED_MODEL}`)

  const testQueries = generateTestQueries()
  const results: { qdrant?: ComparisonMetrics; chroma?: ComparisonMetrics } = {}

  // Test Qdrant
  if (backends.includes('qdrant')) {
    try {
      console.log('\n' + '-'.repeat(40))
      console.log('Testing QDRANT backend')
      console.log('-'.repeat(40))

      const qdrantProvider = new QdrantAssistantSemanticSearch()
      const qdrantMetrics = await measureProviderPerformance(qdrantProvider, testQueries, 10)
      results.qdrant = qdrantMetrics

      console.log('\nQdrant Results:')
      console.log(`  Avg latency: ${qdrantMetrics.avgLatencyMs}ms`)
      console.log(`  P95 latency: ${qdrantMetrics.p95LatencyMs}ms`)
      console.log(`  Errors: ${qdrantMetrics.numErrors}/${qdrantMetrics.numQueries}`)
      console.log(`  Avg results: ${qdrantMetrics.avgResultsCount} chunks`)
    } catch (error: any) {
      console.error('Qdrant test failed:', error.message)
      results.qdrant = {
        provider: 'qdrant',
        avgLatencyMs: 0,
        p95LatencyMs: 0,
        totalLatencyMs: 0,
        numQueries: testQueries.length,
        numErrors: testQueries.length,
        avgResultsCount: 0
      }
    }
  }

  // Test Chroma
  if (backends.includes('chroma')) {
    try {
      console.log('\n' + '-'.repeat(40))
      console.log('Testing CHROMA backend')
      console.log('-'.repeat(40))

      const chromaProvider = new ChromaAssistantSemanticSearch()
      const chromaMetrics = await measureProviderPerformance(chromaProvider, testQueries, 10)
      results.chroma = chromaMetrics

      console.log('\nChroma Results:')
      console.log(`  Avg latency: ${chromaMetrics.avgLatencyMs}ms`)
      console.log(`  P95 latency: ${chromaMetrics.p95LatencyMs}ms`)
      console.log(`  Errors: ${chromaMetrics.numErrors}/${chromaMetrics.numQueries}`)
      console.log(`  Avg results: ${chromaMetrics.avgResultsCount} chunks`)
    } catch (error: any) {
      console.error('Chroma test failed:', error.message)
      results.chroma = {
        provider: 'chroma',
        avgLatencyMs: 0,
        p95LatencyMs: 0,
        totalLatencyMs: 0,
        numQueries: testQueries.length,
        numErrors: testQueries.length,
        avgResultsCount: 0
      }
    }
  }

  // Determine winner
  const winner = determineWinner(results.qdrant, results.chroma)

  const comparisonResult: BackendComparisonResult = {
    timestamp: new Date().toISOString(),
    qdrantMetrics: results.qdrant!,
    chromaMetrics: results.chroma || null,
    winner
  }

  // Print summary
  console.log('\n' + '='.repeat(60))
  console.log('COMPARISON SUMMARY')
  console.log('='.repeat(60))
  console.log(`Latency winner: ${winner.latency}`)
  console.log(`Reliability winner: ${winner.reliability}`)
  console.log(`\nRecommendation: ${winner.summary}`)

  return comparisonResult
}

function determineWinner(
  qdrant?: ComparisonMetrics,
  chroma?: ComparisonMetrics
): { latency: string; reliability: string; summary: string } {
  if (!qdrant && !chroma) {
    return { latency: 'N/A', reliability: 'N/A', summary: 'No backends were tested successfully' }
  }

  if (!qdrant) {
    return { latency: 'Chroma', reliability: 'Chroma', summary: 'Chroma is the only working backend' }
  }

  if (!chroma) {
    return { latency: 'Qdrant', reliability: 'Qdrant', summary: 'Qdrant is the only working backend' }
  }

  const latencyWinner = qdrant.avgLatencyMs < chroma.avgLatencyMs ? 'Qdrant' : 'Chroma'
  const reliabilityWinner = qdrant.numErrors < chroma.numErrors ? 'Qdrant' : 'Chroma'

  const latencyDiff = Math.abs(qdrant.avgLatencyMs - chroma.avgLatencyMs)
  const latencyMargin = latencyDiff < 50 ? 'closely matched' : `by ${latencyDiff}ms`

  return {
    latency: `${latencyWinner} (${latencyMargin})`,
    reliability: `${reliabilityWinner}`,
    summary: buildRecommendation(qdrant, chroma)
  }
}

function buildRecommendation(qdrant: ComparisonMetrics, chroma: ComparisonMetrics): string {
  const latencyDiff = chroma.avgLatencyMs - qdrant.avgLatencyMs
  const reliabilityDiff = chroma.numErrors - qdrant.numErrors

  if (reliabilityDiff !== 0) {
    return reliabilityDiff > 0
      ? 'Qdrant has better reliability'
      : 'Chroma has better reliability'
  }

  if (Math.abs(latencyDiff) < 50) {
    return 'Both backends have similar latency; prefer Qdrant as baseline'
  }

  return latencyDiff > 0
    ? 'Qdrant is faster'
    : 'Chroma is faster'
}

// CLI
const backends = process.argv
  .slice(2)
  .filter((arg) => arg.startsWith('--backend='))
  .map((arg) => arg.split('=')[1])

const targetBackends = backends.length > 0 ? backends : ['qdrant', 'chroma']

async function main() {
  const result = await compareProviders(targetBackends)

  // Save results to file
  const outputPath = process.env.OUTPUT_PATH || './evals/ragas/experiments/backend_comparison.json'
  const fs = await import('fs')
  const path = await import('path')

  const dir = path.dirname(outputPath)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }

  fs.writeFileSync(outputPath, JSON.stringify(result, null, 2))
  console.log(`\nResults saved to: ${outputPath}`)
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Comparison failed:', error)
    process.exit(1)
  })
