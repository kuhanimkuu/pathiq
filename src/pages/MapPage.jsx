import { useEffect, useState, useCallback } from 'react'
import { Search, X, Bookmark, Star, Navigation2 } from 'lucide-react'
import { useAuth } from '../context/useAuth'
import { fetchNearbyGems, fetchSavedGemIds, saveGem, unsaveGem, confirmGem, getCurrentPosition } from '../lib/gems'
import { fetchNearbyRoadReports, reportTypeLabel, severityBand } from '../lib/roadReports'
import { projectRelative, unprojectRelative } from '../lib/geo'
import { planRoute } from '../lib/routePlanning'

const RADIUS_M = 5000
const PIN_RADIUS_PCT = 42 // how far a pin at the edge of RADIUS_M sits from center, in %

const CATEGORY_ICON = {
  attractions: '🎯', hotels: '🏨', food: '🍽️', scenic: '🌄', fuel: '⛽', facilities: '🏢',
}
const INCIDENT_ICON = { pothole: '🕳️', flooding: '🌊', construction: '🚧', surface: '🛣️', incident: '⚠️' }

const categories = [
  { value: 'attractions', label: 'Attractions' },
  { value: 'hotels', label: 'Hotels' },
  { value: 'food', label: 'Food' },
  { value: 'scenic', label: 'Scenic' },
  { value: 'fuel', label: 'Fuel' },
  { value: 'facilities', label: 'Facilities' },
]

function pct(coord) {
  return `${50 + coord * PIN_RADIUS_PCT}%`
}

// The map itself is a placeholder radar view, not a real street map — pins
// are positioned by real bearing/distance from the driver (src/lib/geo.js),
// not fabricated. It's here until the Google Maps key exists (see
// architecture.md); everything around it (search, filters, gem details,
// save/rate, route planning) is fully real, backed by the same Supabase data
// as Gems.jsx. Planned routes are a straight line, not real road-following —
// see src/lib/routePlanning.js for why, and what's real about them anyway.
function MapPage() {
  const { user, session } = useAuth()
  const userId = user?.id

  const [position, setPosition] = useState(null)
  const [gems, setGems] = useState([])
  const [incidents, setIncidents] = useState([])
  const [savedIds, setSavedIds] = useState(new Set())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [activeCategories, setActiveCategories] = useState(new Set())
  const [search, setSearch] = useState('')
  // { type, id } only — looked up live below, so the sheet reflects the
  // latest rating/save state instead of a snapshot frozen at click-time.
  const [selected, setSelected] = useState(null)
  const [busy, setBusy] = useState(false)

  const [route, setRoute] = useState(null) // { origin, destination, distanceM, gems, reports, roadQuality }
  const [routing, setRouting] = useState(false)
  const [routeError, setRouteError] = useState('')

  const selectedGem = selected?.type === 'gem' ? gems.find((g) => g.id === selected.id) : null
  const selectedIncident = selected?.type === 'incident' ? incidents.find((i) => i.id === selected.id) : null

  const load = useCallback(async () => {
    try {
      const pos = await getCurrentPosition()
      const [gemRows, incidentRows, saved] = await Promise.all([
        fetchNearbyGems(pos.lat, pos.lng, { radiusM: RADIUS_M }),
        fetchNearbyRoadReports(pos.lat, pos.lng, RADIUS_M),
        fetchSavedGemIds(userId),
      ])
      setPosition(pos)
      setGems(gemRows)
      setIncidents(incidentRows)
      setSavedIds(saved)
      setError('')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [userId])

  useEffect(() => {
    if (!session) return
    let cancelled = false
    async function run() {
      try {
        const pos = await getCurrentPosition()
        const [gemRows, incidentRows, saved] = await Promise.all([
          fetchNearbyGems(pos.lat, pos.lng, { radiusM: RADIUS_M }),
          fetchNearbyRoadReports(pos.lat, pos.lng, RADIUS_M),
          fetchSavedGemIds(userId),
        ])
        if (cancelled) return
        setPosition(pos)
        setGems(gemRows)
        setIncidents(incidentRows)
        setSavedIds(saved)
        setError('')
      } catch (err) {
        if (!cancelled) setError(err.message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    run()
    return () => {
      cancelled = true
    }
  }, [session, userId])

  const visibleGems = gems.filter((g) => {
    if (activeCategories.size > 0 && !activeCategories.has(g.category)) return false
    if (search && !g.name.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const routeGemIds = new Set((route?.gems ?? []).map((g) => g.id))
  const routeReportIds = new Set((route?.reports ?? []).map((r) => r.id))

  function toggleCategory(cat) {
    setActiveCategories((prev) => {
      const next = new Set(prev)
      next.has(cat) ? next.delete(cat) : next.add(cat)
      return next
    })
  }

  async function handleToggleSave(gemId) {
    setBusy(true)
    try {
      if (savedIds.has(gemId)) {
        await unsaveGem(userId, gemId)
        setSavedIds((prev) => {
          const next = new Set(prev)
          next.delete(gemId)
          return next
        })
      } else {
        await saveGem(userId, gemId)
        setSavedIds((prev) => new Set(prev).add(gemId))
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function handleRate(gemId, rating) {
    setBusy(true)
    try {
      await confirmGem(userId, gemId, rating)
      await load()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function planTo(destination) {
    if (!position) return
    setRouteError('')
    setRouting(true)
    setSelected(null)
    try {
      setRoute(await planRoute(position, destination))
    } catch (err) {
      setRouteError(err.message)
      setRoute(null)
    } finally {
      setRouting(false)
    }
  }

  function handleCanvasClick(e) {
    if (!position || routing) return
    const rect = e.currentTarget.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width - 0.5) * (100 / PIN_RADIUS_PCT)
    const y = ((e.clientY - rect.top) / rect.height - 0.5) * (100 / PIN_RADIUS_PCT)
    if (Math.abs(x) > 1 || Math.abs(y) > 1) return // tapped outside the visible radius
    planTo(unprojectRelative(x, y, position.lat, position.lng, RADIUS_M))
  }

  function handleClearRoute() {
    setRoute(null)
    setRouteError('')
  }

  if (loading) {
    return (
      <div className="map-page">
        <div className="map-canvas" />
        <p style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted-foreground)' }}>
          Loading map…
        </p>
      </div>
    )
  }

  const destProjected =
    position && route ? projectRelative(route.destination.lat, route.destination.lng, position.lat, position.lng, RADIUS_M) : null

  return (
    <div className="map-page">
      <div className="map-canvas" onClick={handleCanvasClick}>
        {position && route && destProjected && (
          <svg className="map-route-line" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            <line
              x1={50}
              y1={50}
              x2={50 + destProjected.x * PIN_RADIUS_PCT}
              y2={50 + destProjected.y * PIN_RADIUS_PCT}
              stroke="var(--primary)"
              strokeWidth="1.5"
              strokeDasharray="3 2"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
        )}

        {position && (
          <div className="map-user-dot" style={{ top: '50%', left: '50%' }} aria-label="Your location" />
        )}

        {position && route && destProjected && (
          <div
            className="map-pin map-pin-destination"
            style={{ top: pct(destProjected.y), left: pct(destProjected.x) }}
            aria-label="Destination"
          >
            <Navigation2 size={13} />
          </div>
        )}

        {visibleGems.map((gem) => {
          if (!position) return null
          const { x, y } = projectRelative(gem.lat, gem.lng, position.lat, position.lng, RADIUS_M)
          const onRoute = routeGemIds.has(gem.id)
          return (
            <button
              key={gem.id}
              className={'map-pin' + (onRoute ? ' map-pin-on-route' : '')}
              style={{
                top: pct(y),
                left: pct(x),
                background: 'var(--card)',
                border: `2px solid ${onRoute ? 'var(--amber)' : 'var(--primary)'}`,
              }}
              onClick={(e) => {
                e.stopPropagation()
                setSelected({ type: 'gem', id: gem.id })
              }}
              aria-label={gem.name}
            >
              {CATEGORY_ICON[gem.category] ?? '📍'}
            </button>
          )
        })}
        {incidents.map((incident) => {
          if (!position) return null
          const { x, y } = projectRelative(incident.lat, incident.lng, position.lat, position.lng, RADIUS_M)
          const band = severityBand(incident.severity)
          const onRoute = routeReportIds.has(incident.id)
          return (
            <button
              key={incident.id}
              className={'map-pin' + (onRoute ? ' map-pin-on-route' : '')}
              style={{
                top: pct(y),
                left: pct(x),
                background: 'var(--card)',
                border: `2px solid var(--${band === 'high' ? 'red' : band === 'medium' ? 'amber' : 'blue'})`,
                width: 24,
                height: 24,
              }}
              onClick={(e) => {
                e.stopPropagation()
                setSelected({ type: 'incident', id: incident.id })
              }}
              aria-label={reportTypeLabel(incident.type)}
            >
              {INCIDENT_ICON[incident.type] ?? '⚠️'}
            </button>
          )
        })}
      </div>

      <div className="map-search-bar">
        <Search size={16} color="var(--muted-foreground)" />
        <input
          placeholder="Filter gems by name, or tap the map to plan a route…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="map-filter-row">
        {categories.map((c) => (
          <button
            key={c.value}
            className={'chip' + (activeCategories.has(c.value) ? ' active' : '')}
            onClick={() => toggleCategory(c.value)}
          >
            {CATEGORY_ICON[c.value]} {c.label}
          </button>
        ))}
      </div>

      {(routing || route || routeError) && (
        <div className="map-route-summary">
          {routing && <span>Planning route…</span>}
          {!routing && routeError && <span className="auth-error" style={{ margin: 0 }}>{routeError}</span>}
          {!routing && route && (
            <>
              <div>
                <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 15 }}>
                  {(route.distanceM / 1000).toFixed(1)} km straight-line &middot; road score {route.roadQuality}
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--muted-foreground)', marginTop: 2 }}>
                  Preview only, not a real route — no turn-by-turn yet. {route.gems.length} gem
                  {route.gems.length === 1 ? '' : 's'} and {route.reports.length} road report
                  {route.reports.length === 1 ? '' : 's'} along the way, highlighted in amber.
                </div>
              </div>
              <button className="map-route-clear" onClick={handleClearRoute} aria-label="Clear route">
                <X size={14} />
              </button>
            </>
          )}
        </div>
      )}

      {error && (
        <p className="auth-error" style={{ position: 'absolute', top: route || routing ? 176 : 108, left: 16, right: 16, zIndex: 20 }}>
          {error}
        </p>
      )}

      {(selectedGem || selectedIncident) && (
        <>
          <button className="map-sheet-handle" onClick={() => setSelected(null)} aria-label="Close">
            <X size={16} />
          </button>
          <div className="map-sheet">
            {selectedGem ? (
              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <div style={{
                  width: 44, height: 44, borderRadius: 12, background: 'var(--secondary)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 20,
                }}>
                  {CATEGORY_ICON[selectedGem.category] ?? '📍'}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 16 }}>{selectedGem.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--muted-foreground)', marginTop: 2 }}>
                    {selectedGem.category} · {(selectedGem.distance_m / 1000).toFixed(1)} km away
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10 }}>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button
                        key={n}
                        className="rate-star-btn"
                        disabled={busy}
                        onClick={() => handleRate(selectedGem.id, n)}
                        aria-label={`Rate ${n} stars`}
                      >
                        <Star size={16} />
                      </button>
                    ))}
                    <span style={{ fontSize: 12, color: 'var(--muted-foreground)' }}>
                      {selectedGem.confirmations_count} confirmed
                    </span>
                  </div>
                  <button
                    className="map-route-here-btn"
                    disabled={routing}
                    onClick={() => planTo({ lat: selectedGem.lat, lng: selectedGem.lng })}
                  >
                    <Navigation2 size={13} /> Route here
                  </button>
                </div>
                <button
                  className={'save-btn' + (savedIds.has(selectedGem.id) ? ' saved' : '')}
                  disabled={busy}
                  onClick={() => handleToggleSave(selectedGem.id)}
                  aria-label={savedIds.has(selectedGem.id) ? 'Remove from saved' : 'Save gem'}
                >
                  <Bookmark size={18} fill={savedIds.has(selectedGem.id) ? 'currentColor' : 'none'} />
                </button>
              </div>
            ) : (
              <div>
                <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 16 }}>
                  {reportTypeLabel(selectedIncident.type)} — severity {selectedIncident.severity}/5
                </div>
                <div style={{ fontSize: 12, color: 'var(--muted-foreground)', marginTop: 4 }}>
                  {(selectedIncident.distance_m / 1000).toFixed(1)} km away
                  {selectedIncident.description ? ` · ${selectedIncident.description}` : ''}
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

export default MapPage
