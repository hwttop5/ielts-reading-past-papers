<template>
  <div class="app-layout">
    <header :class="['fixed-header', { scrolled: isScrolled }]">
      <div class="header-container">
        <div class="header-left">
          <div class="logo-text" @click="goHome" :title="t('app.title')">
            <span class="logo-text-main">{{ t('app.name') }}</span>
            <span class="logo-text-sub">{{ t('app.subtitle') }}</span>
          </div>
          
          <nav class="main-nav">
            <div 
              v-for="item in mainMenuItems" 
              :key="item.key"
              :class="['nav-item', { active: isMenuActive(item.key) }]"
            >
              <div 
                class="nav-item-main" 
                @click="handleMenuClick(item)"
              >
                <span class="material-icons nav-icon">{{ item.icon }}</span>
                <span class="nav-text">{{ t(item.labelKey) }}</span>
              </div>
            </div>
          </nav>
        </div>

        <div class="header-right">
          <button
            v-if="pwa.canInstall.value"
            class="quick-action pwa-action"
            @click="handleInstallApp"
            :disabled="pwa.installPending.value"
            :title="t('pwa.installAction')"
          >
            <span class="material-icons action-icon">download</span>
          </button>
          <button class="quick-action" @click="toggleLang" :title="currentLang === 'zh' ? t('lang.en') : t('lang.zh')">
            <span class="material-icons action-icon">translate</span>
          </button>
          <button class="quick-action" @click="toggleTheme" :title="isDarkMode ? t('theme.lightMode') : t('theme.darkMode')">
            <span class="material-icons action-icon">{{ isDarkMode ? 'light_mode' : 'dark_mode' }}</span>
          </button>
          <div class="sync-indicator" :class="`sync-${sync.status.value}`" :title="syncTooltip">
            <span v-if="authStore.isAuthenticated" class="material-icons sync-icon">{{ syncIcon }}</span>
            <span class="sync-label">{{ syncLabel }}</span>
          </div>
          <button
            class="quick-action account-action"
            type="button"
            @click="openAuthPanel()"
            :title="accountTitle"
            data-testid="account-entry"
          >
            <span class="material-icons action-icon">{{ accountIcon }}</span>
          </button>
          <button
            v-if="showSponsorContactAction"
            class="quick-action contact-action"
            type="button"
            title="消息通知"
            aria-label="消息通知"
            data-testid="sponsor-contact-action"
            @click="openSponsorContactAd"
          >
            <span class="material-icons action-icon" data-testid="sponsor-contact-campaign-icon">campaign</span>
          </button>
          <a class="quick-action" href="https://github.com/hwttop5/ielts-reading-past-papers" target="_blank" rel="noopener noreferrer" :title="t('menu.github')">
            <svg class="github-icon" viewBox="0 0 24 24" aria-hidden="true">
              <path fill="currentColor" d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
            </svg>
          </a>
          <button class="quick-action mobile-menu-toggle" @click="toggleMobileMenu" :title="t('menu.menu')">
            <span class="material-icons action-icon">{{ showMobileMenu ? 'close' : 'menu' }}</span>
          </button>
        </div>
      </div>
    </header>

    <main class="layout-content">
      <div class="content-wrapper">
        <SponsorContactAd ref="sponsorContactAdRef" :content="contactAd" />

        <transition name="slide-down">
          <div v-if="showMigrationNotice" class="pwa-banner migration-banner" data-testid="migration-banner">
            <div class="migration-banner-icon" aria-hidden="true">
              <span class="material-icons">campaign</span>
            </div>
            <div class="pwa-banner-copy migration-banner-copy">
              <strong>{{ t('migration.title') }}</strong>
              <span>{{ t('migration.descriptionPrefix') }}<a :href="NEW_SITE_URL" class="migration-link">{{ NEW_SITE_URL }}</a>{{ t('migration.descriptionSuffix') }}</span>
            </div>
            <div class="pwa-banner-actions">
              <a class="pwa-banner-btn primary migration-banner-action" :href="NEW_SITE_URL">
                {{ t('migration.action') }}
              </a>
            </div>
          </div>
        </transition>
        <transition name="slide-down">
          <div v-if="pwa.needRefresh.value" class="pwa-banner update-banner">
            <div class="pwa-banner-copy">
              <strong>{{ t('pwa.updateTitle') }}</strong>
              <span>{{ t('pwa.updateDescription') }}</span>
            </div>
            <div class="pwa-banner-actions">
              <button class="pwa-banner-btn primary" type="button" @click="applyUpdate">{{ t('pwa.updateAction') }}</button>
              <button class="pwa-banner-btn" type="button" @click="dismissUpdate">{{ t('pwa.laterAction') }}</button>
            </div>
          </div>
        </transition>

        <transition name="slide-down">
          <div v-if="pwa.offlineReady.value" class="pwa-banner offline-banner">
            <div class="pwa-banner-copy">
              <strong>{{ t('pwa.offlineReadyTitle') }}</strong>
              <span>{{ t('pwa.offlineReadyDescription') }}</span>
            </div>
            <div class="pwa-banner-actions">
              <button class="pwa-banner-btn primary" type="button" @click="dismissOffline">{{ t('pwa.dismissAction') }}</button>
            </div>
          </div>
        </transition>

        <transition name="slide-down">
          <div v-if="pwa.showIosInstallHint.value" class="pwa-banner install-banner">
            <div class="pwa-banner-copy">
              <strong>{{ t('pwa.iosInstallTitle') }}</strong>
              <span>{{ t('pwa.iosInstallDescription') }}</span>
            </div>
            <div class="pwa-banner-actions">
              <button class="pwa-banner-btn primary" type="button" @click="dismissIosInstall">{{ t('pwa.dismissAction') }}</button>
            </div>
          </div>
        </transition>

        <transition name="page-fade" mode="out-in">
          <router-view :key="$route.path" />
        </transition>
      </div>
    </main>

    <a-modal
      v-model:open="authPanelOpen"
      :title="authModalTitle"
      :footer="null"
      :width="430"
      destroy-on-close
    >
      <div class="auth-panel">
        <template v-if="authStore.isAuthenticated && authStore.user">
          <div class="auth-user-summary">
            <span class="material-icons auth-user-icon">account_circle</span>
            <div class="auth-user-copy">
              <div class="auth-user-email" data-testid="account-email">{{ authStore.user.email }}</div>
              <div class="auth-user-status">
                <span class="material-icons auth-sync-icon">{{ syncIcon }}</span>
                <span>{{ syncLabel }}</span>
              </div>
            </div>
          </div>

          <div v-if="sync.lastError.value" class="auth-error">{{ sync.lastError.value }}</div>

          <div class="auth-actions">
            <button class="auth-button primary" type="button" @click="handleSyncNow" :class="{ loading: isSyncBusy }" :disabled="isSyncBusy" :aria-busy="isSyncBusy">
              <span :class="['material-icons', { 'auth-loading-icon': isSyncBusy }]">sync</span>
              <span>{{ t('auth.syncNow') }}</span>
            </button>
            <button class="auth-button primary" type="button" @click="handleLogout">
              <span class="material-icons">logout</span>
              <span>{{ t('auth.logout') }}</span>
            </button>
          </div>
        </template>

        <template v-else>
          <div class="guest-line">
            <span>{{ t('auth.guestMode') }}</span>
          </div>

          <div class="auth-segment">
            <button type="button" :class="{ active: authMode === 'login' }" @click="authMode = 'login'">{{ t('auth.login') }}</button>
            <button type="button" :class="{ active: authMode === 'register' }" @click="authMode = 'register'">{{ t('auth.register') }}</button>
          </div>

          <form class="auth-form" @submit.prevent="submitAuthForm">
            <label class="auth-field">
              <span>{{ t('auth.email') }}</span>
              <input v-model.trim="authEmail" type="email" autocomplete="email" data-testid="auth-email" />
            </label>

            <label class="auth-field">
              <span>{{ t('auth.password') }}</span>
              <input v-model="authPassword" type="password" autocomplete="current-password" data-testid="auth-password" />
            </label>

            <button
              v-if="authMode === 'login'"
              class="auth-link-button"
              type="button"
              :disabled="passwordResetSubmitting"
              @click="handlePasswordResetRequest"
              data-testid="auth-forgot-password"
            >
              {{ t('auth.forgotPassword') }}
            </button>

            <div v-if="authError" class="auth-error" data-testid="auth-error">{{ authError }}</div>

            <button class="auth-button primary full" type="submit" :class="{ loading: authSubmitting }" :disabled="authSubmitting" :aria-busy="authSubmitting" data-testid="auth-submit">
              <span :class="['material-icons', { 'auth-loading-icon': authSubmitting }]">{{ authSubmitIcon }}</span>
              <span>{{ authSubmitLabel }}</span>
            </button>
          </form>
        </template>
      </div>
    </a-modal>

    <transition name="slide-left">
      <div v-if="showMobileMenu" class="mobile-menu-overlay" @click="showMobileMenu = false">
        <div class="mobile-menu" @click.stop>
          <div class="mobile-menu-header">
            <div class="mobile-menu-title-group">
              <span class="mobile-menu-title">{{ t('app.name') }}</span>
              <span class="mobile-menu-subtitle">{{ t('app.title') }}</span>
            </div>
            <button class="mobile-menu-close" @click="showMobileMenu = false">
              <span class="material-icons">close</span>
            </button>
          </div>
          
          <div class="mobile-menu-content">
            <div class="mobile-nav">
              <div
                v-for="item in mainMenuItems"
                :key="item.key"
                :class="['mobile-nav-item', { active: isMenuActive(item.key) }]"
                @click="handleMenuClick(item)"
              >
                <span class="material-icons mobile-nav-icon">{{ item.icon }}</span>
                <span class="mobile-nav-text">{{ t(item.labelKey) }}</span>
              </div>

              <!-- 语言切换 -->
              <div
                :class="['mobile-nav-item', 'settings-divider']"
                @click="toggleLang"
              >
                <span class="material-icons mobile-nav-icon">translate</span>
                <span class="mobile-nav-text">{{ currentLang === 'zh' ? t('lang.en') : t('lang.zh') }}</span>
              </div>

              <!-- 主题切换 -->
              <div
                class="mobile-nav-item"
                @click="toggleTheme"
              >
                <span class="material-icons mobile-nav-icon">{{ isDarkMode ? 'light_mode' : 'dark_mode' }}</span>
                <span class="mobile-nav-text">{{ isDarkMode ? t('theme.lightMode') : t('theme.darkMode') }}</span>
              </div>

              <button
                v-if="pwa.canInstall.value"
                class="mobile-nav-item mobile-nav-button"
                type="button"
                @click="handleInstallFromMenu"
                :disabled="pwa.installPending.value"
              >
                <span class="material-icons mobile-nav-icon">download</span>
                <span class="mobile-nav-text">{{ t('pwa.installAction') }}</span>
              </button>

              <!-- GitHub -->
              <a
                class="mobile-nav-item"
                href="https://github.com/hwttop5/ielts-reading-past-papers"
                target="_blank"
                rel="noopener noreferrer"
              >
                <svg class="mobile-github-icon" viewBox="0 0 24 24" aria-hidden="true">
                  <path fill="currentColor" d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
                </svg>
                <span class="mobile-nav-text">{{ t('menu.github') }}</span>
              </a>
            </div>
          </div>
        </div>
      </div>
    </transition>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useThemeStore } from '@/store/themeStore'
import { useSettingStore } from '@/store/settingStore'
import { useAuthStore } from '@/store/authStore'
import { loadContactAdConfig } from '@/api/contactAd'
import { ApiRequestError } from '@/api/authSync'
import { message } from 'ant-design-vue'
import type { ContactAdPayload } from '@/types/contactAd'
import { useI18n, type Locale } from '@/i18n'
import { useSyncManager } from '@/sync/syncManager'
import SponsorContactAd from '@/components/SponsorContactAd.vue'
import {
  applyPwaUpdate,
  dismissIosInstallHint,
  dismissNeedRefresh,
  dismissOfflineReady,
  promptPwaInstall,
  usePwaState
} from '@/pwa'
import { NEW_SITE_URL, shouldShowMigrationNotice } from '@/utils/siteMigration'

const route = useRoute()
const router = useRouter()
const themeStore = useThemeStore()
const settingStore = useSettingStore()
const authStore = useAuthStore()
const sync = useSyncManager()
const { t, currentLang, setLocale } = useI18n()
const pwa = usePwaState()

const isDarkMode = ref(false)
const showMobileMenu = ref(false)
const isScrolled = ref(false)
const sponsorContactAdRef = ref<InstanceType<typeof SponsorContactAd> | null>(null)
const contactAd = ref<ContactAdPayload>({ enabled: false })
const authPanelOpen = ref(false)
const authMode = ref<'login' | 'register'>('login')
const authEmail = ref('')
const authPassword = ref('')
const authSubmitting = ref(false)
const passwordResetSubmitting = ref(false)
const authError = ref('')
const showMigrationNotice = shouldShowMigrationNotice()

// 一级导航菜单 - 更多工具提升为一级
const mainMenuItems = [
  {
    key: 'home',
    labelKey: 'menu.home',
    icon: 'dashboard',
    path: '/home'
  },
  {
    key: 'browse',
    labelKey: 'menu.browse',
    icon: 'library_books',
    path: '/browse'
  },
  {
    key: 'practice',
    labelKey: 'menu.practice',
    icon: 'edit_note',
    path: '/practice'
  },
  {
    key: 'my-achievements',
    labelKey: 'menu.myAchievements',
    icon: 'emoji_events',
    path: '/my-achievements'
  }
]

const isMenuActive = (key: string) => {
  const currentPath = route.path.replace('/', '')
  
  if (key === 'browse') {
    return currentPath === 'browse' || currentPath === 'practice-mode'
  }
  
  if (key === 'practice') {
    return currentPath === 'practice'
  }
  
  if (key === 'settings') {
    return currentPath === 'settings'
  }
  
  return currentPath === key
}

const handleMenuClick = (item: any) => {
  if (item.path) {
    router.push(item.path)
    showMobileMenu.value = false
  }
}

const toggleMobileMenu = () => {
  showMobileMenu.value = !showMobileMenu.value
}

const goHome = () => {
  router.push('/home')
  showMobileMenu.value = false
}

const openSponsorContactAd = () => {
  sponsorContactAdRef.value?.openSponsorAd()
}

const refreshContactAd = async () => {
  contactAd.value = await loadContactAdConfig()
}

const toggleLang = () => {
  const newLang: Locale = currentLang.value === 'zh' ? 'en' : 'zh'
  setLocale(newLang)
  settingStore.updateSettings({ language: newLang })
  message.success(t(`lang.switchTo${newLang.charAt(0).toUpperCase() + newLang.slice(1)}`))
}

const toggleTheme = () => {
  isDarkMode.value = !isDarkMode.value
  const nextTheme = isDarkMode.value ? 'dark' : 'light'
  themeStore.setTheme(nextTheme)
  settingStore.updateSettings({ theme: nextTheme })
  message.success(isDarkMode.value ? t('theme.switchedToDark') : t('theme.switchedToLight'))
}

const syncIcon = computed(() => {
  switch (sync.status.value) {
    case 'bootstrapping':
    case 'syncing':
      return 'sync'
    case 'synced':
      return 'cloud_done'
    case 'error':
      return 'cloud_off'
    case 'guest':
      return 'person'
    default:
      return authStore.isAuthenticated ? 'cloud_queue' : 'person'
  }
})

const syncLabel = computed(() => {
  if (!authStore.isAuthenticated) {
    return t('auth.guest')
  }
  switch (sync.status.value) {
    case 'bootstrapping':
      return t('sync.bootstrapping')
    case 'syncing':
      return t('sync.syncing')
    case 'synced':
      return t('sync.synced')
    case 'error':
      return t('sync.error')
    default:
      return t('sync.ready')
  }
})

const syncTooltip = computed(() => {
  if (sync.lastError.value) {
    return sync.lastError.value
  }
  return authStore.isAuthenticated ? `${authStore.user?.email || ''} - ${syncLabel.value}` : t('auth.guestMode')
})

const showSponsorContactAction = computed(() => contactAd.value.enabled)

const accountIcon = computed(() => (authStore.isAuthenticated ? 'account_circle' : 'person'))
const accountTitle = computed(() => (authStore.isAuthenticated ? authStore.user?.email || t('auth.account') : t('auth.guestMode')))
const authModalTitle = computed(() => {
  if (authStore.isAuthenticated) {
    return t('auth.account')
  }
  return authMode.value === 'register' ? t('auth.register') : t('auth.login')
})
const authSubmitLabel = computed(() => (authMode.value === 'register' ? t('auth.register') : t('auth.login')))
const authSubmitIcon = computed(() => {
  if (authSubmitting.value) {
    return 'sync'
  }
  return authMode.value === 'register' ? 'person_add' : 'login'
})
const isSyncBusy = computed(() => sync.status.value === 'syncing' || sync.status.value === 'bootstrapping')

const openAuthPanel = (mode?: 'login' | 'register') => {
  if (mode) {
    authMode.value = mode
  }
  authError.value = ''
  authPanelOpen.value = true
}

const submitAuthForm = async () => {
  authError.value = ''
  const email = authEmail.value.trim().toLowerCase()
  const password = authPassword.value
  if (!email || password.length < 8) {
    authError.value = t('auth.invalidInput')
    return
  }

  authSubmitting.value = true
  try {
    if (authMode.value === 'register') {
      await authStore.register({ email, password })
      message.success(t('auth.registerSuccess'))
    } else {
      await authStore.login({ email, password })
      message.success(t('auth.loginSuccess'))
    }
    authPassword.value = ''
    authPanelOpen.value = false
  } catch (error) {
    authError.value = error instanceof Error ? error.message : t('auth.failed')
  } finally {
    authSubmitting.value = false
  }
}

const getPasswordResetRequestErrorMessage = (error: unknown) => {
  if (error instanceof ApiRequestError) {
    if (error.code === 'mail_unavailable') {
      return t('auth.resetMailUnavailable')
    }

    if (error.code === 'network_error' || error.status === 0 || error.status >= 500) {
      return t('auth.resetRequestUnavailable')
    }
  }

  return error instanceof Error ? error.message : t('auth.failed')
}

const handlePasswordResetRequest = async () => {
  authError.value = ''
  const email = authEmail.value.trim().toLowerCase()
  if (!email) {
    authError.value = t('auth.resetEmailRequired')
    return
  }

  passwordResetSubmitting.value = true
  try {
    await authStore.requestPasswordReset({ email, locale: currentLang.value })
    message.success(t('auth.resetRequestSuccess'))
  } catch (error) {
    authError.value = getPasswordResetRequestErrorMessage(error)
  } finally {
    passwordResetSubmitting.value = false
  }
}

const handleLogout = async () => {
  await authStore.logout()
  authPanelOpen.value = false
  message.success(t('auth.logoutSuccess'))
}

const handleSyncNow = async () => {
  try {
    await sync.syncNow()
    if (sync.status.value === 'synced') {
      message.success(t('sync.synced'))
    }
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('sync.error'))
  }
}

const handleInstallApp = async () => {
  const result = await promptPwaInstall()
  if (result === 'accepted') {
    message.success(t('pwa.installAccepted'))
    return
  }

  if (result === 'ios-manual') {
    message.info(t('pwa.iosInstallToast'))
  }
}

const handleInstallFromMenu = async () => {
  await handleInstallApp()
  showMobileMenu.value = false
}

const applyUpdate = async () => {
  try {
    await applyPwaUpdate()
  } catch (error) {
    console.error('[PWA] update failed', error)
    message.error(t('pwa.updateError'))
  }
}

const dismissUpdate = () => {
  dismissNeedRefresh()
}

const dismissOffline = () => {
  dismissOfflineReady()
}

const dismissIosInstall = () => {
  dismissIosInstallHint()
}

const handleKeydown = (e: KeyboardEvent) => {
  if (e.key === 'Escape') {
    if (showMobileMenu.value) {
      showMobileMenu.value = false
    }
  }
}

const handleScroll = () => {
  isScrolled.value = window.scrollY > 10
}

onMounted(() => {
  themeStore.initTheme()
  isDarkMode.value = document.documentElement.classList.contains('dark')

  document.addEventListener('keydown', handleKeydown)
  window.addEventListener('scroll', handleScroll)
  void refreshContactAd()
})

watch(
  () => themeStore.theme,
  () => {
    isDarkMode.value = document.documentElement.classList.contains('dark')
  }
)

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown)
  window.removeEventListener('scroll', handleScroll)
})
</script>

<style scoped>
.app-layout {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.fixed-header {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 1000;
  height: 72px;
  background: var(--header-bg);
  border-bottom: 1px solid var(--border-color);
  box-shadow: var(--shadow-xs);
  backdrop-filter: blur(12px);
  transition: all 0.3s ease;
}

.fixed-header.scrolled {
  box-shadow: var(--shadow-md);
}

.header-container {
  display: flex;
  align-items: center;
  justify-content: space-between;
  max-width: 1400px;
  margin: 0 auto;
  width: 100%;
  height: 100%;
  position: relative;
  padding: 0 24px;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 40px;
  flex: 1;
  min-width: 0;
}

.logo-text {
  display: flex;
  flex-direction: column;
  cursor: pointer;
  padding: 6px 0;
  border-radius: var(--radius-sm);
  transition: all 0.2s ease;
  line-height: 1.2;
}

.logo-text:hover {
  background: var(--bg-tertiary);
}

.logo-text-main {
  font-size: 16px;
  font-weight: 750;
  color: var(--text-primary);
  letter-spacing: 0;
}

.logo-text-sub {
  font-size: 11px;
  color: var(--text-secondary);
  font-weight: 600;
  letter-spacing: 0;
}

.main-nav {
  display: flex;
  gap: 4px;
  flex: 1;
  min-width: 0;
}

.nav-item {
  position: relative;
}

.nav-item-main {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all 0.2s ease;
  color: var(--text-secondary);
  font-weight: 600;
  font-size: 14px;
  white-space: nowrap;
}

.nav-item-main:hover {
  background: var(--surface-hover);
  color: var(--text-primary);
}

.nav-item.active > .nav-item-main {
  background: var(--primary-soft);
  color: var(--primary-color);
  box-shadow: inset 0 0 0 1px rgba(37, 99, 235, 0.05);
}

.nav-item.active > .nav-item-main::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 50%;
  transform: translateX(-50%);
  width: 20px;
  height: 3px;
  background: var(--primary-color);
  border-radius: 2px;
}

.nav-icon {
  font-size: 18px;
}

.nav-text {
  font-weight: 600;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.sync-indicator {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 36px;
  padding: 0 10px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  color: var(--text-secondary);
  background: var(--bg-primary);
  font-size: 12px;
  font-weight: 700;
  white-space: nowrap;
}

.sync-icon {
  font-size: 16px;
}

.sync-synced {
  color: var(--success-color);
  border-color: var(--success-border);
  background: var(--success-soft);
}

.sync-syncing,
.sync-bootstrapping {
  color: var(--primary-color);
  border-color: var(--primary-border);
  background: var(--primary-soft);
}

.sync-error {
  color: var(--danger-color);
  border-color: var(--danger-color);
  background: var(--danger-soft);
}

.pwa-action {
  color: var(--primary-color);
}

.quick-action {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border: 1px solid var(--border-color);
  background: var(--bg-primary);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all 0.2s ease;
  font-weight: 600;
  font-size: 13px;
  color: var(--text-secondary);
}

.quick-action:hover {
  border-color: var(--primary-color);
  background: var(--surface-hover);
  color: var(--primary-color);
  box-shadow: var(--primary-shadow-sm);
}

.action-icon {
  font-size: 16px;
}

.github-icon {
  width: 18px;
  height: 18px;
  color: var(--text-secondary);
}

.quick-action:hover .github-icon {
  color: var(--primary-color);
}

.mobile-github-icon {
  width: 20px;
  height: 20px;
  color: var(--text-secondary);
  flex-shrink: 0;
}

.mobile-menu-toggle {
  display: none;
}

.layout-content {
  flex: 1;
  background: var(--bg-secondary);
  margin-top: 72px;
}

.content-wrapper {
  max-width: 1400px;
  margin: 0 auto;
  padding: 32px 24px;
}

.pwa-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 20px;
  padding: 16px 18px;
  border-radius: var(--radius-lg);
  border: 1px solid var(--border-color);
  background: var(--bg-primary);
  box-shadow: var(--shadow-xs);
}

.update-banner {
  border-color: var(--primary-border);
}

.offline-banner {
  border-color: var(--success-border);
}

.install-banner {
  border-color: var(--orange-border);
  background: linear-gradient(180deg, var(--bg-primary), rgba(245, 158, 11, 0.08));
}
.migration-banner {
  align-items: center;
  border-color: var(--primary-border);
  background: linear-gradient(180deg, var(--bg-primary), rgba(37, 99, 235, 0.08));
}

.migration-banner-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: var(--radius-md);
  background: var(--primary-soft);
  color: var(--primary-color);
  flex: 0 0 36px;
}

.migration-banner-icon .material-icons {
  font-size: 20px;
}


.pwa-banner-copy {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.pwa-banner-copy strong {
  font-size: 15px;
  color: var(--text-primary);
}

.pwa-banner-copy span {
  font-size: 13px;
  color: var(--text-secondary);
}
.migration-banner-copy {
  flex: 1;
  min-width: 0;
}

.migration-link {
  color: var(--primary-color);
  font-weight: 700;
  text-decoration: none;
  overflow-wrap: anywhere;
}

.migration-link:hover,
.migration-link:focus-visible {
  text-decoration: underline;
}

.pwa-banner-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

.pwa-banner-btn {
  height: 36px;
  padding: 0 14px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border-color);
  background: var(--bg-primary);
  color: var(--text-primary);
  font-size: 14px;
  line-height: 20px;
  font-weight: 600;
  cursor: pointer;
}

.pwa-banner-btn.primary {
  border-color: var(--primary-color);
  background: var(--primary-color);
  color: #fff;
}

.migration-banner-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  text-decoration: none;
  white-space: nowrap;
}

.slide-down-enter-active,
.slide-down-leave-active {
  transition: all 0.25s ease;
}

.slide-down-enter-from,
.slide-down-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}

.mobile-menu-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 1001;
  backdrop-filter: blur(4px);
}

.mobile-menu {
  position: absolute;
  right: 0;
  top: 0;
  bottom: 0;
  width: 360px;
  max-width: 85vw;
  background: var(--bg-primary);
  box-shadow: var(--shadow-lg);
  display: flex;
  flex-direction: column;
  border-left: 1px solid var(--border-color);
}

.mobile-menu-close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: var(--radius-md);
  background: var(--bg-tertiary);
  border: none;
  cursor: pointer;
  color: var(--text-primary);
  flex-shrink: 0;
}

.mobile-menu-header {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-color);
  background: var(--bg-secondary);
  min-height: 56px;
}

.mobile-menu-title-group {
  display: none;
}

.mobile-menu-content {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
}

.mobile-nav-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all 0.2s ease;
  margin-bottom: 8px;
  color: var(--text-primary);
  text-decoration: none;
}

.mobile-nav-button {
  width: 100%;
  text-align: left;
  border: 1px solid var(--border-color);
  background: transparent;
}

.mobile-nav-item.settings-divider {
  margin-top: 16px;
  border-top: 1px solid var(--border-color);
  padding-top: 16px;
}

.mobile-nav-item:hover {
  background: var(--surface-hover);
  color: var(--text-primary);
}

.mobile-nav-item.active {
  background: var(--primary-soft);
  color: var(--primary-color);
}

.mobile-nav-item svg {
  flex-shrink: 0;
}

.mobile-nav-item .mobile-github-icon {
  color: var(--text-primary) !important;
}

.mobile-nav-icon {
  font-size: 22px;
}

.mobile-nav-text {
  flex: 1;
  font-size: 15px;
  font-weight: 600;
}

.slide-left-enter-active,
.slide-left-leave-active {
  transition: all 0.3s ease;
}

.slide-left-enter-from,
.slide-left-leave-to {
  opacity: 0;
}

.slide-left-enter-from .mobile-menu,
.slide-left-leave-to .mobile-menu {
  transform: translateX(100%);
}

.page-fade-enter-active,
.page-fade-leave-active {
  transition: all 0.3s ease;
}

.page-fade-enter-from {
  opacity: 0;
  transform: translateY(10px);
}

.page-fade-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}

.auth-panel {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.auth-user-summary {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  background: var(--bg-secondary);
}

.auth-user-icon {
  font-size: 36px;
  color: var(--primary-color);
}

.auth-user-copy {
  min-width: 0;
}

.auth-user-email {
  font-size: 15px;
  font-weight: 700;
  color: var(--text-primary);
  overflow-wrap: anywhere;
}

.auth-user-status,
.guest-line {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--text-secondary);
  font-size: 13px;
}

.auth-sync-icon {
  font-size: 16px;
}

.auth-segment {
  display: grid;
  grid-template-columns: 1fr 1fr;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  overflow: hidden;
}

.auth-segment button {
  min-height: 38px;
  border: 0;
  background: var(--bg-primary);
  color: var(--text-secondary);
  font-weight: 700;
  cursor: pointer;
}

.auth-segment button.active {
  color: var(--primary-color);
  background: var(--primary-soft);
}

.auth-form {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.auth-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  color: var(--text-secondary);
  font-size: 13px;
  font-weight: 700;
}

.auth-field input {
  width: 100%;
  min-height: 40px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  padding: 0 12px;
  color: var(--text-primary);
  background: var(--bg-primary);
  font-size: 14px;
}

.auth-field input:focus {
  outline: none;
  border-color: var(--primary-color);
  box-shadow: 0 0 0 3px var(--primary-ring);
}

.auth-link-button {
  align-self: flex-start;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--primary-color);
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
}

.auth-link-button:disabled {
  opacity: 0.65;
  cursor: wait;
}

.auth-error {
  padding: 10px 12px;
  border-radius: var(--radius-md);
  border: 1px solid var(--danger-color);
  color: var(--danger-color);
  background: var(--danger-soft);
  font-size: 13px;
}

.auth-actions {
  align-self: stretch;
  display: flex;
  gap: 10px;
  justify-content: space-between;
  width: 100%;
}

.auth-actions .auth-button {
  flex: 0 0 126px;
  height: 40px;
  width: 126px;
  white-space: nowrap;
}

.auth-button .material-icons {
  flex: 0 0 18px;
  width: 18px;
  font-size: 18px;
  line-height: 1;
  text-align: center;
}

.auth-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 40px;
  padding: 0 14px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  color: var(--text-primary);
  background: var(--bg-primary);
  font-weight: 700;
  cursor: pointer;
}

.auth-button.primary {
  border-color: var(--primary-color);
  background: var(--primary-color);
  color: #fff;
}

.auth-button.full {
  width: 100%;
}

.auth-button:disabled {
  opacity: 0.65;
  cursor: wait;
}

.auth-loading-icon {
  animation: auth-button-spin 0.9s linear infinite;
}

@keyframes auth-button-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 768px) {
  .fixed-header {
    height: 56px;
  }
  
  .header-container {
    padding: 0 16px;
  }
  
  .header-left {
    gap: 16px;
  }
  
  .logo-text {
    display: none;
  }
  
  .main-nav {
    display: none;
  }
  
  .sync-label {
    display: inline;
  }

  .sync-indicator {
    height: 40px;
    min-width: auto;
    justify-content: center;
    padding: 0 12px;
  }

  .header-right .quick-action:not(.mobile-menu-toggle):not(.pwa-action):not(.account-action):not(.contact-action) {
    display: none;
  }
  
  .mobile-menu-toggle {
    display: flex;
  }
  
  .layout-content {
    margin-top: 56px;
  }
  
  .content-wrapper {
    padding: 20px 16px;
  }

  .pwa-banner {
    flex-direction: column;
    align-items: stretch;
  }

  .migration-banner {
    flex-direction: row;
    align-items: center;
    flex-wrap: wrap;
  }

  .migration-banner-copy {
    flex: 1 1 calc(100% - 52px);
  }

  .pwa-banner-actions {
    width: 100%;
  }

  .pwa-banner-btn {
    flex: 1;
  }
}

@media (max-width: 1180px) and (min-width: 769px) {
  .fixed-header {
    height: 64px;
  }

  .header-container {
    padding: 0 16px;
  }

  .header-left {
    gap: 20px;
  }

  .logo-text {
    padding: 0;
  }

  .logo-text-main {
    font-size: 15px;
  }

  .logo-text-sub {
    display: none;
  }

  .main-nav {
    gap: 2px;
  }

  .nav-item-main {
    gap: 0;
    padding: 9px 12px;
    font-size: 13px;
  }

  .nav-icon {
    display: none;
  }

  .header-right {
    gap: 6px;
  }

  .sync-indicator {
    min-height: 36px;
    padding: 0 8px;
    font-size: 11px;
  }

  .quick-action {
    width: 36px;
    height: 36px;
  }

  .layout-content {
    margin-top: 64px;
  }
}
</style>
