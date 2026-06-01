<template>
  <a-modal
    v-model:open="modalOpen"
    :footer="null"
    :width="920"
    :closable="false"
    centered
    class="sponsor-ad-modal-shell"
    destroy-on-close
  >
    <div v-if="adContent" class="sponsor-ad-modal" data-testid="sponsor-ad-modal">
      <button class="sponsor-ad-close" type="button" aria-label="关闭" @click="closeModal">
        <span class="material-icons" aria-hidden="true">close</span>
      </button>

      <header class="sponsor-ad-intro">
        <span class="material-icons sponsor-ad-intro-icon" aria-hidden="true">campaign</span>
        <div class="sponsor-ad-intro-copy">
          <h2 class="sponsor-ad-title">{{ adContent.title }}</h2>
        </div>
      </header>

      <div class="sponsor-ad-copy assistant-md" data-testid="sponsor-ad-markdown" v-html="renderedContent"></div>

      <div class="sponsor-ad-actions">
        <button
          class="sponsor-ad-primary"
          type="button"
          data-testid="sponsor-ad-close-today"
          @click="closeToday"
        >
          <span class="material-icons" aria-hidden="true">schedule</span>
          <span class="sponsor-ad-button-label">今日已读</span>
        </button>
        <button
          class="sponsor-ad-secondary"
          type="button"
          data-testid="sponsor-ad-close-forever"
          @click="closeForever"
        >
          <span class="material-icons" aria-hidden="true">verified_user</span>
          <span class="sponsor-ad-button-label">永久关闭</span>
        </button>
      </div>
    </div>
  </a-modal>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import type { ContactAdPayload } from '@/types/contactAd'
import { renderAssistantHtml, renderAssistantMarkdown } from '@/utils/assistantMarkdown'
import { loadFromLocalStorage, saveToLocalStorage } from '@/utils/storage'

const STORAGE_KEY = 'ielts-reading-past-papers:sponsor-contact-ad'
const DEFAULT_AUTO_OPEN_DELAY_MS = 300

interface SponsorAdDismissState {
  closedDate?: string
  closedAt?: string
  foreverClosed?: boolean
  foreverClosedAt?: string
  contentVersion?: string
}

const props = defineProps<{
  content: ContactAdPayload
}>()

const modalOpen = ref(false)
const autoOpenTimer = ref<number | null>(null)

const EMPTY_NOTICE_MARKDOWN = '暂无公告'

const adContent = computed(() => props.content)
const renderedContent = computed(() => {
  if (adContent.value.html?.trim()) {
    return renderAssistantHtml(adContent.value.html)
  }
  return renderAssistantMarkdown(adContent.value.markdown.trim() ? adContent.value.markdown : EMPTY_NOTICE_MARKDOWN)
})

function getContentVersion(): string {
  return adContent.value.updatedAt?.trim() || `${adContent.value.title}\n${adContent.value.markdown}\n${adContent.value.html || ''}`
}

function clearAutoOpenTimer(): void {
  if (autoOpenTimer.value !== null) {
    window.clearTimeout(autoOpenTimer.value)
    autoOpenTimer.value = null
  }
}

function getLocalDateKey(date = new Date()): string {
  const timezoneOffsetMs = date.getTimezoneOffset() * 60 * 1000
  return new Date(date.getTime() - timezoneOffsetMs).toISOString().slice(0, 10)
}

function readDismissState(): SponsorAdDismissState {
  const state = loadFromLocalStorage<SponsorAdDismissState>(STORAGE_KEY)
  if (!state || typeof state !== 'object') {
    return {}
  }
  return state
}

function shouldAutoOpen(): boolean {
  if (!adContent.value.markdown.trim() && !adContent.value.html?.trim()) {
    return false
  }

  const state = readDismissState()
  const currentVersion = getContentVersion()
  if (state.contentVersion !== currentVersion) {
    return true
  }

  if (state.foreverClosed) {
    return false
  }

  return state.closedDate !== getLocalDateKey()
}

function persistDismissState(nextState: SponsorAdDismissState): void {
  saveToLocalStorage(STORAGE_KEY, {
    ...nextState,
    contentVersion: getContentVersion()
  })
}

async function openSponsorAd(): Promise<void> {
  modalOpen.value = true
}

function closeModal(): void {
  modalOpen.value = false
}

function closeToday(): void {
  const state = readDismissState()
  persistDismissState({
    ...state,
    closedDate: getLocalDateKey(),
    closedAt: new Date().toISOString(),
    foreverClosed: false
  })
  closeModal()
}

function closeForever(): void {
  const state = readDismissState()
  persistDismissState({
    ...state,
    foreverClosed: true,
    foreverClosedAt: new Date().toISOString()
  })
  closeModal()
}

watch(
  adContent,
  (content) => {
    clearAutoOpenTimer()

    if (!content.markdown.trim() && !content.html?.trim()) {
      return
    }

    if (!shouldAutoOpen()) {
      return
    }

    autoOpenTimer.value = window.setTimeout(() => {
      modalOpen.value = true
    }, DEFAULT_AUTO_OPEN_DELAY_MS)
  },
  { immediate: true }
)

onBeforeUnmount(() => {
  clearAutoOpenTimer()
})

defineExpose({
  openSponsorAd
})
</script>

<style>
.sponsor-ad-modal-shell .ant-modal-content {
  overflow: hidden;
  padding: 0 !important;
}

.sponsor-ad-modal-shell .ant-modal-body {
  padding: 24px !important;
}

@media (max-width: 768px) {
  .sponsor-ad-modal-shell .ant-modal-body {
    padding: 20px !important;
  }
}
</style>

<style scoped>
.sponsor-ad-modal {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 20px;
  max-height: calc(100vh - 72px);
  overflow-y: auto;
  padding: 0;
  background: var(--bg-primary);
  color: var(--text-primary);
}

.sponsor-ad-intro {
  --sponsor-ad-title-size: 24px;
  --sponsor-ad-title-line-height: 1.25;
  --sponsor-ad-intro-icon-size: calc(var(--sponsor-ad-title-size) * var(--sponsor-ad-title-line-height));
  display: grid;
  grid-template-columns: var(--sponsor-ad-intro-icon-size) 1fr;
  column-gap: 14px;
  align-items: start;
  padding-right: 56px;
}

.sponsor-ad-intro-copy {
  min-width: 0;
}

.sponsor-ad-close {
  position: absolute;
  top: 18px;
  right: 18px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border: 1px solid var(--border-color);
  border-radius: 50%;
  background: var(--bg-primary);
  color: var(--text-secondary);
  cursor: pointer;
  transition: var(--transition);
}

.sponsor-ad-close:hover,
.sponsor-ad-close:focus-visible {
  border-color: var(--primary-color);
  background: var(--surface-hover);
  color: var(--primary-color);
  box-shadow: var(--primary-shadow-sm);
}

.sponsor-ad-close .material-icons {
  width: 1em;
  height: 1em;
  overflow: hidden;
  font-size: 22px;
  line-height: 1;
}

.sponsor-ad-intro-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--sponsor-ad-intro-icon-size);
  height: var(--sponsor-ad-intro-icon-size);
  overflow: hidden;
  border: 1px solid var(--primary-border);
  border-radius: 50%;
  background: var(--primary-soft);
  color: var(--primary-color);
  font-size: calc(var(--sponsor-ad-title-size) * 0.72);
  line-height: 1;
}

.sponsor-ad-title {
  margin: 0;
  color: var(--text-primary);
  font-size: var(--sponsor-ad-title-size);
  font-weight: 800;
  line-height: var(--sponsor-ad-title-line-height);
}

.sponsor-ad-copy {
  color: inherit;
  overflow-x: auto;
}

.assistant-md {
  min-width: 0;
  white-space: normal;
}

.assistant-md :deep(pre) {
  margin: 0 0 0.75em;
  padding: 10px 12px;
  border-radius: 10px;
  overflow-x: auto;
  font-size: 0.9em;
  line-height: 1.5;
}

.assistant-md :deep(pre code) {
  background: transparent;
  padding: 0;
  font-size: inherit;
}

.assistant-md :deep(code) {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.9em;
  padding: 0.15em 0.4em;
  border-radius: 6px;
  background: rgba(100, 116, 139, 0.12);
}

.assistant-md :deep(img) {
  display: block;
  max-width: 100%;
  width: auto;
  height: auto;
}

.sponsor-ad-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding-top: 14px;
  border-top: 1px solid var(--border-color);
}

.sponsor-ad-primary,
.sponsor-ad-secondary {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 40px;
  padding: 0 16px;
  border-radius: var(--radius-md);
  font-size: 14px;
  font-weight: 750;
  cursor: pointer;
  transition: var(--transition);
}

.sponsor-ad-secondary {
  border: 1px solid var(--border-color);
  background: var(--bg-primary);
  color: var(--text-primary);
}

.sponsor-ad-secondary:hover,
.sponsor-ad-secondary:focus-visible {
  border-color: var(--primary-color);
  background: var(--surface-hover);
  color: var(--primary-color);
}

.sponsor-ad-primary {
  border: 1px solid var(--primary-color);
  background: var(--primary-color);
  color: #fff;
}

.sponsor-ad-primary:hover,
.sponsor-ad-primary:focus-visible {
  border-color: var(--primary-hover);
  background: var(--primary-hover);
}

.sponsor-ad-primary .material-icons,
.sponsor-ad-secondary .material-icons {
  flex: 0 0 18px;
  width: 18px;
  height: 18px;
  overflow: hidden;
  font-size: 18px;
  line-height: 1;
}

@media (max-width: 768px) {
  :deep(.ant-modal) {
    max-width: calc(100vw - 24px);
  }

  .sponsor-ad-modal {
    gap: 18px;
    max-height: calc(100dvh - 32px);
    padding: 0;
  }

  .sponsor-ad-intro {
    --sponsor-ad-title-size: 19px;
    --sponsor-ad-title-line-height: 1.3;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 14px;
    padding-right: 0;
  }

  .sponsor-ad-intro-icon {
    width: 36px;
    height: 36px;
    font-size: calc(var(--sponsor-ad-title-size) * 0.74);
  }

  .sponsor-ad-close {
    top: 0;
    right: 0;
    width: 38px;
    height: 38px;
  }

  .sponsor-ad-title {
    font-size: var(--sponsor-ad-title-size);
  }

  .sponsor-ad-copy {
    overflow-x: auto;
  }

  .sponsor-ad-actions {
    flex-direction: row;
    flex-wrap: wrap;
    align-items: center;
    justify-content: flex-end;
    gap: 8px;
  }

  .sponsor-ad-primary,
  .sponsor-ad-secondary {
    width: auto;
    min-width: 112px;
    min-height: 38px;
    padding: 0 12px;
    white-space: nowrap;
  }
}
</style>
