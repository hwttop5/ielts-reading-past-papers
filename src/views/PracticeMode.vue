<template>
  <div class="practice-mode-page">
    <div class="page-header">
      <div class="header-left">
        <button class="back-btn" @click="goBack">
          <span class="material-icons">arrow_back</span>
        </button>
        <div class="header-titles">
          <h1 class="page-title">{{ question?.title || 'Practice Mode' }}</h1>
          <p v-if="displayLang === 'zh'" class="page-subtitle">{{ question?.titleCN }}</p>
        </div>
      </div>
      <button
        class="fullscreen-btn"
        :title="isFullscreen ? t('practiceMode.exitFullscreen') : t('practiceMode.fullscreen')"
        @click="toggleFullscreen"
      >
        <span class="material-icons">{{ isFullscreen ? 'fullscreen_exit' : 'fullscreen' }}</span>
      </button>
    </div>

    <div class="practice-section">
      <div class="question-content-wrapper" ref="contentWrapper">
        <div v-if="isLoading" class="loading-overlay">
          <div class="loading-content">
            <span class="material-icons loading-spinner">autorenew</span>
            <p>{{ t('practiceMode.loading') }}</p>
          </div>
        </div>
        <iframe
          v-if="question?.htmlPath"
          ref="questionIframe"
          :src="question.htmlPath"
          class="question-iframe"
          :title="t('practiceMode.iframeTitle')"
          @load="onIframeLoad"
        ></iframe>
      </div>
    </div>

    <PracticeAssistant
      v-if="question"
      :question-id="question.id"
      :question-title="question.title"
      :question-title-localized="question.titleCN"
      :has-submitted="hasSubmitted"
      :attempt-context="assistantAttemptContext"
      :recent-practice="recentPractice"
      :lang="displayLang"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, inject, onMounted, onUnmounted, ref, watch, type Ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { message } from 'ant-design-vue'
import PracticeAssistant from '@/components/PracticeAssistant.vue'
import { useAchievementStore } from '@/store/achievementStore'
import { usePracticeStore } from '@/store/practiceStore'
import { useQuestionStore, type Question } from '@/store/questionStore'
import { eventBus, PRACTICE_UPDATED } from '@/utils/eventBus'
import type { AttemptContext, RecentPracticeItem } from '@/types/assistant'

const route = useRoute()
const router = useRouter()
const questionStore = useQuestionStore()
const practiceStore = usePracticeStore()
const achievementStore = useAchievementStore()
const t = inject('t', (key: string) => key)
const currentLang = inject<Readonly<Ref<'zh' | 'en'>>>('currentLang', ref('zh') as Readonly<Ref<'zh' | 'en'>>)

const question = ref<Question | null>(null)
const questionIframe = ref<HTMLIFrameElement | null>(null)
const contentWrapper = ref<HTMLDivElement | null>(null)
const startTime = ref(0)
const elapsed = ref(0)
const isFullscreen = ref(false)
const isLoading = ref(true)
const hasSubmitted = ref(false)
const assistantAttemptContext = ref<AttemptContext | null>(null)

const displayLang = computed<'zh' | 'en'>(() => (currentLang.value === 'en' ? 'en' : 'zh'))
const recentPractice = computed<RecentPracticeItem[]>(() =>
  practiceStore.records.slice(0, 10).map((record) => ({
    questionId: record.questionId,
    accuracy: record.accuracy,
    category: record.category,
    duration: record.duration
  }))
)

let timer: number | null = null
let loadingTimeout: number | null = null
let submissionCooldownUntil = 0

function stopTimer() {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}

function startTimer() {
  stopTimer()
  startTime.value = Date.now()
  elapsed.value = 0
  timer = window.setInterval(() => {
    elapsed.value = Math.floor((Date.now() - startTime.value) / 1000)
  }, 1000)
}

function resetAssistantState() {
  hasSubmitted.value = false
  assistantAttemptContext.value = null
  submissionCooldownUntil = 0
}

function initializeQuestion() {
  const id = route.query.id as string | undefined
  question.value = id ? questionStore.getQuestionById(id) ?? null : null
  isLoading.value = Boolean(question.value)
  resetAssistantState()

  if (loadingTimeout) {
    clearTimeout(loadingTimeout)
  }

  if (question.value) {
    startTimer()
    loadingTimeout = window.setTimeout(() => {
      if (isLoading.value) {
        isLoading.value = false
        message.warning(t('practiceMode.loadingTimeout'))
      }
    }, 10000)
  } else {
    stopTimer()
  }
}

function normalizeAnswer(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase()
}

function extractCorrectAnswersFromIframe(): Record<string, string> | null {
  try {
    const iframe = questionIframe.value
    const doc = iframe?.contentDocument
    if (!doc) {
      return null
    }

    const scriptContent = Array.from(doc.scripts)
      .map((script) => script.textContent || '')
      .join('\n')

    const answersMatch = scriptContent.match(/(?:const|let|var)\s+(?:answers|correctAnswers)\s*=\s*(\{[\s\S]*?\});/i)
    if (!answersMatch) {
      return null
    }

    const evaluator = new Function(`return (${answersMatch[1]})`)
    return evaluator() as Record<string, string>
  } catch {
    return null
  }
}

function collectAnswersFromIframe(): Record<string, string> | null {
  try {
    const iframe = questionIframe.value
    const doc = iframe?.contentDocument
    if (!doc) {
      return null
    }

    const userAnswers: Record<string, string> = {}

    doc.querySelectorAll<HTMLInputElement>('input[type="radio"]:checked').forEach((input) => {
      if (input.name) {
        userAnswers[input.name] = input.value
      }
    })

    doc.querySelectorAll<HTMLInputElement>('input[type="text"], input.blank').forEach((input) => {
      const key = input.id || input.name
      if (key) {
        userAnswers[key] = input.value
      }
    })

    doc.querySelectorAll<HTMLSelectElement>('select').forEach((select) => {
      const key = select.id || select.name
      if (key && select.value) {
        userAnswers[key] = select.value
      }
    })

    return userAnswers
  } catch {
    return null
  }
}

function buildAttemptContext(score: number): AttemptContext | null {
  const selectedAnswers = collectAnswersFromIframe()
  const correctAnswers = extractCorrectAnswersFromIframe()

  if (!selectedAnswers && !correctAnswers) {
    return null
  }

  const wrongQuestions = correctAnswers
    ? Object.entries(correctAnswers)
        .filter(([key, answer]) => normalizeAnswer(selectedAnswers?.[key] || '') !== normalizeAnswer(answer))
        .map(([key]) => key.replace(/^q/i, ''))
    : undefined

  return {
    selectedAnswers: selectedAnswers ?? undefined,
    score,
    wrongQuestions
  }
}

function extractScoreFromDOM(doc: Document) {
  try {
    const resultsDiv = doc.getElementById('results')
    if (!resultsDiv) {
      return null
    }

    const text = resultsDiv.innerText || resultsDiv.textContent || ''
    const match = text.match(/Score:\s*(\d+)\s*\/\s*(\d+)/i)
    if (!match) {
      return null
    }

    const correct = parseInt(match[1], 10)
    const total = parseInt(match[2], 10)
    const accuracyMatch = text.match(/Accuracy[:\s]*(\d+)%/i)
    const accuracy = accuracyMatch ? parseInt(accuracyMatch[1], 10) : Math.round((correct / total) * 100)
    return { correct, total, accuracy }
  } catch {
    return null
  }
}

function handleSubmission(correct: number, totalQuestions: number, accuracy: number) {
  const now = Date.now()
  if (now < submissionCooldownUntil || !question.value) {
    return
  }

  submissionCooldownUntil = now + 1500
  hasSubmitted.value = true
  assistantAttemptContext.value = buildAttemptContext(correct)

  const scoreMsg = t('practiceMode.scoreResult', {
    score: correct.toString(),
    total: totalQuestions.toString(),
    accuracy: accuracy.toString()
  })
  const savedMsg = t('practiceMode.recordSaved')

  savePracticeRecord(correct, totalQuestions, accuracy, false)
  message.success(`${savedMsg} | ${scoreMsg}`, 3)
}

function handleIframeMessage(event: MessageEvent) {
  if (event.data?.type !== 'submit') {
    return
  }

  const score = typeof event.data.score === 'number' ? event.data.score : 0
  const totalQuestions = event.data.totalQuestions || question.value?.totalQuestions || 0
  const accuracy = totalQuestions > 0 ? Math.round((score / totalQuestions) * 100) : 0
  handleSubmission(score, totalQuestions, accuracy)
}

function onIframeLoad() {
  isLoading.value = false
  if (loadingTimeout) {
    clearTimeout(loadingTimeout)
    loadingTimeout = null
  }

  try {
    const iframe = questionIframe.value
    const doc = iframe?.contentDocument
    if (!doc) {
      return
    }

    setTimeout(() => {
      const buttons = Array.from(doc.querySelectorAll('button'))
      const submitButton = buttons.find((button) => {
        const text = button.textContent?.trim() || ''
        const onclickAttr = button.getAttribute('onclick') || ''
        return (
          text.includes('Submit') ||
          text.includes('提交') ||
          onclickAttr.includes('grade') ||
          onclickAttr.includes('submitAnswers')
        )
      })

      if (!submitButton) {
        return
      }

      submitButton.addEventListener('click', () => {
        setTimeout(() => {
          const scoreData = extractScoreFromDOM(doc)
          if (scoreData) {
            handleSubmission(scoreData.correct, scoreData.total, scoreData.accuracy)
          }
        }, 800)
      })
    }, 1000)
  } catch {
    // ignore iframe hook failures
  }
}

function toggleFullscreen() {
  if (!isFullscreen.value) {
    enterFullscreen()
  } else {
    exitFullscreen()
  }
}

function enterFullscreen() {
  const element = contentWrapper.value
  if (element?.requestFullscreen) {
    element.requestFullscreen()
  } else if ((element as { webkitRequestFullscreen?: () => void })?.webkitRequestFullscreen) {
    (element as { webkitRequestFullscreen: () => void }).webkitRequestFullscreen()
  } else if ((element as { msRequestFullscreen?: () => void })?.msRequestFullscreen) {
    (element as { msRequestFullscreen: () => void }).msRequestFullscreen()
  }
}

function exitFullscreen() {
  if (document.exitFullscreen) {
    document.exitFullscreen()
  } else if ((document as { webkitExitFullscreen?: () => void })?.webkitExitFullscreen) {
    (document as { webkitExitFullscreen: () => void }).webkitExitFullscreen()
  } else if ((document as { msExitFullscreen?: () => void })?.msExitFullscreen) {
    (document as { msExitFullscreen: () => void }).msExitFullscreen()
  }
}

function handleFullscreenChange() {
  isFullscreen.value = Boolean(document.fullscreenElement)
}

function savePracticeRecord(correct: number, totalQuestions: number, accuracy: number, showMessage = true) {
  if (!question.value) {
    return
  }

  const record = {
    questionId: question.value.id,
    questionTitle: question.value.title,
    category: question.value.category,
    duration: elapsed.value,
    correctAnswers: correct,
    totalQuestions,
    accuracy,
    score: correct
  }

  practiceStore.add(record)
  achievementStore.check()
  eventBus.emit(PRACTICE_UPDATED, { record, records: practiceStore.records })
  if (showMessage) {
    message.success(t('practiceMode.recordSaved'))
  }
}

function goBack() {
  window.removeEventListener('message', handleIframeMessage)
  stopTimer()

  const query: Record<string, string> = {}
  const keys = ['category', 'difficulty', 'search', 'page', 'pageSize']
  keys.forEach((key) => {
    const value = route.query[key]
    if (typeof value === 'string' && value) {
      query[key] = value
    }
  })
  router.push({ path: '/browse', query })
}

onMounted(() => {
  questionStore.loadQuestions()
  practiceStore.load()
  initializeQuestion()
  window.addEventListener('message', handleIframeMessage, false)
  document.addEventListener('fullscreenchange', handleFullscreenChange)
})

watch(
  () => route.query.id,
  () => {
    initializeQuestion()
  }
)

onUnmounted(() => {
  window.removeEventListener('message', handleIframeMessage)
  document.removeEventListener('fullscreenchange', handleFullscreenChange)
  stopTimer()
  if (loadingTimeout) {
    clearTimeout(loadingTimeout)
  }
  if (isFullscreen.value) {
    exitFullscreen()
  }
})
</script>

<style scoped>
.practice-mode-page {
  max-width: 1480px;
  margin: 0 auto;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 16px;
}

.back-btn,
.fullscreen-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.2s ease;
}

.back-btn:hover,
.fullscreen-btn:hover {
  border-color: var(--primary-color);
  color: var(--primary-color);
}

.header-titles {
  display: flex;
  flex-direction: column;
}

.page-title {
  font-size: 22px;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0;
}

.page-subtitle {
  font-size: 14px;
  color: var(--text-secondary);
  margin: 0;
}

.practice-section {
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: 16px;
  padding: 24px;
}

.question-content-wrapper {
  position: relative;
  background: white;
  border: 1px solid var(--border-color);
  border-radius: 12px;
  overflow: hidden;
  min-height: 75vh;
}

.question-iframe {
  width: 100%;
  height: 75vh;
  border: none;
}

:fullscreen .question-content-wrapper {
  border-radius: 0;
  border: none;
  height: 100vh;
  min-height: 100vh;
}

:fullscreen .question-iframe {
  height: 100vh;
}

.loading-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(255, 255, 255, 0.9);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 10;
}

.loading-content {
  text-align: center;
  color: var(--text-secondary);
}

.loading-spinner {
  font-size: 48px;
  color: var(--primary-color);
  animation: spin 1s linear infinite;
  margin-bottom: 12px;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 768px) {
  .page-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 16px;
  }

  .practice-section {
    padding: 16px;
  }

  .question-content-wrapper {
    min-height: 60vh;
  }

  .question-iframe {
    height: 60vh;
  }
}
</style>
