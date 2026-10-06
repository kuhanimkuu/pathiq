import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus } from 'lucide-react'
import HeroMap from './HeroMap'

export default function HeroSection() {
  // Live road reports around Nairobi (the hero map's area), from its data.
  const [alertCount, setAlertCount] = useState(0)
  return (
    <section className="hero">
      {alertCount > 0 && (
        <Link to="/app/map" className="hero-alert">
          <span className="dot dot-amber" /> {alertCount} road alert{alertCount === 1 ? '' : 's'} in Nairobi
        </Link>
      )}
      <div className="hero-inner">
        <div className="hero-copy">
          <div className="pill pill-green">
            <span className="dot dot-green" /> Works anywhere &middot; Built in Nairobi
          </div>
          <h1>
            Navigate with the road intelligence <span className="accent">Google Maps</span> doesn&apos;t have.
          </h1>
          <p className="hero-sub">
            PathIQ Navigators combines real road conditions, traffic intelligence and community-verified places to
            help you choose better routes and discover more.
          </p>
          <div className="hero-ctas">
            <Link to="/app/map" className="btn btn-primary btn-lg">
              <Plus size={16} strokeWidth={2.5} /> Open the map
            </Link>
            <Link to="/scout-program" className="btn btn-outline btn-lg">Become a Scout</Link>
          </div>
          <div className="stat-row">
            <div className="stat">
              <div className="stat-num">42K+</div>
              <div className="stat-label">Active drivers</div>
            </div>
            <div className="stat">
              <div className="stat-num">18K+</div>
              <div className="stat-label">Verified places</div>
            </div>
            <div className="stat">
              <div className="stat-num">1,284</div>
              <div className="stat-label">Active Scouts</div>
            </div>
            <div className="stat">
              <div className="stat-num">1.8M</div>
              <div className="stat-label">Routes navigated</div>
            </div>
          </div>
        </div>

        <HeroMap onData={({ reports }) => setAlertCount(reports.length)} />
      </div>
    </section>
  )
}
