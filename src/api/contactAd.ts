import { getAssistantApiBaseUrl } from '@/api/assistant'
import type { ContactAdPayload } from '@/types/contactAd'

const HIDDEN_CONTACT_AD: ContactAdPayload = { enabled: false }

function buildApiUrl(path: string): string {
  const base = getAssistantApiBaseUrl()
  return base ? `${base}${path}` : path
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function toTrimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeContactAdPayload(value: unknown): ContactAdPayload {
  if (!isRecord(value) || value.enabled !== true) {
    return HIDDEN_CONTACT_AD
  }

  const title = toTrimmedString(value.title)
  const markdown = toTrimmedString(value.markdown)
  const updatedAt = toTrimmedString(value.updatedAt)

  if (!title || !markdown) {
    return HIDDEN_CONTACT_AD
  }

  return {
    enabled: true,
    title,
    markdown,
    updatedAt: updatedAt || undefined
  }
}

export async function loadContactAdConfig(): Promise<ContactAdPayload> {
  try {
    const response = await fetch(buildApiUrl('/api/contact-ad'), {
      cache: 'no-store'
    })

    if (!response.ok) {
      return HIDDEN_CONTACT_AD
    }

    return normalizeContactAdPayload(await response.json())
  } catch {
    return HIDDEN_CONTACT_AD
  }
}
