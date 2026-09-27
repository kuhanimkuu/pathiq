const STORAGE_KEY = 'pathiq-theme' // 'dark' | 'light'

export function getInitialTheme() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'light' || stored === 'dark') return stored
  } catch {
    // localStorage unavailable (private mode, blocked) — fall through
  }
  // No choice saved yet: follow the phone's own light/dark setting.
  try {
    if (window.matchMedia('(prefers-color-scheme: light)').matches) return 'light'
  } catch {
    // matchMedia unavailable — fall through
  }
  return 'dark' // the app's original look
}

// The browser/phone status bar colour, matching --background.
const THEME_COLOR = { dark: '#050D0B', light: '#F0F5F3' }

// `persist` is false for the initial, automatic theme, so a driver who never
// chooses keeps following their phone's setting.
export function applyTheme(theme, { persist = true } = {}) {
  document.documentElement.classList.toggle('light', theme === 'light')
  document.documentElement.style.colorScheme = theme // native controls and scrollbars
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLOR[theme])
  if (!persist) return
  try {
    localStorage.setItem(STORAGE_KEY, theme)
  } catch {
    // ignore — theme still applies for this session, just won't persist
  }
}
