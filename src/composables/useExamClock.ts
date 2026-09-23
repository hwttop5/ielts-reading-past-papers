import {
  computed,
  getCurrentScope,
  onScopeDispose,
  ref,
  watch,
  type Ref
} from 'vue'

export type ExamClockPhase =
  | 'details'
  | 'instructions'
  | 'running'
  | 'paused'
  | 'submitted'

type ExamClockKey = Ref<string> | (() => string)

export interface UseExamClockOptions {
  key: ExamClockKey
  durationSeconds?: number
  enabled?: Ref<boolean>
  onExpire: () => void
}

interface StoredExamClock {
  version: 1
  phase: ExamClockPhase
  remainingSeconds: number
  deadline: number | null
}

const DEFAULT_DURATION_SECONDS = 20 * 60
const TICK_INTERVAL_MS = 1000
const CLOCK_PHASES: ExamClockPhase[] = [
  'details',
  'instructions',
  'running',
  'paused',
  'submitted'
]

function normalizeDuration(value: number | undefined) {
  if (value === undefined || !Number.isFinite(value)) {
    return DEFAULT_DURATION_SECONDS
  }
  return Math.max(0, Math.floor(value))
}

function isStoredExamClock(value: unknown): value is StoredExamClock {
  if (!value || typeof value !== 'object') {
    return false
  }

  const record = value as Partial<StoredExamClock>
  return record.version === 1
    && CLOCK_PHASES.includes(record.phase as ExamClockPhase)
    && typeof record.remainingSeconds === 'number'
    && Number.isFinite(record.remainingSeconds)
    && (record.deadline === null
      || (typeof record.deadline === 'number' && Number.isFinite(record.deadline)))
}

export function useExamClock(options: UseExamClockOptions) {
  const durationSeconds = normalizeDuration(options.durationSeconds)
  const phase = ref<ExamClockPhase>('details')
  const remainingSeconds = ref(durationSeconds)
  const elapsedSeconds = computed(() => (
    Math.min(durationSeconds, Math.max(0, durationSeconds - remainingSeconds.value))
  ))

  let deadline: number | null = null
  let intervalHandle: ReturnType<typeof setInterval> | null = null
  let expireHandled = false

  const resolveKey = () => (
    typeof options.key === 'function' ? options.key() : options.key.value
  )
  const isEnabled = () => options.enabled?.value ?? true
  const currentPhase = (): ExamClockPhase => phase.value

  function withStorage(action: (storage: Storage) => void) {
    try {
      if (typeof localStorage !== 'undefined') {
        action(localStorage)
      }
    } catch {
      // Storage may be unavailable or full. The in-memory clock must keep working.
    }
  }

  function persist() {
    const key = resolveKey()
    if (!key) {
      return
    }

    const snapshot: StoredExamClock = {
      version: 1,
      phase: phase.value,
      remainingSeconds: remainingSeconds.value,
      deadline
    }
    withStorage((storage) => storage.setItem(key, JSON.stringify(snapshot)))
  }

  function stopTicker() {
    if (intervalHandle !== null) {
      clearInterval(intervalHandle)
      intervalHandle = null
    }
  }

  function completeExpiredClock() {
    if (expireHandled || phase.value !== 'running' || !isEnabled()) {
      return
    }

    expireHandled = true
    stopTicker()
    deadline = null
    remainingSeconds.value = 0
    phase.value = 'submitted'
    persist()
    options.onExpire()
  }

  function syncWithDeadline() {
    if (phase.value !== 'running' || deadline === null) {
      return
    }

    remainingSeconds.value = Math.max(0, Math.ceil((deadline - Date.now()) / 1000))
    if (remainingSeconds.value === 0) {
      stopTicker()
      persist()
      completeExpiredClock()
    }
  }

  function startTicker() {
    stopTicker()
    intervalHandle = setInterval(syncWithDeadline, TICK_INTERVAL_MS)
  }

  function handleVisibilityChange() {
    if (document.visibilityState === 'visible') {
      syncWithDeadline()
    }
  }

  function cleanup() {
    stopTicker()
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }

  function restore() {
    stopTicker()
    deadline = null
    expireHandled = false
    phase.value = 'details'
    remainingSeconds.value = durationSeconds

    const key = resolveKey()
    if (!key) {
      return
    }

    withStorage((storage) => {
      const raw = storage.getItem(key)
      if (!raw) {
        return
      }

      const stored = JSON.parse(raw) as unknown
      if (!isStoredExamClock(stored)) {
        return
      }

      phase.value = stored.phase
      remainingSeconds.value = Math.min(
        durationSeconds,
        Math.max(0, Math.ceil(stored.remainingSeconds))
      )
      deadline = stored.phase === 'running' ? stored.deadline : null
    })

    if (currentPhase() === 'running') {
      if (deadline === null) {
        phase.value = 'paused'
        persist()
        return
      }
      syncWithDeadline()
      if (currentPhase() === 'running' && remainingSeconds.value > 0) {
        startTicker()
      }
    }
  }

  function goToInstructions() {
    if (phase.value !== 'details') {
      return
    }
    phase.value = 'instructions'
    persist()
  }

  function start() {
    if (phase.value !== 'details' && phase.value !== 'instructions') {
      return
    }

    phase.value = 'running'
    deadline = Date.now() + remainingSeconds.value * 1000
    persist()
    syncWithDeadline()
    if (currentPhase() === 'running' && remainingSeconds.value > 0) {
      startTicker()
    }
  }

  function pause() {
    if (currentPhase() !== 'running') {
      return
    }

    syncWithDeadline()
    if (phase.value !== 'running') {
      return
    }
    stopTicker()
    deadline = null
    phase.value = 'paused'
    persist()
  }

  function resume() {
    if (phase.value !== 'paused') {
      return
    }

    phase.value = 'running'
    deadline = Date.now() + remainingSeconds.value * 1000
    persist()
    syncWithDeadline()
    if (currentPhase() === 'running' && remainingSeconds.value > 0) {
      startTicker()
    }
  }

  function finish() {
    if (phase.value === 'submitted') {
      return
    }

    if (phase.value === 'running') {
      syncWithDeadline()
      if (currentPhase() === 'submitted') {
        return
      }
    }
    stopTicker()
    deadline = null
    phase.value = 'submitted'
    persist()
  }

  function reset() {
    stopTicker()
    deadline = null
    expireHandled = false
    phase.value = 'details'
    remainingSeconds.value = durationSeconds

    const key = resolveKey()
    if (key) {
      withStorage((storage) => storage.removeItem(key))
    }
  }

  restore()

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', handleVisibilityChange)
  }

  watch(resolveKey, restore)
  if (options.enabled) {
    watch(options.enabled, syncWithDeadline)
  }
  if (getCurrentScope()) {
    onScopeDispose(cleanup)
  }

  return {
    phase,
    remainingSeconds,
    elapsedSeconds,
    goToInstructions,
    start,
    pause,
    resume,
    finish,
    reset
  }
}
