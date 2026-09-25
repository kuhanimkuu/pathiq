import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { getCurrentPosition } from '../lib/gems'
import { planRoutes, formatDuration, routeLabel } from '../lib/routePlanning'

// Real route alternatives from the `routes` edge function, side by side with
// their scores. The destination comes from the map (`?to=lat,lng`); there's no
// address search yet, so without one this points the driver back to the map.
function RoutesPage() {
  const [searchParams] = useSearchParams()
  const to = searchParams.get('to')
  const name = searchParams.get('name') || 'Dropped pin'

  const [options, setOptions] = useState(null)
  const [selectedId, setSelectedId] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!to) return
    const [lat, lng] = to.split(',').map(Number)
    let cancelled = false
    async function run() {
      try {
        const origin = await getCurrentPosition()
        const result = await planRoutes(origin, { lat, lng })
        if (cancelled) return
        setOptions(result)
        setSelectedId(result[0].id)
        setError('')
      } catch (err) {
        if (!cancelled) setError(err.message)
      }
    }
    run()
    return () => {
      cancelled = true
    }
  }, [to])

  if (!to) {
    return (
      <div className="routes-page">
        <h1 className="page-title">Choose your route</h1>
        <p style={{ color: 'var(--muted-foreground)' }}>
          Pick a destination on the <Link to="/app/map">map</Link> — tap anywhere, or "Route here" on a gem — then
          compare routes here.
        </p>
      </div>
    )
  }

  const selectedRoute = options?.find((o) => o.id === selectedId)

  return (
    <div className="routes-page">
      <h1 className="page-title">Routes to {name}</h1>

      {error && <p className="auth-error">{error}</p>}
      {!error && !options && <p style={{ color: 'var(--muted-foreground)' }}>Finding routes…</p>}

      {options && (
        <>
          <div className="route-cards">
            {options.map((route) => (
              <div
                key={route.id}
                className={'route-card' + (route.id === selectedId ? ' selected' : '')}
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
              </div>
            ))}
          </div>

          <Link
            className="start-nav-btn"
            to={`/app/map?${new URLSearchParams({ to, name, route: selectedRoute.id, nav: '1' })}`}
            style={{ display: 'block', textAlign: 'center', textDecoration: 'none' }}
          >
            Start navigation — {routeLabel(selectedRoute)} ({formatDuration(selectedRoute.durationS)})
          </Link>
          <Link
            to={`/app/map?${new URLSearchParams({ to, name })}`}
            style={{ display: 'block', textAlign: 'center', marginTop: 12, fontSize: 13, color: 'var(--primary)' }}
          >
            View on map
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
