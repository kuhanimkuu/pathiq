import { useState } from 'react'
import { LockKeyhole } from 'lucide-react'
import { supabase } from '../../lib/supabase'

// Shown instead of the dashboard until the admin re-enters their password.
// Signing in again gives the session a fresh password time, which the
// database requires for anything admin (admin_auth_fresh() in the
// admin_dashboard migration). Wrong guesses are rate-limited by Supabase Auth.
function AdminUnlock({ email, expired }) {
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
          {expired
            ? 'It locked after an hour. Enter your password to keep going.'
            : 'Enter your password to open it. It stays unlocked for an hour.'}
        </p>
        {email ? (
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
          <p className="auth-error">This admin account has no email and password, so it can’t open the dashboard.</p>
        )}
      </div>
    </div>
  )
}

export default AdminUnlock
