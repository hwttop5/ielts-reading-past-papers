export function saveToLocalStorage(key: string, data: any): void {
  try {
    localStorage.setItem(key, JSON.stringify(data))
  } catch (e) {
    console.error('Failed to save to localStorage:', e)
  }
}

export function loadFromLocalStorage<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : null
  } catch (e) {
    console.error('Failed to load from localStorage:', e)
    return null
  }
}

export function removeFromLocalStorage(key: string): void {
  localStorage.removeItem(key)
}
