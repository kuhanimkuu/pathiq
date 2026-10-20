import { Gem, TriangleAlert, TrafficCone, LocateFixed } from 'lucide-react'
import { GemGlyph } from '../../components/PlaceIcons'
import { CATEGORIES } from './constants'

// The map's own controls: my location and the layer switches down the side,
// category chips across the top.
//
// `compass` ({ heading, tilt }, vector maps only) adds a compass once the map
// has been turned or tilted; its needle points north, and tapping it
// (`onCompass`) turns the map back north-up and flat.
export function LayerButtons({ layers, onToggle, onMyLocation, compass, onCompass }) {
  const layer = (key, title, Icon) => (
    <button
      className={'map-layer-btn' + (layers[key] ? ' active' : '')}
      onClick={() => onToggle(key)}
      aria-pressed={layers[key]}
      title={title}
    >
      <Icon size={16} />
    </button>
  )
  return (
    <div className="map-layers" role="group" aria-label="Map layers">
      {compass && (compass.heading !== 0 || compass.tilt !== 0) && (
        <button className="map-layer-btn map-compass" onClick={onCompass} title="Face north" aria-label="Turn the map north-up">
          <svg width="18" height="18" viewBox="0 0 18 18" style={{ rotate: `${-compass.heading}deg` }} aria-hidden="true">
            <path d="M9 1.5 12 9H6z" fill="#E5484D" />
            <path d="M9 16.5 6 9h6z" fill="currentColor" />
          </svg>
        </button>
      )}
      <button className="map-layer-btn" onClick={onMyLocation} title="My location" aria-label="My location">
        <LocateFixed size={16} />
      </button>
      {layer('gems', 'Hidden Gems', Gem)}
      {layer('reports', 'Road reports', TriangleAlert)}
      {layer('traffic', 'Live traffic', TrafficCone)}
    </div>
  )
}

export function CategoryChips({ active, onToggle, hidden }) {
  return (
    <div className="map-filter-row" hidden={hidden}>
      {CATEGORIES.map((c) => (
        <button key={c.value} className={'chip' + (active.has(c.value) ? ' active' : '')} onClick={() => onToggle(c.value)}>
          <GemGlyph category={c.value} /> {c.label}
        </button>
      ))}
    </div>
  )
}
