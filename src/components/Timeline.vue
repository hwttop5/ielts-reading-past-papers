<template>
  <div class="timeline">
    <div v-for="(item, index) in items" :key="index" class="timeline-item">
      <div class="timeline-item-content">
        <slot name="content" :item="item" :index="index"></slot>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  items: any[]
}>()
</script>

<style scoped>
.timeline {
  position: relative;
  padding-left: 24px;
}

.timeline-item {
  position: relative;
  padding-bottom: 16px;
}

.timeline-item::before {
  content: '';
  position: absolute;
  left: -24px;
  top: 4px;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #1890ff;
}

.timeline-item:last-child::before {
  display: none;
}

.timeline-item-content {
  padding: 12px 16px;
  background: #fafafa;
  border-radius: 8px;
  border: 1px solid #f0f0f0;
}
</style>
