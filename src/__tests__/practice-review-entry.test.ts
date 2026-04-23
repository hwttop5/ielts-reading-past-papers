import { createPinia, setActivePinia } from 'pinia'
import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import PracticeView from '@/views/Practice.vue'
import HomeView from '@/views/Home.vue'

const pushMock = vi.fn()

vi.mock('vue-router', () => ({
  useRouter: () => ({
    push: pushMock
  })
}))

function reviewableRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: 'record-1',
    questionId: 'p1-high-05',
    questionTitle: 'Katherine Mansfield',
    category: 'P1',
    time: 1710000000000,
    duration: 90,
    correctAnswers: 7,
    totalQuestions: 13,
    accuracy: 54,
    score: 7,
    resultSnapshot: {
      metadata: {
        examId: 'p1-high-05'
      }
    },
    ...overrides
  }
}

describe('practice review entry points', () => {
  let backingStore: Record<string, string>

  beforeEach(() => {
    setActivePinia(createPinia())
    backingStore = {}
    pushMock.mockReset()

    vi.spyOn(Storage.prototype, 'getItem').mockImplementation((key) => backingStore[key] ?? null)
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation((key, value) => {
      backingStore[key] = String(value)
    })
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation((key) => {
      delete backingStore[key]
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('opens review mode from the practice history list', async () => {
    backingStore.ielts_practice = JSON.stringify([reviewableRecord()])

    const wrapper = mount(PracticeView, {
      global: {
        plugins: [createPinia()],
        provide: {
          t: (key: string) => key,
          currentLang: ref<'zh' | 'en'>('en')
        }
      }
    })

    await wrapper.vm.$nextTick()
    await wrapper.find('.timeline-item.reviewable').trigger('click')

    expect(pushMock).toHaveBeenCalledWith({
      path: '/practice-mode',
      query: {
        id: 'p1-high-05',
        mode: 'review',
        recordId: 'record-1'
      }
    })
  })

  it('opens review mode from the home latest practice cards', async () => {
    backingStore.ielts_practice = JSON.stringify([reviewableRecord({ id: 'record-2', questionId: 'p2-high-03', resultSnapshot: { metadata: { examId: 'p2-high-03' } } })])

    const wrapper = mount(HomeView, {
      global: {
        plugins: [createPinia()],
        provide: {
          t: (key: string) => key,
          currentLang: ref<'zh' | 'en'>('en')
        }
      }
    })

    await wrapper.vm.$nextTick()
    await wrapper.find('.practice-card.reviewable').trigger('click')

    expect(pushMock).toHaveBeenCalledWith({
      path: '/practice-mode',
      query: {
        id: 'p2-high-03',
        mode: 'review',
        recordId: 'record-2'
      }
    })
  })
})
