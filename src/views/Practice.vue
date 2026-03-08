<template>
  <div class="practice-page">
    <div class="page-header">
      <div class="header-content">
        <h1 class="page-title"><span class="material-icons title-icon">edit_note</span> {{ t('menu.practice') }}</h1>
        <p class="page-subtitle">{{ t('practice.description') }}</p>
      </div>
    </div>

    <div class="stats-grid">
      <div class="stat-card">
        <span class="material-icons stat-icon">format_list_bulleted</span>
        <div class="stat-content">
          <div class="stat-label">{{ t('practice.practicedQuestions') }}</div>
          <div class="stat-value">{{ total }}</div>
        </div>
      </div>

      <div class="stat-card">
        <span class="material-icons stat-icon">trending_up</span>
        <div class="stat-content">
          <div class="stat-label">{{ t('practice.avgAccuracy') }}</div>
          <div class="stat-value">{{ avg }}%</div>
        </div>
      </div>

      <div class="stat-card">
        <span class="material-icons stat-icon">schedule</span>
        <div class="stat-content">
          <div class="stat-label">{{ t('practice.studyTime') }}</div>
          <div class="stat-value">{{ totalTime }}<span class="stat-unit">{{ t('overview.minutes') }}</span></div>
        </div>
      </div>

      <div class="stat-card">
        <span class="material-icons stat-icon">stars</span>
        <div class="stat-content">
          <div class="stat-label">{{ t('practice.practiceCount') }}</div>
          <div class="stat-value">{{ practiceCount }}</div>
        </div>
      </div>
    </div>

    <div class="section">
      <div class="section-header">
        <h2 class="notion-section-title"><span class="material-icons">history</span> {{ t('practice.history') }}</h2>
        <div class="section-actions">
          <button class="action-button" @click="exportMd">
            <span class="material-icons" style="font-size: 18px;">description</span> {{ t('practice.exportMd') }}
          </button>
          <button class="action-button danger" @click="clear">
            <span class="material-icons" style="font-size: 18px;">delete</span> {{ t('practice.clearRecords') }}
          </button>
        </div>
      </div>

      <div v-if="store.records.length === 0" class="empty-state">
        <span class="material-icons empty-icon">edit_note</span>
        <div class="empty-text">{{ t('practice.noRecords') }}</div>
        <button class="start-button" @click="$router.push('/browse')">
          {{ t('practice.startPractice') }} <span class="material-icons" style="font-size: 16px;">arrow_forward</span>
        </button>
      </div>

      <div v-else class="timeline">
        <div v-for="item in store.records" :key="item.id" class="timeline-item">
          <div class="timeline-dot"></div>
          <div class="timeline-content">
            <div class="record-header">
              <div class="record-title">{{ item.questionTitle }}</div>
              <div class="record-time">{{ format(item.time) }}</div>
            </div>
            
            <div class="record-meta">
              <span class="meta-item">
                <span class="material-icons meta-icon" style="font-size: 16px;">category</span>
                {{ item.category }}
              </span>
              <span class="meta-item">
                <span class="material-icons meta-icon" style="font-size: 16px;">schedule</span>
                {{ item.duration }}{{ t('practice.seconds') }}
              </span>
              <span class="meta-item">
                <span class="material-icons meta-icon" style="font-size: 16px;">check_circle</span>
                {{ item.correctAnswers }}/{{ item.totalQuestions }}
              </span>
              <span :class="['meta-item', 'accuracy', item.accuracy >= 80 ? 'high' : item.accuracy >= 60 ? 'medium' : 'low']">
                <span class="material-icons meta-icon" style="font-size: 16px;">trending_up</span>
                {{ item.accuracy }}%
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, inject } from 'vue'
import { usePracticeStore } from '@/store/practiceStore'
import { useAchievementStore } from '@/store/achievementStore'
import { message } from 'ant-design-vue'
import { eventBus, PRACTICE_UPDATED } from '@/utils/eventBus'

const store = usePracticeStore()
const achievementStore = useAchievementStore()
const t = inject('t', (key: string) => key)

// 处理数据更新
const handlePracticeUpdated = (event: CustomEvent) => {
  // 重新加载数据
  store.load()
  achievementStore.load()
}

onMounted(() => {
  store.load()
  achievementStore.load()
  
  // 监听数据更新事件
  eventBus.on(PRACTICE_UPDATED, handlePracticeUpdated)
})

onUnmounted(() => {
  eventBus.off(PRACTICE_UPDATED, handlePracticeUpdated)
})

const total = computed(() => store.totalCount)
const avg = computed(() => store.avgAccuracy)
const totalTime = computed(() => Math.floor(store.totalTime / 60))
const practiceCount = computed(() => store.totalCount)

const clear = () => {
  if (confirm(t('practice.clearConfirm'))) {
    store.clear()
    achievementStore.reset()
    achievementStore.check()
    message.success(t('practice.recordsCleared'))
  }
}

const format = (ts: number) => {
  const date = new Date(ts)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

const exportMd = () => {
  const practiceMd = store.records
    .map(r =>
      `- ${format(r.time)} | ${r.questionTitle} | ${t('practice.duration')} ${r.duration}${t('practice.seconds')} | ${t('practice.accuracy')} ${r.accuracy}%`
    )
    .join('\n')

  const achievementMd = achievementStore.unlockedAchievements
    .map(a => 
      `- [${t(a.titleKey)}] ${t(a.descKey)} - ${new Date(a.unlockedAt || 0).toLocaleDateString()}`
    )
    .join('\n')

  const md = `# IELTS Reading Practice Records\n\n## Practice History\n${practiceMd}\n\n## Achievements\n${achievementMd}`

  const blob = new Blob([md], { type: 'text/markdown' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `ielts_practice_history_${new Date().toISOString().slice(0, 10)}.md`
  a.click()
  message.success(t('practice.exportSuccess'))
}
</script>

<style scoped>
.practice-page {
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
  /* color removed */
}

.page-subtitle {
  font-size: 16px;
  color: var(--text-secondary);
  margin: 0;
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
  padding: 24px;
  display: flex;
  align-items: center;
  gap: 16px;
  transition: var(--transition);
}

.stat-card:hover {
  box-shadow: var(--shadow-md);
  border-color: var(--primary-color);
}

.stat-icon {
  font-size: 36px;
  flex-shrink: 0;
  color: var(--primary-color);
}

.stat-content {
  flex: 1;
}

.stat-label {
  font-size: 14px;
  color: var(--text-secondary);
  font-weight: 500;
  margin-bottom: 4px;
}

.stat-value {
  font-size: 28px;
  font-weight: 700;
  color: var(--text-primary);
  letter-spacing: -0.02em;
  line-height: 1.2;
}

.stat-unit {
  font-size: 14px;
  color: var(--text-tertiary);
  margin-left: 4px;
}

.section {
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  padding: 24px;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
}

.notion-section-title {
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0;
  display: flex;
  align-items: center;
  gap: 8px;
}

.section-actions {
  display: flex;
  gap: 8px;
}

.action-button {
  padding: 8px 16px;
  border: 1px solid var(--border-color);
  background: var(--bg-primary);
  color: var(--text-primary);
  border-radius: var(--radius-sm);
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: var(--transition);
  display: flex;
  align-items: center;
  gap: 6px;
}

.action-button:hover {
  border-color: var(--primary-color);
  color: var(--primary-color);
}

.action-button.danger {
  color: #dc2626;
}

.action-button.danger:hover {
  border-color: #dc2626;
  background: #fef2f2;
}

@media (max-width: 768px) {
  .section-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 16px;
  }
  
  .section-actions {
    width: 100%;
    gap: 12px;
  }
  
  .action-button {
    flex: 1;
    justify-content: center;
  }
}

.empty-state {
  text-align: center;
  padding: 64px 24px;
}

.empty-icon {
  font-size: 64px;
  margin-bottom: 16px;
  color: var(--text-tertiary);
}

.empty-text {
  font-size: 14px;
  color: var(--text-secondary);
  margin-bottom: 24px;
}

.start-button {
  padding: 12px 24px;
  background: var(--primary-color);
  color: white;
  border: 1px solid var(--primary-color);
  border-radius: var(--radius-md);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: var(--transition);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin: 0 auto;
}

.start-button:hover {
  background: var(--primary-hover);
  border-color: var(--primary-hover);
}

.timeline {
  position: relative;
  padding-left: 24px;
}

.timeline::before {
  content: '';
  position: absolute;
  left: 7px;
  top: 8px;
  bottom: 8px;
  width: 2px;
  background: var(--border-color);
}

.timeline-item {
  position: relative;
  padding-bottom: 24px;
}

.timeline-item:last-child {
  padding-bottom: 0;
}

.timeline-dot {
  position: absolute;
  left: -24px;
  top: 8px;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: var(--primary-color);
  border: 2px solid var(--bg-primary);
  z-index: 1;
}

.timeline-content {
  background: var(--bg-secondary);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-md);
  padding: 16px;
  transition: var(--transition);
}

.timeline-content:hover {
  border-color: var(--primary-color);
  box-shadow: var(--shadow-sm);
}

.record-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 12px;
  gap: 12px;
}

.record-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
  flex: 1;
}

.record-time {
  font-size: 13px;
  color: var(--text-tertiary);
  flex-shrink: 0;
}

.record-meta {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
}

.meta-item {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 14px;
  color: var(--text-secondary);
}

.meta-icon {
  font-size: 16px;
}

.meta-item.accuracy.high {
  color: #16a34a;
}

.meta-item.accuracy.medium {
  color: #ea580c;
}

.meta-item.accuracy.low {
  color: #dc2626;
}
</style>
