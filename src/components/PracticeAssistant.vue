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
                <h2 class="assistant-brand-title">{{ copy.kicker }}</h2>
              </div>
            </div>
            <div class="assistant-header-actions">
              <button class="icon-btn" type="button" :title="viewButtonTitle" @pointerdown.stop @click="toggleViewMode">
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
                  <div v-if="message.usedQuestionNumbers?.length || message.usedParagraphLabels?.length || message.confidence || message.missingContext?.length" class="assistant-response-meta">
                    <span v-if="message.usedQuestionNumbers?.length" class="assistant-meta-chip">Q{{ message.usedQuestionNumbers.join(', ') }}</span>
                    <span v-if="message.usedParagraphLabels?.length" class="assistant-meta-chip">{{ responseParagraphLabel(message.usedParagraphLabels) }}</span>
                    <span v-if="message.confidence" class="assistant-meta-chip">{{ confidenceLabel(message.confidence) }}</span>
                  </div>
                  <div v-if="message.answerSections?.length" class="assistant-section-list">
                    <section v-for="(section, sectionIndex) in message.answerSections" :key="`section-${sectionIndex}`" class="assistant-section-card">
                      <p class="assistant-section-kicker">{{ answerSectionTitle(section.type) }}</p>
                      <p class="assistant-message-text">{{ section.text }}</p>
                    </section>
                  </div>
                  <p v-else-if="!message.reviewItems?.length" class="assistant-message-text">{{ message.content }}</p>
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
                          <p>{{ item.explanation || copy.reviewFallbackExplanation }}</p>
                        </div>
                        <div class="review-card-section review-card-section--evidence">
                          <h4>{{ reviewSectionTitle('evidence') }}</h4>
                          <blockquote>{{ item.evidence || copy.reviewFallbackEvidence }}</blockquote>
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
                  <div v-if="message.missingContext?.length" class="missing-context-list">
                    <p v-for="item in message.missingContext" :key="item" class="missing-context-item">{{ item }}</p>
                  </div>
                  <div v-if="message.followUps?.length" class="follow-up-list">
                    <button v-for="followUp in message.followUps" :key="followUp" class="follow-up-chip" type="button" :disabled="isLoading" @click="sendFollowUp(followUp)">
                      {{ followUp }}
                    </button>
                  </div>
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
              <div class="assistant-context-chip" :title="questionTitleTooltip">
                <span class="material-icons">description</span>
                <span class="assistant-context-name">{{ contextChipTitle }}</span>
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
          <button v-if="viewMode === 'floating' && !isCompactDialog" class="assistant-resize-handle" type="button" :title="copy.resizeTitle" :aria-label="copy.resizeAria" @pointerdown.stop.prevent="startResize">
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
import type {
  AssistantAnswerSection,
  AssistantAttachment,
  AssistantCitation,
  AssistantConfidence,
  AssistantHistoryItem,
  AssistantMode,
  AssistantQueryResponse,
  AssistantReviewItem,
  AttemptContext,
  RecentPracticeItem,
  SimilarQuestionRecommendation
} from '@/types/assistant'

type ViewMode = 'floating' | 'fullscreen'
interface Copy {
  kicker: string
  heroTitle: string
  heroDescription: string
  loading: string
  reviewHint: string
  closeTitle: string
  expandTitle: string
  collapseTitle: string
  quickActionsTitle: string
  modeMenuTitle: string
  uploadTitle: string
  resizeTitle: string
  resizeAria: string
  defaultQuestionTitle: string
  fallbackUnavailable: string
  reviewFallbackExplanation: string
  reviewFallbackEvidence: string
  placeholder: Record<AssistantMode, string>
  modeLabels: Record<AssistantMode, string>
  actions: Record<AssistantMode, string>
  actionDescriptions: Record<AssistantMode, string>
  defaultQuery: Record<AssistantMode, string>
  chunkTypeLabels: Record<string, string>
  reviewSummary: (count: number) => string
  reviewParagraph: (label: string) => string
  reviewSelected: (answer: string) => string
  reviewCorrect: (answer: string) => string
  reviewSectionTitles: Record<'explanation' | 'evidence', string>
  attachmentSummary: (names: string[]) => string
  attachmentNote: (name: string, type: string) => string
}
interface Msg {
  id: string
  role: 'user' | 'assistant'
  content: string
  citations?: AssistantCitation[]
  followUps?: string[]
  recommendedQuestions?: SimilarQuestionRecommendation[]
  reviewItems?: AssistantReviewItem[]
  answerSections?: AssistantAnswerSection[]
  usedQuestionNumbers?: string[]
  usedParagraphLabels?: string[]
  confidence?: AssistantConfidence
  missingContext?: string[]
  isError?: boolean
}

interface AttachmentItem {
  id: string
  name: string
  type: string
  icon: string
  extractedText?: string
  note?: string
  truncated?: boolean
}

const FLOATING_DIALOG_WIDTH = 500
const FLOATING_DIALOG_HEIGHT = 760
const COMPACT_DIALOG_BREAKPOINT = 480
const FLOATING_DIALOG_MIN_WIDTH = 496

const props = defineProps<{ questionId: string; questionTitle: string; questionTitleLocalized?: string; hasSubmitted: boolean; attemptContext: AttemptContext | null; recentPractice: RecentPracticeItem[]; lang: 'zh' | 'en' }>()
const router = useRouter()
const route = useRoute()
const modes: AssistantMode[] = ['hint', 'explain', 'review', 'similar']
const modeIcons: Record<AssistantMode, string> = { hint: 'tips_and_updates', explain: 'menu_book', review: 'fact_check', similar: 'route' }
const zh: Copy = {
  kicker: 'AI 助教',
  heroTitle: '今天想让我帮你什么？',
  heroDescription: '可以直接问当前文章和题组。我可以给提示、解释推理路径、复盘错题，或推荐下一步练习。',
  loading: '正在结合当前文章整理上下文...',
  reviewHint: '提交本次作答后，可解锁讲评和相似推荐模式。',
  closeTitle: '关闭',
  expandTitle: '切换为大窗口',
  collapseTitle: '切换为小窗口',
  quickActionsTitle: '快捷操作',
  modeMenuTitle: '切换模式',
  uploadTitle: '上传文件',
  resizeTitle: '拖动调整窗口大小',
  resizeAria: '调整小助手窗口大小',
  defaultQuestionTitle: 'IELTS 阅读',
  fallbackUnavailable: '小助手暂时不可用。',
  reviewFallbackExplanation: '暂未提取到详细解析。',
  reviewFallbackEvidence: '暂未提取到明确证据。',
  placeholder: {
    hint: '例如：先告诉我应该从哪一段入手，但不要直接给答案',
    explain: '例如：这组题的定位和推理顺序应该怎么走？',
    review: '例如：我为什么错了，证据在哪一段？',
    similar: '例如：推荐两三篇下一步适合练习的相似文章'
  },
  modeLabels: { hint: '提示', explain: '讲解', review: '复盘', similar: '相似' },
  actions: { hint: '给我一个提示', explain: '讲解这组题', review: '我为什么错了', similar: '推荐相似练习' },
  actionDescriptions: {
    hint: '先给策略，不直接揭晓答案',
    explain: '拆解定位顺序和推理路径',
    review: '结合我的作答解释错因',
    similar: '推荐下一组最匹配的练习'
  },
  defaultQuery: {
    hint: '请先给我当前题组的解题策略提示，但不要直接揭晓最终答案。',
    explain: '请结合文章内容，讲解这组题的定位顺序和推理过程。',
    review: '请结合我已提交的作答，解释我为什么出错，并指出证据所在。',
    similar: '请推荐我下一步适合练习的相似文章。'
  },
  chunkTypeLabels: {
    passage_paragraph: '文章段落',
    question_item: '题目内容',
    answer_key: '答案',
    answer_explanation: '答案解析',
    question_summary: '题目概述'
  },
  reviewSummary: (count) => `已生成 ${count} 张讲评卡片。`,
  reviewParagraph: (label) => `段落 ${label}`,
  reviewSelected: (answer) => `你的答案：${answer}`,
  reviewCorrect: (answer) => `正确答案：${answer}`,
  reviewSectionTitles: { explanation: '解析', evidence: '证据' },
  attachmentSummary: (names) => `已附加：${names.join('、')}`,
  attachmentNote: (name, type) => `已附加文件：${name} (${type || '未知类型'})`
}
const en: Copy = {
  kicker: 'AI Coach',
  heroTitle: 'How can I help you today?',
  heroDescription: 'Ask about the current passage and question set. I can give hints, explain the logic, review wrong answers, or recommend what to practice next.',
  loading: 'Building context from the current passage...',
  reviewHint: 'Review and similar mode unlock after you submit this attempt.',
  closeTitle: 'Close',
  expandTitle: 'Expand assistant',
  collapseTitle: 'Return to floating window',
  quickActionsTitle: 'Quick actions',
  modeMenuTitle: 'Change mode',
  uploadTitle: 'Upload files',
  resizeTitle: 'Resize window',
  resizeAria: 'Resize assistant window',
  defaultQuestionTitle: 'IELTS Reading',
  fallbackUnavailable: 'Assistant is unavailable.',
  reviewFallbackExplanation: 'Detailed explanation was not extracted.',
  reviewFallbackEvidence: 'Explicit source evidence was not extracted.',
  placeholder: {
    hint: 'For example: point me to the best paragraph to start with, but do not reveal the answer',
    explain: 'For example: what is the right reasoning flow for this question set?',
    review: 'For example: why was my answer wrong and where is the evidence?',
    similar: 'For example: recommend the next two or three similar passages'
  },
  modeLabels: { hint: 'Hint', explain: 'Explain', review: 'Review', similar: 'Similar' },
  actions: { hint: 'Give me a hint', explain: 'Explain this set', review: 'Why was I wrong', similar: 'Recommend similar' },
  actionDescriptions: {
    hint: 'Start with strategy, not the answer',
    explain: 'Break down the locating and reasoning path',
    review: 'Use your submission to explain the miss',
    similar: 'Recommend the next best matching set'
  },
  defaultQuery: {
    hint: 'Give me a strategic hint for the current question set without revealing the final answer.',
    explain: 'Explain how to reason through the current question set using the passage.',
    review: 'Review my submitted attempt, explain why I was wrong, and point to the evidence.',
    similar: 'Recommend similar passages I should practice next.'
  },
  chunkTypeLabels: {
    passage_paragraph: 'Passage paragraph',
    question_item: 'Question item',
    answer_key: 'Answer key',
    answer_explanation: 'Explanation',
    question_summary: 'Question summary'
  },
  reviewSummary: (count) => `${count} review cards are ready below.`,
  reviewParagraph: (label) => `Paragraph ${label}`,
  reviewSelected: (answer) => `Your answer: ${answer}`,
  reviewCorrect: (answer) => `Correct: ${answer}`,
  reviewSectionTitles: { explanation: 'Explanation', evidence: 'Evidence' },
  attachmentSummary: (names) => `Attached: ${names.join(', ')}`,
  attachmentNote: (name, type) => `Attached file: ${name} (${type || 'unknown type'})`
}
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
const resizeOrigin = ref({ x: 0, y: 0, left: 0, top: 0, width: FLOATING_DIALOG_WIDTH, height: FLOATING_DIALOG_HEIGHT })
const dialogPosition = ref<{ x: number; y: number } | null>(null)
const dialogSize = ref({ width: FLOATING_DIALOG_WIDTH, height: FLOATING_DIALOG_HEIGHT })
const attachments = ref<AttachmentItem[]>([])
const lastFocusQuestionNumbers = ref<string[] | undefined>(undefined)
const messageListRef = ref<HTMLDivElement | null>(null)
const composerRef = ref<HTMLTextAreaElement | null>(null)
const dialogRef = ref<HTMLElement | null>(null)
const fileInputRef = ref<HTMLInputElement | null>(null)
const isLoading = computed(() => status.value === 'loading')
const canSubmit = computed(() => draft.value.trim().length > 0 || attachments.value.length > 0)
const isCompactDialog = computed(() => viewMode.value === 'floating' && dialogSize.value.width <= COMPACT_DIALOG_BREAKPOINT)
const placeholder = computed(() => copy.value.placeholder[selectedMode.value])
const viewButtonTitle = computed(() => viewMode.value === 'floating' ? copy.value.expandTitle : copy.value.collapseTitle)
const fullQuestionTitle = computed(() => props.questionTitle?.trim() || props.questionTitleLocalized?.trim() || copy.value.defaultQuestionTitle)
const localizedQuestionTitle = computed(() => props.questionTitleLocalized?.trim() || fullQuestionTitle.value)
const floatingQuestionTitle = computed(() => props.lang === 'zh' ? localizedQuestionTitle.value : fullQuestionTitle.value)
const contextChipTitle = computed(() => floatingQuestionTitle.value)
const questionTitleTooltip = computed(() => {
  if (props.lang === 'zh' && props.questionTitleLocalized?.trim() && props.questionTitle?.trim() && props.questionTitleLocalized.trim() !== props.questionTitle.trim()) {
    return `${props.questionTitleLocalized.trim()}\n${props.questionTitle.trim()}`
  }
  return fullQuestionTitle.value
})
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
function createMessage(
  role: 'user' | 'assistant',
  content: string,
  extra: Partial<Pick<Msg, 'citations' | 'followUps' | 'recommendedQuestions' | 'reviewItems' | 'answerSections' | 'usedQuestionNumbers' | 'usedParagraphLabels' | 'confidence' | 'missingContext' | 'isError'>> = {}
): Msg {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    role,
    content,
    ...extra,
    citations: normalizeCitationsForDisplay(extra.citations)
  }
}
function toggleDialog() {
  isOpen.value = !isOpen.value
  // 移动端自动全屏显示
  if (isOpen.value && window.innerWidth <= 480) {
    viewMode.value = 'fullscreen'
  }
}
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
  return copy.value.reviewSummary(message.reviewItems.length)
}
function reviewParagraphLabel(item: AssistantReviewItem) {
  if (!item.paragraphLabel) return ''
  return copy.value.reviewParagraph(item.paragraphLabel)
}
function reviewSelectedLabel(item: AssistantReviewItem) {
  return copy.value.reviewSelected(item.selectedAnswer)
}
function reviewCorrectLabel(item: AssistantReviewItem) {
  return copy.value.reviewCorrect(item.correctAnswer)
}
function reviewSectionTitle(type: 'explanation' | 'evidence') {
  return copy.value.reviewSectionTitles[type]
}
function answerSectionTitle(type: AssistantAnswerSection['type']) {
  if (props.lang === 'en') {
    return {
      direct_answer: 'Direct Answer',
      reasoning: 'Reasoning',
      evidence: 'Evidence',
      next_step: 'Next Step'
    }[type]
  }

  return {
    direct_answer: '直接判断',
    reasoning: '推理路径',
    evidence: '证据锚点',
    next_step: '下一步'
  }[type]
}
function responseParagraphLabel(labels: string[]) {
  return props.lang === 'en' ? `Paragraph ${labels.join(', ')}` : `段落 ${labels.join('、')}`
}
function confidenceLabel(confidence: AssistantConfidence) {
  if (props.lang === 'en') {
    return {
      high: 'High confidence',
      medium: 'Medium confidence',
      low: 'Low confidence'
    }[confidence]
  }

  return {
    high: '高把握',
    medium: '中等把握',
    low: '低把握'
  }[confidence]
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
  const maxWidth = Math.max(320, window.innerWidth - 24)
  const maxHeight = Math.max(360, window.innerHeight - 24)
  const minWidth = Math.min(FLOATING_DIALOG_MIN_WIDTH, maxWidth)
  const minHeight = Math.min(560, maxHeight)
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
  const nextSize = clampSize(
    resizeOrigin.value.width - (event.clientX - resizeOrigin.value.x),
    resizeOrigin.value.height - (event.clientY - resizeOrigin.value.y)
  )

  dialogSize.value = nextSize
  dialogPosition.value = clampPosition(
    resizeOrigin.value.left + (resizeOrigin.value.width - nextSize.width),
    resizeOrigin.value.top + (resizeOrigin.value.height - nextSize.height)
  )
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
    left: rect.left,
    top: rect.top,
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
  let truncated = false
  if (isTextLike) {
    const rawText = await file.text()
    const normalizedText = normalizeAttachmentText(file, rawText)
    truncated = normalizedText.length > 6000
    extractedText = normalizedText.slice(0, 6000)
  } else {
    note = copy.value.attachmentNote(file.name, file.type)
  }
  return {
    id: `${file.name}-${file.lastModified}-${Math.random().toString(36).slice(2, 8)}`,
    name: file.name,
    type: file.type || 'application/octet-stream',
    icon: inferAttachmentIcon(file),
    extractedText,
    note,
    truncated
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
function buildRequestAttachments(): AssistantAttachment[] | undefined {
  if (!attachments.value.length) return undefined
  return attachments.value.map((attachment) => ({
    name: attachment.name,
    type: attachment.type,
    text: attachment.extractedText || undefined,
    truncated: attachment.truncated || undefined
  }))
}
function extractFocusQuestionNumbersFromText(value: string): string[] | undefined {
  const matches = [
    ...Array.from(value.matchAll(/\b(?:question|questions|q)\s*(\d{1,3})\b/gi)).map((match) => match[1]),
    ...Array.from(value.matchAll(/第\s*(\d{1,3})\s*题/g)).map((match) => match[1])
  ]
  const combined = [...matches, ...(props.attemptContext?.wrongQuestions ?? [])]
  const unique = Array.from(new Set(combined))
  return unique.length ? unique.slice(0, 8) : undefined
}
function normalizeFocusQuestionNumbers(values?: string[]): string[] | undefined {
  if (!values?.length) return undefined
  const unique = Array.from(new Set(values.filter((value) => /^\d{1,3}$/.test(value))))
  return unique.length ? unique.slice(0, 4) : undefined
}
function extractExplicitFocusQuestionNumbers(value: string): string[] | undefined {
  const matches = [
    ...Array.from(value.matchAll(/\b(?:question|questions|q)\s*(\d{1,3})\b/gi)).map((match) => match[1]),
    ...Array.from(value.matchAll(/\u7B2C\s*(\d{1,3})\s*\u9898/g)).map((match) => match[1]),
    ...Array.from(value.matchAll(/(?:^|[^\d])(\d{1,3})\s*\u9898/g)).map((match) => match[1])
  ]
  return normalizeFocusQuestionNumbers(matches)
}
function isWholeSetRequest(value: string): boolean {
  return /(?:question set|whole set|all questions|entire passage|full passage|整组|整套|全部题目|所有题目|整篇|全文)/i.test(value)
}
function resolveFocusQuestionNumbers(userPrompt: string): string[] | undefined {
  const explicit = extractExplicitFocusQuestionNumbers(userPrompt)
  if (explicit?.length) return explicit
  if (isWholeSetRequest(userPrompt)) return undefined
  return normalizeFocusQuestionNumbers(lastFocusQuestionNumbers.value)
}
function trimCitationExcerpt(value: string): string {
  const normalized = value.replace(/\s+/g, ' ').trim()
  if (normalized.length <= 180) return normalized
  return `${normalized.slice(0, 177).trimEnd()}...`
}
function normalizeCitationsForDisplay(citations?: AssistantCitation[]): AssistantCitation[] | undefined {
  if (!citations?.length) return undefined
  const relevant = citations.some((citation) => citation.chunkType !== 'question_item')
    ? citations.filter((citation) => citation.chunkType !== 'question_item')
    : citations
  const deduped = Array.from(new Map(
    relevant.map((citation) => [
      `${citation.chunkType}:${citation.questionNumbers?.join(',') || ''}:${citation.paragraphLabels?.join(',') || ''}:${trimCitationExcerpt(citation.excerpt)}`,
      {
        ...citation,
        excerpt: trimCitationExcerpt(citation.excerpt)
      }
    ])
  ).values())
  return deduped.slice(0, 2)
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
  const focusQuestionNumbers = resolveFocusQuestionNumbers(userPrompt)
  messages.value = [...messages.value, createMessage('user', bubbleText)]
  await scrollToBottom()
  try {
    const response: AssistantQueryResponse = await queryPracticeAssistant({
      questionId: props.questionId,
      mode,
      locale: props.lang,
      userQuery: userPrompt,
      history: historySeed,
      attachments: buildRequestAttachments(),
      focusQuestionNumbers,
      attemptContext: props.attemptContext ?? undefined,
      recentPractice: props.recentPractice.slice(0, 10)
    })
    messages.value = [...messages.value, createMessage('assistant', response.answer, {
      citations: response.citations,
      followUps: response.followUps,
      recommendedQuestions: response.recommendedQuestions,
      reviewItems: response.reviewItems,
      answerSections: response.answerSections,
      usedQuestionNumbers: response.usedQuestionNumbers,
      usedParagraphLabels: response.usedParagraphLabels,
      confidence: response.confidence,
      missingContext: response.missingContext
    })]
    lastFocusQuestionNumbers.value = normalizeFocusQuestionNumbers(response.usedQuestionNumbers) || focusQuestionNumbers
    history.value = [...historySeed, { role: 'user', content: bubbleText }, { role: 'assistant', content: response.answer }].slice(-6)
    status.value = 'success'
  } catch (error) {
    const detail = error instanceof Error ? error.message : copy.value.fallbackUnavailable
    messages.value = [...messages.value, createMessage('assistant', detail, { isError: true })]
    status.value = 'error'
  } finally {
    await scrollToBottom()
    await focusComposer()
  }
}

function sendPreset(mode: AssistantMode) { void sendMessage(mode, defaultQuery(mode), copy.value.actions[mode]) }
function sendFollowUp(followUp: string) { void sendMessage(selectedMode.value, followUp, followUp) }
function submitDraft() {
  const value = draft.value.trim()
  if (!value && attachments.value.length === 0) return
  const attachmentLabel = attachments.value.length > 0 ? copy.value.attachmentSummary(attachments.value.map((attachment) => attachment.name)) : ''
  const bubbleText = value || attachmentLabel
  const prompt = value || defaultQuery(selectedMode.value)
  draft.value = ''
  void sendMessage(selectedMode.value, prompt, bubbleText)
}
function openRecommendedQuestion(questionId: string) { router.push({ path: route.path, query: { ...route.query, id: questionId } }) }
watch(isOpen, async (open) => { syncListeners(open); if (open) { await scrollToBottom(); await focusComposer() } else resetMenus() })
watch(() => props.questionId, () => { history.value = []; messages.value = []; draft.value = ''; attachments.value = []; lastFocusQuestionNumbers.value = undefined; dialogPosition.value = null; dialogSize.value = { width: FLOATING_DIALOG_WIDTH, height: FLOATING_DIALOG_HEIGHT }; status.value = 'idle'; selectedMode.value = 'hint'; resetMenus() })
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
  width: min(500px, calc(100vw - 40px));
  height: min(760px, calc(100vh - 40px));
  max-height: calc(100vh - 40px);
  min-width: 280px;
  min-height: 320px;
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

.assistant-dialog:not(.fullscreen) .assistant-topbar {
  padding-top: 18px;
  padding-bottom: 16px;
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
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  padding-left: 22px;
  padding-right: 22px;
}

.assistant-topbar {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 16px;
  padding-top: 18px;
  padding-bottom: 16px;
  background: linear-gradient(180deg, rgba(248, 251, 255, 0.98), rgba(255, 255, 255, 0.92));
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
  align-items: center;
  gap: 12px;
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
  width: 44px;
  height: 44px;
  border-radius: 16px;
  font-size: 20px;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.7);
}

.assistant-title-block {
  flex: 1 1 auto;
  display: flex;
  align-items: center;
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
  padding-right: 4px;
}

.assistant-brand-title {
  margin: 0;
  color: var(--text-primary);
  font-size: 20px;
  font-weight: 800;
  line-height: 1.1;
  letter-spacing: -0.03em;
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

.assistant-title--floating {
  display: block;
  font-size: 18px;
  line-height: 1.2;
  white-space: nowrap;
  text-overflow: ellipsis;
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
  padding-top: 20px;
  padding-bottom: 16px;
}

.assistant-welcome {
  display: flex;
  flex-direction: column;
  gap: 18px;
  min-height: 100%;
  padding-top: 0;
}

.assistant-hero-copy h3 {
  margin: 0;
  font-size: 26px;
  line-height: 1.08;
}

.assistant-hero-copy p {
  margin: 10px 0 0;
  color: var(--text-secondary);
  font-size: 14px;
  line-height: 1.62;
  max-width: 44ch;
}

.assistant-suggestion-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.assistant-suggestion {
  border: none;
  background: transparent;
  padding: 8px 0;
  display: flex;
  align-items: center;
  gap: 12px;
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
  font-size: 12px;
  line-height: 1.55;
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
  padding: 2px 0 0;
}

.assistant-response-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 12px;
}

.assistant-meta-chip {
  display: inline-flex;
  align-items: center;
  padding: 6px 10px;
  border-radius: 999px;
  background: rgba(37, 99, 235, 0.08);
  color: var(--primary-color);
  font-size: 12px;
  font-weight: 700;
}

.assistant-section-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.assistant-section-card {
  padding: 12px 14px;
  border-radius: 16px;
  border: 1px solid rgba(37, 99, 235, 0.1);
  background: linear-gradient(180deg, rgba(250, 252, 255, 0.98), rgba(255, 255, 255, 0.96));
  box-shadow: 0 10px 20px rgba(15, 23, 42, 0.04);
}

.assistant-section-kicker {
  margin: 0 0 8px;
  color: var(--primary-color);
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
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
  margin-top: 12px;
}

.citation-card,
.recommend-card {
  padding: 10px 12px;
  border-radius: 14px;
  border: 1px solid rgba(37, 99, 235, 0.08);
  background: rgba(248, 251, 255, 0.9);
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
  font-size: 13px;
  line-height: 1.58;
}

.citation-card p {
  white-space: pre-wrap;
  word-break: break-word;
  overflow-wrap: anywhere;
}

.follow-up-list {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 16px;
}

.follow-up-chip {
  border: 1px solid rgba(37, 99, 235, 0.16);
  border-radius: 999px;
  background: rgba(37, 99, 235, 0.06);
  color: var(--primary-color);
  padding: 10px 14px;
  font: inherit;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  transition: var(--transition);
}

.follow-up-chip:hover:not(:disabled) {
  background: rgba(37, 99, 235, 0.1);
}

.follow-up-chip:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.missing-context-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 16px;
}

.missing-context-item {
  margin: 0;
  padding: 10px 12px;
  border-radius: 14px;
  background: rgba(249, 115, 22, 0.1);
  color: #c2410c;
  font-size: 13px;
  line-height: 1.6;
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
  flex-shrink: 0;
}

.assistant-composer {
  padding: 14px 16px 12px;
  border-radius: 28px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  transition: var(--transition);
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.assistant-composer.focused,
.assistant-composer:hover {
  border-color: rgba(37, 99, 235, 0.35);
  box-shadow: inset 0 0 0 1px rgba(37, 99, 235, 0.12);
}

.assistant-context-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  align-self: flex-start;
  max-width: min(calc(100% - 28px), 360px);
  min-width: 0;
  box-sizing: border-box;
  overflow: hidden;
  padding: 7px 11px;
  border-radius: 999px;
  border: 1px solid rgba(37, 99, 235, 0.12);
  background: #ffffff;
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 700;
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
  min-height: 96px;
  margin-top: 12px;
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
  margin-top: 4px;
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
  width: 38px;
  height: 38px;
  font-size: 18px;
}

.assistant-dialog.compact .assistant-brand-title {
  font-size: 18px;
}

.assistant-dialog.compact .icon-btn {
  width: 34px;
  height: 34px;
}

.assistant-dialog.compact .assistant-body {
  padding-top: 16px;
  padding-bottom: 12px;
}

.assistant-dialog.compact .assistant-welcome {
  gap: 14px;
}

.assistant-dialog.compact .assistant-hero-copy h3 {
  font-size: 20px;
}

.assistant-dialog.compact .assistant-hero-copy p {
  margin-top: 8px;
  font-size: 13px;
  line-height: 1.58;
}

.assistant-dialog.compact .assistant-suggestion {
  gap: 12px;
  padding: 6px 0;
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
  padding: 7px 10px;
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
  min-height: 84px;
  margin-top: 10px;
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
  left: 12px;
  top: 12px;
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
  left: 16px;
  top: 16px;
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
  transform: rotate(135deg);
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
    max-height: calc(100vh - 20px);
    min-height: unset;
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

@media (max-width: 480px) {
  .assistant-fab {
    right: 16px;
    bottom: 16px;
    width: 48px;
    height: 48px;
  }

  .assistant-dialog,
  .assistant-dialog.fullscreen {
    top: 0;
    right: 0;
    bottom: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    max-height: 100vh;
    min-height: unset;
    border-radius: 0;
  }

  .assistant-brand-icon {
    width: 36px;
    height: 36px;
    font-size: 18px;
  }

  .assistant-brand-title {
    font-size: 16px;
  }

  .assistant-topbar {
    padding-top: 12px;
    padding-bottom: 10px;
    padding-left: 12px;
    padding-right: 12px;
  }

  .assistant-body {
    padding-left: 12px;
    padding-right: 12px;
  }

  .assistant-dock {
    padding: 10px 12px;
    padding-bottom: max(10px, env(safe-area-inset-bottom, 10px));
  }

  .assistant-hero-copy h3 {
    font-size: 18px;
  }

  .assistant-hero-copy p {
    font-size: 14px;
  }

  .assistant-suggestion {
    padding: 12px 14px;
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
  }

  .assistant-suggestion-text {
    font-size: 13px;
  }

  .assistant-suggestion-text strong {
    font-size: 14px;
  }

  .assistant-suggestion-text small {
    font-size: 12px;
  }

  .assistant-context-chip {
    padding: 6px 10px;
    font-size: 12px;
  }

  .assistant-context-name {
    max-width: 100px;
  }

  .assistant-input {
    min-height: 48px;
    font-size: 14px;
    padding: 10px 12px;
  }

  .assistant-composer {
    padding: 10px 12px;
    border-radius: 20px;
    gap: 6px;
  }

  .assistant-composer-footer {
    flex-wrap: wrap;
    gap: 8px;
  }

  .assistant-send {
    width: 36px;
    height: 36px;
  }

  .icon-btn.small {
    width: 32px;
    height: 32px;
  }

  .review-grid {
    grid-template-columns: 1fr;
  }

  .review-card {
    padding: 14px;
  }

  .review-card-section h4 {
    font-size: 13px;
  }

  .review-card-section p,
  .review-card-section blockquote {
    font-size: 13px;
  }

  .citation-card {
    padding: 12px;
    font-size: 13px;
  }

  .follow-up-chip {
    padding: 8px 12px;
    font-size: 13px;
  }

  .recommend-card {
    padding: 12px;
    font-size: 13px;
  }
}
</style>



 
 
