import { readFile } from 'node:fs/promises'
import { questionIndexPath } from '../../config/paths.js'
import type { QuestionIndexEntry } from '../../types/question-bank.js'

export async function loadQuestionIndex(): Promise<QuestionIndexEntry[]> {
  const raw = await readFile(questionIndexPath, 'utf8')
  return JSON.parse(raw) as QuestionIndexEntry[]
}

export async function findQuestionIndexEntry(questionId: string): Promise<QuestionIndexEntry | undefined> {
  const questions = await loadQuestionIndex()
  return questions.find((question) => question.id === questionId)
}
