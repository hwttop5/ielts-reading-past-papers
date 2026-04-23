import { computed, ref, watch, type Ref } from 'vue'
import { usePracticeStore } from '@/store/practiceStore'
import type {
  PracticeDraftState,
  PracticeHighlightRecord,
  PracticeFontScale,
  PracticeRouteMode,
  PracticeScrollState,
  PracticeSessionResult,
  ReadingExamDocument,
  ReadingExplanationDocument
} from '@/types/readingNative'
import {
  assignDropzoneValue,
  buildPracticeSessionResult,
  buildQuestionGroupMeta,
  clearSimulationDraft,
  collectAnswers,
  createDraftSnapshot,
  createEmptyDraftState,
  createEmptyScrollState,
  getStoredMarkedQuestions,
  getManifestEntry,
  getUsedOptionValuesForPool,
  hydrateDraftState,
  loadReadingExamDocument,
  loadReadingExplanationDocument,
  readSimulationDraft,
  removeMarkedQuestions,
  saveMarkedQuestions,
  saveSimulationDraft,
  type PracticeRouteContext
} from '@/utils/readingPractice'
import { normalizePracticeHighlightRecord, sameHighlightRecord } from '@/utils/practiceHighlights'

interface SessionOptions {
  examId: Ref<string>
  mode: Ref<PracticeRouteMode>
  recordId: Ref<string>
  suiteSessionId: Ref<string>
}

export function useReadingPracticeSession(options: SessionOptions) {
  const practiceStore = usePracticeStore()
  let activeLoadId = 0

  const exam = ref<ReadingExamDocument | null>(null)
  const explanation = ref<ReadingExplanationDocument | null>(null)
  const draftState = ref<PracticeDraftState>(createEmptyDraftState())
  const result = ref<PracticeSessionResult | null>(null)
  const isLoading = ref(false)
  const loadError = ref('')
  const submitted = ref(false)
  const reviewMode = computed(() => options.mode.value === 'review')
  const simulationMode = computed(() => options.mode.value === 'simulation')
  const readOnly = computed(() => reviewMode.value || submitted.value)
  const markedQuestions = ref<string[]>([])
  const highlights = ref<PracticeHighlightRecord[]>([])
  const scrollState = ref<PracticeScrollState>(createEmptyScrollState())
  const selectedOptionKey = ref('')
  const fontScale = ref<PracticeFontScale>('medium')
  const notesOpen = ref(false)
  const notesText = ref('')

  const routeContext = computed<PracticeRouteContext>(() => ({
    examId: options.examId.value,
    mode: options.mode.value,
    suiteSessionId: options.suiteSessionId.value
  }))

  const answerMap = computed(() => (exam.value ? collectAnswers(exam.value, draftState.value) : {}))
  const questionGroupMetaByQuestionId = computed(() => (exam.value ? buildQuestionGroupMeta(exam.value) : {}))
  const usedOptionValuesByPool = computed<Record<string, string[]>>(() => {
    if (!exam.value) {
      return {}
    }
    return exam.value.options.reduce<Record<string, string[]>>((accumulator, option) => {
      accumulator[option.poolId] = getUsedOptionValuesForPool(draftState.value, option.poolId)
      return accumulator
    }, {})
  })

  async function withTimeout<T>(promise: Promise<T>, label: string, timeoutMs = 12000): Promise<T> {
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined
    try {
      return await Promise.race([
        promise,
        new Promise<T>((_, reject) => {
          timeoutHandle = setTimeout(() => {
            reject(new Error(`${label} timed out.`))
          }, timeoutMs)
        })
      ])
    } finally {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle)
      }
    }
  }

  async function load() {
    const loadId = ++activeLoadId
    const examId = options.examId.value
    if (!examId || !getManifestEntry(examId)) {
      exam.value = null
      explanation.value = null
      loadError.value = examId ? 'Question data is unavailable.' : ''
      isLoading.value = false
      return
    }

    isLoading.value = true
    loadError.value = ''
    explanation.value = null

    try {
      const nextExam = await withTimeout(loadReadingExamDocument(examId), 'Practice data loading')

      if (loadId !== activeLoadId) {
        return
      }

      if (!nextExam) {
        throw new Error('Question data is unavailable.')
      }

      exam.value = nextExam
      restoreSessionState()

      if (loadId === activeLoadId) {
        isLoading.value = false
      }

      void loadExplanationForExam(loadId, examId)
    } catch (error) {
      if (loadId !== activeLoadId) {
        return
      }
      exam.value = null
      explanation.value = null
      loadError.value = error instanceof Error ? error.message : 'Failed to load question data.'
      isLoading.value = false
    } finally {
      if (loadId === activeLoadId && exam.value == null) {
        isLoading.value = false
      }
    }
  }

  async function loadExplanationForExam(loadId: number, examId: string) {
    try {
      const nextExplanation = await withTimeout(
        loadReadingExplanationDocument(examId),
        'Practice explanation loading',
        8000
      )

      if (loadId !== activeLoadId) {
        return
      }

      explanation.value = nextExplanation
    } catch (error) {
      if (loadId !== activeLoadId) {
        return
      }
      explanation.value = null
      console.warn('[native-practice] explanation load failed', {
        examId,
        error: error instanceof Error ? error.message : String(error)
      })
    } finally {
      if (loadId === activeLoadId) {
        isLoading.value = false
      }
    }
  }

  function restoreSessionState() {
    if (!exam.value) {
      draftState.value = createEmptyDraftState()
      result.value = null
      submitted.value = false
      markedQuestions.value = []
      highlights.value = []
      scrollState.value = createEmptyScrollState()
      selectedOptionKey.value = ''
      return
    }

    draftState.value = createEmptyDraftState()
    result.value = null
    submitted.value = false
    selectedOptionKey.value = ''
    markedQuestions.value = getStoredMarkedQuestions(exam.value.examId)
    highlights.value = []
    scrollState.value = createEmptyScrollState()

    if (reviewMode.value) {
      const record = practiceStore.records.find((entry) => entry.id === options.recordId.value)
      if (!record?.resultSnapshot) {
        loadError.value = 'Review data is unavailable for this attempt.'
        return
      }
      result.value = record.resultSnapshot
      draftState.value = hydrateDraftState(exam.value, record.resultSnapshot.answers)
      markedQuestions.value = Array.isArray(record.markedQuestions) ? record.markedQuestions : Array.isArray(record.resultSnapshot.metadata.markedQuestions) ? record.resultSnapshot.metadata.markedQuestions : []
      highlights.value = Array.isArray(record.highlights) ? record.highlights : Array.isArray(record.resultSnapshot.metadata.highlights) ? record.resultSnapshot.metadata.highlights : []
      submitted.value = true
      return
    }

    if (simulationMode.value) {
      const storedDraft = readSimulationDraft(routeContext.value)
      if (storedDraft) {
        draftState.value = hydrateDraftState(exam.value, storedDraft.answers)
        markedQuestions.value = storedDraft.markedQuestions || []
        highlights.value = storedDraft.highlights || []
        scrollState.value = storedDraft.scrollState
      }
    }
  }

  function setTextAnswer(questionId: string, value: string) {
    draftState.value = {
      ...draftState.value,
      textAnswers: {
        ...draftState.value.textAnswers,
        [questionId]: value
      }
    }
  }

  function setTextareaAnswer(questionId: string, value: string) {
    draftState.value = {
      ...draftState.value,
      textareaAnswers: {
        ...draftState.value.textareaAnswers,
        [questionId]: value
      }
    }
  }

  function setSelectAnswer(questionId: string, value: string) {
    draftState.value = {
      ...draftState.value,
      selectAnswers: {
        ...draftState.value.selectAnswers,
        [questionId]: value
      }
    }
  }

  function toggleChoice(payload: { fieldName: string; inputType: 'radio' | 'checkbox'; value: string; checked: boolean }) {
    const previousValues = draftState.value.choiceGroups[payload.fieldName] || []
    let nextValues: string[] = []
    if (payload.inputType === 'radio') {
      nextValues = payload.checked ? [payload.value] : []
    } else {
      nextValues = payload.checked
        ? Array.from(new Set([...previousValues, payload.value]))
        : previousValues.filter((entry) => entry !== payload.value)
    }
    draftState.value = {
      ...draftState.value,
      choiceGroups: {
        ...draftState.value.choiceGroups,
        [payload.fieldName]: nextValues
      }
    }
  }

  function selectOption(poolId: string, value: string) {
    selectedOptionKey.value = `${poolId}::${value}`
  }

  function clearSelectedOption() {
    selectedOptionKey.value = ''
  }

  function setDropzoneValue(questionId: string, payload: { poolId: string; value: string; label: string }) {
    if (!exam.value) {
      return
    }
    draftState.value = assignDropzoneValue(
      draftState.value,
      exam.value,
      questionId,
      {
        poolId: payload.poolId,
        value: payload.value,
        label: payload.label
      },
      questionGroupMetaByQuestionId.value
    )
    clearSelectedOption()
  }

  function clearDropzoneValue(questionId: string) {
    if (!exam.value) {
      return
    }
    draftState.value = assignDropzoneValue(
      draftState.value,
      exam.value,
      questionId,
      null,
      questionGroupMetaByQuestionId.value
    )
  }

  function toggleMarkedQuestion(questionId: string) {
    const currentList = markedQuestions.value || []
    const exists = currentList.includes(questionId)
    markedQuestions.value = exists
      ? currentList.filter((entry) => entry !== questionId)
      : [...currentList, questionId]
  }

  function setScrollState(nextState: Partial<PracticeScrollState>) {
    scrollState.value = {
      passageTop: Number(nextState.passageTop ?? scrollState.value.passageTop) || 0,
      questionsTop: Number(nextState.questionsTop ?? scrollState.value.questionsTop) || 0
    }
  }

  function addHighlight(record: PracticeHighlightRecord) {
    const normalized = normalizePracticeHighlightRecord(record)
    if (!normalized) {
      return
    }
    if ((highlights.value || []).some((entry) => sameHighlightRecord(entry, normalized))) {
      return
    }
    highlights.value = [...(highlights.value || []), normalized]
  }

  function removeHighlight(record: PracticeHighlightRecord) {
    const normalized = normalizePracticeHighlightRecord(record)
    if (!normalized) {
      return
    }
    highlights.value = (highlights.value || []).filter((entry) => !sameHighlightRecord(entry, normalized))
  }

  function clearHighlights() {
    highlights.value = []
  }

  function submit(): PracticeSessionResult | null {
    if (!exam.value) {
      return null
    }
    const nextResult = buildPracticeSessionResult({
      exam: exam.value,
      answers: answerMap.value,
      markedQuestions: markedQuestions.value,
      highlights: highlights.value,
      mode: options.mode.value
    })
    result.value = nextResult
    submitted.value = true
    if (simulationMode.value) {
      clearSimulationDraft(routeContext.value)
    }
    return nextResult
  }

  function reset() {
    if (!exam.value || reviewMode.value) {
      return
    }
    draftState.value = createEmptyDraftState()
    result.value = null
    submitted.value = false
    selectedOptionKey.value = ''
    if (simulationMode.value) {
      clearSimulationDraft(routeContext.value)
    }
  }

  function persistDraftSnapshot() {
    if (!exam.value || !simulationMode.value) {
      return
    }
    saveSimulationDraft(
      routeContext.value,
      createDraftSnapshot(
        exam.value,
        draftState.value,
        markedQuestions.value,
        highlights.value,
        scrollState.value
      )
    )
  }

  watch(
    [options.examId, options.mode, options.recordId, options.suiteSessionId],
    () => {
      void load()
    },
    { immediate: true }
  )

  watch(
    markedQuestions,
    (value) => {
      if (!exam.value) {
        return
      }
      saveMarkedQuestions(exam.value.examId, value)
    },
    { deep: true }
  )

  watch(
    [draftState, markedQuestions, highlights, scrollState],
    () => {
      persistDraftSnapshot()
    },
    { deep: true }
  )

  return {
    exam,
    explanation,
    draftState,
    result,
    isLoading,
    loadError,
    submitted,
    reviewMode,
    simulationMode,
    readOnly,
    markedQuestions,
    highlights,
    scrollState,
    selectedOptionKey,
    fontScale,
    notesOpen,
    notesText,
    answerMap,
    questionGroupMetaByQuestionId,
    usedOptionValuesByPool,
    setTextAnswer,
    setTextareaAnswer,
    setSelectAnswer,
    toggleChoice,
    selectOption,
    clearSelectedOption,
    setDropzoneValue,
    clearDropzoneValue,
    toggleMarkedQuestion,
    setScrollState,
    addHighlight,
    removeHighlight,
    clearHighlights,
    submit,
    reset,
    reload: load,
    clearPersistedMarks() {
      if (exam.value) {
        removeMarkedQuestions(exam.value.examId)
      }
    }
  }
}
