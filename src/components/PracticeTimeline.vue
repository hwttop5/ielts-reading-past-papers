<template>
  <a-space direction="vertical" style="width: 100%">
    <a-radio-group v-model:value="filter">
      <a-radio-button value="all">全部</a-radio-button>
      <a-radio-button value="reading">阅读</a-radio-button>
    </a-radio-group>

    <a-timeline>
      <a-timeline-item
        v-for="item in filtered"
        :key="item.id"
      >
        <a-card size="small">
          <strong>{{ item.title }}</strong>
          <div style="margin-top: 6px">
            <a-tag>阅读</a-tag>
            <a-tag color="blue">{{ item.duration }} 秒</a-tag>
            <a-tag color="green">{{ item.accuracy }}%</a-tag>
          </div>
          <div style="margin-top: 4px; color: #888">
            {{ format(item.time) }}
          </div>
        </a-card>
      </a-timeline-item>
    </a-timeline>
  </a-space>
</template>

<script setup lang="ts">
import { computed, ref, onMounted } from 'vue'
import { usePracticeStore } from '@/store/practiceStore'
import { useQuestionStore } from '@/store/questionStore'

const practiceStore = usePracticeStore()
const questionStore = useQuestionStore()

const filter = ref<'all' | 'reading'>('all')

onMounted(() => {
  practiceStore.load()
  questionStore.loadQuestions()
})

const enriched = computed(() =>
  practiceStore.records.map(r => {
    const q = questionStore.questions.find(q => q.id === r.questionId)
    return {
      ...r,
      title: q?.titleCN ?? '未知题目',
      type: q?.type ?? 'unknown'
    }
  })
)

const filtered = computed(() => {
  if (filter.value === 'all') return enriched.value
  return enriched.value.filter(i => i.type === filter.value)
})

const format = (t: number) =>
  new Date(t).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
</script>
