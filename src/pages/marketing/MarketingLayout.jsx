import { useState } from 'react'
import { Outlet, Link, useNavigate, useLocation } from 'react-router-dom'
import { Menu, X } from 'lucide-react'
import { useAuth } from '../../context/useAuth'
import '../Landing.css'
import Logo from '../../components/Logo'
import ThemeToggle from '../../components/ThemeToggle'
import GoogleButton from '../../components/GoogleButton'

// Map-first, kept minimal for the casual driver — no Pricing or Developers
// here, those are for the developer/business tiers, not the main nav. Road
// Conditions and Route Intelligence live inside /map now, not as their own
// items — see the "pathiq-tiered-user-access" memory for the full reasoning.
const navLinks = [
  { to: '/app/map', label: 'Map' },
  { to: '/hidden-gems', label: 'Hidden Gems' },
  { to: '/scout-program', label: 'Scout Program' },
]

function MarketingLayout() {
  const [showAuth, setShowAuth] = useState(false)
  // Mobile menu (<980px, where .nav-links is hidden). Closes on navigation.
  const location = useLocation()
  const [menuPath, setMenuPath] = useState(null)
  const menuOpen = menuPath === location.pathname
  const [authView, setAuthView] = useState('signin') // 'signin' | 'signup'
  const [authLoading, setAuthLoading] = useState(false)
  const [authError, setAuthError] = useState('')
  const navigate = useNavigate()
  const { signIn, signUp, continueAsGuest, signInWithGoogle, googleEnabled, authNotice, clearAuthNotice } = useAuth()

  // Only "Sign in" opens this now. Every other "enter the app" CTA is a
  // plain <Link to="/app/..."> — RequireSession (App.jsx) silently starts a
  // guest session if there isn't one already, so viewing the map or gems
  // never shows an auth step at all, the same way opening Google Maps does.
  function openSignIn(e) {
    e.preventDefault()
    setAuthView('signin')
    setAuthError('')
    setShowAuth(true)
  }

  function closeAuth() {
    setShowAuth(false)
    setAuthError('')
  }

  function switchAuthView(view) {
    setAuthView(view)
    setAuthError('')
  }

  async function handleSignIn(e) {
    e.preventDefault()
    setAuthError('')
    setAuthLoading(true)
    const form = new FormData(e.target)
    try {
      await signIn(form.get('email'), form.get('password'))
      setShowAuth(false)
      navigate('/app')
    } catch (err) {
      setAuthError(err.message)
    } finally {
      setAuthLoading(false)
    }
  }

  async function handleSignUp(e) {
    e.preventDefault()
    setAuthError('')
    setAuthLoading(true)
    const form = new FormData(e.target)
    try {
      await signUp(form.get('email'), form.get('password'), form.get('username'))
      setShowAuth(false)
      navigate('/app')
    } catch (err) {
      setAuthError(err.message)
    } finally {
      setAuthLoading(false)
    }
  }

  async function handleGuest() {
    setAuthError('')
    setAuthLoading(true)
    try {
      await continueAsGuest()
      setShowAuth(false)
      navigate('/app')
    } catch (err) {
      setAuthError(err.message)
    } finally {
      setAuthLoading(false)
    }
  }

  return (
    <div className="landing">
      {authNotice && (
        <div className="offline-banner auth-notice landing-auth-notice" role="alert">
          <span>{authNotice}</span>
          <button type="button" onClick={clearAuthNotice} aria-label="Dismiss">
            &times;
          </button>
        </div>
      )}
      {showAuth && (
        <div className="auth-overlay" onClick={closeAuth}>
          <div className="auth-modal" onClick={(e) => e.stopPropagation()}>
            <button className="auth-close" onClick={closeAuth} aria-label="Close">
              &times;
            </button>
            <div className="brand auth-brand">
              <Logo size={30} />
            </div>

            {authView === 'signin' && (
              <>
                <h3>Sign in</h3>
                <p className="auth-sub">Welcome back. Enter your details to continue.</p>
                {authError && <p className="auth-error">{authError}</p>}
                {googleEnabled && (
                  <>
                    <GoogleButton onClick={() => signInWithGoogle('/app')} onError={setAuthError} />
                    <div className="auth-divider"><span>or with email</span></div>
                  </>
                )}
                <form className="auth-form" onSubmit={handleSignIn}>
                  <label className="auth-label" htmlFor="signin-email">Email</label>
                  <input id="signin-email" name="email" className="auth-input" type="email" autoComplete="email" required />
                  <label className="auth-label" htmlFor="signin-password">Password</label>
                  <input id="signin-password" name="password" className="auth-input" type="password" autoComplete="current-password" required />
                  <button type="submit" className="btn btn-primary btn-lg auth-btn" disabled={authLoading}>
                    {authLoading ? 'Signing in…' : 'Sign in'}
                  </button>
                </form>
                <p className="auth-switch">
                  Don&apos;t have an account?{' '}
                  <button className="auth-link" onClick={() => switchAuthView('signup')}>Sign up</button>
                </p>
                <button className="auth-guest-btn" onClick={handleGuest} disabled={authLoading}>
                  Continue as guest
                </button>
              </>
            )}

            {authView === 'signup' && (
              <>
                <h3>Create your account</h3>
                <p className="auth-sub">Join PathIQ Navigators to get started.</p>
                {authError && <p className="auth-error">{authError}</p>}
                {googleEnabled && (
                  <>
                    <GoogleButton onClick={() => signInWithGoogle('/app')} onError={setAuthError} />
                    <div className="auth-divider"><span>or with email</span></div>
                  </>
                )}
                <form className="auth-form" onSubmit={handleSignUp}>
                  <label className="auth-label" htmlFor="signup-username">Username</label>
                  <input id="signup-username" name="username" className="auth-input" type="text" autoComplete="username" minLength={3} required />
                  <label className="auth-label" htmlFor="signup-email">Email</label>
                  <input id="signup-email" name="email" className="auth-input" type="email" autoComplete="email" required />
                  <label className="auth-label" htmlFor="signup-password">Password</label>
                  <input id="signup-password" name="password" className="auth-input" type="password" autoComplete="new-password" minLength={6} required />
                  <button type="submit" className="btn btn-primary btn-lg auth-btn" disabled={authLoading}>
                    {authLoading ? 'Creating account…' : 'Create account'}
                  </button>
                </form>
                <p className="auth-switch">
                  Already have an account?{' '}
                  <button className="auth-link" onClick={() => switchAuthView('signin')}>Sign in</button>
                </p>
                <button className="auth-guest-btn" onClick={handleGuest} disabled={authLoading}>
                  Continue as guest
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* NAV */}
      <header className="nav">
        <div className="nav-inner">
          <Link to="/" className="brand" aria-label="PathIQ Navigators home">
            <Logo size={32} />
          </Link>
          <nav className="nav-links">
            {navLinks.map((link) => (
              <Link key={link.to} to={link.to}>{link.label}</Link>
            ))}
          </nav>
          <div className="nav-actions">
            <ThemeToggle className="nav-theme" />
            <a href="/signin" className="link-plain nav-signin" onClick={openSignIn}>Sign in</a>
            <Link to="/app/map" className="btn btn-primary">Open the map</Link>
            <button
              className="nav-menu-btn"
              onClick={() => setMenuPath(menuOpen ? null : location.pathname)}
              aria-label={menuOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={menuOpen}
            >
              {menuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>
        {menuOpen && (
          <nav className="nav-mobile">
            {navLinks.map((link) => (
              <Link key={link.to} to={link.to}>{link.label}</Link>
            ))}
            <a
              href="/signin"
              onClick={(e) => {
                setMenuPath(null)
                openSignIn(e)
              }}
            >
              Sign in
            </a>
          </nav>
        )}
      </header>

      <Outlet />

      {/* FOOTER — the fuller link set (incl. Developers/Pricing) stays here;
          it's opt-in scrolling, not the first thing a casual visitor sees. */}
      <footer className="footer">
        <div className="footer-top">
          <div className="footer-brand">
            <div className="brand">
              <Logo size={32} />
            </div>
            <p>Navigation and geographic intelligence, built from the road up.</p>
            <div className="tag-row">
              <span className="tag tag-grey">Built in Nairobi</span>
              <span className="tag tag-green">Live</span>
            </div>
          </div>

          <div className="footer-col">
            <div className="footer-heading">Product</div>
            <Link to="/app/map">Live Map</Link>
            <Link to="/map">Road conditions &amp; routing</Link>
            <Link to="/hidden-gems">Hidden Gems</Link>
            <Link to="/app/profile">Mobile App</Link>
          </div>

          <div className="footer-col">
            <div className="footer-heading">Scouts</div>
            <Link to="/scout-program">Become a Scout</Link>
            <a href="#">Scout Portal</a>
            <a href="#">Earnings</a>
            <a href="#">Training</a>
            <a href="#">Community</a>
          </div>

          <div className="footer-col">
            <div className="footer-heading">Developers</div>
            <Link to="/developers">API Overview</Link>
            <a href="#">Documentation</a>
            <Link to="/pricing">Pricing</Link>
            <a href="#">Status</a>
            <a href="#">Changelog</a>
          </div>

          <div className="footer-col">
            <div className="footer-heading">Company</div>
            <a href="#">About</a>
            <a href="#">Blog</a>
            <a href="#">Careers</a>
            <a href="#">Press</a>
            <a href="#">Contact</a>
          </div>
        </div>

        <div className="footer-bottom">
          <span>&copy; 2026 PathIQ Navigators Ltd. All rights reserved.</span>
          <div className="footer-legal">
            <Link to="/privacy">Privacy Policy</Link>
            <Link to="/terms">Terms of Use</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}

export default MarketingLayout
