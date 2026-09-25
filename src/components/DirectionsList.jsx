import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import ManeuverIcon from './ManeuverIcon'
import { formatDistance } from '../lib/navigation'

// Written turn-by-turn directions, like Google Maps' "Steps" list. Each row is
// a manoeuvre, its extra detail ("Pass by …", "Toll road") and how far you
// drive after it. While navigating, `nextIndex` is the manoeuvre coming up:
// earlier ones are dimmed and the list scrolls to it.
function DirectionsList({ steps, nextIndex = null, destinationName, onClose }) {
  const nextRef = useRef(null)
  useEffect(() => {
    nextRef.current?.scrollIntoView({ block: 'center' })
  }, [nextIndex])

  return (
    <div className="directions" role="dialog" aria-label="Directions">
      <div className="directions-head">
        <span>Directions{destinationName ? ` to ${destinationName}` : ''}</span>
        <button className="map-route-clear" onClick={onClose} aria-label="Close directions">
          <X size={16} />
        </button>
      </div>
      <ol className="directions-list">
        {steps.map((step, i) => {
          const state = nextIndex == null ? '' : i < nextIndex ? ' done' : i === nextIndex ? ' next' : ''
          return (
            <li key={i} className={'directions-step' + state} ref={i === nextIndex ? nextRef : null}>
              <span className="directions-icon">
                <ManeuverIcon maneuver={step.maneuver} size={17} />
              </span>
              <span className="directions-text">
                <span className="directions-instruction">{step.instruction || 'Continue'}</span>
                {step.detail && <span className="directions-detail">{step.detail}</span>}
                {step.distanceM > 0 && <span className="directions-distance">{formatDistance(step.distanceM)}</span>}
              </span>
            </li>
          )
        })}
        <li
          className={'directions-step' + (nextIndex != null && nextIndex >= steps.length ? ' next' : '')}
          ref={nextIndex != null && nextIndex >= steps.length ? nextRef : null}
        >
          <span className="directions-icon">
            <ManeuverIcon maneuver="ARRIVE" size={17} />
          </span>
          <span className="directions-text">
            <span className="directions-instruction">Arrive{destinationName ? ` at ${destinationName}` : ''}</span>
          </span>
        </li>
      </ol>
    </div>
  )
}

export default DirectionsList
