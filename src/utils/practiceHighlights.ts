import type { PracticeHighlightRecord } from '@/types/readingNative'

export const HIGHLIGHT_NODE_PATH_ATTR = 'data-highlight-node-path'
export const HIGHLIGHT_SEGMENT_START_ATTR = 'data-highlight-segment-start'
export const HIGHLIGHT_SEGMENT_END_ATTR = 'data-highlight-segment-end'

const HIGHLIGHT_LOOSE_MIN_LEN = 4

export interface HighlightSegment {
  text: string
  highlight: boolean
  startOffset: number
  endOffset: number
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function finiteNumber(value: unknown): number | null {
  const next = Number(value)
  return Number.isFinite(next) ? next : null
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function normalizePath(value: unknown): string {
  return stringValue(value)
}

function hashString(value: string): string {
  let hash = 0
  for (let i = 0; i < value.length; i += 1) {
    hash = ((hash << 5) - hash + value.charCodeAt(i)) >>> 0
  }
  return hash.toString(36)
}

export function normalizeHighlightText(value: unknown): string {
  return stringValue(value).replace(/\s+/g, ' ')
}

export function hasRangeAnchor(record: PracticeHighlightRecord | null | undefined): boolean {
  return Boolean(
    record
      && normalizePath(record.startPath)
      && normalizePath(record.endPath)
      && finiteNumber(record.startOffset) != null
      && finiteNumber(record.endOffset) != null
  )
}

export function compareHighlightPaths(leftRaw: string, rightRaw: string): number {
  const left = leftRaw.split('.').map((entry) => Number(entry))
  const right = rightRaw.split('.').map((entry) => Number(entry))

  if (left.some((entry) => !Number.isFinite(entry)) || right.some((entry) => !Number.isFinite(entry))) {
    return leftRaw.localeCompare(rightRaw)
  }

  const maxLen = Math.max(left.length, right.length)
  for (let index = 0; index < maxLen; index += 1) {
    const leftPart = left[index]
    const rightPart = right[index]
    if (leftPart == null) return -1
    if (rightPart == null) return 1
    if (leftPart !== rightPart) {
      return leftPart - rightPart
    }
  }
  return 0
}

export function buildPracticeHighlightId(record: Pick<PracticeHighlightRecord, 'scope' | 'text' | 'startPath' | 'startOffset' | 'endPath' | 'endOffset'>): string {
  const text = normalizeHighlightText(record.text).toLowerCase()
  if (record.startPath && record.endPath && record.startOffset != null && record.endOffset != null) {
    return `range:${record.scope}:${record.startPath}:${record.startOffset}:${record.endPath}:${record.endOffset}:${hashString(text)}`
  }
  return `legacy:${record.scope}:${hashString(text)}`
}

export function normalizePracticeHighlightRecord(value: unknown): PracticeHighlightRecord | null {
  if (!value || typeof value !== 'object') {
    return null
  }

  const source = value as Partial<PracticeHighlightRecord>
  const scope = source.scope === 'passage' || source.scope === 'questions' ? source.scope : null
  const text = normalizeHighlightText(source.text)

  if (!scope || !text) {
    return null
  }

  const base: PracticeHighlightRecord = { scope, text }

  const startPath = normalizePath(source.startPath)
  const endPath = normalizePath(source.endPath)
  const startOffset = finiteNumber(source.startOffset)
  const endOffset = finiteNumber(source.endOffset)

  if (startPath && endPath && startOffset != null && endOffset != null) {
    let normalizedStartPath = startPath
    let normalizedEndPath = endPath
    let normalizedStartOffset = Math.max(0, Math.floor(startOffset))
    let normalizedEndOffset = Math.max(0, Math.floor(endOffset))

    const order = compareHighlightPaths(normalizedStartPath, normalizedEndPath)
    if (order > 0 || (order === 0 && normalizedStartOffset > normalizedEndOffset)) {
      ;[normalizedStartPath, normalizedEndPath] = [normalizedEndPath, normalizedStartPath]
      ;[normalizedStartOffset, normalizedEndOffset] = [normalizedEndOffset, normalizedStartOffset]
    }

    base.startPath = normalizedStartPath
    base.startOffset = normalizedStartOffset
    base.endPath = normalizedEndPath
    base.endOffset = normalizedEndOffset
  }

  const id = stringValue(source.id) || buildPracticeHighlightId(base)
  return {
    id,
    ...base
  }
}

export function sameHighlightRecord(left: PracticeHighlightRecord | null | undefined, right: PracticeHighlightRecord | null | undefined): boolean {
  if (!left || !right || left.scope !== right.scope) {
    return false
  }

  if (left.id && right.id && left.id === right.id) {
    return true
  }

  if (hasRangeAnchor(left) && hasRangeAnchor(right)) {
    return left.startPath === right.startPath
      && left.startOffset === right.startOffset
      && left.endPath === right.endPath
      && left.endOffset === right.endOffset
  }

  return normalizeHighlightText(left.text).toLowerCase() === normalizeHighlightText(right.text).toLowerCase()
}

export function findMatchingHighlightRecord(
  highlights: PracticeHighlightRecord[],
  candidate: PracticeHighlightRecord | null | undefined
): PracticeHighlightRecord | null {
  if (!candidate) {
    return null
  }
  return highlights.find((entry) => sameHighlightRecord(entry, candidate)) || null
}

export function createRangeHighlightRecord(input: Pick<PracticeHighlightRecord, 'scope' | 'text' | 'startPath' | 'startOffset' | 'endPath' | 'endOffset'>): PracticeHighlightRecord | null {
  return normalizePracticeHighlightRecord(input)
}

function isIdCharAt(text: string, index: number): boolean {
  const char = text[index]
  if (char === undefined) {
    return false
  }
  if (/[\p{L}\p{N}]/u.test(char)) {
    return true
  }
  if ((char === '-' || char === "'") && index > 0 && index < text.length - 1) {
    return isIdCharAt(text, index - 1) && isIdCharAt(text, index + 1)
  }
  return false
}

function expandRangeToWordEdges(text: string, start: number, end: number): [number, number] {
  let normalizedStart = start
  let normalizedEnd = end

  while (normalizedStart > 0 && isIdCharAt(text, normalizedStart - 1)) {
    normalizedStart -= 1
  }
  while (normalizedEnd < text.length && isIdCharAt(text, normalizedEnd)) {
    normalizedEnd += 1
  }

  return [normalizedStart, normalizedEnd]
}

function mergeIntervals(intervals: Array<[number, number]>): Array<[number, number]> {
  if (!intervals.length) {
    return []
  }

  const sorted = [...intervals].sort((left, right) => left[0] - right[0])
  const output: Array<[number, number]> = [[sorted[0]![0], sorted[0]![1]]]

  for (let index = 1; index < sorted.length; index += 1) {
    const [currentStart, currentEnd] = sorted[index]!
    const previous = output[output.length - 1]!
    if (currentStart <= previous[1]) {
      previous[1] = Math.max(previous[1], currentEnd)
    } else {
      output.push([currentStart, currentEnd])
    }
  }

  return output
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function collectLegacyMatchIntervals(text: string, rawTerm: string): Array<[number, number]> {
  const term = normalizeHighlightText(rawTerm)
  if (!term) {
    return []
  }

  const normalizedTerm = term.toLowerCase()
  const intervals: Array<[number, number]> = []
  const matcher = new RegExp(escapeRegExp(term), 'gi')
  let match: RegExpExecArray | null

  while ((match = matcher.exec(text)) !== null) {
    const matched = match[0]
    const index = match.index
    if (!matched || index === undefined) {
      continue
    }

    if (normalizedTerm.length < HIGHLIGHT_LOOSE_MIN_LEN) {
      intervals.push([index, index + matched.length])
      continue
    }

    intervals.push(expandRangeToWordEdges(text, index, index + matched.length))
  }

  return intervals
}

function collectRangeIntervalForNode(
  nodePath: string,
  textLength: number,
  record: PracticeHighlightRecord
): [number, number] | null {
  if (!hasRangeAnchor(record) || record.startOffset == null || record.endOffset == null || !record.startPath || !record.endPath) {
    return null
  }

  const startOrder = compareHighlightPaths(nodePath, record.startPath)
  const endOrder = compareHighlightPaths(nodePath, record.endPath)
  if (startOrder < 0 || endOrder > 0) {
    return null
  }

  const start = nodePath === record.startPath ? clamp(record.startOffset, 0, textLength) : 0
  const end = nodePath === record.endPath ? clamp(record.endOffset, 0, textLength) : textLength

  if (end <= start) {
    return null
  }

  return [start, end]
}

export function buildHighlightSegments(
  text: string,
  nodePath: string,
  highlights: PracticeHighlightRecord[]
): HighlightSegment[] {
  if (!text.length) {
    return [{ text, highlight: false, startOffset: 0, endOffset: 0 }]
  }

  const rawIntervals: Array<[number, number]> = []
  for (const highlight of highlights) {
    if (hasRangeAnchor(highlight)) {
      const interval = collectRangeIntervalForNode(nodePath, text.length, highlight)
      if (interval) {
        rawIntervals.push(interval)
      }
      continue
    }

    rawIntervals.push(...collectLegacyMatchIntervals(text, highlight.text))
  }

  const merged = mergeIntervals(
    rawIntervals
      .map(([start, end]) => [clamp(start, 0, text.length), clamp(end, 0, text.length)] as [number, number])
      .filter(([start, end]) => end > start)
  )

  if (!merged.length) {
    return [{ text, highlight: false, startOffset: 0, endOffset: text.length }]
  }

  const segments: HighlightSegment[] = []
  let position = 0

  for (const [highlightStart, highlightEnd] of merged) {
    if (position < highlightStart) {
      segments.push({
        text: text.slice(position, highlightStart),
        highlight: false,
        startOffset: position,
        endOffset: highlightStart
      })
    }

    segments.push({
      text: text.slice(highlightStart, highlightEnd),
      highlight: true,
      startOffset: highlightStart,
      endOffset: highlightEnd
    })
    position = highlightEnd
  }

  if (position < text.length) {
    segments.push({
      text: text.slice(position),
      highlight: false,
      startOffset: position,
      endOffset: text.length
    })
  }

  return segments
}

function parseSegmentMeta(segment: HTMLElement): { path: string; start: number; end: number } | null {
  const path = segment.getAttribute(HIGHLIGHT_NODE_PATH_ATTR) || ''
  const start = Number(segment.getAttribute(HIGHLIGHT_SEGMENT_START_ATTR))
  const end = Number(segment.getAttribute(HIGHLIGHT_SEGMENT_END_ATTR))
  if (!path || !Number.isFinite(start) || !Number.isFinite(end)) {
    return null
  }
  return {
    path,
    start,
    end
  }
}

function resolveBoundaryOffset(
  boundaryContainer: Node,
  boundaryOffset: number,
  segment: HTMLElement,
  fallback: 'start' | 'end'
): number {
  const meta = parseSegmentMeta(segment)
  if (!meta) {
    return 0
  }

  if (boundaryContainer === segment) {
    return boundaryOffset <= 0 ? meta.start : meta.end
  }

  if (boundaryContainer.nodeType === Node.TEXT_NODE && segment.contains(boundaryContainer)) {
    const textLength = boundaryContainer.textContent?.length ?? 0
    return clamp(meta.start + boundaryOffset, meta.start, meta.start + textLength)
  }

  return fallback === 'start' ? meta.start : meta.end
}

export function createSelectionHighlightRecord(
  scope: PracticeHighlightRecord['scope'],
  range: Range,
  root: HTMLElement
): PracticeHighlightRecord | null {
  const text = normalizeHighlightText(range.toString())
  if (!text) {
    return null
  }

  const segments = Array.from(
    root.querySelectorAll<HTMLElement>(`[${HIGHLIGHT_NODE_PATH_ATTR}]`)
  ).filter((segment) => {
    if (!segment.textContent) {
      return false
    }
    try {
      return range.intersectsNode(segment)
    } catch {
      return false
    }
  })

  if (!segments.length) {
    return null
  }

  const first = segments[0]!
  const last = segments[segments.length - 1]!
  const firstMeta = parseSegmentMeta(first)
  const lastMeta = parseSegmentMeta(last)

  if (!firstMeta || !lastMeta) {
    return null
  }

  const startOffset = resolveBoundaryOffset(range.startContainer, range.startOffset, first, 'start')
  const endOffset = resolveBoundaryOffset(range.endContainer, range.endOffset, last, 'end')

  return createRangeHighlightRecord({
    scope,
    text,
    startPath: firstMeta.path,
    startOffset,
    endPath: lastMeta.path,
    endOffset
  })
}
