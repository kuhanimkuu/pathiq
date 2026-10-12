import { useMemo } from 'react'
import { X, Play, Eye, List, Pin } from 'lucide-react'
import { GemBadge, ReportBadge } from '../../components/PlaceIcons'
import { formatDuration, routeLabel } from '../../lib/routePlanning'
import { reportTypeLabel, severityBand } from '../../lib/roadReports'
import { buildNavModel, distanceM, formatDistance } from '../../lib/navigation'
import { detourMinutes, DETOUR_CHOICES_MIN } from '../../lib/alertPrefs'
import { ON_ROUTE_M, ROUTE_COLOR, TRAFFIC_COLOR } from './constants'

// How much of a route is slow or jammed, in metres, from Google's traffic
// intervals (polyline point indexes) and the route's own geometry.
function trafficMetres(option) {
  if (!option.traffic?.length) return { slowM: 0, jamM: 0 }
  const { cum } = buildNavModel(option)
  const out = { slowM: 0, jamM: 0 }
  for (const t of option.traffic) {
    const m = (cum[Math.min(t.to, cum.length - 1)] ?? 0) - (cum[Math.min(t.from, cum.length - 1)] ?? 0)
    if (t.speed === 'TRAFFIC_JAM') out.jamM += m
    else out.slowM += m
  }
  return out
}

function trafficText({ slowM, jamM }) {
  if (jamM >= 100) return { text: `Heavy traffic ${(jamM / 1000).toFixed(1)} km`, level: 'jam' }
  if (slowM >= 100) return { text: `Slow ${(slowM / 1000).toFixed(1)} km`, level: 'slow' }
  return { text: 'Traffic clear', level: 'clear' }
}

// Every alternative side by side — time, distance, PathIQ's scores and the
// road problems on it — then the selected route's problems and Start. This
// is the whole route-comparison feature; there's no separate page for it.
function RoutePanel({
  panelRef,
  plan,
  selectedRoute,
  routing,
  routeError,
  corridorGemCount,
  googleCount,
  alongRoute,
  alertPrefs,
  choosingDetour,
  expanded,
  livePos,
  canNavigateLive,
  onSelect,
  onPin,
  onClear,
  onChooseDetour,
  onChangeDetour,
  onPickAlong,
  onToggleExpanded,
  onStart,
  onPreview,
  onShowSteps,
}) {
  const trafficByRoute = useMemo(
    () => new Map((plan?.options ?? []).map((o) => [o.id, trafficText(trafficMetres(o))])),
    [plan],
  )

  return (
    <div className={'map-route-panel' + (expanded ? '' : ' compact')} ref={panelRef}>
      {routing && <p className="list-row-sub" style={{ margin: 0 }}>Planning route…</p>}
      {!routing && routeError && <p className="auth-error" style={{ margin: 0 }}>{routeError}</p>}
      {!routing && selectedRoute && (
        <>
          <div className="route-panel-head">
            <div style={{ minWidth: 0 }}>
              <div className="route-panel-title">To {plan.destinationName}</div>
              <div className="route-panel-sub">
                {plan.stops.length > 0
                  ? `Via ${plan.stops.length} stop${plan.stops.length === 1 ? '' : 's'} · `
                  : `${plan.options.length} route${plan.options.length === 1 ? '' : 's'} · `}
                {corridorGemCount} gem{corridorGemCount === 1 ? '' : 's'}
                {googleCount > 0 && ` + ${googleCount} from Google`} along the{' '}
                {plan.options.length === 1 ? 'route' : 'selected one'}
              </div>
            </div>
            <button className="map-route-clear" onClick={onPin} aria-label="Pin this destination" title="Pin this destination">
              <Pin size={16} />
            </button>
            <button className="map-route-clear" onClick={onClear} aria-label="Clear route">
              <X size={16} />
            </button>
          </div>

          <div className="route-option-list">
            {plan.options.map((o) => (
              <button
                key={o.id}
                className={'route-option-row' + (o.id === plan.selectedId ? ' selected' : '')}
                onClick={() => onSelect(o.id)}
                aria-pressed={o.id === plan.selectedId}
              >
                <span className="route-option-time">{formatDuration(o.durationS)}</span>
                <span className="route-option-body">
                  <span className="route-option-label">
                    {routeLabel(o)} · {(o.distanceM / 1000).toFixed(1)} km
                  </span>
                  <span className="route-option-scores">
                    <span>Road {o.scores.roadQuality}</span>
                    <span className={`traffic-${trafficByRoute.get(o.id)?.level}`}>{trafficByRoute.get(o.id)?.text}</span>
                    <span className={o.reportCount ? 'has-reports' : ''}>
                      {o.reportCount ? `${o.reportCount} report${o.reportCount === 1 ? '' : 's'}` : 'No reports'}
                    </span>
                  </span>
                </span>
              </button>
            ))}
          </div>

          {/* Max detour for gems: asked once, then a setting (also in Profile). */}
          {!alertPrefs.detourAsked || choosingDetour ? (
            <div className="route-detour-ask">
              <div className="route-detour-q">How far out of your way would you go for a Hidden Gem?</div>
              <div className="chip-row">
                {DETOUR_CHOICES_MIN.map((min) => (
                  <button
                    key={min}
                    className={'chip' + (alertPrefs.enabled && alertPrefs.maxDetourMin === min ? ' active' : '')}
                    onClick={() => onChooseDetour(min)}
                  >
                    {min} min
                  </button>
                ))}
              </div>
              <div className="route-detour-note">
                We&apos;ll show gems within that detour on every route and alert you as you near them. Saved as a
                setting; change it here or in Profile.
              </div>
            </div>
          ) : (
            <div className="route-detour-line">
              {alertPrefs.enabled
                ? `Gems up to ${alertPrefs.maxDetourMin} min off your route`
                : 'Gem alerts are off · showing gems right by the route'}
              <button onClick={onChangeDetour}>Change</button>
            </div>
          )}

          {alongRoute.length > 0 && (
            <div className="route-along" aria-label="Along this route">
              {alongRoute.map(({ kind, id, item }) =>
                kind === 'gem' ? (
                  <button key={'g' + id} className="route-along-chip" onClick={() => onPickAlong(kind, item)}>
                    <GemBadge category={item.category} size={22} />
                    <span className="route-along-text">
                      <span className="route-along-name">{item.name}</span>
                      <span className="route-along-sub">
                        {item.source === 'google' && `Google${item.rating != null ? ` ★${item.rating}` : ''} · `}
                        {item.distance_from_route_m <= ON_ROUTE_M
                          ? 'On your route'
                          : `~${detourMinutes(item.distance_from_route_m)} min detour`}
                      </span>
                    </span>
                  </button>
                ) : (
                  <button key={'r' + id} className="route-along-chip" onClick={() => onPickAlong(kind, item)}>
                    <ReportBadge type={item.type} severity={item.severity} size={22} />
                    <span className="route-along-text">
                      <span className="route-along-name">{reportTypeLabel(item.type)}</span>
                      <span className="route-along-sub">Severity {item.severity}/5 · on route</span>
                    </span>
                  </button>
                ),
              )}
            </div>
          )}

          {/* Phones only (CSS): expand / collapse the panel. */}
          <button className="route-panel-more" onClick={onToggleExpanded} aria-expanded={expanded}>
            {expanded
              ? 'Show less'
              : plan.options.length > 1
                ? `${plan.options.length - 1} more route${plan.options.length > 2 ? 's' : ''} and details`
                : 'Route details'}
          </button>

          {selectedRoute.alerts?.length > 0 && (
            <div className="route-alerts">
              {selectedRoute.alerts.map((a, i) => (
                <div key={i} className={`route-alert route-alert-${severityBand(a.severity)}`}>
                  <ReportBadge type={a.type} severity={a.severity} size={20} /> {reportTypeLabel(a.type)} · severity{' '}
                  {a.severity}/5, painted on the route
                </div>
              ))}
            </div>
          )}

          <div className="route-legend" aria-label="Route line colours">
            <span><i className="swatch" style={{ background: ROUTE_COLOR }} /> Clear</span>
            <span><i className="swatch" style={{ background: TRAFFIC_COLOR.SLOW }} /> Slow</span>
            <span><i className="swatch" style={{ background: TRAFFIC_COLOR.TRAFFIC_JAM }} /> Heavy traffic</span>
            <span><i className="swatch dotted" /> Road report</span>
          </div>

          {!canNavigateLive && (
            <p className="route-preview-note">
              <Eye size={13} />
              <span>
                {!livePos
                  ? 'Location is off, so you can preview the directions step by step. Turn it on for live turn-by-turn.'
                  : plan.fromMe
                    ? 'Waiting for your location…'
                    : `This route starts ${formatDistance(distanceM(livePos, plan.origin))} from you. Live turn-by-turn starts once you're there, or set the start to Your location.`}
              </span>
            </p>
          )}

          <div className="route-panel-actions">
            {canNavigateLive ? (
              <button className="map-route-start route-panel-start" onClick={onStart}>
                <Play size={14} fill="currentColor" /> Start
              </button>
            ) : (
              <button className="map-route-start route-panel-start" disabled={!selectedRoute.steps?.length} onClick={onPreview}>
                <Eye size={14} /> Preview directions
              </button>
            )}
            {selectedRoute.steps?.length > 0 && (
              <button className="route-panel-steps" onClick={onShowSteps}>
                <List size={15} /> Steps
              </button>
            )}
          </div>
        </>
      )}
    </div>
  )
}

export default RoutePanel
