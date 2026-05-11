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
          <button class="quick-action" @click="toggleLang" :title="currentLang === 'zh' ? t('lang.en') : t('lang.zh')">
            <span class="material-icons action-icon">translate</span>
          </button>
          <button class="quick-action" @click="toggleTheme" :title="isDarkMode ? t('theme.lightMode') : t('theme.darkMode')">
            <span class="material-icons action-icon">{{ isDarkMode ? 'light_mode' : 'dark_mode' }}</span>
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
        <transition name="page-fade" mode="out-in">
          <router-view :key="$route.path" />
        </transition>
      </div>
    </main>

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
import { ref, onMounted, onUnmounted, provide, readonly } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useQuestionStore } from '@/store/questionStore'
import { useThemeStore } from '@/store/themeStore'
import { message } from 'ant-design-vue'
import { useI18n, type Locale } from '@/i18n'

const route = useRoute()
const router = useRouter()
const questionStore = useQuestionStore()
const themeStore = useThemeStore()
const { t, currentLang, setLocale } = useI18n()

const isDarkMode = ref(false)
const showMobileMenu = ref(false)
const isScrolled = ref(false)

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

const toggleLang = () => {
  const newLang: Locale = currentLang.value === 'zh' ? 'en' : 'zh'
  setLocale(newLang)
  message.success(t(`lang.switchTo${newLang.charAt(0).toUpperCase() + newLang.slice(1)}`))
}

const toggleTheme = () => {
  isDarkMode.value = !isDarkMode.value
  themeStore.setTheme(isDarkMode.value ? 'dark' : 'light')
  message.success(isDarkMode.value ? t('theme.switchedToDark') : t('theme.switchedToLight'))
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
})

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
  
  .header-right .quick-action:not(.mobile-menu-toggle) {
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
}
</style>
