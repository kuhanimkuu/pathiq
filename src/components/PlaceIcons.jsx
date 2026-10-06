import { Bookmark } from 'lucide-react'
import { gemStyle, reportStyle, severityColor } from '../lib/placeStyles'

// Icons for PathIQ's own data — styles (colour + glyph per category / report
// type) live in lib/placeStyles.js.

// ── Small tiles for lists, chips and sheets ──

export function GemBadge({ category, size = 32 }) {
  const { color, Icon, label } = gemStyle(category)
  return (
    <span className="place-badge" style={{ '--c': color, width: size, height: size }} title={label} aria-hidden="true">
      <Icon size={Math.round(size * 0.55)} strokeWidth={2.2} />
    </span>
  )
}

export function ReportBadge({ type, severity = 3, size = 32 }) {
  const { Icon, label } = reportStyle(type)
  return (
    <span
      className="place-badge report"
      style={{ '--c': severityColor(severity), width: size, height: size }}
      title={label}
      aria-hidden="true"
    >
      <Icon size={Math.round(size * 0.55)} strokeWidth={2.2} />
    </span>
  )
}

// Just the glyph, in the category colour — for filter chips.
export function GemGlyph({ category, size = 14 }) {
  const { color, Icon } = gemStyle(category)
  return <Icon size={size} color={color} strokeWidth={2.4} aria-hidden="true" />
}

// ── Map markers ──
// Rendered into HtmlMarker elements (see MapPage). Gems are teardrop pins
// whose tip is the location; reports are diamonds centred on it, so the two
// can't be confused at a glance.

// onRoute: along the planned route (glows). dimmed: a route is planned and
// this isn't on it (fades back). google: one of Google's places, a tier below
// PathIQ gems — smaller and outlined rather than filled.
export function GemPin({ category, onRoute = false, dimmed = false, google = false, saved = false, selected = false }) {
  const { color, Icon } = gemStyle(category)
  return (
    <span
      className={
        'pin-gem' +
        (onRoute ? ' on-route' : '') +
        (dimmed ? ' dimmed' : '') +
        (google ? ' google' : '') +
        (selected ? ' selected' : '')
      }
      style={{ '--c': color }}
    >
      <span className="pin-gem-head">
        <Icon size={15} strokeWidth={2.4} />
      </span>
      {saved && (
        <span className="pin-saved">
          <Bookmark size={8} strokeWidth={3} fill="currentColor" />
        </span>
      )}
    </span>
  )
}

export function ReportPin({ type, severity, onRoute = false, dimmed = false, selected = false }) {
  const { Icon } = reportStyle(type)
  return (
    <span
      className={'pin-report' + (onRoute ? ' on-route' : '') + (dimmed ? ' dimmed' : '') + (selected ? ' selected' : '')}
      style={{ '--c': severityColor(severity) }}
    >
      <span className="pin-report-head">
        <Icon size={13} strokeWidth={2.6} />
      </span>
    </span>
  )
}
