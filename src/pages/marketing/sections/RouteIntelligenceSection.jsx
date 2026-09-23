const routeOptions = [
  { tag: 'RECOMMENDED', tagClass: 'tag-rec', time: '2h 12m', dist: '156 km', road: 91, traffic: 84, borderClass: 'border-green' },
  { tag: 'FASTEST', tagClass: 'tag-fast', time: '2h 03m', dist: '148 km', road: 72, traffic: 61, borderClass: '' },
  { tag: 'BEST ROAD', tagClass: 'tag-best', time: '2h 28m', dist: '162 km', road: 95, traffic: 90, borderClass: '' },
]

export default function RouteIntelligenceSection() {
  return (
    <section id="route-intelligence" className="section route-intel">
      <div className="pill pill-green">Route Intelligence</div>
      <h2>Not every 20-minute route is the same.</h2>
      <p className="section-sub">
        PathIQ Navigators scores every route on road quality, traffic, distance, incidents and historical
        reliability &mdash; then recommends the route that actually makes sense for your journey.
      </p>

      <div className="route-options">
        {routeOptions.map((r) => (
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
  )
}
