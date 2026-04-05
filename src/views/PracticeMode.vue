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
                  <p class="pane-kicker">Passage</p>
                  <h2>{{ session.exam.meta.title }}</h2>
                </div>
                <div v-if="session.submitted && session.result" class="score-pill">
                  {{ session.result.scoreInfo.correct }}/{{ session.result.scoreInfo.totalQuestions }}
                </div>
              </div>

              <div class="pane-content passage-content">
                <PracticeNodeRenderer
                  :nodes="passageNodes"
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
                <article v-for="group in session.exam.questionGroups" :key="group.groupId" class="question-group-card">
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
                        <button class="mini-link" type="button" @click="scrollToAnchor(entry.anchorId)">Jump to question</button>
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
                v-for="item in session.exam.questionItems" 
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
import PracticeAssistant from '@/components/PracticeAssistant.vue'
import PracticeNodeRenderer from '@/components/native-practice/PracticeNodeRenderer.vue'
import { useReadingPracticeSession } from '@/composables/useReadingPracticeSession'
import { useAchievementStore } from '@/store/achievementStore'
import { usePracticeStore, type PracticeRecord } from '@/store/practiceStore'
import { useQuestionStore } from '@/store/questionStore'
import { ACHIEVEMENT_UNLOCKED, eventBus, PRACTICE_UPDATED } from '@/utils/eventBus'
import { formatAnswerDisplay } from '@/utils/readingPractice'
import type { AttemptContext, RecentPracticeItem } from '@/types/assistant'
import type { HighlightScope, PracticeFontScale, PracticeRouteMode } from '@/types/readingNative'

interface SelectionToolbarState {
  visible: boolean
  scope: HighlightScope
  text: string
  top: number
  left: number
}

const route = useRoute()
const router = useRouter()
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
const passageHighlightTerms = computed(() => sessionState.highlights.value.filter((item) => item.scope === 'passage').map((item) => item.text))
const questionHighlightTerms = computed(() => sessionState.highlights.value.filter((item) => item.scope === 'questions').map((item) => item.text))
const answeredCount = computed(() => Object.values(sessionState.answerMap.value).filter((value) => hasAnswerValue(value)).length)
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
  return sessionState.exam.value.questionOrder.map((questionIdValue) => {
    const answerEntry = sessionState.result.value?.answerComparison[questionIdValue]
    const explanationEntry = sessionState.explanation.value?.questionMap[questionIdValue]
    return {
      questionId: questionIdValue,
      anchorId: sessionState.exam.value?.questionAnchors[questionIdValue] || `${questionIdValue}-anchor`,
      userAnswer: answerEntry?.userAnswer || '',
      correctAnswer: answerEntry?.correctAnswer || '',
      isCorrect: answerEntry?.isCorrect ?? null,
      explanation: explanationEntry?.text || ''
    }
  })
})
const selectionAlreadyHighlighted = computed(() =>
  sessionState.highlights.value.some((entry) => entry.scope === selectionToolbar.value.scope && entry.text === selectionToolbar.value.text)
)

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
    .filter((questionIdValue) => sessionState.result.value?.answerComparison[questionIdValue]?.isCorrect === false)
    .map((questionIdValue) => questionLabel(questionIdValue))

  return {
    selectedAnswers: Object.fromEntries(
      Object.entries(sessionState.result.value.answers).map(([key, value]) => [key, formatAnswer(value)])
    ),
    score: sessionState.result.value.scoreInfo.correct,
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
  const unlocked = achievementStore.check()
  unlocked.forEach((achievement) => {
    eventBus.emit(ACHIEVEMENT_UNLOCKED, { achievement })
  })
  message.success(`Saved practice record | ${record.correctAnswers}/${record.totalQuestions}`)
}

function submitPractice() {
  const resultEntry = sessionState.submit()
  if (!resultEntry) {
    return
  }
  applyAttemptContext()
  savePracticeRecord()
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
  const resultEntry = sessionState.result.value?.answerComparison[questionIdValue]
  return {
    answered: hasAnswerValue(sessionState.answerMap.value[questionIdValue] || ''),
    correct: resultEntry?.isCorrect === true,
    incorrect: resultEntry?.isCorrect === false,
    marked: isMarked(questionIdValue)
  }
}

function isMarked(questionIdValue: string) {
  return sessionState.markedQuestions.value.includes(questionIdValue)
}

function scrollToQuestion(questionId: string, anchorId: string) {
  const pane = questionPane.value
  if (!pane) return

  let element: HTMLElement | null = null

  // 方法1: 尝试通过 anchorId 直接查找
  if (anchorId) {
    try {
      const escapedId = CSS.escape(anchorId)
      element = pane.querySelector(`#${escapedId}`) as HTMLElement | null
    } catch {
      // 忽略错误
    }
  }

  // 方法2: 尝试通过 questionId 查找带 data-question 属性的元素
  if (!element && questionId) {
    element = pane.querySelector(`[data-question="${questionId}"]`) as HTMLElement | null
  }

  // 方法3: 查找 ID 以 questionId 开头的元素（如 q2-anchor, q2-target）
  if (!element && questionId) {
    const elements = pane.querySelectorAll(`[id^="${questionId}"]`)
    if (elements.length > 0) {
      element = elements[0] as HTMLElement
    }
  }

  // 方法4: 从 questionId 提取数字，查找包含该数字的分组
  if (!element && questionId) {
    const numberMatch = questionId.match(/\d+/)
    if (numberMatch) {
      const num = numberMatch[0]
      // 查找 ID 包含该数字的分组（如 q1-2-3-4-anchor）
      const elements = pane.querySelectorAll(`[id*="${num}"]`)
      // 优先选择分组容器
      for (const el of elements) {
        const id = el.getAttribute('id') || ''
        if (id.includes('-anchor') || id.includes('-section') || id.includes('-target')) {
          element = el as HTMLElement
          break
        }
      }
      // 如果没找到分组，使用第一个匹配的元素
      if (!element && elements.length > 0) {
        element = elements[0] as HTMLElement
      }
    }
  }

  // 方法5: 尝试通过 name 属性查找（radio/checkbox）
  if (!element && questionId) {
    element = pane.querySelector(`[name="${questionId}"]`) as HTMLElement | null
    if (element) {
      // 找到 input，需要滚动到其父容器
      element = element.closest('.group, .question-item, [id]') as HTMLElement | null
    }
  }

  if (element) {
    // 计算元素相对于 questionPane 的偏移量，使其居中显示
    const paneRect = pane.getBoundingClientRect()
    const elementRect = element.getBoundingClientRect()
    const relativeTop = elementRect.top - paneRect.top + pane.scrollTop - paneRect.height / 2 + elementRect.height / 2

    pane.scrollTo({
      top: Math.max(0, relativeTop),
      behavior: 'smooth'
    })
  }
}

function handleOptionSelection(node: { poolId: string; value: string }) {
  sessionState.selectOption(node.poolId, node.value)
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
  sessionState.removeHighlight({
    scope: selectionToolbar.value.scope,
    text: selectionToolbar.value.text
  })
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
  border-radius: 14px; border: 1px solid rgba(249, 115, 22, 0.24); background: rgba(249, 115, 22, 0.08);
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
.pane-kicker { margin: 0 0 4px; color: var(--text-tertiary); font-size: 12px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; }
.pane-header h2, .notes-header h3 { margin: 0; font-size: 20px; color: var(--text-primary); }
.pane-toolbar .toolbar-btn { min-height: 38px; padding: 0 12px; }
.pane-toolbar .font-btn { width: 34px; height: 34px; }
.pane-content { padding: 20px 24px 28px; color: var(--text-primary); font-size: var(--practice-copy-size); line-height: 1.8; }
.passage-content :deep(h2), .passage-content :deep(h3), .passage-content :deep(h4), .question-content :deep(h2), .question-content :deep(h3), .question-content :deep(h4) { color: var(--text-primary); line-height: 1.3; }
.passage-content :deep(h2), .question-content :deep(h2) { font-size: calc(var(--practice-heading-size) * 0.92); }
.passage-content :deep(h3), .question-content :deep(h3) { font-size: calc(var(--practice-heading-size) * 0.8); }
.passage-content :deep(h4), .question-content :deep(h4) { font-size: calc(var(--practice-heading-size) * 0.68); }
.passage-content :deep(p), .passage-content :deep(li), .question-content :deep(p), .question-content :deep(li), .question-content :deep(label), .question-content :deep(td), .question-content :deep(th) { font-size: var(--practice-copy-size); }
.passage-content :deep(.paragraph-wrapper), .question-content :deep(.question-item), .question-content :deep(.table-wrapper), .question-content :deep(table) { margin-bottom: 18px; }
.question-content :deep(.question-item) { padding: 16px 18px; border-radius: 16px; background: rgba(255,255,255,0.68); border: 1px solid rgba(15,23,42,0.06); }
.question-content :deep(.radio-options), .question-content :deep(.mcq-options), .question-content :deep(.summary-choices), .question-content :deep(.matching-headings), .question-content :deep(.matching-options), .question-content :deep(.pool-items), .question-content :deep(.cardpool), .question-content :deep(.drag-options), .question-content :deep(.options-list) { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 12px; }
.question-content :deep(label) { display: inline-flex; align-items: center; gap: 8px; padding: 8px 10px; border-radius: 12px; background: rgba(248,250,252,0.92); }
.question-content :deep(ul), .question-content :deep(ol) { padding-left: 20px; }
.question-content :deep(table) { width: 100%; border-collapse: collapse; }
.question-content :deep(td), .question-content :deep(th) { padding: 10px 12px; border: 1px solid rgba(15,23,42,0.08); vertical-align: top; }
.question-group-card + .question-group-card { margin-top: 18px; }
.score-pill { padding: 8px 12px; border-radius: 999px; background: rgba(37,99,235,0.1); color: var(--primary-color); font-weight: 700; }
.summary-card { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; margin: 0 24px 8px; padding: 14px; border-radius: 16px; border: 1px solid rgba(37,99,235,0.12); background: linear-gradient(180deg, rgba(248,251,255,0.96), rgba(255,255,255,0.92)); }
.summary-metric { display: flex; flex-direction: column; gap: 4px; padding: 10px 12px; border-radius: 12px; background: rgba(255,255,255,0.88); }
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
.nav-item { display: inline-flex; align-items: center; justify-content: center; padding: 8px 12px; border-radius: 10px; border: 1px solid rgba(15,23,42,0.06); background: rgba(255,255,255,0.76); flex: 0 0 auto; min-width: 44px; cursor: pointer; transition: all 0.2s ease; }
.nav-item:hover { background: rgba(37,99,235,0.12); border-color: var(--primary-color); }
.nav-item.answered { border-color: var(--primary-color); background: rgba(37,99,235,0.08); }
.nav-item.correct { border-color: rgba(34,197,94,0.24); background: rgba(34,197,94,0.08); }
.nav-item.incorrect { border-color: rgba(239,68,68,0.24); background: rgba(239,68,68,0.08); }
.nav-item.marked { box-shadow: inset 0 0 0 1px rgba(245,158,11,0.24); }
.nav-jump { font-weight: 700; color: var(--text-primary); }
.bottom-actions { justify-content: flex-end; gap: 10px; margin-left: auto; flex: 0 0 auto; flex-wrap: nowrap; }
.bottom-actions .footer-btn { min-height: 38px; padding: 0 14px; }
.review-section { margin-top: 28px; display: flex; flex-direction: column; gap: 14px; }
.review-card { padding: 18px; border-radius: 18px; border: 1px solid rgba(15,23,42,0.08); background: rgba(255,255,255,0.88); }
.review-card.correct { border-color: rgba(34,197,94,0.2); }
.review-card.incorrect { border-color: rgba(239,68,68,0.2); }
.review-card-header { justify-content: space-between; gap: 12px; margin-bottom: 12px; }
.review-card-title { display: flex; align-items: center; gap: 10px; }
.review-badge { padding: 6px 10px; border-radius: 999px; background: rgba(15,23,42,0.92); color: #fff; font-size: 12px; font-weight: 700; }
.mini-link { min-height: 28px; padding: 0 10px; border-radius: 999px; font-size: 12px; }
.review-status { font-size: 13px; color: var(--text-secondary); }
.review-answer-grid { gap: 14px; align-items: stretch; }
.review-answer-grid > div { flex: 1; padding: 12px 14px; border-radius: 14px; background: var(--bg-secondary); }
.review-answer-grid p, .review-explanation p { margin: 8px 0 0; line-height: 1.7; white-space: pre-wrap; word-break: break-word; }
.review-kicker { display: inline-flex; font-size: 11px; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; color: var(--primary-color); }
.review-explanation { margin-top: 14px; padding: 14px; border-radius: 14px; background: rgba(248,250,252,0.92); }
.selection-toolbar {
  position: fixed; z-index: 9999; display: flex; gap: 4px; padding: 6px 8px; border-radius: 12px;
  border: 1px solid var(--border-color); background: var(--bg-primary); box-shadow: 0 18px 34px rgba(15,23,42,0.18);
}
.selection-btn .material-icons { font-size: 16px; }
.note-modal {
  position: fixed; z-index: 9999;
  width: 280px; padding: 16px;
  border-radius: 12px;
  border: 1px solid var(--border-color);
  background: var(--bg-primary);
  box-shadow: 0 18px 34px rgba(15,23,42,0.18);
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
    flex-wrap: wrap;
    align-items: flex-start;
  }

  .nav-grid {
    order: 3;
    flex: 1 1 100%;
  }

  .bottom-actions {
    margin-left: 0;
  }
}
@media (max-width: 768px) {
  .page-header, .header-actions, .pane-toolbar, .review-card-header, .review-answer-grid { flex-direction: column; align-items: flex-start; }
  .practice-section { padding: 16px; }
  .summary-card { grid-template-columns: 1fr; margin: 0 0 12px; }
  .pane-header {
    align-items: flex-start;
    padding: 16px;
  }

  .pane-toolbar {
    flex-wrap: wrap;
    width: 100%;
  }

  .nav-shell {
    gap: 12px;
  }
  
  .native-practice-layout {
    gap: 12px;
  }
  
  .practice-pane {
    min-height: 45vh;
    border-radius: 14px;
  }
  
  .page-title {
    font-size: clamp(18px, 4vw, 24px);
  }
  
  .header-actions {
    width: 100%;
    gap: 8px;
    flex-wrap: wrap;
  }
  
  .nav-shell .bottom-actions {
    flex: 0 1 auto;
    margin-left: auto;
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
    gap: 8px;
    flex-wrap: wrap;
  }
  
  .nav-title {
    font-size: 14px;
  }
  
  .nav-grid {
    order: 2;
    flex: 1 1 100%;
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
    order: 1;
    flex: 0 1 auto;
    margin-left: 0;
    width: 100%;
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
