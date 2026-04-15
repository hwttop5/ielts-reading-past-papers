import { setActivePinia, createPinia } from 'pinia'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { usePracticeStore, type PracticeRecordInput } from './practiceStore'

describe('Practice Store', () => {
  let backingStore: Record<string, string>

  beforeEach(() => {
    setActivePinia(createPinia())
    backingStore = {}
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

  it('loads only records with a valid questionId from localStorage', () => {
    backingStore.ielts_practice = JSON.stringify([
      null,
      {},
      { questionId: '' },
      {
        id: 'record-1',
        questionId: 'p1-high-05',
        questionTitle: 'Katherine Mansfield',
        time: 1710000000000,
        duration: '90',
        correctAnswers: '7',
        totalQuestions: '13',
        accuracy: '54',
        score: '7',
        category: 'P1'
      }
    ])

    const store = usePracticeStore()
    expect(() => store.load()).not.toThrow()

    expect(store.records).toHaveLength(1)
    expect(store.records[0]).toMatchObject({
      id: 'record-1',
      questionId: 'p1-high-05',
      duration: 90,
      correctAnswers: 7,
      totalQuestions: 13,
      accuracy: 54,
      score: 7
    })
    expect(JSON.parse(backingStore.ielts_practice)).toHaveLength(1)
  })

  it('clears malformed localStorage data instead of throwing', () => {
    backingStore.ielts_practice = '{bad json'

    const store = usePracticeStore()
    expect(() => store.load()).not.toThrow()

    expect(store.records).toEqual([])
    expect(backingStore.ielts_practice).toBeUndefined()
  })

  it('does not persist an added record without questionId', () => {
    const store = usePracticeStore()
    const invalidRecord = {
      questionId: '',
      questionTitle: 'Broken',
      category: 'P1',
      duration: 60,
      correctAnswers: 0,
      totalQuestions: 13,
      accuracy: 0,
      score: 0
    } as PracticeRecordInput

    store.add(invalidRecord)

    expect(store.records).toEqual([])
    expect(backingStore.ielts_practice).toBeUndefined()
  })
})
