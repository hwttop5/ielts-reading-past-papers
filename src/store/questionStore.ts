import { defineStore } from 'pinia'
import { scanQuestionBank, type Question as ScannerQuestion } from '@/utils/questionScanner'

export interface Question extends ScannerQuestion {}

const QUESTIONS_CACHE_KEY = 'ielts_questions'
const QUESTIONS_CACHE_VERSION_KEY = 'ielts_questions_version'
const QUESTIONS_CACHE_VERSION = '2026-04-03-reading-reference-v2'

export const useQuestionStore = defineStore('question', {
  state: () => ({
    questions: [] as Question[],
    isLoaded: false
  }),

  actions: {
    loadQuestions() {
      if (this.isLoaded && this.questions.length > 0) {
        return
      }

      const cacheVersion = localStorage.getItem(QUESTIONS_CACHE_VERSION_KEY)
      const raw = localStorage.getItem(QUESTIONS_CACHE_KEY)
      if (raw) {
        try {
          const parsed = JSON.parse(raw)
          if (cacheVersion === QUESTIONS_CACHE_VERSION && Array.isArray(parsed) && parsed.length > 0) {
            this.questions = parsed
            this.isLoaded = true
            return
          }
        } catch (error) {
          console.error('Failed to parse questions from localStorage:', error)
        }
      }

      this.questions = scanQuestionBank()
      this.isLoaded = true

      if (this.questions.length > 0) {
        localStorage.setItem(QUESTIONS_CACHE_KEY, JSON.stringify(this.questions))
        localStorage.setItem(QUESTIONS_CACHE_VERSION_KEY, QUESTIONS_CACHE_VERSION)
      }
    },

    refreshQuestions() {
      this.questions = scanQuestionBank()
      this.isLoaded = true

      if (this.questions.length > 0) {
        localStorage.setItem(QUESTIONS_CACHE_KEY, JSON.stringify(this.questions))
        localStorage.setItem(QUESTIONS_CACHE_VERSION_KEY, QUESTIONS_CACHE_VERSION)
      }
    },

    saveQuestions(list: Question[]) {
      this.questions = list
      localStorage.setItem(QUESTIONS_CACHE_KEY, JSON.stringify(list))
      localStorage.setItem(QUESTIONS_CACHE_VERSION_KEY, QUESTIONS_CACHE_VERSION)
    },

    getQuestionById(id: string) {
      return this.questions.find((question) => question.id === id)
    }
  }
})
