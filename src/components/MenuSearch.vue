<template>
  <div class="menu-search">
    <div class="search-input-wrapper">
      <span class="material-icons search-icon">search</span>
      <input
        ref="searchInput"
        v-model="searchQuery"
        type="text"
        :placeholder="t('search.placeholder')"
        class="search-input"
        @focus="showResults = true"
        @blur="hideResults"
        @keydown.escape="closeSearch"
      />
      <button v-if="searchQuery" class="clear-button" @click="clearSearch">
        <span class="material-icons">close</span>
      </button>
    </div>

    <transition name="fade">
      <div v-if="showResults && filteredMenus.length > 0" class="search-results">
        <div class="results-header">
          <span class="results-title">{{ t('search.results') }}</span>
          <span class="results-count">{{ filteredMenus.length }} {{ t('search.items') }}</span>
        </div>
        
        <div class="results-list">
          <div
            v-for="(item, index) in filteredMenus"
            :key="item.path"
            :class="['result-item', { selected: selectedIndex === index }]"
            @click="selectItem(item)"
            @mouseenter="selectedIndex = index"
          >
            <div class="result-icon">
              <span class="material-icons">{{ item.icon }}</span>
            </div>
            <div class="result-content">
              <div class="result-title">{{ t(item.labelKey) }}</div>
              <div class="result-path">{{ item.breadcrumbKeys.map(k => t(k)).join(' > ') }}</div>
            </div>
            <span class="result-arrow">→</span>
          </div>
        </div>

        <div class="search-hint">
          <span>{{ t('search.hint.esc') }}</span>
          <span>{{ t('search.hint.nav') }}</span>
          <span>{{ t('search.hint.select') }}</span>
        </div>
      </div>

      <div v-else-if="showResults && searchQuery && filteredMenus.length === 0" class="search-results">
        <div class="no-results">
          <span class="material-icons no-results-icon">search_off</span>
          <span class="no-results-text">{{ t('search.noResults') }}</span>
        </div>
      </div>
    </transition>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, inject } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()
const searchInput = ref<HTMLInputElement>()
const searchQuery = ref('')
const showResults = ref(false)
const selectedIndex = ref(0)
const t = inject('t', (key: string) => key)

const menuItems = [
  { labelKey: 'menu.home', icon: 'dashboard', path: '/home', breadcrumbKeys: ['breadcrumb.home'] },
  { labelKey: 'menu.browse', icon: 'library_books', path: '/browse', breadcrumbKeys: ['breadcrumb.browse'] },
  { labelKey: 'type.reading', icon: 'auto_stories', path: '/browse?type=reading', breadcrumbKeys: ['breadcrumb.browse', 'type.reading'] },
  { labelKey: 'menu.practice', icon: 'edit_note', path: '/practice', breadcrumbKeys: ['breadcrumb.practice'] },
  { labelKey: 'menu.myAchievements', icon: 'emoji_events', path: '/my-achievements', breadcrumbKeys: ['breadcrumb.myAchievements'] },
  { labelKey: 'menu.settings', icon: 'settings', path: '/settings', breadcrumbKeys: ['breadcrumb.settings'] }
]

const filteredMenus = computed(() => {
  if (!searchQuery.value) return []
  
  const query = searchQuery.value.toLowerCase()
  return menuItems.filter(item => {
    const label = t(item.labelKey).toLowerCase()
    const breadcrumb = item.breadcrumbKeys.map(k => t(k)).join(' > ').toLowerCase()
    return label.includes(query) || breadcrumb.includes(query)
  })
})

watch(searchQuery, () => {
  selectedIndex.value = 0
})

const selectItem = (item: any) => {
  router.push(item.path)
  closeSearch()
}

const clearSearch = () => {
  searchQuery.value = ''
  searchInput.value?.focus()
}

const closeSearch = () => {
  showResults.value = false
  searchQuery.value = ''
}

const hideResults = () => {
  setTimeout(() => {
    showResults.value = false
  }, 200)
}

const handleKeydown = (e: KeyboardEvent) => {
  if (!showResults.value || filteredMenus.value.length === 0) return
  
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    selectedIndex.value = Math.min(selectedIndex.value + 1, filteredMenus.value.length - 1)
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    selectedIndex.value = Math.max(selectedIndex.value - 1, 0)
  } else if (e.key === 'Enter') {
    e.preventDefault()
    selectItem(filteredMenus.value[selectedIndex.value])
  }
}

onMounted(() => {
  document.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown)
})
</script>

<style scoped>
.menu-search {
  position: relative;
  width: 100%;
  max-width: 400px;
}

.search-input-wrapper {
  position: relative;
  display: flex;
  align-items: center;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  padding: 8px 12px;
  transition: var(--transition);
}

.search-input-wrapper:focus-within {
  border-color: var(--primary-color);
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
}

.search-icon {
  font-size: 16px;
  margin-right: 8px;
  color: var(--text-tertiary);
}

.search-input {
  flex: 1;
  border: none;
  background: transparent;
  font-size: 14px;
  color: var(--text-primary);
  outline: none;
}

.search-input::placeholder {
  color: var(--text-tertiary);
}

.clear-button {
  padding: 4px;
  border: none;
  background: transparent;
  color: var(--text-tertiary);
  cursor: pointer;
  font-size: 14px;
  transition: var(--transition);
}

.clear-button:hover {
  color: var(--text-primary);
}

.search-results {
  position: absolute;
  top: calc(100% + 8px);
  left: 0;
  right: 0;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-lg);
  overflow: hidden;
  z-index: 1000;
}

.results-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-light);
  background: var(--bg-secondary);
}

.results-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}

.results-count {
  font-size: 12px;
  color: var(--text-tertiary);
}

.results-list {
  max-height: 300px;
  overflow-y: auto;
}

.result-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  cursor: pointer;
  transition: var(--transition);
  border-bottom: 1px solid var(--border-light);
}

.result-item:last-child {
  border-bottom: none;
}

.result-item:hover,
.result-item.selected {
  background: var(--bg-tertiary);
}

.result-item.selected {
  background: rgba(37, 99, 235, 0.05);
}

.result-icon {
  font-size: 20px;
  flex-shrink: 0;
}

.result-content {
  flex: 1;
  min-width: 0;
}

.result-title {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
  margin-bottom: 2px;
}

.result-path {
  font-size: 12px;
  color: var(--text-tertiary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.result-arrow {
  font-size: 16px;
  color: var(--text-tertiary);
  opacity: 0;
  transition: var(--transition);
}

.result-item:hover .result-arrow,
.result-item.selected .result-arrow {
  opacity: 1;
  color: var(--primary-color);
}

.search-hint {
  display: flex;
  gap: 16px;
  padding: 8px 16px;
  background: var(--bg-secondary);
  border-top: 1px solid var(--border-light);
  font-size: 11px;
  color: var(--text-tertiary);
}

.search-hint kbd {
  padding: 2px 6px;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: 3px;
  font-size: 10px;
  font-weight: 500;
}

.no-results {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 32px 16px;
}

.no-results-icon {
  font-size: 32px;
  opacity: 0.5;
}

.no-results-text {
  font-size: 13px;
  color: var(--text-tertiary);
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}

@media (max-width: 480px) {
  .menu-search {
    max-width: 100%;
  }

  .search-input-wrapper {
    padding: 6px 10px;
  }

  .search-icon {
    font-size: 14px;
    margin-right: 6px;
  }

  .search-input {
    font-size: 13px;
  }

  .result-item {
    padding: 10px 12px;
  }

  .result-icon {
    font-size: 18px;
  }

  .result-title {
    font-size: 13px;
  }

  .result-path {
    font-size: 11px;
  }

  .search-hint {
    display: none;
  }
}
</style>
