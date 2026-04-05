import nativeManifest from '@/generated/reading-native/manifest.json'
import type {
  PracticeAnswerComparisonEntry,
  PracticeDraftState,
  PracticeHighlightRecord,
  PracticeSessionDraft,
  PracticeSessionResult,
  PracticeScrollState,
  PracticeDropzoneValue,
  PracticeRouteMode,
  ReadingExamDocument,
  ReadingExplanationDocument,
  ReadingNativeManifest,
  ReadingNativeManifestEntry
} from '@/types/readingNative'

const examModules = import.meta.glob('../generated/reading-native/exams/*.json')
const explanationModules = import.meta.glob('../generated/reading-native/explanations/*.json')

export interface PracticeRecordSnapshotInput {
  exam: ReadingExamDocument
  answers: Record<string, string | string[]>
  markedQuestions: string[]
  highlights: PracticeHighlightRecord[]
  mode: PracticeRouteMode
}

export interface PracticeRouteContext {
  examId: string
  mode: PracticeRouteMode
  suiteSessionId: string
}

export interface GroupPoolMeta {
  groupId: string
  questionIds: string[]
  poolIds: string[]
  allowOptionReuse: boolean
}

export interface QuestionGroupMeta extends GroupPoolMeta {
  questionId: string
}

export function getReadingNativeManifest(): ReadingNativeManifest {
  return nativeManifest as ReadingNativeManifest
}

export function getManifestEntry(examId: string): ReadingNativeManifestEntry | null {
  return getReadingNativeManifest().exams[examId] || null
}

export async function loadReadingExamDocument(examId: string): Promise<ReadingExamDocument | null> {
  const loader = examModules[`../generated/reading-native/exams/${examId}.json`]
  if (!loader) {
    return null
  }
  const module = await loader()
  return (module as { default: ReadingExamDocument }).default
}

export async function loadReadingExplanationDocument(examId: string): Promise<ReadingExplanationDocument | null> {
  const loader = explanationModules[`../generated/reading-native/explanations/${examId}.json`]
  if (!loader) {
    return null
  }
  const module = await loader()
  return (module as { default: ReadingExplanationDocument }).default
}

export function createEmptyDraftState(): PracticeDraftState {
  return {
    choiceGroups: {},
    textAnswers: {},
    selectAnswers: {},
    textareaAnswers: {},
    dropzoneAnswers: {}
  }
}

export function createEmptyScrollState(): PracticeScrollState {
  return {
    passageTop: 0,
    questionsTop: 0
  }
}

export function expandQuestionSequence(rawValue: string): string[] {
  const value = String(rawValue || '').trim().toLowerCase()
  if (!value) {
    return []
  }
  const numbers = (value.match(/\d+/g) || []).map((entry) => Number(entry))
  if ((value.includes('-') || value.includes('鈥')) && numbers.length > 2) {
    return numbers.map((entry) => `q${entry}`)
  }
  if ((value.includes('-') || value.includes('鈥')) && numbers.length === 2 && numbers[1] >= numbers[0]) {
    const ids: string[] = []
    for (let current = numbers[0]; current <= numbers[1]; current += 1) {
      ids.push(`q${current}`)
    }
    return ids
  }
  if (value.includes('_') && numbers.length >= 2) {
    return numbers.map((entry) => `q${entry}`)
  }
  const direct = value.match(/^q\d+$/i)
  if (direct) {
    return [direct[0].toLowerCase()]
  }
  if (numbers.length === 1) {
    return [`q${numbers[0]}`]
  }
  return []
}

export function canonicalizeAnswerToken(value: unknown): string {
  if (value == null) return ''
  const cleaned = String(value)
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[‐‑‒–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[\s"'`()[\]{}<>.,;:!?]+|[\s"'`()[\]{}<>.,;:!?]+$/g, '')
  if (!cleaned) {
    return ''
  }
  const lowered = cleaned.toLowerCase()
  if (['true', 't', 'yes', 'y'].includes(lowered)) return 'true'
  if (['false', 'f', 'no', 'n'].includes(lowered)) return 'false'
  if (['ng', 'notgiven', 'not-given'].includes(lowered)) return 'not given'
  if (/^[a-z]$/i.test(cleaned)) return cleaned.toUpperCase()
  const leadingOption = cleaned.match(/^([A-Za-z])(?:[.)])?\s+/)
  if (leadingOption && cleaned.length > 2) {
    return leadingOption[1].toUpperCase()
  }
  return cleaned
}

export function splitAnswerTokens(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((entry) => splitAnswerTokens(entry))
  }
  const cleaned = String(value ?? '').trim()
  if (!cleaned) {
    return []
  }
  return cleaned
    .split(/[\n,;/]+/g)
    .map((entry) => canonicalizeAnswerToken(entry))
    .filter(Boolean)
}

export function compareAnswers(userAnswer: unknown, correctAnswer: unknown): boolean | null {
  const toTokens = (value: unknown) =>
    Array.from(new Set(splitAnswerTokens(value).filter(Boolean)))

  const actualTokens = toTokens(userAnswer)
  const expectedTokens = toTokens(correctAnswer)

  if (!actualTokens.length && !expectedTokens.length) {
    return null
  }
  if (!actualTokens.length || !expectedTokens.length) {
    return false
  }

  const tokenEquivalent = (left: string, right: string) => {
    if (left === right) {
      return true
    }
    if (/^[A-Z]$/.test(left) || /^[A-Z]$/.test(right)) {
      return false
    }
    const looseLeft = left.toLowerCase().replace(/[^a-z0-9]+/g, '')
    const looseRight = right.toLowerCase().replace(/[^a-z0-9]+/g, '')
    return Boolean(looseLeft) && looseLeft === looseRight
  }

  const tokenSetEqual = (leftValues: string[], rightValues: string[]) =>
    leftValues.length === rightValues.length
    && leftValues.every((leftItem) => rightValues.some((rightItem) => tokenEquivalent(leftItem, rightItem)))

  if (Array.isArray(correctAnswer)) {
    if (actualTokens.length === 1) {
      return expectedTokens.some((token) => tokenEquivalent(token, actualTokens[0]))
    }
    return tokenSetEqual(actualTokens, expectedTokens)
  }

  if (actualTokens.length > 1 || expectedTokens.length > 1) {
    return tokenSetEqual(actualTokens, expectedTokens)
  }

  return tokenEquivalent(actualTokens[0], expectedTokens[0])
}

export function questionWeight(correctAnswer: string | string[]): number {
  const normalized = splitAnswerTokens(correctAnswer)
  return normalized.length > 0 ? normalized.length : 1
}

function arraysEqual(a: unknown[], b: unknown[]): boolean {
  if (!Array.isArray(a) || !Array.isArray(b)) return false
  if (a.length !== b.length) return false
  const sortedA = a.slice().sort()
  const sortedB = b.slice().sort()
  return sortedA.every((val, i) => val === sortedB[i])
}

export function collectAnswers(
  exam: ReadingExamDocument,
  draftState: PracticeDraftState
): Record<string, string | string[]> {
  const answers: Record<string, string | string[]> = {}

  exam.fields?.choiceGroups?.forEach((group) => {
    const selectedValues = (draftState.choiceGroups[group.name] || []).map((entry) => canonicalizeAnswerToken(entry)).filter(Boolean)
    if (!group.questionIds?.length) {
      return
    }
    const sorted = selectedValues.slice().sort((left, right) => left.localeCompare(right, 'en'))
    if (group.questionIds.length === 1) {
      answers[group.questionIds[0]] = group.inputType === 'checkbox' && sorted.length > 1 ? sorted : (sorted[0] || '')
      return
    }
    // Special handling: if all questionIds in the group share the same answer (multi-select multi-answer)
    // check if the answerKey expects the same answer for all questions in this group
    const firstQuestionId = group.questionIds[0]
    const answerKeyEntry = exam.answerKey[firstQuestionId]
    const isMultiSelectMultiAnswer = group.inputType === 'checkbox'
      && sorted.length > 1
      && Array.isArray(answerKeyEntry)
      && answerKeyEntry.length > 1
      && group.questionIds.every((qid) => {
        const key = exam.answerKey[qid]
        return Array.isArray(key) && arraysEqual(key, answerKeyEntry)
      })

    if (isMultiSelectMultiAnswer) {
      // All questions in the group share the same answer array
      group.questionIds.forEach((questionId) => {
        answers[questionId] = sorted
      })
    } else {
      // Distribute answers to each question (one-to-one mapping)
      group.questionIds.forEach((questionId, index) => {
        answers[questionId] = sorted[index] || ''
      })
    }
  })

  exam.questionOrder?.forEach((questionId) => {
    if (Object.prototype.hasOwnProperty.call(answers, questionId)) {
      return
    }

    const dropzoneValue = draftState.dropzoneAnswers[questionId]?.value || ''
    if (dropzoneValue) {
      answers[questionId] = canonicalizeAnswerToken(dropzoneValue)
      return
    }

    const textValue = draftState.textAnswers[questionId]
    if (typeof textValue === 'string') {
      answers[questionId] = textValue.trim()
      return
    }

    const textareaValue = draftState.textareaAnswers[questionId]
    if (typeof textareaValue === 'string') {
      answers[questionId] = textareaValue.trim()
      return
    }

    const selectValue = draftState.selectAnswers[questionId]
    if (typeof selectValue === 'string') {
      answers[questionId] = selectValue.trim()
      return
    }

    answers[questionId] = ''
  })

  return answers
}

export function buildPracticeSessionResult(input: PracticeRecordSnapshotInput): PracticeSessionResult {
  const answerComparison: Record<string, PracticeAnswerComparisonEntry> = {}
  const details: Record<string, PracticeAnswerComparisonEntry> = {}
  let correctCount = 0
  let totalQuestions = 0

  input.exam.questionOrder.forEach((questionId) => {
    const userAnswer = input.answers[questionId] || ''
    const correctAnswer = input.exam.answerKey[questionId] || ''
    const isCorrect = compareAnswers(userAnswer, correctAnswer)
    const weight = questionWeight(correctAnswer)
    totalQuestions += weight
    if (isCorrect) {
      correctCount += weight
    }
    const entry: PracticeAnswerComparisonEntry = {
      questionId,
      userAnswer,
      correctAnswer,
      isCorrect
    }
    answerComparison[questionId] = entry
    details[questionId] = entry
  })

  const accuracy = totalQuestions > 0 ? correctCount / totalQuestions : 0

  return {
    answers: input.answers,
    answerComparison,
    correctAnswers: input.exam.answerKey,
    scoreInfo: {
      correct: correctCount,
      total: totalQuestions,
      totalQuestions,
      accuracy,
      percentage: Math.round(accuracy * 100),
      details,
      source: 'native_vue_practice'
    },
    metadata: {
      examId: input.exam.examId,
      examTitle: input.exam.meta.title || input.exam.examId,
      category: String(input.exam.meta.category || ''),
      frequency: String(input.exam.meta.frequency || ''),
      type: 'reading',
      practiceMode: input.mode,
      markedQuestions: input.markedQuestions || [],
      highlights: input.highlights || []
    }
  }
}

export function getMarkedQuestionsStorageKey(examId: string): string {
  return `practice_marked_questions::${examId}`
}

export function getSimulationDraftStorageKey(context: PracticeRouteContext): string {
  return `ielts_sim_draft::${context.suiteSessionId}::${context.examId}`
}

export function getStoredMarkedQuestions(examId: string): string[] {
  const raw = sessionStorage.getItem(getMarkedQuestionsStorageKey(examId))
  if (!raw) {
    return []
  }
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((entry): entry is string => typeof entry === 'string') : []
  } catch {
    return []
  }
}

export function saveMarkedQuestions(examId: string, questionIds: string[]): void {
  sessionStorage.setItem(getMarkedQuestionsStorageKey(examId), JSON.stringify(questionIds))
}

export function removeMarkedQuestions(examId: string): void {
  sessionStorage.removeItem(getMarkedQuestionsStorageKey(examId))
}

export function readSimulationDraft(context: PracticeRouteContext): PracticeSessionDraft | null {
  if (context.mode !== 'simulation' || !context.suiteSessionId) {
    return null
  }
  const raw = sessionStorage.getItem(getSimulationDraftStorageKey(context))
  if (!raw) {
    return null
  }
  try {
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') {
      return null
    }
    return {
      answers: typeof parsed.answers === 'object' && parsed.answers ? parsed.answers as Record<string, string | string[]> : {},
      markedQuestions: Array.isArray(parsed.markedQuestions) ? parsed.markedQuestions.filter((entry: unknown): entry is string => typeof entry === 'string') : [],
      highlights: Array.isArray(parsed.highlights) ? parsed.highlights.filter(isHighlightRecord) : [],
      scrollState: normalizeScrollState(parsed.scrollState)
    }
  } catch {
    return null
  }
}

export function saveSimulationDraft(context: PracticeRouteContext, draft: PracticeSessionDraft): void {
  if (context.mode !== 'simulation' || !context.suiteSessionId) {
    return
  }
  sessionStorage.setItem(getSimulationDraftStorageKey(context), JSON.stringify(draft))
}

export function clearSimulationDraft(context: PracticeRouteContext): void {
  if (context.mode !== 'simulation' || !context.suiteSessionId) {
    return
  }
  sessionStorage.removeItem(getSimulationDraftStorageKey(context))
}

export function createDraftSnapshot(
  exam: ReadingExamDocument,
  draftState: PracticeDraftState,
  markedQuestions: string[],
  highlights: PracticeHighlightRecord[],
  scrollState: PracticeScrollState
): PracticeSessionDraft {
  return {
    answers: collectAnswers(exam, draftState),
    markedQuestions,
    highlights,
    scrollState
  }
}

export function hydrateDraftState(
  exam: ReadingExamDocument,
  answers: Record<string, string | string[]>
): PracticeDraftState {
  const state = createEmptyDraftState()

  exam.fields.choiceGroups.forEach((group) => {
    if (group.questionIds.length === 1) {
      const answer = answers[group.questionIds[0]]
      const values = Array.isArray(answer) ? answer : splitAnswerTokens(answer)
      if (values.length) {
        state.choiceGroups[group.name] = values
      }
      return
    }

    const values = group.questionIds
      .flatMap((questionId) => splitAnswerTokens(answers[questionId]))
      .filter(Boolean)
    if (values.length) {
      state.choiceGroups[group.name] = values
    }
  })

  exam.fields.textQuestions.forEach((questionId) => {
    const answer = answers[questionId]
    if (typeof answer === 'string') {
      state.textAnswers[questionId] = answer
    }
  })

  exam.fields.textareaQuestions.forEach((questionId) => {
    const answer = answers[questionId]
    if (typeof answer === 'string') {
      state.textareaAnswers[questionId] = answer
    }
  })

  exam.fields.selectQuestions.forEach((questionId) => {
    const answer = answers[questionId]
    if (typeof answer === 'string') {
      state.selectAnswers[questionId] = answer
    }
  })

  exam.fields.dropzoneQuestions.forEach((questionId) => {
    const answer = answers[questionId]
    const token = splitAnswerTokens(answer)[0] || ''
    if (!token) {
      return
    }
    const matchedOption = exam.options.find((option) => compareAnswers(option.value, token))
    state.dropzoneAnswers[questionId] = {
      value: token,
      label: matchedOption?.label || token,
      poolId: matchedOption?.poolId || ''
    }
  })

  return state
}

export function buildQuestionGroupMeta(exam: ReadingExamDocument): Record<string, QuestionGroupMeta> {
  const meta: Record<string, QuestionGroupMeta> = {}
  exam.questionGroups?.forEach((group) => {
    const poolIds = Array.from(collectPoolIds(group.contentNodes))
    group.questionIds?.forEach((questionId) => {
      meta[questionId] = {
        questionId,
        groupId: group.groupId,
        questionIds: group.questionIds,
        poolIds,
        allowOptionReuse: group.allowOptionReuse
      }
    })
  })
  return meta
}

export function assignDropzoneValue(
  current: PracticeDraftState,
  exam: ReadingExamDocument,
  questionId: string,
  nextValue: PracticeDropzoneValue | null,
  groupMetaByQuestionId: Record<string, QuestionGroupMeta>
): PracticeDraftState {
  const nextState: PracticeDraftState = {
    choiceGroups: { ...current.choiceGroups },
    textAnswers: { ...current.textAnswers },
    selectAnswers: { ...current.selectAnswers },
    textareaAnswers: { ...current.textareaAnswers },
    dropzoneAnswers: { ...current.dropzoneAnswers }
  }

  const meta = groupMetaByQuestionId[questionId]
  if (meta && nextValue && !meta.allowOptionReuse) {
    meta.questionIds.forEach((relatedQuestionId) => {
      if (relatedQuestionId === questionId) {
        return
      }
      const existing = nextState.dropzoneAnswers[relatedQuestionId]
      if (existing && compareAnswers(existing.value, nextValue.value)) {
        nextState.dropzoneAnswers[relatedQuestionId] = null
      }
    })
  }

  nextState.dropzoneAnswers[questionId] = nextValue
  exam.fields.dropzoneQuestions.forEach((id) => {
    if (!(id in nextState.dropzoneAnswers)) {
      nextState.dropzoneAnswers[id] = null
    }
  })
  return nextState
}

export function getUsedOptionValuesForPool(
  draftState: PracticeDraftState,
  poolId: string
): string[] {
  return Object.values(draftState.dropzoneAnswers)
    .filter((entry): entry is PracticeDropzoneValue => Boolean(entry && entry.poolId === poolId))
    .map((entry) => canonicalizeAnswerToken(entry.value))
}

export function formatAnswerDisplay(value: string | string[]): string {
  if (Array.isArray(value)) {
    return value.join(', ')
  }
  return String(value || '').trim()
}

export function isHighlightRecord(value: unknown): value is PracticeHighlightRecord {
  return Boolean(
    value
    && typeof value === 'object'
    && (value as PracticeHighlightRecord).scope
    && (value as PracticeHighlightRecord).text
  )
}

function normalizeScrollState(value: unknown): PracticeScrollState {
  if (!value || typeof value !== 'object') {
    return createEmptyScrollState()
  }
  const source = value as Partial<PracticeScrollState>
  return {
    passageTop: Number.isFinite(source.passageTop) ? Number(source.passageTop) : 0,
    questionsTop: Number.isFinite(source.questionsTop) ? Number(source.questionsTop) : 0
  }
}

function collectPoolIds(nodes: Array<{ type: string; children?: unknown[]; poolId?: string }>): Set<string> {
  const poolIds = new Set<string>()
  nodes.forEach((node) => {
    if (node.type === 'optionChip' && typeof node.poolId === 'string' && node.poolId) {
      poolIds.add(node.poolId)
    }
    if (Array.isArray(node.children)) {
      collectPoolIds(node.children as Array<{ type: string; children?: unknown[]; poolId?: string }>).forEach((poolId) => {
        poolIds.add(poolId)
      })
    }
  })
  return poolIds
}
