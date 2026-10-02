import { useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import StatCard from '../components/StatCard'
import { useUser } from '../context/useUser'
import { useAuth } from '../context/useAuth'
import { fetchMyScoutApplication, applyAsScout, MPESA_PHONE_PATTERN } from '../lib/scouts'
import { getInitialTheme, applyTheme } from '../lib/theme'
import { ensureNotificationPermission, notificationsSupported } from '../lib/driveAssist'
import { loadAlertPrefs, saveAlertPrefs, ALERT_CATEGORIES, DETOUR_CHOICES_MIN } from '../lib/alertPrefs'
import { canInstall, isInstalled, isIos, onInstallChange, promptInstall } from '../lib/installPrompt'

const CATEGORY_LABEL = {
  attractions: 'Attractions', hotels: 'Hotels', food: 'Food', scenic: 'Scenic', fuel: 'Fuel', facilities: 'Facilities',
}

function Profile() {
  const { user, refresh } = useUser()
  const { session, profile, isGuest, signOut, upgradeGuest, setNotificationsOn } = useAuth()
  const navigate = useNavigate()
  const [darkMode, setDarkMode] = useState(() => getInitialTheme() === 'dark')
  const [notifyNote, setNotifyNote] = useState('')
  const [alertPrefs, setAlertPrefs] = useState(loadAlertPrefs)
  const [installable, setInstallable] = useState(canInstall)

  // Stats and IQ Score change when a trip ends — refetch whenever Profile opens.
  useEffect(() => {
    refresh()
  }, [refresh])

  useEffect(() => onInstallChange(() => setInstallable(canInstall())), [])

  // Saved on the profile (notifications_on). Turning it on also asks the
  // browser for permission, which is what actually lets gem alerts reach you
  // when PathIQ isn't on screen.
  async function handleNotificationsChange(on) {
    setNotifyNote('')
    try {
      if (on && notificationsSupported()) {
        const granted = await ensureNotificationPermission()
        if (!granted) setNotifyNote('Notifications are blocked in your browser settings, so alerts will only show in the app.')
      }
      await setNotificationsOn(on)
    } catch (err) {
      setNotifyNote(err.message)
    }
  }

  function updateAlertPrefs(change) {
    setAlertPrefs((prev) => {
      const next = { ...prev, ...change }
      saveAlertPrefs(next)
      return next
    })
  }

  function toggleAlertCategory(cat) {
    const has = alertPrefs.categories.includes(cat)
    updateAlertPrefs({
      categories: has ? alertPrefs.categories.filter((c) => c !== cat) : [...alertPrefs.categories, cat],
    })
  }

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
          <div className="profile-sub">IQ Score {user.iqScore ?? '–'} · Nairobi</div>
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
              Open admin dashboard
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
              time.{application.review_note && <> Reason: {application.review_note}</>}
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
        <div className="section-title">Gem alerts while driving</div>
        <div className="toggle-row">
          <span>Tell me about Hidden Gems on my route</span>
          <label className="toggle-switch">
            <input
              type="checkbox"
              checked={alertPrefs.enabled}
              onChange={(e) => updateAlertPrefs({ enabled: e.target.checked })}
              aria-label="Gem alerts"
            />
            <span className="toggle-slider"></span>
          </label>
        </div>
        {alertPrefs.enabled && (
          <>
            <div className="settings-label">Longest detour</div>
            <div className="chip-row">
              {DETOUR_CHOICES_MIN.map((min) => (
                <button
                  key={min}
                  className={'chip' + (alertPrefs.maxDetourMin === min ? ' active' : '')}
                  onClick={() => updateAlertPrefs({ maxDetourMin: min })}
                >
                  {min} min
                </button>
              ))}
            </div>
            <div className="settings-label">Categories</div>
            <div className="chip-row">
              {ALERT_CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  className={'chip' + (alertPrefs.categories.includes(cat) ? ' active' : '')}
                  onClick={() => toggleAlertCategory(cat)}
                >
                  {CATEGORY_LABEL[cat]}
                </button>
              ))}
            </div>
            <p className="list-row-sub" style={{ marginTop: 10 }}>
              One alert as you approach a gem and one after you pass it, spoken aloud. Never more than once per gem
              per trip.
            </p>
          </>
        )}
      </div>

      {!isInstalled() && (
        <div className="section-card" id="install">
          <div className="section-title">Install the app</div>
          {installable ? (
            <>
              <p className="list-row-sub" style={{ marginBottom: 12 }}>
                Add PathIQ to your home screen: it opens full-screen, like a normal app, and loads even on weak signal.
              </p>
              <button className="home-route-btn" onClick={promptInstall}>Install PathIQ</button>
            </>
          ) : isIos() ? (
            <p className="list-row-sub">
              In Safari, tap the Share button, then <strong>Add to Home Screen</strong>.
            </p>
          ) : (
            <p className="list-row-sub">
              Open PathIQ in Chrome on your phone and choose <strong>Install app</strong> (or Add to Home screen) from
              the browser menu.
            </p>
          )}
        </div>
      )}

      <div className="section-card">
        <div className="section-title">Settings</div>

        <div className="toggle-row">
          <span>Notifications</span>
          <label className="toggle-switch">
            <input
              type="checkbox"
              checked={profile?.notifications_on ?? true}
              onChange={(e) => handleNotificationsChange(e.target.checked)}
              aria-label="Notifications"
            />
            <span className="toggle-slider"></span>
          </label>
        </div>
        {notifyNote && <p className="list-row-sub" style={{ marginTop: -4, marginBottom: 10 }}>{notifyNote}</p>}

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
        <p className="list-row-sub" style={{ marginTop: 14, textAlign: 'center' }}>
          <Link to="/privacy">Privacy</Link> · <Link to="/terms">Terms</Link>
        </p>
      </div>
    </div>
  )
}

export default Profile
