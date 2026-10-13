import { X, Bookmark, Star, Navigation2, Plus, Share2 } from 'lucide-react'
import { GemBadge, ReportBadge } from '../../components/PlaceIcons'
import { gemStyle } from '../../lib/placeStyles'
import { reportTypeLabel } from '../../lib/roadReports'
import { distanceM } from '../../lib/navigation'
import { detourMinutes } from '../../lib/alertPrefs'
import { ON_ROUTE_M } from './constants'

function kmAway(position, item) {
  if (position) return `${(distanceM(position, item) / 1000).toFixed(1)} km away`
  if (item.distance_m != null) return `${(item.distance_m / 1000).toFixed(1)} km away`
  return ''
}

// The bottom sheet for a gem (PathIQ's or Google's) or a road report:
// what it is, and Directions as the main action, like any maps app.
//   gem | incident   the selected feature (one of them)
//   onDirections, onAddStop, onShare, onToggleSave, onRate   actions (omit to hide)
function FeatureSheet({
  gem,
  incident,
  position,
  onRoute,
  saved,
  busy,
  routing,
  directionsLabel = 'Directions',
  onClose,
  onDirections,
  onAddStop,
  onShare,
  onToggleSave,
  onRate,
}) {
  return (
    <>
      <button className="map-sheet-handle" onClick={onClose} aria-label="Close">
        <X size={16} />
      </button>
      <div className="map-sheet">
        {gem ? (
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            <GemBadge category={gem.category} size={44} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="place-sheet-title">{gem.name}</div>
              <div className="place-sheet-sub">
                {gemStyle(gem.category).label}
                {kmAway(position, gem) && ` · ${kmAway(position, gem)}`}
                {gem.distance_from_route_m != null &&
                  (gem.distance_from_route_m <= ON_ROUTE_M
                    ? ' · on your route'
                    : ` · ~${detourMinutes(gem.distance_from_route_m)} min detour`)}
              </div>
              {gem.source === 'google' ? (
                // Google's place: its rating, read-only, with attribution.
                <div className="google-place-meta">
                  {gem.rating != null && (
                    <span>
                      <Star size={13} fill="currentColor" /> {gem.rating} · {gem.ratingCount.toLocaleString()} reviews
                    </span>
                  )}
                  <span className="google-attribution">From Google Maps</span>
                </div>
              ) : (
                onRate && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10 }}>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button
                        key={n}
                        className="rate-star-btn"
                        disabled={busy}
                        onClick={() => onRate(n)}
                        aria-label={`Rate ${n} stars`}
                      >
                        <Star size={16} />
                      </button>
                    ))}
                    <span style={{ fontSize: 12, color: 'var(--muted-foreground)' }}>{gem.confirmations_count} confirmed</span>
                  </div>
                )
              )}
              {onDirections && (
                <div className="map-pin-actions">
                  <button className="map-route-start" disabled={routing} onClick={onDirections}>
                    <Navigation2 size={13} /> {directionsLabel}
                  </button>
                  {onAddStop && (
                    <button className="map-route-here-btn" onClick={onAddStop}>
                      <Plus size={13} /> Add as stop
                    </button>
                  )}
                  <button className="map-route-here-btn" onClick={onShare}>
                    <Share2 size={13} /> Share
                  </button>
                </div>
              )}
            </div>
            {gem.source !== 'google' && onToggleSave && (
              <button
                className={'save-btn' + (saved ? ' saved' : '')}
                disabled={busy}
                onClick={onToggleSave}
                aria-label={saved ? 'Remove from saved' : 'Save gem'}
              >
                <Bookmark size={18} fill={saved ? 'currentColor' : 'none'} />
              </button>
            )}
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            <ReportBadge type={incident.type} severity={incident.severity} size={44} />
            <div style={{ minWidth: 0 }}>
              <div className="place-sheet-title">
                {reportTypeLabel(incident.type)} — severity {incident.severity}/5
              </div>
              <div className="place-sheet-sub">
                {kmAway(position, incident)}
                {onRoute && ' · on your route'}
                {incident.description ? ` · ${incident.description}` : ''}
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  )
}

export default FeatureSheet
