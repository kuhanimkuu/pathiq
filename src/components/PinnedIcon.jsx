import { House, Briefcase, Pin } from 'lucide-react'

// A pinned place's glyph: Home, Work or a plain pin.
const ICON = { home: House, work: Briefcase, other: Pin }

export function PinnedGlyph({ label, size = 15 }) {
  const Icon = ICON[label] ?? Pin
  return <Icon size={size} strokeWidth={2.2} />
}

// The pinned place's marker on the map (see .pin-pinned in App.css).
export function PinnedPin({ label, selected = false }) {
  return (
    <span className={'pin-pinned' + (selected ? ' selected' : '')}>
      <PinnedGlyph label={label} size={14} />
    </span>
  )
}
