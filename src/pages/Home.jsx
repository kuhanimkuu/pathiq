import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import StatCard from '../components/StatCard'
import { useUser } from '../context/useUser'
import { useAuth } from '../context/useAuth'
import { activeRoute } from '../data/mockData'
import { fetchNearbyGems, getCurrentPosition } from '../lib/gems'
import { fetchNearbyRoadReports, severityBand, reportTypeLabel, timeAgo } from '../lib/roadReports'

function Home() {
  const { user } = useUser()
  const { session } = useAuth()
  const navigate = useNavigate()
  const [gems, setGems] = useState([])
  const [incidents, setIncidents] = useState([])
  const [loading, setLoading] = useState(true)
  const [usingFallbackLocation, setUsingFallbackLocation] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!session) return
    let cancelled = false

    async function load() {
      setLoading(true)
      setError('')
      try {
        const position = await getCurrentPosition()
        if (cancelled) return
        setUsingFallbackLocation(position.isFallback)
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
          <span className="iq-number">{user.iqScore}</span>
        </div>
        <div>
          <div className="iq-label">Your IQ Score</div>
          <div className="iq-sub">Based on your last 30 days of driving</div>
        </div>
      </div>

      <div className="stat-grid">
        <StatCard label="Trips this month" value={user.tripsThisMonth} />
        <StatCard label="Gems found" value={user.gemsFound} />
      </div>

      <div className="section-card">
        <div className="section-title">Active route</div>
        <div className="route-line">
          <strong>{activeRoute.destination}</strong>
          <span>{activeRoute.eta} · {activeRoute.distance}</span>
        </div>
        <div className="route-status">{activeRoute.status}</div>
      </div>

      {error && <p className="auth-error">{error}</p>}
      {usingFallbackLocation && (
        <p className="list-row-sub" style={{ marginBottom: 12 }}>
          Location unavailable — showing results around Nairobi CBD instead.
        </p>
      )}

      <div className="section-card">
        <div className="section-title">Incidents near you</div>
        {loading && <p className="list-row-sub">Loading…</p>}
        {!loading && incidents.length === 0 && <p className="list-row-sub">No incidents reported nearby.</p>}
        {incidents.map((incident) => (
          <div key={incident.id} className="list-row">
            <span className={`severity-dot severity-${severityBand(incident.severity)}`}></span>
            <div>
              <div className="list-row-title">{reportTypeLabel(incident.type)}</div>
              <div className="list-row-sub">{timeAgo(incident.created_at)}</div>
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
            <div>
              <div className="list-row-title">{gem.name}</div>
              <div className="list-row-sub">
                {gem.category} · {(gem.distance_m / 1000).toFixed(1)} km away
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default Home
