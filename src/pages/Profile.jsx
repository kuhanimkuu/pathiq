import { useState } from 'react'
import StatCard from '../components/StatCard'
import { useUser } from '../context/UserContext'

function Profile() {
  const { user, updateIQScore } = useUser()
  const [notificationsOn, setNotificationsOn] = useState(true)
  const [darkMode, setDarkMode] = useState(true)

  return (
    <div className="profile-page">
      <h1 className="page-title">My Profile</h1>

      <div className="profile-header">
        <div className="profile-avatar">{user.name[0]}</div>
        <div>
          <div className="profile-name">{user.name}</div>
          <div className="profile-sub">IQ Score {user.iqScore} · Nairobi</div>
        </div>
      </div>

      <div className="stat-grid">
        <StatCard label="Trips this month" value={user.tripsThisMonth} />
        <StatCard label="Gems found" value={user.gemsFound} />
      </div>

      <div className="section-card">
        <div className="section-title">Settings</div>

        <button
            className="start-nav-btn"
            style={{ marginBottom: 16 }}
            onClick={() => updateIQScore(user.iqScore + 1)}
            >
            +1 IQ Score (test)
        </button>

        <div className="toggle-row">
          <span>Push notifications</span>
          <label className="toggle-switch">
            <input
              type="checkbox"
              checked={notificationsOn}
              onChange={(e) => setNotificationsOn(e.target.checked)}
            />
            <span className="toggle-slider"></span>
          </label>
        </div>

        <div className="toggle-row">
          <span>Dark mode</span>
          <label className="toggle-switch">
            <input
              type="checkbox"
              checked={darkMode}
              onChange={(e) => setDarkMode(e.target.checked)}
            />
            <span className="toggle-slider"></span>
          </label>
        </div>
      </div>
    </div>
  )
}

export default Profile