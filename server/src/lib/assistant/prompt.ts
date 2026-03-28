import type {
  AssistantHistoryItem,
  AssistantLocale,
  AssistantMode,
  AttemptContext,
  RecentPracticeItem
} from '../../types/assistant.js'
import type { QuestionIndexEntry, RagChunk } from '../../types/question-bank.js'
import { compactMultiline } from '../utils/text.js'

interface PromptInput {
  mode: AssistantMode
  locale: AssistantLocale
  question: QuestionIndexEntry
  userQuery?: string
  history?: AssistantHistoryItem[]
  attemptContext?: AttemptContext
  recentPractice?: RecentPracticeItem[]
  contextChunks: RagChunk[]
}

function modeInstruction(mode: AssistantMode): string {
  switch (mode) {
    case 'hint':
      return [
        'Give the learner the best next step, not the final answer.',
        'Do not reveal the exact correct option, word, heading, or final mapping.',
        'Write 2 to 4 complete sentences.',
        'Be concrete: name the likely paragraph, clue type, or elimination strategy when the context supports it.'
      ].join(' ')
    case 'explain':
      return [
        'Explain the reasoning path clearly and directly.',
        'Do not answer with only the final option, word, or label.',
        'State the conclusion, then explain the supporting evidence or paraphrase in 2 to 5 complete sentences.',
        'Anchor the explanation to the provided passage/question context instead of generic IELTS advice.',
        'You may describe the strongest evidence and paraphrase relationship, but do not fabricate missing evidence.'
      ].join(' ')
    case 'review':
      return [
        'Assume the learner has already submitted.',
        'Write 2 to 5 complete sentences, not just the corrected option.',
        'Explain what likely went wrong, what evidence supports the correction, and what to do differently next time.',
        'If the provided context clearly supports a correct answer, you may state it plainly.'
      ].join(' ')
    case 'similar':
      return 'This mode is handled outside the chat model.'
  }
}

function languageInstruction(locale: AssistantLocale): string {
  return locale === 'zh'
    ? 'Respond in Simplified Chinese. Keep question numbers, paragraph labels, and quoted evidence in their original form when useful.'
    : 'Respond in English.'
}

function formatHistory(history: AssistantHistoryItem[] = []): string {
  if (history.length === 0) {
    return 'None'
  }

  return history
    .slice(-6)
    .map((item) => `${item.role}: ${item.content}`)
    .join('\n')
}

function formatAttemptContext(attemptContext?: AttemptContext): string {
  if (!attemptContext) {
    return 'None'
  }

  const selectedAnswers = attemptContext.selectedAnswers
    ? Object.entries(attemptContext.selectedAnswers)
        .map(([key, value]) => `${key}=${value}`)
        .join(', ')
    : 'None'

  const wrongQuestions = attemptContext.wrongQuestions?.join(', ') ?? 'None'

  return compactMultiline([
    `Score: ${attemptContext.score ?? 'unknown'}`,
    `Wrong questions: ${wrongQuestions}`,
    `Selected answers: ${selectedAnswers}`
  ].join('\n'))
}

function formatRecentPractice(items: RecentPracticeItem[] = []): string {
  if (items.length === 0) {
    return 'None'
  }

  return items
    .slice(0, 10)
    .map((item) => `${item.questionId} | ${item.category} | accuracy=${item.accuracy} | duration=${item.duration}`)
    .join('\n')
}

function formatContextChunks(chunks: RagChunk[]): string {
  return chunks
    .map((chunk, index) => {
      const questions = chunk.questionNumbers.length > 0 ? chunk.questionNumbers.join(', ') : 'n/a'
      const paragraphs = chunk.paragraphLabels.length > 0 ? chunk.paragraphLabels.join(', ') : 'n/a'

      return compactMultiline([
        `[Context ${index + 1}]`,
        `Type: ${chunk.chunkType}`,
        `Questions: ${questions}`,
        `Paragraphs: ${paragraphs}`,
        chunk.content
      ].join('\n'))
    })
    .join('\n\n')
}

export function buildAssistantPrompt(input: PromptInput): { system: string; user: string } {
  const system = compactMultiline([
    'You are an IELTS Reading coach embedded inside a question-practice workflow.',
    'Answer the learner\'s actual question first. Do not pad the response with generic filler.',
    'Use only the supplied context chunks. If the evidence is insufficient, say exactly what is missing instead of guessing.',
    'Keep the answer specific to this passage and question set.',
    'The answer field must contain normal tutor-facing prose, not JSON fragments or metadata labels.',
    'Mention question numbers or paragraph labels when the context makes them useful.',
    'Follow-up suggestions must be short, concrete, and tied to this exact passage. Avoid stock phrases.',
    'Return 2 or 3 follow-up suggestions whenever possible.',
    languageInstruction(input.locale),
    modeInstruction(input.mode),
    'Return strict JSON with this exact shape:',
    '{"answer":"string","followUps":["string","string"]}'
  ].join('\n'))

  const user = compactMultiline([
    `Question set: ${input.question.title}`,
    `Category: ${input.question.category}`,
    `Mode: ${input.mode}`,
    `Learner request: ${input.userQuery?.trim() || 'Use the default tutor guidance for this mode.'}`,
    `Conversation history:\n${formatHistory(input.history)}`,
    `Attempt context:\n${formatAttemptContext(input.attemptContext)}`,
    `Recent practice:\n${formatRecentPractice(input.recentPractice)}`,
    `Context chunks:\n${formatContextChunks(input.contextChunks)}`
  ].join('\n\n'))

  return { system, user }
}
