import { saveToLocalStorage, loadFromLocalStorage } from './storage'
import { message } from 'ant-design-vue'

export interface BackupData {
  version: string
  timestamp: number
  localStorage: Record<string, any>
}

const CURRENT_VERSION = '2.0.0'

export function createBackup(): string {
  const localStorageData: Record<string, any> = {}
  
  // 遍历所有 localStorage 的 key
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key && key.startsWith('ielts_')) { // 只备份相关数据
      try {
        const value = localStorage.getItem(key)
        if (value) {
          localStorageData[key] = JSON.parse(value)
        }
      } catch (e) {
        console.warn(`Skipping non-JSON value for key: ${key}`)
      }
    }
  }

  const backup: BackupData = {
    version: CURRENT_VERSION,
    timestamp: Date.now(),
    localStorage: localStorageData
  }
  
  return JSON.stringify(backup, null, 2)
}

export function restoreBackup(backupString: string): boolean {
  try {
    const backup: BackupData = JSON.parse(backupString)
    
    // Basic validation
    if (!backup.version || !backup.timestamp || !backup.localStorage) {
      throw new Error('Invalid backup format')
    }

    // 恢复数据
    Object.entries(backup.localStorage).forEach(([key, value]) => {
      saveToLocalStorage(key, value)
    })
    
    return true
  } catch (e) {
    console.error('Failed to restore backup:', e)
    return false
  }
}

export function exportBackup(filename: string = `ielts-backup-${new Date().toISOString().slice(0, 10)}.json`): void {
  const backup = createBackup()
  const blob = new Blob([backup], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  
  URL.revokeObjectURL(url)
}

export async function importBackup(file: File): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string
        const success = restoreBackup(content)
        resolve(success)
      } catch (err) {
        reject(err)
      }
    }
    
    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.readAsText(file)
  })
}
