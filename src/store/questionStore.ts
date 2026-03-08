import { defineStore } from 'pinia'
import { scanQuestionBank, type Question as ScannerQuestion } from '@/utils/questionScanner'

export interface Question extends ScannerQuestion {}

export const useQuestionStore = defineStore('question', {
  state: () => ({
    questions: [] as Question[],
    isLoaded: false
  }),

  actions: {
    loadQuestions() {
      // 如果已经加载过，直接返回
      if (this.isLoaded && this.questions.length > 0) {
        return
      }

      // 尝试从 localStorage 读取
      const raw = localStorage.getItem('ielts_questions')
      if (raw) {
        try {
          const parsed = JSON.parse(raw)
          if (Array.isArray(parsed) && parsed.length > 0) {
            this.questions = parsed
            this.isLoaded = true
            return
          }
        } catch (e) {
          console.error('Failed to parse questions from localStorage:', e)
        }
      }

      // 从 questionBank 目录扫描题目
      this.questions = scanQuestionBank()
      this.isLoaded = true

      // 保存到 localStorage
      if (this.questions.length > 0) {
        localStorage.setItem('ielts_questions', JSON.stringify(this.questions))
      }
    },

    refreshQuestions() {
      // 强制重新扫描
      this.questions = scanQuestionBank()
      this.isLoaded = true

      if (this.questions.length > 0) {
        localStorage.setItem('ielts_questions', JSON.stringify(this.questions))
      }
    },

    saveQuestions(list: Question[]) {
      this.questions = list
      localStorage.setItem('ielts_questions', JSON.stringify(list))
    },

    getQuestionById(id: string) {
      return this.questions.find(q => q.id === id)
    },

    getQuestionByPath(path: string) {
      return this.questions.find(q => q.htmlPath === path)
    }
  }
})
