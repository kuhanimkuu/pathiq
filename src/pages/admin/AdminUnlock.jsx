import { useState } from 'react'
import { LockKeyhole } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/useAuth'
import GoogleButton from '../../components/GoogleButton'

// Shown instead of the dashboard until the admin re-enters their password,
// or signs in with Google again if that's how their account works.
// Signing in again gives the session a fresh password time, which the
// database requires for anything admin (admin_auth_fresh() in the
// admin_dashboard migration). Wrong guesses are rate-limited by Supabase Auth.
function AdminUnlock({ email, expired }) {
  const { hasGoogle: googleIdentity, googleEnabled, hasPassword, signInWithGoogle } = useAuth()
  const hasGoogle = googleIdentity && googleEnabled
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    setError('')
    const { error: err } = await supabase.auth.signInWithPassword({ email, password })
    setBusy(false)
    if (err) {
      setError(/invalid/i.test(err.message) ? 'That password isn’t right.' : err.message)
      return
    }
    // The new session arrives through onAuthStateChange and unlocks the page.
    setPassword('')
  }

  return (
    <div className="admin-unlock">
      <div className="admin-unlock-card">
        <span className="admin-unlock-icon">
          <LockKeyhole size={22} />
        </span>
        <h1>Admin dashboard</h1>
        <p>
          {expired ? 'It locked after an hour. ' : ''}
          {hasPassword ? 'Enter your password' : 'Confirm it’s you'}
          {expired ? ' to keep going.' : ' to open it. It stays unlocked for an hour.'}
        </p>
        {hasGoogle && (
          <>
            <GoogleButton label="Confirm with Google" onClick={() => signInWithGoogle('/app/admin')} onError={setError} />
            {hasPassword && <div className="auth-divider"><span>or with your password</span></div>}
          </>
        )}
        {hasPassword && email ? (
          <form onSubmit={submit}>
            <input type="email" value={email} autoComplete="username" readOnly hidden />
            <label className="admin-field">
              <span>Password for {email}</span>
              <input
                className="form-input"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoFocus
              />
            </label>
            {error && <p className="auth-error">{error}</p>}
            <button type="submit" className="admin-btn primary admin-unlock-btn" disabled={busy || !password}>
              {busy ? 'Checking…' : 'Unlock'}
            </button>
          </form>
        ) : (
          !hasGoogle && (
            <p className="auth-error">This admin account has no password or Google sign-in, so it can’t open the dashboard.</p>
          )
        )}
        {!hasPassword && error && <p className="auth-error">{error}</p>}
      </div>
    </div>
  )
}

export default AdminUnlock
