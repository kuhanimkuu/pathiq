import { useEffect, useState } from 'react'
import { Monitor, Sun, Moon } from 'lucide-react'
import { getThemePreference, setThemePreference, onThemeChange } from '../lib/theme'

// Automatic (follow the device) → Light → Dark, one tap each. In the site and
// app headers so everyone has it, guests and signed-out visitors included.
const NEXT = { system: 'light', light: 'dark', dark: 'system' }
const LABEL = { system: 'Automatic', light: 'Light', dark: 'Dark' }
const ICON = { system: Monitor, light: Sun, dark: Moon }

function ThemeToggle({ className = '', showLabel = false }) {
  const [preference, setPreference] = useState(getThemePreference)
  // Stay in step when it's changed elsewhere (Profile's Theme setting).
  useEffect(() => onThemeChange(() => setPreference(getThemePreference())), [])
  const Icon = ICON[preference]
  const label = LABEL[preference]
  return (
    <button
      type="button"
      className={'theme-toggle ' + className}
      onClick={() => {
        const next = NEXT[preference]
        setThemePreference(next)
        setPreference(next)
      }}
      aria-label={`Theme: ${label}${preference === 'system' ? ' (follows your device)' : ''}. Tap to change.`}
      title={`Theme: ${label}`}
    >
      <Icon size={17} />
      {showLabel && <span className="theme-toggle-label">{label}</span>}
    </button>
  )
}

export default ThemeToggle
