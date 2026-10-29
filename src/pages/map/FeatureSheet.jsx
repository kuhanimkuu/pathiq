import { useEffect, useState } from 'react'
import { X, Bookmark, Star, Navigation2, Plus, Share2, ThumbsUp, ThumbsDown, Radio } from 'lucide-react'
import { GemBadge, ReportBadge } from '../../components/PlaceIcons'
import { gemStyle } from '../../lib/placeStyles'
import { reportTypeLabel, timeAgo, fetchRoadReportStatus, voteRoadReport } from '../../lib/roadReports'
import { distanceM } from '../../lib/navigation'
import { detourMinutes } from '../../lib/alertPrefs'
import { ON_ROUTE_M } from './constants'

function kmAway(position, item) {
  if (position) return `${(distanceM(position, item) / 1000).toFixed(1)} km away`
  if (item.distance_m != null) return `${(item.distance_m / 1000).toFixed(1)} km away`
  return ''
}

// A road report's standing: live or not, how sure PathIQ is and why, and
// "still there?" for anyone who can see it (the live_road_reports migration).
// `onEnded` when a vote takes it off the map.
function ReportStatus({ id, onEnded }) {
  const [status, setStatus] = useState(null) // road_report_status, or { failed }
  const [voting, setVoting] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    let cancelled = false
    fetchRoadReportStatus(id)
      .then((s) => !cancelled && setStatus(s ?? { failed: true }))
      .catch(() => !cancelled && setStatus({ failed: true }))
    return () => {
      cancelled = true
    }
  }, [id])

  async function vote(stillThere) {
    setVoting(true)
    setError('')
    try {
      const result = await voteRoadReport(id, stillThere)
      if (result.ended) return onEnded?.()
      setStatus(await fetchRoadReportStatus(id))
    } catch (err) {
      setError(err.message)
    } finally {
      setVoting(false)
    }
  }

  if (!status || status.failed) return null
  const backers = status.confirmations
  return (
    <div className="report-status">
      <div className="report-status-line">
        {status.live && (
          <span className="report-live-badge">
            <Radio size={11} /> Live
          </span>
        )}
        <span>
          {status.source === 'scout' ? 'Checked by a PathIQ Scout' : `Reported by ${backers} driver${backers === 1 ? '' : 's'}`}
          {status.google_traffic && ' · backed by live traffic'}
          {status.denials > 0 && ` · ${status.denials} said it's gone`}
          {' · '}updated {timeAgo(status.last_signal_at)}
        </span>
      </div>
      {status.my_vote ? (
        <div className="report-status-thanks">
          You said it's {status.my_vote === 'yes' ? 'still there' : 'gone'}. Thanks.
        </div>
      ) : (
        <div className="map-pin-actions">
          <button className="map-route-here-btn" disabled={voting} onClick={() => vote(true)}>
            <ThumbsUp size={13} /> Still there
          </button>
          <button className="map-route-here-btn" disabled={voting} onClick={() => vote(false)}>
            <ThumbsDown size={13} /> Not there anymore
          </button>
        </div>
      )}
      {error && <div className="auth-error" style={{ marginTop: 6 }}>{error}</div>}
    </div>
  )
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
  onReportEnded,
}) {
  return (
    <>
      <div className="map-sheet">
        <button className="map-sheet-handle" onClick={onClose} aria-label="Close">
          <X size={16} />
        </button>
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
            <div style={{ minWidth: 0, flex: 1 }}>
              <div className="place-sheet-title">
                {reportTypeLabel(incident.type)} — severity {incident.severity}/5
              </div>
              <div className="place-sheet-sub">
                {kmAway(position, incident)}
                {onRoute && ' · on your route'}
                {incident.description ? ` · ${incident.description}` : ''}
              </div>
              <ReportStatus key={incident.id} id={incident.id} onEnded={onReportEnded} />
            </div>
          </div>
        )}
      </div>
    </>
  )
}

export default FeatureSheet
