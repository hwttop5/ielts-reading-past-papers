<template>
  <div id="app">
    <router-view />
  </div>
</template>

<script setup lang="ts">
import { provide } from 'vue'
import { provideI18n } from '@/i18n'

// 提供全局 i18n
const { t, currentLang } = provideI18n()
provide('t', t)
provide('currentLang', currentLang)
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