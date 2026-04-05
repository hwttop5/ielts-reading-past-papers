import type {
  AssistantAttachment,
  AssistantHistoryItem,
  AssistantLocale,
  AssistantMode,
  AssistantQueryRequest,
  AttemptContext,
  RecentPracticeItem
} from '../../types/assistant.js'
import type { QuestionIndexEntry, RagChunk } from '../../types/question-bank.js'
import type { AnswerStyle } from './answerStyle.js'
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
  /** When set, tightens instructions and JSON shape for short answers */
  answerStyle?: AnswerStyle
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

function truncateForPrompt(text: string, maxChars: number): string {
  if (text.length <= maxChars) {
    return text
  }
  return `${text.slice(0, maxChars)}…`
}

function maxCharsForAnswerStyle(style: AnswerStyle | undefined): number {
  if (style === 'vocab_paraphrase') {
    return 260
  }
  if (style === 'paragraph_focus') {
    return 420
  }
  return Number.POSITIVE_INFINITY
}

function formatContextChunks(chunks: RagChunk[], answerStyle?: AnswerStyle): string {
  const cap = maxCharsForAnswerStyle(answerStyle)
  return chunks
    .map((chunk, index) => {
      const questions = chunk.questionNumbers.length > 0 ? chunk.questionNumbers.join(', ') : 'n/a'
      const paragraphs = chunk.paragraphLabels.length > 0 ? chunk.paragraphLabels.join(', ') : 'n/a'
      const body = Number.isFinite(cap) ? truncateForPrompt(chunk.content, cap) : chunk.content

      return compactMultiline([
        `[Context ${index + 1}]`,
        `Type: ${chunk.chunkType}`,
        `Questions: ${questions}`,
        `Paragraphs: ${paragraphs}`,
        body
      ].join('\n'))
    })
    .join('\n\n')
}

function answerStyleInstruction(style: AnswerStyle | undefined, locale: AssistantLocale): string {
  if (!style || style === 'full_tutoring') {
    return ''
  }
  if (style === 'vocab_paraphrase') {
    return locale === 'zh'
      ? 'Learner is asking about synonyms, paraphrase, or word meaning. Answer briefly: give a short list of likely substitutes or glosses tied to the passage if possible. Do NOT walk through the whole Matching Headings or full question-set strategy unless they explicitly ask for it. Do NOT paste long passage quotes; at most one short phrase as example.'
      : 'The learner asks about synonyms, paraphrase, or word meaning. Answer briefly with a short list of likely substitutes tied to the passage. Do NOT expand into a full question-type tutorial unless asked. Avoid long passage quotes; one short phrase as example at most.'
  }
  return locale === 'zh'
    ? 'Learner is asking about one paragraph’s content or gist. Answer briefly: main idea plus at most one short evidence phrase. Do NOT restate the entire paragraph. If that paragraph is missing from context, say so in missingContext and suggest reading it in the passage.'
    : 'The learner asks about one paragraph’s content or gist. Be brief: main idea plus at most one short evidence phrase. Do not paste the full paragraph. If the paragraph is missing from context, say so in missingContext.'
}

export function buildAssistantPrompt(input: PromptInput): { system: string; user: string } {
  const brief = input.answerStyle && input.answerStyle !== 'full_tutoring'
  // Simplify JSON shape for brief styles: vocab_paraphrase needs only direct_answer
  const jsonShape = brief
    ? input.answerStyle === 'vocab_paraphrase'
      ? '{"answer":"string","answerSections":[{"type":"direct_answer","text":"string"}],"followUps":[],"confidence":"high","missingContext":[]} For vocabulary/synonym questions, provide only a direct_answer with a short list of substitutes. Keep followUps empty.'
      : '{"answer":"string","answerSections":[{"type":"direct_answer","text":"string"},{"type":"evidence","text":"string"}],"followUps":[],"confidence":"high","missingContext":[]} For paragraph-focus questions, provide direct_answer (main idea) plus at most one evidence phrase. Keep followUps empty.'
    : '{"answer":"string","answerSections":[{"type":"direct_answer","text":"string"},{"type":"reasoning","text":"string"},{"type":"evidence","text":"string"},{"type":"next_step","text":"string"}],"followUps":["string","string"],"confidence":"high|medium|low","missingContext":["string"]}'

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
    answerStyleInstruction(input.answerStyle, input.locale),
    languageInstruction(input.locale),
    modeInstruction(input.mode),
    'Return strict JSON with this exact shape:',
    jsonShape
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
    `Context chunks:\n${formatContextChunks(input.contextChunks, input.answerStyle)}`
  ].join('\n\n'))

  return { system, user }
}

/**
 * Build prompt for router classification.
 * Minimal context: user input + recent 1-2 turns summary + page title + submit status + selection/attachment info.
 * Explicitly forbids reasoning/response body - only outputs JSON classification.
 */
export function buildRouterPrompt(
  request: AssistantQueryRequest,
  locale: 'zh' | 'en'
): { system: string; user: string } {
  const system = compactMultiline([
    'You are an intent classifier for an IELTS Reading assistant.',
    'Classify the user query into one of three routes:',
    '',
    '1. unrelated_chat: Off-topic queries (greetings, weather, smalltalk, real-world facts not about IELTS)',
    '2. ielts_general: IELTS/English learning questions NOT tied to current passage (tips, strategies, vocabulary, general question types)',
    '3. page_grounded: Questions explicitly about current passage/questions (question numbers, paragraph labels, "this passage", "this question", mistakes review)',
    '',
    'Output ONLY valid JSON with this exact shape:',
    '{"route": "unrelated_chat" | "ielts_general" | "page_grounded", "reason": "string", "confidence": number}',
    '',
    'Do NOT provide any reasoning, explanation, or response body. Only output the JSON object.'
  ].join('\n'))

  const query = request.userQuery || ''
  const pageContext = locale === 'zh'
    ? `当前页面：${request.selectedContext?.scope === 'passage' ? '文章阅读页' : '题目练习页'}`
    : `Current page: ${request.selectedContext?.scope === 'passage' ? 'Passage view' : 'Question practice view'}`

  const submitStatus = request.practiceContext?.submitted || request.attemptContext?.submitted
    ? (locale === 'zh' ? '已提交' : 'Submitted')
    : (locale === 'zh' ? '未提交' : 'Not submitted')

  const hasSelection = request.selectedContext?.text
    ? (locale === 'zh' ? '有选中文本' : 'Has text selection')
    : (locale === 'zh' ? '无选中文本' : 'No text selection')

  const hasAttachments = request.attachments && request.attachments.length > 0
    ? (locale === 'zh' ? `有${request.attachments.length}个附件` : `Has ${request.attachments.length} attachment(s)`)
    : (locale === 'zh' ? '无附件' : 'No attachments')

  const historySummary = request.history && request.history.length > 0
    ? request.history.slice(-2).map(h => `${h.role}: ${h.content.slice(0, 50)}...`).join('\n')
    : (locale === 'zh' ? '无历史对话' : 'No conversation history')

  const user = compactMultiline([
    `${pageContext}`,
    `Submit status: ${submitStatus}`,
    `Selection: ${hasSelection}`,
    `Attachments: ${hasAttachments}`,
    '',
    `Conversation history (last 1-2 turns):`,
    historySummary,
    '',
    `User query: ${query}`
  ].join('\n\n'))

  return { system, user }
}

/**
 * Build prompt for general chat (unrelated_chat route).
 * Does NOT include current document or question context.
 */
export function buildGeneralChatPrompt(
  request: AssistantQueryRequest,
  locale: 'zh' | 'en'
): { system: string; user: string } {
  const system = compactMultiline([
    'You are a friendly conversational assistant.',
    'The user is asking about off-topic matters (weather, greetings, smalltalk, real-world facts).',
    'Respond warmly and naturally. If appropriate, gently guide the conversation back to IELTS learning.',
    'Do NOT mention any passage, article, or question context unless the user explicitly asks.',
    locale === 'zh' ? '请用简体中文回答。' : 'Respond in English.'
  ].join('\n'))

  const user = compactMultiline([
    `User query: ${request.userQuery || ''}`,
    request.history && request.history.length > 0
      ? `Conversation history:\n${request.history.map(h => `${h.role}: ${h.content}`).join('\n')}`
      : 'No conversation history'
  ].join('\n\n'))

  return { system, user }
}

/**
 * Build prompt for IELTS general learning questions (ielts_general route).
 * Does NOT include current document or question context.
 */
export function buildIeltsCoachPrompt(
  request: AssistantQueryRequest,
  locale: 'zh' | 'en'
): { system: string; user: string } {
  const query = (request.userQuery || '').trim().toLowerCase()
  const isChitChat = /^(hi|hello|hey|thanks|thank you|bye|goodbye|who are you|你好 | 嗨 | 在吗 | 谢谢 | 再见 | 拜拜|你是谁|您好)[,.!?]?\s*$/i.test(query) ||
    query === '你好' || query === '你好啊' || query === '嗨' || query === '在吗' ||
    query === '谢谢' || query === '再见' || query === '拜拜' || query === '你是谁' || query === '您好'

  const system = compactMultiline([
    'You are a professional IELTS Reading coach.',
    'The user is asking about IELTS/English learning topics NOT tied to any specific passage or question.',
    'Provide general IELTS learning advice, tips, strategies, vocabulary explanations, or question type tutorials.',
    'Do NOT reference any specific passage, paragraph, or question unless the user provides them.',
    'Keep responses practical and actionable.',
    locale === 'zh' ? '请用简体中文回答，保持专业但友好的语气。' : 'Respond in English, maintaining a professional but friendly tone.',
    '',
    'Return strict JSON with this exact shape:',
    isChitChat
      ? '{"answer":"string","answerSections":[{"type":"direct_answer","text":"string"}],"followUps":[],"confidence":"high","missingContext":[]} For greetings or simple questions, provide only a brief direct_answer. Keep followUps empty. Do NOT include reasoning, evidence, or next_step sections.'
      : '{"answer":"string","answerSections":[{"type":"direct_answer","text":"string"},{"type":"reasoning","text":"string"},{"type":"next_step","text":"string"}],"followUps":["string","string","string"],"confidence":"high","missingContext":[]} For IELTS learning questions, provide direct_answer plus concise reasoning and next_step. Skip evidence section since no passage context is available.'
  ].join('\n'))

  const user = compactMultiline([
    `User query: ${request.userQuery || ''}`,
    request.history && request.history.length > 0
      ? `Conversation history:\n${request.history.map(h => `${h.role}: ${h.content}`).join('\n')}`
      : 'No conversation history',
    request.recentPractice && request.recentPractice.length > 0
      ? `Recent practice:\n${request.recentPractice.map(p => `${p.questionId} | ${p.category} | accuracy=${p.accuracy}`).join('\n')}`
      : 'No recent practice data'
  ].join('\n\n'))

  return { system, user }
}

/**
 * Build prompt for grounded RAG questions (page_grounded route).
 * Compressed context: primary question chunk + primary evidence chunk + max 1 supplemental passage.
 */
export function buildGroundedRagPrompt(
  request: AssistantQueryRequest,
  locale: 'zh' | 'en',
  contextChunks: RagChunk[],
  mode: AssistantMode
): { system: string; user: string } {
  const query = (request.userQuery || '').trim()

  // Length control based on mode
  const lengthInstruction = locale === 'zh'
    ? (mode === 'hint'
        ? '保持简洁：120-180 中文字。给提示但不直接给答案。'
        : mode === 'review'
        ? '保持简洁：180-320 中文字。解释错因和正确思路。'
        : '保持简洁：180-280 中文字。解释推理路径。')
    : (mode === 'hint'
        ? 'Keep it concise: 80-120 words. Give hints without revealing the answer.'
        : mode === 'review'
        ? 'Keep it concise: 120-200 words. Explain the mistake and correct path.'
        : 'Keep it concise: 120-180 words. Explain the reasoning path.')

  const system = compactMultiline([
    'You are an IELTS Reading coach answering questions about a specific passage and question set.',
    'Answer the learner question directly using only the supplied context.',
    'Do not invent evidence. If evidence is incomplete, say so briefly.',
    'Be natural and conversational - respond like a human tutor, not a template.',
    'Prioritize the current learner request over conversation history.',
    locale === 'zh' ? '请用简体中文回答。' : 'Respond in English.',
    lengthInstruction
  ].join('\n'))

  // Compress context: max 3 chunks (1 question + 1 evidence + 1 supplemental)
  const compressedChunks = contextChunks.slice(0, 3)
  const contextText = compressedChunks
    .map((chunk, i) => {
      const qNums = chunk.questionNumbers?.join(', ') || 'n/a'
      const paras = chunk.paragraphLabels?.join(', ') || 'n/a'
      const preview = chunk.content.length > 500 ? `${chunk.content.slice(0, 500)}...` : chunk.content
      return `[Context ${i + 1}] Type: ${chunk.chunkType}, Questions: ${qNums}, Paragraphs: ${paras}\n${preview}`
    })
    .join('\n\n')

  const user = compactMultiline([
    `Question set: ${request.selectedContext?.scope === 'question' ? 'Current question practice' : 'Current passage view'}`,
    `Mode: ${mode}`,
    `Learner request: ${query}`,
    request.focusQuestionNumbers?.length ? `Focus questions: ${request.focusQuestionNumbers.join(', ')}` : '',
    request.selectedContext?.text ? `Selected text: ${request.selectedContext.text.slice(0, 200)}...` : '',
    '',
    'Context chunks:',
    contextText
  ].filter(Boolean).join('\n'))

  return { system, user }
}

/**
 * Build minimal prompt for general chat (unrelated_chat route).
 * No passage context, just conversational response.
 */
export function buildGeneralChatPromptMinimal(
  request: AssistantQueryRequest,
  locale: 'zh' | 'en'
): { system: string; user: string } {
  const query = (request.userQuery || '').trim()

  const system = compactMultiline([
    'You are a friendly conversational assistant.',
    'The user is asking about off-topic matters (greetings, smalltalk, real-world facts).',
    'Respond warmly and naturally. Keep responses brief: 80-180 Chinese characters.',
    'If appropriate, gently guide back to IELTS learning.',
    locale === 'zh' ? '请用简体中文回答。' : 'Respond in English.'
  ].join('\n'))

  const user = compactMultiline([
    `User query: ${query}`,
    request.history && request.history.length > 0
      ? `Recent conversation:\n${request.history.slice(-2).map(h => `${h.role}: ${h.content}`).join('\n')}`
      : ''
  ].filter(Boolean).join('\n'))

  return { system, user }
}

/**
 * Build prompt for IELTS general learning questions (ielts_general route).
 * No passage context, but IELTS-focused coaching.
 */
export function buildIeltsGeneralPrompt(
  request: AssistantQueryRequest,
  locale: 'zh' | 'en'
): { system: string; user: string } {
  const query = (request.userQuery || '').trim().toLowerCase()
  const isChitChat = /^(hi|hello|hey|thanks|thank you|bye|goodbye|who are you|你好 | 嗨 | 在吗 | 谢谢 | 再见 | 拜拜 | 你是谁 | 您好)[,.!?]?\s*$/i.test(query) ||
    query === '你好' || query === '你好啊' || query === '嗨' || query === '在吗' ||
    query === '谢谢' || query === '再见' || query === '拜拜' || query === '你是谁' || query === '您好'

  const lengthInstruction = isChitChat
    ? (locale === 'zh' ? '保持简短：80-150 中文字。' : 'Keep it brief: 50-100 words.')
    : (locale === 'zh' ? '保持简洁：120-220 中文字。' : 'Keep it concise: 80-150 words.')

  const system = compactMultiline([
    'You are a professional IELTS Reading coach.',
    'The user is asking about IELTS/English learning topics NOT tied to any specific passage.',
    'Provide practical, actionable advice on strategies, vocabulary, or question types.',
    'Be natural and conversational, not template-driven.',
    locale === 'zh' ? '请用简体中文回答，保持专业但友好的语气。' : 'Respond in English, maintaining a professional but friendly tone.',
    lengthInstruction
  ].join('\n'))

  const user = compactMultiline([
    `User query: ${request.userQuery || ''}`,
    request.history && request.history.length > 0
      ? `Conversation history:\n${request.history.map(h => `${h.role}: ${h.content}`).join('\n')}`
      : '',
    request.recentPractice && request.recentPractice.length > 0
      ? `Recent practice:\n${request.recentPractice.slice(0, 3).map(p => `${p.questionId} | ${p.category} | accuracy=${p.accuracy}`).join('\n')}`
      : ''
  ].filter(Boolean).join('\n'))

  return { system, user }
}
