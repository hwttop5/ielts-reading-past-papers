<template>
  <a-card class="question-card" hoverable @click="handleClick">
    <template #title>
      <div style="display: flex; justify-content: space-between; align-items: center">
        <span>{{ question.titleCN }}</span>
        <a-tag :color="getCategoryColor(question.category)">{{ question.category }}</a-tag>
      </div>
    </template>
    
    <div class="question-info">
      <a-space>
        <a-tag v-if="question.difficulty" color="orange">{{ question.difficulty }}</a-tag>
        <a-tag color="blue">阅读</a-tag>
      </a-space>
      
      <div class="question-meta">
        <span>{{ question.totalQuestions }} 题</span>
      </div>
    </div>
    
    <template #actions>
      <play-circle-outlined @click.stop="handleStart" />
    </template>
  </a-card>
</template>

<script setup lang="ts">
import { PlayCircleOutlined } from '@ant-design/icons-vue'
import type { Question } from '@/store/questionStore'

defineProps<{
  question: Question
}>()

const emit = defineEmits<{
  (e: 'start'): void
  (e: 'click'): void
}>()

const getCategoryColor = (category: string) => {
  const colors: Record<string, string> = {
    P1: 'blue',
    P2: 'green',
    P3: 'orange'
  }
  return colors[category] || 'default'
}

const handleClick = () => emit('click')
const handleStart = () => emit('start')
</script>

<style scoped>
.question-card {
  margin-bottom: 16px;
}

.question-info {
  margin: 16px 0;
}

.question-meta {
  margin-top: 8px;
  font-size: 14px;
  color: #666;
}
</style>
