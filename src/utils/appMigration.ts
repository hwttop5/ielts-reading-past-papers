const STORAGE_SCHEMA_VERSION_KEY = 'ielts_storage_schema_version'
const STORAGE_SCHEMA_VERSION = '2026-04-03-reading-reference-v1'
const LEGACY_KEYS_TO_CLEAR = [
  'ielts_practice',
  'ielts_achievements',
  'ielts_questions',
  'ielts_questions_version'
]

export function runAppMigration() {
  const currentVersion = localStorage.getItem(STORAGE_SCHEMA_VERSION_KEY)
  if (currentVersion === STORAGE_SCHEMA_VERSION) {
    return
  }

  LEGACY_KEYS_TO_CLEAR.forEach((key) => localStorage.removeItem(key))
  localStorage.setItem(STORAGE_SCHEMA_VERSION_KEY, STORAGE_SCHEMA_VERSION)
}
