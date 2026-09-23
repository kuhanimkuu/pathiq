import HeroSection from './sections/HeroSection'
import MapFeatureSection from './sections/MapFeatureSection'
import RoadConditionsSection from './sections/RoadConditionsSection'
import RouteIntelligenceSection from './sections/RouteIntelligenceSection'
import HiddenGemsSection from './sections/HiddenGemsSection'
import ScoutProgramSection from './sections/ScoutProgramSection'
import DevelopersSection from './sections/DevelopersSection'
import RoadmapSection from './sections/RoadmapSection'

export default function Home() {
  return (
    <>
      <HeroSection />
      <MapFeatureSection />
      <RoadConditionsSection />
      <RouteIntelligenceSection />
      <HiddenGemsSection />
      <ScoutProgramSection />
      <DevelopersSection />
      <RoadmapSection />
    </>
  )
}
