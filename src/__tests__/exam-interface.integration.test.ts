import { createPinia, setActivePinia } from 'pinia'
import { mount, type VueWrapper } from '@vue/test-utils'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import { computed, effectScope, nextTick, ref, type EffectScope } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import PracticeMode from '@/views/PracticeMode.vue'
import { useExamClock } from '@/composables/useExamClock'
import { useReadingPracticeSession } from '@/composables/useReadingPracticeSession'
import { usePracticeStore } from '@/store/practiceStore'
import { getSimulationDraftStorageKey } from '@/utils/readingPractice'

vi.mock('ant-design-vue', () => ({
  message: {
    config: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
    info: vi.fn()
  }
}))

interface MountedExam {
  router: Router
  wrapper: VueWrapper
}

async function mountExam(url: string): Promise<MountedExam> {
  const pinia = createPinia()
  setActivePinia(pinia)
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/exam', component: PracticeMode }]
  })
  await router.push(url)
  await router.isReady()

  const wrapper = mount(PracticeMode, {
    global: {
      plugins: [pinia, router],
      provide: {
        currentLang: ref<'zh' | 'en'>('en'),
        t: (key: string) => key
      },
      stubs: {
        PracticeAssistant: true,
        PracticeNodeRenderer: true
      }
    }
  })

  return { router, wrapper }
}

describe('single-passage exam integration', () => {
  const wrappers: VueWrapper[] = []
  const scopes: EffectScope[] = []

  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
  })

  afterEach(() => {
    wrappers.splice(0).forEach((wrapper) => wrapper.unmount())
    scopes.splice(0).forEach((scope) => scope.stop())
    vi.restoreAllMocks()
  })

  it('stabilizes a direct /exam URL before practice and keeps the same simulation draft namespace', async () => {
    const { router, wrapper } = await mountExam('/exam?id=p1-medium-57')
    wrappers.push(wrapper)

    await vi.waitFor(() => {
      expect(typeof router.currentRoute.value.query.suiteSessionId).toBe('string')
      expect(router.currentRoute.value.query.suiteSessionId).not.toBe('')
    })

    const attemptId = String(router.currentRoute.value.query.suiteSessionId)
    const draftKey = getSimulationDraftStorageKey({
      examId: 'p1-medium-57',
      mode: 'simulation',
      suiteSessionId: attemptId
    })

    await vi.waitFor(() => {
      expect(sessionStorage.getItem(draftKey)).not.toBeNull()
    })

    const simulationDraftKeys = Array.from({ length: sessionStorage.length }, (_, index) => sessionStorage.key(index))
      .filter((key): key is string => Boolean(key?.startsWith('ielts_sim_draft::')))
    expect(router.currentRoute.value.fullPath).toContain(`suiteSessionId=${attemptId}`)
    expect(simulationDraftKeys).toEqual([draftKey])
  })

  it('does not start from instructions until the exam data is ready', async () => {
    const { wrapper } = await mountExam('/exam?id=missing-exam&suiteSessionId=prep-attempt')
    wrappers.push(wrapper)

    await wrapper.get('button').trigger('click')
    const startButton = wrapper.get('button.primary-button')

    expect(wrapper.text()).toContain('This practice could not be loaded.')
    expect(startButton.attributes('disabled')).toBeDefined()
    expect(JSON.parse(localStorage.getItem('ielts_exam_clock::missing-exam::prep-attempt') || '{}').phase)
      .toBe('instructions')
  })

  it('submits once when expiry calls the same finish path used by manual submission', async () => {
    setActivePinia(createPinia())
    const scope = effectScope()
    scopes.push(scope)
    const examId = ref('p1-medium-57')
    const suiteSessionId = ref('finish-race')
    const enabled = ref(false)
    let finishCalls = 0
    let session!: ReturnType<typeof useReadingPracticeSession>
    let clock!: ReturnType<typeof useExamClock>

    scope.run(() => {
      session = useReadingPracticeSession({
        examId,
        mode: ref('simulation'),
        recordId: ref(''),
        suiteSessionId
      })
      const finish = () => {
        if (session.submitted.value || !session.exam.value) return
        finishCalls += 1
        session.submit()
        clock.finish()
      }
      clock = useExamClock({
        key: computed(() => `ielts_exam_clock::${examId.value}::${suiteSessionId.value}`),
        durationSeconds: 0,
        enabled,
        onExpire: finish
      })
    })

    clock.start()
    expect(clock.phase.value).toBe('running')
    expect(session.submitted.value).toBe(false)

    await vi.waitFor(() => expect(session.exam.value).not.toBeNull())
    enabled.value = true
    await nextTick()

    expect(clock.phase.value).toBe('submitted')
    expect(session.submitted.value).toBe(true)
    expect(finishCalls).toBe(1)

    clock.finish()
    session.submit()
    expect(finishCalls).toBe(1)
  })

  it('restores the submitted result and review after a refresh', async () => {
    const attemptId = 'refresh-review-attempt'
    const first = await mountExam(`/exam?id=p1-medium-57&suiteSessionId=${attemptId}`)
    wrappers.push(first.wrapper)

    await first.wrapper.get('button').trigger('click')
    await vi.waitFor(() => {
      expect(first.wrapper.get('button.primary-button').attributes('disabled')).toBeUndefined()
    })
    await first.wrapper.get('button.primary-button').trigger('click')
    await first.wrapper.get('button.topbar-submit').trigger('click')
    await first.wrapper.get('.dialog-actions .primary-button').trigger('click')

    await vi.waitFor(() => {
      expect(first.wrapper.text()).toContain('Review')
      expect(usePracticeStore().records.some((record) => record.id === attemptId)).toBe(true)
    })
    first.wrapper.unmount()

    const refreshed = await mountExam(`/exam?id=p1-medium-57&suiteSessionId=${attemptId}`)
    wrappers.push(refreshed.wrapper)

    await vi.waitFor(() => {
      expect(refreshed.wrapper.text()).toContain('Result Review')
      expect(refreshed.wrapper.find('.summary-card').exists()).toBe(true)
    })
  })
})
