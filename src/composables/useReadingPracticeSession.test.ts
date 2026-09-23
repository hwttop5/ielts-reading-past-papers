import { createPinia, setActivePinia } from 'pinia'
import { effectScope, nextTick, ref, type EffectScope } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useReadingPracticeSession } from '@/composables/useReadingPracticeSession'
import {
  getMarkedQuestionsStorageKey,
  getSimulationDraftStorageKey,
  type PracticeRouteContext
} from '@/utils/readingPractice'
import type { PracticeRouteMode } from '@/types/readingNative'

interface TestSessionOptions {
  examId?: string
  mode?: PracticeRouteMode
  suiteSessionId?: string
}

async function createTestSession(options: TestSessionOptions = {}) {
  const scope = effectScope()
  const examId = ref(options.examId || 'p1-medium-57')
  const mode = ref<PracticeRouteMode>(options.mode || 'single')
  const recordId = ref('')
  const suiteSessionId = ref(options.suiteSessionId || '')
  let session: ReturnType<typeof useReadingPracticeSession> | undefined

  scope.run(() => {
    session = useReadingPracticeSession({ examId, mode, recordId, suiteSessionId })
  })

  await vi.waitFor(() => {
    expect(session?.exam.value?.examId).toBe(examId.value)
  })
  await nextTick()

  return {
    scope,
    session: session!,
    examId,
    mode,
    suiteSessionId
  }
}

function simulationContext(examId: string, suiteSessionId: string): PracticeRouteContext {
  return {
    examId,
    mode: 'simulation',
    suiteSessionId
  }
}

describe('useReadingPracticeSession', () => {
  const scopes: EffectScope[] = []

  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    sessionStorage.clear()
  })

  afterEach(() => {
    scopes.splice(0).forEach((scope) => scope.stop())
    vi.restoreAllMocks()
  })

  it('limits checkbox selections by the choice field while preserving single-question multi-answer fields', async () => {
    const { scope, session } = await createTestSession()
    scopes.push(scope)

    for (const value of ['A', 'B', 'C']) {
      session.toggleChoice({ fieldName: 'q9_10', inputType: 'checkbox', value, checked: true })
    }
    expect(session.draftState.value.choiceGroups.q9_10).toEqual(['A', 'B'])

    session.toggleChoice({ fieldName: 'q9_10', inputType: 'checkbox', value: 'B', checked: false })
    session.toggleChoice({ fieldName: 'q9_10', inputType: 'checkbox', value: 'C', checked: true })
    expect(session.draftState.value.choiceGroups.q9_10).toEqual(['A', 'C'])

    for (const value of ['C', 'E', 'G', 'A']) {
      session.toggleChoice({ fieldName: 'q11', inputType: 'checkbox', value, checked: true })
    }
    expect(session.draftState.value.choiceGroups.q11).toEqual(['C', 'E', 'G'])
  })

  it('makes submit idempotent and blocks answer mutations after submission', async () => {
    const { scope, session } = await createTestSession()
    scopes.push(scope)

    session.setTextAnswer('q-extra', 'before')
    session.setTextareaAnswer('q-textarea', 'before')
    session.setSelectAnswer('q-select', 'A')
    session.toggleChoice({ fieldName: 'q1', inputType: 'radio', value: 'B', checked: true })
    session.setDropzoneValue('q-dropzone', { poolId: 'pool', value: 'C', label: 'C' })

    const firstResult = session.submit()
    const submittedDraft = JSON.stringify(session.draftState.value)

    session.setTextAnswer('q-extra', 'after')
    session.setTextareaAnswer('q-textarea', 'after')
    session.setSelectAnswer('q-select', 'D')
    session.toggleChoice({ fieldName: 'q1', inputType: 'radio', value: 'C', checked: true })
    session.setDropzoneValue('q-dropzone', { poolId: 'pool', value: 'D', label: 'D' })
    session.clearDropzoneValue('q-dropzone')

    expect(JSON.stringify(session.draftState.value)).toBe(submittedDraft)
    expect(session.submit()).toBe(firstResult)
    expect(session.result.value).toBe(firstResult)
  })

  it('keeps simulation marks isolated and preserves ordinary-practice mark persistence', async () => {
    const examId = 'p1-medium-57'
    const genericMarksKey = getMarkedQuestionsStorageKey(examId)
    sessionStorage.setItem(genericMarksKey, JSON.stringify(['q1']))

    const attemptA = await createTestSession({ mode: 'simulation', suiteSessionId: 'attempt-a' })
    scopes.push(attemptA.scope)
    expect(attemptA.session.markedQuestions.value).toEqual([])

    attemptA.session.toggleMarkedQuestion('q9')
    await nextTick()

    expect(JSON.parse(sessionStorage.getItem(genericMarksKey) || '[]')).toEqual(['q1'])
    const attemptADraftKey = getSimulationDraftStorageKey(simulationContext(examId, 'attempt-a'))
    expect(JSON.parse(sessionStorage.getItem(attemptADraftKey) || '{}').markedQuestions).toEqual(['q9'])

    attemptA.scope.stop()
    const attemptB = await createTestSession({ mode: 'simulation', suiteSessionId: 'attempt-b' })
    scopes.push(attemptB.scope)
    expect(attemptB.session.markedQuestions.value).toEqual([])

    const ordinary = await createTestSession()
    scopes.push(ordinary.scope)
    expect(ordinary.session.markedQuestions.value).toEqual(['q1'])
    ordinary.session.toggleMarkedQuestion('q2')
    await nextTick()
    expect(JSON.parse(sessionStorage.getItem(genericMarksKey) || '[]')).toEqual(['q1', 'q2'])
  })

  it('does not recreate a cleared simulation draft after submission', async () => {
    const { scope, session } = await createTestSession({ mode: 'simulation', suiteSessionId: 'attempt-submit' })
    scopes.push(scope)
    const draftKey = getSimulationDraftStorageKey(simulationContext('p1-medium-57', 'attempt-submit'))

    session.setTextAnswer('q-extra', 'draft answer')
    await nextTick()
    expect(sessionStorage.getItem(draftKey)).not.toBeNull()

    session.submit()
    session.toggleMarkedQuestion('q2')
    session.setScrollState({ passageTop: 120 })
    await nextTick()

    expect(sessionStorage.getItem(draftKey)).toBeNull()
  })

  it('retains the final simulation snapshot until the caller acknowledges durable submission', async () => {
    const { scope, session } = await createTestSession({ mode: 'simulation', suiteSessionId: 'attempt-two-phase' })
    scopes.push(scope)
    const draftKey = getSimulationDraftStorageKey(simulationContext('p1-medium-57', 'attempt-two-phase'))

    session.setTextAnswer('q5', 'final answer')
    const result = session.submit({ preserveDraft: true })

    expect(result).not.toBeNull()
    expect(session.submitted.value).toBe(true)
    expect(JSON.parse(sessionStorage.getItem(draftKey) || '{}').answers.q5).toBe('final answer')

    session.clearSimulationDraft()
    expect(sessionStorage.getItem(draftKey)).toBeNull()
  })

  it('continues safely when simulation storage access throws', async () => {
    const originalGetItem = Storage.prototype.getItem
    const originalSetItem = Storage.prototype.setItem
    const originalRemoveItem = Storage.prototype.removeItem
    const isSimulationKey = (key: string) => key.startsWith('ielts_sim_draft::')

    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(function (key) {
      if (isSimulationKey(key)) throw new DOMException('blocked', 'SecurityError')
      return originalGetItem.call(this, key)
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (key, value) {
      if (isSimulationKey(key)) throw new DOMException('blocked', 'SecurityError')
      return originalSetItem.call(this, key, value)
    })
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(function (key) {
      if (isSimulationKey(key)) throw new DOMException('blocked', 'SecurityError')
      return originalRemoveItem.call(this, key)
    })

    const { scope, session } = await createTestSession({ mode: 'simulation', suiteSessionId: 'blocked-storage' })
    scopes.push(scope)

    session.setTextAnswer('q-extra', 'answer')
    await expect(nextTick()).resolves.toBeUndefined()
    expect(session.submit({ preserveDraft: true })).not.toBeNull()
    expect(session.submitted.value).toBe(true)
    expect(() => session.clearSimulationDraft()).not.toThrow()
  })
})
