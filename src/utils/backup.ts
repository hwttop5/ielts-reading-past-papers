import { saveToLocalStorage, loadFromLocalStorage } from './storage'

export interface BackupData {
  questions: any[]
  practice: any[]
  settings: any[]
}

export function createBackup(): string {
  const backup: BackupData = {
    questions: loadFromLocalStorage('ielts_questions') || [],
    practice: loadFromLocalStorage('ielts_practice') || [],
    settings: loadFromLocalStorage('ielts_settings') || []
  }
  
  return JSON.stringify(backup, null, 2)
}

export function restoreBackup(backupString: string): boolean {
  try {
    const backup: BackupData = JSON.parse(backupString)
    
    if (backup.questions) {
      saveToLocalStorage('ielts_questions', backup.questions)
    }
    if (backup.practice) {
      saveToLocalStorage('ielts_practice', backup.practice)
    }
    if (backup.settings) {
      saveToLocalStorage('ielts_settings', backup.settings)
    }
    
    return true
  } catch (e) {
    console.error('Failed to restore backup:', e)
    return false
  }
}

export function exportBackup(filename: string = 'ielts-reading-backup.json'): void {
  const backup = createBackup()
  const blob = new Blob([backup], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  
  URL.revokeObjectURL(url)
}
