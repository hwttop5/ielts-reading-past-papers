import type {
  AssistantAttachment,
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
  attachments?: AssistantAttachment[]
  focusQuestionNumbers?: string[]
  attemptContext?: AttemptContext
  recentPractice?: RecentPracticeItem[]
  contextChunks: RagChunk[]
}

function modeInstruction(mode: AssistantMode): string {
  switch (mode) {
    case 'hint':
      return [
        'Give the learner the best next move without revealing the exact final answer.',
        'You may point to the most relevant paragraph, clue type, elimination path, or wording trap.',
        'Do not reveal an answer option, heading, or paragraph label when that label is itself the answer space.',
        'Keep the reply concise. Use only the sections that are necessary, and keep each section short.',
        'If the evidence is not enough to be precise, say that clearly and ask the learner to inspect a narrower part of the passage.'
      ].join(' ')
    case 'explain':
      return [
        'Explain the reasoning path for the current question set.',
        'State the conclusion only when the supplied evidence supports it.',
        'Keep the explanation concise and focused on the asked question.',
        'Always connect the conclusion to passage evidence, paraphrase relationships, or elimination logic.'
      ].join(' ')
    case 'review':
      return [
        'Review the learner answer against the official answer and explanation.',
        'Explain the likely mistake, the corrective evidence, and the safer rule to use next time.',
        'Keep the review tight and specific to the asked question.',
        'If the supplied context supports the correct answer, you may state it plainly.'
      ].join(' ')
    case 'similar':
      return 'This mode is handled outside the model.'
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
    `Submitted: ${attemptContext.submitted ? 'yes' : 'no'}`,
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

function formatAttachments(attachments: AssistantAttachment[] = []): string {
  if (attachments.length === 0) {
    return 'None'
  }

  return attachments
    .map((attachment, index) => compactMultiline([
      `[Attachment ${index + 1}] ${attachment.name}`,
      `Type: ${attachment.type}`,
      `Truncated: ${attachment.truncated ? 'yes' : 'no'}`,
      attachment.text ? attachment.text : 'No extracted text was available.'
    ].join('\n')))
    .join('\n\n')
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
    'Answer the learner question directly, then support it with grounded reasoning.',
    'Use only the supplied context chunks plus any extracted attachment text. Do not invent evidence.',
    'Treat attachment text as learner-provided notes, not official ground truth, unless it matches the supplied passage context.',
    'If the evidence is incomplete, lower confidence and list the missing context explicitly.',
    'Keep the response specific to this passage and question set. Avoid generic IELTS filler.',
    'Prioritize the current learner request over earlier conversation history.',
    'If exactly one focus question number is supplied, answer only that question and do not discuss other question numbers unless they are essential shared instructions.',
    'Do not restate the passage title unless the learner explicitly asks for it.',
    'Mention question numbers or paragraph labels when useful.',
    languageInstruction(input.locale),
    modeInstruction(input.mode),
    'Return strict JSON with this exact shape:',
    '{"answer":"string","answerSections":[{"type":"direct_answer","text":"string"},{"type":"reasoning","text":"string"},{"type":"evidence","text":"string"},{"type":"next_step","text":"string"}],"followUps":["string","string"],"confidence":"high|medium|low","missingContext":["string"]}'
  ].join('\n'))

  const focusQuestionNumbers = input.focusQuestionNumbers?.length
    ? input.focusQuestionNumbers.join(', ')
    : 'None'

  const user = compactMultiline([
    `Question set: ${input.question.title}`,
    `Category: ${input.question.category}`,
    `Mode: ${input.mode}`,
    `Learner request: ${input.userQuery?.trim() || 'Use the default tutor guidance for this mode.'}`,
    `Focus question numbers: ${focusQuestionNumbers}`,
    `Conversation history:\n${formatHistory(input.history)}`,
    `Attempt context:\n${formatAttemptContext(input.attemptContext)}`,
    `Recent practice:\n${formatRecentPractice(input.recentPractice)}`,
    `Attachments:\n${formatAttachments(input.attachments)}`,
    `Context chunks:\n${formatContextChunks(input.contextChunks)}`
  ].join('\n\n'))

  return { system, user }
}
