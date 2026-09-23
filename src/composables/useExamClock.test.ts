import { effectScope, nextTick, ref, type EffectScope } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useExamClock, type UseExamClockOptions } from './useExamClock'

describe('useExamClock', () => {
  let scopes: EffectScope[]

  function createClock(options: UseExamClockOptions) {
    const scope = effectScope()
    scopes.push(scope)
    return scope.run(() => useExamClock(options))!
  }

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-21T00:00:00Z'))
    localStorage.clear()
    scopes = []
  })

  afterEach(() => {
    scopes.forEach((scope) => scope.stop())
    vi.restoreAllMocks()
    vi.useRealTimers()
    localStorage.clear()
  })

  it('waits for an explicit start and tracks elapsed time from an absolute deadline', () => {
    const onExpire = vi.fn()
    const clock = createClock({
      key: ref('exam-clock:explicit-start'),
      durationSeconds: 10,
      onExpire
    })

    vi.advanceTimersByTime(5_000)
    expect(clock.phase.value).toBe('details')
    expect(clock.remainingSeconds.value).toBe(10)

    clock.goToInstructions()
    expect(clock.phase.value).toBe('instructions')
    clock.start()
    vi.advanceTimersByTime(3_000)

    expect(clock.phase.value).toBe('running')
    expect(clock.remainingSeconds.value).toBe(7)
    expect(clock.elapsedSeconds.value).toBe(3)
    expect(onExpire).not.toHaveBeenCalled()
  })

  it('freezes while paused and continues from the saved remainder on resume', () => {
    const clock = createClock({
      key: ref('exam-clock:pause'),
      durationSeconds: 10,
      onExpire: vi.fn()
    })

    clock.start()
    vi.advanceTimersByTime(3_000)
    clock.pause()
    expect(clock.phase.value).toBe('paused')
    expect(clock.remainingSeconds.value).toBe(7)

    vi.advanceTimersByTime(20_000)
    expect(clock.remainingSeconds.value).toBe(7)

    clock.resume()
    vi.advanceTimersByTime(2_000)
    expect(clock.phase.value).toBe('running')
    expect(clock.remainingSeconds.value).toBe(5)
    expect(clock.elapsedSeconds.value).toBe(5)
  })

  it('restores a running clock after refresh using its original deadline', () => {
    const key = ref('exam-clock:refresh')
    const firstScope = effectScope()
    const firstClock = firstScope.run(() => useExamClock({
      key,
      durationSeconds: 10,
      onExpire: vi.fn()
    }))!

    firstClock.start()
    vi.advanceTimersByTime(4_000)
    expect(firstClock.remainingSeconds.value).toBe(6)
    firstScope.stop()

    const restoredClock = createClock({
      key,
      durationSeconds: 10,
      onExpire: vi.fn()
    })
    expect(restoredClock.phase.value).toBe('running')
    expect(restoredClock.remainingSeconds.value).toBe(6)

    vi.advanceTimersByTime(2_000)
    expect(restoredClock.remainingSeconds.value).toBe(4)
  })

  it('syncs immediately when the document becomes visible and removes the listener on dispose', () => {
    const scope = effectScope()
    const clock = scope.run(() => useExamClock({
      key: ref('exam-clock:visibility'),
      durationSeconds: 10,
      onExpire: vi.fn()
    }))!
    clock.start()

    vi.setSystemTime(new Date('2026-09-21T00:00:05Z'))
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
    document.dispatchEvent(new Event('visibilitychange'))
    expect(clock.remainingSeconds.value).toBe(5)

    scope.stop()
    vi.setSystemTime(new Date('2026-09-21T00:00:08Z'))
    document.dispatchEvent(new Event('visibilitychange'))
    expect(clock.remainingSeconds.value).toBe(5)
  })

  it('expires once and submits automatically', () => {
    const onExpire = vi.fn()
    const clock = createClock({
      key: ref('exam-clock:expires-once'),
      durationSeconds: 2,
      onExpire
    })

    clock.start()
    vi.advanceTimersByTime(2_000)

    expect(clock.remainingSeconds.value).toBe(0)
    expect(clock.elapsedSeconds.value).toBe(2)
    expect(clock.phase.value).toBe('submitted')
    expect(onExpire).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(10_000)
    expect(onExpire).toHaveBeenCalledTimes(1)
  })

  it('defers an expired restored clock until its caller is enabled', async () => {
    const key = ref('exam-clock:deferred-expiry')
    const originalScope = effectScope()
    const originalClock = originalScope.run(() => useExamClock({
      key,
      durationSeconds: 2,
      onExpire: vi.fn()
    }))!
    originalClock.start()
    originalScope.stop()

    vi.setSystemTime(new Date('2026-09-21T00:00:05Z'))
    const enabled = ref(false)
    const onExpire = vi.fn()
    const restoredClock = createClock({
      key: () => key.value,
      durationSeconds: 2,
      enabled,
      onExpire
    })

    expect(restoredClock.phase.value).toBe('running')
    expect(restoredClock.remainingSeconds.value).toBe(0)
    expect(onExpire).not.toHaveBeenCalled()

    enabled.value = true
    await nextTick()
    expect(restoredClock.phase.value).toBe('submitted')
    expect(onExpire).toHaveBeenCalledTimes(1)

    enabled.value = false
    enabled.value = true
    await nextTick()
    expect(onExpire).toHaveBeenCalledTimes(1)
  })

  it('resets to a fresh details screen and removes persisted state', () => {
    const key = ref('exam-clock:reset')
    const clock = createClock({ key, durationSeconds: 10, onExpire: vi.fn() })

    clock.start()
    vi.advanceTimersByTime(4_000)
    clock.reset()

    expect(clock.phase.value).toBe('details')
    expect(clock.remainingSeconds.value).toBe(10)
    expect(clock.elapsedSeconds.value).toBe(0)
    expect(localStorage.getItem(key.value)).toBeNull()
  })

  it('continues in memory when localStorage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('storage full')
    })
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('storage blocked')
    })

    const clock = createClock({
      key: ref('exam-clock:storage-errors'),
      durationSeconds: 3,
      onExpire: vi.fn()
    })
    expect(() => clock.start()).not.toThrow()
    vi.advanceTimersByTime(1_000)
    expect(clock.remainingSeconds.value).toBe(2)
    expect(() => clock.reset()).not.toThrow()
  })
})
