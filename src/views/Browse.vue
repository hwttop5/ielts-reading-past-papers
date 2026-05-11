<template>
  <div class="browse-page">
    <div class="page-header">
      <div class="header-content">
        <h1 class="page-title"><span class="material-icons title-icon">library_books</span> {{ t('menu.browse') }}</h1>
        <p class="page-subtitle">{{ t('browse.description') }}</p>
        <p class="page-disclaimer">
          <span class="material-icons disclaimer-icon">warning</span>
          {{ t('browse.disclaimer') }}
        </p>
      </div>
    </div>

    <div class="filter-section">
      <div class="filter-group">
        <div class="filter-item">
          <span class="filter-label">{{ t('browse.category') }}:</span>
          <select v-model="category" class="filter-select">
            <option value="all">{{ t('browse.allCategories') }}</option>
            <option value="P1">P1</option>
            <option value="P2">P2</option>
            <option value="P3">P3</option>
          </select>
        </div>

        <div class="filter-item">
          <span class="filter-label">{{ t('browse.frequency') }}:</span>
          <select v-model="frequency" class="filter-select">
            <option value="all">{{ t('browse.allFrequency') }}</option>
            <option value="high">{{ t('browse.frequency.high') }}</option>
            <option value="medium">{{ t('browse.frequency.medium') }}</option>
            <option value="low">{{ t('browse.frequency.low') }}</option>
          </select>
        </div>

        <div class="filter-item">
          <span class="filter-label">{{ t('browse.sortLabel') }}:</span>
          <select v-model="sortMode" class="filter-select">
            <option value="title-asc">{{ t('browse.sort.titleAsc') }}</option>
            <option value="number-asc">{{ t('browse.sort.numberAsc') }}</option>
            <option value="number-desc">{{ t('browse.sort.numberDesc') }}</option>
            <option value="accuracy-asc" :disabled="!hasPracticeRecords">{{ t('browse.sort.accuracyAsc') }}</option>
            <option value="accuracy-desc" :disabled="!hasPracticeRecords">{{ t('browse.sort.accuracyDesc') }}</option>
          </select>
        </div>

        <div class="filter-item filter-input-wrapper">
          <span class="filter-label">{{ t('browse.searchLabel') }}:</span>
          <div class="filter-search-wrap" :class="{ 'has-value': searchText.length > 0 }">
            <input
              v-model="searchText"
              type="text"
              class="filter-search-field"
              :placeholder="t('browse.searchPlaceholder')"
              autocomplete="off"
              spellcheck="false"
            />
            <button
              v-show="searchText.length > 0"
              type="button"
              class="filter-search-clear"
              @click="searchText = ''"
            >
              <span class="material-icons" aria-hidden="true">close</span>
            </button>
          </div>
        </div>
      </div>

      <div class="filter-footer">
        <div class="result-info">
          <span class="result-count">{{ t('browse.totalQuestions', { count: filtered.length }) }}</span>
          <span v-if="filtered.length > 0" class="page-info">
            {{ t('browse.pageInfo', { current: currentPage, total: totalPages }) }}
          </span>
        </div>
        <div class="page-size-selector">
          <span class="page-size-label">{{ t('browse.itemsPerPage') }}:</span>
          <select v-model="pageSize" class="filter-select small">
            <option :value="6">6</option>
            <option :value="12">12</option>
            <option :value="24">24</option>
            <option :value="48">48</option>
          </select>
        </div>
      </div>
    </div>

    <div v-if="filtered.length === 0" class="empty-state">
      <span class="material-icons empty-icon">search</span>
      <div class="empty-text">{{ t('browse.noQuestions') }}</div>
    </div>

    <div v-else>
      <div class="questions-grid">
        <div v-for="question in paginatedQuestions" :key="question.id" class="question-card" @click="start(question)">
          <div class="question-header">
            <span class="question-title">{{ question.title }}</span>
            <span :class="['question-category', `category-${question.category.toLowerCase()}`]">
              {{ question.category }}
            </span>
          </div>

          <div v-if="currentLang === 'zh' && question.titleCN" class="question-subtitle">{{ question.titleCN }}</div>

          <div class="question-tags">
            <span :class="['tag', `tag-${question.frequency}`]">
              {{ getFrequencyLabel(question.frequency) }}
            </span>
            <span v-if="question.launchMode === 'pdf_only'" :class="['tag', 'tag-mode', 'tag-mode-pdf']">
              {{ t('browse.pdfOnlyMode') }}
            </span>
            <span :class="['tag', 'tag-count', isQuestionCompleted(question.id) ? 'tag-completed' : '']">
              <span class="material-icons tag-icon">
                {{ isQuestionCompleted(question.id) ? 'check_circle' : 'pending' }}
              </span>
              {{ isQuestionCompleted(question.id) ? getQuestionScore(question.id) : `${question.totalQuestions} ${t('overview.questions')}` }}
            </span>
          </div>

          <div class="question-footer">
            <button class="view-pdf-btn" @click.stop="viewPdf(question)" :title="t('browse.viewPdf')" :disabled="!question.pdfPath">
              <span class="material-icons">picture_as_pdf</span>
            </button>
            <button class="start-button" @click.stop="start(question)" :disabled="isNavigating && question.launchMode === 'unified'">
              {{ question.launchMode === 'unified' ? t('browse.startPractice') : t('browse.openPdfOnly') }}
              <span v-if="!(isNavigating && question.launchMode === 'unified')" class="material-icons action-icon">
                {{ question.launchMode === 'unified' ? 'arrow_forward' : 'open_in_new' }}
              </span>
              <span v-else class="material-icons rotating action-icon">autorenew</span>
            </button>
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
import { computed, inject, nextTick, onMounted, ref, watch, type Ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { message } from 'ant-design-vue'
import { usePracticeStore } from '@/store/practiceStore'
import { useQuestionStore, type Question } from '@/store/questionStore'

const questionStore = useQuestionStore()
const practiceStore = usePracticeStore()
const route = useRoute()
const router = useRouter()
const t = inject('t', (key: string) => key)
const currentLang = inject<Readonly<Ref<'zh' | 'en'>>>('currentLang', ref('zh') as Readonly<Ref<'zh' | 'en'>>)

const category = ref('all')
const frequency = ref('all')
const sortMode = ref('number-asc')
const searchText = ref('')
const currentPage = ref(1)
const pageSize = ref(12)
const isRestoring = ref(false)
const isNavigating = ref(false)

function normalizeLegacyFrequency(value: string | undefined): string {
  switch (String(value || '').trim()) {
    case '高频':
      return 'high'
    case '中频':
      return 'medium'
    case '低频':
    case '次频':
      return 'low'
    default:
      return value || 'all'
  }
}

function getFrequencyLabel(value: string): string {
  switch (value) {
    case 'high':
      return t('browse.frequency.high')
    case 'medium':
      return t('browse.frequency.medium')
    case 'low':
      return t('browse.frequency.low')
    default:
      return value
  }
}

function openPDFSafely(pdfPath: string, examTitle: string) {
  const winName = `pdf_${Date.now()}`
  const options = 'width=1000,height=800,scrollbars=yes,resizable=yes,status=yes,toolbar=yes'
  let popup: Window | null = null

  try {
    popup = window.open(pdfPath, winName, options)
  } catch {
    popup = null
  }

  if (!popup) {
    try {
      window.location.href = pdfPath
      return
    } catch {
      message.error(t('browse.pdfError'))
      return
    }
  }

  message.success(`${t('browse.pdfOpening')} ${examTitle}`)
}

const isQuestionCompleted = (questionId: string) => practiceStore.records.some((record) => record.questionId === questionId)
const hasPracticeRecords = computed(() => practiceStore.records.length > 0)

const getQuestionScore = (questionId: string) => {
  const record = practiceStore.records.find((item) => item.questionId === questionId)
  return record ? `${record.correctAnswers}/${record.totalQuestions}` : ''
}

function getQuestionNumericOrder(question: Question): number {
  const match = String(question.id).match(/(\d+)(?!.*\d)/)
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER
}

function compareQuestionNumberAsc(left: Question, right: Question): number {
  const categoryOrder = ['P1', 'P2', 'P3']
  const categoryDiff = categoryOrder.indexOf(left.category) - categoryOrder.indexOf(right.category)
  if (categoryDiff !== 0) {
    return categoryDiff
  }

  const numericDiff = getQuestionNumericOrder(left) - getQuestionNumericOrder(right)
  if (numericDiff !== 0) {
    return numericDiff
  }

  return left.id.localeCompare(right.id)
}

function getLatestAccuracy(questionId: string): number | null {
  const record = practiceStore.records.find((item) => item.questionId === questionId)
  return record ? record.accuracy : null
}

const filtered = computed(() => {
  let questions = questionStore.questions

  if (category.value !== 'all') {
    questions = questions.filter((question) => question.category === category.value)
  }

  if (frequency.value !== 'all') {
    questions = questions.filter((question) => question.frequency === frequency.value)
  }

  if (searchText.value.trim()) {
    const keyword = searchText.value.trim().toLowerCase()
    questions = questions.filter((question) =>
      question.displayTitle.toLowerCase().includes(keyword)
      || question.title.toLowerCase().includes(keyword)
      || question.titleCN.toLowerCase().includes(keyword)
    )
  }

  const sorted = [...questions]
  switch (sortMode.value) {
    case 'title-asc':
      sorted.sort((left, right) => left.title.localeCompare(right.title, 'en', { sensitivity: 'base' }))
      break
    case 'number-desc':
      sorted.sort((left, right) => compareQuestionNumberAsc(right, left))
      break
    case 'accuracy-asc':
    case 'accuracy-desc':
      sorted.sort((left, right) => {
        const leftAccuracy = getLatestAccuracy(left.id)
        const rightAccuracy = getLatestAccuracy(right.id)
        const leftHasAccuracy = leftAccuracy !== null
        const rightHasAccuracy = rightAccuracy !== null

        if (leftHasAccuracy && rightHasAccuracy && leftAccuracy !== rightAccuracy) {
          return sortMode.value === 'accuracy-asc'
            ? leftAccuracy - rightAccuracy
            : rightAccuracy - leftAccuracy
        }

        if (leftHasAccuracy !== rightHasAccuracy) {
          return leftHasAccuracy ? -1 : 1
        }

        return compareQuestionNumberAsc(left, right)
      })
      break
    case 'number-asc':
    default:
      sorted.sort(compareQuestionNumberAsc)
      break
  }

  return sorted
})

const totalPages = computed(() => Math.max(1, Math.ceil(filtered.value.length / pageSize.value)))

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

const paginatedQuestions = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value
  return filtered.value.slice(start, start + pageSize.value)
})

function buildBrowseQuery() {
  const query: Record<string, string> = {
    page: String(currentPage.value),
    pageSize: String(pageSize.value)
  }

  if (category.value !== 'all') {
    query.category = category.value
  }

  if (frequency.value !== 'all') {
    query.frequency = frequency.value
  }

  if (searchText.value.trim()) {
    query.search = searchText.value.trim()
  }

  if (sortMode.value !== 'number-asc') {
    query.sort = sortMode.value
  }

  return query
}

function viewPdf(question: Question) {
  if (!question.pdfPath) {
    message.warning(t('browse.pdfNotFound'))
    return
  }

  openPDFSafely(question.pdfPath, question.displayTitle || question.title || 'PDF')
}

async function start(question: Question) {
  if (question.launchMode === 'pdf_only') {
    viewPdf(question)
    return
  }

  if (isNavigating.value) {
    return
  }

  isNavigating.value = true
  try {
    await router.push({
      path: '/practice-mode',
      query: {
        id: question.id,
        from: 'browse',
        ...buildBrowseQuery()
      }
    })
  } finally {
    isNavigating.value = false
  }
}

onMounted(() => {
  questionStore.loadQuestions()
  practiceStore.load()

  isRestoring.value = true
  category.value = typeof route.query.category === 'string' ? route.query.category : 'all'
  frequency.value = typeof route.query.frequency === 'string'
    ? route.query.frequency
    : normalizeLegacyFrequency(typeof route.query.difficulty === 'string' ? route.query.difficulty : undefined)
  sortMode.value = typeof route.query.sort === 'string' ? route.query.sort : 'number-asc'
  if (!hasPracticeRecords.value && (sortMode.value === 'accuracy-asc' || sortMode.value === 'accuracy-desc')) {
    sortMode.value = 'number-asc'
  }
  searchText.value = typeof route.query.search === 'string' ? route.query.search : ''

  if (typeof route.query.pageSize === 'string') {
    const parsedPageSize = Number(route.query.pageSize)
    if (Number.isFinite(parsedPageSize) && [6, 12, 24, 48].includes(parsedPageSize)) {
      pageSize.value = parsedPageSize
    }
  }

  if (typeof route.query.page === 'string') {
    const parsedPage = Number(route.query.page)
    if (Number.isFinite(parsedPage) && parsedPage > 0) {
      currentPage.value = parsedPage
    }
  }

  nextTick(() => {
    isRestoring.value = false
  })
})

watch([category, frequency, searchText, pageSize, sortMode], () => {
  if (!isRestoring.value) {
    currentPage.value = 1
  }
})

watch(hasPracticeRecords, (value) => {
  if (!value && (sortMode.value === 'accuracy-asc' || sortMode.value === 'accuracy-desc')) {
    sortMode.value = 'number-asc'
  }
})

watch(totalPages, (value) => {
  if (currentPage.value > value) {
    currentPage.value = value
  }
})
</script>

<style scoped>
.browse-page {
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
  margin: 0 0 8px;
  display: flex;
  align-items: center;
  gap: 12px;
  line-height: 1.2;
}

.title-icon {
  font-size: 36px;
  color: var(--primary-color);
}

.page-subtitle {
  font-size: 16px;
  color: var(--text-secondary);
  margin: 0;
}

.page-disclaimer {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--text-tertiary);
  margin-top: 8px;
}

.disclaimer-icon {
  color: var(--warning-color, #eab308);
  font-size: 14px;
}

.filter-section,
.question-card {
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-xs);
}

.filter-section {
  padding: 20px;
  margin-bottom: 24px;
}

.filter-group,
.filter-footer,
.page-size-selector,
.result-info,
.question-header,
.question-tags,
.question-footer,
.pagination-section,
.page-numbers {
  display: flex;
  align-items: center;
}

.filter-group {
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 16px;
}

.filter-item {
  display: flex;
  align-items: center;
  gap: 8px;
}

/* 与前三项同一行；PC 占满该行剩余横向空间 */
.filter-item.filter-input-wrapper {
  flex: 1 1 160px;
  min-width: 0;
  max-width: 100%;
}

.filter-item.filter-input-wrapper .filter-label {
  flex-shrink: 0;
}

/* 仅一层边框：不用 ant-input，也不叠用 .filter-select，避免与浏览器 input 默认样式冲突 */
.filter-search-wrap {
  position: relative;
  flex: 1 1 auto;
  min-width: 0;
  width: auto;
  max-width: 100%;
  display: block;
  padding: 0;
  margin: 0;
  border: none;
  background: transparent;
  box-shadow: none;
}

.filter-search-field {
  display: block;
  width: 100%;
  margin: 0;
  cursor: text;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  background: var(--bg-primary);
  color: var(--text-primary);
  font-size: 14px;
  padding: 8px 16px;
  min-height: 40px;
  height: 40px;
  box-sizing: border-box;
  line-height: 22px;
  appearance: none;
  -webkit-appearance: none;
  box-shadow: none;
}

.filter-search-field:hover {
  border-color: var(--primary-color);
}

.filter-search-field:focus {
  outline: none;
  border-color: var(--primary-color);
  box-shadow: 0 0 0 3px var(--primary-ring);
}

.filter-search-wrap.has-value .filter-search-field {
  padding-right: 36px;
}

.filter-search-clear {
  position: absolute;
  right: 6px;
  top: 50%;
  transform: translateY(-50%);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--text-tertiary);
  cursor: pointer;
}

.filter-search-clear:hover {
  color: var(--text-primary);
  background: var(--surface-hover);
}

.filter-search-clear .material-icons {
  font-size: 18px;
}

.filter-footer {
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  padding-top: 16px;
  border-top: 1px solid var(--border-color);
}

.filter-label,
.page-size-label,
.result-count,
.page-info {
  font-size: 14px;
  color: var(--text-secondary);
}

.filter-label,
.page-size-label {
  font-weight: 600;
}

.page-info {
  color: var(--text-tertiary);
}

.page-size-selector,
.result-info {
  gap: 8px;
}

.filter-select,
.filter-search-field,
.pagination-button,
.page-number,
.view-pdf-btn,
.start-button {
  transition: var(--transition, all 0.2s ease);
}

.filter-select {
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  background-color: var(--bg-primary);
  color: var(--text-primary);
  font-size: 14px;
  padding: 8px 16px;
  /* 自定义箭头；距右缘 10px，右侧留白收紧 */
  padding-right: 34px;
  min-height: 40px;
  box-sizing: border-box;
  cursor: pointer;
  appearance: none;
  -webkit-appearance: none;
  -moz-appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='20' height='20' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 10px center;
  background-size: 18px 18px;
}

.filter-select.small {
  padding: 6px 12px;
  padding-right: 30px;
  min-height: auto;
  background-position: right 10px center;
  background-size: 16px 16px;
}

.filter-select:hover {
  border-color: var(--primary-color);
  outline: none;
}

.filter-select:focus {
  border-color: var(--primary-color);
  outline: none;
  box-shadow: 0 0 0 3px var(--primary-ring);
}

.empty-state {
  background: var(--bg-primary);
  border: 1px dashed var(--border-color);
  border-radius: var(--radius-lg);
  padding: 48px 24px;
  text-align: center;
  color: var(--text-tertiary);
  box-shadow: var(--shadow-xs);
}

.empty-icon {
  font-size: 40px;
  margin-bottom: 12px;
}

.questions-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 20px;
}

.question-card {
  padding: 20px;
  cursor: pointer;
  min-height: 220px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  border: 1px solid var(--border-color);
}

.question-card:hover {
  transform: translateY(-1px);
  box-shadow: var(--shadow-md);
  border-color: var(--primary-border);
}

.question-header {
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
}

.question-title {
  font-size: 18px;
  font-weight: 700;
  color: var(--text-primary);
  line-height: 1.4;
}

.question-subtitle {
  margin-top: 10px;
  font-size: 14px;
  color: var(--text-secondary);
  line-height: 1.6;
}

.question-category {
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
  border: 1px solid transparent;
}

.category-p1 {
  background: var(--success-soft);
  color: var(--success-color);
}

.category-p2 {
  background: var(--info-soft);
  color: var(--info-color);
}

.category-p3 {
  background: var(--purple-soft);
  color: var(--purple-color);
}

.question-tags {
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 18px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--divider-subtle);
}

.tag {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
}

.tag-high {
  background: var(--danger-soft);
  color: var(--danger-color);
}

.tag-medium {
  background: var(--warning-soft);
  color: var(--warning-strong);
}

.tag-low {
  background: var(--info-soft);
  color: var(--info-color);
}

.tag-mode {
  border: 1px solid transparent;
}

.tag-mode-unified {
  background: var(--success-soft);
  color: var(--success-color);
}

.tag-mode-pdf {
  background: var(--info-soft);
  color: var(--info-color);
}

.tag-count {
  background: rgba(148, 163, 184, 0.12);
  color: var(--text-secondary);
  border-color: rgba(148, 163, 184, 0.16);
}

.tag-completed {
  background: var(--success-soft);
  color: var(--success-color);
}

.tag-icon,
.action-icon,
.pagination-icon,
.view-pdf-btn .material-icons {
  font-size: 16px;
}

.question-footer {
  justify-content: space-between;
  gap: 12px;
  margin-top: 16px;
}

.view-pdf-btn,
.start-button,
.pagination-button,
.page-number {
  border: none;
  cursor: pointer;
}

.view-pdf-btn {
  width: 40px;
  height: 40px;
  border-radius: var(--radius-md);
  background: var(--control-muted-bg);
  color: var(--text-primary);
  border: 1px solid var(--border-color);
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.view-pdf-btn:hover {
  border-color: var(--primary-color);
  background: var(--surface-active);
  color: var(--primary-color);
}

.view-pdf-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.start-button,
.pagination-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 10px 16px;
  font-size: 14px;
  font-weight: 600;
}

.start-button {
  flex: 1;
  border-radius: var(--radius-md);
  background: var(--primary-color, #2563eb);
  color: white;
  box-shadow: var(--primary-shadow-sm);
}

.start-button:hover:not(:disabled) {
  background: var(--primary-hover);
  box-shadow: var(--primary-shadow-md);
}

.start-button:disabled {
  opacity: 0.7;
  cursor: wait;
}

.pagination-section {
  justify-content: center;
  gap: 12px;
  margin-top: 28px;
  flex-wrap: wrap;
}

.pagination-button,
.page-number {
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  color: var(--text-primary);
}

.pagination-button {
  min-width: 112px;
  border-radius: var(--radius-md);
}

.pagination-button:hover:not(:disabled),
.page-number:hover:not(.active) {
  border-color: var(--primary-color);
  color: var(--primary-color);
  background: var(--surface-hover);
}

.pagination-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.page-numbers {
  gap: 8px;
}

.page-number {
  width: 40px;
  height: 40px;
  border-radius: var(--radius-md);
}

.page-number.active {
  background: var(--primary-color, #2563eb);
  color: white;
  border-color: transparent;
  box-shadow: var(--primary-shadow-sm);
}

.page-ellipsis {
  color: var(--text-tertiary);
}

.rotating {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }

  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 1200px) {
  .questions-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 768px) {
  .page-title {
    font-size: 28px;
  }

  .questions-grid {
    grid-template-columns: 1fr;
  }

  /* 筛选条件移动端对齐 - 标签在上方，选择器在下方 */
  .filter-group {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .filter-item {
    flex-direction: column;
    align-items: stretch;
    gap: 8px;
    width: 100%;
  }

  /* 列布局下勿沿用 PC 的 flex:1 1 160px，否则 160px 作用在「高度」上会撑出大块空白 */
  .filter-item.filter-input-wrapper {
    flex: 0 1 auto;
    min-width: auto;
  }

  .filter-group .filter-select,
  .filter-group .filter-search-field {
    width: 100%;
    max-width: 100%;
    min-width: 0;
  }

  .filter-group .filter-search-wrap {
    width: 100%;
    max-width: 100%;
    flex: none;
  }

  .filter-label {
    font-size: 14px;
    font-weight: 600;
  }

  .filter-footer,
  .question-footer {
    flex-direction: column;
    align-items: stretch;
  }

  /* 图 1: PDF 图标按钮和开始练习按钮同一行 */
  .question-card .question-footer {
    flex-direction: row;
    align-items: center;
  }

  .question-card .view-pdf-btn {
    width: auto;
    flex: 1;
    max-width: 80px;
  }

  .question-card .start-button {
    flex: 2;
  }

  .pagination-section {
    align-items: stretch;
  }
}
</style>
