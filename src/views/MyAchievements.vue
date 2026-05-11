<template>
  <div class="achievement-page">
    <div class="page-header">
      <div class="header-content">
        <h1 class="page-title"><span class="material-icons title-icon">emoji_events</span> {{ t('menu.myAchievements') }}</h1>
        <p class="page-subtitle">{{ t('more.achievementDesc') }}</p>
      </div>
      <div class="header-stats">
        <div class="stat-main">
          <span class="stat-value">{{ store.unlockedCount }}</span>
          <span class="stat-divider">/</span>
          <span class="stat-total">{{ store.totalAchievements }}</span>
        </div>
        <div class="stat-label">{{ t('achievement.unlocked') }}</div>
        <div class="progress-bar-container">
          <div 
            class="progress-bar-fill" 
            :style="{ width: `${store.progress}%` }"
          ></div>
        </div>
      </div>
    </div>

    <div class="achievement-grid">
      <div 
        v-for="a in sortedAchievements" 
        :key="a.id"
        :class="['achievement-card', { unlocked: a.unlocked }, `rarity-${a.rarity}`]"
      >
        <div class="card-inner">
          <div :class="['icon-wrapper', getIconColor(a.id)]">
            <span class="material-icons achievement-icon">
              {{ getIcon(a.id) }}
            </span>
            <div v-if="a.unlocked" class="unlocked-badge">
              <span class="material-icons">check</span>
            </div>
          </div>
          <div class="achievement-info">
            <div class="info-header">
              <h3 class="achievement-title">{{ t(a.titleKey) }}</h3>
              <span :class="['rarity-tag', a.rarity]">{{ t(`achievement.rarity.${a.rarity}`) }}</span>
            </div>
            <p class="achievement-desc">{{ t(a.descKey) }}</p>
            <div class="card-footer">
              <span class="points-badge">
                <span class="material-icons points-icon">stars</span>
                {{ a.points }}
              </span>
              <div v-if="a.unlocked" class="unlock-date">
                {{ formatDate(a.unlockedAt) }}
              </div>
              <div v-else class="lock-status">
                <span class="material-icons lock-icon">lock</span>
                {{ t('achievement.locked') }}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, inject, computed } from 'vue'
import { useAchievementStore } from '@/store/achievementStore'

const store = useAchievementStore()
const t = inject('t', (key: string) => key)

const sortedAchievements = computed(() => {
  return [...store.achievements].sort((a, b) => {
    // Unlocked first
    if (a.unlocked && !b.unlocked) return -1
    if (!a.unlocked && b.unlocked) return 1
    
    // If both unlocked, sort by unlock date (newest first)
    if (a.unlocked && b.unlocked) {
      return (b.unlockedAt || 0) - (a.unlockedAt || 0)
    }
    
    return 0
  })
})

onMounted(() => {
  store.load()
  store.check()
})

const getIcon = (id: string) => {
  const icons: Record<string, string> = {
    first_practice: 'auto_awesome',
    practice_10: 'trending_up',
    practice_50: 'workspace_premium',
    practice_100: 'military_tech',
    accuracy_80: 'verified',
    accuracy_90: 'psychology',
    perfect_score: 'star',
    speed_run: 'bolt',
    study_1h: 'timer',
    study_10h: 'hourglass_top',
    study_50h: 'history',
    streak_3: 'local_fire_department',
    streak_7: 'whatshot',
    streak_14: 'wb_sunny',
    streak_30: 'flare',
    perfect_3: 'stars',
    perfect_10: 'diamond',
    early_bird: 'wb_twilight',
    night_owl: 'nights_stay',
    weekend_warrior: 'weekend',
    share_master: 'share',
    click_easter_egg: 'catching_pokemon',
    review_master: 'rate_review',
    marathon_runner: 'directions_run',
    scholar: 'school',
    interaction_master: 'forum',
    login_streak: 'login',
    legend: 'emoji_events'
  }
  return icons[id] || 'emoji_events'
}

const getIconColor = (id: string) => {
  // Use consistent colors based on meaning or ID hash
  const colors = [
    'color-blue', 'color-cyan', 'color-indigo', 'color-purple', 
    'color-green', 'color-pink', 'color-gold', 'color-orange'
  ]
  let hash = 0
  for (let i = 0; i < id.length; i++) {
    hash = id.charCodeAt(i) + ((hash << 5) - hash)
  }
  return colors[Math.abs(hash) % colors.length]
}

const formatDate = (ts?: number) => {
  if (!ts) return ''
  const date = new Date(ts)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
</script>

<style scoped>
.achievement-page {
  max-width: 1400px;
  margin: 0 auto;
  padding: 0px;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 40px;
  gap: 16px;
  flex-wrap: wrap;
}

.header-content {
  flex: 1;
  min-width: 200px;
}

.page-title {
  font-size: 32px;
  font-weight: 800;
  color: var(--text-primary);
  margin: 0 0 8px 0;
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

.header-stats {
  display: flex;
  align-items: center;
  gap: 12px;
  background: var(--bg-primary);
  border-radius: var(--radius-md);
  border: 1px solid var(--border-color);
  box-shadow: var(--shadow-xs);
  min-width: auto;
  height: 60px;
  padding: 0 24px;
}

.stat-main {
  display: flex;
  align-items: baseline;
  gap: 4px;
  margin-bottom: 0;
  height: 100%;
  align-items: center;
}

.stat-value {
  font-size: 32px;
  font-weight: 800;
  color: var(--primary-color);
  line-height: 1;
}

.stat-divider {
  font-size: 20px;
  color: var(--text-tertiary);
}

.stat-total {
  font-size: 20px;
  font-weight: 600;
  color: var(--text-secondary);
}

.stat-label {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-tertiary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 0;
  display: flex;
  align-items: center;
  height: 100%;
  padding-top: 2px; /* optical adjustment */
}

.progress-bar-container {
  height: 6px;
  background: var(--bg-tertiary);
  border-radius: 3px;
  overflow: hidden;
}

.progress-bar-fill {
  height: 100%;
  background: var(--primary-color);
  border-radius: 3px;
  transition: width 0.8s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.achievement-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 20px;
}

.achievement-card {
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  padding: 20px;
  transition: var(--transition);
  position: relative;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  box-shadow: var(--shadow-xs);
}

.achievement-card.unlocked {
  border-color: var(--primary-border-soft);
  box-shadow: var(--shadow-sm);
}

.achievement-card:not(.unlocked) {
  opacity: 0.78;
  filter: grayscale(0.9);
}

.achievement-card:hover {
  transform: translateY(-1px);
  box-shadow: var(--shadow-md);
  border-color: var(--primary-border);
}

.achievement-card.unlocked:hover {
  border-color: var(--primary-border-strong);
}

/* Rarity Borders/Glows for unlocked cards */
.achievement-card.unlocked.rarity-rare {
  box-shadow: 0 10px 25px -5px rgba(59, 130, 246, 0.15);
}
.achievement-card.unlocked.rarity-epic {
  box-shadow: 0 10px 25px -5px rgba(139, 92, 246, 0.15);
}
.achievement-card.unlocked.rarity-legendary {
  box-shadow: 0 10px 25px -5px rgba(245, 158, 11, 0.15);
  background: linear-gradient(to bottom right, var(--bg-primary), rgba(245, 158, 11, 0.05));
}

.card-inner {
  display: flex;
  flex-direction: row; /* Changed to row for better info layout */
  align-items: flex-start;
  text-align: left;
  gap: 16px;
  height: 100%;
}

.icon-wrapper {
  width: 64px;
  height: 64px;
  border-radius: var(--radius-md);
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  transition: var(--transition);
  flex-shrink: 0;
}

.achievement-card:hover .icon-wrapper {
  transform: translateY(-1px);
}

.achievement-icon {
  font-size: 32px;
  color: white;
}

.unlocked-badge {
  position: absolute;
  bottom: -4px;
  right: -4px;
  width: 20px;
  height: 20px;
  background: var(--success-color);
  border: 2px solid var(--bg-primary);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
}

.unlocked-badge .material-icons {
  font-size: 12px;
  font-weight: bold;
}

.achievement-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  height: 100%;
}

.info-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 4px;
}

.achievement-title {
  font-size: 16px;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0;
  line-height: 1.3;
}

.rarity-tag {
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  padding: 3px 7px;
  border-radius: 6px;
  margin-left: 8px;
  flex-shrink: 0;
  border: 1px solid transparent;
}

.rarity-tag.common { background: var(--control-muted-bg); color: var(--text-secondary); border-color: var(--border-color); }
.rarity-tag.rare { background: var(--info-soft); color: var(--info-color); border-color: var(--info-border); }
.rarity-tag.epic { background: var(--purple-soft); color: var(--purple-color); border-color: var(--purple-border); }
.rarity-tag.legendary { background: var(--orange-soft); color: var(--orange-color); border-color: var(--orange-border); }

.achievement-desc {
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.4;
  margin: 0 0 12px 0;
  flex: 1;
}

.card-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: auto;
}

.points-badge {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-tertiary);
  background: var(--control-muted-bg);
  padding: 4px 8px;
  border-radius: 8px;
  border: 1px solid var(--border-light);
}

.points-icon {
  font-size: 14px;
  color: var(--orange-color);
}

.unlock-date {
  font-size: 11px;
  font-weight: 600;
  color: var(--primary-color);
}

.lock-status {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  font-weight: 600;
  color: var(--text-tertiary);
}

.lock-icon {
  font-size: 12px;
}

/* Icon Colors */
.color-blue { background: #3b82f6; }
.color-cyan { background: #06b6d4; }
.color-indigo { background: #6366f1; }
.color-purple { background: #8b5cf6; }
.color-green { background: #10b981; }
.color-pink { background: #ec4899; }
.color-gold { background: #f59e0b; }
.color-orange { background: #f97316; }
.color-default { background: #94a3b8; }

@media (max-width: 640px) {
  .page-header {
    flex-direction: column;
    align-items: flex-start;
  }
  
  .header-stats {
    width: 100%;
  }
  
  .achievement-grid {
    grid-template-columns: 1fr;
  }
}
</style>
