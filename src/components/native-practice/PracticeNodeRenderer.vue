<template>
  <template v-for="(node, index) in nodes" :key="nodeKey(node, index)">
    <template v-if="node.type === 'text'">
      <template v-for="(segment, segmentIndex) in highlightSegments(node.text)" :key="`${nodeKey(node, index)}-${segmentIndex}`">
        <mark v-if="segment.highlight" class="native-highlight">{{ segment.text }}</mark>
        <span v-else>{{ segment.text }}</span>
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
        :highlight-terms="highlightTerms"
        :used-option-values="usedOptionValues"
        @update:text="emit('update:text', $event.questionId, $event.value)"
        @update:textarea="emit('update:textarea', $event.questionId, $event.value)"
        @update:select="emit('update:select', $event.questionId, $event.value)"
        @toggle:choice="emit('toggle:choice', $event)"
        @select:option="emit('select:option', $event)"
        @set:dropzone="emit('set:dropzone', $event)"
        @clear:dropzone="emit('clear:dropzone', $event)"
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
      :draggable="!readOnly"
      :disabled="readOnly"
      @click="emit('select:option', node)"
      @dragstart="handleOptionDragStart(node, $event)"
    >
      {{ node.label || node.value }}
    </button>
  </template>
</template>

<script setup lang="ts">
import { canonicalizeAnswerToken } from '@/utils/readingPractice'
import type {
  HighlightScope,
  PracticeDraftState,
  ReadingAstNode,
  ReadingChoiceInputNode,
  ReadingDropzoneNode,
  ReadingElementNode,
  ReadingOptionChipNode
} from '@/types/readingNative'

defineOptions({ name: 'PracticeNodeRenderer' })

interface HighlightSegment {
  text: string
  highlight: boolean
}

const props = defineProps<{
  nodes: ReadingAstNode[]
  scope: HighlightScope
  draftState: PracticeDraftState
  submitted: boolean
  readOnly: boolean
  selectedOptionKey: string
  highlightTerms: string[]
  usedOptionValues: Record<string, string[]>
}>()

const emit = defineEmits<{
  (e: 'update:text', questionId: string, value: string): void
  (e: 'update:textarea', questionId: string, value: string): void
  (e: 'update:select', questionId: string, value: string): void
  (e: 'toggle:choice', payload: { fieldName: string; inputType: 'radio' | 'checkbox'; value: string; checked: boolean }): void
  (e: 'select:option', payload: ReadingOptionChipNode): void
  (e: 'set:dropzone', payload: { questionId: string; poolId: string; value: string; label: string }): void
  (e: 'clear:dropzone', questionId: string): void
}>()

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

/** Letters/digits; hyphen/apostrophe only when between id chars (compound words). */
function isIdCharAt(text: string, i: number): boolean {
  const c = text[i]
  if (c === undefined) {
    return false
  }
  if (/[\p{L}\p{N}]/u.test(c)) {
    return true
  }
  if ((c === '-' || c === "'") && i > 0 && i < text.length - 1) {
    return isIdCharAt(text, i - 1) && isIdCharAt(text, i + 1)
  }
  return false
}

/** Expand a raw [start,end) match so highlights never begin/end inside a word. */
function expandRangeToWordEdges(text: string, start: number, end: number): [number, number] {
  let s = start
  let e = end
  while (s > 0 && isIdCharAt(text, s - 1)) {
    s--
  }
  while (e < text.length && isIdCharAt(text, e)) {
    e++
  }
  return [s, e]
}

function mergeIntervals(intervals: [number, number][]): [number, number][] {
  if (!intervals.length) {
    return []
  }
  const sorted = [...intervals].sort((a, b) => a[0] - b[0])
  const out: [number, number][] = [[sorted[0]![0], sorted[0]![1]]]
  for (let i = 1; i < sorted.length; i++) {
    const [cs, ce] = sorted[i]!
    const last = out[out.length - 1]!
    if (cs <= last[1]) {
      last[1] = Math.max(last[1], ce)
    } else {
      out.push([cs, ce])
    }
  }
  return out
}

function highlightSegments(text: string): HighlightSegment[] {
  if (!text || !props.highlightTerms || !props.highlightTerms.length) {
    return [{ text, highlight: false }]
  }

  const uniqueTerms = Array.from(new Set(props.highlightTerms.map((term) => term.trim()).filter(Boolean)))
  if (!uniqueTerms.length) {
    return [{ text, highlight: false }]
  }

  const raw: [number, number][] = []
  for (const term of uniqueTerms) {
    const re = new RegExp(escapeRegExp(term), 'gi')
    let m: RegExpExecArray | null
    while ((m = re.exec(text)) !== null) {
      const matched = m[0]
      if (!matched.length) {
        continue
      }
      const idx = m.index
      if (idx === undefined) {
        continue
      }
      raw.push(expandRangeToWordEdges(text, idx, idx + matched.length))
    }
  }

  if (!raw.length) {
    return [{ text, highlight: false }]
  }

  const merged = mergeIntervals(raw)
  const out: HighlightSegment[] = []
  let pos = 0
  for (const [hs, he] of merged) {
    if (pos < hs) {
      out.push({ text: text.slice(pos, hs), highlight: false })
    }
    out.push({ text: text.slice(hs, he), highlight: true })
    pos = he
  }
  if (pos < text.length) {
    out.push({ text: text.slice(pos), highlight: false })
  }
  return out
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
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
}

.native-option-chip.active {
  border-color: var(--primary-color);
  color: var(--primary-color);
  box-shadow: inset 0 0 0 1px rgba(37, 99, 235, 0.16);
}

.native-option-chip.used {
  opacity: 0.58;
}
</style>
