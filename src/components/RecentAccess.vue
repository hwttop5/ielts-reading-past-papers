<template>
  <div class="recent-access">
    <div class="recent-header">
      <span class="recent-title">{{ t('recent.title') }}</span>
      <button class="clear-all" @click="clearAll" v-if="recentItems.length > 0">
        {{ t('common.clear') }}
      </button>
    </div>

    <div v-if="recentItems.length === 0" class="empty-state">
      <span class="material-icons empty-icon">history</span>
      <span class="empty-text">{{ t('recent.empty') }}</span>
    </div>

    <div v-else class="recent-list">
      <div
        v-for="item in recentItems"
        :key="item.path + item.timestamp"
        class="recent-item"
        @click="navigateTo(item)"
      >
        <div class="item-icon">
          <span class="material-icons">{{ item.icon }}</span>
        </div>
        <div class="item-content">
          <div class="item-title">{{ t(item.labelKey) }}</div>
          <div class="item-time">{{ formatTime(item.timestamp) }}</div>
        </div>
        <button class="item-remove" @click.stop="removeItem(item)">
          <span class="material-icons" style="font-size: 16px;">close</span>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch, inject } from 'vue'
import { useRouter, useRoute } from 'vue-router'

const router = useRouter()
const route = useRoute()
const t = inject('t', (key: string, params?: any) => key)

interface RecentItem {
  path: string
  labelKey: string
  icon: string
  timestamp: number
}

const recentItems = ref<RecentItem[]>([])

const routeInfo: Record<string, { labelKey: string; icon: string }> = {
  '/overview': { labelKey: 'breadcrumb.overview', icon: 'dashboard' },
  '/browse': { labelKey: 'breadcrumb.browse', icon: 'library_books' },
  '/practice': { labelKey: 'breadcrumb.practice', icon: 'edit_note' },
  '/achievement': { labelKey: 'breadcrumb.achievement', icon: 'emoji_events' }
}

const loadRecentItems = () => {
  const stored = localStorage.getItem('ielts_recent_items')
  if (stored) {
    recentItems.value = JSON.parse(stored)
  }
}

const saveRecentItems = () => {
  localStorage.setItem('ielts_recent_items', JSON.stringify(recentItems.value))
}

const addRecentItem = (path: string) => {
  const info = routeInfo[path]
  if (!info) return

  const newItem: RecentItem = {
    path,
    labelKey: info.labelKey,
    icon: info.icon,
    timestamp: Date.now()
  }

  recentItems.value = recentItems.value.filter(item => item.path !== path)
  recentItems.value.unshift(newItem)
  recentItems.value = recentItems.value.slice(0, 5)

  saveRecentItems()
}

const removeItem = (item: RecentItem) => {
  recentItems.value = recentItems.value.filter(i => i.path !== item.path)
  saveRecentItems()
}

const clearAll = () => {
  recentItems.value = []
  saveRecentItems()
}

const navigateTo = (item: RecentItem) => {
  router.push(item.path)
}

const formatTime = (timestamp: number): string => {
  const now = Date.now()
  const diff = now - timestamp
  
  if (diff < 60000) return t('recent.justNow')
  if (diff < 3600000) return t('recent.minsAgo', { n: Math.floor(diff / 60000).toString() })
  if (diff < 86400000) return t('recent.hoursAgo', { n: Math.floor(diff / 3600000).toString() })
  
  const date = new Date(timestamp)
  return `${date.getMonth() + 1}/${date.getDate()}`
}

watch(() => route.path, (newPath) => {
  if (newPath && routeInfo[newPath]) {
    addRecentItem(newPath)
  }
}, { immediate: true })

onMounted(() => {
  loadRecentItems()
})
</script>

<style scoped>
.recent-access {
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  overflow: hidden;
}

.recent-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-light);
  background: var(--bg-secondary);
}

.recent-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}

.clear-all {
  padding: 4px 8px;
  border: none;
  background: transparent;
  color: var(--text-tertiary);
  font-size: 12px;
  cursor: pointer;
  transition: var(--transition);
}

.clear-all:hover {
  color: var(--primary-color);
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 24px 16px;
}

.empty-icon {
  font-size: 32px;
  opacity: 0.5;
  color: var(--text-tertiary);
}

.empty-text {
  font-size: 13px;
  color: var(--text-tertiary);
}

.recent-list {
  max-height: 300px;
  overflow-y: auto;
}

.recent-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  cursor: pointer;
  transition: var(--transition);
  border-bottom: 1px solid var(--border-light);
}

.recent-item:last-child {
  border-bottom: none;
}

.recent-item:hover {
  background: var(--bg-tertiary);
}

.item-icon {
  font-size: 20px;
  flex-shrink: 0;
  color: var(--text-secondary);
  display: flex;
  align-items: center;
}

.item-content {
  flex: 1;
  min-width: 0;
}

.item-title {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
  margin-bottom: 2px;
}

.item-time {
  font-size: 12px;
  color: var(--text-tertiary);
}

.item-remove {
  padding: 4px;
  border: none;
  background: transparent;
  color: var(--text-tertiary);
  cursor: pointer;
  font-size: 12px;
  opacity: 0;
  transition: var(--transition);
  display: flex;
  align-items: center;
}

.recent-item:hover .item-remove {
  opacity: 1;
}

.item-remove:hover {
  color: #dc2626;
}
</style>
