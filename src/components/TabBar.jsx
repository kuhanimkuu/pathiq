import { NavLink } from 'react-router-dom'
import { Home, Map, History, Gem, User, ShieldCheck } from 'lucide-react'
import { useAuth } from '../context/useAuth'

const tabs = [
  { to: '/app', label: 'Home', Icon: Home },
  { to: '/app/map', label: 'Map', Icon: Map },
  { to: '/app/history', label: 'History', Icon: History },
  { to: '/app/gems', label: 'Gems', Icon: Gem },
  { to: '/app/profile', label: 'Profile', Icon: User },
]

const adminTab = { to: '/app/admin', label: 'Admin', Icon: ShieldCheck }

function TabBar() {
  const { profile } = useAuth()
  // Admins get the dashboard in the nav; the database is what actually guards it.
  const items = profile?.role === 'admin' ? [...tabs, adminTab] : tabs
  return (
    <nav className="tab-bar">
      {items.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          end={tab.to === '/app'}
          className={({ isActive }) => 'tab-item' + (isActive ? ' active' : '')}
        >
          <span className="tab-icon">
            <tab.Icon size={19} strokeWidth={1.8} />
          </span>
          <span>{tab.label}</span>
        </NavLink>
      ))}
    </nav>
  )
}

export default TabBar
