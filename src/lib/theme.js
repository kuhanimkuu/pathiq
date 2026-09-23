const STORAGE_KEY = 'pathiq-theme' // 'dark' | 'light'

export function getInitialTheme() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'light' || stored === 'dark') return stored
  } catch {
    // localStorage unavailable (private mode, blocked) — fall through
  }
  return 'dark' // matches the app's original look; no system-preference check yet
}

export function applyTheme(theme) {
  document.documentElement.classList.toggle('light', theme === 'light')
  try {
    localStorage.setItem(STORAGE_KEY, theme)
  } catch {
    // ignore — theme still applies for this session, just won't persist
  }
}
