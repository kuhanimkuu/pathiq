import { ChevronLeft, ChevronRight, X, Eye } from 'lucide-react'
import { formatDuration } from '../lib/routePlanning'
import { formatDistance } from '../lib/navigation'
import ManeuverIcon from './ManeuverIcon'

// Stepping through a route's directions by hand, without GPS: used when the
// route doesn't start where the driver is (location off, or a start chosen
// elsewhere). The map follows the step shown.
//   legNames   where each leg ends: the stops, then the destination
function RoutePreviewHud({ steps, index, legNames, route, onPrev, onNext, onClose }) {
  const step = steps[index]
  const legCount = legNames.length
  const leg = step.leg ?? 0
  // The last step of a leg ends at a stop (or the destination).
  const isLast = index === steps.length - 1
  const legEndsHere = isLast || (steps[index + 1].leg ?? 0) !== leg

  return (
    <>
      <div className="nav-top">
        <div className="nav-banner preview" role="status" aria-live="polite">
          <div className="nav-banner-icon"><ManeuverIcon maneuver={step.maneuver} size={26} /></div>
          <div style={{ minWidth: 0 }}>
            <div className="nav-banner-kicker">
              Step {index + 1} of {steps.length}
              {legCount > 1 ? ` · to ${legNames[leg]}` : ''}
            </div>
            <div className="nav-banner-instruction">{step.instruction || 'Continue'}</div>
            {step.detail && <div className="nav-banner-detail">{step.detail}</div>}
            <div className="nav-banner-detail">
              {legEndsHere
                ? `Then ${formatDistance(step.distanceM)} to ${legNames[leg]}`
                : `Then continue for ${formatDistance(step.distanceM)}`}
            </div>
          </div>
        </div>
        <div className="nav-then preview-note">
          <Eye size={14} /> <span>Preview. Live turn-by-turn starts from your current location.</span>
        </div>
      </div>

      <div className="nav-footer">
        <button className="nav-icon-btn" onClick={onPrev} disabled={index === 0} aria-label="Previous step">
          <ChevronLeft size={18} />
        </button>
        <button className="nav-icon-btn" onClick={onNext} disabled={index === steps.length - 1} aria-label="Next step">
          <ChevronRight size={18} />
        </button>
        <div style={{ minWidth: 0 }}>
          <div className="nav-footer-eta">
            {formatDuration(route.durationS)} <span>· {formatDistance(route.distanceM)}</span>
          </div>
          <div className="nav-footer-dest">to {legNames[legCount - 1]}</div>
        </div>
        <button className="nav-end-btn" onClick={onClose}>
          <X size={15} /> Close
        </button>
      </div>
    </>
  )
}

export default RoutePreviewHud
