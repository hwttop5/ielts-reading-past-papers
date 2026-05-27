export interface EnabledContactAdPayload {
  enabled: true
  title: string
  markdown: string
  updatedAt?: string
}

export type ContactAdPayload = { enabled: false } | EnabledContactAdPayload

export function isEnabledContactAd(value: ContactAdPayload | null | undefined): value is EnabledContactAdPayload {
  return value?.enabled === true
}
