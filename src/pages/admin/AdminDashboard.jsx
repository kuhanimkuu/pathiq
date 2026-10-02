import { useCallback, useEffect, useState } from 'react'
import { NavLink, Navigate, Route, Routes } from 'react-router-dom'
import { LayoutDashboard, Inbox, Gem, TriangleAlert, Users as UsersIcon, Wallet, ScrollText } from 'lucide-react'
import { useAuth } from '../../context/useAuth'
import { fetchOverview } from '../../lib/admin'
import Overview from './Overview'
import ReviewQueue from './ReviewQueue'
import GemsManager from './GemsManager'
import ReportsManager from './ReportsManager'
import Users from './Users'
import Payouts from './Payouts'
import AuditLog from './AuditLog'
import AdminUnlock from './AdminUnlock'
import { adminUnlockedUntil, useBefore } from './adminUtils'
import './admin.css'

const sections = [
  { to: '/app/admin', label: 'Overview', Icon: LayoutDashboard },
  { to: '/app/admin/review', label: 'Review queue', Icon: Inbox, badge: 'pending' },
  { to: '/app/admin/gems', label: 'Gems', Icon: Gem },
  { to: '/app/admin/reports', label: 'Road reports', Icon: TriangleAlert },
  { to: '/app/admin/users', label: 'Users & Scouts', Icon: UsersIcon },
  { to: '/app/admin/payouts', label: 'Payouts & rates', Icon: Wallet, badge: 'owed' },
  { to: '/app/admin/audit', label: 'Audit log', Icon: ScrollText },
]

// /app/admin/*. Non-admins are sent back to the app; admins must re-enter
// their password (good for an hour). The database enforces both: every admin
// function and every "or admin" policy needs the role and a recent password.
function AdminDashboard() {
  const { profile, session } = useAuth()
  const until = adminUnlockedUntil(session?.access_token)
  const unlocked = useBefore(until)
  // The server is the judge: if it says the password is stale (clock skew,
  // a session from elsewhere), lock until the next sign-in.
  const [serverLockedAt, setServerLockedAt] = useState(null)
  const lock = useCallback(() => setServerLockedAt(until), [until])

  if (!profile) return <div className="admin-page"><p className="list-row-sub">Loading…</p></div>
  if (profile.role !== 'admin') return <Navigate to="/app" replace />
  if (!unlocked || serverLockedAt === until) {
    return <AdminUnlock email={session?.user?.email} expired={until > 0} />
  }
  return <AdminConsole key={until} onLocked={lock} />
}

function AdminConsole({ onLocked }) {
  const [overview, setOverview] = useState(null)
  const [overviewError, setOverviewError] = useState('')

  // Overview numbers also drive the nav badges; pages call refresh() after
  // anything that changes a count.
  const refresh = useCallback(async () => {
    try {
      setOverview(await fetchOverview())
      setOverviewError('')
    } catch (err) {
      if (err.code === 'PT401') onLocked()
      else setOverviewError(err.message)
    }
  }, [onLocked])

  useEffect(() => {
    let cancelled = false
    fetchOverview()
      .then((o) => !cancelled && setOverview(o))
      .catch((err) => {
        if (cancelled) return
        if (err.code === 'PT401') onLocked()
        else setOverviewError(err.message)
      })
    return () => {
      cancelled = true
    }
  }, [onLocked])

  const badges = overview && {
    pending: overview.pending_gems + overview.pending_reports + overview.pending_applications,
    owed: overview.owed_scouts,
  }

  return (
    <div className="admin-page">
      <nav className="admin-nav" aria-label="Admin sections">
        <div className="admin-nav-title">Admin</div>
        {sections.map(({ to, label, Icon, badge }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/app/admin'}
            className={({ isActive }) => 'admin-nav-item' + (isActive ? ' active' : '')}
          >
            <Icon size={17} strokeWidth={1.9} />
            <span>{label}</span>
            {badge && badges?.[badge] > 0 && <span className="admin-count">{badges[badge]}</span>}
          </NavLink>
        ))}
      </nav>
      <section className="admin-main">
        <Routes>
          <Route index element={<Overview overview={overview} error={overviewError} />} />
          <Route path="review" element={<ReviewQueue overview={overview} onChanged={refresh} />} />
          <Route path="gems" element={<GemsManager onChanged={refresh} />} />
          <Route path="reports" element={<ReportsManager onChanged={refresh} />} />
          <Route path="users" element={<Users onChanged={refresh} />} />
          <Route path="payouts" element={<Payouts onChanged={refresh} />} />
          <Route path="audit" element={<AuditLog />} />
          <Route path="*" element={<Navigate to="/app/admin" replace />} />
        </Routes>
      </section>
    </div>
  )
}

export default AdminDashboard
