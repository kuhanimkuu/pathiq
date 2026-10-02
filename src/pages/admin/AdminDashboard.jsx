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

// /app/admin/*. The data is protected by the database (every admin_* function
// checks the caller); this check only decides what to render.
function AdminDashboard() {
  const { profile } = useAuth()
  const isAdmin = profile?.role === 'admin'
  const [overview, setOverview] = useState(null)
  const [overviewError, setOverviewError] = useState('')

  // Overview numbers also drive the nav badges; pages call refresh() after
  // anything that changes a count.
  const refresh = useCallback(async () => {
    try {
      setOverview(await fetchOverview())
      setOverviewError('')
    } catch (err) {
      setOverviewError(err.message)
    }
  }, [])

  useEffect(() => {
    if (!isAdmin) return
    let cancelled = false
    fetchOverview()
      .then((o) => !cancelled && setOverview(o))
      .catch((err) => !cancelled && setOverviewError(err.message))
    return () => {
      cancelled = true
    }
  }, [isAdmin])

  if (!profile) return <div className="admin-page"><p className="list-row-sub">Loading…</p></div>
  if (!isAdmin) {
    return (
      <div className="profile-page">
        <h1 className="page-title">Admin</h1>
        <p className="list-row-sub">This area is for admins only.</p>
      </div>
    )
  }

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
