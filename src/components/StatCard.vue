<template>
  <a-card class="stat-card" hoverable>
    <a-statistic
      :title="title"
      :value="value"
      :suffix="suffix"
      :value-style="valueStyle"
    >
      <template #prefix>
        <slot name="icon"></slot>
      </template>
    </a-statistic>
  </a-card>
</template>

<script setup lang="ts">
defineProps<{
  title: string
  value: number | string
  suffix?: string
  valueStyle?: object
}>()
</script>

<style scoped>
.stat-card {
  margin-bottom: 16px;
}
</style>
