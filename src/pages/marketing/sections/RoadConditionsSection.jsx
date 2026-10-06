import { CircleDashed, Waves, Construction, Satellite, Car, TriangleAlert } from 'lucide-react'

const conditionColor = {
  orange: 'var(--amber)',
  blue: 'var(--blue)',
  purple: 'var(--purple)',
  green: 'var(--green)',
  red: 'var(--red)',
}

const conditions = [
  { icon: CircleDashed, num: '12,482', label: 'Potholes', desc: 'Reported and verified by Scouts and sensors', color: 'orange' },
  { icon: Waves, num: '284', label: 'Flooding', desc: 'Real-time flood zone detection and alerts', color: 'blue' },
  { icon: Construction, num: '1,841', label: 'Construction', desc: 'Active construction sites and detours', color: 'orange' },
  { icon: Satellite, num: '128K+', label: 'Road Surface', desc: 'Surface quality reports from drivers and Scouts', color: 'purple' },
  { icon: Car, num: 'Live', label: 'Traffic', desc: 'Real-time congestion and speed data', color: 'green' },
  { icon: TriangleAlert, num: '8,924', label: 'Incidents', desc: 'Accidents, breakdowns and road closures', color: 'red' },
]

export default function RoadConditionsSection() {
  return (
    <section id="product" className="section conditions">
      <div className="conditions-inner">
        <div className="conditions-copy">
          <div className="pill pill-amber">Road Conditions</div>
          <h2>Real roads. Real conditions.</h2>
          <p>
            Our platform aggregates data from Scouts on the ground, connected vehicles, satellite imagery and
            community reports to build the most complete road intelligence layer, one city at a time.
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
          {conditions.map((c) => (
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
  )
}
