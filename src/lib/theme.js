const STORAGE_KEY = 'pathiq-theme' // 'dark' | 'light'; absent = follow the device
const CHANGE_EVENT = 'pathiq-theme-change'

// What the visitor chose: 'system' (follow the phone/computer), 'light' or
// 'dark'. Anyone can choose (the switch is in the site and app headers, not
// just Profile), so guests and signed-out visitors get it too.
export function getThemePreference() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'light' || stored === 'dark') return stored
  } catch {
    // localStorage unavailable (private mode, blocked) — fall through
  }
  return 'system'
}

function systemTheme() {
  try {
    if (window.matchMedia('(prefers-color-scheme: light)').matches) return 'light'
  } catch {
    // matchMedia unavailable — fall through
  }
  return 'dark' // the app's original look
}

export function resolveTheme(preference) {
  return preference === 'system' ? systemTheme() : preference
}

export function getInitialTheme() {
  return resolveTheme(getThemePreference())
}

// The theme on screen right now.
export function currentTheme() {
  return document.documentElement.classList.contains('light') ? 'light' : 'dark'
}

// The browser/phone status bar colour, matching --background.
const THEME_COLOR = { dark: '#050D0B', light: '#F0F5F3' }

// Puts a theme on screen and tells anything drawn in its own colours (the
// Google maps) to restyle. Doesn't change the saved preference.
export function applyTheme(theme) {
  document.documentElement.classList.toggle('light', theme === 'light')
  document.documentElement.style.colorScheme = theme // native controls and scrollbars
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLOR[theme])
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: theme }))
}

export function setThemePreference(preference) {
  try {
    if (preference === 'system') localStorage.removeItem(STORAGE_KEY)
    else localStorage.setItem(STORAGE_KEY, preference)
  } catch {
    // ignore — the theme still applies for this visit, it just won't be remembered
  }
  applyTheme(resolveTheme(preference))
}

// Called once at startup: while the preference is 'system', follow the device
// when it switches (e.g. dark mode at sunset) without a reload.
export function followSystemTheme() {
  try {
    window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => {
      if (getThemePreference() === 'system') applyTheme(systemTheme())
    })
  } catch {
    // old browsers: the theme just updates on the next visit
  }
}

// Runs `listener(theme)` whenever the theme on screen changes. Returns an
// unsubscribe function.
export function onThemeChange(listener) {
  const handler = (e) => listener(e.detail)
  window.addEventListener(CHANGE_EVENT, handler)
  return () => window.removeEventListener(CHANGE_EVENT, handler)
}
