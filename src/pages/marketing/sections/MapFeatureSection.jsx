// The intro for the Map story. Road Conditions and Route Intelligence used to
// be separate marketing pages/nav items; they're folded in here now, since on
// the real map (src/pages/MapPage.jsx) conditions and route scores are
// already just layers on one map, not separate features. See MapFeaturePage.jsx
// for how this composes with RoadConditionsSection/RouteIntelligenceSection,
// and the "pathiq-tiered-user-access" memory for the reasoning.
export default function MapFeatureSection() {
  return (
    <section id="map" className="section map-feature">
      <div className="pill pill-blue center">Live Map</div>
      <h2 className="center">See the road ahead, not just the route.</h2>
      <p className="section-sub center">
        One map for road conditions, route options and Hidden Gems &mdash; built for Kenyan roads, not adapted from
        somewhere else.
      </p>
    </section>
  )
}
