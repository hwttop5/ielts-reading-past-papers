export const LEGACY_SITE_HOST = 'ielts-reading-past-papers.vercel.app'
export const NEW_SITE_URL = 'https://ielts.ttop5.cc'

export function isLegacySiteHost(hostname: string | null | undefined): boolean {
  return (hostname ?? '').toLowerCase() === LEGACY_SITE_HOST
}

export function shouldShowMigrationNotice(
  locationLike: Pick<Location, 'hostname'> | undefined = typeof window !== 'undefined' ? window.location : undefined
): boolean {
  return isLegacySiteHost(locationLike?.hostname)
}
