import { defineStore } from 'pinia'
import { usePracticeStore } from './practiceStore'
import { eventBus, ACHIEVEMENT_UNLOCKED } from '@/utils/eventBus'

export type Rarity = 'common' | 'rare' | 'epic' | 'legendary'

export interface Achievement {
  id: string
  titleKey: string
  descKey: string
  rarity: Rarity
  points: number
  unlocked: boolean
  unlockedAt?: number
  icon?: string // Custom icon name if needed, otherwise derived from ID
}

const INITIAL_ACHIEVEMENTS: Achievement[] = [
  // Existing
  { id: 'first_practice', titleKey: 'achievement.first_practice.title', descKey: 'achievement.first_practice.desc', rarity: 'common', points: 10, unlocked: false },
  { id: 'practice_10', titleKey: 'achievement.practice_10.title', descKey: 'achievement.practice_10.desc', rarity: 'common', points: 20, unlocked: false },
  { id: 'practice_50', titleKey: 'achievement.practice_50.title', descKey: 'achievement.practice_50.desc', rarity: 'rare', points: 50, unlocked: false },
  { id: 'practice_100', titleKey: 'achievement.practice_100.title', descKey: 'achievement.practice_100.desc', rarity: 'epic', points: 100, unlocked: false },
  { id: 'accuracy_80', titleKey: 'achievement.accuracy_80.title', descKey: 'achievement.accuracy_80.desc', rarity: 'rare', points: 30, unlocked: false },
  { id: 'accuracy_90', titleKey: 'achievement.accuracy_90.title', descKey: 'achievement.accuracy_90.desc', rarity: 'epic', points: 60, unlocked: false },
  { id: 'perfect_score', titleKey: 'achievement.perfect_score.title', descKey: 'achievement.perfect_score.desc', rarity: 'epic', points: 80, unlocked: false },
  { id: 'speed_run', titleKey: 'achievement.speed_run.title', descKey: 'achievement.speed_run.desc', rarity: 'epic', points: 80, unlocked: false },

  // New
  { id: 'study_1h', titleKey: 'achievement.study_1h.title', descKey: 'achievement.study_1h.desc', rarity: 'common', points: 10, unlocked: false },
  { id: 'study_10h', titleKey: 'achievement.study_10h.title', descKey: 'achievement.study_10h.desc', rarity: 'rare', points: 50, unlocked: false },
  { id: 'study_50h', titleKey: 'achievement.study_50h.title', descKey: 'achievement.study_50h.desc', rarity: 'epic', points: 100, unlocked: false },
  
  { id: 'streak_3', titleKey: 'achievement.streak_3.title', descKey: 'achievement.streak_3.desc', rarity: 'common', points: 20, unlocked: false },
  { id: 'streak_7', titleKey: 'achievement.streak_7.title', descKey: 'achievement.streak_7.desc', rarity: 'rare', points: 50, unlocked: false },
  { id: 'streak_14', titleKey: 'achievement.streak_14.title', descKey: 'achievement.streak_14.desc', rarity: 'rare', points: 80, unlocked: false },
  { id: 'streak_30', titleKey: 'achievement.streak_30.title', descKey: 'achievement.streak_30.desc', rarity: 'epic', points: 150, unlocked: false },

  { id: 'perfect_3', titleKey: 'achievement.perfect_3.title', descKey: 'achievement.perfect_3.desc', rarity: 'rare', points: 100, unlocked: false },
  { id: 'perfect_10', titleKey: 'achievement.perfect_10.title', descKey: 'achievement.perfect_10.desc', rarity: 'legendary', points: 300, unlocked: false },

  { id: 'early_bird', titleKey: 'achievement.early_bird.title', descKey: 'achievement.early_bird.desc', rarity: 'rare', points: 30, unlocked: false },
  { id: 'night_owl', titleKey: 'achievement.night_owl.title', descKey: 'achievement.night_owl.desc', rarity: 'rare', points: 30, unlocked: false },
  { id: 'weekend_warrior', titleKey: 'achievement.weekend_warrior.title', descKey: 'achievement.weekend_warrior.desc', rarity: 'common', points: 20, unlocked: false },

  { id: 'marathon_runner', titleKey: 'achievement.marathon_runner.title', descKey: 'achievement.marathon_runner.desc', rarity: 'epic', points: 100, unlocked: false },
  { id: 'scholar', titleKey: 'achievement.scholar.title', descKey: 'achievement.scholar.desc', rarity: 'legendary', points: 200, unlocked: false },
]

export const useAchievementStore = defineStore('achievement', {
  state: () => ({
    achievements: JSON.parse(JSON.stringify(INITIAL_ACHIEVEMENTS)) as Achievement[],
    totalPoints: 0,
    logoClickCount: 0
  }),

  getters: {
    unlockedCount: state => state.achievements.filter(a => a.unlocked).length,
    totalAchievements: state => state.achievements.length,
    unlockedAchievements: state => state.achievements.filter(a => a.unlocked).sort((a, b) => (b.unlockedAt || 0) - (a.unlockedAt || 0)),
    progress: state => Math.round((state.achievements.filter(a => a.unlocked).length / state.achievements.length) * 100)
  },

  actions: {
    load() {
      const raw = localStorage.getItem('ielts_achievements')
      if (raw) {
        try {
          const saved = JSON.parse(raw)
          // Merge saved state
          this.achievements.forEach(a => {
            const s = saved.find((item: any) => item.id === a.id)
            if (s && s.unlocked) {
              a.unlocked = true
              a.unlockedAt = s.unlockedAt
            }
          })
          // Recalculate points
          this.totalPoints = this.achievements.reduce((sum, a) => a.unlocked ? sum + a.points : sum, 0)
        } catch (e) {
          console.error('Failed to load achievements', e)
        }
      }
    },

    save() {
      localStorage.setItem(
        'ielts_achievements',
        JSON.stringify(this.achievements.map(a => ({
          id: a.id,
          unlocked: a.unlocked,
          unlockedAt: a.unlockedAt
        })))
      )
    },

    unlock(id: string) {
      const a = this.achievements.find(a => a.id === id)
      if (a && !a.unlocked) {
        a.unlocked = true
        a.unlockedAt = Date.now()
        this.totalPoints += a.points
        this.save()
        eventBus.emit(ACHIEVEMENT_UNLOCKED, { achievement: a })
        return true
      }
      return false
    },

    // Simulated API endpoints
    async fetchAchievements() {
      // Mock API call
      return new Promise((resolve) => {
        setTimeout(() => resolve(this.achievements), 100)
      })
    },

    async claimReward(id: string) {
      // Mock API claim
      return new Promise((resolve) => {
        setTimeout(() => resolve({ success: true, points: this.achievements.find(a => a.id === id)?.points || 0 }), 100)
      })
    },

    triggerInteraction(type: 'share' | 'login' | 'review' | 'click_logo') {
      // Interactions removed
    },

    check() {
      const practice = usePracticeStore()
      const records = practice.records
      
      // Basic counts
      if (records.length >= 1) this.unlock('first_practice')
      if (records.length >= 10) this.unlock('practice_10')
      if (records.length >= 50) this.unlock('practice_50')
      if (records.length >= 100) this.unlock('practice_100')

      // Accuracy
      if (records.length > 0 && practice.avgAccuracy >= 80) this.unlock('accuracy_80')
      if (records.length > 0 && practice.avgAccuracy >= 90) this.unlock('accuracy_90')

      // Study time (duration is in seconds)
      const totalSeconds = records.reduce((sum, r) => sum + r.duration, 0)
      if (totalSeconds >= 3600) this.unlock('study_1h')
      if (totalSeconds >= 36000) this.unlock('study_10h')
      if (totalSeconds >= 180000) this.unlock('study_50h')

      // Perfect scores
      const perfectCount = records.filter(r => r.accuracy === 100).length
      if (perfectCount >= 1) this.unlock('perfect_score')
      if (perfectCount >= 3) this.unlock('perfect_3')
      if (perfectCount >= 10) this.unlock('perfect_10')

      // Time based
      records.forEach(r => {
        const date = new Date(r.time)
        const hour = date.getHours()
        const day = date.getDay()

        if (hour >= 5 && hour < 8) this.unlock('early_bird')
        if (hour >= 23 || hour < 2) this.unlock('night_owl')
        if (day === 0 || day === 6) this.unlock('weekend_warrior')
        
        // Speed run: < 10 mins (600s) and > 80% accuracy
        if (r.duration <= 600 && r.accuracy >= 80) this.unlock('speed_run')
      })

      // Streaks (Simplified check)
      // Sort records by time
      const sortedDates = [...new Set(records.map(r => new Date(r.time).toDateString()))].sort((a, b) => new Date(a).getTime() - new Date(b).getTime())
      
      let maxStreak = 0
      let currentStreak = 0
      let lastDate: Date | null = null

      sortedDates.forEach(dateStr => {
        const d = new Date(dateStr)
        if (!lastDate) {
          currentStreak = 1
        } else {
          const diff = (d.getTime() - lastDate.getTime()) / (1000 * 3600 * 24)
          if (diff === 1) {
            currentStreak++
          } else {
            currentStreak = 1
          }
        }
        if (currentStreak > maxStreak) maxStreak = currentStreak
        lastDate = d
      })

      if (maxStreak >= 3) this.unlock('streak_3')
      if (maxStreak >= 7) this.unlock('streak_7')
      if (maxStreak >= 14) this.unlock('streak_14')
      if (maxStreak >= 30) this.unlock('streak_30')

      // Legend removed
    },

    reset() {
      this.achievements = JSON.parse(JSON.stringify(INITIAL_ACHIEVEMENTS))
      this.totalPoints = 0
      this.save()
    }
  }
})
