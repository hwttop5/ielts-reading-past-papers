import { ref } from 'vue'
import { registerSW } from 'virtual:pwa-register'

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[]
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
  prompt: () => Promise<void>
}

const isBrowser = typeof window !== 'undefined'
const isPwaSupported = isBrowser && 'serviceWorker' in navigator

const iosMobilePattern = /iphone|ipad|ipod/i
const androidMobilePattern = /android/i
const HOME_INSTALL_CARD_SNOOZE_KEY = 'ielts-reading-past-papers:pwa:home-install-card-snoozed-at'
const HOME_INSTALL_CARD_SNOOZE_MS = 7 * 24 * 60 * 60 * 1000

function getUserAgent(): string {
  return isBrowser ? window.navigator.userAgent : ''
}

function detectIosDevice(): boolean {
  return iosMobilePattern.test(getUserAgent())
}

function detectAndroidDevice(): boolean {
  return androidMobilePattern.test(getUserAgent())
}

function detectInstalledState(): boolean {
  if (!isBrowser) {
    return false
  }

  const standaloneDisplayMode = window.matchMedia('(display-mode: standalone)').matches
  const iosStandalone = (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  return standaloneDisplayMode || iosStandalone
}

const needRefresh = ref(false)
const offlineReady = ref(false)
const canInstall = ref(false)
const showHomeInstallCard = ref(false)
const installPending = ref(false)
const isInstalled = ref(detectInstalledState())
const showIosInstallHint = ref(false)
const installPromptEvent = ref<BeforeInstallPromptEvent | null>(null)
const iosInstallHintDismissed = ref(false)

let isInitialized = false
let updateServiceWorker: ((reloadPage?: boolean) => Promise<void>) | null = null
let homeInstallCardTimer: number | null = null

function clearHomeInstallCardTimer(): void {
  if (!isBrowser || homeInstallCardTimer === null) {
    return
  }

  window.clearTimeout(homeInstallCardTimer)
  homeInstallCardTimer = null
}

function readHomeInstallCardSnoozedAt(): number | null {
  if (!isBrowser) {
    return null
  }

  try {
    const raw = window.localStorage.getItem(HOME_INSTALL_CARD_SNOOZE_KEY)
    if (!raw) {
      return null
    }

    const value = Number(raw)
    return Number.isFinite(value) && value > 0 ? value : null
  } catch {
    return null
  }
}

function writeHomeInstallCardSnoozedAt(timestamp: number): void {
  if (!isBrowser) {
    return
  }

  try {
    window.localStorage.setItem(HOME_INSTALL_CARD_SNOOZE_KEY, String(timestamp))
  } catch {
    // Ignore storage failures and fall back to the in-session state update.
  }
}

function clearHomeInstallCardSnoozedAt(): void {
  if (!isBrowser) {
    return
  }

  try {
    window.localStorage.removeItem(HOME_INSTALL_CARD_SNOOZE_KEY)
  } catch {
    // Ignore storage failures.
  }
}

function syncHomeInstallCardSnooze(now = Date.now()): boolean {
  const snoozedAt = readHomeInstallCardSnoozedAt()

  if (!snoozedAt) {
    clearHomeInstallCardTimer()
    return false
  }

  const remaining = snoozedAt + HOME_INSTALL_CARD_SNOOZE_MS - now

  if (remaining <= 0) {
    clearHomeInstallCardSnoozedAt()
    clearHomeInstallCardTimer()
    return false
  }

  clearHomeInstallCardTimer()
  homeInstallCardTimer = window.setTimeout(() => {
    homeInstallCardTimer = null
    syncInstallAvailability()
  }, remaining + 1000)

  return true
}

function syncInstallAvailability() {
  if (!isBrowser) {
    return
  }

  const installed = isInstalled.value
  const hasNativePrompt = Boolean(installPromptEvent.value)
  const isIosManualInstall = detectIosDevice() && !installed && !iosInstallHintDismissed.value
  const canInstallNow = !installed && (hasNativePrompt || isIosManualInstall)
  const homeCardSnoozed = canInstallNow ? syncHomeInstallCardSnooze() : false

  canInstall.value = canInstallNow
  if (!canInstallNow) {
    clearHomeInstallCardTimer()
  }
  showHomeInstallCard.value = canInstallNow && !homeCardSnoozed
  showIosInstallHint.value = !installed && isIosManualInstall && !hasNativePrompt
}

export function setupPwa(): void {
  if (!isPwaSupported || isInitialized) {
    return
  }

  isInitialized = true
  syncInstallAvailability()

  window.matchMedia('(display-mode: standalone)').addEventListener('change', () => {
    isInstalled.value = detectInstalledState()
    syncInstallAvailability()
  })

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault()
    installPromptEvent.value = event as BeforeInstallPromptEvent
    syncInstallAvailability()
  })

  window.addEventListener('storage', (event) => {
    if (event.key === HOME_INSTALL_CARD_SNOOZE_KEY) {
      syncInstallAvailability()
    }
  })

  window.addEventListener('appinstalled', () => {
    isInstalled.value = true
    installPromptEvent.value = null
    canInstall.value = false
    showHomeInstallCard.value = false
    installPending.value = false
    showIosInstallHint.value = false
    iosInstallHintDismissed.value = false
    clearHomeInstallCardSnoozedAt()
    clearHomeInstallCardTimer()
  })

  updateServiceWorker = registerSW({
    immediate: true,
    onNeedRefresh() {
      needRefresh.value = true
    },
    onOfflineReady() {
      offlineReady.value = true
    },
    onRegisterError(error) {
      console.error('[PWA] register error', error)
    }
  })
}

export async function promptPwaInstall(): Promise<'accepted' | 'dismissed' | 'ios-manual' | 'unavailable'> {
  if (!isBrowser || isInstalled.value) {
    return 'unavailable'
  }

  if (showIosInstallHint.value) {
    return 'ios-manual'
  }

  if (!installPromptEvent.value) {
    return 'unavailable'
  }

  installPending.value = true
  const promptEvent = installPromptEvent.value

  try {
    await promptEvent.prompt()
    const choice = await promptEvent.userChoice
    installPromptEvent.value = null
    syncInstallAvailability()
    return choice.outcome
  } finally {
    installPending.value = false
  }
}

export function dismissHomeInstallCard(): void {
  if (!isBrowser) {
    return
  }

  writeHomeInstallCardSnoozedAt(Date.now())
  syncInstallAvailability()
}

export async function applyPwaUpdate(): Promise<void> {
  if (!updateServiceWorker) {
    return
  }

  await updateServiceWorker(true)
  needRefresh.value = false
}

export function dismissOfflineReady(): void {
  offlineReady.value = false
}

export function dismissNeedRefresh(): void {
  needRefresh.value = false
}

export function dismissIosInstallHint(): void {
  iosInstallHintDismissed.value = true
  showIosInstallHint.value = false
  syncInstallAvailability()
}

export function usePwaState() {
  return {
    isSupported: isPwaSupported,
    isInstalled,
    isIos: detectIosDevice(),
    isAndroid: detectAndroidDevice(),
    needRefresh,
    offlineReady,
    canInstall,
    showHomeInstallCard,
    installPending,
    showIosInstallHint
  }
}
