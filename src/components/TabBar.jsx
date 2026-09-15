import { NavLink } from 'react-router-dom'

const tabs = [
  { to: '/', label: 'Home', icon: '🏠' },
  { to: '/map', label: 'Map', icon: '🗺️' },
  { to: '/routes', label: 'Routes', icon: '🧭' },
  { to: '/gems', label: 'Gems', icon: '💎' },
  { to: '/profile', label: 'Profile', icon: '👤' },
]

function TabBar() {
  return (
    <nav className="tab-bar">
      {tabs.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          end={tab.to === '/'}
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