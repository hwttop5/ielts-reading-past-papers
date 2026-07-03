import { createPinia, setActivePinia } from 'pinia'
import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import PracticeView from '@/views/Practice.vue'
import HomeView from '@/views/Home.vue'
import { usePracticeStore, type PracticeRecord } from '@/store/practiceStore'

const mocks = vi.hoisted(() => ({
  pushMock: vi.fn(),
  messageSuccessMock: vi.fn()
}))

const pushMock = mocks.pushMock
const messageSuccessMock = mocks.messageSuccessMock

vi.mock('vue-router', () => ({
  useRouter: () => ({
    push: mocks.pushMock
  })
}))

vi.mock('ant-design-vue', () => ({
  message: {
    success: mocks.messageSuccessMock,
    info: vi.fn(),
    error: vi.fn()
  }
}))

vi.mock('virtual:pwa-register', () => ({
  registerSW: vi.fn(() => vi.fn())
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
    messageSuccessMock.mockReset()

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
    vi.unstubAllGlobals()
  })

  it('opens review mode from the practice history list', async () => {
    const pinia = createPinia()

    const wrapper = mount(PracticeView, {
      global: {
        plugins: [pinia],
        provide: {
          t: (key: string) => key,
          currentLang: ref<'zh' | 'en'>('en')
        }
      }
    })
    const store = usePracticeStore()
    store.records = [reviewableRecord() as PracticeRecord]

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

  it('deletes one practice history record without opening review mode', async () => {
    const confirmMock = vi.fn(() => true)
    vi.stubGlobal('confirm', confirmMock)
    const pinia = createPinia()

    const wrapper = mount(PracticeView, {
      global: {
        plugins: [pinia],
        provide: {
          t: (key: string) => key,
          currentLang: ref<'zh' | 'en'>('en')
        }
      }
    })
    const store = usePracticeStore()
    store.records = [
      reviewableRecord() as PracticeRecord,
      reviewableRecord({
        id: 'record-2',
        questionId: 'p2-high-03',
        questionTitle: 'Second record',
        resultSnapshot: { metadata: { examId: 'p2-high-03' } }
      }) as PracticeRecord
    ]

    await wrapper.vm.$nextTick()
    await wrapper.find('.record-delete-button').trigger('click')
    await wrapper.vm.$nextTick()

    expect(confirmMock).toHaveBeenCalledWith('practice.deleteRecordConfirm')
    expect(pushMock).not.toHaveBeenCalled()
    expect(messageSuccessMock).toHaveBeenCalledWith('practice.recordDeleted')
    expect(JSON.parse(backingStore.ielts_practice).map((record: { id: string }) => record.id)).toEqual(['record-2'])
    expect(JSON.parse(backingStore.ielts_sync_meta).practice.deletedRecordIds).toEqual(['record-1'])
  })

  it('opens review mode from the home latest practice cards', async () => {
    const pinia = createPinia()

    const wrapper = mount(HomeView, {
      global: {
        plugins: [pinia],
        provide: {
          t: (key: string) => key,
          currentLang: ref<'zh' | 'en'>('en')
        }
      }
    })
    const store = usePracticeStore()
    store.records = [reviewableRecord({ id: 'record-2', questionId: 'p2-high-03', resultSnapshot: { metadata: { examId: 'p2-high-03' } } }) as PracticeRecord]

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
