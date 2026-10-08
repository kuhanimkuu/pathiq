import { Link } from 'react-router-dom'
import Logo from './Logo'
import ThemeToggle from './ThemeToggle'

function TopBar() {
  return (
    <header className="top-bar">
      <Link to="/app" className="top-bar-logo" aria-label="PathIQ Navigators home">
        <Logo size={30} />
      </Link>
      <ThemeToggle className="top-bar-theme" showLabel />
    </header>
  )
}

export default TopBar
