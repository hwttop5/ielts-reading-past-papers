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
        <div class="header-actions">
          <div class="section-actions">
            <input type="file" ref="fileInput" accept=".json" style="display: none" @change="handleImport">
            <button class="action-button" @click="triggerImport">
              <span class="material-icons" style="font-size: 18px;">upload_file</span> {{ t('practice.import') }}
            </button>
            <button class="action-button" @click="exportData">
              <span class="material-icons" style="font-size: 18px;">download</span> {{ t('practice.export') }}
            </button>
            <button class="action-button danger" @click="clear">
              <span class="material-icons" style="font-size: 18px;">delete</span> {{ t('practice.clearRecords') }}
            </button>
            <div class="page-size-selector">
              <span class="page-size-label">{{ t('browse.itemsPerPage') }}:</span>
              <select v-model="pageSize" class="filter-select small">
                <option :value="10">10</option>
                <option :value="20">20</option>
                <option :value="50">50</option>
                <option :value="100">100</option>
              </select>
            </div>
          </div>
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
        <div
          v-for="item in paginatedRecords"
          :key="item.id"
          class="timeline-item"
          :class="{ reviewable: canReviewRecord(item), unavailable: !canReviewRecord(item) }"
          @click="openReview(item)"
        >
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
            <div class="record-footer">
              <span class="record-review-link">{{ reviewLabel(item) }}</span>
              <span v-if="!canReviewRecord(item)" class="record-review-hint">{{ reviewUnavailableHint }}</span>
            </div>
          </div>
        </div>
      </div>

      <div v-if="totalPages > 1" class="pagination-section">
        <button class="pagination-button" :disabled="currentPage === 1" @click="currentPage -= 1">
          <span class="material-icons pagination-icon">arrow_back</span> {{ t('browse.prev') }}
        </button>

        <div class="page-numbers">
          <template v-for="page in displayPages" :key="page">
            <button
              v-if="page !== -1"
              :class="['page-number', { active: page === currentPage }]"
              @click="currentPage = page"
            >
              {{ page }}
            </button>
            <span v-else class="page-ellipsis">...</span>
          </template>
        </div>

        <button class="pagination-button" :disabled="currentPage === totalPages" @click="currentPage += 1">
          {{ t('browse.next') }} <span class="material-icons pagination-icon">arrow_forward</span>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, inject, ref, watch, type Readonly, type Ref } from 'vue'
import { useRouter } from 'vue-router'
import { usePracticeStore, type PracticeRecord } from '@/store/practiceStore'
import { useAchievementStore } from '@/store/achievementStore'
import { message } from 'ant-design-vue'
import { eventBus, PRACTICE_UPDATED } from '@/utils/eventBus'
import { exportBackup, importBackup } from '@/utils/backup'
import { buildPracticeReviewRoute, canReviewPracticeRecord } from '@/utils/practiceReview'

const router = useRouter()
const store = usePracticeStore()
const achievementStore = useAchievementStore()
const t = inject('t', (key: string) => key)
const currentLang = inject<Readonly<Ref<'zh' | 'en'>>>('currentLang', ref('zh') as Readonly<Ref<'zh' | 'en'>>)
const fileInput = ref<HTMLInputElement | null>(null)

// 分页状态
const currentPage = ref(1)
const pageSize = ref(10)

// 当记录变化时重置到第一页
watch(() => store.records.length, () => {
  currentPage.value = 1
})

// 当每页显示数量变化时，检查并重置当前页码到有效范围
watch(() => pageSize.value, () => {
  const maxPage = Math.ceil(store.records.length / pageSize.value) || 1
  if (currentPage.value > maxPage) {
    currentPage.value = maxPage
  }
})

// 计算总分页数量
const totalPages = computed(() => {
  return Math.ceil(store.records.length / pageSize.value) || 1
})

// 获取当前页的记录
const paginatedRecords = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value
  const end = start + pageSize.value
  return store.records.slice(start, end)
})

// 计算要显示的页码（智能分页）
const displayPages = computed(() => {
  const pages: number[] = []
  const total = totalPages.value
  const current = currentPage.value

  if (total <= 7) {
    for (let page = 1; page <= total; page += 1) {
      pages.push(page)
    }
    return pages
  }

  if (current <= 4) {
    for (let page = 1; page <= 5; page += 1) {
      pages.push(page)
    }
    pages.push(-1, total)
    return pages
  }

  if (current >= total - 3) {
    pages.push(1, -1)
    for (let page = total - 4; page <= total; page += 1) {
      pages.push(page)
    }
    return pages
  }

  return [1, -1, current - 1, current, current + 1, -1, total]
})

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

const canReviewRecord = (record: PracticeRecord) => canReviewPracticeRecord(record)

const reviewLabel = (record: PracticeRecord) =>
  canReviewPracticeRecord(record)
    ? currentLang.value === 'en' ? 'Open review' : '查看复盘'
    : currentLang.value === 'en' ? 'Review unavailable' : '暂不可复盘'

const reviewUnavailableHint = computed(() =>
  currentLang.value === 'en'
    ? 'This older record does not include an attempt snapshot, so its highlights and answers cannot be restored.'
    : '这条旧记录没有作答快照，无法恢复当时的高亮和答案。'
)

const openReview = (record: PracticeRecord) => {
  if (!canReviewPracticeRecord(record)) {
    return
  }
  router.push(buildPracticeReviewRoute(record))
}

const exportData = () => {
  try {
    exportBackup()
    message.success(t('practice.exportSuccess'))
  } catch (e) {
    message.error('Export failed')
  }
}

const triggerImport = () => {
  fileInput.value?.click()
}

const handleImport = async (event: Event) => {
  const input = event.target as HTMLInputElement
  if (!input.files || input.files.length === 0) return
  
  const file = input.files[0]
  try {
    const success = await importBackup(file)
    if (success) {
      store.load()
      achievementStore.load()
      message.success(t('practice.importSuccess') || 'Import successful')
    } else {
      message.error(t('practice.importFailed') || 'Import failed')
    }
  } catch (e) {
    message.error(t('practice.importFailed') || 'Import failed')
  } finally {
    // Reset input
    input.value = ''
  }
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

.header-actions {
  display: flex;
  align-items: center;
  gap: 16px;
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
  align-items: center;
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
  background: rgba(220, 38, 38, 0.1);
}

@media (max-width: 768px) {
  .section-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 16px;
  }

  .header-actions {
    width: 100%;
  }

  .section-actions {
    width: 100%;
    gap: 12px;
    flex-direction: column;
  }

  .action-button {
    width: 100%;
    justify-content: center;
  }

  .page-size-selector {
    display: flex;
    align-items: center;
    justify-content: flex-start;
    gap: 8px;
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

.timeline-item.reviewable {
  cursor: pointer;
}

.timeline-item.unavailable {
  cursor: default;
  opacity: 0.88;
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

.timeline-item.reviewable .timeline-content:hover {
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

.record-footer {
  margin-top: 14px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.record-review-link {
  font-size: 13px;
  font-weight: 700;
  color: var(--primary-color);
}

.record-review-hint {
  font-size: 12px;
  color: var(--text-secondary);
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

.pagination-section {
  justify-content: center;
  gap: 12px;
  flex-wrap: wrap;
  display: flex;
  align-items: center;
  padding-top: 16px;
  border-top: 1px solid var(--border-color);
  margin-top: 24px;
}

.pagination-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 10px 16px;
  font-size: 14px;
  font-weight: 600;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  color: var(--text-primary);
  border-radius: 12px;
  min-width: 112px;
  cursor: pointer;
  transition: var(--transition);
}

.pagination-button:hover:not(:disabled) {
  border-color: var(--primary-color);
  color: var(--primary-color);
}

.pagination-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.pagination-icon {
  font-size: 18px;
}

.page-numbers {
  display: flex;
  align-items: center;
  gap: 8px;
}

.page-number {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  color: var(--text-primary);
  border-radius: 12px;
  cursor: pointer;
  transition: var(--transition);
  font-size: 14px;
  font-weight: 600;
}

.page-number:hover {
  border-color: var(--primary-color);
  color: var(--primary-color);
}

.page-number.active {
  background: var(--primary-color);
  color: white;
  border-color: transparent;
}

.page-ellipsis {
  color: var(--text-tertiary);
  padding: 0 4px;
}

.page-size-selector {
  display: flex;
  align-items: center;
  gap: 8px;
}

.page-size-label {
  font-size: 14px;
  color: var(--text-secondary);
}

.filter-select {
  padding: 8px 16px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  background: var(--bg-primary);
  color: var(--text-primary);
  font-size: 14px;
  cursor: pointer;
  transition: var(--transition);
}

.filter-select.small {
  padding: 6px 12px;
}

.filter-select:hover {
  border-color: var(--primary-color);
}

@media (max-width: 768px) {
  .pagination-section {
    flex-direction: column;
    align-items: stretch;
    gap: 8px;
  }

  .pagination-button {
    min-width: auto;
    width: 100%;
  }

  .page-numbers {
    justify-content: center;
  }
}
</style>
