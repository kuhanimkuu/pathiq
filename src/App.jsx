import { useEffect, useRef, useState } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import TopBar from './components/TopBar'
import TabBar from './components/TabBar'
import MarketingLayout from './pages/marketing/MarketingLayout'
import MarketingHome from './pages/marketing/Home'
import HiddenGemsPage from './pages/marketing/HiddenGemsPage'
import MapFeaturePage from './pages/marketing/MapFeaturePage'
import ScoutProgramPage from './pages/marketing/ScoutProgramPage'
import DevelopersPage from './pages/marketing/DevelopersPage'
import PricingPage from './pages/marketing/PricingPage'
import { PrivacyPage, TermsPage } from './pages/marketing/LegalPages'
import Home from './pages/Home'
import MapPage from './pages/MapPage'
import HistoryPage from './pages/HistoryPage'
import Gems from './pages/Gems'
import Profile from './pages/Profile'
import AdminDashboard from './pages/admin/AdminDashboard'
import ScoutSubmit from './pages/ScoutSubmit'
import { useAuth } from './context/useAuth'
import './App.css'

// /app/* needs a session, but never shows an auth wall to get one — arriving
// with no session silently starts a guest one, the same way opening Google
// Maps just works. Explicit sign-in/sign-up stays reachable from the
// marketing nav for people who want a real account up front.
function RequireSession({ children }) {
  const { session, loading, continueAsGuest } = useAuth()
  const attemptedGuest = useRef(false)
  const [guestFailed, setGuestFailed] = useState(false)

  useEffect(() => {
    if (loading || session || attemptedGuest.current) return
    attemptedGuest.current = true
    continueAsGuest().catch(() => setGuestFailed(true))
  }, [loading, session, continueAsGuest])

  if (guestFailed) {
    return (
      <div className="app-loading">
        Couldn&apos;t start a session — check your connection and reload.
      </div>
    )
  }
  if (loading || !session) {
    return <div className="app-loading">Loading…</div>
  }
  return children
}

function useOnline() {
  const [online, setOnline] = useState(() => navigator.onLine)
  useEffect(() => {
    const update = () => setOnline(navigator.onLine)
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => {
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
    }
  }, [])
  return online
}

// Route planning moved onto the map; the old Routes tab is now History. Old
// links keep working: with a destination they open it on the map, otherwise History.
function RoutesRedirect() {
  const { search } = useLocation()
  const params = new URLSearchParams(search)
  return <Navigate to={params.get('to') ? `/app/map${search}` : '/app/history'} replace />
}

function AppShell() {
  const online = useOnline()
  const { authNotice, clearAuthNotice } = useAuth()
  return (
    <div className="app-shell">
      <TopBar />
      <main className="app-content">
        {!online && (
          <div className="offline-banner" role="status">
            You&apos;re offline. Maps, routes and live data come back when you reconnect.
          </div>
        )}
        {authNotice && (
          <div className="offline-banner auth-notice" role="alert">
            <span>{authNotice}</span>
            <button type="button" onClick={clearAuthNotice} aria-label="Dismiss">
              &times;
            </button>
          </div>
        )}
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/map" element={<MapPage />} />
          <Route path="/history" element={<HistoryPage />} />
          <Route path="/routes" element={<RoutesRedirect />} />
          <Route path="/gems" element={<Gems />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/scout" element={<ScoutSubmit />} />
          <Route path="/admin/*" element={<AdminDashboard />} />
        </Routes>
      </main>
      <TabBar />
    </div>
  )
}

function App() {
  return (
    <Routes>
      <Route element={<MarketingLayout />}>
        <Route path="/" element={<MarketingHome />} />
        {/* Road Conditions and Route Intelligence merged into /map — see
            MapFeaturePage.jsx. Redirects here so no old link 404s. */}
        <Route path="/product" element={<Navigate to="/map" replace />} />
        <Route path="/route-intelligence" element={<Navigate to="/map" replace />} />
        <Route path="/hidden-gems" element={<HiddenGemsPage />} />
        <Route path="/map" element={<MapFeaturePage />} />
        <Route path="/scout-program" element={<ScoutProgramPage />} />
        <Route path="/developers" element={<DevelopersPage />} />
        <Route path="/pricing" element={<PricingPage />} />
        <Route path="/privacy" element={<PrivacyPage />} />
        <Route path="/terms" element={<TermsPage />} />
      </Route>
      <Route
        path="/app/*"
        element={
          <RequireSession>
            <AppShell />
          </RequireSession>
        }
      />
    </Routes>
  )
}

export default App
