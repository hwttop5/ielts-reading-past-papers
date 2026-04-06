import { createHash } from 'node:crypto'

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/**
 * Qdrant REST API accepts point ids that are unsigned integers or UUIDs.
 * Map stable string keys (e.g. chunk ids) to deterministic UUIDs.
 */
export function toQdrantPointId(raw: string): string {
  if (UUID_RE.test(raw.trim())) {
    return raw.trim()
  }
  const h = createHash('sha256').update(raw, 'utf8').digest()
  const b = new Uint8Array(h.buffer, h.byteOffset, 16)
  b[6] = (b[6]! & 0x0f) | 0x40
  b[8] = (b[8]! & 0x3f) | 0x80
  const hex = [...b].map((x) => x.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`
}
