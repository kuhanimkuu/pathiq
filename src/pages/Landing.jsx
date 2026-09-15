import { useState } from 'react';
import {
  CircleDashed,
  Waves,
  Construction,
  Satellite,
  Car,
  TriangleAlert,
  Truck,
  Bus,
  Landmark,
  Code2,
  Plane,
  CarFront,
  Smartphone,
  Star,
  MapPin,
  BadgeCheck,
  Plus,
} from 'lucide-react';
import './Landing.css';

const conditionColor = {
  orange: 'var(--amber)',
  blue: 'var(--blue)',
  purple: 'var(--purple)',
  green: 'var(--green)',
  red: 'var(--red)',
};

export default function Landing() {
  const [showAuth, setShowAuth] = useState(false);
  const [authView, setAuthView] = useState('signin'); // 'signin' | 'signup'

  function requireAuth(e) {
    e.preventDefault();
    setAuthView('signin');
    setShowAuth(true);
  }

  function closeAuth() {
    setShowAuth(false);
  }

  function handleSignIn(e) {
    e.preventDefault();
    // TODO: wire up to your auth backend
    console.log('Sign in submitted');
  }

  function handleSignUp(e) {
    e.preventDefault();
    // TODO: wire up to your auth backend
    console.log('Sign up submitted');
  }

  return (
    <div className="landing">
      {showAuth && (
        <div className="auth-overlay" onClick={closeAuth}>
          <div className="auth-modal" onClick={(e) => e.stopPropagation()}>
            <button className="auth-close" onClick={closeAuth} aria-label="Close">
              &times;
            </button>
            <div className="brand auth-brand">
              <span className="brand-mark" />
              <span className="brand-name">PathIQ Navigators</span>
            </div>

            {authView === 'signin' && (
              <>
                <h3>Sign in</h3>
                <p className="auth-sub">Welcome back. Enter your details to continue.</p>
                <form className="auth-form" onSubmit={handleSignIn}>
                  <label className="auth-label" htmlFor="signin-username">Username</label>
                  <input id="signin-username" className="auth-input" type="text" autoComplete="username" required />
                  <label className="auth-label" htmlFor="signin-password">Password</label>
                  <input id="signin-password" className="auth-input" type="password" autoComplete="current-password" required />
                  <button type="submit" className="btn btn-primary btn-lg auth-btn">Sign in</button>
                </form>
                <p className="auth-switch">
                  Don&apos;t have an account?{' '}
                  <button className="auth-link" onClick={() => setAuthView('signup')}>Sign up</button>
                </p>
              </>
            )}

            {authView === 'signup' && (
              <>
                <h3>Create your account</h3>
                <p className="auth-sub">Join PathIQ Navigators to get started.</p>
                <form className="auth-form" onSubmit={handleSignUp}>
                  <label className="auth-label" htmlFor="signup-username">Username</label>
                  <input id="signup-username" className="auth-input" type="text" autoComplete="username" required />
                  <label className="auth-label" htmlFor="signup-email">Email</label>
                  <input id="signup-email" className="auth-input" type="email" autoComplete="email" required />
                  <label className="auth-label" htmlFor="signup-password">Password</label>
                  <input id="signup-password" className="auth-input" type="password" autoComplete="new-password" required />
                  <button type="submit" className="btn btn-primary btn-lg auth-btn">Create account</button>
                </form>
                <p className="auth-switch">
                  Already have an account?{' '}
                  <button className="auth-link" onClick={() => setAuthView('signin')}>Sign in</button>
                </p>
              </>
            )}
          </div>
        </div>
      )}



      {/* NAV */}
      <header className="nav">
        <div className="nav-inner">
          <div className="brand">
            <span className="brand-mark" />
            <span className="brand-name">PathIQ Navigators</span>
          </div>
          <nav className="nav-links">
            <a href="#product">Product</a>
            <a href="#route-intelligence">Route Intelligence</a>
            <a href="#hidden-gems">Hidden Gems</a>
            <a href="#scout-program">Scout Program</a>
            <a href="#api">API</a>
            <a href="#business">Business</a>
            <a href="#pricing">Pricing</a>
          </nav>
          <div className="nav-actions">
            <a href="/signin" className="link-plain" onClick={requireAuth}>Sign in</a>
            <a href="/app" className="btn btn-primary" onClick={requireAuth}>Open PathIQ Navigators</a>
          </div>
        </div>
      </header>

      {/* HERO */}
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
              <a href="/app" className="btn btn-primary btn-lg" onClick={requireAuth}>
                <Plus size={16} strokeWidth={2.5} /> Explore PathIQ Navigators
              </a>
              <a href="#scout-program" className="btn btn-outline btn-lg" onClick={requireAuth}>Become a Scout</a>
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

          <div className="hero-map">
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

            <div className="route-card">
              <div className="route-card-label">Recommended route</div>
              <div className="route-time">2h 12m</div>
              <div className="route-meta">156 km &middot; CBD &rarr; Karen</div>
              <div className="route-scores">
                <span className="score score-green">91</span>
                <span className="score score-amber">84</span>
                <span className="score score-blue">93</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ROAD CONDITIONS */}
      <section id="product" className="section conditions">
        <div className="conditions-inner">
          <div className="conditions-copy">
            <div className="pill pill-amber">Road Conditions</div>
            <h2>Real roads. Real conditions.</h2>
            <p>
              Our platform aggregates data from Scouts on the ground, connected vehicles, satellite imagery and
              community reports to build Kenya&apos;s most complete road intelligence layer.
            </p>
            <div className="insight-card">
              <div className="insight-label">Example insight</div>
              <p>
                &ldquo;3.2 km of Ngong Road between Kilimani and Karen has poor surface conditions. Two pothole
                clusters reported in the last 24 hours. Confidence: 94%.&rdquo;
              </p>
              <div className="tag-row">
                <span className="tag tag-green">AI-assisted</span>
                <span className="tag tag-grey">Scout-verified</span>
                <span className="tag tag-blue">Live data</span>
              </div>
            </div>
          </div>

          <div className="conditions-grid">
            {[
              { icon: CircleDashed, num: '12,482', label: 'Potholes', desc: 'Reported and verified by Scouts and sensors', color: 'orange' },
              { icon: Waves, num: '284', label: 'Flooding', desc: 'Real-time flood zone detection and alerts', color: 'blue' },
              { icon: Construction, num: '1,841', label: 'Construction', desc: 'Active construction sites and detours', color: 'orange' },
              { icon: Satellite, num: '128K+', label: 'Road Surface', desc: 'Surface quality reports across Kenya', color: 'purple' },
              { icon: Car, num: 'Live', label: 'Traffic', desc: 'Real-time congestion and speed data', color: 'green' },
              { icon: TriangleAlert, num: '8,924', label: 'Incidents', desc: 'Accidents, breakdowns and road closures', color: 'red' },
            ].map((c) => (
              <div className="condition-card" key={c.label}>
                <div className="condition-icon">
                  <c.icon size={22} strokeWidth={1.75} style={{ color: conditionColor[c.color] }} />
                </div>
                <div className={`condition-num c-${c.color}`}>{c.num}</div>
                <div className="condition-label">{c.label}</div>
                <div className="condition-desc">{c.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ROUTE INTELLIGENCE */}
      <section id="route-intelligence" className="section route-intel">
        <div className="pill pill-green">Route Intelligence</div>
        <h2>Not every 20-minute route is the same.</h2>
        <p className="section-sub">
          PathIQ Navigators scores every route on road quality, traffic, distance, incidents and historical
          reliability &mdash; then recommends the route that actually makes sense for your journey.
        </p>

        <div className="route-options">
          {[
            { tag: 'RECOMMENDED', tagClass: 'tag-rec', time: '2h 12m', dist: '156 km', road: 91, traffic: 84, borderClass: 'border-green' },
            { tag: 'FASTEST', tagClass: 'tag-fast', time: '2h 03m', dist: '148 km', road: 72, traffic: 61, borderClass: '' },
            { tag: 'BEST ROAD', tagClass: 'tag-best', time: '2h 28m', dist: '162 km', road: 95, traffic: 90, borderClass: '' },
          ].map((r) => (
            <div className={`route-option ${r.borderClass}`} key={r.tag}>
              <span className={`route-tag ${r.tagClass}`}>{r.tag}</span>
              <div className="route-option-time">{r.time}</div>
              <div className="route-option-dist">{r.dist}</div>
              <div className="bar-row">
                <span className="bar-label">Road score</span>
                <div className="bar"><div className="bar-fill fill-green" style={{ width: `${r.road}%` }} /></div>
                <span className="bar-value">{r.road}</span>
              </div>
              <div className="bar-row">
                <span className="bar-label">Traffic</span>
                <div className="bar"><div className="bar-fill fill-amber" style={{ width: `${r.traffic}%` }} /></div>
                <span className="bar-value">{r.traffic}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* HIDDEN GEMS */}
      <section id="hidden-gems" className="section gems">
        <div className="pill pill-green center">Hidden Gems</div>
        <h2 className="center">Discover the Kenya that maps don&apos;t always show.</h2>
        <p className="section-sub center">
          Local restaurants, hidden trails, scenic spots and authentic markets &mdash; all verified by Scouts on the
          ground and backed by community ratings.
        </p>

        <div className="gems-grid">
          {[
            { name: "Mama Njeri's Kitchen", cat: 'Local Food', rating: '4.9', desc: 'Famous tilapia. Cash only.', dist: '2.1 km away', img: 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=400&h=300&fit=crop' },
            { name: 'Ngong Forest Trails', cat: 'Nature', rating: '4.8', desc: 'Peaceful forest walk. Free entry.', dist: '8.4 km away', img: 'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=400&h=300&fit=crop' },
            { name: 'Kariokor Market', cat: 'Culture', rating: '4.6', desc: 'Every Friday. Authentic crafts.', dist: '3.8 km away', img: 'https://images.unsplash.com/photo-1489516408517-0c0a15662682?w=400&h=300&fit=crop' },
            { name: 'Fourteen Falls', cat: 'Scenic', rating: '4.9', desc: "Kenya's widest waterfall.", dist: '48 km away', img: 'https://images.unsplash.com/photo-1432405972618-c60b0225b8f9?w=400&h=300&fit=crop' },
          ].map((g) => (
            <div className="gem-card" key={g.name}>
              <div className="gem-img" style={{ backgroundImage: `url(${g.img})` }}>
                <span className="gem-verified"><BadgeCheck size={13} /> Scout Verified</span>
              </div>
              <div className="gem-body">
                <div className="gem-meta-row">
                  <span className="gem-cat">{g.cat}</span>
                  <span className="gem-rating"><Star size={13} fill="currentColor" stroke="none" /> {g.rating}</span>
                </div>
                <div className="gem-name">{g.name}</div>
                <div className="gem-desc">{g.desc}</div>
                <div className="gem-dist"><MapPin size={12} /> {g.dist}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="center">
          <a href="#hidden-gems" className="btn btn-outline" onClick={requireAuth}>Explore all Hidden Gems</a>
        </div>
      </section>

      {/* SCOUT PROGRAM */}
      <section id="scout-program" className="section scout">
        <div className="scout-inner">
          <div className="scout-copy">
            <div className="pill pill-amber">Scout Program</div>
            <h2>Built by people on the ground.</h2>
            <p>
              PathIQ Scouts are paid contributors who verify roads, discover local places and keep our data
              accurate and current. Scouts earn via M-Pesa for every approved task.
            </p>

            <div className="earnings-card">
              <div className="earnings-label">Scout earnings example</div>
              <div className="earnings-grid">
                <div className="earnings-row">
                  <span>Road condition report</span>
                  <span className="earnings-amount">KSh 150</span>
                </div>
                <div className="earnings-row">
                  <span>Place verification</span>
                  <span className="earnings-amount">KSh 200</span>
                </div>
                <div className="earnings-row">
                  <span>Hidden Gem discovery</span>
                  <span className="earnings-amount">KSh 350</span>
                </div>
                <div className="earnings-row">
                  <span>Flood zone survey</span>
                  <span className="earnings-amount">KSh 500</span>
                </div>
              </div>
            </div>

            <a href="/signup?role=scout" className="btn btn-amber" onClick={requireAuth}>Join as a Scout &rarr;</a>
          </div>

          <div className="scout-steps">
            {[
              { n: '01', title: 'Receive task', desc: 'Scout receives a nearby verification task with GPS location', color: 'green' },
              { n: '02', title: 'Field visit', desc: 'Scout travels to the location and captures photos and GPS', color: 'amber' },
              { n: '03', title: 'AI validation', desc: 'AI analyzes photos and pre-fills condition data', color: 'blue' },
              { n: '04', title: 'Submission', desc: 'Scout reviews and submits the verified report', color: 'purple' },
              { n: '05', title: 'M-Pesa payment', desc: 'Approved submissions are paid directly via M-Pesa', color: 'green' },
            ].map((s) => (
              <div className="step-card" key={s.n}>
                <span className={`step-num step-${s.color}`}>{s.n}</span>
                <div>
                  <div className="step-title">{s.title}</div>
                  <div className="step-desc">{s.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* API / BUSINESS */}
      <section id="api" className="section platform">
        <div className="pill pill-blue center">Data Platform</div>
        <h2 className="center">Built for more than navigation.</h2>
        <p className="section-sub center">
          Access Kenya&apos;s growing geographic intelligence layer through our developer API. Build products that
          actually understand how Kenya moves.
        </p>
        <div className="platform-ctas">
          <a href="/api" className="btn btn-primary" onClick={requireAuth}>Explore API</a>
          <a href="/docs" className="btn btn-outline" onClick={requireAuth}>View documentation</a>
        </div>

        <div id="business" className="platform-grid">
          {[
            { icon: Truck, title: 'Logistics', desc: 'Route optimization for delivery fleets' },
            { icon: Bus, title: 'Matatu SACCOs', desc: 'Real-time route intelligence for matatu operators' },
            { icon: Landmark, title: 'County Government', desc: 'Road condition monitoring and budget planning' },
            { icon: Code2, title: 'Developers', desc: 'Build location apps with Kenya-specific data' },
            { icon: Plane, title: 'Travel Platforms', desc: 'Enrich booking flows with local place data' },
            { icon: CarFront, title: 'Fleet Management', desc: 'Driver safety scoring and route analytics' },
          ].map((p) => (
            <div className="platform-card" key={p.title}>
              <div className="platform-icon">
                <p.icon size={22} strokeWidth={1.75} style={{ color: 'var(--green)' }} />
              </div>
              <div>
                <div className="platform-title">{p.title}</div>
                <div className="platform-desc">{p.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ROADMAP */}
      <section className="section roadmap">
        <div className="pill pill-grey center">Future Roadmap</div>
        <h2 className="center">What comes next</h2>

        <div className="roadmap-grid">
          {[
            { icon: Bus, title: 'Matatu SACCO Intelligence', desc: 'Route optimization, occupancy tracking and passenger safety scoring for Nairobi matatu operators and SACCOs.', badge: 'Coming 2027' },
            { icon: Landmark, title: 'County Road Intelligence', desc: 'A dedicated data platform for county governments to monitor, budget and plan road maintenance across their jurisdiction.', badge: 'Pilot 2026' },
            { icon: Smartphone, title: 'PathIQ Mobile', desc: 'A native iOS and Android app bringing the full PathIQ Navigators experience to the mobile-first Kenyan user.', badge: 'Q2 2027' },
          ].map((r) => (
            <div className="roadmap-card" key={r.title}>
              <div className="roadmap-icon">
                <r.icon size={22} strokeWidth={1.75} style={{ color: 'var(--green)' }} />
              </div>
              <div className="roadmap-title">{r.title}</div>
              <p className="roadmap-desc">{r.desc}</p>
              <span className="roadmap-badge">{r.badge}</span>
            </div>
          ))}
        </div>
      </section>

      {/* FOOTER */}
      <footer className="footer">
        <div className="footer-top">
          <div className="footer-brand">
            <div className="brand">
              <span className="brand-mark" />
              <span className="brand-name">PathIQ Navigators</span>
            </div>
            <p>Kenya&apos;s most intelligent navigation and geographic data platform.</p>
            <div className="tag-row">
              <span className="tag tag-grey">Nairobi, Kenya</span>
              <span className="tag tag-green">Live</span>
            </div>
          </div>

          <div className="footer-col">
            <div className="footer-heading">Product</div>
            <a href="#product">Platform</a>
            <a href="#route-intelligence">Route Intelligence</a>
            <a href="#hidden-gems">Hidden Gems</a>
            <a href="#product">Road Conditions</a>
            <a href="#">Mobile App</a>
          </div>

          <div className="footer-col">
            <div className="footer-heading">Scouts</div>
            <a href="#scout-program">Become a Scout</a>
            <a href="#">Scout Portal</a>
            <a href="#">Earnings</a>
            <a href="#">Training</a>
            <a href="#">Community</a>
          </div>

          <div className="footer-col">
            <div className="footer-heading">Developers</div>
            <a href="#api">API Overview</a>
            <a href="/docs">Documentation</a>
            <a href="#pricing">Pricing</a>
            <a href="#">Status</a>
            <a href="#">Changelog</a>
          </div>

          <div className="footer-col">
            <div className="footer-heading">Company</div>
            <a href="#">About</a>
            <a href="#">Blog</a>
            <a href="#">Careers</a>
            <a href="#">Press</a>
            <a href="#">Contact</a>
          </div>
        </div>

        <div className="footer-bottom">
          <span>&copy; 2026 PathIQ Navigators Ltd. All rights reserved.</span>
          <div className="footer-legal">
            <a href="#">Privacy Policy</a>
            <a href="#">Terms of Service</a>
            <a href="#">Cookie Policy</a>
          </div>
        </div>
      </footer>
    </div>
  );
}