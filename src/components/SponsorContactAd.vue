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

      <div class="sponsor-ad-copy assistant-md" data-testid="sponsor-ad-markdown" v-html="renderedMarkdown"></div>

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
import { renderAssistantMarkdown } from '@/utils/assistantMarkdown'
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
const hasAnnouncementBody = computed(() => adContent.value.markdown.trim().length > 0)
const renderedMarkdown = computed(() => renderAssistantMarkdown(hasAnnouncementBody.value ? adContent.value.markdown : EMPTY_NOTICE_MARKDOWN))

function getContentVersion(): string {
  return adContent.value.updatedAt?.trim() || `${adContent.value.title}\n${adContent.value.markdown}`
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
  if (!hasAnnouncementBody.value) {
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

    if (!content.markdown.trim() || !shouldAutoOpen()) {
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
  font-size: 22px;
}

.sponsor-ad-intro-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--sponsor-ad-intro-icon-size);
  height: var(--sponsor-ad-intro-icon-size);
  border: 1px solid var(--primary-border);
  border-radius: 50%;
  background: var(--primary-soft);
  color: var(--primary-color);
  font-size: calc(var(--sponsor-ad-title-size) * 0.72);
}

.sponsor-ad-title {
  margin: 0;
  color: var(--text-primary);
  font-size: var(--sponsor-ad-title-size);
  font-weight: 800;
  line-height: var(--sponsor-ad-title-line-height);
}

.sponsor-ad-copy {
  color: var(--text-secondary);
  font-size: 14px;
  line-height: 1.7;
}

.assistant-md {
  min-width: 0;
  white-space: normal;
}

.assistant-md :deep(h1),
.assistant-md :deep(h2),
.assistant-md :deep(h3),
.assistant-md :deep(h4) {
  margin: 1em 0 0.5em;
  font-weight: 700;
  line-height: 1.35;
  color: var(--text-primary);
}

.assistant-md :deep(h1) {
  font-size: 1.25em;
}

.assistant-md :deep(h2) {
  font-size: 1.15em;
}

.assistant-md :deep(h3),
.assistant-md :deep(h4) {
  font-size: 1.05em;
}

.assistant-md :deep(h1:first-child),
.assistant-md :deep(h2:first-child),
.assistant-md :deep(h3:first-child),
.assistant-md :deep(h4:first-child) {
  margin-top: 0;
}

.assistant-md :deep(p) {
  margin: 0 0 0.75em;
  text-align: left;
}

.assistant-md :deep(p:last-child) {
  margin-bottom: 0;
}

.assistant-md :deep(ul),
.assistant-md :deep(ol) {
  margin: 0 0 0.75em;
  padding-left: 1.35em;
}

.assistant-md :deep(li) {
  margin: 0.25em 0;
}

.assistant-md :deep(li > p) {
  margin: 0;
}

.assistant-md :deep(blockquote) {
  margin: 0 0 0.75em;
  padding: 8px 12px;
  border-left: 3px solid rgba(100, 116, 139, 0.35);
  background: rgba(100, 116, 139, 0.06);
  color: var(--text-secondary);
}

.assistant-md :deep(pre) {
  margin: 0 0 0.75em;
  padding: 10px 12px;
  border-radius: 10px;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-light);
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

.assistant-md :deep(a) {
  color: var(--primary-color);
  text-decoration: underline;
  text-underline-offset: 2px;
}

.assistant-md :deep(hr) {
  margin: 0.75em 0;
  border: none;
  border-top: 1px solid var(--border-light);
}

.assistant-md :deep(table) {
  width: 100%;
  max-width: 100%;
  border-collapse: collapse;
  margin: 0 0 0.75em;
  font-size: 0.9em;
  display: table;
  table-layout: auto;
}

.assistant-md :deep(th),
.assistant-md :deep(td) {
  border: 1px solid var(--border-color);
  text-align: center;
}

.assistant-md :deep(th) {
  padding: 6px 8px;
  background: var(--bg-tertiary);
}

.assistant-md :deep(td) {
  padding: 0;
  vertical-align: middle;
}

.assistant-md :deep(th > p),
.assistant-md :deep(td > p) {
  margin: 0;
}

.assistant-md :deep(img) {
  display: block;
  max-width: min(100%, 240px);
  width: auto;
  height: auto;
  margin-inline: auto;
  border-radius: var(--radius-md);
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
  font-size: 18px;
}

@media (max-width: 768px) {
  :deep(.ant-modal) {
    max-width: calc(100vw - 24px);
  }

  .sponsor-ad-modal {
    gap: 18px;
    max-height: calc(100vh - 32px);
    padding: 0;
  }

  .sponsor-ad-intro {
    --sponsor-ad-title-size: 19px;
    --sponsor-ad-title-line-height: 1.3;
    column-gap: 12px;
    padding-right: 44px;
  }

  .sponsor-ad-intro-icon {
    font-size: calc(var(--sponsor-ad-title-size) * 0.74);
  }

  .sponsor-ad-close {
    top: 16px;
    right: 14px;
    width: 38px;
    height: 38px;
  }

  .sponsor-ad-title {
    font-size: var(--sponsor-ad-title-size);
  }

  .sponsor-ad-copy {
    font-size: 14px;
    line-height: 1.7;
  }

  .sponsor-ad-actions {
    flex-direction: column;
  }

  .sponsor-ad-primary,
  .sponsor-ad-secondary {
    width: 100%;
  }
}
</style>
