import { describe, expect, it } from 'vitest'
import { isLegacySiteHost, shouldShowMigrationNotice } from './siteMigration'

describe('site migration notice', () => {
  it('shows on the legacy Vercel hostname', () => {
    expect(isLegacySiteHost('ielts-reading-past-papers.vercel.app')).toBe(true)
    expect(shouldShowMigrationNotice({ hostname: 'ielts-reading-past-papers.vercel.app' })).toBe(true)
  })

  it('stays hidden on the new site and local development hosts', () => {
    expect(isLegacySiteHost('ielts.ttop5.cc')).toBe(false)
    expect(isLegacySiteHost('localhost')).toBe(false)
    expect(isLegacySiteHost('127.0.0.1')).toBe(false)
    expect(shouldShowMigrationNotice({ hostname: 'ielts.ttop5.cc' })).toBe(false)
    expect(shouldShowMigrationNotice({ hostname: 'localhost' })).toBe(false)
    expect(shouldShowMigrationNotice({ hostname: '127.0.0.1' })).toBe(false)
  })
})
