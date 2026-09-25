import { Link } from 'react-router-dom'
import { Plus } from 'lucide-react'

export default function HeroSection() {
  return (
    <section className="hero">
      <div className="hero-alert">
        <span className="dot dot-amber" /> 3 road alerts near CBD
      </div>
      <div className="hero-inner">
        <div className="hero-copy">
          <div className="pill pill-green">
            <span className="dot dot-green" /> Now live in Nairobi &middot; Expanding nationally
          </div>
          <h1>
            Navigate Kenya with the road intelligence <span className="accent">Google Maps</span> doesn&apos;t have.
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

        <Link to="/app/map" className="hero-map" aria-label="Open the live map">
          <svg viewBox="0 0 700 620" className="map-svg" aria-hidden="true">
            <line x1="60" y1="90" x2="450" y2="330" stroke="#1c3a2c" strokeWidth="2" />
            <line x1="230" y1="20" x2="450" y2="330" stroke="#1c3a2c" strokeWidth="2" />
            <line x1="450" y1="330" x2="640" y2="40" stroke="#1c3a2c" strokeWidth="2" />
            <line x1="450" y1="330" x2="660" y2="230" stroke="#1c3a2c" strokeWidth="2" />
            <line x1="450" y1="330" x2="560" y2="470" stroke="#1c3a2c" strokeWidth="2" />
            <line x1="450" y1="330" x2="330" y2="560" stroke="#1c3a2c" strokeWidth="2" />
            <path d="M60,560 Q150,480 260,420 T450,330" fill="none" stroke="#33d17a" strokeWidth="4" />
            <path d="M260,420 L300,380 L340,350" fill="none" stroke="#f5a623" strokeWidth="4" />
            {[
              [60, 90, 'Westlands'],
              [230, 20, 'Kasarani'],
              [640, 40, 'Thika Rd'],
              [450, 330, 'CBD'],
              [560, 470, 'Industrial'],
              [330, 560, 'Karen'],
              [60, 560, 'Langata'],
            ].map(([x, y, label]) => (
              <g key={label}>
                <circle cx={x} cy={y} r="7" fill="#0d1f16" stroke="#33d17a" strokeWidth="2" />
                <text x={x + 12} y={y + 4} className="map-label">{label}</text>
              </g>
            ))}
          </svg>

          <div className="hero-route-card">
            <div className="hero-route-card-label">Recommended route</div>
            <div className="hero-route-time">2h 12m</div>
            <div className="hero-route-meta">156 km &middot; CBD &rarr; Karen</div>
            <div className="hero-route-scores">
              <span className="score score-green">91</span>
              <span className="score score-amber">84</span>
              <span className="score score-blue">93</span>
            </div>
          </div>
          <span className="hero-map-cta">View the live map &rarr;</span>
        </Link>
      </div>
    </section>
  )
}
