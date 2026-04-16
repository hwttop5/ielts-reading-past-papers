import { readFile } from 'node:fs/promises'
import { similarRecommendationsPath } from '../../config/paths.js'
import type { QuestionSummaryDoc } from '../../types/question-bank.js'

export interface StaticSimilarCandidate {
  questionId: string
  title: string
  category: string
  difficulty: string
  baseScore: number
  sharedTitleTerms?: string[]
  sharedKeywords: string[]
  sharedQuestionTypes: string[]
  sameCategory: boolean
  sameDifficulty?: boolean
}

export interface StaticSimilarRecommendationMap {
  version: string
  generatedAt: string
  questionCount: number
  candidateLimit: number
  recommendations: Record<string, StaticSimilarCandidate[]>
}

let staticSimilarPromise: Promise<StaticSimilarRecommendationMap | null> | null = null

const COMMON_SIMILARITY_TERMS = new Set([
  'the',
  'and',
  'for',
  'are',
  'was',
  'were',
  'has',
  'had',
  'have',
  'his',
  'her',
  'its',
  'their',
  'this',
  'that',
  'these',
  'those',
  'with',
  'from',
  'into',
  'about',
  'after',
  'before',
  'between',
  'during',
  'through',
  'over',
  'under',
  'also',
  'more',
  'most',
  'many',
  'some',
  'such',
  'than',
  'then',
  'when',
  'where',
  'which',
  'what',
  'who',
  'how',
  'can',
  'could',
  'would',
  'should',
  'will',
  'one',
  'two',
  'first',
  'brief',
  'new',
  'old',
  'use',
  'used',
  'using',
  'made',
  'make',
  'known'
])

const LOW_SIGNAL_SIMILARITY_TERMS = new Set([
  'history',
  'study',
  'studies',
  'research',
  'researchers',
  'people',
  'person',
  'human',
  'humans',
  'world',
  'time',
  'years',
  'year',
  'century',
  'centuries',
  'ancient',
  'modern',
  'social',
  'important',
  'information',
  'development',
  'different',
  'example',
  'problem',
  'process',
  'system',
  'work',
  'way',
  'ways'
])

const IGNORED_QUESTION_TYPES = new Set(['unknown'])

function normalizeSimilarityTerm(value: string): string {
  return value
    .toLowerCase()
    .replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, '')
}

function similarityTermWeight(term: string): number {
  if (!term || term.length < 3 || COMMON_SIMILARITY_TERMS.has(term)) {
    return 0
  }
  if (LOW_SIGNAL_SIMILARITY_TERMS.has(term)) {
    return 0.1
  }
  return 1
}

function uniqueTerms(values: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const value of values) {
    const term = normalizeSimilarityTerm(value)
    if (similarityTermWeight(term) <= 0 || seen.has(term)) {
      continue
    }
    seen.add(term)
    out.push(term)
  }
  return out
}

export function tokenizeSimilarityText(value: string): string[] {
  return uniqueTerms(value.match(/[A-Za-z0-9][A-Za-z0-9'-]{1,}/g) ?? [])
}

function intersectTerms(left: string[], right: string[]): string[] {
  const leftSet = new Set(uniqueTerms(left))
  return uniqueTerms(right).filter((term) => leftSet.has(term))
}

export function getSharedKeywords(current: QuestionSummaryDoc, candidate: QuestionSummaryDoc): string[] {
  return intersectTerms(current.keywords, candidate.keywords)
}

export function getSharedTitleTerms(current: QuestionSummaryDoc, candidate: QuestionSummaryDoc): string[] {
  return intersectTerms(tokenizeSimilarityText(current.title), tokenizeSimilarityText(candidate.title))
}

export function getSharedQuestionTypes(current: QuestionSummaryDoc, candidate: QuestionSummaryDoc): string[] {
  const currentTypes = new Set(current.questionTypes.map((type) => type.toLowerCase()).filter((type) => !IGNORED_QUESTION_TYPES.has(type)))
  return candidate.questionTypes
    .map((type) => type.toLowerCase())
    .filter((type, index, values) => currentTypes.has(type) && values.indexOf(type) === index)
}

export function scoreQuestionSummarySimilarity(current: QuestionSummaryDoc, candidate: QuestionSummaryDoc): number {
  const titleScore = getSharedTitleTerms(current, candidate).reduce((sum, term) => sum + similarityTermWeight(term) * 5, 0)
  const keywordScore = getSharedKeywords(current, candidate).reduce((sum, term) => sum + similarityTermWeight(term) * 3, 0)
  const typeScore = getSharedQuestionTypes(current, candidate).length * 1.2
  const categoryScore = current.category === candidate.category ? 0.8 : 0
  const difficultyScore = current.difficulty.toLowerCase() === candidate.difficulty.toLowerCase() ? 0.2 : 0
  return titleScore + keywordScore + typeScore + categoryScore + difficultyScore
}

export async function loadStaticSimilarRecommendations(): Promise<StaticSimilarRecommendationMap | null> {
  if (staticSimilarPromise) {
    return staticSimilarPromise
  }

  staticSimilarPromise = readFile(similarRecommendationsPath, 'utf8')
    .then((raw) => JSON.parse(raw) as StaticSimilarRecommendationMap)
    .catch(() => null)

  return staticSimilarPromise
}

export async function getStaticSimilarCandidates(questionId: string): Promise<StaticSimilarCandidate[]> {
  const data = await loadStaticSimilarRecommendations()
  return data?.recommendations?.[questionId] ?? []
}
