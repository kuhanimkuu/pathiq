import { Link } from 'react-router-dom'
import Logo from './Logo'

function TopBar() {
  return (
    <header className="top-bar">
      <Link to="/app" className="top-bar-logo" aria-label="PathIQ Navigators home">
        <Logo size={30} />
      </Link>
    </header>
  )
}

export default TopBar
