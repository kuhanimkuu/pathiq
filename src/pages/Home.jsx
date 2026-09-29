import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import StatCard from '../components/StatCard'
import { useUser } from '../context/useUser'
import { useAuth } from '../context/useAuth'
import { loadActiveTrip, resumeUrl } from '../lib/activeTrip'
import { formatDuration } from '../lib/routePlanning'
import { formatDistance } from '../lib/navigation'
import { fetchNearbyGems, getCurrentPosition } from '../lib/gems'
import { locationHelp } from '../lib/locationHelp'
import { fetchNearbyRoadReports, reportTypeLabel, timeAgo } from '../lib/roadReports'
import { GemBadge, ReportBadge } from '../components/PlaceIcons'
import { gemStyle } from '../lib/placeStyles'

function Home() {
  const { user, refresh } = useUser()
  const { session } = useAuth()
  const navigate = useNavigate()
  const [gems, setGems] = useState([])
  const [incidents, setIncidents] = useState([])
  const [loading, setLoading] = useState(true)
  const [usingFallbackLocation, setUsingFallbackLocation] = useState(null) // the reason, when there's no fix
  const [error, setError] = useState('')
  const [trip] = useState(loadActiveTrip)

  // Stats and IQ Score change when a trip ends — refetch whenever Home opens.
  useEffect(() => {
    refresh()
  }, [refresh])

  useEffect(() => {
    if (!session) return
    let cancelled = false

    async function load() {
      setLoading(true)
      setError('')
      try {
        const position = await getCurrentPosition()
        if (cancelled) return
        setUsingFallbackLocation(position.isFallback ? position.reason : null)
        const [gemRows, incidentRows] = await Promise.all([
          fetchNearbyGems(position.lat, position.lng),
          fetchNearbyRoadReports(position.lat, position.lng),
        ])
        if (cancelled) return
        setGems(gemRows)
        setIncidents(incidentRows)
      } catch (err) {
        if (!cancelled) setError(err.message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [session])

  return (
    <div className="home-page">
      <h1 className="page-title">Welcome back, {user.name} 👋</h1>

      {user.isGuest && (
        <div className="guest-banner">
          <span>You&apos;re browsing as a guest. Save an account to keep your data.</span>
          <button onClick={() => navigate('/app/profile')}>Save account</button>
        </div>
      )}

      <div className="iq-score-card">
        <div className="iq-ring">
          <span className="iq-number">{user.iqScore ?? '–'}</span>
        </div>
        <div>
          <div className="iq-label">Your IQ Score</div>
          <div className="iq-sub">
            {user.iqScore == null
              ? 'Finish a trip with navigation to get your score.'
              : 'Last 30 days: road quality of the routes you chose, trips completed, and staying on route.'}
          </div>
        </div>
      </div>

      <div className="stat-grid">
        <StatCard label="Trips this month" value={user.tripsThisMonth} />
        <StatCard label="Gems found" value={user.gemsFound} />
      </div>

      <div className="section-card">
        <div className="section-title">Active route</div>
        {trip ? (
          <>
            <div className="route-line">
              <strong>{trip.destinationName}</strong>
              <span>
                {formatDuration(trip.remainingS)} · {formatDistance(trip.remainingM)} left
              </span>
            </div>
            <div className="route-status">
              {trip.routeLabel} · road score {trip.roadQuality}
            </div>
            <button className="home-route-btn" onClick={() => navigate(resumeUrl(trip))}>
              Resume navigation
            </button>
          </>
        ) : (
          <>
            <p className="list-row-sub">No trip in progress.</p>
            <button className="home-route-btn" onClick={() => navigate('/app/map')}>
              Plan a route
            </button>
          </>
        )}
      </div>

      {error && <p className="auth-error">{error}</p>}
      {usingFallbackLocation && (
        <p className="list-row-sub" style={{ marginBottom: 12 }}>
          <b>{locationHelp(usingFallbackLocation).title}.</b> {locationHelp(usingFallbackLocation).detail} Showing
          results around Nairobi CBD for now.
        </p>
      )}

      <div className="section-card">
        <div className="section-title">Incidents near you</div>
        {loading && <p className="list-row-sub">Loading…</p>}
        {!loading && incidents.length === 0 && <p className="list-row-sub">No incidents reported nearby.</p>}
        {incidents.map((incident) => (
          <div key={incident.id} className="list-row">
            <ReportBadge type={incident.type} severity={incident.severity} size={34} />
            <div>
              <div className="list-row-title">{reportTypeLabel(incident.type)}</div>
              <div className="list-row-sub">
                Severity {incident.severity}/5 · {(incident.distance_m / 1000).toFixed(1)} km away · {timeAgo(incident.created_at)}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="section-card">
        <div className="section-title">Gems near you</div>
        {loading && <p className="list-row-sub">Loading…</p>}
        {!loading && gems.length === 0 && <p className="list-row-sub">No gems found nearby yet.</p>}
        {gems.map((gem) => (
          <div key={gem.id} className="list-row">
            <GemBadge category={gem.category} size={34} />
            <div>
              <div className="list-row-title">{gem.name}</div>
              <div className="list-row-sub">
                {gemStyle(gem.category).label} · {(gem.distance_m / 1000).toFixed(1)} km away
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default Home
