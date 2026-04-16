import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { similarRecommendationsPath } from '../config/paths.js'
import {
  getSharedKeywords,
  getSharedQuestionTypes,
  getSharedTitleTerms,
  scoreQuestionSummarySimilarity,
  type StaticSimilarCandidate,
  type StaticSimilarRecommendationMap
} from '../lib/assistant/similarRecommendations.js'
import { loadQuestionIndex, parseReadingNativeDocument } from '../lib/question-bank/index.js'
import type { QuestionIndexEntry, QuestionSummaryDoc } from '../types/question-bank.js'

const VERSION = 'static-similar-v1'
const CANDIDATE_LIMIT = 10

interface SummaryRecord {
  question: QuestionIndexEntry
  summary: QuestionSummaryDoc
}

function roundScore(value: number): number {
  return Number(value.toFixed(3))
}

function toCandidate(current: QuestionSummaryDoc, candidate: QuestionSummaryDoc): StaticSimilarCandidate {
  return {
    questionId: candidate.questionId,
    title: candidate.title,
    category: candidate.category,
    difficulty: candidate.difficulty,
    baseScore: roundScore(scoreQuestionSummarySimilarity(current, candidate)),
    sharedTitleTerms: getSharedTitleTerms(current, candidate).slice(0, 6),
    sharedKeywords: getSharedKeywords(current, candidate).slice(0, 6),
    sharedQuestionTypes: getSharedQuestionTypes(current, candidate).slice(0, 6),
    sameCategory: current.category === candidate.category,
    sameDifficulty: current.difficulty.toLowerCase() === candidate.difficulty.toLowerCase()
  }
}

function sortCandidates(left: StaticSimilarCandidate, right: StaticSimilarCandidate): number {
  const scoreDiff = right.baseScore - left.baseScore
  if (scoreDiff !== 0) return scoreDiff

  const typeDiff = right.sharedQuestionTypes.length - left.sharedQuestionTypes.length
  if (typeDiff !== 0) return typeDiff

  const titleDiff = (right.sharedTitleTerms?.length ?? 0) - (left.sharedTitleTerms?.length ?? 0)
  if (titleDiff !== 0) return titleDiff

  const keywordDiff = right.sharedKeywords.length - left.sharedKeywords.length
  if (keywordDiff !== 0) return keywordDiff

  if (left.sameCategory !== right.sameCategory) {
    return left.sameCategory ? -1 : 1
  }

  if (left.sameDifficulty !== right.sameDifficulty) {
    return left.sameDifficulty ? -1 : 1
  }

  return left.questionId.localeCompare(right.questionId, 'en')
}

async function loadSummaries(): Promise<SummaryRecord[]> {
  const questions = await loadQuestionIndex()
  const records: SummaryRecord[] = []

  for (const question of questions) {
    const document = await parseReadingNativeDocument(question)
    if (!document) {
      continue
    }
    records.push({ question, summary: document.summary })
  }

  return records
}

function buildMap(records: SummaryRecord[]): StaticSimilarRecommendationMap {
  const recommendations: Record<string, StaticSimilarCandidate[]> = {}

  for (const current of records) {
    recommendations[current.summary.questionId] = records
      .filter((candidate) => candidate.summary.questionId !== current.summary.questionId)
      .map((candidate) => toCandidate(current.summary, candidate.summary))
      .sort(sortCandidates)
      .slice(0, CANDIDATE_LIMIT)
  }

  return {
    version: VERSION,
    generatedAt: new Date().toISOString(),
    questionCount: records.length,
    candidateLimit: CANDIDATE_LIMIT,
    recommendations
  }
}

function validateMap(data: StaticSimilarRecommendationMap, validQuestionIds: Set<string>): string[] {
  const errors: string[] = []
  const recommendationIds = Object.keys(data.recommendations || {})

  if (data.version !== VERSION) {
    errors.push(`Unexpected version: ${data.version}`)
  }
  if (data.questionCount !== validQuestionIds.size) {
    errors.push(`questionCount mismatch: file=${data.questionCount}, expected=${validQuestionIds.size}`)
  }

  for (const questionId of validQuestionIds) {
    const candidates = data.recommendations[questionId]
    if (!Array.isArray(candidates) || candidates.length === 0) {
      errors.push(`${questionId}: missing candidates`)
      continue
    }

    const seen = new Set<string>()
    for (const candidate of candidates) {
      if (candidate.questionId === questionId) {
        errors.push(`${questionId}: self recommendation`)
      }
      if (!validQuestionIds.has(candidate.questionId)) {
        errors.push(`${questionId}: unknown candidate ${candidate.questionId}`)
      }
      if (seen.has(candidate.questionId)) {
        errors.push(`${questionId}: duplicate candidate ${candidate.questionId}`)
      }
      seen.add(candidate.questionId)
    }
  }

  for (const questionId of recommendationIds) {
    if (!validQuestionIds.has(questionId)) {
      errors.push(`Unexpected recommendation key: ${questionId}`)
    }
  }

  return errors
}

async function readExistingMap(): Promise<StaticSimilarRecommendationMap> {
  const raw = await readFile(similarRecommendationsPath, 'utf8')
  return JSON.parse(raw) as StaticSimilarRecommendationMap
}

async function main() {
  const checkOnly = process.argv.includes('--check')
  const records = await loadSummaries()
  const validQuestionIds = new Set(records.map((record) => record.summary.questionId))

  if (records.length === 0) {
    throw new Error('No reading-native summaries found.')
  }

  const data = checkOnly ? await readExistingMap() : buildMap(records)
  const errors = validateMap(data, validQuestionIds)
  if (errors.length > 0) {
    throw new Error(`Similar recommendation map validation failed:\n${errors.slice(0, 20).join('\n')}`)
  }

  if (!checkOnly) {
    await mkdir(dirname(similarRecommendationsPath), { recursive: true })
    await writeFile(similarRecommendationsPath, `${JSON.stringify(data, null, 2)}\n`, 'utf8')
  }

  const candidateCounts = Object.values(data.recommendations).map((items) => items.length)
  const minCandidates = Math.min(...candidateCounts)
  const maxCandidates = Math.max(...candidateCounts)
  console.log(`${checkOnly ? 'Validated' : 'Generated'} ${data.questionCount} similar recommendation lists at ${similarRecommendationsPath}`)
  console.log(`Candidate count per question: min=${minCandidates}, max=${maxCandidates}, limit=${data.candidateLimit}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
