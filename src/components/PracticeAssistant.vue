<template>
  <Teleport to="body">
    <button v-if="!isOpen" class="assistant-fab" type="button" :aria-expanded="isOpen" @click="toggleDialog">
      <span class="material-icons">smart_toy</span>
      <span v-if="hasSubmitted" class="assistant-fab-badge"></span>
    </button>

    <Transition name="assistant-shell">
      <div v-if="isOpen" class="assistant-layer">
        <section ref="dialogRef" class="assistant-dialog" :class="{ fullscreen: viewMode === 'fullscreen', compact: isCompactDialog, dragging: isDragging, resizing: isResizing }" :style="dialogStyle" role="dialog" aria-modal="false">
          <header class="assistant-topbar" @mousedown="handleHeaderPointerDown" @touchstart="handleHeaderPointerDown">
            <div class="assistant-brand">
              <span class="assistant-brand-icon material-icons">smart_toy</span>
              <div class="assistant-title-block">
                <h2 class="assistant-brand-title">{{ copy.kicker }}</h2>
              </div>
            </div>
            <div class="assistant-header-actions">
              <button class="icon-btn" type="button" :title="viewButtonTitle" @mousedown.stop @touchstart.stop @click="toggleViewMode">
                <span class="material-icons">{{ viewMode === 'floating' ? 'open_in_full' : 'picture_in_picture_alt' }}</span>
              </button>
              <button class="icon-btn" type="button" :title="copy.closeTitle" @mousedown.stop @touchstart.stop @click="closeDialog">
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
                  <div class="assistant-response-content">
                    <div class="assistant-avatar">
                      <span class="material-icons">smart_toy</span>
                    </div>
                    <div class="assistant-response-body">
                      <!-- Hide meta chips for chat/social/clarify/tool_result responses -->
                      <div v-if="(message.usedQuestionNumbers?.length || message.usedParagraphLabels?.length || message.confidence || message.missingContext?.length) && !['chat', 'social', 'clarify', 'tool_result'].includes(message.responseKind || '')" class="assistant-response-meta">
                        <span v-if="message.usedQuestionNumbers?.length" class="assistant-meta-chip">Q{{ message.usedQuestionNumbers.join(', ') }}</span>
                        <span v-if="message.usedParagraphLabels?.length" class="assistant-meta-chip">{{ responseParagraphLabel(message.usedParagraphLabels) }}</span>
                        <span v-if="message.confidence" class="assistant-meta-chip" :class="`assistant-meta-chip--confidence-${message.confidence}`">{{ confidenceLabel(message.confidence) }}</span>
                        <span v-if="message.searchUsed" class="assistant-meta-chip assistant-meta-chip--web">联网</span>
                      </div>
                      <template v-if="message.typewriterPending">
                        <p class="assistant-message-text">{{ message.content }}</p>
                      </template>
                      <template v-else>
                      <!-- Tool cards for selection tools and review workspace -->
                      <div v-if="message.toolCards?.length" class="tool-card-list">
                        <article v-for="(card, cardIndex) in message.toolCards" :key="`tool-${cardIndex}`" class="tool-card" :class="`tool-card--${card.kind}`">
                          <header class="tool-card-header">
                            <span class="material-icons tool-card-icon">{{ toolCardIcon(card.kind) }}</span>
                            <h4 class="tool-card-title">{{ card.title }}</h4>
                          </header>
                          <div class="tool-card-content">
                            <p>{{ card.content }}</p>
                            <p v-if="card.sourceExcerpt" class="tool-card-source">{{ toolCardSourceLabel(card.sourceExcerpt) }}</p>
                          </div>
                        </article>
                      </div>
                      <!-- Answer sections for structured responses -->
                      <div v-if="message.answerSections?.length" class="assistant-section-list">
                        <section v-for="(section, sectionIndex) in message.answerSections" :key="`section-${sectionIndex}`" class="assistant-section-card">
                          <p class="assistant-section-kicker">{{ answerSectionTitle(section.type) }}</p>
                          <p class="assistant-message-text">{{ section.text }}</p>
                        </section>
                      </div>
                      <p v-else-if="!message.reviewItems?.length && !message.toolCards?.length" class="assistant-message-text">{{ message.content }}</p>
                      <!-- Review panel for review responses -->
                      <div v-else-if="message.reviewItems?.length" class="review-panel">
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
                      <!-- Next actions for follow-up interactions -->
                      <div v-if="message.nextActions?.length" class="next-action-list">
                        <button v-for="(action, actionIndex) in message.nextActions" :key="`action-${actionIndex}`" class="next-action-chip" type="button" :disabled="isLoading" @click="handleNextAction(action)">
                          <span v-if="action.icon" class="material-icons">{{ action.icon }}</span>
                          <span>{{ action.label }}</span>
                        </button>
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
                      <!-- Web citations for search-augmented responses -->
                      <div v-if="message.webCitations?.length" class="web-citations-list">
                        <h4 class="web-citations-title">
                          <span class="material-icons">language</span>
                          {{ message.lang === 'en' ? 'Sources' : '来源' }}
                        </h4>
                        <a v-for="(citation, citationIndex) in message.webCitations" :key="`web-${citationIndex}`" class="web-citation-card" :href="citation.url" target="_blank" rel="noopener noreferrer">
                          <div class="web-citation-meta">
                            <span class="web-citation-title">{{ citation.title }}</span>
                            <span class="web-citation-domain">{{ extractDomain(citation.url) }}</span>
                          </div>
                          <p class="web-citation-snippet">{{ citation.snippet }}</p>
                        </a>
                      </div>
                      <!-- Hidden missing context list - kept for internal logging only -->
                      <!-- <div v-if="message.missingContext?.length" class="missing-context-list">
                        <p v-for="item in message.missingContext" :key="item" class="missing-context-item">{{ item }}</p>
                      </div> -->
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
                      </template>
                    </div>
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
                </div>
                <div class="assistant-right-actions">
                  <button class="assistant-send" type="button" :disabled="isLoading || !canSubmit" @click="submitDraft">
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
import { queryPracticeAssistant, queryPracticeAssistantStream } from '@/api/assistant'
import type {
  AssistantAnswerSection,
  AssistantAttachment,
  AssistantCitation,
  AssistantConfidence,
  AssistantHistoryItem,
  AssistantMode,
  AssistantNextAction,
  AssistantQueryResponse,
  AssistantReviewItem,
  AssistantToolCard,
  AttemptContext,
  PracticeContext,
  RecentPracticeItem,
  SearchMode,
  SelectedContext,
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
  uploadTitle: string
  resizeTitle: string
  resizeAria: string
  defaultQuestionTitle: string
  fallbackUnavailable: string
  reviewFallbackExplanation: string
  reviewFallbackEvidence: string
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
  responseKind?: 'chat' | 'grounded' | 'tool_result' | 'review' | 'clarify' | 'social'
  toolCards?: AssistantToolCard[]
  nextActions?: AssistantNextAction[]
  answerSource?: 'local' | 'web' | 'hybrid'
  searchUsed?: boolean
  webCitations?: Array<{ title: string; url: string; snippet: string; sourceType?: string }>
  lang?: 'zh' | 'en'
  /** When true, main body defers to `content` while typewriter runs (structured fields attached after). */
  typewriterPending?: boolean
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

const FLOATING_DIALOG_WIDTH = 450
const FLOATING_DIALOG_HEIGHT = 800
const COMPACT_DIALOG_BREAKPOINT = 420
const FLOATING_DIALOG_MIN_WIDTH = 450

const props = defineProps<{ questionId: string; questionTitle: string; questionTitleLocalized?: string; hasSubmitted: boolean; attemptContext: AttemptContext | null; recentPractice: RecentPracticeItem[]; lang: 'zh' | 'en'; quickActionContext?: { hintQuestionNumber?: string; explainQuestionNumber?: string; reviewQuestionNumber?: string } }>()
const router = useRouter()
const route = useRoute()
const modes: AssistantMode[] = ['hint', 'explain', 'review', 'similar']
const modeIcons: Record<AssistantMode, string> = { hint: 'tips_and_updates', explain: 'menu_book', review: 'fact_check', similar: 'route' }
const zh: Copy = {
  kicker: 'AI 助教',
  heroTitle: '今天想让我帮你什么？',
  heroDescription: '可以直接问当前文章和题组。我可以给提示、解释推理路径、复盘错题，或推荐下一步练习。',
  loading: '正在处理你的请求…',
  reviewHint: '提交本次作答后，可解锁讲评和相似推荐模式。',
  closeTitle: '关闭',
  expandTitle: '切换为大窗口',
  collapseTitle: '切换为小窗口',
  uploadTitle: '上传文件',
  resizeTitle: '拖动调整窗口大小',
  resizeAria: '调整小助手窗口大小',
  defaultQuestionTitle: 'IELTS 阅读',
  fallbackUnavailable: '小助手暂时不可用。',
  reviewFallbackExplanation: '暂未提取到详细解析。',
  reviewFallbackEvidence: '暂未提取到明确证据。',
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
  loading: 'Working on your request…',
  reviewHint: 'Review and similar mode unlock after you submit this attempt.',
  closeTitle: 'Close',
  expandTitle: 'Expand assistant',
  collapseTitle: 'Return to floating window',
  uploadTitle: 'Upload files',
  resizeTitle: 'Resize window',
  resizeAria: 'Resize assistant window',
  defaultQuestionTitle: 'IELTS Reading',
  fallbackUnavailable: 'Assistant is unavailable.',
  reviewFallbackExplanation: 'Detailed explanation was not extracted.',
  reviewFallbackEvidence: 'Explicit source evidence was not extracted.',
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
const selectedMode = ref<AssistantMode>('hint')
const draft = ref('')
const history = ref<AssistantHistoryItem[]>([])
const messages = ref<Msg[]>([])
const status = ref<'idle' | 'loading' | 'success' | 'error'>('idle')
const isOpen = ref(false)
const viewMode = ref<ViewMode>('floating')
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
const typewriterTimer = ref<number | null>(null)
const isLoading = computed(() => status.value === 'loading')
const canSubmit = computed(() => draft.value.trim().length > 0 || attachments.value.length > 0)
const isCompactDialog = computed(() => viewMode.value === 'floating' && dialogSize.value.width <= COMPACT_DIALOG_BREAKPOINT)
const placeholder = computed(() => {
  return props.lang === 'zh'
    ? '直接问我某道题、错因、词义，或上传文件让我分析'
    : 'Ask me about a specific question, error analysis, vocabulary, or upload files'
})
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
const actionCards = computed(() => {
  const { hintQuestionNumber, explainQuestionNumber, reviewQuestionNumber } = props.quickActionContext || {}

  return [
    {
      mode: 'hint' as AssistantMode,
      title: props.lang === 'zh' ? `给我第${hintQuestionNumber || '1'}题的提示` : `Give me a hint for Q${hintQuestionNumber || '1'}`,
      description: props.lang === 'zh' ? '先给策略，不直接揭晓答案' : 'Start with strategy, not the answer',
      icon: modeIcons.hint,
      disabled: isModeDisabled('hint')
    },
    {
      mode: 'explain' as AssistantMode,
      title: props.lang === 'zh' ? `讲解第${explainQuestionNumber || '1'}题` : `Explain Q${explainQuestionNumber || '1'}`,
      description: props.lang === 'zh' ? '拆解定位顺序和推理路径' : 'Break down the locating and reasoning path',
      icon: modeIcons.explain,
      disabled: isModeDisabled('explain')
    },
    {
      mode: 'review' as AssistantMode,
      title: props.lang === 'zh' ? `帮我分析第${reviewQuestionNumber || '1'}题为什么错了` : `Analyze why Q${reviewQuestionNumber || '1'} was wrong`,
      description: props.lang === 'zh' ? '结合我的作答解释错因' : 'Use my submission to explain the miss',
      icon: modeIcons.review,
      disabled: isModeDisabled('review') || !reviewQuestionNumber
    },
    {
      mode: 'similar' as AssistantMode,
      title: props.lang === 'zh' ? (props.hasSubmitted ? '根据我的错题推荐下一组练习' : '推荐下一组相似练习') : (props.hasSubmitted ? 'Recommend similar based on my mistakes' : 'Recommend similar practice'),
      description: props.lang === 'zh' ? '推荐下一组最匹配的练习' : 'Recommend the next best matching set',
      icon: modeIcons.similar,
      disabled: isModeDisabled('similar')
    }
  ]
})
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
function createMessage(
  role: 'user' | 'assistant',
  content: string,
  extra: Partial<Pick<Msg, 'citations' | 'followUps' | 'recommendedQuestions' | 'reviewItems' | 'answerSections' | 'usedQuestionNumbers' | 'usedParagraphLabels' | 'confidence' | 'missingContext' | 'isError' | 'typewriterPending'>> = {}
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
async function scrollToTop() { await nextTick(); if (messageListRef.value) messageListRef.value.scrollTop = 0 }
async function scrollToBottom() { await nextTick(); if (messageListRef.value) messageListRef.value.scrollTop = messageListRef.value.scrollHeight }
function handleEscape(event: KeyboardEvent) { if (event.key === 'Escape') { closeDialog() } }
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
function handleDragMove(event: PointerEvent | MouseEvent | TouchEvent) {
  if (!isDragging.value || viewMode.value === 'fullscreen') return

  let clientX: number, clientY: number
  if (event instanceof TouchEvent) {
    clientX = event.touches[0].clientX
    clientY = event.touches[0].clientY
  } else {
    clientX = (event as PointerEvent | MouseEvent).clientX
    clientY = (event as PointerEvent | MouseEvent).clientY
  }

  const next = clampPosition(clientX - dragOffset.value.x, clientY - dragOffset.value.y)
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
  // Remove pointer/mouse listeners
  window.removeEventListener('pointermove', handleDragMove)
  window.removeEventListener('pointerup', stopDrag)
  // Remove mouse listeners
  window.removeEventListener('mousemove', handleDragMove)
  window.removeEventListener('mouseup', stopDrag)
  // Remove touch listeners
  window.removeEventListener('touchmove', handleDragMove)
  window.removeEventListener('touchend', stopDrag)
  window.removeEventListener('touchcancel', stopDrag)
}
function stopResize() {
  isResizing.value = false
  if (typeof document !== 'undefined') {
    document.body.style.userSelect = ''
  }
  window.removeEventListener('pointermove', handleResizeMove)
  window.removeEventListener('pointerup', stopResize)
}
function startDrag(event: PointerEvent | MouseEvent | TouchEvent) {
  if (viewMode.value === 'fullscreen') return
  const target = event.target as HTMLElement | null
  if (target?.closest('button,input,textarea')) return
  const rect = dialogRef.value?.getBoundingClientRect()
  if (!rect) return

  if (event instanceof TouchEvent) {
    // Prevent default touch behavior
    event.preventDefault()
  } else {
    event.preventDefault()
    event.stopPropagation()
  }

  dialogPosition.value = { x: rect.left, y: rect.top }
  dragOffset.value = {
    x: event instanceof TouchEvent
      ? event.touches[0].clientX - rect.left
      : (event as PointerEvent | MouseEvent).clientX - rect.left,
    y: event instanceof TouchEvent
      ? event.touches[0].clientY - rect.top
      : (event as PointerEvent | MouseEvent).clientY - rect.top
  }
  isDragging.value = true
  if (typeof document !== 'undefined') {
    document.body.style.userSelect = 'none'
  }

  // Use appropriate event listeners based on input type
  if (event instanceof TouchEvent) {
    window.addEventListener('touchmove', handleDragMove, { passive: false })
    window.addEventListener('touchend', stopDrag)
    window.addEventListener('touchcancel', stopDrag)
  } else {
    window.addEventListener('mousemove', handleDragMove)
    window.addEventListener('mouseup', stopDrag)
  }
}
function handleHeaderPointerDown(event: PointerEvent | MouseEvent | TouchEvent) {
  if (viewMode.value === 'floating') {
    startDrag(event)
  }
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
function resolveFocusQuestionNumbers(userPrompt: string, promptKind?: 'preset' | 'freeform' | 'followup'): string[] | undefined {
  const explicit = extractExplicitFocusQuestionNumbers(userPrompt)
  if (explicit?.length) return explicit
  if (isWholeSetRequest(userPrompt)) return undefined
  // For preset mode, don't fallback to lastFocusQuestionNumbers - let backend decide
  if (promptKind === 'preset') return undefined
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
function syncListeners(open: boolean) { if (typeof document === 'undefined') return; document.removeEventListener('keydown', handleEscape); window.removeEventListener('pointermove', handleDragMove); window.removeEventListener('pointerup', stopDrag); window.removeEventListener('pointermove', handleResizeMove); window.removeEventListener('pointerup', stopResize); if (open) { document.addEventListener('keydown', handleEscape) } }

function clearTypewriter() {
  if (typewriterTimer.value) {
    window.clearInterval(typewriterTimer.value)
    typewriterTimer.value = null
  }
}

function typewriterEffect(
  fullText: string,
  extra: Partial<Pick<Msg, 'citations' | 'followUps' | 'recommendedQuestions' | 'reviewItems' | 'answerSections' | 'usedQuestionNumbers' | 'usedParagraphLabels' | 'confidence' | 'missingContext' | 'isError' | 'responseKind' | 'toolCards' | 'nextActions' | 'answerSource' | 'searchUsed' | 'webCitations' | 'lang'>> = {},
  speed: number = 30,
  onComplete?: () => void
) {
  clearTypewriter()
  const targetIndex = messages.value.length - 1
  if (targetIndex < 0) {
    return
  }
  if (!fullText) {
    onComplete?.()
    return
  }

  let currentIndex = 0

  typewriterTimer.value = window.setInterval(() => {
    if (currentIndex < fullText.length) {
      currentIndex++
      messages.value[targetIndex].content = fullText.slice(0, currentIndex)
      // Only scroll during typing if near the bottom
      const container = messageListRef.value
      if (container) {
        const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 100
        if (isNearBottom) {
          container.scrollTop = container.scrollHeight - container.clientHeight
        }
      }
    } else {
      clearTypewriter()
      // Ensure final content is set
      messages.value[targetIndex].content = fullText
      onComplete?.()
      // Scroll to bottom after typing completes
      void nextTick(() => {
        void scrollToBottom()
      })
    }
  }, speed)
}

async function sendMessage(
  mode: AssistantMode,
  userPrompt: string,
  userBubbleText?: string,
  promptKind?: 'preset' | 'freeform' | 'followup',
  action?: AssistantQueryResponse['responseKind'],
  selectedContext?: SelectedContext,
  practiceContext?: PracticeContext,
  searchMode?: SearchMode
) {
  if (isModeDisabled(mode)) return
  clearTypewriter()
  isOpen.value = true
  selectedMode.value = mode
  status.value = 'loading'
  const historySeed = history.value.slice(-6)
  const bubbleText = userBubbleText || userPrompt
  const focusQuestionNumbers = promptKind === 'freeform' ? undefined : resolveFocusQuestionNumbers(userPrompt, promptKind)
  messages.value = [...messages.value, createMessage('user', bubbleText)]
  await scrollToBottom()

  // Try streaming first, fallback to non-streaming if it fails
  let useStreaming = true
  let streamingFailed = false
  let streamingError: unknown = null

  if (useStreaming && !streamingFailed) {
    // Streaming mode
    let accumulatedAnswer = ''
    let finalResponse: AssistantQueryResponse | null = null
    let hasStarted = false

    try {
      for await (const event of queryPracticeAssistantStream({
        questionId: props.questionId,
        mode,
        locale: props.lang,
        userQuery: userPrompt,
        history: historySeed,
        attachments: buildRequestAttachments(),
        focusQuestionNumbers,
        attemptContext: props.attemptContext ?? undefined,
        recentPractice: props.recentPractice.slice(0, 10),
        promptKind,
        surface: 'chat_widget',
        action: action || 'chat',
        selectedContext,
        practiceContext,
        searchMode: searchMode || (promptKind === 'freeform' ? 'auto' : undefined)
      })) {
        if (event.type === 'start') {
          hasStarted = true
          const startPayload = event.payload as { responseKind?: string }
          messages.value = [
            ...messages.value,
            createMessage('assistant', '', {
              responseKind: startPayload.responseKind as Msg['responseKind'] || 'grounded',
              lang: props.lang,
              typewriterPending: true
            })
          ]
        } else if (event.type === 'delta') {
          const deltaPayload = event.payload as { text: string }
          if (deltaPayload.text) {
            accumulatedAnswer += deltaPayload.text
            const targetIndex = messages.value.length - 1
            if (targetIndex >= 0 && messages.value[targetIndex].role === 'assistant') {
              messages.value[targetIndex].content = accumulatedAnswer
              // Scroll while typing
              const container = messageListRef.value
              if (container) {
                const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 100
                if (isNearBottom) {
                  container.scrollTop = container.scrollHeight - container.clientHeight
                }
              }
            }
          }
        } else if (event.type === 'final') {
          finalResponse = event.payload as AssistantQueryResponse
          const idx = messages.value.length - 1
          const m = messages.value[idx]
          if (!m || m.role !== 'assistant') {
            return
          }
          m.typewriterPending = false
          m.answerSections = finalResponse.answerSections
          m.reviewItems = finalResponse.reviewItems
          m.toolCards = finalResponse.toolCards
          m.nextActions = finalResponse.nextActions
          m.citations = normalizeCitationsForDisplay(finalResponse.citations)
          m.followUps = finalResponse.followUps
          m.recommendedQuestions = finalResponse.recommendedQuestions
          m.webCitations = finalResponse.webCitations
          m.usedQuestionNumbers = finalResponse.usedQuestionNumbers
          m.usedParagraphLabels = finalResponse.usedParagraphLabels
          m.confidence = finalResponse.confidence
          m.missingContext = finalResponse.missingContext
          m.responseKind = finalResponse.responseKind
          m.answerSource = finalResponse.answerSource
          m.searchUsed = finalResponse.searchUsed
        } else if (event.type === 'error') {
          const errorPayload = event.payload as { message: string }
          throw new Error(errorPayload.message)
        }
      }

      // Update history with final response
      if (finalResponse) {
        history.value = [...historySeed, { role: 'user', content: bubbleText }, { role: 'assistant', content: finalResponse.answer || accumulatedAnswer }].slice(-6)
        if (finalResponse.responseKind === 'grounded' || finalResponse.responseKind === 'review') {
          lastFocusQuestionNumbers.value = normalizeFocusQuestionNumbers(finalResponse.usedQuestionNumbers) || focusQuestionNumbers
        }
      }

      status.value = 'success'
    } catch (error) {
      // Log streaming error and fallback to non-streaming
      console.warn('Streaming failed, falling back to non-streaming:', error)
      streamingFailed = true
      streamingError = error

      // Remove the empty assistant message added for streaming
      const lastMsg = messages.value[messages.value.length - 1]
      if (lastMsg && lastMsg.role === 'assistant' && !lastMsg.content && !lastMsg.answerSections?.length) {
        messages.value = messages.value.slice(0, -1)
      }

      // Fallback to non-streaming
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
          recentPractice: props.recentPractice.slice(0, 10),
          promptKind,
          surface: 'chat_widget',
          action: action || 'chat',
          selectedContext,
          practiceContext,
          searchMode: searchMode || (promptKind === 'freeform' ? 'auto' : undefined)
        })
        const fullAnswer = (response.answer ?? '').trim()
        const hasStructuredBody =
          Boolean(response.answerSections?.length) ||
          Boolean(response.reviewItems?.length) ||
          Boolean(response.toolCards?.length)
        const deferStructuredForTypewriter = Boolean(fullAnswer) && hasStructuredBody

        const sharedMeta = {
          usedQuestionNumbers: response.usedQuestionNumbers,
          usedParagraphLabels: response.usedParagraphLabels,
          confidence: response.confidence,
          missingContext: response.missingContext,
          responseKind: response.responseKind,
          answerSource: response.answerSource,
          searchUsed: response.searchUsed,
          lang: props.lang
        }

        if (deferStructuredForTypewriter) {
          messages.value = [
            ...messages.value,
            createMessage('assistant', '', {
              ...sharedMeta,
              typewriterPending: true
            })
          ]
          typewriterEffect(response.answer, {}, 30, () => {
            const idx = messages.value.length - 1
            const m = messages.value[idx]
            if (!m || m.role !== 'assistant') {
              return
            }
            m.typewriterPending = false
            m.answerSections = response.answerSections
            m.reviewItems = response.reviewItems
            m.toolCards = response.toolCards
            m.nextActions = response.nextActions
            m.citations = normalizeCitationsForDisplay(response.citations)
            m.followUps = response.followUps
            m.recommendedQuestions = response.recommendedQuestions
            m.webCitations = response.webCitations
          })
        } else {
          messages.value = [
            ...messages.value,
            createMessage('assistant', '', {
              citations: response.citations,
              followUps: response.followUps,
              recommendedQuestions: response.recommendedQuestions,
              reviewItems: response.reviewItems,
              answerSections: response.answerSections,
              ...sharedMeta,
              toolCards: response.toolCards,
              nextActions: response.nextActions,
              webCitations: response.webCitations,
              typewriterPending: false
            })
          ]
          if (fullAnswer) {
            typewriterEffect(response.answer, {}, 30)
          }
        }
        if (response.responseKind === 'grounded' || response.responseKind === 'review') {
          lastFocusQuestionNumbers.value = normalizeFocusQuestionNumbers(response.usedQuestionNumbers) || focusQuestionNumbers
        }
        history.value = [...historySeed, { role: 'user', content: bubbleText }, { role: 'assistant', content: response.answer }].slice(-6)
        status.value = 'success'
      } catch (fallbackError) {
        const detail = fallbackError instanceof Error ? fallbackError.message : copy.value.fallbackUnavailable
        messages.value = [...messages.value, createMessage('assistant', detail, { isError: true })]
        status.value = 'error'
      }
    } finally {
      await scrollToBottom()
      await focusComposer()
    }
  }
}

function sendPreset(mode: AssistantMode) {
  const { hintQuestionNumber, explainQuestionNumber, reviewQuestionNumber } = props.quickActionContext || {}

  const promptMap: Record<AssistantMode, string> = {
    hint: props.lang === 'zh'
      ? `请给我第${hintQuestionNumber || '1'}题一个提示，但不要直接给答案。`
      : `Give me a strategic hint for question ${hintQuestionNumber || '1'} without revealing the final answer.`,
    explain: props.lang === 'zh'
      ? `请讲解第${explainQuestionNumber || '1'}题的解题思路和定位过程。`
      : `Explain the reasoning and locating process for question ${explainQuestionNumber || '1'}.`,
    review: props.lang === 'zh'
      ? `请结合我的作答，分析第${reviewQuestionNumber || '1'}题为什么错了，并指出证据。`
      : `Analyze why my answer for question ${reviewQuestionNumber || '1'} was wrong and point to the evidence.`,
    similar: props.lang === 'zh'
      ? `请根据我当前练习情况推荐下一组相似练习。`
      : `Recommend similar practice based on my current performance.`
  }

  const titleMap: Record<AssistantMode, string> = {
    hint: props.lang === 'zh' ? `给我第${hintQuestionNumber || '1'}题的提示` : `Give me a hint for Q${hintQuestionNumber || '1'}`,
    explain: props.lang === 'zh' ? `讲解第${explainQuestionNumber || '1'}题` : `Explain Q${explainQuestionNumber || '1'}`,
    review: props.lang === 'zh' ? `帮我分析第${reviewQuestionNumber || '1'}题为什么错了` : `Analyze why Q${reviewQuestionNumber || '1'} was wrong`,
    similar: props.lang === 'zh' ? (props.hasSubmitted ? '根据我的错题推荐下一组练习' : '推荐下一组相似练习') : (props.hasSubmitted ? 'Recommend similar based on my mistakes' : 'Recommend similar practice')
  }

  void sendMessage(mode, promptMap[mode], titleMap[mode], 'preset', undefined, undefined, undefined, 'off')
}
function sendFollowUp(followUp: string) { void sendMessage(selectedMode.value, followUp, followUp, 'followup') }
function submitDraft() {
  const value = draft.value.trim()
  if (!value && attachments.value.length === 0) return
  const attachmentLabel = attachments.value.length > 0 ? copy.value.attachmentSummary(attachments.value.map((attachment) => attachment.name)) : ''
  const bubbleText = value || attachmentLabel
  const prompt = value || defaultQuery(selectedMode.value)
  draft.value = ''
  // Freeform input from text box: promptKind='freeform', action='chat', searchMode='auto'
  void sendMessage(selectedMode.value, prompt, bubbleText, 'freeform', 'chat', undefined, undefined, 'auto')
}
function toolCardIcon(kind: AssistantToolCard['kind']): string {
  const iconMap: Record<AssistantToolCard['kind'], string> = {
    vocab: 'translate',
    evidence: 'fact_check',
    paraphrase: 'swap_horiz',
    antonym: 'flip_to_back',
    drill: 'school',
    diagnosis: 'assignment'
  }
  return iconMap[kind] || 'description'
}
function toolCardSourceLabel(excerpt: string): string {
  if (excerpt.length <= 60) return excerpt
  return `${excerpt.slice(0, 57).trimEnd()}...`
}
function extractDomain(url: string): string {
  try {
    const urlObj = new URL(url)
    return urlObj.hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}
function handleNextAction(action: AssistantNextAction) {
  const userQuery = buildUserQueryFromAction(action)
  void sendMessage(selectedMode.value, userQuery, action.label, undefined, action.action, action.context as SelectedContext | undefined, undefined)
}
function buildUserQueryFromAction(action: AssistantNextAction): string {
  const actionLabels: Record<AssistantNextAction['action'], string> = {
    chat: '继续聊聊这个话题',
    translate: '翻译这段内容',
    explain_selection: '解释这个选择',
    find_paraphrases: '找出同义替换',
    find_antonyms: '找出反义表达',
    extract_keywords: '提取关键词',
    locate_evidence: '定位证据',
    analyze_mistake: '分析这个错题',
    review_set: '复盘整组题',
    recommend_drills: '推荐针对性练习'
  }
  return actionLabels[action.action] || action.label
}
function openRecommendedQuestion(questionId: string) { router.push({ path: route.path, query: { ...route.query, id: questionId } }) }
watch(isOpen, async (open) => { syncListeners(open); if (open) { await scrollToTop(); await focusComposer() } })
watch(() => props.questionId, () => { clearTypewriter(); history.value = []; messages.value = []; draft.value = ''; attachments.value = []; lastFocusQuestionNumbers.value = undefined; dialogPosition.value = null; dialogSize.value = { width: FLOATING_DIALOG_WIDTH, height: FLOATING_DIALOG_HEIGHT }; status.value = 'idle'; selectedMode.value = 'hint' })
watch(() => props.hasSubmitted, (submitted) => { if (!submitted && (selectedMode.value === 'review' || selectedMode.value === 'similar')) selectedMode.value = 'hint' })
onUnmounted(() => { clearTypewriter(); stopDrag(); stopResize(); syncListeners(false) })
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
  width: min(450px, calc(100vw - 40px));
  height: min(800px, calc(100vh - 40px));
  max-height: calc(100vh - 40px);
  min-width: 450px;
  min-height: 320px;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  background: var(--bg-primary);
  color: var(--text-primary);
  border: 1px solid var(--border-color);
  border-radius: 28px;
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.18);
  overflow: hidden;
}

.assistant-dialog.dragging {
  box-shadow: 0 28px 68px rgba(0, 0, 0, 0.24);
}

.assistant-dialog:not(.fullscreen) .assistant-topbar {
  padding-top: 18px;
  padding-bottom: 16px;
}

.assistant-dialog.resizing {
  box-shadow: 0 28px 68px rgba(0, 0, 0, 0.24);
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
  background: var(--bg-primary);
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
  background: var(--bg-tertiary);
  border: 1px solid rgba(37, 99, 235, 0.14);
}

.assistant-brand-icon {
  width: 44px;
  height: 44px;
  border-radius: 16px;
  font-size: 20px;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.1);
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

.assistant-header-actions .material-icons {
  font-size: 22px;
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
  max-width: 100%;
}

.assistant-message.user .assistant-user-chip {
  max-width: 100%;
}

.assistant-message.assistant {
  display: flex;
}

.assistant-user-chip {
  max-width: 100%;
  width: auto;
  padding: 12px 18px;
  border-radius: 18px;
  background: linear-gradient(135deg, rgba(37, 99, 235, 0.12) 0%, rgba(37, 99, 235, 0.08) 100%);
  color: var(--primary-color);
  font-size: 15px;
  font-weight: 600;
  line-height: 1.5;
  letter-spacing: 0.01em;
  box-shadow: 0 1px 2px rgba(37, 99, 235, 0.08);
  transition: var(--transition);
  word-break: break-word;
  white-space: normal;
}

.assistant-user-chip:hover {
  background: linear-gradient(135deg, rgba(37, 99, 235, 0.16) 0%, rgba(37, 99, 235, 0.1) 100%);
  box-shadow: 0 2px 4px rgba(37, 99, 235, 0.12);
}

.assistant-response {
  width: 100%;
  min-width: 0;
  padding: 4px 0 0;
}

.assistant-response-content {
  display: flex;
  gap: 12px;
  align-items: flex-start;
}

.assistant-avatar {
  width: 32px;
  height: 32px;
  border-radius: 10px;
  background: linear-gradient(135deg, var(--primary-color) 0%, rgba(37, 99, 235, 0.8) 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  box-shadow: 0 2px 4px rgba(37, 99, 235, 0.2);
}

.assistant-avatar .material-icons {
  font-size: 18px;
  color: white;
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
  padding: 4px 8px;
  border-radius: 999px;
  background: rgba(100, 116, 139, 0.08);
  color: var(--text-secondary);
  font-size: 11px;
  font-weight: 600;
}

.assistant-meta-chip--web {
  background: rgba(37, 99, 235, 0.12);
  color: var(--primary-color);
  font-weight: 700;
}

.assistant-meta-chip--confidence-high {
  background: rgba(34, 197, 94, 0.12);
  color: #16a34a;
}

.assistant-meta-chip--confidence-medium {
  background: rgba(245, 158, 11, 0.12);
  color: #d97706;
}

.assistant-meta-chip--confidence-low {
  background: rgba(239, 68, 68, 0.12);
  color: #dc2626;
}

.assistant-section-list {
  display: flex;
  flex-direction: column;
  gap: 0;
  border-radius: 16px;
  border: 1px solid var(--border-color);
  background: var(--bg-secondary);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
  overflow: hidden;
}

.assistant-section-card {
  padding: 14px 16px;
  border-radius: 0;
  border: none;
  border-bottom: 1px solid var(--border-light);
  background: transparent;
  box-shadow: none;
  transition: background 0.2s ease;
}

.assistant-section-card:last-child {
  border-bottom: none;
}

.assistant-section-card:hover {
  background: rgba(37, 99, 235, 0.02);
}

/* Tool cards for selection tools and review workspace */
.tool-card-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 12px;
}

.tool-card {
  border-radius: 16px;
  border: 1px solid var(--border-color);
  background: var(--bg-secondary);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
  overflow: hidden;
}

.tool-card--vocab {
  border-left: 3px solid #3b82f6;
}

.tool-card--evidence {
  border-left: 3px solid #22c55e;
}

.tool-card--paraphrase {
  border-left: 3px solid #8b5cf6;
}

.tool-card--antonym {
  border-left: 3px solid #f59e0b;
}

.tool-card--drill {
  border-left: 3px solid #ec4899;
}

.tool-card--diagnosis {
  border-left: 3px solid #ef4444;
}

.tool-card-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  background: var(--bg-tertiary);
  border-bottom: 1px solid var(--border-light);
}

.tool-card-icon {
  font-size: 18px;
  color: var(--text-secondary);
}

.tool-card-title {
  margin: 0;
  font-size: 13px;
  font-weight: 700;
  color: var(--text-primary);
}

.tool-card-content {
  padding: 12px 14px;
}

.tool-card-content p {
  margin: 0;
  color: var(--text-primary);
  font-size: 14px;
  line-height: 1.7;
}

.tool-card-source {
  margin-top: 10px !important;
  font-size: 12px !important;
  color: var(--text-tertiary) !important;
}

/* Next action chips for follow-up interactions */
.next-action-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 14px;
}

.next-action-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  border-radius: 999px;
  border: 1px solid rgba(100, 116, 139, 0.25);
  background: rgba(100, 116, 139, 0.06);
  color: var(--text-secondary);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: var(--transition);
}

.next-action-chip .material-icons {
  font-size: 16px;
}

.next-action-chip:hover:not(:disabled) {
  background: rgba(100, 116, 139, 0.1);
  border-color: rgba(100, 116, 139, 0.35);
}

.next-action-chip:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.assistant-section-kicker {
  margin: 0 0 8px;
  color: var(--text-secondary);
  font-size: 11px;
  font-weight: 700;
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
  color: #f87171;
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
  border: 1px solid var(--border-color);
  background: var(--bg-secondary);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
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
  background: var(--bg-primary);
  color: var(--text-primary);
  letter-spacing: 0.04em;
}

.review-paragraph-badge {
  padding: 8px 10px;
  border: 1px solid var(--border-color);
  background: var(--bg-tertiary);
  color: var(--text-secondary);
}

.review-answer-pill {
  padding: 8px 12px;
}

.review-answer-pill--mine {
  background: rgba(249, 115, 22, 0.12);
  color: var(--text-primary);
}

.review-answer-pill--correct {
  background: rgba(34, 197, 94, 0.15);
  color: var(--text-primary);
}

.review-card-section + .review-card-section {
  margin-top: 14px;
}

.review-card-section h4 {
  margin: 0 0 8px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-secondary);
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
  border-left: 3px solid var(--border-color);
  border-radius: 14px;
  background: var(--bg-tertiary);
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
  border: 1px solid var(--border-color);
  background: var(--bg-tertiary);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
}

/* Web citations for search-augmented responses */
.web-citations-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 14px;
  padding-top: 14px;
  border-top: 1px solid var(--border-light);
}

.web-citations-title {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0;
  font-size: 12px;
  font-weight: 700;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.web-citations-title .material-icons {
  font-size: 16px;
}

.web-citation-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px 12px;
  border-radius: 14px;
  border: 1px solid rgba(37, 99, 235, 0.15);
  background: rgba(37, 99, 235, 0.04);
  text-decoration: none;
  color: var(--text-primary);
  transition: var(--transition);
}

.web-citation-card:hover {
  border-color: rgba(37, 99, 235, 0.25);
  background: rgba(37, 99, 235, 0.08);
}

.web-citation-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.web-citation-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--primary-color);
}

.web-citation-domain {
  font-size: 11px;
  color: var(--text-tertiary);
  background: rgba(100, 116, 139, 0.1);
  padding: 2px 6px;
  border-radius: 4px;
}

.web-citation-snippet {
  margin: 0;
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.55;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.citation-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 8px;
  color: var(--text-tertiary);
  font-size: 11px;
  font-weight: 600;
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
  border: 1px solid rgba(100, 116, 139, 0.25);
  border-radius: 999px;
  background: rgba(100, 116, 139, 0.06);
  color: var(--text-secondary);
  padding: 8px 12px;
  font: inherit;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: var(--transition);
}

.follow-up-chip:hover:not(:disabled) {
  background: rgba(100, 116, 139, 0.1);
  border-color: rgba(100, 116, 139, 0.35);
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
  background: rgba(249, 115, 22, 0.12);
  color: var(--text-primary);
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
  background: var(--bg-primary);
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
  background: var(--bg-tertiary);
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
  padding: 8px 12px;
  border-radius: 12px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  color: var(--text-secondary);
  font-size: 13px;
  font-weight: 500;
  transition: var(--transition);
}

.assistant-attachment-chip:hover {
  border-color: rgba(37, 99, 235, 0.3);
  background: rgba(37, 99, 235, 0.04);
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

.assistant-dialog.compact .assistant-resize-handle {
  left: 12px;
  top: 12px;
  width: 22px;
  height: 22px;
}

.assistant-dialog.compact .assistant-resize-handle .material-icons {
  font-size: 16px;
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
    min-width: unset;
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

  /* 移动端隐藏切换小窗口图标 */
  .assistant-header-actions .icon-btn:first-child {
    display: none;
  }
}
</style>



 
 
