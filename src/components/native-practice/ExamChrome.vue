<template>
  <div class="exam-chrome">
    <header class="exam-topbar">
      <div class="exam-brand">IELTS Reading</div>
      <div class="exam-title" :title="title">{{ title }}</div>
      <div v-if="phase === 'details' || phase === 'instructions'" class="exam-timer prep-timer" aria-live="polite">{{ durationMinutes }} minutes left</div>
      <div v-else-if="phase === 'running' || phase === 'paused'" class="exam-timer" :class="{ 'time-warning': remainingSeconds <= 600, 'time-critical': remainingSeconds <= 300 }" role="timer" aria-label="Time remaining">
        {{ formattedTime }}
      </div>
      <div v-else class="exam-phase-label">
        {{ phase === 'submitted' ? 'Review' : phase === 'details' ? 'Candidate details' : 'Instructions' }}
      </div>

      <div v-if="phase === 'running' || phase === 'paused'" class="exam-actions">
        <button v-if="phase === 'running'" type="button" class="topbar-button" @click="emit('pause')">Pause</button>
        <button v-else type="button" class="topbar-button" @click="emit('resume')">Resume</button>
        <button type="button" class="topbar-button" @click="helpOpen = true">Help</button>
        <button type="button" class="topbar-button" @click="hidden = !hidden">{{ hidden ? 'Show' : 'Hide' }}</button>
        <button type="button" class="topbar-button topbar-submit" @click="submitOpen = true">Submit</button>
      </div>
      <button v-else-if="phase === 'submitted'" type="button" class="topbar-button" @click="emit('back')">Back</button>
    </header>

    <main class="exam-content" :class="{ 'content-hidden': hidden && (phase === 'running' || phase === 'paused') }">
      <section v-if="phase === 'details'" class="entry-panel" aria-labelledby="details-heading">
        <h1 id="details-heading" class="details-heading">Confirm your details</h1>
        <div class="entry-card">
          <p class="example-label">EXAMPLE</p>
          <dl class="candidate-details">
            <div><dt>Name</dt><dd>Practice Candidate</dd></div>
            <div><dt>Date of birth</dt><dd>XX-XX-XXXX</dd></div>
            <div><dt>Candidate number</dt><dd><input class="candidate-input" value="000000" aria-label="Candidate number" /></dd></div>
          </dl>
          <button type="button" class="primary-button centered-button" @click="emit('confirm-details')">My details are correct</button>
        </div>
      </section>

      <section v-else-if="phase === 'instructions'" class="entry-panel" aria-labelledby="instructions-heading">
        <div class="instructions-content">
          <h1 id="instructions-heading">IELTS Academic Reading</h1>
          <p class="instruction-time"><strong>Time: {{ durationMinutes }} minutes</strong></p>
          <h2>INSTRUCTIONS TO CANDIDATES</h2>
          <ul class="instruction-list">
            <li>This {{ examVariant === 'suite' ? 'reading test contains 3 passages and' : 'reading practice contains' }} {{ questionCount }} questions.</li>
            <li>You have {{ durationMinutes }} minutes to complete {{ examVariant === 'suite' ? 'all three passages' : 'this single passage' }}.</li>
            <li>You can change your answers at any time before submitting.</li>
          </ul>
          <h2>INFORMATION FOR CANDIDATES</h2>
          <ul class="instruction-list">
            <li>Each question carries one mark.</li>
            <li>Your answers will be submitted automatically when the time is up.</li>
            <li>The timer changes colour with 10 minutes and 5 minutes remaining.</li>
          </ul>
          <p v-if="!ready" class="load-error" role="alert">{{ examVariant === 'suite' ? 'The test is not ready. Please return and try again.' : 'This practice could not be loaded.' }}</p>
          <div class="instruction-actions">
            <button type="button" class="secondary-button" @click="emit('back')">Back</button>
            <button type="button" class="primary-button" :disabled="!ready" @click="emit('start')">Start test</button>
          </div>
        </div>
      </section>

      <template v-else>
        <div class="slot-content" :aria-hidden="contentBlocked || undefined" :inert="contentBlocked">
          <slot />
        </div>
        <div v-if="phase === 'paused'" class="pause-overlay" role="dialog" aria-modal="true" aria-labelledby="paused-heading">
          <div class="pause-card">
            <p class="eyebrow">Test paused</p>
            <h1 id="paused-heading">Test paused</h1>
            <p>Resume when you are ready.</p>
            <button type="button" class="primary-button" @click="emit('resume')">Resume practice</button>
          </div>
        </div>
      </template>
    </main>

    <div v-if="helpOpen" class="modal-backdrop" role="presentation" @click.self="closeHelp">
      <section ref="helpDialog" class="dialog" role="dialog" aria-modal="true" aria-labelledby="help-heading" @keydown.esc="closeHelp">
        <h2 id="help-heading">Help</h2>
        <ul>
          <li>Select text and use the right-click menu to highlight it.</li>
          <li>Drag an option to an answer space, or click an option and then click the space.</li>
          <li>Use the question navigation supplied below the exam content to move between questions.</li>
          <li>This {{ examVariant === 'suite' ? 'three-passage test' : 'single passage practice' }} has a {{ durationMinutes }}-minute time limit.</li>
        </ul>
        <button ref="helpCloseButton" type="button" class="secondary-button" @click="closeHelp">Close</button>
      </section>
    </div>

    <div v-if="submitOpen" class="modal-backdrop" role="presentation" @click.self="closeSubmit">
      <section ref="submitDialog" class="dialog" role="dialog" aria-modal="true" aria-labelledby="submit-heading" @keydown.esc="closeSubmit">
        <h2 id="submit-heading">Submit practice?</h2>
        <p v-if="unansweredCount > 0">You have {{ unansweredCount }} unanswered {{ unansweredCount === 1 ? 'question' : 'questions' }}.</p>
        <p v-else>All {{ questionCount }} questions have an answer.</p>
        <p>Are you sure you want to submit and view your review?</p>
        <div class="dialog-actions">
          <button ref="submitCancelButton" type="button" class="secondary-button" @click="closeSubmit">Continue practice</button>
          <button type="button" class="primary-button" @click="confirmSubmit">Submit</button>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

type ExamPhase = 'details' | 'instructions' | 'running' | 'paused' | 'submitted'

const props = withDefaults(defineProps<{
  phase: ExamPhase
  durationSeconds?: number
  examVariant?: 'single' | 'suite'
  remainingSeconds?: number
  questionCount?: number
  title?: string
  answeredCount?: number
  ready?: boolean
}>(), {
  durationSeconds: 1200,
  examVariant: 'single',
  remainingSeconds: 1200,
  questionCount: 0,
  title: 'Reading practice',
  answeredCount: 0,
  ready: true
})

const emit = defineEmits<{
  'confirm-details': []
  start: []
  pause: []
  resume: []
  submit: []
  back: []
}>()

const helpOpen = ref(false)
const submitOpen = ref(false)
const hidden = ref(false)
const helpCloseButton = ref<HTMLButtonElement | null>(null)
const submitCancelButton = ref<HTMLButtonElement | null>(null)

const contentBlocked = computed(() => props.phase === 'paused' || (props.phase === 'running' && hidden.value))
const formattedTime = computed(() => {
  const seconds = Math.max(0, Math.floor(props.remainingSeconds))
  const minutes = Math.floor(seconds / 60)
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`
})

const durationMinutes = computed(() => Math.ceil(props.durationSeconds / 60))

const unansweredCount = computed(() => Math.max(0, props.questionCount - props.answeredCount))

function confirmSubmit() {
  submitOpen.value = false
  emit('submit')
}

function closeHelp() {
  helpOpen.value = false
}

function closeSubmit() {
  submitOpen.value = false
}

function handleDocumentKeydown(event: KeyboardEvent) {
  if (event.key !== 'Escape') return
  if (helpOpen.value) closeHelp()
  else if (submitOpen.value) closeSubmit()
}

watch(helpOpen, async (open) => {
  if (open) {
    await nextTick()
    helpCloseButton.value?.focus()
  }
})

watch(submitOpen, async (open) => {
  if (open) {
    await nextTick()
    submitCancelButton.value?.focus()
  }
})

onMounted(() => document.addEventListener('keydown', handleDocumentKeydown))
onBeforeUnmount(() => document.removeEventListener('keydown', handleDocumentKeydown))
</script>

<style scoped>
:host {
  display: block;
}

.exam-chrome {
  --ink: #202b38;
  --muted: #667384;
  --line: #c7d0da;
  --blue: #1e5fa8;
  --blue-dark: #164b85;
  position: relative;
  display: flex;
  flex-direction: column;
  min-height: 100dvh;
  height: 100dvh;
  overflow: hidden;
  color: var(--ink);
  background: #dfe6f5;
  font-family: Arial, Helvetica, sans-serif;
}

.exam-topbar {
  z-index: 5;
  display: flex;
  align-items: center;
  gap: 18px;
  flex: 0 0 48px;
  min-height: 48px;
  padding: 0 18px;
  color: #fff;
  background: linear-gradient(180deg, #263b57 0%, #1d2e45 100%);
  box-sizing: border-box;
}

.exam-brand { font-size: 14px; font-weight: 700; white-space: nowrap; }
.exam-title { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #dce6ef; font-size: 13px; }
.exam-timer { position: absolute; left: 50%; transform: translateX(-50%); min-width: 66px; color: #fff2b8; font-variant-numeric: tabular-nums; font-size: 17px; font-weight: 700; text-align: center; white-space: nowrap; }
.prep-timer { font-size: 13px; }
.exam-phase-label { margin-left: auto; color: #dce6ef; font-size: 13px; }
.exam-actions { display: flex; align-items: center; gap: 5px; }
.topbar-button, .secondary-button, .primary-button { font: inherit; cursor: pointer; }
.topbar-button { padding: 5px 9px; border: 1px solid #aeb9c5; border-radius: 3px; color: #263342; background: linear-gradient(#f3f5f7, #cbd2da); font-size: 12px; }
.topbar-button:hover, .topbar-button:focus-visible { border-color: #fff; background: #fff; outline: none; }
.topbar-submit { border-color: #9fc8ec; color: #183a60; background: linear-gradient(#dff0ff, #9ec7ea); }

.exam-content { position: relative; flex: 1 1 auto; min-height: 0; overflow: hidden; }
.content-hidden > .slot-content { visibility: hidden; }
.slot-content { height: 100%; min-height: 0; }

.entry-panel { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; overflow: auto; padding: 38px 20px; box-sizing: border-box; }
.details-heading { margin-bottom: 12px; color: #26384f; font-size: 25px; text-align: center; }
.entry-card { width: 72%; max-width: 720px; padding: 25px 45px 29px; border: 1px solid #fff; background: rgb(255 255 255 / 8%); box-sizing: border-box; }
.example-label { margin: 0 0 18px; color: #b33636; font-size: 15px; font-weight: 700; text-align: center; }
.eyebrow { margin: 0 0 10px; color: var(--blue); font-size: 12px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
h1, h2 { margin: 0 0 15px; font-weight: 700; }
h1 { font-size: 26px; }
h2 { font-size: 21px; }
.entry-copy, .instruction-lede, .pause-card p, .dialog p { color: var(--muted); line-height: 1.55; }
.candidate-details { margin: 0 auto 24px; max-width: 520px; }
.candidate-details div { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; padding: 9px 0; }
.candidate-details dt { color: #26384f; font-weight: 700; }
.candidate-details dd { margin: 0; color: #26384f; font-weight: 400; }
.candidate-input { width: 100%; max-width: 180px; padding: 4px 6px; border: 1px solid #8797aa; border-radius: 2px; box-sizing: border-box; color: #26384f; background: #fff; }
.centered-button { display: block; margin: 0 auto; }
.instructions-content { width: 100%; height: 100%; padding: 50px 50px 40px; overflow: auto; box-sizing: border-box; }
.instructions-content h1 { margin-bottom: 28px; color: #26384f; font-size: 27px; }
.instructions-content h2 { margin: 29px 0 18px; color: #26384f; font-size: 16px; }
.instruction-time { margin: 0; color: #26384f; }
.instruction-list { margin: 0 0 28px; padding-left: 21px; color: #26384f; line-height: 1.7; }
.load-error { color: #9e2b2b; font-weight: 700; }
.instruction-actions { display: flex; justify-content: center; gap: 10px; margin-top: 35px; }
.primary-button, .secondary-button { padding: 9px 16px; border-radius: 2px; font-size: 13px; font-weight: 700; }
.primary-button { border: 1px solid var(--blue-dark); color: #fff; background: var(--blue); }
.primary-button:hover, .primary-button:focus-visible { background: var(--blue-dark); outline: 2px solid #9cc4e8; outline-offset: 1px; }
.primary-button:disabled { cursor: not-allowed; opacity: .55; }
.secondary-button { border: 1px solid #9aa8b6; color: var(--ink); background: #f5f7f9; }
.secondary-button:hover, .secondary-button:focus-visible { background: #e8edf2; outline: 2px solid #9cc4e8; outline-offset: 1px; }

.pause-overlay { position: absolute; inset: 0; z-index: 4; display: flex; align-items: center; justify-content: center; padding: 20px; background: #dfe6f5; box-sizing: border-box; }
.pause-card { width: min(100%, 420px); padding: 32px; background: #fff; box-shadow: 0 4px 14px rgb(0 0 0 / 24%); text-align: center; }
.pause-card .eyebrow { margin-bottom: 12px; }

.modal-backdrop { position: fixed; inset: 0; z-index: 20; display: flex; align-items: center; justify-content: center; padding: 20px; background: rgb(18 28 39 / 55%); box-sizing: border-box; }
.dialog { width: min(100%, 460px); padding: 26px 30px; border: 1px solid #b7c2cd; background: #fff; box-shadow: 0 5px 18px rgb(0 0 0 / 25%); box-sizing: border-box; }
.dialog ul { margin: 0 0 24px; padding-left: 20px; color: var(--muted); line-height: 1.65; }
.dialog-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 22px; }

@media (max-width: 720px) {
  .exam-topbar { gap: 8px; padding: 0 10px; }
  .exam-brand { display: none; }
  .exam-actions { gap: 1px; }
  .topbar-button { padding: 5px; }
  .entry-card { width: 92%; padding: 24px 20px; }
  .instructions-content { padding: 35px 22px 30px; }
}
.exam-timer.time-warning { color:#ffe09a; }
.exam-timer.time-critical { color:#ffacac; }
</style>
