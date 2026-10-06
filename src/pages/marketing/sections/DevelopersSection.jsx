import { Truck, Bus, Landmark, Code2, Plane, CarFront } from 'lucide-react'

const audiences = [
  { icon: Truck, title: 'Logistics', desc: 'Route optimization for delivery fleets' },
  { icon: Bus, title: 'Transport operators', desc: 'Real-time route intelligence for matatu, minibus and fleet operators' },
  { icon: Landmark, title: 'County Government', desc: 'Road condition monitoring and budget planning' },
  { icon: Code2, title: 'Developers', desc: 'Build location apps with ground-truth road data' },
  { icon: Plane, title: 'Travel Platforms', desc: 'Enrich booking flows with local place data' },
  { icon: CarFront, title: 'Fleet Management', desc: 'Driver safety scoring and route analytics' },
]

export default function DevelopersSection() {
  return (
    <section id="api" className="section platform">
      <div className="pill pill-blue center">Data Platform</div>
      <h2 className="center">Built for more than navigation.</h2>
      <p className="section-sub center">
        Access our growing geographic intelligence layer through the developer API. Build products that
        actually understand how people move.
      </p>
      <div className="platform-ctas">
        {/* No API or docs product exists yet (see features.md) — these stay on-page rather than gate a dead end behind login. */}
        <a href="#api" className="btn btn-primary">Explore API</a>
        <a href="#business" className="btn btn-outline">View documentation</a>
      </div>

      <div id="business" className="platform-grid">
        {audiences.map((p) => (
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
  )
}
