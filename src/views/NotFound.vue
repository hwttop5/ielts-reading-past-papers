<template>
  <div class="not-found">
    <div class="content">
      <span class="material-icons icon">sentiment_dissatisfied</span>
      <h1>404</h1>
      <p>{{ t('common.notFound') || 'Page Not Found' }}</p>
      <button class="action-button primary" @click="$router.push('/')">
        <span class="material-icons" style="font-size: 18px;">home</span>
        {{ t('menu.home') }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { inject } from 'vue'

const t = inject('t', (key: string) => key)
</script>

<style scoped>
.not-found {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  background: var(--bg-primary);
  text-align: center;
}

.content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
}

.icon {
  font-size: 80px;
  color: var(--text-tertiary);
}

h1 {
  font-size: 48px;
  font-weight: 800;
  color: var(--text-primary);
  margin: 0;
  line-height: 1;
}

p {
  font-size: 16px;
  color: var(--text-secondary);
  margin: 0;
}

.action-button {
  margin-top: 16px;
  padding: 10px 24px;
  background: var(--primary-color);
  color: white;
  border: none;
  border-radius: var(--radius-md);
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  transition: var(--transition);
}

.action-button:hover {
  background: var(--primary-hover);
}
</style>