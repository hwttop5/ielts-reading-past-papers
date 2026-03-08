import { defineStore } from 'pinia'

export interface PracticeRecord {
  id: string
  questionId: string
  questionTitle: string
  category: string
  time: number
  duration: number
  correctAnswers: number
  totalQuestions: number
  accuracy: number
  score: number
}

export const usePracticeStore = defineStore('practice', {
  state: () => ({
    records: [] as PracticeRecord[]
  }),

  getters: {
    totalCount: (state) => state.records.length,
    
    avgAccuracy: (state) => {
      if (state.records.length === 0) return 0
      const sum = state.records.reduce((a, b) => a + b.accuracy, 0)
      return Math.round(sum / state.records.length)
    },
    
    totalTime: (state) => {
      return state.records.reduce((a, b) => a + b.duration, 0)
    },
    
    totalQuestionsAnswered: (state) => {
      return state.records.reduce((a, b) => a + b.totalQuestions, 0)
    }
  },

  actions: {
    load() {
      const raw = localStorage.getItem('ielts_practice')
      if (raw) {
        this.records = JSON.parse(raw)
      }
    },

    add(record: PracticeRecord) {
      this.records.unshift({
        ...record,
        id: Date.now().toString(),
        time: Date.now()
      })
      localStorage.setItem('ielts_practice', JSON.stringify(this.records))
    },

    clear() {
      this.records = []
      localStorage.removeItem('ielts_practice')
    },

    deleteRecord(id: string) {
      const index = this.records.findIndex(r => r.id === id)
      if (index > -1) {
        this.records.splice(index, 1)
        localStorage.setItem('ielts_practice', JSON.stringify(this.records))
      }
    }
  }
})
