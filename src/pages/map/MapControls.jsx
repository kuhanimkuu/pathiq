import { Gem, TriangleAlert, TrafficCone, LocateFixed } from 'lucide-react'
import { GemGlyph } from '../../components/PlaceIcons'
import { CATEGORIES } from './constants'

// The map's own controls: my location and the layer switches down the side,
// category chips across the top.
export function LayerButtons({ layers, onToggle, onMyLocation }) {
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
