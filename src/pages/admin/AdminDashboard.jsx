import { useCallback, useEffect, useState } from 'react'
import { NavLink, Navigate, Route, Routes } from 'react-router-dom'
import { LayoutDashboard, Map as MapIcon, Inbox, Gem, TriangleAlert, Users as UsersIcon, Wallet, Gauge, Database, ScrollText, Newspaper, Mail } from 'lucide-react'
import { useAuth } from '../../context/useAuth'
import { fetchOverview } from '../../lib/admin'
import { countNewMessages } from '../../lib/company'
import Overview from './Overview'
import ReviewQueue from './ReviewQueue'
import GemsManager from './GemsManager'
import ReportsManager from './ReportsManager'
import Users from './Users'
import Payouts from './Payouts'
import AuditLog from './AuditLog'
import AdminMapPage from './AdminMapPage'
import GemDetail from './GemDetail'
import UserDetail from './UserDetail'
import Usage from './Usage'
import DataTools from './DataTools'
import AdminUnlock from './AdminUnlock'
import { BlogList, BlogEditor } from './BlogManager'
import Messages from './Messages'
import { adminUnlockedUntil, useBefore } from './adminUtils'
import './admin.css'

const sections = [
  { to: '/app/admin', label: 'Overview', Icon: LayoutDashboard },
  { to: '/app/admin/map', label: 'Map', Icon: MapIcon },
  { to: '/app/admin/review', label: 'Review queue', Icon: Inbox, badge: 'pending' },
  { to: '/app/admin/gems', label: 'Gems', Icon: Gem },
  { to: '/app/admin/reports', label: 'Road reports', Icon: TriangleAlert },
  { to: '/app/admin/users', label: 'Users & Scouts', Icon: UsersIcon },
  { to: '/app/admin/payouts', label: 'Payouts & rates', Icon: Wallet, badge: 'owed' },
  { to: '/app/admin/usage', label: 'Usage & costs', Icon: Gauge },
  { to: '/app/admin/blog', label: 'Blog', Icon: Newspaper },
  { to: '/app/admin/messages', label: 'Messages', Icon: Mail, badge: 'messages' },
  { to: '/app/admin/data', label: 'Data tools', Icon: Database },
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

  const [newMessages, setNewMessages] = useState(0)

  // Overview numbers also drive the nav badges; pages call refresh() after
  // anything that changes a count.
  const refresh = useCallback(async () => {
    countNewMessages().then(setNewMessages, () => {})
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
    countNewMessages().then((n) => !cancelled && setNewMessages(n), () => {})
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
    messages: newMessages,
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
          <Route path="map" element={<AdminMapPage onChanged={refresh} />} />
          <Route path="review" element={<ReviewQueue overview={overview} onChanged={refresh} />} />
          <Route path="gems" element={<GemsManager onChanged={refresh} />} />
          <Route path="gems/:id" element={<GemDetail onChanged={refresh} />} />
          <Route path="reports" element={<ReportsManager onChanged={refresh} />} />
          <Route path="users" element={<Users />} />
          <Route path="users/:id" element={<UserDetail onChanged={refresh} />} />
          <Route path="payouts" element={<Payouts onChanged={refresh} />} />
          <Route path="usage" element={<Usage />} />
          <Route path="blog" element={<BlogList />} />
          <Route path="blog/:id" element={<BlogEditor />} />
          <Route path="messages" element={<Messages onChanged={refresh} />} />
          <Route path="data" element={<DataTools onChanged={refresh} />} />
          <Route path="audit" element={<AuditLog />} />
          <Route path="*" element={<Navigate to="/app/admin" replace />} />
        </Routes>
      </section>
    </div>
  )
}

export default AdminDashboard
