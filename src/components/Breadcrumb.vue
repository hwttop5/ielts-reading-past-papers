<template>
  <div class="breadcrumb-nav">
    <button class="back-button" @click="goBack" v-if="showBack">
      <span class="material-icons" style="font-size: 16px;">arrow_back</span>
      <span class="back-text">{{ t('breadcrumb.back') }}</span>
    </button>
    
    <div class="breadcrumb-items">
      <div 
        v-for="(item, index) in breadcrumbs" 
        :key="index"
        class="breadcrumb-item"
      >
        <span 
          :class="['breadcrumb-link', { clickable: item.path }]"
          @click="navigateTo(item)"
        >
          <span class="breadcrumb-icon" v-if="item.icon">
            <span class="material-icons" style="font-size: 16px;">{{ item.icon }}</span>
          </span>
          <span class="breadcrumb-text">{{ t(item.labelKey) }}</span>
        </span>
        
        <span class="breadcrumb-separator" v-if="index < breadcrumbs.length - 1">
          /
        </span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, inject } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const route = useRoute()
const router = useRouter()
const t = inject('t', (key: string) => key)

interface BreadcrumbItem {
  labelKey: string
  icon?: string
  path?: string
}

const routeMap: Record<string, BreadcrumbItem[]> = {
  '/home': [
    { labelKey: 'breadcrumb.home', icon: 'home', path: '/home' }
  ],
  '/browse': [
    { labelKey: 'breadcrumb.home', icon: 'home', path: '/home' },
    { labelKey: 'breadcrumb.browse', icon: 'library_books' }
  ],
  '/practice': [
    { labelKey: 'breadcrumb.home', icon: 'home', path: '/home' },
    { labelKey: 'breadcrumb.practice', icon: 'edit_note' }
  ],
  '/practice-mode': [
    { labelKey: 'breadcrumb.home', icon: 'home', path: '/home' },
    { labelKey: 'breadcrumb.browse', icon: 'library_books', path: '/browse' },
    { labelKey: 'breadcrumb.practiceMode', icon: 'edit' }
  ],
  '/my-achievements': [
    { labelKey: 'breadcrumb.home', icon: 'home', path: '/home' },
    { labelKey: 'breadcrumb.myAchievements', icon: 'emoji_events' }
  ]
}

const breadcrumbs = computed(() => {
  return routeMap[route.path] || [
    { labelKey: 'breadcrumb.home', icon: 'home', path: '/home' }
  ]
})

const showBack = computed(() => {
  return route.path !== '/overview'
})

const goBack = () => {
  const currentBreadcrumbs = breadcrumbs.value
  
  if (currentBreadcrumbs.length > 1) {
    const previousItem = currentBreadcrumbs[currentBreadcrumbs.length - 2]
    if (previousItem.path) {
      router.push(previousItem.path)
      return
    }
  }
  
  router.push('/overview')
}

const navigateTo = (item: BreadcrumbItem) => {
  if (item.path) {
    router.push(item.path)
  }
}
</script>

<style scoped>
.breadcrumb-nav {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 12px 0;
  margin-bottom: 16px;
}

.back-button {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border: 1px solid var(--border-color);
  background: var(--bg-primary);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: var(--transition);
  color: var(--text-secondary);
  font-size: 13px;
  font-weight: 500;
}

.back-button:hover {
  border-color: var(--primary-color);
  color: var(--primary-color);
  background: var(--bg-tertiary);
}

.back-button:active {
  transform: scale(0.95);
}

.back-icon {
  font-size: 14px;
  font-weight: 600;
}

.back-text {
  font-weight: 500;
}

.breadcrumb-items {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
}

.breadcrumb-item {
  display: flex;
  align-items: center;
  gap: 8px;
}

.breadcrumb-link {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  border-radius: var(--radius-sm);
  transition: var(--transition);
  font-size: 13px;
  color: var(--text-secondary);
}

.breadcrumb-link.clickable {
  cursor: pointer;
}

.breadcrumb-link.clickable:hover {
  background: var(--bg-tertiary);
  color: var(--primary-color);
}

.breadcrumb-icon {
  font-size: 14px;
}

.breadcrumb-text {
  font-weight: 500;
}

.breadcrumb-separator {
  color: var(--text-tertiary);
  font-size: 12px;
  user-select: none;
}

@media (max-width: 768px) {
  .breadcrumb-nav {
    gap: 12px;
  }
  
  .breadcrumb-icon {
    display: none;
  }
  
  .breadcrumb-text {
    font-size: 12px;
  }
}
</style>
