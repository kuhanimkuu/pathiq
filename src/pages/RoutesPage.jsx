import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowLeft, History, Bookmark, Play } from 'lucide-react'
import { useAuth } from '../context/useAuth'
import { getCurrentPosition, fetchSavedGems } from '../lib/gems'
import { planRoutes, formatDuration, routeLabel } from '../lib/routePlanning'
import { fetchRecentDestinations } from '../lib/trips'
import { reportTypeLabel, severityBand } from '../lib/roadReports'
import { CATEGORY_ICON, INCIDENT_ICON } from '../lib/icons'
import DestinationSearch from '../components/DestinationSearch'
import RoutePreviewMap from '../components/RoutePreviewMap'

function parseTo(value) {
  const [lat, lng] = (value ?? '').split(',').map(Number)
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null
}

// Plan and compare routes. With no destination it's a "Where to?" screen
// (search, recent destinations, saved gems). With `?to=lat,lng&name=…` it
// shows the scored alternatives from the `routes` edge function — on a map,
// with their road scores and the problems PathIQ knows about on each — and
// starts navigation on the map.
function RoutesPage() {
  const { session } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const toParam = searchParams.get('to')
  const destinationName = searchParams.get('name') || 'Dropped pin'

  const [origin, setOrigin] = useState(null)
  const [recent, setRecent] = useState([])
  const [saved, setSaved] = useState([])

  // Results belong to one destination (`to`), so stale ones never show under
  // a new destination.
  const [result, setResult] = useState({ to: null, options: null, error: '' })
  const [selectedId, setSelectedId] = useState(null)

  useEffect(() => {
    let cancelled = false
    getCurrentPosition().then((pos) => !cancelled && setOrigin(pos))
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!session) return
    let cancelled = false
    Promise.all([fetchRecentDestinations(5), fetchSavedGems()])
      .then(([r, s]) => {
        if (cancelled) return
        setRecent(r)
        setSaved(s)
      })
      .catch(() => {}) // quick picks are a convenience; search still works
    return () => {
      cancelled = true
    }
  }, [session])

  useEffect(() => {
    const to = parseTo(toParam)
    if (!to || !origin) return
    let cancelled = false
    planRoutes(origin, to)
      .then((options) => {
        if (cancelled) return
        setResult({ to: toParam, options, error: '' })
        setSelectedId(options[0]?.id ?? null)
      })
      .catch((err) => !cancelled && setResult({ to: toParam, options: null, error: err.message }))
    return () => {
      cancelled = true
    }
  }, [toParam, origin])

  function goTo(lat, lng, name) {
    setSearchParams({ to: `${lat.toFixed(5)},${lng.toFixed(5)}`, name })
  }

  const destination = parseTo(toParam)

  // ── Where to? ──
  if (!destination) {
    return (
      <div className="routes-page">
        <h1 className="page-title">Where to?</h1>
        <DestinationSearch
          variant="inline"
          gems={saved}
          near={origin}
          placeholder="Search a place or a saved gem…"
          onPickGem={(gem) => goTo(gem.lat, gem.lng, gem.name)}
          onPickPlace={(place) => goTo(place.lat, place.lng, place.name)}
        />
        <p className="list-row-sub" style={{ marginTop: -8, marginBottom: 20 }}>
          From {origin?.isFallback ? 'central Nairobi (turn on location to start from where you are)' : 'your location'}.
          You can also tap anywhere on the <Link to="/app/map">map</Link>.
        </p>

        {recent.length > 0 && (
          <div className="section-card">
            <div className="section-title"><History size={13} /> Recent</div>
            {recent.map((r) => (
              <button key={`${r.lat},${r.lng},${r.name}`} className="quick-pick" onClick={() => goTo(r.lat, r.lng, r.name)}>
                <span className="quick-pick-icon">📍</span>
                <span className="quick-pick-name">{r.name}</span>
              </button>
            ))}
          </div>
        )}

        {saved.length > 0 && (
          <div className="section-card">
            <div className="section-title"><Bookmark size={13} /> Saved gems</div>
            {saved.map((g) => (
              <button key={g.id} className="quick-pick" onClick={() => goTo(g.lat, g.lng, g.name)}>
                <span className="quick-pick-icon">{CATEGORY_ICON[g.category] ?? '📍'}</span>
                <span className="quick-pick-name">{g.name}</span>
              </button>
            ))}
          </div>
        )}

        {recent.length === 0 && saved.length === 0 && (
          <p className="list-row-sub">
            Places you navigate to and gems you save will show up here for one-tap routing.
          </p>
        )}
      </div>
    )
  }

  // ── Routes to a destination ──
  const current = result.to === toParam ? result : { options: null, error: '' }
  const options = current.options
  const selectedRoute = options?.find((o) => o.id === selectedId) ?? options?.[0]

  return (
    <div className="routes-page">
      <button className="routes-back" onClick={() => setSearchParams({})}>
        <ArrowLeft size={15} /> Change destination
      </button>
      <h1 className="page-title">Routes to {destinationName}</h1>

      {current.error && <p className="auth-error">{current.error}</p>}
      {!current.error && !options && <p className="list-row-sub">Finding routes…</p>}

      {options && (
        <>
          <RoutePreviewMap
            options={options}
            selectedId={selectedRoute?.id}
            origin={origin}
            destination={destination}
            onSelect={setSelectedId}
          />

          <div className="route-cards">
            {options.map((route) => (
              <div
                key={route.id}
                className={'route-card' + (route.id === selectedRoute?.id ? ' selected' : '')}
                onClick={() => setSelectedId(route.id)}
              >
                <div className="route-card-tag">{routeLabel(route)}</div>
                <div className="route-time">{formatDuration(route.durationS)}</div>
                <div className="route-dist">
                  {(route.distanceM / 1000).toFixed(1)} km · {route.reportCount} road report
                  {route.reportCount === 1 ? '' : 's'}
                </div>

                <ScoreBar label="Road quality" value={route.scores.roadQuality} />
                <ScoreBar label="Traffic" value={route.scores.traffic} />
                <ScoreBar label="Incidents" value={route.scores.incidents} />

                {route.alerts?.length > 0 && (
                  <div className="route-alerts">
                    {route.alerts.map((a, i) => (
                      <div key={i} className={`route-alert route-alert-${severityBand(a.severity)}`}>
                        {INCIDENT_ICON[a.type] ?? '⚠️'} {reportTypeLabel(a.type)} · severity {a.severity}/5
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          {selectedRoute && (
            <Link
              className="start-nav-btn"
              to={`/app/map?${new URLSearchParams({ to: toParam, name: destinationName, route: selectedRoute.id, nav: '1' })}`}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, textDecoration: 'none' }}
            >
              <Play size={15} fill="currentColor" /> Start navigation · {routeLabel(selectedRoute)} (
              {formatDuration(selectedRoute.durationS)})
            </Link>
          )}
          <Link
            to={`/app/map?${new URLSearchParams({ to: toParam, name: destinationName })}`}
            style={{ display: 'block', textAlign: 'center', marginTop: 12, fontSize: 13, color: 'var(--primary)' }}
          >
            Open on the full map
          </Link>
        </>
      )}
    </div>
  )
}

function ScoreBar({ label, value }) {
  return (
    <div className="score-bar-row">
      <span className="score-bar-label">{label}</span>
      <div className="score-bar-track">
        <div className="score-bar-fill" style={{ width: `${value}%` }}></div>
      </div>
      <span className="score-bar-val">{value}</span>
    </div>
  )
}

export default RoutesPage
