<template>
  <Teleport to="body">
    <button v-if="!isOpen" class="assistant-fab" type="button" :aria-expanded="isOpen" @click="toggleDialog">
      <span class="material-icons">auto_awesome</span>
      <span v-if="hasSubmitted" class="assistant-fab-badge"></span>
    </button>

    <Transition name="assistant-shell">
      <div v-if="isOpen" class="assistant-layer">
        <section ref="dialogRef" class="assistant-dialog" :class="{ fullscreen: viewMode === 'fullscreen', compact: isCompactDialog, dragging: isDragging, resizing: isResizing }" :style="dialogStyle" role="dialog" aria-modal="false">
          <header class="assistant-topbar" @pointerdown="startDrag">
            <div class="assistant-brand">
              <span class="assistant-brand-icon material-icons">auto_awesome</span>
              <div class="assistant-title-block">
                <p class="assistant-kicker">AI Coach</p>
                <h2 class="assistant-title">{{ questionTitle }}</h2>
              </div>
            </div>
            <div class="assistant-header-actions">
              <button class="icon-btn" type="button" :title="copy.viewTitle" @pointerdown.stop @click="toggleViewMode">
                <span class="material-icons">{{ viewMode === 'floating' ? 'open_in_full' : 'picture_in_picture_alt' }}</span>
              </button>
              <button class="icon-btn" type="button" :title="copy.closeTitle" @pointerdown.stop @click="closeDialog">
                <span class="material-icons">close</span>
              </button>
            </div>
          </header>

          <div ref="messageListRef" class="assistant-body">
            <section v-if="messages.length === 0" class="assistant-welcome">
              <div class="assistant-hero-copy">
                <h3>{{ copy.heroTitle }}</h3>
                <p>{{ copy.heroDescription }}</p>
              </div>
              <div class="assistant-suggestion-list">
                <button v-for="item in actionCards" :key="item.mode" class="assistant-suggestion" type="button" :disabled="item.disabled" @click="sendPreset(item.mode)">
                  <span class="material-icons">{{ item.icon }}</span>
                  <span class="assistant-suggestion-text">
                    <strong>{{ item.title }}</strong>
                    <small>{{ item.description }}</small>
                  </span>
                </button>
              </div>
              <p v-if="!hasSubmitted" class="assistant-note">{{ copy.reviewHint }}</p>
            </section>

            <section v-else class="assistant-thread">
              <article v-for="message in messages" :key="message.id" class="assistant-message" :class="[message.role, { error: message.isError }]">
                <div v-if="message.role === 'user'" class="assistant-user-chip">{{ message.content }}</div>
                <div v-else class="assistant-response">
                  <p v-if="!message.reviewItems?.length" class="assistant-message-text">{{ message.content }}</p>
                  <div v-else class="review-panel">
                    <p v-if="reviewSummaryText(message)" class="assistant-message-text assistant-message-text--summary">{{ reviewSummaryText(message) }}</p>
                    <div class="review-grid">
                      <article v-for="item in message.reviewItems" :key="`review-${item.questionNumber}`" class="review-card">
                        <div class="review-card-header">
                          <div class="review-card-meta">
                            <span class="review-question-badge">Q{{ item.questionNumber }}</span>
                            <span v-if="item.paragraphLabel" class="review-paragraph-badge">{{ reviewParagraphLabel(item) }}</span>
                          </div>
                          <div class="review-answer-stack">
                            <span v-if="item.selectedAnswer" class="review-answer-pill review-answer-pill--mine">{{ reviewSelectedLabel(item) }}</span>
                            <span class="review-answer-pill review-answer-pill--correct">{{ reviewCorrectLabel(item) }}</span>
                          </div>
                        </div>
                        <div class="review-card-section">
                          <h4>{{ reviewSectionTitle('explanation') }}</h4>
                          <p>{{ item.explanation || 'Detailed explanation was not extracted.' }}</p>
                        </div>
                        <div class="review-card-section review-card-section--evidence">
                          <h4>{{ reviewSectionTitle('evidence') }}</h4>
                          <blockquote>{{ item.evidence || 'Explicit source evidence was not extracted.' }}</blockquote>
                        </div>
                      </article>
                    </div>
                  </div>
                  <div v-if="message.citations?.length" class="citation-list">
                    <article v-for="(citation, citationIndex) in message.citations" :key="`${citation.chunkType}-${citationIndex}`" class="citation-card">
                      <div class="citation-meta">
                        <span>{{ formatChunkType(citation.chunkType) }}</span>
                        <span v-if="citation.paragraphLabels?.length">{{ citation.paragraphLabels.join(', ') }}</span>
                        <span v-else-if="citation.questionNumbers?.length">Q{{ citation.questionNumbers.join(', ') }}</span>
                      </div>
                      <p>{{ citation.excerpt }}</p>
                    </article>
                  </div>
                  <ul v-if="message.followUps?.length" class="follow-up-list">
                    <li v-for="followUp in message.followUps" :key="followUp">{{ followUp }}</li>
                  </ul>
                  <div v-if="message.recommendedQuestions?.length" class="recommend-list">
                    <button v-for="recommendation in message.recommendedQuestions" :key="recommendation.questionId" class="recommend-card" type="button" @click="openRecommendedQuestion(recommendation.questionId)">
                      <strong>{{ recommendation.title }}</strong>
                      <span>{{ recommendation.reason }}</span>
                    </button>
                  </div>
                </div>
              </article>
              <div v-if="isLoading" class="assistant-loading">
                <span class="material-icons loading-icon">autorenew</span>
                <span>{{ copy.loading }}</span>
              </div>
            </section>
          </div>

          <footer class="assistant-dock">
            <div class="assistant-composer" :class="{ focused: composerFocused }">
              <input ref="fileInputRef" class="assistant-file-input" type="file" multiple :accept="acceptedFileTypes" @change="handleFileSelection" />
              <div class="assistant-context-chip">
                <span class="material-icons">description</span>
                <span class="assistant-context-name" :title="questionTitle">{{ questionTitle }}</span>
              </div>
              <div v-if="attachments.length" class="assistant-attachments">
                <div v-for="attachment in attachments" :key="attachment.id" class="assistant-attachment-chip">
                  <span class="material-icons">{{ attachment.icon }}</span>
                  <span class="assistant-attachment-name" :title="attachment.name">{{ attachment.name }}</span>
                  <button class="assistant-attachment-remove" type="button" @click="removeAttachment(attachment.id)">
                    <span class="material-icons">close</span>
                  </button>
                </div>
              </div>
              <textarea ref="composerRef" v-model="draft" class="assistant-input" :placeholder="placeholder" rows="3" @focus="composerFocused = true" @blur="composerFocused = false" @compositionstart="isComposing = true" @compositionend="isComposing = false" @keydown.enter.exact.prevent="handleEnterSend"></textarea>
              <div class="assistant-composer-footer">
                <div class="assistant-left-actions">
                  <button class="icon-btn small assistant-upload-trigger" type="button" :title="copy.uploadTitle" @click="triggerFilePicker">
                    <span class="material-icons">add</span>
                  </button>
                  <div class="menu-wrap">
                    <button class="icon-btn small" type="button" :title="copy.modeMenuTitle" @click.stop="toggleModeMenu"><span class="material-icons">tune</span></button>
                    <div v-if="modeMenuOpen" class="assistant-menu up">
                      <button v-for="item in actionCards" :key="`mode-${item.mode}`" class="assistant-menu-item" :class="{ active: selectedMode === item.mode }" type="button" :disabled="item.disabled" @click="selectMode(item.mode)">
                        <span class="material-icons">{{ item.icon }}</span>
                        <span>{{ modeLabels[item.mode] }}</span>
                        <span v-if="selectedMode === item.mode" class="material-icons">check</span>
                      </button>
                    </div>
                  </div>
                </div>
                <div class="assistant-right-actions">
                  <span class="assistant-mode-badge">{{ modeLabels[selectedMode] }}</span>
                  <button class="assistant-send" type="button" :disabled="isLoading || isModeDisabled(selectedMode) || !canSubmit" @click="submitDraft">
                    <span class="material-icons">arrow_upward</span>
                  </button>
                </div>
              </div>
            </div>
          </footer>
          <button v-if="viewMode === 'floating' && !isCompactDialog" class="assistant-resize-handle" type="button" title="Resize window" aria-label="Resize assistant window" @pointerdown.stop.prevent="startResize">
            <span class="material-icons">drag_handle</span>
          </button>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { queryPracticeAssistant } from '@/api/assistant'
import type { AssistantCitation, AssistantHistoryItem, AssistantMode, AssistantQueryResponse, AssistantReviewItem, AttemptContext, RecentPracticeItem, SimilarQuestionRecommendation } from '@/types/assistant'

type ViewMode = 'floating' | 'fullscreen'
interface Copy { heroTitle: string; heroDescription: string; loading: string; reviewHint: string; closeTitle: string; viewTitle: string; quickActionsTitle: string; modeMenuTitle: string; uploadTitle: string; placeholder: Record<AssistantMode, string>; modeLabels: Record<AssistantMode, string>; actions: Record<AssistantMode, string>; actionDescriptions: Record<AssistantMode, string>; defaultQuery: Record<AssistantMode, string>; chunkTypeLabels: Record<string, string> }
interface Msg { id: string; role: 'user' | 'assistant'; content: string; citations?: AssistantCitation[]; followUps?: string[]; recommendedQuestions?: SimilarQuestionRecommendation[]; reviewItems?: AssistantReviewItem[]; isError?: boolean }
interface AttachmentItem { id: string; name: string; type: string; icon: string; extractedText?: string; note?: string }

const FLOATING_DIALOG_WIDTH = 480
const FLOATING_DIALOG_HEIGHT = 760
const COMPACT_DIALOG_BREAKPOINT = 520

const props = defineProps<{ questionId: string; questionTitle: string; hasSubmitted: boolean; attemptContext: AttemptContext | null; recentPractice: RecentPracticeItem[]; lang: 'zh' | 'en' }>()
const router = useRouter()
const route = useRoute()
const modes: AssistantMode[] = ['hint', 'explain', 'review', 'similar']
const modeIcons: Record<AssistantMode, string> = { hint: 'tips_and_updates', explain: 'menu_book', review: 'fact_check', similar: 'route' }
const zh: Copy = { heroTitle: 'How can I help you today?', heroDescription: 'Ask about the current passage and question set. I can give hints, explain the logic, review wrong answers, or recommend what to practice next.', loading: 'Building context from the current passage...', reviewHint: 'Review and similar mode unlock after you submit this attempt.', closeTitle: 'Close', viewTitle: 'Toggle window view', quickActionsTitle: 'Quick actions', modeMenuTitle: 'Change mode', uploadTitle: 'Upload files', placeholder: { hint: 'For example: point me to the best paragraph to start with, but do not reveal the answer', explain: 'For example: what is the right reasoning flow for this question set?', review: 'For example: why was my answer wrong and where is the evidence?', similar: 'For example: recommend the next two or three similar passages' }, modeLabels: { hint: 'Hint', explain: 'Explain', review: 'Review', similar: 'Similar' }, actions: { hint: 'Give me a hint', explain: 'Explain this set', review: 'Why was I wrong', similar: 'Recommend similar' }, actionDescriptions: { hint: 'Start with strategy, not the answer', explain: 'Break down the locating and reasoning path', review: 'Use your submission to explain the miss', similar: 'Recommend the next best matching set' }, defaultQuery: { hint: 'Give me a strategic hint for the current question set without revealing the final answer.', explain: 'Explain how to reason through the current question set using the passage.', review: 'Review my submitted attempt, explain why I was wrong, and point to the evidence.', similar: 'Recommend similar passages I should practice next.' }, chunkTypeLabels: { passage_paragraph: 'Passage paragraph', question_item: 'Question item', answer_key: 'Answer key', answer_explanation: 'Explanation', question_summary: 'Question summary' } }
const en: Copy = { heroTitle: 'How can I help you today?', heroDescription: 'Ask about the current passage and question set. I can give hints, explain the logic, review wrong answers, or recommend what to practice next.', loading: 'Building context from the current passage...', reviewHint: 'Review and similar mode unlock after you submit this attempt.', closeTitle: 'Close', viewTitle: 'Toggle window view', quickActionsTitle: 'Quick actions', modeMenuTitle: 'Change mode', uploadTitle: 'Upload files', placeholder: { hint: 'For example: point me to the best paragraph to start with, but do not reveal the answer', explain: 'For example: what is the right reasoning flow for this question set?', review: 'For example: why was my answer wrong and where is the evidence?', similar: 'For example: recommend the next two or three similar passages' }, modeLabels: { hint: 'Hint', explain: 'Explain', review: 'Review', similar: 'Similar' }, actions: { hint: 'Give me a hint', explain: 'Explain this set', review: 'Why was I wrong', similar: 'Recommend similar' }, actionDescriptions: { hint: 'Start with strategy, not the answer', explain: 'Break down the locating and reasoning path', review: 'Use your submission to explain the miss', similar: 'Recommend the next best matching set' }, defaultQuery: { hint: 'Give me a strategic hint for the current question set without revealing the final answer.', explain: 'Explain how to reason through the current question set using the passage.', review: 'Review my submitted attempt, explain why I was wrong, and point to the evidence.', similar: 'Recommend similar passages I should practice next.' }, chunkTypeLabels: { passage_paragraph: 'Passage paragraph', question_item: 'Question item', answer_key: 'Answer key', answer_explanation: 'Explanation', question_summary: 'Question summary' } }
const copy = computed(() => props.lang === 'en' ? en : zh)
const modeLabels = computed(() => copy.value.modeLabels)
const selectedMode = ref<AssistantMode>('hint')
const draft = ref('')
const history = ref<AssistantHistoryItem[]>([])
const messages = ref<Msg[]>([])
const status = ref<'idle' | 'loading' | 'success' | 'error'>('idle')
const isOpen = ref(false)
const viewMode = ref<ViewMode>('floating')
const modeMenuOpen = ref(false)
const composerFocused = ref(false)
const isComposing = ref(false)
const isDragging = ref(false)
const isResizing = ref(false)
const dragOffset = ref({ x: 0, y: 0 })
const resizeOrigin = ref({ x: 0, y: 0, width: FLOATING_DIALOG_WIDTH, height: FLOATING_DIALOG_HEIGHT })
const dialogPosition = ref<{ x: number; y: number } | null>(null)
const dialogSize = ref({ width: FLOATING_DIALOG_WIDTH, height: FLOATING_DIALOG_HEIGHT })
const attachments = ref<AttachmentItem[]>([])
const messageListRef = ref<HTMLDivElement | null>(null)
const composerRef = ref<HTMLTextAreaElement | null>(null)
const dialogRef = ref<HTMLElement | null>(null)
const fileInputRef = ref<HTMLInputElement | null>(null)
const isLoading = computed(() => status.value === 'loading')
const canSubmit = computed(() => draft.value.trim().length > 0 || attachments.value.length > 0)
const isCompactDialog = computed(() => viewMode.value === 'floating' && dialogSize.value.width <= COMPACT_DIALOG_BREAKPOINT)
const placeholder = computed(() => copy.value.placeholder[selectedMode.value])
const questionTitle = computed(() => props.questionTitle || 'IELTS Reading')
const actionCards = computed(() => modes.map((mode) => ({ mode, title: copy.value.actions[mode], description: copy.value.actionDescriptions[mode], icon: modeIcons[mode], disabled: isModeDisabled(mode) })))
const acceptedFileTypes = 'image/*,.pdf,.html,.htm,.txt,.md,.json,.csv,.xml,.js,.ts,.vue'
const dialogStyle = computed(() => {
  if (viewMode.value === 'fullscreen') {
    return {}
  }

  const sizeStyle = {
    width: `${dialogSize.value.width}px`,
    height: `${dialogSize.value.height}px`
  }

  if (!dialogPosition.value) {
    return sizeStyle
  }

  return {
    ...sizeStyle,
    left: `${dialogPosition.value.x}px`,
    top: `${dialogPosition.value.y}px`,
    right: 'auto',
    bottom: 'auto'
  }
})

function isModeDisabled(mode: AssistantMode) { return !props.hasSubmitted && (mode === 'review' || mode === 'similar') }
function resetMenus() { modeMenuOpen.value = false }
function createMessage(role: 'user' | 'assistant', content: string, extra: Pick<Msg, 'citations' | 'followUps' | 'recommendedQuestions' | 'reviewItems' | 'isError'> = {}): Msg { return { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, role, content, ...extra } }
function toggleDialog() { isOpen.value = !isOpen.value }
function closeDialog() { stopDrag(); stopResize(); isOpen.value = false }
function toggleViewMode() {
  stopDrag()
  stopResize()
  viewMode.value = viewMode.value === 'floating' ? 'fullscreen' : 'floating'
}
function toggleModeMenu() { modeMenuOpen.value = !modeMenuOpen.value }
function selectMode(mode: AssistantMode) { if (!isModeDisabled(mode)) selectedMode.value = mode; resetMenus() }
function defaultQuery(mode: AssistantMode) { return copy.value.defaultQuery[mode] }
function formatChunkType(chunkType: string) { return copy.value.chunkTypeLabels[chunkType] || chunkType.replace(/_/g, ' ') }
function reviewSummaryText(message: Msg) {
  if (!message.reviewItems?.length) return message.content?.trim() ?? ''
  return `${message.reviewItems.length} review cards are ready below.`
}
function reviewParagraphLabel(item: AssistantReviewItem) {
  if (!item.paragraphLabel) return ''
  return `Paragraph ${item.paragraphLabel}`
}
function reviewSelectedLabel(item: AssistantReviewItem) {
  return `Your answer: ${item.selectedAnswer}`
}
function reviewCorrectLabel(item: AssistantReviewItem) {
  return `Correct: ${item.correctAnswer}`
}
function reviewSectionTitle(type: 'explanation' | 'evidence') {
  return type === 'explanation' ? 'Explanation' : 'Evidence'
}
async function focusComposer() { await nextTick(); composerRef.value?.focus() }
async function scrollToBottom() { await nextTick(); if (messageListRef.value) messageListRef.value.scrollTop = messageListRef.value.scrollHeight }
function handleEscape(event: KeyboardEvent) { if (event.key === 'Escape') { if (modeMenuOpen.value) { resetMenus(); return } closeDialog() } }
function handleDocumentClick(event: MouseEvent) { const target = event.target as HTMLElement | null; if (!target?.closest('.menu-wrap')) resetMenus() }
function clampPosition(x: number, y: number) {
  const width = dialogSize.value.width
  const height = dialogSize.value.height
  const minLeft = 12
  const minTop = 12
  const maxLeft = Math.max(minLeft, window.innerWidth - width - 12)
  const maxTop = Math.max(minTop, window.innerHeight - height - 12)
  return {
    x: Math.min(Math.max(x, minLeft), maxLeft),
    y: Math.min(Math.max(y, minTop), maxTop)
  }
}
function clampSize(width: number, height: number) {
  const minWidth = 420
  const minHeight = 560
  const maxWidth = Math.max(minWidth, window.innerWidth - 24)
  const maxHeight = Math.max(minHeight, window.innerHeight - 24)
  return {
    width: Math.min(Math.max(width, minWidth), maxWidth),
    height: Math.min(Math.max(height, minHeight), maxHeight)
  }
}
function handleDragMove(event: PointerEvent) {
  if (!isDragging.value || viewMode.value === 'fullscreen') return
  const next = clampPosition(event.clientX - dragOffset.value.x, event.clientY - dragOffset.value.y)
  dialogPosition.value = next
}
function handleResizeMove(event: PointerEvent) {
  if (!isResizing.value || viewMode.value === 'fullscreen') return
  dialogSize.value = clampSize(
    resizeOrigin.value.width + (event.clientX - resizeOrigin.value.x),
    resizeOrigin.value.height + (event.clientY - resizeOrigin.value.y)
  )

  if (dialogPosition.value) {
    dialogPosition.value = clampPosition(dialogPosition.value.x, dialogPosition.value.y)
  }
}
function stopDrag() {
  isDragging.value = false
  if (typeof document !== 'undefined') {
    document.body.style.userSelect = ''
  }
  window.removeEventListener('pointermove', handleDragMove)
  window.removeEventListener('pointerup', stopDrag)
}
function stopResize() {
  isResizing.value = false
  if (typeof document !== 'undefined') {
    document.body.style.userSelect = ''
  }
  window.removeEventListener('pointermove', handleResizeMove)
  window.removeEventListener('pointerup', stopResize)
}
function startDrag(event: PointerEvent) {
  if (viewMode.value === 'fullscreen') return
  const target = event.target as HTMLElement | null
  if (target?.closest('button,input,textarea,.assistant-menu')) return
  const rect = dialogRef.value?.getBoundingClientRect()
  if (!rect) return
  event.preventDefault()
  dialogPosition.value = { x: rect.left, y: rect.top }
  dragOffset.value = { x: event.clientX - rect.left, y: event.clientY - rect.top }
  isDragging.value = true
  if (typeof document !== 'undefined') {
    document.body.style.userSelect = 'none'
  }
  window.addEventListener('pointermove', handleDragMove)
  window.addEventListener('pointerup', stopDrag)
}
function startResize(event: PointerEvent) {
  if (viewMode.value === 'fullscreen') return
  const rect = dialogRef.value?.getBoundingClientRect()
  if (!rect) return
  event.preventDefault()

  if (!dialogPosition.value) {
    dialogPosition.value = { x: rect.left, y: rect.top }
  }

  resizeOrigin.value = {
    x: event.clientX,
    y: event.clientY,
    width: rect.width,
    height: rect.height
  }
  isResizing.value = true

  if (typeof document !== 'undefined') {
    document.body.style.userSelect = 'none'
  }

  window.addEventListener('pointermove', handleResizeMove)
  window.addEventListener('pointerup', stopResize)
}
function inferAttachmentIcon(file: File) {
  if (file.type.startsWith('image/')) return 'image'
  if (file.type.includes('pdf') || file.name.toLowerCase().endsWith('.pdf')) return 'picture_as_pdf'
  if (file.type.includes('html') || /\.(html?|vue)$/i.test(file.name)) return 'html'
  return 'description'
}
function triggerFilePicker() {
  const input = fileInputRef.value
  if (!input) return
  try {
    if (typeof input.showPicker === 'function') {
      input.showPicker()
      return
    }
  } catch {
    // Fall back to click() when showPicker() is unavailable or blocked.
  }
  input.click()
}
function normalizeAttachmentText(file: File, text: string) {
  if (file.type.includes('html') || /\.(html?|vue)$/i.test(file.name)) {
    const doc = new DOMParser().parseFromString(text, 'text/html')
    return doc.body.textContent?.replace(/\s+/g, ' ').trim() || text
  }
  return text.replace(/\s+/g, ' ').trim()
}
async function readAttachment(file: File): Promise<AttachmentItem> {
  const lowerName = file.name.toLowerCase()
  const isTextLike = file.type.startsWith('text/') || file.type.includes('json') || /\.(txt|md|json|csv|xml|js|ts|vue|html?|htm)$/i.test(lowerName)
  let extractedText = ''
  let note = ''
  if (isTextLike) {
    const rawText = await file.text()
    extractedText = normalizeAttachmentText(file, rawText).slice(0, 6000)
  } else {
    note = `Attached file: ${file.name} (${file.type || 'unknown type'})`
  }
  return {
    id: `${file.name}-${file.lastModified}-${Math.random().toString(36).slice(2, 8)}`,
    name: file.name,
    type: file.type || 'application/octet-stream',
    icon: inferAttachmentIcon(file),
    extractedText,
    note
  }
}
async function handleFileSelection(event: Event) {
  const input = event.target as HTMLInputElement
  const files = Array.from(input.files || [])
  if (!files.length) return
  const nextAttachments = await Promise.all(files.map((file) => readAttachment(file)))
  attachments.value = [...attachments.value, ...nextAttachments]
  input.value = ''
}
function removeAttachment(id: string) {
  attachments.value = attachments.value.filter((attachment) => attachment.id !== id)
}
function buildPromptWithAttachments(userPrompt: string) {
  if (!attachments.value.length) return userPrompt
  const attachmentContext = attachments.value.map((attachment) => {
    if (attachment.extractedText) {
      return `Attachment: ${attachment.name}\n${attachment.extractedText}`
    }
    return attachment.note || `Attachment: ${attachment.name}`
  }).join('\n\n')
  return `${userPrompt}\n\nAttached files for context:\n${attachmentContext}`.trim()
}
function handleEnterSend() {
  if (isComposing.value) return
  submitDraft()
}
function syncListeners(open: boolean) { if (typeof document === 'undefined') return; document.removeEventListener('keydown', handleEscape); document.removeEventListener('click', handleDocumentClick); window.removeEventListener('pointermove', handleDragMove); window.removeEventListener('pointerup', stopDrag); window.removeEventListener('pointermove', handleResizeMove); window.removeEventListener('pointerup', stopResize); if (open) { document.addEventListener('keydown', handleEscape); document.addEventListener('click', handleDocumentClick) } }

async function sendMessage(mode: AssistantMode, userPrompt: string, userBubbleText?: string) {
  if (isModeDisabled(mode)) return
  isOpen.value = true
  resetMenus()
  selectedMode.value = mode
  status.value = 'loading'
  const historySeed = history.value.slice(-6)
  const bubbleText = userBubbleText || userPrompt
  const promptWithAttachments = buildPromptWithAttachments(userPrompt)
  messages.value = [...messages.value, createMessage('user', bubbleText)]
  await scrollToBottom()
  try {
    const response: AssistantQueryResponse = await queryPracticeAssistant({ questionId: props.questionId, mode, locale: props.lang, userQuery: promptWithAttachments, history: historySeed, attemptContext: props.hasSubmitted ? props.attemptContext ?? undefined : undefined, recentPractice: props.recentPractice.slice(0, 10) })
    messages.value = [...messages.value, createMessage('assistant', response.answer, { citations: response.citations, followUps: response.followUps, recommendedQuestions: response.recommendedQuestions, reviewItems: response.reviewItems })]
    history.value = [...historySeed, { role: 'user', content: bubbleText }, { role: 'assistant', content: response.answer }].slice(-6)
    status.value = 'success'
    attachments.value = []
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'Assistant is unavailable.'
    messages.value = [...messages.value, createMessage('assistant', detail, { isError: true })]
    status.value = 'error'
  } finally {
    await scrollToBottom()
    await focusComposer()
  }
}

function sendPreset(mode: AssistantMode) { void sendMessage(mode, defaultQuery(mode), copy.value.actions[mode]) }
function submitDraft() {
  const value = draft.value.trim()
  if (!value && attachments.value.length === 0) return
  const attachmentLabel = attachments.value.length > 0 ? `Attached: ${attachments.value.map((attachment) => attachment.name).join(', ')}` : ''
  const bubbleText = value || attachmentLabel
  const prompt = value || defaultQuery(selectedMode.value)
  draft.value = ''
  void sendMessage(selectedMode.value, prompt, bubbleText)
}
function openRecommendedQuestion(questionId: string) { router.push({ path: route.path, query: { ...route.query, id: questionId } }) }
watch(isOpen, async (open) => { syncListeners(open); if (open) { await scrollToBottom(); await focusComposer() } else resetMenus() })
watch(() => props.questionId, () => { history.value = []; messages.value = []; draft.value = ''; attachments.value = []; dialogPosition.value = null; dialogSize.value = { width: FLOATING_DIALOG_WIDTH, height: FLOATING_DIALOG_HEIGHT }; status.value = 'idle'; selectedMode.value = 'hint'; resetMenus() })
watch(() => props.hasSubmitted, (submitted) => { if (!submitted && (selectedMode.value === 'review' || selectedMode.value === 'similar')) selectedMode.value = 'hint' })
onUnmounted(() => { stopDrag(); stopResize(); syncListeners(false) })
</script>

<style scoped>
.assistant-fab {
  position: fixed;
  right: 24px;
  bottom: 28px;
  z-index: 1200;
  width: 56px;
  height: 56px;
  border: none;
  border-radius: 999px;
  background: linear-gradient(135deg, var(--primary-color), #4f7cff);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  box-shadow: 0 18px 38px rgba(37, 99, 235, 0.28);
  transition: transform 0.16s ease, box-shadow 0.16s ease;
}

.assistant-fab:hover {
  transform: translateY(-2px);
  box-shadow: 0 22px 42px rgba(37, 99, 235, 0.34);
}

.assistant-fab-badge {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 10px;
  height: 10px;
  border-radius: 999px;
  background: #22c55e;
  box-shadow: 0 0 0 4px rgba(34, 197, 94, 0.16);
}

.assistant-layer {
  position: fixed;
  inset: 0;
  z-index: 1190;
  pointer-events: none;
}

.assistant-dialog {
  position: fixed;
  right: 20px;
  bottom: 20px;
  pointer-events: auto;
  width: min(480px, calc(100vw - 40px));
  height: min(760px, calc(100vh - 40px));
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  background: var(--bg-primary);
  color: var(--text-primary);
  border: 1px solid var(--border-color);
  border-radius: 28px;
  box-shadow: 0 24px 60px rgba(15, 23, 42, 0.18);
  overflow: hidden;
}

.assistant-dialog.dragging {
  box-shadow: 0 28px 68px rgba(15, 23, 42, 0.24);
}

.assistant-dialog.resizing {
  box-shadow: 0 28px 68px rgba(15, 23, 42, 0.24);
}

.assistant-dialog.fullscreen {
  top: 20px;
  right: 20px;
  bottom: 20px;
  left: 20px;
  width: calc(100vw - 40px);
  height: calc(100vh - 40px);
  max-width: none;
  max-height: none;
}

.assistant-topbar,
.assistant-body,
.assistant-dock {
  padding-left: 22px;
  padding-right: 22px;
}

.assistant-topbar {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: flex-start;
  gap: 16px;
  padding-top: 18px;
  padding-bottom: 14px;
  border-bottom: 1px solid var(--border-light);
  cursor: grab;
  user-select: none;
  touch-action: none;
}

.assistant-dialog.dragging .assistant-topbar {
  cursor: grabbing;
}

.assistant-brand {
  display: flex;
  align-items: flex-start;
  gap: 14px;
  flex: 1 1 auto;
  width: 100%;
  min-width: 0;
}

.assistant-brand-icon {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--primary-color);
  background: linear-gradient(135deg, #eff6ff, #ffffff);
  border: 1px solid rgba(37, 99, 235, 0.14);
}

.assistant-brand-icon {
  width: 42px;
  height: 42px;
  border-radius: 999px;
  font-size: 22px;
}

.assistant-title-block {
  flex: 1 1 auto;
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
  padding-right: 4px;
}

.assistant-kicker {
  margin: 0 0 4px;
  color: var(--text-tertiary);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.assistant-title {
  margin: 0;
  max-width: 100%;
  font-size: 22px;
  line-height: 1.15;
  overflow: hidden;
  white-space: normal;
  overflow-wrap: anywhere;
  word-break: break-word;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.assistant-header-actions,
.assistant-left-actions,
.assistant-right-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.assistant-header-actions {
  flex-shrink: 0;
  padding-top: 0;
}

.menu-wrap {
  position: relative;
}

.icon-btn,
.assistant-send {
  border: none;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.icon-btn {
  width: 38px;
  height: 38px;
  border-radius: 12px;
  background: transparent;
  color: var(--text-secondary);
  transition: var(--transition);
}

.icon-btn.small {
  width: 34px;
  height: 34px;
  border-radius: 999px;
}

.icon-btn:hover {
  color: var(--text-primary);
  background: var(--bg-tertiary);
}

.assistant-body {
  overflow-y: auto;
  padding-top: 24px;
  padding-bottom: 18px;
}

.assistant-welcome {
  display: flex;
  flex-direction: column;
  gap: 22px;
  min-height: 100%;
  padding-top: 8px;
}

.assistant-hero-copy h3 {
  margin: 0;
  font-size: 30px;
  line-height: 1.1;
}

.assistant-hero-copy p {
  margin: 12px 0 0;
  color: var(--text-secondary);
  font-size: 15px;
  line-height: 1.72;
}

.assistant-suggestion-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.assistant-suggestion {
  border: none;
  background: transparent;
  padding: 10px 0;
  display: flex;
  align-items: center;
  gap: 14px;
  color: var(--text-primary);
  text-align: left;
  cursor: pointer;
}

.assistant-suggestion:disabled {
  opacity: 0.38;
  cursor: not-allowed;
}

.assistant-suggestion .material-icons {
  color: var(--text-secondary);
}

.assistant-suggestion-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.assistant-suggestion-text strong {
  font-size: 15px;
  font-weight: 700;
}

.assistant-suggestion-text small {
  font-size: 13px;
  color: var(--text-secondary);
}

.assistant-note {
  margin: 0;
  color: var(--text-tertiary);
  font-size: 13px;
}

.assistant-thread {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.assistant-message.user {
  display: flex;
  justify-content: flex-end;
}

.assistant-message.assistant {
  display: flex;
}

.assistant-user-chip {
  max-width: min(72%, 280px);
  padding: 14px 18px;
  border-radius: 999px;
  background: rgba(37, 99, 235, 0.1);
  color: var(--primary-color);
  font-size: 16px;
  font-weight: 700;
  line-height: 1.45;
}

.assistant-response {
  width: 100%;
  min-width: 0;
  padding: 6px 4px 0;
}

.assistant-message-text {
  margin: 0;
  color: var(--text-primary);
  font-size: 16px;
  line-height: 1.78;
  white-space: pre-wrap;
}

.assistant-message-text--summary {
  color: var(--text-secondary);
  font-size: 14px;
  line-height: 1.7;
}

.assistant-message.error .assistant-message-text {
  color: #b91c1c;
}

.review-panel {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.review-grid {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.review-card {
  padding: 16px;
  border-radius: 20px;
  border: 1px solid rgba(37, 99, 235, 0.14);
  background:
    linear-gradient(180deg, rgba(248, 251, 255, 0.98), rgba(255, 255, 255, 0.96)),
    radial-gradient(circle at top right, rgba(37, 99, 235, 0.12), transparent 42%);
  box-shadow: 0 16px 28px rgba(15, 23, 42, 0.06);
}

.review-card-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
  margin-bottom: 14px;
}

.review-card-meta,
.review-answer-stack {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.review-question-badge,
.review-paragraph-badge,
.review-answer-pill {
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
  line-height: 1;
}

.review-question-badge {
  padding: 8px 10px;
  background: rgba(15, 23, 42, 0.92);
  color: #ffffff;
  letter-spacing: 0.04em;
}

.review-paragraph-badge {
  padding: 8px 10px;
  border: 1px solid rgba(15, 23, 42, 0.08);
  background: rgba(255, 255, 255, 0.92);
  color: var(--text-secondary);
}

.review-answer-pill {
  padding: 8px 12px;
}

.review-answer-pill--mine {
  background: rgba(249, 115, 22, 0.1);
  color: #c2410c;
}

.review-answer-pill--correct {
  background: rgba(34, 197, 94, 0.12);
  color: #166534;
}

.review-card-section + .review-card-section {
  margin-top: 14px;
}

.review-card-section h4 {
  margin: 0 0 8px;
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--primary-color);
}

.review-card-section p,
.review-card-section blockquote {
  margin: 0;
  color: var(--text-primary);
  line-height: 1.72;
  white-space: pre-wrap;
  word-break: break-word;
  overflow-wrap: anywhere;
}

.review-card-section--evidence blockquote {
  padding: 12px 14px;
  border-left: 3px solid rgba(37, 99, 235, 0.28);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.86);
  color: var(--text-secondary);
}

.citation-list,
.recommend-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 16px;
}

.citation-card,
.recommend-card {
  padding: 12px 14px;
  border-radius: 16px;
  border: 1px solid var(--border-color);
  background: #f8fbff;
}

.citation-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 8px;
  color: var(--primary-color);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.citation-card p,
.recommend-card span {
  margin: 0;
  color: var(--text-secondary);
  line-height: 1.58;
}

.citation-card p {
  white-space: pre-wrap;
  word-break: break-word;
  overflow-wrap: anywhere;
}

.follow-up-list {
  margin: 16px 0 0;
  padding-left: 22px;
  color: var(--text-primary);
  line-height: 1.7;
}

.follow-up-list li + li {
  margin-top: 8px;
}

.recommend-card {
  text-align: left;
  cursor: pointer;
  transition: var(--transition);
}

.recommend-card:hover {
  border-color: rgba(37, 99, 235, 0.22);
  transform: translateY(-1px);
}

.recommend-card strong {
  display: block;
  margin-bottom: 6px;
  color: var(--text-primary);
}

.assistant-loading {
  display: flex;
  align-items: center;
  gap: 10px;
  color: var(--text-secondary);
}

.assistant-dock {
  padding-top: 14px;
  padding-bottom: 22px;
  border-top: 1px solid var(--border-light);
  background: rgba(255, 255, 255, 0.88);
  backdrop-filter: blur(10px);
}

.assistant-composer {
  padding: 14px 16px 12px;
  border-radius: 28px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  transition: var(--transition);
  min-width: 0;
}

.assistant-composer.focused,
.assistant-composer:hover {
  border-color: rgba(37, 99, 235, 0.35);
  box-shadow: 0 0 0 1px rgba(37, 99, 235, 0.12);
}

.assistant-context-chip {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  box-sizing: border-box;
  overflow: hidden;
  padding: 8px 12px;
  border-radius: 999px;
  border: 1px solid rgba(37, 99, 235, 0.12);
  background: #ffffff;
  color: var(--text-secondary);
  font-size: 13px;
  font-weight: 600;
}

.assistant-context-chip span:first-child {
  flex-shrink: 0;
}

.assistant-context-chip span:last-child {
  flex: 1 1 auto;
  min-width: 0;
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.assistant-context-name {
  display: block;
  width: 0;
  flex: 1 1 auto;
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.assistant-file-input {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  border: 0;
  opacity: 0;
  overflow: hidden;
  clip: rect(0 0 0 0);
  clip-path: inset(50%);
  pointer-events: none;
}

.assistant-upload-trigger {
  position: relative;
  overflow: hidden;
}

.assistant-attachments {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
}

.assistant-attachment-chip {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  max-width: 100%;
  padding: 6px 10px;
  border-radius: 999px;
  background: #ffffff;
  border: 1px solid rgba(37, 99, 235, 0.12);
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 600;
}

.assistant-attachment-name {
  min-width: 0;
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 220px;
}

.assistant-attachment-remove {
  border: none;
  background: transparent;
  color: var(--text-tertiary);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  padding: 0;
  cursor: pointer;
}

.assistant-attachment-remove .material-icons {
  font-size: 16px;
}

.assistant-input {
  width: 100%;
  min-height: 108px;
  margin-top: 14px;
  border: none;
  resize: none;
  background: transparent;
  color: var(--text-primary);
  font: inherit;
  font-size: 17px;
  line-height: 1.68;
}

.assistant-input::placeholder {
  color: var(--text-tertiary);
}

.assistant-input:focus {
  outline: none;
}

.assistant-composer-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 6px;
}

.assistant-left-actions,
.assistant-right-actions {
  min-width: 0;
}

.assistant-dialog.compact .assistant-topbar,
.assistant-dialog.compact .assistant-body,
.assistant-dialog.compact .assistant-dock {
  padding-left: 16px;
  padding-right: 16px;
}

.assistant-dialog.compact .assistant-topbar {
  gap: 12px;
  padding-top: 16px;
  padding-bottom: 12px;
}

.assistant-dialog.compact .assistant-brand {
  gap: 12px;
}

.assistant-dialog.compact .assistant-brand-icon {
  width: 36px;
  height: 36px;
  font-size: 18px;
}

.assistant-dialog.compact .assistant-kicker {
  margin-bottom: 3px;
  font-size: 10px;
}

.assistant-dialog.compact .assistant-title {
  font-size: 18px;
  line-height: 1.18;
  -webkit-line-clamp: 3;
}

.assistant-dialog.compact .icon-btn {
  width: 34px;
  height: 34px;
}

.assistant-dialog.compact .assistant-body {
  padding-top: 18px;
  padding-bottom: 14px;
}

.assistant-dialog.compact .assistant-welcome {
  gap: 18px;
}

.assistant-dialog.compact .assistant-hero-copy h3 {
  font-size: 22px;
}

.assistant-dialog.compact .assistant-hero-copy p {
  margin-top: 10px;
  font-size: 14px;
  line-height: 1.62;
}

.assistant-dialog.compact .assistant-suggestion {
  gap: 12px;
  padding: 8px 0;
}

.assistant-dialog.compact .assistant-suggestion-text strong {
  font-size: 14px;
}

.assistant-dialog.compact .assistant-suggestion-text small,
.assistant-dialog.compact .assistant-note {
  font-size: 12px;
}

.assistant-dialog.compact .assistant-user-chip {
  max-width: min(86%, 300px);
  padding: 12px 16px;
  font-size: 15px;
}

.assistant-dialog.compact .assistant-message-text {
  font-size: 15px;
  line-height: 1.72;
}

.assistant-dialog.compact .review-card {
  padding: 14px;
}

.assistant-dialog.compact .assistant-dock {
  padding-top: 12px;
  padding-bottom: 18px;
}

.assistant-dialog.compact .assistant-composer {
  padding: 12px 12px 10px;
  border-radius: 24px;
}

.assistant-dialog.compact .assistant-context-chip {
  padding: 8px 10px;
  font-size: 12px;
}

.assistant-dialog.compact .assistant-attachments {
  gap: 6px;
  margin-top: 10px;
}

.assistant-dialog.compact .assistant-attachment-name {
  max-width: 168px;
}

.assistant-dialog.compact .assistant-input {
  min-height: 92px;
  margin-top: 12px;
  font-size: 15px;
  line-height: 1.62;
}

.assistant-dialog.compact .assistant-composer-footer {
  gap: 10px;
  padding-right: 6px;
}

.assistant-dialog.compact .assistant-mode-badge {
  font-size: 12px;
}

.assistant-dialog.compact .assistant-menu {
  min-width: 200px;
}

.assistant-dialog.compact .assistant-resize-handle {
  right: 12px;
  bottom: 12px;
  width: 22px;
  height: 22px;
}

.assistant-dialog.compact .assistant-resize-handle .material-icons {
  font-size: 16px;
}

.assistant-mode-badge {
  color: var(--text-secondary);
  font-size: 13px;
  font-weight: 700;
}

.assistant-send {
  width: 42px;
  height: 42px;
  border-radius: 999px;
  background: linear-gradient(135deg, var(--primary-color), #4f7cff);
  color: white;
}

.assistant-send:disabled {
  background: #d1d5db;
  cursor: not-allowed;
}

.assistant-menu {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  z-index: 4;
  min-width: 220px;
  padding: 8px;
  border-radius: 18px;
  border: 1px solid var(--border-color);
  background: var(--bg-primary);
  box-shadow: 0 16px 34px rgba(15, 23, 42, 0.18);
}

.assistant-menu.up {
  top: auto;
  bottom: calc(100% + 10px);
  left: 0;
  right: auto;
}

.assistant-menu-item {
  width: 100%;
  border: none;
  background: transparent;
  color: var(--text-primary);
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border-radius: 12px;
  font-size: 14px;
  text-align: left;
  cursor: pointer;
}

.assistant-menu-item:hover,
.assistant-menu-item.active {
  background: var(--bg-secondary);
}

.assistant-menu-item:disabled {
  opacity: 0.38;
  cursor: not-allowed;
}

.assistant-menu-item .material-icons:last-child {
  margin-left: auto;
}

.assistant-resize-handle {
  position: absolute;
  right: 14px;
  bottom: 14px;
  z-index: 3;
  width: 24px;
  height: 24px;
  border: none;
  border-radius: 10px;
  background: rgba(37, 99, 235, 0.06);
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: nwse-resize;
}

.assistant-resize-handle .material-icons {
  font-size: 18px;
  transform: rotate(-45deg);
}

.loading-icon {
  animation: spin 1s linear infinite;
}

.assistant-shell-enter-active,
.assistant-shell-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.assistant-shell-enter-from,
.assistant-shell-leave-to {
  opacity: 0;
  transform: translateY(8px);
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 900px) {
  .assistant-dialog,
  .assistant-dialog.fullscreen {
    top: 10px;
    right: 10px;
    bottom: 10px;
    left: 10px;
    width: calc(100vw - 20px);
    height: calc(100vh - 20px);
    border-radius: 24px;
  }

  .assistant-topbar,
  .assistant-body,
  .assistant-dock {
    padding-left: 16px;
    padding-right: 16px;
  }

  .assistant-title {
    font-size: 18px;
    -webkit-line-clamp: 3;
  }

  .assistant-hero-copy h3 {
    font-size: 24px;
  }

  .assistant-input {
    min-height: 90px;
    font-size: 15px;
  }

  .review-card-header {
    flex-direction: column;
  }
}
</style>



 
 
