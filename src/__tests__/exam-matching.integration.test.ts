import { createPinia, setActivePinia } from 'pinia'
import { mount, type VueWrapper } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { ref } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import PracticeMode from '@/views/PracticeMode.vue'
import { getSimulationDraftStorageKey } from '@/utils/readingPractice'

vi.mock('ant-design-vue', () => ({ message: { config: vi.fn(), success: vi.fn(), warning: vi.fn(), error: vi.fn(), info: vi.fn() } }))

const wrappers: VueWrapper[] = []
async function open(path: '/exam' | '/practice-mode') {
  const pinia = createPinia()
  setActivePinia(pinia)
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path, component: PracticeMode }] })
  await router.push(`${path}?id=p3-high-170&suiteSessionId=matching-restore`)
  await router.isReady()
  const wrapper = mount(PracticeMode, {
    global: {
      plugins: [pinia, router],
      provide: { currentLang: ref('en'), t: (key: string) => key },
      stubs: { PracticeAssistant: true }
    }
  })
  wrappers.push(wrapper)
  if (path === '/exam') {
    await wrapper.get('button').trigger('click')
    await vi.waitFor(() => expect(wrapper.get('button.primary-button').attributes('disabled')).toBeUndefined())
    await wrapper.get('button.primary-button').trigger('click')
  }
  return wrapper
}

beforeEach(() => { localStorage.clear(); sessionStorage.clear() })
afterEach(() => { wrappers.splice(0).forEach(wrapper => wrapper.unmount()); vi.restoreAllMocks() })

describe('matching adapter route wiring', () => {
  it('renders restored matching letters as draggable cards only in the exam interface', async () => {
    const key = getSimulationDraftStorageKey({ examId: 'p3-high-170', mode: 'simulation', suiteSessionId: 'matching-restore' })
    sessionStorage.setItem(key, JSON.stringify({ answers: { q11: 'C' }, markedQuestions: [], highlights: [], scrollState: { passageTop: 0, questionsTop: 0 } }))
    const exam = await open('/exam')
    await vi.waitFor(() => expect(exam.findAll('.native-option-chip')).toHaveLength(6))
    expect(exam.findAll('.native-dropzone')).toHaveLength(4)
    expect(exam.get('.native-dropzone[data-question="q11"]').text()).toContain('C')
    expect(exam.get('.native-dropzone[data-question="q11"]').text()).toContain('conclusive evidence')
    expect(exam.find('input[data-question="q11"]').exists()).toBe(false)

    const practice = await open('/practice-mode')
    await vi.waitFor(() => expect(practice.find('input[data-question="q11"]').exists()).toBe(true))
    expect(practice.findAll('.native-option-chip')).toHaveLength(0)
    expect(practice.find('.native-dropzone[data-question="q11"]').exists()).toBe(false)
  })
})
