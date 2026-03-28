export function normalizeWhitespace(value: string | number | boolean | null | undefined): string {
  return String(value ?? '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim()
}

export function compactMultiline(value: string): string {
  return value
    .split('\n')
    .map((line) => normalizeWhitespace(line))
    .filter(Boolean)
    .join('\n')
}

export function toExcerpt(value: string, maxLength = 220): string {
  const normalized = normalizeWhitespace(value)
  if (normalized.length <= maxLength) {
    return normalized
  }

  return `${normalized.slice(0, maxLength - 1).trim()}…`
}

export function uniqueValues<T>(values: T[]): T[] {
  return Array.from(new Set(values))
}

export function chunkArray<T>(items: T[], size: number): T[][] {
  if (size <= 0) {
    throw new Error('chunk size must be positive')
  }

  const chunks: T[][] = []
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size))
  }

  return chunks
}

export function safeJsonParse<T>(value: string): T | null {
  try {
    return JSON.parse(value) as T
  } catch {
    return null
  }
}

export function extractJsonObject(value: string): string | null {
  const codeBlockMatch = value.match(/```json\s*([\s\S]*?)\s*```/i)
  if (codeBlockMatch) {
    return codeBlockMatch[1].trim()
  }

  const start = value.indexOf('{')
  const end = value.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) {
    return null
  }

  return value.slice(start, end + 1)
}
