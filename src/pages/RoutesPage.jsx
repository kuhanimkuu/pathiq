import { useState } from 'react'
import { routeOptions } from '../data/mockData'

function RoutesPage() {
  const [selectedId, setSelectedId] = useState('recommended')

  const selectedRoute = routeOptions.find((route) => route.id === selectedId)

  return (
    <div className="routes-page">
      <h1 className="page-title">Choose your route</h1>

      <div className="route-cards">
        {routeOptions.map((route) => (
          <div
            key={route.id}
            className={'route-card' + (route.id === selectedId ? ' selected' : '')}
            onClick={() => setSelectedId(route.id)}
          >
            <div className="route-tag">{route.tag}</div>
            <div className="route-time">{route.time}</div>
            <div className="route-dist">{route.distance}</div>

            <ScoreBar label="Road quality" value={route.roadQuality} />
            <ScoreBar label="Traffic" value={route.traffic} />
            <ScoreBar label="Incidents" value={route.incidents} />
          </div>
        ))}
      </div>

      <button className="start-nav-btn">
        Start navigation — {selectedRoute.tag} ({selectedRoute.time})
      </button>
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