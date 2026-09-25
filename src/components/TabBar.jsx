import { NavLink } from 'react-router-dom'
import { Home, Map, History, Gem, User } from 'lucide-react'

const tabs = [
  { to: '/app', label: 'Home', Icon: Home },
  { to: '/app/map', label: 'Map', Icon: Map },
  { to: '/app/history', label: 'History', Icon: History },
  { to: '/app/gems', label: 'Gems', Icon: Gem },
  { to: '/app/profile', label: 'Profile', Icon: User },
]

function TabBar() {
  return (
    <nav className="tab-bar">
      {tabs.map((tab) => (
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
