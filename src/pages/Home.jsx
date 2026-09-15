import StatCard from '../components/StatCard'
import { useUser } from '../context/UserContext'
import { activeRoute, nearbyIncidents, nearbyGems } from '../data/mockData'

function Home() {
  const { user } = useUser()

  return (
    <div className="home-page">
      <h1 className="page-title">Welcome back, {user.name} 👋</h1>

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

      <div className="section-card">
        <div className="section-title">Incidents near you</div>
        {nearbyIncidents.map((incident) => (
          <div key={incident.id} className="list-row">
            <span className={`severity-dot severity-${incident.severity}`}></span>
            <div>
              <div className="list-row-title">{incident.type} — {incident.location}</div>
              <div className="list-row-sub">{incident.reportedAgo}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="section-card">
        <div className="section-title">Gems on your usual routes</div>
        {nearbyGems.map((gem) => (
          <div key={gem.id} className="list-row">
            <div>
              <div className="list-row-title">{gem.name}</div>
              <div className="list-row-sub">{gem.category} · {gem.detour} detour</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default Home