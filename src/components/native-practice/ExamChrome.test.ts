import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import ExamChrome from './ExamChrome.vue'

describe('ExamChrome duration and variant', () => {
  it('preserves the default single-passage instructions', () => {
    const wrapper = mount(ExamChrome, { props: { phase: 'instructions', questionCount: 13 } })
    expect(wrapper.text()).toContain('20 minutes left')
    expect(wrapper.text()).toContain('20 minutes to complete this single passage')
    wrapper.unmount()
  })

  it('describes the complete suite and emits start', async () => {
    const wrapper = mount(ExamChrome, { props: { phase: 'instructions', questionCount: 40, durationSeconds: 3600, examVariant: 'suite' } })
    expect(wrapper.text()).toContain('60 minutes left')
    expect(wrapper.text()).toContain('3 passages and 40 questions')
    expect(wrapper.text()).toContain('60 minutes to complete all three passages')
    await wrapper.find('.instruction-actions .primary-button').trigger('click')
    expect(wrapper.emitted('start')).toHaveLength(1)
    wrapper.unmount()
  })
})
