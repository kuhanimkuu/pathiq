import { useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import StatCard from '../components/StatCard'
import { useUser } from '../context/useUser'
import { useAuth } from '../context/useAuth'
import { fetchMyScoutApplication, applyAsScout, MPESA_PHONE_PATTERN } from '../lib/scouts'
import { getInitialTheme, applyTheme } from '../lib/theme'

function Profile() {
  const { user, updateIQScore } = useUser()
  const { session, profile, isGuest, signOut, upgradeGuest } = useAuth()
  const navigate = useNavigate()
  const [notificationsOn, setNotificationsOn] = useState(true)
  const [darkMode, setDarkMode] = useState(() => getInitialTheme() === 'dark')

  function handleDarkModeChange(checked) {
    setDarkMode(checked)
    applyTheme(checked ? 'dark' : 'light')
  }
  const [upgradeError, setUpgradeError] = useState('')
  const [upgrading, setUpgrading] = useState(false)

  const [application, setApplication] = useState(null)
  const [applicationChecked, setApplicationChecked] = useState(false)
  const [applyError, setApplyError] = useState('')
  const [applying, setApplying] = useState(false)

  const userId = session?.user?.id
  const role = profile?.role ?? 'driver'
  const willCheckApplication = Boolean(userId) && !isGuest && role === 'driver'
  // Derived rather than its own state: avoids a synchronous setState in the
  // effect's skip branch (react-hooks/set-state-in-effect), and there's
  // nothing to derive it from until the fetch below actually resolves.
  const applicationLoading = willCheckApplication && !applicationChecked

  useEffect(() => {
    if (!willCheckApplication) return
    let cancelled = false
    fetchMyScoutApplication(userId)
      .then((app) => !cancelled && setApplication(app))
      .catch((err) => !cancelled && setApplyError(err.message))
      .finally(() => !cancelled && setApplicationChecked(true))
    return () => {
      cancelled = true
    }
  }, [willCheckApplication, userId])

  async function handleSignOut() {
    await signOut()
    navigate('/')
  }

  async function handleUpgrade(e) {
    e.preventDefault()
    setUpgradeError('')
    setUpgrading(true)
    const form = new FormData(e.target)
    try {
      await upgradeGuest(form.get('email'), form.get('password'), form.get('username'))
    } catch (err) {
      setUpgradeError(err.message)
    } finally {
      setUpgrading(false)
    }
  }

  async function handleApply(e) {
    e.preventDefault()
    setApplyError('')
    setApplying(true)
    const form = new FormData(e.target)
    const mpesaPhone = form.get('mpesaPhone')
    if (!MPESA_PHONE_PATTERN.test(mpesaPhone)) {
      setApplyError('M-Pesa number must look like 2547XXXXXXXX or 2541XXXXXXXX.')
      setApplying(false)
      return
    }
    try {
      await applyAsScout(userId, { area: form.get('area'), motivation: form.get('motivation'), mpesaPhone })
      setApplication({ status: 'pending' })
    } catch (err) {
      setApplyError(err.message)
    } finally {
      setApplying(false)
    }
  }

  return (
    <div className="profile-page">
      <h1 className="page-title">My Profile</h1>

      <div className="profile-header">
        <div className="profile-avatar">{user.name[0]}</div>
        <div>
          <div className="profile-name">{user.name}</div>
          <div className="profile-sub">IQ Score {user.iqScore} · Nairobi</div>
          <span className={`role-badge role-${isGuest ? 'guest' : role}`}>
            {isGuest ? 'Guest' : role}
          </span>
        </div>
      </div>

      <div className="stat-grid">
        <StatCard label="Trips this month" value={user.tripsThisMonth} />
        <StatCard label="Gems found" value={user.gemsFound} />
      </div>

      {user.isGuest && (
        <div className="section-card">
          <div className="section-title">Save your account</div>
          <p className="auth-sub" style={{ marginBottom: 14 }}>
            You&apos;re browsing as a guest. Add an email and password to keep your saved gems and trips.
          </p>
          {upgradeError && <p className="auth-error">{upgradeError}</p>}
          <form className="auth-form" onSubmit={handleUpgrade}>
            <label className="auth-label" htmlFor="upgrade-username">Username</label>
            <input id="upgrade-username" name="username" className="auth-input" type="text" minLength={3} required />
            <label className="auth-label" htmlFor="upgrade-email">Email</label>
            <input id="upgrade-email" name="email" className="auth-input" type="email" autoComplete="email" required />
            <label className="auth-label" htmlFor="upgrade-password">Password</label>
            <input id="upgrade-password" name="password" className="auth-input" type="password" autoComplete="new-password" minLength={6} required />
            <button type="submit" className="btn btn-primary btn-lg auth-btn" disabled={upgrading}>
              {upgrading ? 'Saving…' : 'Save account'}
            </button>
          </form>
        </div>
      )}

      {(role === 'scout' || role === 'admin') && (
        <div className="section-card">
          <div className="section-title">Scout tools</div>
          <p className="list-row-sub" style={{ marginBottom: 12 }}>
            {role === 'admin' ? "You're an admin." : "You're a verified Scout."} Submit road condition reports and
            new Hidden Gems for review.
          </p>
          <Link to="/app/scout" className="start-nav-btn" style={{ display: 'block', textAlign: 'center', textDecoration: 'none' }}>
            Open Scout tools
          </Link>
          {role === 'admin' && (
            <Link
              to="/app/admin"
              className="auth-guest-btn"
              style={{ display: 'block', textAlign: 'center', marginTop: 10, textDecoration: 'none' }}
            >
              Open admin review console
            </Link>
          )}
        </div>
      )}

      {role === 'driver' && !isGuest && (
        <div className="section-card">
          <div className="section-title">Become a Scout</div>
          {applicationLoading && <p className="list-row-sub">Loading…</p>}

          {!applicationLoading && application?.status === 'pending' && (
            <p className="list-row-sub">
              <span className="status-pill pending">Pending</span> Your application is awaiting review.
            </p>
          )}
          {!applicationLoading && application?.status === 'rejected' && (
            <p className="list-row-sub">
              <span className="status-pill rejected">Not approved</span> Your application wasn&apos;t approved this
              time.
            </p>
          )}

          {!applicationLoading && !application && (
            <>
              <p className="list-row-sub" style={{ marginBottom: 12 }}>
                Scouts verify roads and Hidden Gems, and earn via M-Pesa for approved submissions.
              </p>
              {applyError && <p className="auth-error">{applyError}</p>}
              <form className="auth-form" onSubmit={handleApply}>
                <label className="auth-label" htmlFor="apply-area">Area you'll cover</label>
                <input id="apply-area" name="area" className="auth-input" type="text" placeholder="e.g. Westlands, Nairobi" required />
                <label className="auth-label" htmlFor="apply-mpesa">M-Pesa number</label>
                <input id="apply-mpesa" name="mpesaPhone" className="auth-input" type="text" placeholder="2547XXXXXXXX" required />
                <label className="auth-label" htmlFor="apply-motivation">Why do you want to be a Scout? (optional)</label>
                <textarea id="apply-motivation" name="motivation" className="form-textarea" />
                <button type="submit" className="btn btn-primary btn-lg auth-btn" disabled={applying}>
                  {applying ? 'Submitting…' : 'Apply as a Scout'}
                </button>
              </form>
            </>
          )}
        </div>
      )}

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
              onChange={(e) => handleDarkModeChange(e.target.checked)}
            />
            <span className="toggle-slider"></span>
          </label>
        </div>

        <button className="auth-guest-btn" style={{ marginTop: 16 }} onClick={handleSignOut}>
          Sign out
        </button>
      </div>
    </div>
  )
}

export default Profile
