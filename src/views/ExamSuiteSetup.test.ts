import { mount, flushPromises } from '@vue/test-utils'
import { ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { describe, expect, it, vi } from 'vitest'
import ExamSuiteSetup from './ExamSuiteSetup.vue'

vi.mock('@/utils/examSuite', () => ({
  getSuiteCandidates: () => ({ P1: [{ examId: 'one', title: 'First' }], P2: [{ examId: 'two', title: 'Second' }], P3: [{ examId: 'three', title: 'Third' }] }),
  prepareSuite: async (ids: string[]) => ({ ids })
}))
vi.mock('@/composables/useExamSuiteAttempt', () => ({
  useExamSuiteAttempt: () => ({ history: ref([]), storageError: ref(null) })
}))

describe('ExamSuiteSetup', () => {
  it('requires a complete selection and starts a separately identified attempt', async () => {
    const router = createRouter({ history: createMemoryHistory(), routes: [
      { path: '/', component: ExamSuiteSetup }, { path: '/exam-suite', component: { template: '<div />' } }, { path: '/browse', component: { template: '<div />' } }
    ] })
    await router.push('/')
    const wrapper = mount(ExamSuiteSetup, { global: { plugins: [router] } })
    expect(wrapper.find('button[type="submit"]').attributes('disabled')).toBeDefined()
    await wrapper.find('.setup-actions button[type="button"]').trigger('click')
    expect(wrapper.find('button[type="submit"]').attributes('disabled')).toBeUndefined()
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/exam-suite')
    expect(router.currentRoute.value.query.passages).toBe('one,two,three')
    expect(router.currentRoute.value.query.attemptId).toBeTruthy()
    wrapper.unmount()
  })
})
