<template>
  <template v-for="(node, index) in nodes" :key="nodeKey(node, index)">
    <template v-if="node.type === 'text'">
      <template v-for="(segment, segmentIndex) in highlightSegments(node.text, nodePath(index))" :key="`${nodeKey(node, index)}-${segmentIndex}`">
        <mark
          v-if="segment.highlight"
          class="native-highlight"
          :class="{ 'native-highlight-note': Boolean(segment.note) }"
          v-bind="segmentAttrs(nodePath(index), segment)"
          @click="handleHighlightClick(segment, $event)"
        >
          {{ segment.text }}
        </mark>
        <span v-else v-bind="segmentAttrs(nodePath(index), segment)">{{ segment.text }}</span>
      </template>
    </template>

    <component
      :is="node.tag"
      v-else-if="node.type === 'element'"
      v-bind="elementAttrs(node.attrs)"
    >
      <PracticeNodeRenderer
        :nodes="elementChildNodes(node)"
        :scope="scope"
        :draft-state="draftState"
        :submitted="submitted"
        :read-only="readOnly"
        :selected-option-key="selectedOptionKey"
        :highlights="highlights"
        :used-option-values="usedOptionValues"
        :node-path-prefix="nodePath(index)"
        @update:text="(questionId, value) => emit('update:text', questionId, value)"
        @update:textarea="(questionId, value) => emit('update:textarea', questionId, value)"
        @update:select="(questionId, value) => emit('update:select', questionId, value)"
        @toggle:choice="emit('toggle:choice', $event)"
        @select:option="emit('select:option', $event)"
        @set:dropzone="emit('set:dropzone', $event)"
        @clear:dropzone="emit('clear:dropzone', $event)"
        @open:note="emit('open:note', $event)"
      />
    </component>

    <input
      v-else-if="node.type === 'choiceInput'"
      class="native-choice-input"
      :class="[node.inputType, { locked: readOnly }]"
      v-bind="controlAttrs(node.attrs)"
      :type="node.inputType"
      :name="node.fieldName"
      :data-question="node.questionId"
      :data-nav-target="node.questionId"
      :checked="isChoiceChecked(node.fieldName, node.value)"
      :disabled="readOnly"
      @change="handleChoiceChange(node, $event)"
    />

    <input
      v-else-if="node.type === 'textInput'"
      type="text"
      class="native-text-input"
      v-bind="controlAttrs(node.attrs)"
      :data-question="node.questionId"
      :data-nav-target="node.questionId"
      :value="draftState.textAnswers[node.questionId] || ''"
      :disabled="readOnly"
      :placeholder="node.attrs.placeholder || ''"
      @input="emit('update:text', node.questionId, eventValue($event))"
    />

    <textarea
      v-else-if="node.type === 'textarea'"
      class="native-textarea"
      v-bind="controlAttrs(node.attrs)"
      :data-question="node.questionId"
      :data-nav-target="node.questionId"
      :value="draftState.textareaAnswers[node.questionId] || ''"
      :disabled="readOnly"
      :placeholder="node.attrs.placeholder || ''"
      @input="emit('update:textarea', node.questionId, eventValue($event))"
    ></textarea>

    <select
      v-else-if="node.type === 'select'"
      class="native-select"
      v-bind="controlAttrs(node.attrs)"
      :data-question="node.questionId"
      :data-nav-target="node.questionId"
      :value="draftState.selectAnswers[node.questionId] || ''"
      :disabled="readOnly"
      @change="emit('update:select', node.questionId, eventValue($event))"
    >
      <option
        v-for="option in node.options"
        :key="`${node.questionId}-${option.value}`"
        :value="option.value"
      >
        {{ option.label || option.value }}
      </option>
    </select>

    <div
      v-else-if="node.type === 'dropzone'"
      class="native-dropzone"
      v-bind="controlAttrs(node.attrs)"
      :data-question="node.questionId"
      :data-nav-target="node.questionId"
      :class="[
        `appearance-${node.appearance}`,
        {
          filled: Boolean(dropzoneValue(node.questionId)),
          active: selectedOptionKey && !readOnly
        }
      ]"
      @dragover.prevent
      @drop.prevent="handleDrop(node, $event)"
      @click="handleDropzoneClick(node)"
    >
      <span class="dropzone-main">
        <strong v-if="node.appearance === 'paragraph' && node.paragraph" class="dropzone-prefix">
          {{ node.paragraph }}
        </strong>
        <span class="dropzone-text">
          {{ dropzoneDisplay(node) }}
        </span>
      </span>
      <button
        v-if="dropzoneValue(node.questionId) && !readOnly"
        type="button"
        class="dropzone-clear"
        @click.stop="emit('clear:dropzone', node.questionId)"
      >
        <span class="material-icons">close</span>
      </button>
    </div>

    <button
      v-else-if="node.type === 'optionChip'"
      type="button"
      class="native-option-chip"
      :class="{
        active: selectedOptionKey === optionKey(node.poolId, node.value),
        used: isOptionUsed(node.poolId, node.value)
      }"
      :draggable="!readOnly && nativeDragFallback"
      :disabled="readOnly"
      @click="handleOptionClick(node)"
      @pointerdown="handleOptionPointerDown(node, $event)"
      @pointermove="handleOptionPointerMove"
      @pointerup="handleOptionPointerUp"
      @pointercancel="handleOptionPointerCancel"
      @dragstart="handleOptionDragStart(node, $event)"
    >
      {{ node.label || node.value }}
    </button>
  </template>
</template>

<script setup lang="ts">
import { onBeforeUnmount } from 'vue'
import { canonicalizeAnswerToken } from '@/utils/readingPractice'
import {
  buildHighlightSegments,
  HIGHLIGHT_NODE_PATH_ATTR,
  HIGHLIGHT_SEGMENT_END_ATTR,
  HIGHLIGHT_SEGMENT_START_ATTR,
  type HighlightSegment
} from '@/utils/practiceHighlights'
import type {
  HighlightScope,
  PracticeDraftState,
  PracticeHighlightRecord,
  ReadingAstNode,
  ReadingChoiceInputNode,
  ReadingDropzoneNode,
  ReadingElementNode,
  ReadingOptionChipNode
} from '@/types/readingNative'

defineOptions({ name: 'PracticeNodeRenderer' })

const props = defineProps<{
  nodes: ReadingAstNode[]
  scope: HighlightScope
  draftState: PracticeDraftState
  submitted: boolean
  readOnly: boolean
  selectedOptionKey: string
  highlights: PracticeHighlightRecord[]
  usedOptionValues: Record<string, string[]>
  nodePathPrefix?: string
}>()

const emit = defineEmits<{
  (e: 'update:text', questionId: string, value: string): void
  (e: 'update:textarea', questionId: string, value: string): void
  (e: 'update:select', questionId: string, value: string): void
  (e: 'toggle:choice', payload: { fieldName: string; inputType: 'radio' | 'checkbox'; value: string; checked: boolean }): void
  (e: 'select:option', payload: ReadingOptionChipNode): void
  (e: 'set:dropzone', payload: { questionId: string; poolId: string; value: string; label: string }): void
  (e: 'clear:dropzone', questionId: string): void
  (e: 'open:note', payload: { record: PracticeHighlightRecord; top: number; left: number }): void
}>()

const DRAG_START_THRESHOLD = 6
const DRAG_SCROLL_EDGE_PX = 72
const DRAG_SCROLL_MAX_STEP = 26
const DRAG_DROP_NEARBY_PX = 96

interface PointerDragState {
  node: ReadingOptionChipNode
  pointerId: number
  startX: number
  startY: number
  currentX: number
  currentY: number
  dragging: boolean
  ghost: HTMLElement | null
  activeDropzone: HTMLElement | null
  sourceElement: HTMLElement | null
  autoScrollPane: HTMLElement | null
  autoScrollStep: number
  autoScrollFrame: number
}

let pointerDrag: PointerDragState | null = null
let suppressClickOptionKey = ''
const nativeDragFallback = typeof window !== 'undefined' && !('PointerEvent' in window)

function nodeKey(node: ReadingAstNode, index: number): string {
  switch (node.type) {
    case 'text':
      return `text-${index}`
    case 'element':
      return `${node.tag}-${node.attrs.id || index}`
    case 'choiceInput':
      return `${node.fieldName}-${node.value}-${index}`
    case 'textInput':
    case 'textarea':
    case 'select':
    case 'dropzone':
      return `${node.questionId}-${index}`
    case 'optionChip':
      return `${node.poolId}-${node.value}-${index}`
    default:
      return `node-${index}`
  }
}

function nodePath(index: number): string {
  return props.nodePathPrefix ? `${props.nodePathPrefix}.${index}` : String(index)
}

function eventValue(event: Event): string {
  return String((event.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement)?.value || '')
}

function elementAttrs(attrs: Record<string, string>): Record<string, string> {
  return attrs
}

/** MCQ 选项容器在 AST 里夹了大量仅含换行/空白的 text 节点；子节点会渲染成 #text/空 span，若父级用 CSS grid 会把每个都当成一格，导致选项错位、看似居中。 */
function shouldStripInterstitialWhitespace(node: ReadingElementNode): boolean {
  const cls = String(node.attrs?.class || '')
  if (node.tag === 'ul' && /\b(options-list|radio-options-list|question-options-list|mcq-options)\b/.test(cls)) {
    return true
  }
  if (node.tag === 'div' && /\b(radio-options|mcq-options|multiple-choice-options|multi-choice-options|checkbox-options)\b/.test(cls)) {
    return true
  }
  if (node.tag === 'div' && /\boptions-pool\b/.test(cls)) {
    return true
  }
  /* 与 options-pool 嵌套：AST 在 optionChip 之间保留缩进换行，flex 会把每个空白 #text 当成一格，首行会整体右移 */
  if (node.tag === 'div' && /\bpool-items\b/.test(cls)) {
    return true
  }
  return false
}

function elementChildNodes(node: ReadingElementNode): ReadingAstNode[] {
  if (!shouldStripInterstitialWhitespace(node)) {
    return node.children
  }
  return node.children.filter((child) => !(child.type === 'text' && !child.text.trim()))
}

function controlAttrs(attrs: Record<string, string>): Record<string, string> {
  const { type, value, checked, selected, draggable, ...rest } = attrs as Record<string, string>
  return rest
}

function optionKey(poolId: string, value: string): string {
  return `${poolId}::${value}`
}

function dropzoneValue(questionId: string) {
  return props.draftState.dropzoneAnswers[questionId] || null
}

function dropzoneDisplay(node: ReadingDropzoneNode): string {
  const current = dropzoneValue(node.questionId)
  if (current) {
    return current.label || current.value
  }
  if (node.appearance === 'paragraph') {
    return node.labelText || 'Choose heading'
  }
  return 'Drop or click option here'
}

function isChoiceChecked(fieldName: string, value: string): boolean {
  const normalized = canonicalizeAnswerToken(value)
  return (props.draftState.choiceGroups[fieldName] || []).some((entry) => canonicalizeAnswerToken(entry) === normalized)
}

function isOptionUsed(poolId: string, value: string): boolean {
  const normalized = canonicalizeAnswerToken(value)
  return (props.usedOptionValues[poolId] || []).some((entry) => canonicalizeAnswerToken(entry) === normalized)
}

function handleOptionClick(node: ReadingOptionChipNode) {
  const key = optionKey(node.poolId, node.value)
  if (suppressClickOptionKey === key) {
    suppressClickOptionKey = ''
    return
  }
  emit('select:option', node)
}

function handleChoiceChange(node: ReadingChoiceInputNode, event: Event) {
  const checked = Boolean((event.target as HTMLInputElement).checked)
  emit('toggle:choice', {
    fieldName: node.fieldName,
    inputType: node.inputType,
    value: node.value,
    checked
  })
}

function handleOptionDragStart(node: ReadingOptionChipNode, event: DragEvent) {
  if (pointerDrag?.node.poolId === node.poolId && pointerDrag.node.value === node.value) {
    event.preventDefault()
    return
  }
  if (!event.dataTransfer) {
    return
  }
  event.dataTransfer.effectAllowed = 'move'
  event.dataTransfer.setData('application/json', JSON.stringify({
    poolId: node.poolId,
    value: node.value,
    label: node.label
  }))
}

function createDragGhost(node: ReadingOptionChipNode, event: PointerEvent): HTMLElement {
  const ghost = document.createElement('div')
  ghost.className = 'native-option-drag-ghost'
  ghost.textContent = node.label || node.value
  document.body.appendChild(ghost)
  moveDragGhost(ghost, event.clientX, event.clientY)
  return ghost
}

function moveDragGhost(ghost: HTMLElement, x: number, y: number) {
  ghost.style.transform = `translate(${Math.round(x + 12)}px, ${Math.round(y + 12)}px)`
}

function findDropzoneAtPoint(x: number, y: number): HTMLElement | null {
  const element = document.elementFromPoint(x, y)
  return element instanceof HTMLElement
    ? element.closest<HTMLElement>('.native-dropzone[data-question]')
    : null
}

function findDropzoneCandidateAtPoint(x: number, y: number): HTMLElement | null {
  const exactDropzone = findDropzoneAtPoint(x, y)
  if (exactDropzone) {
    return exactDropzone
  }

  const pane = findScrollablePracticePane(x, y)
  if (!pane) {
    return null
  }

  const paneRect = pane.getBoundingClientRect()
  let closest: { element: HTMLElement; distance: number } | null = null
  pane.querySelectorAll<HTMLElement>('.native-dropzone[data-question]').forEach((dropzone) => {
    const rect = dropzone.getBoundingClientRect()
    const isVisible = rect.bottom >= paneRect.top && rect.top <= paneRect.bottom
    if (!isVisible) {
      return
    }

    const dx = x < rect.left ? rect.left - x : x > rect.right ? x - rect.right : 0
    const dy = y < rect.top ? rect.top - y : y > rect.bottom ? y - rect.bottom : 0
    const distance = Math.hypot(dx, dy)
    if (distance <= DRAG_DROP_NEARBY_PX && (!closest || distance < closest.distance)) {
      closest = { element: dropzone, distance }
    }
  })

  return closest?.element || null
}

function setActiveDropzone(dropzone: HTMLElement | null) {
  if (!pointerDrag || pointerDrag.activeDropzone === dropzone) {
    return
  }
  pointerDrag.activeDropzone?.classList.remove('drag-over')
  pointerDrag.activeDropzone = dropzone
  pointerDrag.activeDropzone?.classList.add('drag-over')
}

function findScrollablePracticePane(x: number, y: number): HTMLElement | null {
  const directPane = document
    .elementsFromPoint(x, y)
    .find((element) => element instanceof HTMLElement && element.closest('.practice-pane')) as HTMLElement | undefined
  const directMatch = directPane?.closest<HTMLElement>('.practice-pane')
  if (directMatch) {
    return directMatch
  }

  const panes = Array.from(document.querySelectorAll<HTMLElement>('.practice-pane'))
  return panes.find((pane) => {
    const rect = pane.getBoundingClientRect()
    return x >= rect.left
      && x <= rect.right
      && y >= rect.top - DRAG_SCROLL_EDGE_PX
      && y <= rect.bottom + DRAG_SCROLL_EDGE_PX
  }) || null
}

function updateAutoScroll(state: PointerDragState) {
  const pane = findScrollablePracticePane(state.currentX, state.currentY)
  if (!pane) {
    stopAutoScroll(state)
    return
  }

  const rect = pane.getBoundingClientRect()
  let nextStep = 0
  if (state.currentY < rect.top + DRAG_SCROLL_EDGE_PX) {
    const ratio = (rect.top + DRAG_SCROLL_EDGE_PX - state.currentY) / DRAG_SCROLL_EDGE_PX
    nextStep = -Math.ceil(Math.min(1, ratio) * DRAG_SCROLL_MAX_STEP)
  } else if (state.currentY > rect.bottom - DRAG_SCROLL_EDGE_PX) {
    const ratio = (state.currentY - (rect.bottom - DRAG_SCROLL_EDGE_PX)) / DRAG_SCROLL_EDGE_PX
    nextStep = Math.ceil(Math.min(1, ratio) * DRAG_SCROLL_MAX_STEP)
  }

  if (!nextStep) {
    stopAutoScroll(state)
    return
  }

  state.autoScrollPane = pane
  state.autoScrollStep = nextStep
  if (!state.autoScrollFrame) {
    state.autoScrollFrame = window.requestAnimationFrame(runAutoScroll)
  }
}

function stopAutoScroll(state: PointerDragState) {
  if (state.autoScrollFrame) {
    window.cancelAnimationFrame(state.autoScrollFrame)
  }
  state.autoScrollFrame = 0
  state.autoScrollPane = null
  state.autoScrollStep = 0
}

function runAutoScroll() {
  const state = pointerDrag
  if (!state?.dragging || !state.autoScrollPane || !state.autoScrollStep) {
    if (state) {
      stopAutoScroll(state)
    }
    return
  }

  state.autoScrollPane.scrollTop += state.autoScrollStep
  setActiveDropzone(findDropzoneCandidateAtPoint(state.currentX, state.currentY))
  updateAutoScroll(state)
  if (pointerDrag === state && state.autoScrollPane && state.autoScrollStep) {
    state.autoScrollFrame = window.requestAnimationFrame(runAutoScroll)
  }
}

function startPointerDrag(state: PointerDragState, event: PointerEvent) {
  state.dragging = true
  state.ghost = createDragGhost(state.node, event)
  document.body.classList.add('native-option-dragging')
  window.getSelection()?.removeAllRanges()
  setActiveDropzone(findDropzoneCandidateAtPoint(event.clientX, event.clientY))
  updateAutoScroll(state)
}

function handleOptionPointerMove(event: PointerEvent) {
  const state = pointerDrag
  if (!state || event.pointerId !== state.pointerId) {
    return
  }

  state.currentX = event.clientX
  state.currentY = event.clientY
  const deltaX = event.clientX - state.startX
  const deltaY = event.clientY - state.startY

  if (!state.dragging && Math.hypot(deltaX, deltaY) >= DRAG_START_THRESHOLD) {
    startPointerDrag(state, event)
  }

  if (!state.dragging) {
    return
  }

  event.preventDefault()
  if (state.ghost) {
    moveDragGhost(state.ghost, event.clientX, event.clientY)
  }
  setActiveDropzone(findDropzoneCandidateAtPoint(event.clientX, event.clientY))
  updateAutoScroll(state)
}

function cleanupPointerDrag() {
  const state = pointerDrag
  if (state) {
    stopAutoScroll(state)
    state.activeDropzone?.classList.remove('drag-over')
    state.ghost?.remove()
    if (state.sourceElement?.hasPointerCapture?.(state.pointerId)) {
      state.sourceElement.releasePointerCapture(state.pointerId)
    }
  }
  pointerDrag = null
  document.body.classList.remove('native-option-dragging')
  window.removeEventListener('pointermove', handleOptionPointerMove)
  window.removeEventListener('pointerup', handleOptionPointerUp)
  window.removeEventListener('pointercancel', handleOptionPointerCancel)
}

function handleOptionPointerUp(event: PointerEvent) {
  const state = pointerDrag
  if (!state || event.pointerId !== state.pointerId) {
    return
  }

  if (state.dragging) {
    event.preventDefault()
    const dropzone = findDropzoneCandidateAtPoint(event.clientX, event.clientY)
    const questionId = dropzone?.dataset.question || ''
    if (questionId && !props.readOnly) {
      emit('set:dropzone', {
        questionId,
        poolId: state.node.poolId,
        value: state.node.value,
        label: state.node.label || state.node.value
      })
    }
    suppressClickOptionKey = optionKey(state.node.poolId, state.node.value)
    window.setTimeout(() => {
      suppressClickOptionKey = ''
    }, 0)
  }

  cleanupPointerDrag()
}

function handleOptionPointerCancel(event: PointerEvent) {
  if (pointerDrag && event.pointerId === pointerDrag.pointerId) {
    cleanupPointerDrag()
  }
}

function handleOptionPointerDown(node: ReadingOptionChipNode, event: PointerEvent) {
  if (props.readOnly || event.button !== 0 || event.isPrimary === false) {
    return
  }
  cleanupPointerDrag()
  pointerDrag = {
    node,
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    currentX: event.clientX,
    currentY: event.clientY,
    dragging: false,
    ghost: null,
    activeDropzone: null,
    sourceElement: event.currentTarget instanceof HTMLElement ? event.currentTarget : null,
    autoScrollPane: null,
    autoScrollStep: 0,
    autoScrollFrame: 0
  }
  pointerDrag.sourceElement?.setPointerCapture?.(event.pointerId)
  window.addEventListener('pointermove', handleOptionPointerMove, { passive: false })
  window.addEventListener('pointerup', handleOptionPointerUp, { passive: false })
  window.addEventListener('pointercancel', handleOptionPointerCancel, { passive: false })
}

function handleDrop(node: ReadingDropzoneNode, event: DragEvent) {
  const payload = event.dataTransfer?.getData('application/json')
  if (!payload || props.readOnly) {
    return
  }
  try {
    const parsed = JSON.parse(payload) as { poolId: string; value: string; label: string }
    if (!parsed.value) {
      return
    }
    emit('set:dropzone', {
      questionId: node.questionId,
      poolId: parsed.poolId || '',
      value: parsed.value,
      label: parsed.label || parsed.value
    })
  } catch {
    // Ignore malformed drag data.
  }
}

function handleDropzoneClick(node: ReadingDropzoneNode) {
  if (!props.selectedOptionKey || props.readOnly) {
    return
  }
  const separatorIndex = props.selectedOptionKey.indexOf('::')
  if (separatorIndex < 0) {
    return
  }
  const poolId = props.selectedOptionKey.slice(0, separatorIndex)
  const value = props.selectedOptionKey.slice(separatorIndex + 2)
  emit('set:dropzone', {
    questionId: node.questionId,
    poolId,
    value,
    label: value
  })
}

function segmentAttrs(path: string, segment: HighlightSegment): Record<string, string> {
  const attrs: Record<string, string> = {
    [HIGHLIGHT_NODE_PATH_ATTR]: path,
    [HIGHLIGHT_SEGMENT_START_ATTR]: String(segment.startOffset),
    [HIGHLIGHT_SEGMENT_END_ATTR]: String(segment.endOffset)
  }
  if (segment.highlightId) {
    attrs['data-highlight-id'] = segment.highlightId
  }
  if (segment.note) {
    attrs['data-highlight-note'] = 'true'
  }
  return attrs
}

function highlightSegments(text: string, path: string): HighlightSegment[] {
  return buildHighlightSegments(text, path, props.highlights || [])
}

function handleHighlightClick(segment: HighlightSegment, event: MouseEvent) {
  if (!segment.note || !segment.record) {
    return
  }
  event.stopPropagation()
  emit('open:note', {
    record: segment.record,
    top: event.clientY + 12,
    left: event.clientX + 12
  })
}

onBeforeUnmount(() => {
  cleanupPointerDrag()
})
</script>

<style scoped>
.native-highlight {
  background: rgba(250, 204, 21, 0.32);
  color: inherit;
  padding: 0;
  margin: 0;
  border-radius: 2px;
  line-height: inherit;
  box-decoration-break: clone;
  -webkit-box-decoration-break: clone;
}

/* Radio/checkbox are replaced elements — avoid inline-flex here (breaks vertical alignment vs text). */
.native-highlight-note {
  background: rgba(251, 146, 60, 0.3);
  box-shadow: inset 0 -2px 0 rgba(234, 88, 12, 0.36);
  cursor: pointer;
}

.native-choice-input[type='radio'],
.native-choice-input[type='checkbox'] {
  display: inline-block;
  vertical-align: middle;
  flex-shrink: 0;
  margin: 0;
}

.native-choice-input.locked {
  cursor: default;
}

.native-text-input,
.native-textarea,
.native-select {
  min-width: 120px;
  border: 1px solid var(--border-color);
  border-radius: 10px;
  padding: 8px 10px;
  background: var(--bg-primary);
  color: var(--text-primary);
  font: inherit;
}

.native-textarea {
  min-height: 90px;
  width: 100%;
  resize: vertical;
}

.native-dropzone {
  display: inline-flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  min-width: 120px;
  min-height: 38px;
  padding: 8px 10px;
  margin: 0 4px;
  border: 2px dashed color-mix(in srgb, var(--primary-color) 65%, var(--border-color));
  border-radius: 12px;
  background: color-mix(in srgb, var(--primary-color) 14%, var(--bg-tertiary));
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--primary-color) 22%, transparent);
  color: var(--text-secondary);
  cursor: pointer;
  vertical-align: baseline;
}

.native-dropzone.filled {
  border-style: solid;
  border-color: color-mix(in srgb, var(--primary-color) 88%, var(--border-color));
  background: color-mix(in srgb, var(--primary-color) 16%, var(--bg-secondary));
  color: var(--text-primary);
}

.native-dropzone.active {
  box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--primary-color) 35%, transparent);
}

.native-dropzone.drag-over {
  border-style: solid;
  border-color: color-mix(in srgb, var(--primary-color) 95%, #fff);
  background: color-mix(in srgb, var(--primary-color) 22%, var(--bg-tertiary));
}

.native-dropzone.appearance-paragraph {
  min-width: 160px;
}

.native-dropzone.appearance-summary {
  min-width: 11rem;
}

.dropzone-main {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.dropzone-prefix {
  font-size: 12px;
  color: var(--primary-color);
}

.dropzone-clear {
  border: none;
  background: transparent;
  color: var(--text-tertiary);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  cursor: pointer;
}

.dropzone-clear .material-icons {
  font-size: 16px;
}

.native-option-chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 36px;
  padding: 8px 12px;
  border-radius: 999px;
  border: 1px solid rgba(15, 23, 42, 0.08);
  background: var(--bg-primary);
  color: var(--text-primary);
  font: inherit;
  cursor: pointer;
  transition: all 0.2s ease;
  touch-action: none;
  user-select: none;
}

.native-option-chip.active {
  border-color: var(--primary-color);
  color: var(--primary-color);
  box-shadow: inset 0 0 0 1px rgba(37, 99, 235, 0.16);
}

.native-option-chip.used {
  opacity: 0.58;
}

:global(.native-option-dragging) {
  cursor: grabbing;
  user-select: none;
}

:global(.native-option-drag-ghost) {
  position: fixed;
  top: 0;
  left: 0;
  z-index: 10000;
  pointer-events: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  max-width: min(360px, 82vw);
  min-height: 36px;
  padding: 8px 12px;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--primary-color) 65%, var(--border-color));
  background: var(--bg-primary);
  color: var(--text-primary);
  box-shadow: 0 16px 34px rgba(15, 23, 42, 0.22);
  opacity: 0.94;
  white-space: nowrap;
}
</style>
