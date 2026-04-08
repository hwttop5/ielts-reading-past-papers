<template>
  <div class="practice-mode-page">
    <div class="page-header">
      <div class="header-left">
        <button class="icon-btn" type="button" @click="goBack">
          <span class="material-icons">arrow_back</span>
        </button>
        <h1 class="page-title">{{ displayTitle }}</h1>
      </div>

      <div v-if="question?.launchMode === 'unified'" class="header-actions">
        <button class="icon-btn" type="button" :title="isFullscreen ? 'Exit fullscreen' : 'Fullscreen'" @click="toggleFullscreen">
          <span class="material-icons">{{ isFullscreen ? 'fullscreen_exit' : 'fullscreen' }}</span>
        </button>
      </div>
    </div>

    <div class="practice-section">
      <div v-if="!question" class="state-card">
        <h2 class="state-title">Question unavailable</h2>
        <p class="state-description">This reading item is not available in the current question bank.</p>
        <button class="state-button primary" type="button" @click="goBack">Back to Library</button>
      </div>

      <div v-else-if="question.launchMode === 'pdf_only'" class="state-card">
        <h2 class="state-title">PDF only</h2>
        <p class="state-description">This item does not have structured practice data yet. Open the PDF instead.</p>
        <div class="state-actions">
          <button class="state-button primary" type="button" @click="openPdf">Open PDF</button>
          <button class="state-button" type="button" @click="goBack">Back to Library</button>
        </div>
      </div>

      <template v-else>
        <div v-if="session.loadError || runtimeError" class="state-banner">
          <div class="state-banner-copy">
            <strong>Failed to load practice data</strong>
            <span>{{ runtimeError || session.loadError }}</span>
          </div>
          <div class="state-actions">
            <button class="state-button primary small" type="button" @click="session.reload()">Retry</button>
            <button class="state-button small" type="button" @click="openPdf">Open PDF</button>
          </div>
        </div>

        <div v-if="session.isLoading" class="loading-card">
          <span class="material-icons loading-spinner">autorenew</span>
          <p>Loading practice data...</p>
        </div>

        <div
          v-else-if="session.exam"
          ref="contentWrapper"
          class="native-practice-shell"
          :class="[`font-${session.fontScale}`]"
        >
          <div class="native-practice-layout">
            <section
              ref="passagePane"
              class="practice-pane passage-pane"
              @mouseup="handleSelection('passage')"
              @keyup="handleSelection('passage')"
              @scroll="handlePaneScroll('passage')"
            >
              <div class="pane-header">
                <div>
                  <h2>{{ session.exam.meta.title }}</h2>
                </div>
                <div v-if="session.submitted && session.result" class="score-pill">
                  {{ session.result.scoreInfo.correct }}/{{ session.result.scoreInfo.totalQuestions }}
                </div>
              </div>

              <div class="pane-content passage-content">
                <PracticeNodeRenderer
                  :nodes="passageNodesForDisplay"
                  scope="passage"
                  :draft-state="session.draftState"
                  :submitted="session.submitted"
                  :read-only="session.readOnly"
                  :selected-option-key="session.selectedOptionKey"
                  :highlight-terms="passageHighlightTerms"
                  :used-option-values="session.usedOptionValuesByPool"
                  @update:text="session.setTextAnswer"
                  @update:textarea="session.setTextareaAnswer"
                  @update:select="session.setSelectAnswer"
                  @toggle:choice="session.toggleChoice"
                  @select:option="handleOptionSelection"
                  @set:dropzone="handleDropzoneSet"
                  @clear:dropzone="session.clearDropzoneValue"
                />
              </div>
            </section>

            <div 
              class="pane-resizer" 
              @mousedown="startResize"
              @dblclick="resetResize"
            >
              <span class="material-icons resizer-icon">drag_handle</span>
            </div>

            <section
              ref="questionPane"
              class="practice-pane question-pane"
              @mouseup="handleSelection('questions')"
              @keyup="handleSelection('questions')"
              @scroll="handlePaneScroll('questions')"
            >
              <div class="pane-header">
                <div>
                  <p class="pane-kicker">Questions</p>
                  <h2>{{ modeLabel }}</h2>
                </div>
                <div class="pane-toolbar">
                  <button class="toolbar-btn quiet toolbar-btn-compact" type="button" @click="clearSelections">
                    <span class="material-icons">delete</span>
                    <span>Clear Highlights</span>
                  </button>

                  <button class="toolbar-btn" type="button" :class="{ active: session.notesOpen }" @click="session.notesOpen = !session.notesOpen">
                    <span class="material-icons">sticky_note_2</span>
                    <span>Notes</span>
                  </button>

                  <div class="font-switcher">
                    <button
                      v-for="item in fontScaleOptions"
                      :key="item.value"
                      class="font-btn"
                      type="button"
                      :class="[item.value, { active: session.fontScale === item.value }]"
                      @click="session.fontScale = item.value"
                    >
                      {{ item.value === 'small' ? 'S' : item.value === 'medium' ? 'M' : 'L' }}
                    </button>
                  </div>
                </div>
              </div>

              <div v-if="session.submitted && session.result" class="summary-card">
                <div class="summary-metric">
                  <strong>{{ session.result.scoreInfo.percentage }}%</strong>
                  <span>Accuracy</span>
                </div>
                <div class="summary-metric">
                  <strong>{{ session.result.scoreInfo.correct }}</strong>
                  <span>Correct</span>
                </div>
                <div class="summary-metric">
                  <strong>{{ answeredCount }}</strong>
                  <span>Answered</span>
                </div>
              </div>

              <div class="pane-content question-content">
                <article
                  v-for="group in session.exam?.questionGroups"
                  :key="group.groupId"
                  class="question-group-card"
                  :id="`group-${group.groupId}`"
                  :data-question-ids="group.questionIds?.join(' ') || ''"
                >
                  <PracticeNodeRenderer
                    v-if="group.leadNodes.length"
                    :nodes="group.leadNodes"
                    scope="questions"
                    :draft-state="session.draftState"
                    :submitted="session.submitted"
                    :read-only="session.readOnly"
                    :selected-option-key="session.selectedOptionKey"
                    :highlight-terms="questionHighlightTerms"
                    :used-option-values="session.usedOptionValuesByPool"
                    @update:text="session.setTextAnswer"
                    @update:textarea="session.setTextareaAnswer"
                    @update:select="session.setSelectAnswer"
                    @toggle:choice="session.toggleChoice"
                    @select:option="handleOptionSelection"
                    @set:dropzone="handleDropzoneSet"
                    @clear:dropzone="session.clearDropzoneValue"
                  />
                  <PracticeNodeRenderer
                    :nodes="group.contentNodes"
                    scope="questions"
                    :draft-state="session.draftState"
                    :submitted="session.submitted"
                    :read-only="session.readOnly"
                    :selected-option-key="session.selectedOptionKey"
                    :highlight-terms="questionHighlightTerms"
                    :used-option-values="session.usedOptionValuesByPool"
                    @update:text="session.setTextAnswer"
                    @update:textarea="session.setTextareaAnswer"
                    @update:select="session.setSelectAnswer"
                    @toggle:choice="session.toggleChoice"
                    @select:option="handleOptionSelection"
                    @set:dropzone="handleDropzoneSet"
                    @clear:dropzone="session.clearDropzoneValue"
                  />
                </article>

                <section v-if="session.submitted && reviewEntries.length" class="review-section">
                  <header class="review-header">
                    <h3>Result Review</h3>
                    <p>Each card below uses the latest native Vue scoring result.</p>
                  </header>

                  <article
                    v-for="entry in reviewEntries"
                    :key="entry.questionId"
                    class="review-card"
                    :class="{ correct: entry.isCorrect, incorrect: entry.isCorrect === false }"
                  >
                    <div class="review-card-header">
                      <div class="review-card-title">
                        <span class="review-badge">Q{{ questionLabel(entry.questionId) }}</span>
                        <button class="mini-link" type="button" @click="scrollToQuestion(entry.questionId, entry.anchorId)">Jump to question</button>
                      </div>
                      <span class="review-status">{{ entry.isCorrect ? 'Correct' : entry.isCorrect === false ? 'Incorrect' : 'Not answered' }}</span>
                    </div>
                    <div class="review-answer-grid">
                      <div>
                        <span class="review-kicker">Your answer</span>
                        <p>{{ formatAnswer(entry.userAnswer) || 'Not answered' }}</p>
                      </div>
                      <div>
                        <span class="review-kicker">Correct answer</span>
                        <p>{{ formatAnswer(entry.correctAnswer) || 'N/A' }}</p>
                      </div>
                    </div>
                    <div v-if="entry.explanation" class="review-explanation">
                      <span class="review-kicker">Explanation</span>
                      <p>{{ entry.explanation }}</p>
                    </div>
                  </article>
                </section>
              </div>
            </section>

            <aside v-if="session.notesOpen" class="notes-panel">
              <div class="notes-header">
                <div>
                  <p class="pane-kicker">Session Notes</p>
                  <h3>Scratchpad</h3>
                </div>
                <button class="icon-btn small" type="button" @click="session.notesOpen = false">
                  <span class="material-icons">close</span>
                </button>
              </div>
              <textarea
                v-model="session.notesText"
                class="notes-textarea"
                placeholder="Write quick clues, paragraph links, or elimination notes here..."
              ></textarea>
            </aside>
          </div>

          <div class="nav-shell">
            <h3 class="nav-title">Question</h3>
            <div class="nav-grid">
              <div
                v-for="item in session.exam?.questionItems"
                :key="item.questionId"
                class="nav-item"
                :class="navItemClass(item.questionId)"
                @click="scrollToQuestion(item.questionId, item.anchorId)"
              >
                <span class="nav-jump">{{ item.displayNumber }}</span>
              </div>
            </div>
            <div v-if="!session.reviewMode" class="bottom-actions">
              <button class="footer-btn" type="button" @click="session.reset()">Reset</button>
              <button class="footer-btn primary" type="button" @click="submitPractice">Submit</button>
            </div>
          </div>

          <div
            v-if="selectionToolbar.visible"
            class="selection-toolbar"
            :style="{ top: `${selectionToolbar.top}px`, left: `${selectionToolbar.left}px` }"
          >
            <button class="selection-btn" type="button" @click="applySelectionHighlight">
              <span class="material-icons">format_color_fill</span>
              Highlight
            </button>
            <button v-if="selectionAlreadyHighlighted" class="selection-btn quiet" type="button" @click="removeSelectionHighlight">
              <span class="material-icons">delete</span>
              Remove
            </button>
            <button class="selection-btn" type="button" @click="openNoteModal">
              <span class="material-icons">edit_note</span>
              Note
            </button>
          </div>

          <div
            v-if="noteModal.visible"
            class="note-modal"
            :style="{ top: `${noteModal.top}px`, left: `${noteModal.left}px` }"
          >
            <div class="note-modal-header">Add Note</div>
            <div class="note-modal-text">{{ noteModal.selectedText }}</div>
            <textarea v-model="noteModal.userNote" class="note-modal-input" placeholder="Add your note..."></textarea>
            <div class="note-modal-actions">
              <button class="selection-btn quiet" type="button" @click="cancelNoteModal">Cancel</button>
              <button class="selection-btn primary" type="button" @click="saveNoteToSession">Save</button>
            </div>
          </div>
        </div>
    </template>
    </div>

    <PracticeAssistant
      v-if="question?.launchMode === 'unified'"
      :question-id="question.id"
      :question-title="displayTitle"
      :question-title-localized="''"
      :has-submitted="session.submitted"
      :attempt-context="assistantAttemptContext"
      :recent-practice="recentPractice"
      :lang="displayLang"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, inject, nextTick, onErrorCaptured, onMounted, onUnmounted, proxyRefs, ref, watch, type Ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { message } from 'ant-design-vue'
import { useI18n } from '@/i18n'
import PracticeAssistant from '@/components/PracticeAssistant.vue'
import PracticeNodeRenderer from '@/components/native-practice/PracticeNodeRenderer.vue'
import { useReadingPracticeSession } from '@/composables/useReadingPracticeSession'
import { useAchievementStore } from '@/store/achievementStore'
import { usePracticeStore, type PracticeRecord } from '@/store/practiceStore'
import { useQuestionStore } from '@/store/questionStore'
import { ACHIEVEMENT_UNLOCKED, eventBus, PRACTICE_UPDATED } from '@/utils/eventBus'
import { formatAnswerDisplay } from '@/utils/readingPractice'
import type { AttemptContext, RecentPracticeItem } from '@/types/assistant'
import type { HighlightScope, PracticeFontScale, PracticeHighlightRecord, PracticeRouteMode, ReadingAstNode } from '@/types/readingNative'

/** 宽松包含匹配的最短长度，避免 "the" 误匹配 "there" 等 */
const HIGHLIGHT_LOOSE_MIN_LEN = 4

function normalizeHighlightComparable(s: string): string {
  return s.trim().replace(/\s+/g, ' ')
}

/**
 * 将当前划选与已存高亮对齐：精确 / 空白规范化 / 大小写不敏感 / 双向包含（用于划选与存储不完全一致时仍能点 Remove）。
 */
function findHighlightMatchForSelection(
  highlights: PracticeHighlightRecord[],
  scope: HighlightScope,
  selectedRaw: string
): PracticeHighlightRecord | null {
  const selected = normalizeHighlightComparable(selectedRaw)
  if (!selected) {
    return null
  }
  const list = highlights.filter((e) => e.scope === scope)
  const selectedLower = selected.toLowerCase()

  for (const e of list) {
    const stored = normalizeHighlightComparable(e.text)
    if (stored === selected) {
      return e
    }
    if (stored.toLowerCase() === selectedLower) {
      return e
    }
  }

  for (const e of list) {
    if (e.text.trim() === selectedRaw.trim()) {
      return e
    }
  }

  for (const e of list) {
    const stored = normalizeHighlightComparable(e.text)
    const sl = stored.toLowerCase()
    if (stored.length < HIGHLIGHT_LOOSE_MIN_LEN || selected.length < HIGHLIGHT_LOOSE_MIN_LEN) {
      continue
    }
    if (sl.includes(selectedLower) || selectedLower.includes(sl)) {
      return e
    }
  }

  return null
}

interface SelectionToolbarState {
  visible: boolean
  scope: HighlightScope
  text: string
  top: number
  left: number
}

const route = useRoute()
const router = useRouter()
const { t } = useI18n()
const questionStore = useQuestionStore()
const practiceStore = usePracticeStore()
const achievementStore = useAchievementStore()
const currentLang = inject<Readonly<Ref<'zh' | 'en'>>>('currentLang', ref('zh') as Readonly<Ref<'zh' | 'en'>>)

questionStore.loadQuestions()
practiceStore.load()
achievementStore.load()

const questionId = computed(() => (typeof route.query.id === 'string' ? route.query.id : ''))
const routeMode = computed<PracticeRouteMode>(() => {
  const raw = typeof route.query.mode === 'string' ? route.query.mode : 'single'
  return raw === 'review' || raw === 'simulation' ? raw : 'single'
})
const recordId = computed(() => (typeof route.query.recordId === 'string' ? route.query.recordId : ''))
const suiteSessionId = computed(() => (typeof route.query.suiteSessionId === 'string' ? route.query.suiteSessionId : ''))

const sessionState = useReadingPracticeSession({
  examId: questionId,
  mode: routeMode,
  recordId,
  suiteSessionId
})
const session = proxyRefs(sessionState)

const question = computed(() => questionStore.getQuestionById(questionId.value) ?? null)
const displayLang = computed<'zh' | 'en'>(() => (currentLang.value === 'en' ? 'en' : 'zh'))
const displayTitle = computed(() => question.value?.title || sessionState.exam.value?.meta.title || 'IELTS Reading')
const subtitleText = computed(() => {
  if (routeMode.value === 'review') return 'Review mode'
  if (routeMode.value === 'simulation') return 'Simulation mode'
  return ''
})
const modeLabel = computed(() => {
  if (routeMode.value === 'review') return 'Review Session'
  if (routeMode.value === 'simulation') return 'Simulation Session'
  return 'Single Practice'
})

const fontScaleOptions: Array<{ value: PracticeFontScale }> = [
  { value: 'small' },
  { value: 'medium' },
  { value: 'large' }
]

const contentWrapper = ref<HTMLElement | null>(null)
const passagePane = ref<HTMLElement | null>(null)
const questionPane = ref<HTMLElement | null>(null)
const isFullscreen = ref(false)
const practiceStartedAt = ref(Date.now())
const assistantAttemptContext = ref<AttemptContext | null>(null)
const runtimeError = ref('')
const activeQuestionNumber = ref<string>('1')
const selectionToolbar = ref<SelectionToolbarState>({
  visible: false,
  scope: 'passage',
  text: '',
  top: 0,
  left: 0
})

const noteModal = ref({
  visible: false,
  selectedText: '',
  userNote: '',
  top: 0,
  left: 0
})

// 拖拽调整宽度相关
const leftPaneWidth = ref(50)
const isResizing = ref(false)
const resizerLayoutRef = ref<HTMLElement | null>(null)

const passageNodes = computed(() => sessionState.exam.value?.passageBlocks.flatMap((block) => block.nodes) || [])

/** Flatten text from an AST node (for matching duplicate headings). */
function flattenAstText(node: ReadingAstNode): string {
  if (node.type === 'text') {
    return node.text
  }
  if (node.type === 'element') {
    return node.children.map(flattenAstText).join('')
  }
  return ''
}

/**
 * Source HTML often repeats the article title as &lt;h3&gt; after "READING PASSAGE n" while the pane
 * header already shows `meta.title` — hide that duplicate for cleaner hierarchy.
 */
function stripDuplicatePassageArticleHeading(nodes: ReadingAstNode[], articleTitle: string | undefined): ReadingAstNode[] {
  const t = articleTitle?.trim()
  if (!t || !nodes.length) {
    return nodes
  }
  const dupIndex = nodes.findIndex((n) => {
    if (n.type !== 'element' || n.tag !== 'h3') {
      return false
    }
    return flattenAstText(n).trim() === t
  })
  if (dupIndex < 0) {
    return nodes
  }
  return nodes.filter((_, i) => i !== dupIndex)
}

const passageNodesForDisplay = computed(() =>
  stripDuplicatePassageArticleHeading(passageNodes.value, sessionState.exam.value?.meta.title)
)
const passageHighlightTerms = computed(() => (sessionState.highlights.value || []).filter((item) => item.scope === 'passage').map((item) => item.text))
const questionHighlightTerms = computed(() => (sessionState.highlights.value || []).filter((item) => item.scope === 'questions').map((item) => item.text))
const answeredCount = computed(() => Object.values(sessionState.answerMap.value || {}).filter((value) => hasAnswerValue(value)).length)
const recentPractice = computed<RecentPracticeItem[]>(() =>
  practiceStore.records.slice(0, 10).map((record) => ({
    questionId: record.questionId,
    accuracy: record.accuracy,
    category: record.category,
    duration: record.duration
  }))
)
const reviewEntries = computed(() => {
  if (!sessionState.result.value || !sessionState.exam.value) {
    return []
  }
  const exam = sessionState.exam.value
  return exam.questionOrder.map((questionIdValue) => {
    const answerEntry = sessionState.result.value?.answerComparison?.[questionIdValue]
    const explanationEntry = sessionState.explanation.value?.questionMap?.[questionIdValue]
    const questionItem = exam.questionItems?.find((item) => item.questionId === questionIdValue)
    return {
      questionId: questionIdValue,
      anchorId: questionItem?.anchorId || exam.questionAnchors?.[questionIdValue] || questionIdValue,
      userAnswer: answerEntry?.userAnswer || '',
      correctAnswer: answerEntry?.correctAnswer || '',
      isCorrect: answerEntry?.isCorrect ?? null,
      explanation: explanationEntry?.text || ''
    }
  })
})
const matchingHighlightForSelection = computed(() =>
  findHighlightMatchForSelection(sessionState.highlights.value || [], selectionToolbar.value.scope, selectionToolbar.value.text)
)

const selectionAlreadyHighlighted = computed(() => Boolean(matchingHighlightForSelection.value))

function hasAnswerValue(value: string | string[]) {
  if (Array.isArray(value)) {
    return value.some((entry) => String(entry || '').trim())
  }
  return Boolean(String(value || '').trim())
}

function questionLabel(questionIdValue: string) {
  return sessionState.exam.value?.questionDisplayMap[questionIdValue] || questionIdValue.replace(/^q/i, '')
}

function formatAnswer(value: string | string[]) {
  return formatAnswerDisplay(value)
}

function buildAttemptContextFromResult() {
  if (!sessionState.result.value || !sessionState.exam.value) {
    return null
  }
  const wrongQuestions = sessionState.exam.value.questionOrder
    .filter((questionIdValue) => sessionState.result.value?.answerComparison?.[questionIdValue]?.isCorrect === false)
    .map((questionIdValue) => questionLabel(questionIdValue))

  return {
    selectedAnswers: Object.fromEntries(
      Object.entries(sessionState.result.value.answers || {}).map(([key, value]) => [key, formatAnswer(value)])
    ),
    score: sessionState.result.value.scoreInfo?.correct,
    wrongQuestions,
    submitted: true
  } satisfies AttemptContext
}

function applyAttemptContext() {
  assistantAttemptContext.value = buildAttemptContextFromResult()
}

function buildPracticeRecord() {
  if (!sessionState.result.value) {
    return null
  }
  const duration = Math.max(1, Math.round((Date.now() - practiceStartedAt.value) / 1000))
  return {
    questionId: question.value?.id || sessionState.result.value.metadata.examId,
    questionTitle: displayTitle.value,
    category: String(question.value?.category || sessionState.result.value.metadata.category || ''),
    duration,
    correctAnswers: sessionState.result.value.scoreInfo.correct,
    totalQuestions: sessionState.result.value.scoreInfo.totalQuestions,
    accuracy: sessionState.result.value.scoreInfo.percentage,
    score: sessionState.result.value.scoreInfo.correct,
    mode: routeMode.value,
    markedQuestions: [...sessionState.markedQuestions.value],
    highlights: [...sessionState.highlights.value],
    resultSnapshot: sessionState.result.value
  } satisfies Omit<PracticeRecord, 'id' | 'time'>
}

function savePracticeRecord() {
  const record = buildPracticeRecord()
  if (!record) {
    return
  }
  practiceStore.add(record as PracticeRecord)
  eventBus.emit(PRACTICE_UPDATED, { record, records: practiceStore.records })
  achievementStore.check()
}

function submitPractice() {
  const resultEntry = sessionState.submit()
  if (!resultEntry) {
    return
  }
  applyAttemptContext()
  savePracticeRecord()
  const s = resultEntry.scoreInfo
  const toastText = t('practiceMode.submitResultBanner', {
    correct: String(s.correct),
    total: String(s.totalQuestions),
    accuracy: String(s.percentage)
  })
  // 全屏练习时 message 默认挂在 body，会落在全屏层之外而不可见
  message.config({
    getContainer: () => (document.fullscreenElement as HTMLElement | null) ?? document.body
  })
  message.success({
    content: toastText,
    duration: 4.5
  })
}

function openPdf() {
  if (!question.value?.pdfPath) {
    message.warning('PDF path is unavailable.')
    return
  }
  const popup = window.open(question.value.pdfPath, `pdf_${Date.now()}`, 'width=1000,height=800,scrollbars=yes,resizable=yes')
  if (!popup) {
    window.location.href = question.value.pdfPath
  }
}

function goBack() {
  const query: Record<string, string> = {}
  const keys = ['category', 'frequency', 'search', 'page', 'pageSize', 'sort']
  keys.forEach((key) => {
    const value = route.query[key]
    if (typeof value === 'string' && value) {
      query[key] = value
    }
  })
  router.push({ path: '/browse', query })
}

function toggleFullscreen() {
  if (!contentWrapper.value) {
    return
  }
  if (!document.fullscreenElement) {
    void contentWrapper.value.requestFullscreen?.()
    return
  }
  void document.exitFullscreen?.()
}

function handleFullscreenChange() {
  isFullscreen.value = Boolean(document.fullscreenElement)
}

function navItemClass(questionIdValue: string) {
  const resultEntry = sessionState.result.value?.answerComparison?.[questionIdValue]
  return {
    answered: hasAnswerValue(sessionState.answerMap.value?.[questionIdValue] || ''),
    correct: resultEntry?.isCorrect === true,
    incorrect: resultEntry?.isCorrect === false,
    marked: isMarked(questionIdValue)
  }
}

function isMarked(questionIdValue: string) {
  return (sessionState.markedQuestions.value || []).includes(questionIdValue)
}

async function scrollToQuestion(questionId: string, anchorId: string) {
  await nextTick()

  const questionPaneEl = questionPane.value
  const passagePaneEl = passagePane.value

  console.log('[scrollToQuestion] called:', { questionId, anchorId, questionPaneEl, passagePaneEl })

  if (!questionPaneEl) {
    console.error('[scrollToQuestion] questionPane is not ready')
    return
  }

  if (!anchorId) {
    console.warn('[scrollToQuestion] anchorId is missing, using questionId as fallback')
    anchorId = questionId
  }

  // Update active question number for assistant quick actions
  updateActiveQuestionNumber(questionId.replace(/^q/i, ''))

  let element: HTMLElement | null = null
  let targetPane: HTMLElement | null = questionPaneEl

  // Priority 1: exact anchorId match in passage pane
  if (passagePaneEl && anchorId) {
    try {
      const escapedId = CSS.escape(anchorId)
      element = passagePaneEl.querySelector(`#${escapedId}`) as HTMLElement | null
      console.log('[scrollToQuestion] Priority 1 result:', { anchorId, escapedId, found: !!element })
      if (element) {
        targetPane = passagePaneEl
      }
    } catch (e) {
      console.error('[scrollToQuestion] Priority 1 error:', e)
    }
  }

  // Priority 2: exact anchorId match in question pane
  if (!element && anchorId) {
    try {
      const escapedId = CSS.escape(anchorId)
      element = questionPaneEl.querySelector(`#${escapedId}`) as HTMLElement | null
      console.log('[scrollToQuestion] Priority 2 result:', { anchorId, escapedId, found: !!element })
    } catch (e) {
      console.error('[scrollToQuestion] Priority 2 error:', e)
    }
  }

  // Priority 3: exact data-question match (search both panes)
  if (!element && questionId) {
    element = questionPaneEl.querySelector(`[data-question="${questionId}"]`) as HTMLElement | null
    console.log('[scrollToQuestion] Priority 3 question pane:', { questionId, found: !!element })
    if (!element && passagePaneEl) {
      element = passagePaneEl.querySelector(`[data-question="${questionId}"]`) as HTMLElement | null
      console.log('[scrollToQuestion] Priority 3 passage pane:', { questionId, found: !!element })
      if (element) targetPane = passagePaneEl
    }
  }

  // Priority 4: shared group container fallback
  if (!element && questionId) {
    const groupContainers = questionPaneEl.querySelectorAll('.question-group-card[data-question-ids]')
    console.log('[scrollToQuestion] Priority 4 group containers:', { count: groupContainers.length })
    for (const container of groupContainers) {
      const questionIds = (container.getAttribute('data-question-ids') || '').split(' ')
      if (questionIds.includes(questionId)) {
        element = container as HTMLElement
        console.log('[scrollToQuestion] Priority 4 found group:', { questionId, groupId: container.id })
        break
      }
    }
  }

  // Priority 5: exact id match variants (search both panes)
  if (!element && questionId) {
    const exactIds = [
      questionId,
      `${questionId}_input`,
      `${questionId}_select`,
      `${questionId}_textarea`,
      `${questionId}_group`
    ]
    for (const candidateId of exactIds) {
      try {
        const escapedId = CSS.escape(candidateId)
        element = questionPaneEl.querySelector(`#${escapedId}`) as HTMLElement | null
        console.log('[scrollToQuestion] Priority 5 check:', { candidateId, found: !!element })
        if (element) break
        if (passagePaneEl) {
          element = passagePaneEl.querySelector(`#${escapedId}`) as HTMLElement | null
          if (element) {
            targetPane = passagePaneEl
            break
          }
        }
      } catch (e) {
        console.error('[scrollToQuestion] Priority 5 error:', e)
      }
    }
  }

  if (!element) {
    // Debug: log available IDs in question pane
    const allIds = Array.from(questionPaneEl.querySelectorAll('[id]')).map(el => el.id)
    console.error(`[scrollToQuestion] No target found for ${questionId} (anchor: ${anchorId}). Available IDs:`, allIds.slice(0, 20))
    return
  }

  // Manual scroll calculation for precise control over which pane scrolls
  const paneRect = targetPane.getBoundingClientRect()
  const elementRect = element.getBoundingClientRect()
  const relativeTop = elementRect.top - paneRect.top + targetPane.scrollTop - paneRect.height / 2 + elementRect.height / 2

  // Use scrollTop for better compatibility
  targetPane.scrollTop = Math.max(0, relativeTop)
  console.log('[scrollToQuestion] Scrolled to element:', element.id || element.className)
}

function handleOptionSelection(node: { poolId: string; value: string }) {
  sessionState.selectOption(node.poolId, node.value)
}

function updateActiveQuestionNumber(questionNumber: string) {
  activeQuestionNumber.value = questionNumber
}

function handleDropzoneSet(payload: { questionId: string; poolId: string; value: string; label: string }) {
  const matchedOption = sessionState.exam.value?.options.find((option) => option.poolId === payload.poolId && option.value === payload.value)
  sessionState.setDropzoneValue(payload.questionId, {
    poolId: payload.poolId,
    value: payload.value,
    label: matchedOption?.label || payload.label || payload.value
  })
}

function clearSelections() {
  sessionState.clearHighlights()
  closeSelectionToolbar()
}

function closeSelectionToolbar() {
  selectionToolbar.value = {
    visible: false,
    scope: 'passage',
    text: '',
    top: 0,
    left: 0
  }
}

function handleSelection(scope: HighlightScope) {
  const selection = window.getSelection()
  const text = String(selection?.toString() || '').trim()
  const pane = scope === 'passage' ? passagePane.value : questionPane.value
  if (!selection || !text || !selection.rangeCount || !pane) {
    closeSelectionToolbar()
    return
  }

  const range = selection.getRangeAt(0)
  const commonNode = range.commonAncestorContainer.nodeType === Node.TEXT_NODE
    ? range.commonAncestorContainer.parentElement
    : (range.commonAncestorContainer as Element)

  // 检查选中内容是否在当前面板内（包括全屏模式）
  // 使用更宽松的检查：检查 commonNode 是否存在且在文档中
  if (!commonNode || !document.body.contains(commonNode)) {
    closeSelectionToolbar()
    return
  }

  // 在全屏模式下，检查是否在全屏元素内
  const fullscreenElement = document.fullscreenElement
  if (fullscreenElement) {
    // 全屏模式下，只要元素在全屏容器内就允许
    if (!fullscreenElement.contains(commonNode)) {
      closeSelectionToolbar()
      return
    }
  } else {
    // 非全屏模式，检查是否在特定面板内
    if (!pane.contains(commonNode)) {
      closeSelectionToolbar()
      return
    }
  }

  // 使用 fixed 定位，直接使用视口坐标
  const rect = range.getBoundingClientRect()
  
  selectionToolbar.value = {
    visible: true,
    scope,
    text,
    top: rect.top - 45,
    left: rect.left + rect.width / 2 - 48
  }
}

function clearBrowserSelection() {
  const selection = window.getSelection()
  if (selection) {
    selection.removeAllRanges()
  }
}

function applySelectionHighlight() {
  sessionState.addHighlight({
    scope: selectionToolbar.value.scope,
    text: selectionToolbar.value.text
  })
  clearBrowserSelection()
  closeSelectionToolbar()
}

function removeSelectionHighlight() {
  const hit = matchingHighlightForSelection.value
  if (!hit) {
    return
  }
  sessionState.removeHighlight({ scope: hit.scope, text: hit.text })
  clearBrowserSelection()
  closeSelectionToolbar()
}

function openNoteModal() {
  const text = selectionToolbar.value.text
  if (text) {
    noteModal.value = {
      visible: true,
      selectedText: text,
      userNote: '',
      top: selectionToolbar.value.top - 180,
      left: selectionToolbar.value.left - 60
    }
  }
  closeSelectionToolbar()
}

function cancelNoteModal() {
  noteModal.value.visible = false
  clearBrowserSelection()
}

function saveNoteToSession() {
  const text = noteModal.value.selectedText
  const userNote = noteModal.value.userNote
  const finalNote = userNote ? `${text}\nNote: ${userNote}` : text
  const currentNotes = sessionState.notesText.value || ''
  sessionState.notesText.value = currentNotes ? `${currentNotes}\n${finalNote}` : finalNote
  sessionState.notesOpen.value = true
  noteModal.value.visible = false
  clearBrowserSelection()
}

function handlePaneScroll(scope: HighlightScope) {
  sessionState.setScrollState({
    passageTop: scope === 'passage' ? passagePane.value?.scrollTop || 0 : sessionState.scrollState.value.passageTop,
    questionsTop: scope === 'questions' ? questionPane.value?.scrollTop || 0 : sessionState.scrollState.value.questionsTop
  })
}

function restorePaneScroll() {
  nextTick(() => {
    if (passagePane.value) {
      passagePane.value.scrollTop = sessionState.scrollState.value.passageTop
    }
    if (questionPane.value) {
      questionPane.value.scrollTop = sessionState.scrollState.value.questionsTop
    }
  })
}

watch(
  () => sessionState.exam.value?.examId,
  (value) => {
    if (!value) {
      return
    }
    runtimeError.value = ''
    practiceStartedAt.value = Date.now()
    restorePaneScroll()
    closeSelectionToolbar()
    applyAttemptContext()

    // Initialize active question number to the first question's display number
    const firstQuestionId = sessionState.exam.value?.questionOrder?.[0]
    if (firstQuestionId) {
      updateActiveQuestionNumber(questionLabel(firstQuestionId))
    }
  }
)

watch(
  () => sessionState.result.value,
  () => {
    applyAttemptContext()
  }
)

// 拖拽调整宽度函数
function startResize(event: MouseEvent) {
  event.preventDefault()
  isResizing.value = true
  document.addEventListener('mousemove', handleResize)
  document.addEventListener('mouseup', stopResize)
  document.body.style.cursor = 'col-resize'
  document.body.style.userSelect = 'none'
}

function stopResize() {
  isResizing.value = false
  document.removeEventListener('mousemove', handleResize)
  document.removeEventListener('mouseup', stopResize)
  document.body.style.cursor = ''
  document.body.style.userSelect = ''
}

function handleResize(event: MouseEvent) {
  if (!isResizing.value || !contentWrapper.value) return
  
  const container = contentWrapper.value
  const containerRect = container.getBoundingClientRect()
  const newWidth = ((event.clientX - containerRect.left) / containerRect.width) * 100
  
  // 限制最小和最大宽度
  leftPaneWidth.value = Math.min(75, Math.max(25, newWidth))
}

function resetResize() {
  leftPaneWidth.value = 50
}

onMounted(() => {
  document.addEventListener('fullscreenchange', handleFullscreenChange)
})

onUnmounted(() => {
  document.removeEventListener('fullscreenchange', handleFullscreenChange)
})

onErrorCaptured((error) => {
  runtimeError.value = error instanceof Error ? error.message : String(error)
  return false
})
</script>

<style scoped>
.practice-mode-page { max-width: 1520px; margin: 0 auto; }
.page-header, .header-left, .header-actions, .font-switcher, .state-actions, .pane-toolbar, .bottom-actions, .review-card-header, .review-answer-grid { display: flex; align-items: center; }
.page-header { justify-content: space-between; gap: 12px; margin-bottom: 16px; }
.header-left { gap: 12px; min-width: 0; flex: 1; }
.page-title { margin: 0; font-size: 18px; font-weight: 700; color: var(--text-primary); flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.header-actions { gap: 8px; flex-shrink: 0; }
.icon-btn, .toolbar-btn, .font-btn, .state-button, .footer-btn, .mini-link, .selection-btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 6px; border: 1px solid var(--border-color);
  background: var(--bg-primary); color: var(--text-primary); cursor: pointer; transition: all 0.2s ease;
}
.icon-btn { width: 40px; height: 40px; border-radius: 10px; }
.icon-btn.small { width: 32px; height: 32px; border-radius: 8px; }
.toolbar-btn, .state-button, .footer-btn, .selection-btn { min-height: 38px; padding: 0 12px; border-radius: 10px; font-size: 14px; font-weight: 600; }
.toolbar-btn.active, .font-btn.active, .footer-btn.primary, .state-button.primary { background: var(--primary-color); border-color: var(--primary-color); color: #fff; }
.toolbar-btn.quiet, .selection-btn.quiet { background: var(--bg-secondary); }
.toolbar-btn-compact { padding: 0 8px; white-space: nowrap; min-height: 38px; }
.pane-toolbar { gap: 8px; margin-left: auto; flex-wrap: nowrap; justify-content: flex-end; }
.font-switcher { gap: 6px; }
.font-btn { width: 38px; height: 38px; border-radius: 999px; font-weight: 700; font-size: 14px; }
.practice-section { padding: 24px; background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 18px; }
.state-card, .loading-card {
  min-height: 320px; padding: 32px; border-radius: 16px; border: 1px dashed var(--border-color);
  background: var(--bg-secondary); display: flex; flex-direction: column; justify-content: center; gap: 12px;
}
.loading-card { align-items: center; text-align: center; }
.loading-spinner { font-size: 48px; color: var(--primary-color); animation: spin 1s linear infinite; }
.state-title { margin: 0; font-size: 22px; }
.state-description { margin: 0; max-width: 680px; color: var(--text-secondary); line-height: 1.7; }
.state-banner {
  display: flex; justify-content: space-between; align-items: center; gap: 16px; margin-bottom: 16px; padding: 14px 16px;
  border-radius: 14px; border: 1px solid rgba(249, 115, 22, 0.3); background: rgba(249, 115, 22, 0.1);
}
.state-banner-copy { display: flex; flex-direction: column; gap: 4px; color: var(--text-secondary); }
.native-practice-shell { position: relative; --practice-copy-size: 16px; --practice-heading-size: 26px; }
.native-practice-shell.font-small { --practice-copy-size: 15px; --practice-heading-size: 24px; }
.native-practice-shell.font-large { --practice-copy-size: 18px; --practice-heading-size: 30px; }
.native-practice-layout { display: flex; gap: 0; align-items: stretch; min-height: 74vh; }
.native-practice-layout:has(.notes-panel) { }
.practice-pane, .notes-panel, .nav-shell { background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 18px; }
.practice-pane { min-height: 74vh; max-height: 74vh; overflow: auto; }
.passage-pane { flex: none; width: calc(v-bind(leftPaneWidth) * 1% - 4px); }
.question-pane { flex: 1; min-width: 0; }
.pane-resizer {
  width: 8px;
  background: transparent;
  cursor: col-resize;
  flex-shrink: 0;
  position: relative;
  z-index: 10;
  margin: 0 4px;
  border-radius: 4px;
  transition: background 0.2s ease;
  display: flex;
  align-items: center;
  justify-content: center;
}
.pane-resizer:hover {
  background: var(--primary-color);
}
.pane-resizer:active {
  background: var(--primary-color);
}
.resizer-icon {
  font-size: 18px;
  color: var(--text-tertiary);
  transform: rotate(90deg);
  transition: color 0.2s ease;
}
.pane-resizer:hover .resizer-icon {
  color: white;
}
.pane-header, .notes-header {
  display: flex; justify-content: space-between; align-items: center; gap: 16px; padding: 20px 22px 16px;
  border-bottom: 1px solid var(--border-light); position: sticky; top: 0; z-index: 5; background: var(--bg-secondary);
}
.passage-pane .pane-header {
  align-items: flex-start;
}
.passage-pane .pane-header > div:first-child {
  min-width: 0;
}
.pane-kicker { margin: 0 0 4px; color: var(--text-tertiary); font-size: 12px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; }
.pane-header h2, .notes-header h3 { margin: 0; font-size: 20px; color: var(--text-primary); }
.passage-pane .pane-header h2 {
  font-size: 22px;
  font-weight: 800;
  letter-spacing: -0.02em;
  line-height: 1.25;
}
.pane-toolbar .toolbar-btn { min-height: 38px; padding: 0 12px; }
.pane-toolbar .font-btn { width: 34px; height: 34px; }
.pane-content { padding: 20px 24px 28px; color: var(--text-primary); font-size: var(--practice-copy-size); line-height: 1.8; }
.passage-content :deep(h2), .passage-content :deep(h3), .passage-content :deep(h4), .question-content :deep(h2), .question-content :deep(h3), .question-content :deep(h4) { color: var(--text-primary); line-height: 1.3; }
.passage-content :deep(h2), .question-content :deep(h2) { font-size: calc(var(--practice-heading-size) * 0.92); }
/* IELTS template: first h2 is "READING PASSAGE n" — style as eyebrow, not a second page title */
.passage-content :deep(h2:first-of-type) {
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--text-tertiary);
  margin: 0 0 8px;
}
.passage-content :deep(h2:first-of-type + p) {
  font-size: 13px;
  line-height: 1.55;
  color: var(--text-secondary);
  margin: 0 0 16px;
}
.passage-content :deep(h3), .question-content :deep(h3) { font-size: calc(var(--practice-heading-size) * 0.8); }
.passage-content :deep(h4), .question-content :deep(h4) { font-size: calc(var(--practice-heading-size) * 0.68); }
.passage-content :deep(p), .passage-content :deep(li), .question-content :deep(p), .question-content :deep(li), .question-content :deep(label), .question-content :deep(td), .question-content :deep(th) { font-size: var(--practice-copy-size); }
.passage-content :deep(.paragraph-wrapper), .question-content :deep(.question-item), .question-content :deep(.table-wrapper), .question-content :deep(table) { margin-bottom: 18px; }
.question-content :deep(.question-item) { padding: 16px 18px; border-radius: 16px; background: var(--bg-tertiary); border: 1px solid var(--border-light); }
/* 勿把 ul.options-list / div.radio-options 放在 flex 里，会与下方 grid 冲突；题型用 div+label 时仍走 flex 会错位 */
.question-content :deep(.summary-choices), .question-content :deep(.matching-headings), .question-content :deep(.matching-options), .question-content :deep(.pool-items), .question-content :deep(.cardpool), .question-content :deep(.drag-options), .question-content :deep(.options-pool), .question-content :deep(#word-options), .question-content :deep(#word-options-pool) { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 12px; justify-content: flex-start; align-content: flex-start; align-items: flex-start; }
/* 部分题库在 .pool-items 上内联了 flex-direction:column，需覆盖为横向换行 */
.question-content :deep(.pool-items) {
  flex-direction: row !important;
  flex-wrap: wrap !important;
  align-items: flex-start !important;
}
/* 少数试卷在内联 style 里把选项容器写成 column；覆盖为与 MCQ 一致的换行横排 */
.question-content :deep(.question-item > div[style*='flex-direction: column']) {
  display: flex !important;
  flex-direction: row !important;
  flex-wrap: wrap !important;
  align-items: center !important;
  gap: 10px 14px !important;
}
.question-content :deep(.question-item > div[style*='flex-direction: column'] > label) {
  width: auto !important;
  max-width: min(100%, 38rem) !important;
  box-sizing: border-box;
}
/* MCQ 选项：横向换行，短标签同排；长文由 label max-width + overflow-wrap 控制 */
.question-content :deep(.radio-options),
.question-content :deep(.mcq-options),
.question-content :deep(.multiple-choice-options),
.question-content :deep(.multi-choice-options),
.question-content :deep(.checkbox-options) {
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px 14px;
  margin-top: 12px;
}
/* TFNG（TRUE / FALSE / NOT GIVEN）：此前未进上列 flex，三枚 label 仅靠 inline 排列过密；单独加大列间距 */
.question-content :deep(.tfng-options),
.question-content :deep(.radio-options.tfng-options) {
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 24px;
  margin-top: 10px;
}
/* 题库在内联 style 里写 column 的 MCQ 容器（优先级高于无 !important 的类选择器） */
.question-content :deep(.radio-options[style]),
.question-content :deep(.mcq-options[style]),
.question-content :deep(.multiple-choice-options[style]),
.question-content :deep(.multi-choice-options[style]),
.question-content :deep(.checkbox-options[style]) {
  flex-direction: row !important;
  flex-wrap: wrap !important;
  align-items: center !important;
}
/* 无外层 .mcq-options 时题干下直接铺 label.mcq-option：题干块独占一行，选项区换行排列 */
.question-content :deep(.question-item:has(> label.mcq-option)) {
  display: flex;
  flex-wrap: wrap;
  gap: 10px 14px;
  align-items: center;
}
.question-content :deep(.question-item:has(> label.mcq-option) > :not(label.mcq-option)) {
  flex: 1 1 100%;
  width: 100%;
  min-width: 0;
}
.question-content :deep(.question-item > label.mcq-option) {
  display: grid !important;
  grid-template-columns: auto 1fr;
  column-gap: 8px;
  row-gap: 4px;
  align-items: start;
  width: auto;
  max-width: min(100%, 38rem);
  box-sizing: border-box;
  overflow-wrap: break-word;
}
/* 多选 TWO/THREE 等题型用 div.choice-item 包 label，此前未设间距，选项会上下贴死 */
.question-content :deep(.choice-item) {
  display: block;
  margin-bottom: 12px;
}
.question-content :deep(.choice-item:last-child) {
  margin-bottom: 0;
}
.question-content :deep(.question-item > label.mcq-option ~ label.mcq-option) {
  margin-top: 12px;
}
.question-content :deep(label) { display: inline-flex; align-items: center; gap: 8px; padding: 8px 10px; border-radius: 12px; background: var(--bg-tertiary); }
.question-content :deep(ul), .question-content :deep(ol) { padding-left: 20px; }
/* 配对/标题等列表：仍可换行多列；与 MCQ 分列定义，避免 MCQ 宽屏挤成两列 */
.question-content :deep(.question-item .options-list),
.question-content :deep(.question-item .radio-options-list),
.question-content :deep(.question-item .question-options-list) {
  display: flex !important;
  flex-wrap: wrap;
  gap: 10px 14px;
  justify-content: flex-start;
  align-items: stretch;
  padding-left: 0;
  padding-inline-start: 0;
  margin-left: 0;
  margin-top: 12px;
  list-style: none;
  font-size: 0;
  line-height: 0;
}
.question-content :deep(.question-item .radio-options),
.question-content :deep(.question-item .mcq-options),
.question-content :deep(.question-item .multiple-choice-options),
.question-content :deep(.question-item .multi-choice-options),
.question-content :deep(.question-item .checkbox-options) {
  display: flex !important;
  flex-direction: row;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px 14px;
  justify-content: flex-start;
  padding-left: 0;
  padding-inline-start: 0;
  margin-left: 0;
  margin-top: 12px;
  list-style: none;
  font-size: 0;
  line-height: 0;
}
.question-content :deep(.question-item .tfng-options),
.question-content :deep(.question-item .radio-options.tfng-options) {
  display: flex !important;
  flex-direction: row;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 24px !important;
  justify-content: flex-start;
  margin-top: 10px;
  font-size: var(--practice-copy-size);
  line-height: 1.5;
}
.question-content :deep(.question-item .options-list > li),
.question-content :deep(.question-item .radio-options-list > li),
.question-content :deep(.question-item .question-options-list > li) {
  flex: 0 1 auto;
  max-width: min(100%, 38rem);
  min-width: 0;
  box-sizing: border-box;
  font-size: var(--practice-copy-size);
  line-height: 1.5;
}
.question-content :deep(.question-item .mcq-options > li),
.question-content :deep(.question-item .radio-options > label),
.question-content :deep(.question-item .mcq-options > label),
.question-content :deep(.question-item .multiple-choice-options > label),
.question-content :deep(.question-item .multi-choice-options > label),
.question-content :deep(.question-item .checkbox-options > label) {
  flex: 0 1 auto;
  width: auto;
  max-width: min(100%, 38rem);
  min-width: 0;
  box-sizing: border-box;
  font-size: var(--practice-copy-size);
  line-height: 1.5;
}
.question-content :deep(.question-item .options-list li),
.question-content :deep(.question-item .radio-options-list li),
.question-content :deep(.question-item .question-options-list li) {
  list-style: none;
}
.question-content :deep(.question-item .options-list li label),
.question-content :deep(.question-item .radio-options-list li label),
.question-content :deep(.question-item .question-options-list li label) {
  display: grid !important;
  grid-template-columns: auto 1fr;
  column-gap: 8px;
  row-gap: 4px;
  align-items: start;
  width: 100%;
  min-width: 0;
  box-sizing: border-box;
  overflow-wrap: break-word;
}
.question-content :deep(.question-item .mcq-options li label) {
  display: grid !important;
  grid-template-columns: auto 1fr;
  column-gap: 8px;
  row-gap: 4px;
  align-items: start;
  width: auto;
  max-width: min(100%, 38rem);
  min-width: 0;
  box-sizing: border-box;
  overflow-wrap: break-word;
}
/* MCQ 直接子 label（含 .mcq-options > label）：与 flex 换行一致，不用 100% 拉满整行 */
.question-content :deep(.question-item .radio-options > label),
.question-content :deep(.question-item .mcq-options > label),
.question-content :deep(.question-item .multiple-choice-options > label),
.question-content :deep(.question-item .multi-choice-options > label),
.question-content :deep(.question-item .checkbox-options > label) {
  display: grid !important;
  grid-template-columns: auto 1fr;
  column-gap: 8px;
  row-gap: 4px;
  align-items: start;
  width: auto;
  max-width: min(100%, 38rem);
  min-width: 0;
  box-sizing: border-box;
  overflow-wrap: break-word;
}
/* 多行选项时控件与首行对齐；微上移以补偿单行 cap-height */
.question-content :deep(.question-item label) .native-choice-input[type='radio'],
.question-content :deep(.question-item label) .native-choice-input[type='checkbox'] {
  margin-top: 0.2em;
  vertical-align: top;
}
.question-content :deep(table) { width: 100%; border-collapse: collapse; }
/* Paragraph–letter matching grids (A–J): keep all columns reachable; avoid clipping J on narrow panes */
.question-content :deep(div[style*='overflow-x']),
.question-content :deep(div:has(> table.matching-table)) {
  display: block;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  scrollbar-gutter: stable;
}
/*
  段落匹配表：选项列 min/max 定宽；首列在 auto 布局下吃掉「容器宽度 − 选项带」。
  勿对 table 使用 min-width:max-content（会把首列撑到 800px+，见 debug-1238fb：scrollW 1294 / 首列 876px）。
  使用 table-layout:auto + width:100%，表宽等于滚动容器，首列与选项同屏可见。
  min-width 仅在卷面过窄时保证可点选，略大于 11rem+10 列选项宽。
*/
.question-content :deep(table.matching-table) {
  width: 100%;
  min-width: calc(11rem + 10 * 2.6rem);
  max-width: none;
  table-layout: auto;
  /* Inherit left so statement column is left-aligned; letter columns override below */
  text-align: left;
}
/* 使用 :first-of-type：AST 常在 tr 内保留空白文本节点，导致 td:first-child 匹配不到首列 */
/* 表头：单字母 A–J 定宽；长标题卷（如 A. University …）不设 max，避免截断 */
.question-content :deep(table.matching-table th:not(:first-of-type)) {
  min-width: 2.35rem;
  box-sizing: border-box;
  text-align: center;
  white-space: nowrap;
  vertical-align: middle;
}
/* 选项格：固定宽度，保证右侧「选项带」宽度稳定 */
.question-content :deep(table.matching-table td:not(:first-of-type)) {
  width: 2.6rem;
  min-width: 2.6rem;
  max-width: 2.6rem;
  box-sizing: border-box;
  text-align: center;
  white-space: nowrap;
  vertical-align: middle;
}
.question-content :deep(table.matching-table td:not(:first-of-type) input.native-choice-input) {
  display: block;
  margin-inline: auto;
}
.question-content :deep(table.matching-table th:first-of-type),
.question-content :deep(table.matching-table td:first-of-type) {
  min-width: 11rem;
  max-width: none;
  white-space: normal;
  text-align: left !important;
  overflow-wrap: break-word;
  word-break: break-word;
  vertical-align: top;
}
/* 题干格内常见 <p>/<strong> 等若带居中样式，强制跟随左对齐 */
.question-content :deep(table.matching-table td:first-of-type p),
.question-content :deep(table.matching-table td:first-of-type li) {
  text-align: left !important;
}
.question-content :deep(td), .question-content :deep(th) { padding: 10px 12px; border: 1px solid var(--border-light); vertical-align: top; }
.question-group-card + .question-group-card { margin-top: 18px; }
.score-pill { padding: 8px 12px; border-radius: 999px; background: rgba(37,99,235,0.1); color: var(--primary-color); font-weight: 700; }
.summary-card { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; margin: 0 24px 8px; padding: 14px; border-radius: 16px; border: 1px solid var(--border-light); background: var(--bg-secondary); }
.summary-metric { display: flex; flex-direction: column; gap: 4px; padding: 10px 12px; border-radius: 12px; background: var(--bg-primary); }
.summary-metric strong { font-size: 22px; color: var(--text-primary); }
.summary-metric span { color: var(--text-secondary); font-size: 13px; }
.notes-panel { min-height: 74vh; max-height: 74vh; overflow: hidden; display: flex; flex-direction: column; }
.notes-textarea {
  flex: 1; margin: 20px; border: 1px solid var(--border-color); border-radius: 16px; padding: 16px;
  background: var(--bg-primary); color: var(--text-primary); font: inherit; font-size: 15px; line-height: 1.7; resize: none;
}
.nav-shell {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-top: 20px;
  padding: 12px 16px;
  overflow: hidden;
}
.nav-title, .review-header h3, .review-header p { margin: 0; }
.nav-title {
  flex: 0 0 auto;
  font-size: 16px;
  font-weight: 700;
  color: var(--text-primary);
  white-space: nowrap;
}
.review-header p { color: var(--text-secondary); font-size: 13px; }
.nav-grid {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1 1 auto;
  min-width: 0;
  overflow-x: auto;
  overflow-y: hidden;
  padding-bottom: 2px;
  scrollbar-width: thin;
}
.nav-item { display: inline-flex; align-items: center; justify-content: center; padding: 8px 12px; border-radius: 10px; border: 1px solid var(--border-color); background: var(--bg-tertiary); flex: 0 0 auto; min-width: 44px; cursor: pointer; transition: all 0.2s ease; }
.nav-item:hover { background: rgba(37,99,235,0.12); border-color: var(--primary-color); }
.nav-item.answered { border-color: var(--primary-color); background: rgba(37,99,235,0.08); }
.nav-item.correct { border-color: rgba(34,197,94,0.24); background: rgba(34,197,94,0.08); }
.nav-item.incorrect { border-color: rgba(239,68,68,0.24); background: rgba(239,68,68,0.08); }
.nav-item.marked { box-shadow: inset 0 0 0 1px rgba(245,158,11,0.24); }
.nav-jump { font-weight: 700; color: var(--text-primary); }
.bottom-actions { justify-content: flex-end; gap: 10px; margin-left: auto; flex: 0 0 auto; flex-wrap: nowrap; }
.bottom-actions .footer-btn { min-height: 38px; padding: 0 14px; }
.review-section { margin-top: 28px; display: flex; flex-direction: column; gap: 14px; }
.review-card { padding: 18px; border-radius: 18px; border: 1px solid var(--border-color); background: var(--bg-secondary); }
.review-card.correct { border-color: rgba(34,197,94,0.3); }
.review-card.incorrect { border-color: rgba(239,68,68,0.3); }
.review-card-header { justify-content: space-between; gap: 12px; margin-bottom: 12px; }
.review-card-title { display: flex; align-items: center; gap: 10px; }
.review-badge { padding: 6px 10px; border-radius: 999px; background: var(--bg-primary); color: var(--text-primary); font-size: 12px; font-weight: 700; }
.mini-link { min-height: 28px; padding: 0 10px; border-radius: 999px; font-size: 12px; }
.review-status { font-size: 13px; color: var(--text-secondary); }
.review-answer-grid { gap: 14px; align-items: stretch; }
.review-answer-grid > div { flex: 1; padding: 12px 14px; border-radius: 14px; background: var(--bg-secondary); }
.review-answer-grid p, .review-explanation p { margin: 8px 0 0; line-height: 1.7; white-space: pre-wrap; word-break: break-word; }
.review-kicker { display: inline-flex; font-size: 11px; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; color: var(--primary-color); }
.review-explanation { margin-top: 14px; padding: 14px; border-radius: 14px; background: var(--bg-tertiary); }
.selection-toolbar {
  position: fixed; z-index: 9999; display: flex; gap: 4px; padding: 6px 8px; border-radius: 12px;
  border: 1px solid var(--border-color); background: var(--bg-primary); box-shadow: 0 18px 34px rgba(0,0,0,0.18);
}
.selection-btn .material-icons { font-size: 16px; }
.note-modal {
  position: fixed; z-index: 9999;
  width: 280px; padding: 16px;
  border-radius: 12px;
  border: 1px solid var(--border-color);
  background: var(--bg-primary);
  box-shadow: 0 18px 34px rgba(0,0,0,0.18);
}
.note-modal-header { font-size: 14px; font-weight: 700; margin-bottom: 12px; color: var(--text-primary); }
.note-modal-text {
  font-size: 13px; color: var(--text-secondary);
  padding: 8px; border-radius: 8px; background: var(--bg-secondary);
  margin-bottom: 12px; max-height: 60px; overflow: auto; white-space: pre-wrap;
}
.note-modal-input {
  width: 100%; min-height: 60px; resize: vertical;
  padding: 8px; border-radius: 8px; border: 1px solid var(--border-color);
  font-size: 13px; margin-bottom: 12px; background: var(--bg-primary);
}
.note-modal-actions { display: flex; gap: 8px; justify-content: flex-end; }
@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

.native-practice-shell:fullscreen { 
  min-height: 100vh; 
  height: 100vh; 
  width: 100%; 
  background: var(--bg-primary); 
  display: flex; 
  flex-direction: column; 
  overflow: hidden;
}
.native-practice-shell:fullscreen .native-practice-layout { 
  flex: 1; 
  min-height: 0; 
  display: flex; 
  align-items: stretch;
}
.native-practice-shell:fullscreen .native-practice-layout:has(.notes-panel) { 
}
.native-practice-shell:fullscreen .passage-pane { 
  min-height: 0; 
  max-height: none; 
  overflow: auto;
  height: 100%;
}
.native-practice-shell:fullscreen .pane-resizer {
  height: 100%;
}
.native-practice-shell:fullscreen .question-pane { 
  min-height: 0; 
  max-height: none; 
  overflow: auto;
  height: 100%;
}
.native-practice-shell:fullscreen .notes-panel { 
  min-height: 0; 
  max-height: none; 
  overflow: auto;
  height: 100%;
}
.native-practice-shell:fullscreen .nav-shell { 
  flex-shrink: 0; 
}

@media (max-width: 1320px) {
  .native-practice-layout {
    flex-direction: column;
    gap: 16px;
  }
  .native-practice-layout:has(.notes-panel) {
    flex-direction: column;
  }
  .practice-pane, .notes-panel { min-height: 50vh; max-height: none; }
  .passage-pane { width: 100%; flex: none; }
  .question-pane { width: 100%; }
  .pane-resizer { display: none; }
}
@media (max-width: 1080px) {
  .nav-shell {
    display: flex !important;
    flex-wrap: wrap !important;
    align-items: center !important;
    gap: 12px;
  }

  /* Question 标题和按钮在同一行，题号独占一行 */
  .nav-shell .nav-title {
    order: 1;
    flex-shrink: 0;
  }

  .nav-shell .bottom-actions {
    order: 2;
    margin-left: auto;
    flex-shrink: 0;
  }

  .nav-shell .nav-grid {
    order: 3;
    flex: 1 1 100%;
    width: 100%;
  }
}
@media (max-width: 768px) {
  .page-header {
    flex-direction: row;
    flex-wrap: nowrap;
    align-items: center !important;
    gap: 8px;
  }

  .header-left {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
  }

  .page-title {
    font-size: clamp(16px, 4vw, 20px);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 100%;
  }

  .header-actions {
    flex-shrink: 0;
    gap: 4px;
  }

  .practice-section { padding: 16px; }
  .summary-card { grid-template-columns: 1fr; margin: 0 0 12px; }
  .pane-header {
    align-items: flex-start;
    padding: 16px;
  }

  /* 题目面板工具栏：移动端标题在左，三行按钮在右且右对齐 */
  .question-pane .pane-header {
    flex-direction: row;
    justify-content: space-between;
    align-items: flex-start;
    gap: 12px;
  }

  .question-pane .pane-header > div:first-child {
    flex: 1;
    min-width: 0;
  }

  .question-pane .pane-toolbar {
    margin-left: auto;
    flex-direction: column;
    align-items: flex-end;
    width: auto;
    flex-shrink: 0;
    flex-wrap: nowrap;
    gap: 8px;
  }

  .question-pane .pane-toolbar .toolbar-btn {
    width: auto;
    align-self: flex-end;
    justify-content: center;
  }

  .question-pane .pane-toolbar .font-switcher {
    width: auto;
    justify-content: flex-end;
  }

  .nav-shell {
    display: flex !important;
    flex-wrap: wrap !important;
    align-items: center !important;
    gap: 12px;
  }

  /* Question 标题和按钮在同一行，题号独占一行 */
  .nav-shell .nav-title {
    order: 1;
    flex-shrink: 0;
  }

  .nav-shell .bottom-actions {
    order: 2;
    margin-left: auto;
    flex-shrink: 0;
  }

  .nav-shell .nav-grid {
    order: 3;
    flex: 1 1 100%;
    width: 100%;
  }

  .native-practice-layout {
    gap: 12px;
  }

  .practice-pane {
    min-height: 45vh;
    border-radius: 14px;
  }

  /* 图 2: 隐藏全屏按钮 */
  .header-actions .icon-btn[title*="fullscreen"],
  .header-actions .icon-btn[title*="Fullscreen"] {
    display: none !important;
  }

  /* TFNG 选项左对齐 - 覆盖默认 inline-flex 行为 */
  .question-content :deep(.tfng-item),
  .question-content :deep(.tfng-options) {
    display: flex !important;
    flex-direction: column !important;
    align-items: flex-start !important;
    gap: 8px !important;
    width: 100% !important;
    margin-top: 8px !important;
  }

  .question-content :deep(.tfng-item > label),
  .question-content :deep(.tfng-options > label) {
    display: flex !important;
    justify-content: flex-start !important;
    align-items: center !important;
    width: 100% !important;
    margin-right: 0 !important;
    margin-bottom: 4px !important;
    background: var(--bg-tertiary) !important;
    padding: 8px 10px !important;
    border-radius: 12px !important;
  }

  .question-content :deep(.tfng-item input[type="radio"]),
  .question-content :deep(.tfng-options input[type="radio"]) {
    margin-right: 8px !important;
    flex-shrink: 0 !important;
  }
}

@media (max-width: 480px) {
  .practice-section {
    padding: 12px;
  }
  
  .pane-header {
    padding: 12px;
  }
  
  .pane-kicker {
    font-size: 11px;
  }
  
  .pane-header h2 {
    font-size: 16px;
  }
  
  .native-practice-layout {
    gap: 10px;
  }
  
  .practice-pane {
    min-height: 40vh;
    border-radius: 12px;
  }
  
  .nav-shell {
    display: flex !important;
    flex-wrap: wrap !important;
    align-items: center !important;
    gap: 8px;
  }

  .nav-title {
    font-size: 14px;
    order: 1;
    flex-shrink: 0;
  }

  .nav-grid {
    order: 3;
    flex: 1 1 100%;
    width: 100%;
  }

  .nav-btn {
    min-width: 36px;
    height: 36px;
    font-size: 13px;
  }

  .score-pill {
    font-size: 12px;
    padding: 4px 10px;
  }

  .nav-shell .bottom-actions {
    order: 2;
    flex: 0 0 auto;
    margin-left: auto;
    flex-shrink: 0;
    justify-content: flex-end;
  }
  
  .bottom-actions {
    gap: 6px;
    flex-wrap: nowrap;
  }
  
  .bottom-actions .footer-btn {
    min-height: 34px;
    padding: 0 10px;
    font-size: 13px;
  }
  
  .action-btn {
    padding: 10px 16px;
    font-size: 13px;
  }
  
  .question-nav-item {
    width: 32px;
    height: 32px;
    font-size: 12px;
  }
}
</style>
