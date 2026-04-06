<template>
  <div class="overview-page">
    <div class="page-header">
      <div class="header-content">
        <h1 class="page-title"><span class="material-icons title-icon">dashboard</span> {{ t('menu.home') }}</h1>
        <p class="page-subtitle">{{ t('overview.description') }}</p>
      </div>
    </div>

    <div class="stats-grid">
      <div class="stat-card" @click="handleStatClick('practice')">
        <div class="stat-icon-wrapper">
          <span class="material-icons stat-icon">menu_book</span>
        </div>
        <div class="stat-content">
          <div class="stat-label">{{ t('overview.practicedQuestions') }}</div>
          <div class="stat-value">{{ practiceStore.totalCount }}</div>
          <div class="stat-unit">{{ t('overview.questions') }}</div>
        </div>
        <div class="stat-action">
          <span class="material-icons action-arrow">arrow_forward</span>
        </div>
      </div>

      <div class="stat-card" @click="handleStatClick('accuracy')">
        <div class="stat-icon-wrapper">
          <span class="material-icons stat-icon">task_alt</span>
        </div>
        <div class="stat-content">
          <div class="stat-label">{{ t('overview.avgAccuracy') }}</div>
          <div class="stat-value">{{ practiceStore.avgAccuracy }}</div>
          <div class="stat-unit">%</div>
        </div>
      </div>

      <div class="stat-card" @click="handleStatClick('time')">
        <div class="stat-icon-wrapper">
          <span class="material-icons stat-icon">schedule</span>
        </div>
        <div class="stat-content">
          <div class="stat-label">{{ t('overview.studyTime') }}</div>
          <div class="stat-value">{{ Math.floor(practiceStore.totalTime / 60) }}</div>
          <div class="stat-unit">{{ t('overview.minutes') }}</div>
        </div>
      </div>

      <div class="stat-card" @click="handleStatClick('count')">
        <div class="stat-icon-wrapper">
          <span class="material-icons stat-icon">auto_graph</span>
        </div>
        <div class="stat-content">
          <div class="stat-label">{{ t('overview.practiceCount') }}</div>
          <div class="stat-value">{{ practiceStore.totalCount }}</div>
          <div class="stat-unit">{{ t('overview.times') }}</div>
        </div>
      </div>
    </div>

    <template v-if="hasProgressData">
      <div class="section">
        <h2 class="notion-section-title"><span class="material-icons section-icon">show_chart</span> {{ t('overview.studyProgress') }}</h2>
        <div class="progress-overview">
          <div class="progress-summary">
            <div class="summary-item">
              <span class="summary-label">{{ t('overview.completed') }}</span>
              <span class="summary-value">{{ completedCount }}</span>
            </div>
            <div class="summary-divider"></div>
            <div class="summary-item">
              <span class="summary-label">{{ t('overview.remaining') }}</span>
              <span class="summary-value">{{ remainingCount }}</span>
            </div>
            <div class="summary-divider"></div>
            <div class="summary-item">
              <span class="summary-label">{{ t('overview.progressRate') }}</span>
              <span class="summary-value">{{ progressRate }}%</span>
            </div>
          </div>
          <div class="progress-bar-large">
            <div class="progress-fill-large" :style="{ width: progressRate + '%' }"></div>
          </div>
        </div>
      </div>

      <!-- Achievements Section -->
      <div class="section">
        <div class="section-header-flex">
          <h2 class="notion-section-title"><span class="material-icons section-icon">emoji_events</span> {{ t('achievement.latest') }}</h2>
          <button class="view-all-btn" @click="router.push('/my-achievements')">{{ t('achievement.viewAll') }}</button>
        </div>
        
        <div v-if="latestAchievements.length > 0" class="latest-achievements-grid">
          <div v-for="a in latestAchievements" :key="a.id" class="mini-achievement-card" :class="`rarity-${a.rarity}`">
            <div class="mini-icon-wrapper" :class="getIconColor(a.id)">
              <span class="material-icons mini-icon">{{ getIcon(a.id) }}</span>
            </div>
            <div class="mini-info">
              <div class="mini-title">{{ t(a.titleKey) }}</div>
              <div class="mini-date">{{ formatDate(a.unlockedAt) }}</div>
            </div>
          </div>
        </div>
        <div v-else class="no-achievements">
          <span class="material-icons no-data-icon">military_tech</span>
          <p>{{ t('achievement.noLatest') }}</p>
        </div>
      </div>
    </template>

    <div v-else class="section welcome-section">
      <div class="welcome-card">
        <div class="welcome-icon-wrapper">
          <span class="material-icons welcome-icon">waving_hand</span>
        </div>
        <h2 class="welcome-title">{{ t('overview.welcomeTitle') }}</h2>
        <p class="welcome-desc">{{ t('overview.welcomeDesc') }}</p>
        <div class="welcome-actions">
          <button class="welcome-btn primary" @click="$router.push('/browse')">
          {{ t('overview.startPractice') }}
          <span class="material-icons" style="font-size: 16px;">arrow_forward</span>
        </button>
        </div>
      </div>
    </div>

    <div class="section">
      <h2 class="notion-section-title"><span class="material-icons section-icon">article</span> {{ t('overview.latestPractice') }}</h2>
      <div v-if="practiceStore.records.length > 0" class="latest-practice-list">
        <div v-for="record in latestPractices" :key="record.id" class="practice-card" @click="viewRecord(record)">
          <div class="practice-header">
            <div class="title-group">
              <span class="practice-title">{{ record.questionTitle }}</span>
              <span class="practice-subtitle" v-if="getQuestionTitleCN(record.questionId) && currentLang.value === 'zh'">{{ getQuestionTitleCN(record.questionId) }}</span>
            </div>
          </div>
          <div class="practice-meta">
            <div class="meta-left">
              <span :class="['meta-tag', categoryTagClass(record.category)]">{{ record.category }}</span>
              <span
                v-if="getQuestionFrequency(record.questionId)"
                :class="['meta-tag', frequencyTagClass(record.questionId)]"
              >{{ getFrequencyLabel(record.questionId) }}</span>
              <span class="meta-tag score highlight">
                <span class="material-icons" style="font-size: 14px;">check_circle</span>
                {{ record.correctAnswers }}/{{ record.totalQuestions }}
              </span>
            </div>
            <span class="practice-time">{{ formatDate(record.time) }}</span>
          </div>
        </div>
      </div>
      <div v-else class="no-data">
        <span class="material-icons no-data-icon">edit_note</span>
        <p>{{ t('practice.noRecords') }}</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, inject, ref, type Ref, type Readonly } from 'vue'
import { useRouter } from 'vue-router'
import { usePracticeStore } from '@/store/practiceStore'
import { useQuestionStore } from '@/store/questionStore'
import { useAchievementStore } from '@/store/achievementStore'
import { message } from 'ant-design-vue'
import { eventBus, PRACTICE_UPDATED } from '@/utils/eventBus'
import { getAchievementIcon, getAchievementColor } from '@/utils/achievementUtils'

const router = useRouter()
const practiceStore = usePracticeStore()
const questionStore = useQuestionStore()
const achievementStore = useAchievementStore()
const t = inject('t', (key: string) => key)
const currentLang = inject<Readonly<Ref<'zh' | 'en'>>>('currentLang', ref('zh') as Readonly<Ref<'zh' | 'en'>>)

const latestAchievements = computed(() => {
  return achievementStore.unlockedAchievements.slice(0, 4)
})

const latestPractices = computed(() => {
  return [...practiceStore.records].sort((a, b) => b.time - a.time).slice(0, 4)
})

const getIcon = getAchievementIcon
const getIconColor = getAchievementColor

const formatDate = (ts?: number) => {
  if (!ts) return ''
  const date = new Date(ts)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

const getQuestionTitleCN = (id: string) => {
  const q = questionStore.questions.find(q => q.id === id)
  return q ? q.titleCN : ''
}

const getQuestionFrequency = (id: string) => {
  const q = questionStore.questions.find(q => q.id === id)
  return q ? q.frequency : ''
}

const getFrequencyLabel = (id: string) => {
  const frequency = getQuestionFrequency(id)
  if (frequency === 'high') return t('browse.frequency.high')
  if (frequency === 'medium') return t('browse.frequency.medium')
  if (frequency === 'low') return t('browse.frequency.low')
  return frequency
}

/** 与题库页 Browse.vue 中 .category-p1 / p2 / p3 一致 */
const categoryTagClass = (category: string) => {
  const c = String(category || '').toLowerCase()
  if (c === 'p1' || c === 'p2' || c === 'p3') return `meta-category-${c}`
  return 'meta-category-default'
}

/** 与题库页 Browse.vue 中 .tag-high / .tag-medium / .tag-low 一致 */
const frequencyTagClass = (questionId: string) => {
  const f = getQuestionFrequency(questionId)
  if (f === 'high' || f === 'medium' || f === 'low') return `meta-frequency-${f}`
  return 'meta-frequency-default'
}

const viewRecord = (record: any) => {
  router.push('/practice')
}

const hasProgressData = computed(() => practiceStore.totalCount > 0)

// 已完成的题目数量（练习记录的次数，即完成了多少道大题）
const completedCount = computed(() => {
  // 统计已练习过的题目 ID 数量（去重）
  const practicedQuestionIds = new Set(practiceStore.records.map(r => r.questionId))
  return practicedQuestionIds.size
})

const remainingCount = computed(() => {
  // 总题目数量（127 道大题）
  const totalQuestions = questionStore.questions.length
  return Math.max(0, totalQuestions - completedCount.value)
})

const progressRate = computed(() => {
  // 总题目数量
  const totalQuestions = questionStore.questions.length
  if (totalQuestions === 0) return 0
  return Math.min(100, Math.round((completedCount.value / totalQuestions) * 100))
})

// 处理数据更新
const handlePracticeUpdated = (event: CustomEvent) => {
  // 重新加载数据
  practiceStore.load()
  achievementStore.load()
}

onMounted(() => {
  practiceStore.load()
  questionStore.loadQuestions()
  achievementStore.load()
  achievementStore.check()
  
  // 监听数据更新事件
  eventBus.on(PRACTICE_UPDATED, handlePracticeUpdated)
})

onUnmounted(() => {
  eventBus.off(PRACTICE_UPDATED, handlePracticeUpdated)
})

const handleStatClick = (type: string) => {
  switch (type) {
    case 'practice':
      router.push('/practice')
      break
    case 'accuracy':
    case 'time':
    case 'count':
      router.push('/practice')
      break
  }
}

const browseCategory = (category: string) => {
  router.push({ path: '/browse', query: { category } })
}

const randomPractice = (category?: string) => {
  let questions = questionStore.questions.filter(q => q.launchMode === 'unified')
  if (category) {
    questions = questions.filter(q => q.category === category)
  }
  
  if (questions.length === 0) {
    message.warning(t('overview.noQuestions'))
    return
  }
  
  const randomIndex = Math.floor(Math.random() * questions.length)
  const randomQuestion = questions[randomIndex]
  router.push({ path: '/practice-mode', query: { id: randomQuestion.id } })
}
</script>

<style scoped>
.overview-page {
  max-width: 1400px;
  margin: 0 auto;
}

.page-header {
  margin-bottom: 40px;
}

.page-title {
  font-size: 32px;
  font-weight: 800;
  color: var(--text-primary);
  margin: 0 0 8px 0;
  display: flex;
  align-items: center;
  gap: 12px;
}

.title-icon {
  font-size: 36px;
  /* color removed as requested */
}

.page-subtitle {
  font-size: 16px;
  color: var(--text-secondary);
  margin: 0;
}

.section-icon {
  font-size: 28px;
  vertical-align: middle;
  margin-right: 8px;
  color: var(--text-secondary);
}

.notion-section-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0 0 20px 0;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 16px;
  margin-bottom: 32px;
}

.stat-card {
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  padding: 20px;
  cursor: pointer;
  transition: var(--transition);
  display: flex;
  align-items: center;
  gap: 16px;
  position: relative;
}

.stat-card:hover {
  box-shadow: var(--shadow-md);
  border-color: var(--primary-color);
  transform: translateY(-2px);
}

.stat-icon-wrapper {
  width: 56px;
  height: 56px;
  background: var(--primary-color);
  border-radius: var(--radius-lg);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.stat-icon {
  font-size: 28px;
  color: white;
}

.stat-content {
  flex: 1;
}

.stat-label {
  font-size: 14px;
  color: var(--text-secondary);
  margin-bottom: 4px;
}

.stat-value {
  font-size: 24px;
  font-weight: 700;
  color: var(--text-primary);
  line-height: 1.2;
}

.stat-unit {
  font-size: 14px;
  color: var(--text-tertiary);
}

.stat-action {
  position: absolute;
  right: 16px;
  top: 50%;
  transform: translateY(-50%);
  opacity: 0;
  transition: var(--transition);
}

.stat-card:hover .stat-action {
  opacity: 1;
}

.action-arrow {
  font-size: 24px;
  color: var(--primary-color);
}

.section {
  margin-bottom: 32px;
}

.welcome-section {
  display: flex;
  justify-content: center;
}

.welcome-card {
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  padding: 48px 32px;
  text-align: center;
  max-width: 100%;
  width: 100%;
}

.welcome-icon-wrapper {
  width: 80px;
  height: 80px;
  background: var(--primary-color);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 24px;
}

.welcome-icon {
  font-size: 40px;
  color: white;
}

.welcome-title {
  font-size: 24px;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0 0 12px 0;
}

.welcome-desc {
  font-size: 14px;
  color: var(--text-secondary);
  margin: 0 0 32px 0;
  line-height: 1.6;
}

.welcome-actions {
  display: flex;
  gap: 12px;
  justify-content: center;
  flex-wrap: wrap;
}

.welcome-btn {
  padding: 12px 24px;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  cursor: pointer;
  transition: var(--transition);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.welcome-btn:hover {
  border-color: var(--primary-color);
  color: var(--primary-color);
}

.welcome-btn.primary {
  background: var(--primary-color);
  border-color: var(--primary-color);
  color: white;
}

.welcome-btn.primary:hover {
  background: var(--primary-hover);
  border-color: var(--primary-hover);
}

.progress-overview {
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  padding: 24px;
}

.progress-summary {
  display: flex;
  justify-content: space-around;
  margin-bottom: 20px;
}

.summary-item {
  text-align: center;
}

.summary-label {
  display: block;
  font-size: 14px;
  color: var(--text-secondary);
  margin-bottom: 8px;
}

.summary-value {
  font-size: 28px;
  font-weight: 700;
  color: var(--text-primary);
}

.summary-divider {
  width: 1px;
  background: var(--border-color);
}

.progress-bar-large {
  height: 12px;
  background: var(--bg-tertiary);
  border-radius: 6px;
  overflow: hidden;
}

.progress-fill-large {
  height: 100%;
  background: var(--primary-color);
  border-radius: 6px;
  transition: width 0.5s ease;
}

.category-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 16px;
}

.category-card {
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  padding: 20px;
  transition: var(--transition);
  width: 100%;
}

.category-card:hover {
  box-shadow: var(--shadow-md);
  border-color: var(--primary-color);
}

.category-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.category-name {
  font-size: 20px;
  font-weight: 700;
  color: var(--text-primary);
}

.category-count {
  font-size: 14px;
  color: var(--text-secondary);
  font-weight: 500;
}

.category-actions {
  display: flex;
  gap: 8px;
}

.action-button {
  flex: 1;
  padding: 10px 16px;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
  cursor: pointer;
  transition: var(--transition);
}

.action-button:hover {
  border-color: var(--primary-color);
  color: var(--primary-color);
}

.action-button.primary {
  background: var(--primary-color);
  border-color: var(--primary-color);
  color: white;
}

.action-button.primary:hover {
  background: var(--primary-hover);
  border-color: var(--primary-hover);
}

@media (max-width: 768px) {
  .stats-grid {
    grid-template-columns: 1fr;
  }

  .progress-summary {
    flex-direction: column;
    gap: 16px;
  }

  .summary-divider {
    display: none;
  }

  .category-grid {
    grid-template-columns: 1fr;
  }

  .welcome-card {
    padding: 32px 20px;
  }

  .welcome-title {
    font-size: 20px;
  }

  .welcome-desc {
    font-size: 13px;
  }

  .welcome-actions {
    flex-direction: column;
  }

  .welcome-btn {
    width: 100%;
  }

  /* 移动端学习进度内容左对齐 */
  .stat-content {
    text-align: left;
  }

  .stat-label,
  .stat-value {
    text-align: left;
  }
}

.latest-practice-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 16px;
}

.practice-card {
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  padding: 16px;
  cursor: pointer;
  transition: var(--transition);
  min-height: 100px;
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.practice-card:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-md);
  border-color: var(--primary-color);
}

.practice-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  gap: 12px;
}

.title-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1;
}

.practice-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
  line-height: 1.4;
}

.practice-subtitle {
  font-size: 13px;
  color: var(--text-secondary);
}

.practice-time {
  font-size: 12px;
  color: var(--text-tertiary);
  white-space: nowrap;
}

.practice-meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}

.meta-left {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.meta-tag {
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 4px;
  background: var(--bg-tertiary);
  color: var(--text-secondary);
}

.meta-tag.meta-category-p1 {
  font-weight: 600;
  background: rgba(16, 185, 129, 0.12);
  color: #059669;
}

.meta-tag.meta-category-p2 {
  font-weight: 600;
  background: rgba(59, 130, 246, 0.12);
  color: #2563eb;
}

.meta-tag.meta-category-p3 {
  font-weight: 600;
  background: rgba(139, 92, 246, 0.12);
  color: #7c3aed;
}

.meta-tag.meta-category-default {
  font-weight: 600;
  background: var(--bg-tertiary);
  color: var(--text-secondary);
}

.meta-tag.meta-frequency-high {
  font-weight: 600;
  background: rgba(239, 68, 68, 0.1);
  color: #dc2626;
}

.meta-tag.meta-frequency-medium {
  font-weight: 600;
  background: rgba(234, 179, 8, 0.14);
  color: #ea580c;
}

.meta-tag.meta-frequency-low {
  font-weight: 600;
  background: rgba(96, 165, 250, 0.12);
  color: #60a5fa;
}

.meta-tag.meta-frequency-default {
  font-weight: 600;
  background: var(--bg-tertiary);
  color: var(--text-secondary);
}

.meta-tag.score {
  display: flex;
  align-items: center;
  gap: 4px;
}

.meta-tag.score.highlight {
  background: rgba(22, 163, 74, 0.1);
  color: #16a34a;
  border: 1px solid rgba(22, 163, 74, 0.2);
  font-weight: 600;
}

.no-data {
  text-align: center;
  padding: 40px;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  color: var(--text-tertiary);
}

.no-data-icon {
  font-size: 48px;
  opacity: 0.5;
  margin-bottom: 16px;
}

.section-header-flex {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.view-all-btn {
  font-size: 14px;
  font-weight: 600;
  color: var(--primary-color);
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: var(--radius-sm);
  transition: var(--transition);
}

.view-all-btn:hover {
  background: var(--bg-secondary);
}

.latest-achievements-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
}

@media (max-width: 1024px) {
  .latest-achievements-grid {
    grid-template-columns: repeat(3, 1fr);
  }
}

@media (max-width: 768px) {
  .latest-achievements-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 480px) {
  .latest-achievements-grid {
    grid-template-columns: 1fr;
  }
}

.mini-achievement-card {
  display: flex;
  align-items: center;
  gap: 16px;
  background: var(--bg-primary);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-md);
  padding: 20px;
  transition: var(--transition);
}

.mini-achievement-card:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-sm);
  border-color: var(--primary-color);
}

.mini-icon-wrapper {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.mini-icon {
  font-size: 28px;
  color: white;
}

.mini-info {
  flex: 1;
  min-width: 0;
}

.mini-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.mini-date {
  font-size: 11px;
  color: var(--text-tertiary);
}

.no-achievements {
  text-align: center;
  padding: 32px;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  color: var(--text-tertiary);
}

.no-data-icon {
  font-size: 48px;
  margin-bottom: 8px;
  opacity: 0.5;
}

/* Icon Colors */
.color-blue { background: #3b82f6; }
.color-cyan { background: #06b6d4; }
.color-indigo { background: #6366f1; }
.color-purple { background: #8b5cf6; }
.color-green { background: #10b981; }
.color-pink { background: #ec4899; }
.color-gold { background: #f59e0b; }
.color-orange { background: #f97316; }
.color-default { background: #94a3b8; }
</style>
