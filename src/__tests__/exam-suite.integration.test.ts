import { createPinia, setActivePinia } from 'pinia'
import { mount, type VueWrapper } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { nextTick, ref } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ExamSuite from '@/views/ExamSuite.vue'
import PracticeMode from '@/views/PracticeMode.vue'
import PracticeNodeRenderer from '@/components/native-practice/PracticeNodeRenderer.vue'
import { EXAM_SUITE_HISTORY_KEY } from '@/composables/useExamSuiteAttempt'
import { getSimulationDraftStorageKey } from '@/utils/readingPractice'
import type { SuitePassageHandle } from '@/types/examPassage'

vi.mock('ant-design-vue', () => ({ message: { config: vi.fn(), success: vi.fn(), warning: vi.fn(), error: vi.fn(), info: vi.fn() } }))
const ids = ['p1-high-01', 'p2-high-09', 'p3-high-04']
const attemptId = 'integration-suite'
const clockKey = `ielts_suite_clock::${attemptId}::${ids.join(',')}`
const draftKeys = ids.map(examId => getSimulationDraftStorageKey({ examId, mode: 'simulation', suiteSessionId: attemptId }))
const wrappers: VueWrapper[] = []

async function mountSuite(realRenderer = false) {
  const pinia = createPinia()
  setActivePinia(pinia)
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/exam-suite', component: ExamSuite }] })
  await router.push({ path: '/exam-suite', query: { passages: ids.join(','), attemptId } })
  await router.isReady()
  const wrapper = mount(ExamSuite, { attachTo: document.body, global: { plugins: [pinia, router], provide: { currentLang: ref('en'), t: (key: string) => key }, stubs: { PracticeAssistant: true, PracticeNodeRenderer: !realRenderer } } })
  wrappers.push(wrapper)
  return wrapper
}
function handles(wrapper: VueWrapper) { return wrapper.findAllComponents(PracticeMode).map(child => child.vm as unknown as SuitePassageHandle) }
async function ready(wrapper: VueWrapper) { await vi.waitFor(() => { expect(handles(wrapper)).toHaveLength(3); expect(handles(wrapper).every(child => child.getState().ready)).toBe(true) }) }
async function start(wrapper: VueWrapper) {
  await vi.waitFor(() => expect(wrapper.find('.entry-card .primary-button').exists()).toBe(true))
  await wrapper.get('.entry-card .primary-button').trigger('click')
  await wrapper.get('.instruction-actions .primary-button').trigger('click')
  await ready(wrapper)
}
async function submit(wrapper: VueWrapper) {
  await wrapper.get('.topbar-submit').trigger('click')
  await wrapper.get('.dialog-actions .primary-button').trigger('click')
  await vi.waitFor(() => expect(wrapper.find('.suite-result').exists()).toBe(true))
}
function history() { return JSON.parse(localStorage.getItem(EXAM_SUITE_HISTORY_KEY) || '[]') }

beforeEach(() => { localStorage.clear(); sessionStorage.clear(); vi.spyOn(Element.prototype, 'scrollIntoView').mockImplementation(() => {}); vi.spyOn(console, 'log').mockImplementation(() => {}) })
afterEach(() => { wrappers.splice(0).forEach(wrapper => wrapper.unmount()); vi.restoreAllMocks() })

describe('full suite with three real reading sessions', () => {
  it('shows 60 minutes and 40 questions, isolates local q1 answers and saves one full result', async () => {
    const wrapper = await mountSuite()
    await vi.waitFor(() => expect(wrapper.text()).toContain('60 minutes left'))
    await wrapper.get('.entry-card .primary-button').trigger('click')
    expect(wrapper.text()).toContain('3 passages and 40 questions')
    await wrapper.get('.instruction-actions .primary-button').trigger('click')
    await ready(wrapper)
    const children = wrapper.findAllComponents(PracticeMode)
    children[0].findComponent(PracticeNodeRenderer).vm.$emit('set:dropzone', { questionId: 'q1', poolId: 'headings', value: 'i', label: 'i' })
    children[1].findComponent(PracticeNodeRenderer).vm.$emit('toggle:choice', { fieldName: 'q1_2', inputType: 'checkbox', value: 'B', checked: true })
    children[2].findComponent(PracticeNodeRenderer).vm.$emit('set:dropzone', { questionId: 'q1', poolId: 'headings', value: 'iii', label: 'iii' })
    await nextTick()
    // Renderer events must reach each actual useReadingPracticeSession instance.
    expect(handles(wrapper).map(child => child.getState().answerMap.q1)).toEqual(['I', 'B', 'iii'])
    await wrapper.get('[data-display-number="27"]').trigger('click')
    expect(wrapper.get('[data-display-number="27"]').attributes('aria-current')).toBe('step')
    await submit(wrapper)
    expect(history()).toHaveLength(1)
    expect(history()[0].totalQuestions).toBe(40)
    expect(history()[0].passages.map((part: any) => part.result.answers.q1)).toEqual(['I', 'B', 'iii'])
    expect(handles(wrapper).every(child => child.getState().submitted)).toBe(true)
    await nextTick()
    expect(history()).toHaveLength(1)
    wrapper.unmount()
    const refreshed = await mountSuite()
    await ready(refreshed)
    await vi.waitFor(() => expect(handles(refreshed).every(child => child.getState().submitted)).toBe(true))
    expect(refreshed.find('.suite-result').exists()).toBe(true)
    expect(refreshed.findAllComponents(PracticeNodeRenderer).every(renderer => renderer.props('readOnly'))).toBe(true)
    expect(history()).toHaveLength(1)
  })

  it('keeps the newest target when navigating rapidly across 26 → 27', async () => {
    const wrapper = await mountSuite(true)
    await start(wrapper)
    // Dispatch without yielding a render tick, as with rapid pointer/keyboard navigation.
    ;(wrapper.get('[data-display-number="26"]').element as HTMLButtonElement).click()
    ;(wrapper.get('[aria-label="Next question"]').element as HTMLButtonElement).click()
    await nextTick()
    await nextTick()
    await nextTick()
    expect(wrapper.get('[data-display-number="27"]').attributes('aria-current')).toBe('step')
    expect(wrapper.findAll('.suite-passage')[2].attributes('aria-hidden')).toBeUndefined()
    expect(wrapper.findAll('.suite-passage')[1].attributes('aria-hidden')).toBe('true')
    expect(handles(wrapper)[2].getState().activeQuestionId).toBe('q1')
  })

  it('restores an expired running timer and submits all three parts exactly once', async () => {
    localStorage.setItem(clockKey, JSON.stringify({ version: 1, phase: 'running', remainingSeconds: 1, deadline: Date.now() - 5000 }))
    const wrapper = await mountSuite()
    await ready(wrapper)
    await vi.waitFor(() => expect(history()).toHaveLength(1))
    expect(history()[0].durationSeconds).toBe(3600)
    expect(history()[0].passages).toHaveLength(3)
    expect(handles(wrapper).every(child => child.getState().submitted)).toBe(true)
    await nextTick()
    expect(history()).toHaveLength(1)
    wrapper.unmount()
    const refreshed = await mountSuite()
    await ready(refreshed)
    expect(history()).toHaveLength(1)
  })

  it('keeps three session drafts after storage failure and clears them only after successful retry', async () => {
    const wrapper = await mountSuite()
    await start(wrapper)
    await vi.waitFor(() => expect(draftKeys.every(key => sessionStorage.getItem(key))).toBe(true))
    const original = localStorage.setItem.bind(localStorage)
    const spy = vi.spyOn(localStorage, 'setItem').mockImplementation((key, value) => { if (key === EXAM_SUITE_HISTORY_KEY) throw new Error('quota'); original(key, value) })
    await submit(wrapper)
    expect(wrapper.text()).toContain('重新保存')
    expect(history()).toHaveLength(0)
    expect(draftKeys.every(key => sessionStorage.getItem(key))).toBe(true)
    spy.mockRestore()
    await wrapper.get('.suite-notice button').trigger('click')
    expect(history()).toHaveLength(1)
    expect(draftKeys.every(key => sessionStorage.getItem(key) === null)).toBe(true)
  })
})
