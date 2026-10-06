import { Bus, Landmark, Smartphone } from 'lucide-react'

const roadmap = [
  { icon: Bus, title: 'Minibus & Matatu Intelligence', desc: "Route optimization, occupancy tracking and passenger safety scoring for minibus operators, starting with Nairobi's matatu SACCOs.", badge: 'Coming 2027' },
  { icon: Landmark, title: 'County Road Intelligence', desc: 'A dedicated data platform for county governments to monitor, budget and plan road maintenance across their jurisdiction.', badge: 'Pilot 2026' },
  { icon: Smartphone, title: 'PathIQ Mobile', desc: 'A native iOS and Android app bringing the full PathIQ Navigators experience to mobile-first drivers everywhere.', badge: 'Q2 2027' },
]

export default function RoadmapSection() {
  return (
    <section className="section roadmap">
      <div className="pill pill-grey center">Future Roadmap</div>
      <h2 className="center">What comes next</h2>

      <div className="roadmap-grid">
        {roadmap.map((r) => (
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
  )
}
