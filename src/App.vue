<template>
  <div id="app">
    <router-view />
  </div>
</template>

<script setup lang="ts">
import { provide, onMounted, onUnmounted, h } from 'vue'
import { provideI18n } from '@/i18n'
import { eventBus, ACHIEVEMENT_UNLOCKED } from '@/utils/eventBus'
import { notification } from 'ant-design-vue'
import type { Achievement } from '@/store/achievementStore'

// 提供全局 i18n
const { t, currentLang } = provideI18n()
provide('t', t)
provide('currentLang', currentLang)

const getRarityColor = (rarity: string) => {
  switch (rarity) {
    case 'legendary': return '#f59e0b' // amber-500
    case 'epic': return '#8b5cf6' // violet-500
    case 'rare': return '#3b82f6' // blue-500
    default: return '#10b981' // emerald-500
  }
}

const getRarityIcon = (rarity: string) => {
  switch (rarity) {
    case 'legendary': return 'military_tech'
    case 'epic': return 'workspace_premium'
    case 'rare': return 'star'
    default: return 'emoji_events'
  }
}

const handleAchievementUnlocked = (event: CustomEvent) => {
  const achievement = event.detail?.achievement as Achievement
  if (!achievement) return

  notification.open({
    message: t('achievement.unlocked'),
    description: h('div', [
      h('div', { style: 'font-weight: bold; margin-bottom: 4px;' }, t(achievement.titleKey)),
      h('div', { style: 'font-size: 13px; color: #666;' }, t(achievement.descKey)),
      h('div', { style: `margin-top: 8px; color: ${getRarityColor(achievement.rarity)}; font-size: 12px; font-weight: 600;` }, `+${achievement.points} pts`)
    ]),
    icon: () => h('span', { 
      class: 'material-icons', 
      style: `color: ${getRarityColor(achievement.rarity)}; font-size: 24px;` 
    }, getRarityIcon(achievement.rarity)),
    duration: 4.5,
    placement: 'topRight',
    class: 'achievement-notification'
  })
}

onMounted(() => {
  eventBus.on(ACHIEVEMENT_UNLOCKED, handleAchievementUnlocked)
})

onUnmounted(() => {
  eventBus.off(ACHIEVEMENT_UNLOCKED, handleAchievementUnlocked)
})
</script>

<style>
#app {
  font-family: Avenir, Helvetica, Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  color: #2c3e50;
  min-height: 100vh;
}
</style>