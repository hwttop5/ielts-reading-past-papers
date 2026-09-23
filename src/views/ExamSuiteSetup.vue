<template>
  <main class="suite-setup-page">
    <header class="setup-header">
      <RouterLink to="/browse" class="back-link">← 返回题库</RouterLink>
      <h1>完整阅读模考</h1>
      <p>3 篇文章 · 40 道题 · 60 分钟</p>
    </header>

    <section class="setup-card" aria-labelledby="choose-heading">
      <h2 id="choose-heading">选择本次考试文章</h2>
      <p class="setup-description">从民间题库中各选一篇文章，自行组成完整模考。这是练习组卷，不代表原始考试中的三篇组合。</p>
      <form @submit.prevent="startSuite">
        <div v-for="(part, index) in parts" :key="part.category" class="passage-choice">
          <label :for="`suite-${part.category}`"><strong>Part {{ index + 1 }}</strong><span>第 {{ part.range }} 题 · {{ part.count }} 道题</span></label>
          <select :id="`suite-${part.category}`" v-model="selected[index]" :disabled="starting" required>
            <option value="" disabled>请选择文章</option>
            <option v-for="entry in candidates[part.category]" :key="entry.examId" :value="entry.examId">{{ entry.title }}</option>
          </select>
        </div>
        <p class="timing-note">三篇共用 60 分钟倒计时，可随时切换文章。交卷后统一查看总分和分篇解析。</p>
        <p v-if="error" class="setup-error" role="alert">{{ error }}</p>
        <div class="setup-actions">
          <button type="button" class="secondary-button" :disabled="starting" @click="randomize">随机组一套</button>
          <button type="submit" class="primary-button" :disabled="starting || selected.some(id => !id)">{{ starting ? '正在准备试卷…' : '进入完整模考' }}</button>
        </div>
      </form>
    </section>

    <section class="setup-card history-card" aria-labelledby="history-heading">
      <h2 id="history-heading">完整模考记录</h2>
      <p class="setup-description">记录保存在当前浏览器，交卷后可在这里重新查看。</p>
      <p v-if="storageError" class="setup-error" role="alert">{{ storageError }}</p>
      <p v-if="!history.length" class="empty-history">还没有完成的完整模考。</p>
      <ol v-else class="suite-history">
        <li v-for="attempt in history" :key="attempt.attemptId">
          <div class="history-copy">
            <time :datetime="attempt.completedAt">{{ formatDate(attempt.completedAt) }}</time>
            <p>{{ attempt.passages.map(passage => passage.title).join(' / ') }}</p>
          </div>
          <strong class="history-score">{{ attempt.correct }} / {{ attempt.totalQuestions }}</strong>
          <button type="button" class="secondary-button" @click="reviewAttempt(attempt)">查看复盘</button>
        </li>
      </ol>
    </section>
  </main>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { getSuiteCandidates, prepareSuite } from '@/utils/examSuite'
import { useExamSuiteAttempt } from '@/composables/useExamSuiteAttempt'
import type { ExamSuiteAttempt, SuitePassages } from '@/types/examSuite'

const router = useRouter()
const candidates = getSuiteCandidates()
const parts = [
  { category: 'P1', range: '1–13', count: 13 },
  { category: 'P2', range: '14–26', count: 13 },
  { category: 'P3', range: '27–40', count: 14 }
] as const
const selected = ref<SuitePassages<string>>(['', '', ''])
const starting = ref(false)
const error = ref('')
const { history, storageError } = useExamSuiteAttempt()

function randomize() {
  error.value = ''
  selected.value = parts.map(part => {
    const choices = candidates[part.category]
    return choices[Math.floor(Math.random() * choices.length)]?.examId || ''
  }) as SuitePassages<string>
}

async function startSuite() {
  if (starting.value) return
  starting.value = true
  error.value = ''
  try {
    const suite = await prepareSuite(selected.value)
    await router.push({ path: '/exam-suite', query: { passages: suite.ids.join(','), attemptId: crypto.randomUUID() } })
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '试卷暂时无法加载，请稍后重试。'
  } finally {
    starting.value = false
  }
}

function reviewAttempt(attempt: ExamSuiteAttempt) {
  router.push({ path: '/exam-suite', query: { passages: attempt.passages.map(p => p.id).join(','), attemptId: attempt.attemptId } })
}

function formatDate(value: string) {
  return new Date(value).toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}
</script>

<style scoped>
.suite-setup-page { max-width: 980px; margin: 0 auto; padding: 28px 24px 56px; color: #253448; }
.back-link { color: #52657b; font-size: 14px; text-decoration: none; }
.back-link:hover { text-decoration: underline; }
.setup-header h1 { margin: 22px 0 8px; font-size: 28px; font-weight: 700; }
.setup-header > p { margin: 0 0 28px; color: #607086; }
.setup-card { padding: 28px; margin-top: 20px; border: 1px solid #dce3eb; border-radius: 8px; background: #fff; }
.setup-card h2 { margin: 0 0 10px; font-size: 19px; }
.setup-description, .timing-note { color: #617084; font-size: 14px; line-height: 1.7; }
.setup-description { margin: 0 0 24px; }
.passage-choice { display: grid; grid-template-columns: 180px minmax(0, 1fr); gap: 18px; align-items: center; margin: 20px 0; }
.passage-choice label { display: flex; flex-direction: column; gap: 5px; }
.passage-choice label span { color: #66758a; font-size: 13px; }
.passage-choice select { width: 100%; padding: 11px 12px; border: 1px solid #b8c5d3; border-radius: 4px; background: #fff; color: #253448; font: inherit; }
.passage-choice select:focus-visible, button:focus-visible, a:focus-visible { outline: 2px solid #2874b8; outline-offset: 3px; }
.timing-note { margin: 28px 0 0; }
.setup-actions { display: flex; justify-content: flex-end; gap: 12px; margin-top: 24px; }
.primary-button, .secondary-button { padding: 10px 17px; border: 1px solid #b8c5d3; border-radius: 4px; font: inherit; font-size: 14px; cursor: pointer; white-space: nowrap; }
.primary-button { background: #265f94; border-color: #265f94; color: #fff; }
.primary-button:hover { background: #1d4b77; }
.secondary-button { background: #f6f8fa; color: #344960; }
.secondary-button:hover { background: #eaf0f6; }
button:disabled, select:disabled { cursor: wait; opacity: .55; }
.setup-error { color: #a82c30; line-height: 1.6; }
.empty-history { margin: 0; color: #66758a; font-size: 14px; }
.suite-history { list-style: none; padding: 0; margin: 0; }
.suite-history li { display: flex; align-items: center; gap: 20px; padding: 18px 0; border-top: 1px solid #e3e8ef; }
.history-copy { flex: 1; min-width: 0; }
.history-copy time { color: #617084; font-size: 13px; }
.history-copy p { margin: 7px 0 0; font-size: 14px; line-height: 1.6; }
.history-score { white-space: nowrap; font-variant-numeric: tabular-nums; }
@media (max-width: 640px) {
  .suite-setup-page { padding: 20px 14px 36px; }
  .setup-card { padding: 20px; }
  .passage-choice { grid-template-columns: 1fr; gap: 8px; }
  .suite-history li { flex-wrap: wrap; gap: 12px; }
  .history-copy { flex-basis: 100%; }
  .setup-actions { flex-wrap: wrap; }
}
</style>
