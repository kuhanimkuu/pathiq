import { Link } from 'react-router-dom'
import MapFeatureSection from './sections/MapFeatureSection'
import RoadConditionsSection from './sections/RoadConditionsSection'
import RouteIntelligenceSection from './sections/RouteIntelligenceSection'

// Road Conditions and Route Intelligence used to be separate marketing pages
// with their own nav items. Folded in here since on the real map they're
// already just layers of one thing, not separate features — see
// MapFeatureSection.jsx and the "pathiq-tiered-user-access" memory.
export default function MapFeaturePage() {
  return (
    <>
      <MapFeatureSection />
      <RoadConditionsSection />
      <RouteIntelligenceSection />
      <section className="section center" style={{ paddingTop: 0 }}>
        <Link to="/app/map" className="btn btn-primary btn-lg">
          Open the live map
        </Link>
      </section>
    </>
  )
}
