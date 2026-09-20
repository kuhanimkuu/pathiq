import { NavLink } from 'react-router-dom'

const tabs = [
  { to: '/app', label: 'Home', icon: '🏠' },
  { to: '/app/map', label: 'Map', icon: '🗺️' },
  { to: '/app/routes', label: 'Routes', icon: '🧭' },
  { to: '/app/gems', label: 'Gems', icon: '💎' },
  { to: '/app/profile', label: 'Profile', icon: '👤' },
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
          <span className="tab-icon">{tab.icon}</span>
          <span>{tab.label}</span>
        </NavLink>
      ))}
    </nav>
  )
}

export default TabBar