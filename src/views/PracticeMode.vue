<template>
  <div class="practice-mode-page">
    <div class="page-header">
      <div class="header-left">
        <button class="back-btn" @click="goBack">
          <span class="material-icons">arrow_back</span>
        </button>
        <div class="header-titles">
          <h1 class="page-title">{{ question?.title || 'Practice Mode' }}</h1>
          <p class="page-subtitle" v-if="currentLang === 'zh'">{{ question?.titleCN }}</p>
        </div>
      </div>
      <button class="fullscreen-btn" @click="toggleFullscreen" :title="isFullscreen ? t('practiceMode.exitFullscreen') : t('practiceMode.fullscreen')">
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
          ref="questionIframe"
          v-if="question?.htmlPath" 
          :src="question.htmlPath" 
          class="question-iframe"
          :title="t('practiceMode.iframeTitle')"
          @load="onIframeLoad"
        ></iframe>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, inject } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useQuestionStore } from '@/store/questionStore'
import { usePracticeStore } from '@/store/practiceStore'
import { useAchievementStore } from '@/store/achievementStore'
import { message } from 'ant-design-vue'
import { eventBus, PRACTICE_UPDATED } from '@/utils/eventBus'

const route = useRoute()
const router = useRouter()
const questionStore = useQuestionStore()
const practiceStore = usePracticeStore()
const achievementStore = useAchievementStore()
const t = inject('t', (key: string) => key)
const currentLang = inject('currentLang', { value: 'zh' })

const question = ref<any>(null)
const questionIframe = ref<HTMLIFrameElement | null>(null)
const contentWrapper = ref<HTMLDivElement | null>(null)
const startTime = ref(0)
const elapsed = ref(0)
const answers = ref<number[]>([])
const correctAnswers = ref<number[]>([])
const isFullscreen = ref(false)
const isLoading = ref(true)

let timer: number | null = null
let loadingTimeout: number | null = null

onMounted(() => {
  questionStore.loadQuestions()
  const id = route.query.id as string
  if (id) {
    question.value = questionStore.getQuestionById(id)
    if (question.value) {
      answers.value = new Array(question.value.totalQuestions).fill(0)
      correctAnswers.value = Array.from({ length: question.value.totalQuestions }, () => 
        Math.floor(Math.random() * 4) + 1
      )
      startTime.value = Date.now()
      timer = window.setInterval(() => {
        elapsed.value = Math.floor((Date.now() - startTime.value) / 1000)
      }, 1000)
    }
  }
  
  // 加载超时处理
  loadingTimeout = window.setTimeout(() => {
    if (isLoading.value) {
      isLoading.value = false
      message.warning(t('practiceMode.loadingTimeout'))
    }
  }, 10000)

  // 始终监听 message 事件
  window.addEventListener('message', handleIframeMessage, false)
  document.addEventListener('fullscreenchange', handleFullscreenChange)
})

onUnmounted(() => {
  // 延迟清理监听器，确保能收到 iframe 的消息
  setTimeout(() => {
    window.removeEventListener('message', handleIframeMessage)
  }, 2000)
  
  if (timer) {
    clearInterval(timer)
  }
  if (loadingTimeout) {
    clearTimeout(loadingTimeout)
  }
  document.removeEventListener('fullscreenchange', handleFullscreenChange)
  if (isFullscreen.value) {
    exitFullscreen()
  }
})

const formatTime = (seconds: number): string => {
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
}

const handleIframeMessage = (event: MessageEvent) => {
  // 处理 iframe 发送的提交数据
  if (event.data && event.data.type === 'submit') {
    const { score, totalQuestions, answers, correctAnswers: iframeCorrectAnswers } = event.data
    
    // 直接使用 iframe 传来的分数
    const finalScore = typeof score === 'number' ? score : 0
    const finalTotal = totalQuestions || question.value?.totalQuestions || 0
    const accuracy = finalTotal > 0 ? Math.round((finalScore / finalTotal) * 100) : 0
    
    // 显示成绩
    message.success(t('practiceMode.scoreResult', { score: finalScore.toString(), total: finalTotal.toString(), accuracy: accuracy.toString() }))
    
    // 自动保存记录
    savePracticeRecord(finalScore, finalTotal, accuracy)
    
    // 验证数据是否保存成功
    setTimeout(() => {
      const savedRecords = JSON.parse(localStorage.getItem('ielts_practice') || '[]')
    }, 100)
  }
}

const collectAnswersFromIframe = () => {
  try {
    const iframe = questionIframe.value
    if (!iframe || !iframe.contentDocument) {
      return null
    }
    
    const doc = iframe.contentDocument
    const userAnswers: Record<string, string> = {}
    
    // 尝试获取所有可能的题目输入
    // Radio buttons
    const radios = doc.querySelectorAll('input[type="radio"]:checked')
    radios.forEach((radio: any) => {
      if (radio.name) userAnswers[radio.name] = radio.value
    })
    
    // Text inputs
    const inputs = doc.querySelectorAll('input[type="text"]')
    inputs.forEach((input: any) => {
      if (input.id) userAnswers[input.id] = input.value
      else if (input.name) userAnswers[input.name] = input.value
    })
    
    return userAnswers
  } catch (error) {
    return null
  }
}

const extractScoreFromDOM = (doc: Document) => {
  try {
    // 尝试查找包含 "Score:" 的元素
    // 常见的 id 是 "results" 或包含 score 的文本
    const resultsDiv = doc.getElementById('results')
    if (resultsDiv) {
      const text = resultsDiv.innerText || resultsDiv.textContent || ''
      // 匹配 "Score: 1/13" 或 "Score: 1 / 13" 格式
      const match = text.match(/Score:\s*(\d+)\s*\/\s*(\d+)/i)
      if (match) {
        const correct = parseInt(match[1], 10)
        const total = parseInt(match[2], 10)
        const accuracyMatch = text.match(/Accuracy:\s*(\d+)%/i)
        const accuracy = accuracyMatch ? parseInt(accuracyMatch[1], 10) : Math.round((correct / total) * 100)
        return { correct, total, accuracy }
      }
    }
    return null
  } catch (e) {
    console.error('Failed to extract score from DOM', e)
    return null
  }
}

const onIframeLoad = () => {
  isLoading.value = false
  if (loadingTimeout) {
    clearTimeout(loadingTimeout)
    loadingTimeout = null
  }
  try {
    if (questionIframe.value?.contentWindow) {
      // 监听 message 事件（备用方案）
      window.addEventListener('message', handleIframeMessage)
      
      // 直接监听 iframe 中的 Submit 按钮
      setTimeout(() => {
        try {
          const iframe = questionIframe.value
          if (!iframe || !iframe.contentDocument) return
          
          const doc = iframe.contentDocument
          
          // 查找 Submit 按钮
          const buttons = doc.querySelectorAll('button')
          let submitBtn: Element | null = null
          
          buttons.forEach(btn => {
            const text = btn.textContent?.trim() || ''
            const onclick = (btn as HTMLButtonElement).onclick?.toString() || ''
            const onclickAttr = btn.getAttribute('onclick') || ''
            
            if ((text.includes('Submit') || text.includes('提交')) || 
                onclick.includes('grade') || 
                onclickAttr.includes('grade')) {
              submitBtn = btn
            }
          })
          
          if (submitBtn) {
            // 添加点击监听器
            submitBtn.addEventListener('click', () => {
              // 延迟等待 iframe 内部逻辑执行完成并更新 DOM
              // 增加延迟时间以确保 DOM 已更新
              setTimeout(() => {
                const scoreData = extractScoreFromDOM(doc)
                if (scoreData) {
                  savePracticeRecord(scoreData.correct, scoreData.total, scoreData.accuracy)
                  // 显示更详细的成功消息
                  message.success(t('practiceMode.scoreResult', { 
                    score: scoreData.correct.toString(), 
                    total: scoreData.total.toString(), 
                    accuracy: scoreData.accuracy.toString() 
                  }))
                } else {
                  // 如果提取失败，尝试回退方法（虽然不推荐，但至少可以记录完成状态）
                  console.warn('Could not extract score from DOM')
                }
              }, 800) // 800ms 延迟
            })
          }
        } catch (error) {
          // 忽略错误
        }
      }, 1000)
    }
  } catch (e) {
    // 忽略错误
  }
}

const toggleFullscreen = () => {
  if (!isFullscreen.value) {
    enterFullscreen()
  } else {
    exitFullscreen()
  }
}

const enterFullscreen = () => {
  const elem = contentWrapper.value
  if (elem?.requestFullscreen) {
    elem.requestFullscreen()
  } else if ((elem as any)?.webkitRequestFullscreen) {
    (elem as any).webkitRequestFullscreen()
  } else if ((elem as any)?.msRequestFullscreen) {
    (elem as any).msRequestFullscreen()
  }
}

const exitFullscreen = () => {
  if (document.exitFullscreen) {
    document.exitFullscreen()
  } else if ((document as any)?.webkitExitFullscreen) {
    (document as any).webkitExitFullscreen()
  } else if ((document as any)?.msExitFullscreen) {
    (document as any).msExitFullscreen()
  }
}

const handleFullscreenChange = () => {
  isFullscreen.value = !!document.fullscreenElement
}

const answeredCount = computed(() => 
  answers.value.filter(a => a !== 0).length
)

const currentAccuracy = computed(() => {
  if (answeredCount.value === 0) return 0
  let correct = 0
  answers.value.forEach((answer, index) => {
    if (answer !== 0 && answer === correctAnswers.value[index]) {
      correct++
    }
  })
  return Math.round((correct / answeredCount.value) * 100)
})

const finish = () => {
  if (timer) {
    clearInterval(timer)
  }

  let correct = 0
  answers.value.forEach((answer, index) => {
    if (answer !== 0 && answer === correctAnswers.value[index]) {
      correct++
    }
  })

  const record = {
    questionId: question.value.id,
    questionTitle: question.value.title,
    category: question.value.category,
    duration: elapsed.value,
    correctAnswers: correct,
    totalQuestions: question.value.totalQuestions,
    accuracy: Math.round((correct / question.value.totalQuestions) * 100),
    score: correct
  }

  practiceStore.add(record)
  achievementStore.check()

  message.success(t('practiceMode.recordSaved'))
  router.push('/practice')
}

const savePracticeRecord = (correct: number, totalQuestions: number, accuracy: number) => {
  const record = {
    questionId: question.value.id,
    questionTitle: question.value.title,
    category: question.value.category,
    duration: elapsed.value,
    correctAnswers: correct,
    totalQuestions: totalQuestions,
    accuracy: accuracy,
    score: correct
  }
  
  practiceStore.add(record)
  achievementStore.check()
  eventBus.emit(PRACTICE_UPDATED, { record, records: practiceStore.records })
  message.success(t('practiceMode.recordSaved'))
}

const goBack = () => {
  window.removeEventListener('message', handleIframeMessage)
  if (timer) {
    clearInterval(timer)
  }
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
</script>

<style scoped>
.practice-mode-page {
  max-width: 1400px;
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

.back-btn {
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

.back-btn:hover {
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

.fullscreen-btn:hover {
  border-color: var(--primary-color);
  color: var(--primary-color);
}

.practice-section {
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: 16px;
  padding: 24px;
}

.stats-bar {
  display: flex;
  gap: 16px;
  padding: 16px;
  background: var(--bg-secondary);
  border-radius: 12px;
  margin-bottom: 24px;
}

.stat-item {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1;
}

.stat-icon {
  font-size: 28px;
  color: var(--primary-color);
}

.stat-content {
  display: flex;
  flex-direction: column;
}

.stat-label {
  font-size: 14px;
  color: var(--text-secondary);
  margin-bottom: 2px;
}

.stat-value {
  font-size: 18px;
  font-weight: 700;
  color: var(--text-primary);
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

@media (max-width: 768px) {
  .page-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 16px;
  }
  
  .stats-bar {
    flex-direction: column;
    gap: 12px;
  }
  
  .question-content-wrapper {
    min-height: 60vh;
  }
  
  .question-iframe {
    height: 60vh;
  }
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
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
</style>
