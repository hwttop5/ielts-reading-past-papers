import { getAssistantApiBaseUrl } from '@/api/assistant'
import type { ContactAdPayload } from '@/types/contactAd'

const EMPTY_CONTACT_AD: ContactAdPayload = {
  title: '消息通知',
  markdown: ''
}

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
  if (!isRecord(value)) {
    return EMPTY_CONTACT_AD
  }

  const title = toTrimmedString(value.title)
  const markdown = typeof value.markdown === 'string' ? value.markdown.replace(/^\uFEFF/, '') : ''
  const updatedAt = toTrimmedString(value.updatedAt)

  return {
    title: title || EMPTY_CONTACT_AD.title,
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
      return EMPTY_CONTACT_AD
    }

    return normalizeContactAdPayload(await response.json())
  } catch {
    return EMPTY_CONTACT_AD
  }
}
