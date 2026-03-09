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
        <span class="filter-label">{{ t('browse.category') }}:</span>
        <select v-model="category" class="filter-select">
          <option value="all">{{ t('browse.allCategories') }}</option>
          <option value="P1">P1</option>
          <option value="P2">P2</option>
          <option value="P3">P3</option>
        </select>
        
        <span class="filter-label">{{ t('browse.frequency') }}:</span>
        <select v-model="difficulty" class="filter-select">
          <option value="all">{{ t('browse.allFrequency') }}</option>
          <option value="高频">{{ t('browse.difficulty.highFreq') }}</option>
          <option value="次频">{{ t('browse.difficulty.lowFreq') }}</option>
        </select>
        
        <input 
          type="text" 
          v-model="searchText" 
          class="filter-input" 
          :placeholder="t('browse.searchPlaceholder')"
        />
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
        <div v-for="q in paginatedQuestions" :key="q.id" class="question-card" @click="start(q)">
          <div class="question-header">
            <span class="question-title">{{ q.title }}</span>
            <span :class="['question-category', `category-${q.category.toLowerCase()}`]">
              {{ q.category }}
            </span>
          </div>
          
          <div class="question-subtitle" v-if="currentLang === 'zh'">{{ q.titleCN }}</div>
          
          <div class="question-tags">
            <span :class="['tag', q.difficulty === '高频' ? 'tag-high' : 'tag-normal']">
              {{ q.difficulty === '高频' ? t('browse.difficulty.highFreq') : t('browse.difficulty.lowFreq') }}
            </span>
            <span :class="['tag tag-count', isQuestionCompleted(q.id) ? 'tag-completed' : '']">
              <span class="material-icons" style="font-size: 14px; vertical-align: middle; margin-right: 4px;">
                {{ isQuestionCompleted(q.id) ? 'check_circle' : 'pending' }}
              </span>
              {{ isQuestionCompleted(q.id) ? getQuestionScore(q.id) : `${q.totalQuestions} ${t('overview.questions')}` }}
            </span>
          </div>

          <div class="question-footer">
            <button class="view-pdf-btn" @click.stop="viewPdf(q)" :title="t('browse.viewPdf')" :disabled="!q.pdfPath">
              <span class="material-icons" style="font-size: 18px;">picture_as_pdf</span>
            </button>
            <button class="start-button" @click.stop="start(q)" :disabled="isNavigating">
              {{ t('browse.startPractice') }} 
              <span v-if="!isNavigating" class="material-icons" style="font-size: 16px; vertical-align: middle;">arrow_forward</span>
              <span v-else class="material-icons rotating" style="font-size: 16px; vertical-align: middle;">autorenew</span>
            </button>
          </div>
        </div>
      </div>

      <div v-if="totalPages > 1" class="pagination-section">
        <button 
          class="pagination-button" 
          :disabled="currentPage === 1"
          @click="currentPage--"
        >
          <span class="material-icons" style="font-size: 18px; vertical-align: middle;">arrow_back</span> {{ t('browse.prev') }}
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
        
        <button 
          class="pagination-button" 
          :disabled="currentPage === totalPages"
          @click="currentPage++"
        >
          {{ t('browse.next') }} <span class="material-icons" style="font-size: 18px; vertical-align: middle;">arrow_forward</span>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch, inject, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useQuestionStore } from '@/store/questionStore'
import { usePracticeStore } from '@/store/practiceStore'
import { message } from 'ant-design-vue'

const store = useQuestionStore()
const practiceStore = usePracticeStore()
const route = useRoute()
const router = useRouter()
const t = inject('t', (key: string) => key)
const currentLang = inject('currentLang', { value: 'zh' })

const category = ref<string>('all')
const difficulty = ref<string>('all')
const searchText = ref<string>('')
const currentPage = ref<number>(1)
const pageSize = ref<number>(12)
const isRestoring = ref(false)
const isNavigating = ref(false)

onMounted(() => {
  store.loadQuestions()
  practiceStore.load()
  
  isRestoring.value = true
  if (route.query.category) {
    category.value = route.query.category as string
  }
  if (route.query.difficulty) {
    difficulty.value = route.query.difficulty as string
  }
  if (route.query.search) {
    searchText.value = route.query.search as string
  }
  if (route.query.pageSize) {
    const size = Number(route.query.pageSize)
    if (Number.isFinite(size) && [6, 12, 24, 48].includes(size)) {
      pageSize.value = size
    }
  }
  // 页码必须在其他筛选条件之后设置，且不受筛选重置影响
  if (route.query.page) {
    const page = Number(route.query.page)
    if (Number.isFinite(page) && page > 0) {
      currentPage.value = page
    }
  }
  
  nextTick(() => {
    isRestoring.value = false
  })
})

// 检查题目是否已完成
const isQuestionCompleted = (questionId: string) => {
  return practiceStore.records.some(r => r.questionId === questionId)
}

// 获取题目得分（正确题数/总题数）
const getQuestionScore = (questionId: string) => {
  const record = practiceStore.records.find(r => r.questionId === questionId)
  if (record) {
    return `${record.correctAnswers}/${record.totalQuestions}`
  }
  return ''
}

watch(() => route.query.category, (newCategory) => {
  if (newCategory) {
    category.value = newCategory as string
  }
})

watch(() => route.query.page, (newPage) => {
  if (!newPage) return
  const page = Number(newPage)
  if (Number.isFinite(page) && page > 0) {
    currentPage.value = page
  }
})

watch([category, difficulty, searchText, pageSize], () => {
  if (isRestoring.value) return
  currentPage.value = 1
})

const filtered = computed(() => {
  let result = store.questions

  if (category.value !== 'all') {
    result = result.filter(q => q.category === category.value)
  }

  if (difficulty.value !== 'all') {
    result = result.filter(q => q.difficulty === difficulty.value)
  }

  if (searchText.value) {
    const search = searchText.value.toLowerCase()
    result = result.filter(q => 
      q.title.toLowerCase().includes(search) || 
      q.titleCN.includes(search)
    )
  }

  return result
})

const totalPages = computed(() => {
  return Math.ceil(filtered.value.length / pageSize.value) || 1
})

const displayPages = computed(() => {
  const pages: number[] = []
  const total = totalPages.value
  const current = currentPage.value
  
  if (total <= 7) {
    for (let i = 1; i <= total; i++) pages.push(i)
  } else {
    if (current <= 4) {
      for (let i = 1; i <= 5; i++) pages.push(i)
      pages.push(-1)
      pages.push(total)
    } else if (current >= total - 3) {
      pages.push(1)
      pages.push(-1)
      for (let i = total - 4; i <= total; i++) pages.push(i)
    } else {
      pages.push(1)
      pages.push(-1)
      for (let i = current - 1; i <= current + 1; i++) pages.push(i)
      pages.push(-1)
      pages.push(total)
    }
  }
  
  return pages
})

const paginatedQuestions = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value
  const end = start + pageSize.value
  return filtered.value.slice(start, end)
})

const start = async (q: any) => {
  if (isNavigating.value) return
  isNavigating.value = true
  
  try {
    const query: Record<string, string> = {
      id: q.id,
      from: 'browse',
      page: String(currentPage.value),
      pageSize: String(pageSize.value)
    }
    if (category.value !== 'all') query.category = category.value
    if (difficulty.value !== 'all') query.difficulty = difficulty.value
    if (searchText.value.trim()) query.search = searchText.value
    await router.push({ path: '/practice-mode', query })
  } catch (e) {
    isNavigating.value = false
    console.error(e)
  }
}

const openPDFSafely = (pdfPath: string, examTitle: string) => {
  const winName = `pdf_${Date.now()}`
  const opts = 'width=1000,height=800,scrollbars=yes,resizable=yes,status=yes,toolbar=yes'
  let win: Window | null = null
  try {
    win = window.open(pdfPath, winName, opts)
  } catch (_) {}
  if (!win) {
    try {
      window.location.href = pdfPath
  } catch (e) {
    message.error(t('browse.pdfError'))
  }
  return
}
message.success(t('browse.pdfOpening'))
}

const viewPdf = (q: any) => {
if (q.pdfPath) {
  openPDFSafely(q.pdfPath, q.title || 'PDF')
  return
}
// PDF 与 HTML 在同一目录，如 public/questionBank/1.P1 高频/
const parts = q.htmlPath?.split('/').filter(Boolean)
if (!parts || parts.length < 2) {
  message.warning(t('browse.pdfNotFound'))
  return
}
const folder = parts[parts.length - 2]   // 如 1.P1 高频
const rawName = parts[parts.length - 1]?.replace(/\.html$/i, '')
if (!rawName) {
  message.warning(t('browse.pdfNotFound'))
  return
}
  // PDF 文件名不含【高】/【次】后缀
  const pdfFileName = rawName.replace(/【高】|【次】/g, '').trim() + '.pdf'
  const fullPath = `/questionBank/${encodeURIComponent(folder)}/${encodeURIComponent(pdfFileName)}`
  openPDFSafely(fullPath, q.title || 'PDF')
}
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

.page-disclaimer {
  font-size: 13px;
  color: var(--text-tertiary);
  margin: 8px 0 0 0;
  font-style: normal;
  display: flex;
  align-items: center;
  gap: 4px;
}

.disclaimer-icon {
  font-size: 14px;
  color: var(--warning-color, #eab308);
}

.filter-section {
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  padding: 20px;
  margin-bottom: 24px;
}

.filter-group {
  display: flex;
  gap: 12px;
  align-items: center;
  flex-wrap: wrap;
  margin-bottom: 16px;
}

.filter-label {
  font-size: 14px;
  color: var(--text-secondary);
  font-weight: 500;
}

.filter-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
  padding-top: 16px;
  border-top: 1px solid var(--border-color);
}

.result-info {
  display: flex;
  gap: 16px;
  align-items: center;
}

.result-count {
  font-size: 14px;
  color: var(--text-secondary);
  font-weight: 500;
}

.page-info {
  font-size: 14px;
  color: var(--text-tertiary);
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
  font-weight: 500;
  cursor: pointer;
  transition: var(--transition);
}

.filter-select.small {
  padding: 6px 12px;
  font-size: 14px;
}

.filter-select:hover {
  border-color: var(--primary-color);
}

.filter-input {
  flex: 1;
  min-width: 200px;
  padding: 8px 16px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  background: var(--bg-primary);
  color: var(--text-primary);
  font-size: 14px;
  transition: var(--transition);
}

.filter-input:focus {
  outline: none;
  border-color: var(--primary-color);
  box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.1);
}

.empty-state {
  text-align: center;
  padding: 64px 24px;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
}

.empty-icon {
  font-size: 48px;
  margin-bottom: 16px;
  color: var(--text-tertiary);
}

.empty-text {
  font-size: 14px;
  color: var(--text-secondary);
}

.questions-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
  gap: 20px;
  margin-bottom: 32px;
}

.question-card {
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  padding: 24px;
  cursor: pointer;
  transition: var(--transition);
  display: flex;
  flex-direction: column;
}

.question-card:hover {
  box-shadow: var(--shadow-md);
  border-color: var(--primary-color);
  transform: translateY(-2px);
}

.question-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 12px;
  gap: 12px;
}

.question-title {
  font-size: 16px;
  font-weight: 700;
  color: var(--text-primary);
  line-height: 1.5;
  flex: 1;
  white-space: normal;
  overflow: visible;
  text-overflow: clip;
}

.question-category {
  padding: 4px 10px;
  border-radius: var(--radius-sm);
  font-size: 13px;
  font-weight: 600;
  flex-shrink: 0;
}

.category-p1 {
  background: #f0fdf4;
  color: #16a34a;
}

.category-p2 {
  background: #eff6ff;
  color: #2563eb;
}

.category-p3 {
  background: #faf5ff;
  color: #9333ea;
}

.question-subtitle {
  font-size: 14px;
  color: var(--text-secondary);
  margin-bottom: 16px;
  line-height: 1.5;
}

.question-tags {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 20px;
}

.tag {
  padding: 4px 10px;
  border-radius: var(--radius-sm);
  font-size: 13px;
  font-weight: 500;
}

.tag-type {
  background: var(--bg-tertiary);
  color: var(--text-secondary);
}

.tag-high {
  background: #fef2f2;
  color: #dc2626;
}

.tag-normal {
  background: #fff7ed;
  color: #ea580c;
}

.tag-count {
  background: var(--bg-tertiary);
  color: var(--text-tertiary);
  display: flex;
  align-items: center;
  gap: 4px;
}

.tag-completed {
  background: #f0fdf4;
  color: #16a34a;
  display: flex;
  align-items: center;
  gap: 4px;
}

.question-footer {
  display: flex;
  gap: 12px;
  align-items: center;
  margin-top: auto;
  padding-top: 16px;
  border-top: 1px solid var(--border-color);
}

.view-pdf-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 40px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  background: var(--bg-primary);
  color: var(--text-primary);
  cursor: pointer;
  transition: var(--transition);
  flex-shrink: 0;
}

.view-pdf-btn:hover {
  background: #f0fdf4;
  border-color: #16a34a;
  color: #16a34a;
  transform: translateY(-2px);
}

.view-pdf-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
  transform: none;
}

.start-button {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 10px 20px;
  border: none;
  border-radius: var(--radius-sm);
  background: var(--primary-color);
  color: white;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: var(--transition);
}

.start-button:hover {
  background: var(--primary-hover);
  transform: translateX(2px);
}

.start-button:disabled {
  opacity: 0.7;
  cursor: not-allowed;
  transform: none;
}

.rotating {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.pagination-section {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 8px;
  padding: 24px 0;
}

.pagination-button {
  padding: 10px 16px;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  color: var(--text-primary);
  font-size: 14px;
  font-weight: 500;
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

.page-numbers {
  display: flex;
  gap: 4px;
  align-items: center;
}

.page-number {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  color: var(--text-primary);
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: var(--transition);
}

.page-number:hover {
  border-color: var(--primary-color);
  color: var(--primary-color);
}

.page-number.active {
  background: var(--primary-color);
  border-color: var(--primary-color);
  color: white;
}

.page-number:disabled {
  cursor: default;
  border: none;
  background: transparent;
  color: var(--text-tertiary);
}

.page-ellipsis {
  padding: 0 8px;
  color: var(--text-tertiary);
  font-size: 14px;
  display: flex;
  align-items: center;
}

@media (max-width: 768px) {
  .questions-grid {
    grid-template-columns: 1fr;
  }
  
  .pagination-section {
    flex-wrap: wrap;
    gap: 12px;
  }
  
  .pagination-button {
    padding: 8px 12px;
    font-size: 13px;
  }
  
  .page-number {
    width: 36px;
    height: 36px;
    font-size: 13px;
  }
  
  .page-numbers {
    order: -1;
    width: 100%;
    justify-content: center;
    margin-bottom: 8px;
  }
  
  .filter-group {
    flex-direction: column;
    align-items: stretch;
  }
  
  .filter-select,
  .filter-input {
    width: 100%;
  }
  
  .filter-footer {
    flex-direction: column;
    align-items: stretch;
    gap: 12px;
  }
  
  .result-info {
    justify-content: center;
  }
  
  .page-size-selector {
    justify-content: center;
  }
}
</style>
