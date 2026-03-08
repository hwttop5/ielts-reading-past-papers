import { setActivePinia, createPinia } from 'pinia'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useAchievementStore } from './achievementStore'
import { usePracticeStore } from './practiceStore'

describe('Achievement Store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    // Mock localStorage
    const store = {}
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation((key) => store[key] || null)
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation((key, value) => {
      store[key] = value
    })
  })

  it('initializes with default achievements', () => {
    const store = useAchievementStore()
    expect(store.achievements.length).toBeGreaterThan(0)
    expect(store.unlockedCount).toBe(0)
  })

  it('unlocks achievement manually', () => {
    const store = useAchievementStore()
    const success = store.unlock('first_practice')
    expect(success).toBe(true)
    expect(store.unlockedCount).toBe(1)
    expect(store.achievements.find(a => a.id === 'first_practice')?.unlocked).toBe(true)
  })

  it('checks and unlocks based on practice records', () => {
    const achievementStore = useAchievementStore()
    const practiceStore = usePracticeStore()

    // Simulate a practice record
    practiceStore.records.push({
      id: '1',
      questionId: 'q1',
      questionTitle: 'Test',
      time: Date.now(),
      duration: 60,
      totalQuestions: 10,
      correctAnswers: 10,
      accuracy: 100,
      category: 'P1'
    })

    achievementStore.check()
    expect(achievementStore.achievements.find(a => a.id === 'first_practice')?.unlocked).toBe(true)
    expect(achievementStore.achievements.find(a => a.id === 'perfect_score')?.unlocked).toBe(true)
  })

  it('calculates progress correctly', () => {
    const store = useAchievementStore()
    expect(store.progress).toBe(0)
    
    // Unlock half of achievements (approx)
    const half = Math.floor(store.totalAchievements / 2)
    for (let i = 0; i < half; i++) {
      store.unlock(store.achievements[i].id)
    }
    
    // Progress calculation is rounded
    expect(store.progress).toBeGreaterThan(40)
    expect(store.progress).toBeLessThan(60)
  })
})