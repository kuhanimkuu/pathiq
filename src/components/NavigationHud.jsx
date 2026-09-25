import { useState } from 'react'
import { Flag, Volume2, VolumeX, X, List } from 'lucide-react'
import { formatDuration } from '../lib/routePlanning'
import { formatDistance } from '../lib/navigation'
import ManeuverIcon from './ManeuverIcon'
import DirectionsList from './DirectionsList'

// Everything the voice says, also on screen, like Google Maps: the next
// manoeuvre with its distance and Google's extra detail, a "Then …" preview
// when two turns come close together, and the full written directions.
function NavigationHud({ step, steps = [], destinationName, muted, onToggleMute, onEnd, status, children }) {
  const [showSteps, setShowSteps] = useState(false)
  const arrivalTime = step
    ? new Date(step.computedAt + step.remainingS * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : null

  return (
    <>
      <div className="nav-top">
        <div className="nav-banner" role="status" aria-live="polite">
          {status === 'arrived' ? (
            <>
              <div className="nav-banner-icon"><Flag size={26} /></div>
              <div>
                <div className="nav-banner-distance">You&apos;ve arrived</div>
                <div className="nav-banner-instruction">{destinationName}</div>
              </div>
            </>
          ) : status === 'rerouting' ? (
            <div className="nav-banner-instruction" style={{ fontSize: 16 }}>Rerouting…</div>
          ) : !step ? (
            <div className="nav-banner-instruction" style={{ fontSize: 16 }}>Waiting for GPS…</div>
          ) : (
            <>
              <div className="nav-banner-icon"><ManeuverIcon maneuver={step.nextManeuver} size={26} /></div>
              <div style={{ minWidth: 0 }}>
                <div className="nav-banner-distance">{formatDistance(step.toNextM)}</div>
                <div className="nav-banner-instruction">{step.nextInstruction}</div>
                {step.nextDetail && <div className="nav-banner-detail">{step.nextDetail}</div>}
              </div>
            </>
          )}
        </div>
        {status === 'active' && step?.then && (
          <div className="nav-then">
            Then <ManeuverIcon maneuver={step.then.maneuver} size={15} /> <span>{step.then.instruction}</span>
          </div>
        )}
        {children}
      </div>

      {showSteps && steps.length > 0 && (
        <DirectionsList
          steps={steps}
          nextIndex={step?.nextStepIndex ?? null}
          destinationName={destinationName}
          onClose={() => setShowSteps(false)}
        />
      )}

      <div className="nav-footer">
        <div style={{ minWidth: 0 }}>
          {step && status !== 'arrived' ? (
            <>
              <div className="nav-footer-eta">
                {formatDuration(step.remainingS)} <span>· {formatDistance(step.remainingM)} · arrive {arrivalTime}</span>
              </div>
              <div className="nav-footer-dest">to {destinationName}</div>
            </>
          ) : (
            <div className="nav-footer-dest">{destinationName}</div>
          )}
        </div>
        {steps.length > 0 && status !== 'arrived' && (
          <button
            className={'nav-icon-btn' + (showSteps ? ' active' : '')}
            onClick={() => setShowSteps((v) => !v)}
            aria-label={showSteps ? 'Hide directions' : 'Show all directions'}
            aria-pressed={showSteps}
          >
            <List size={18} />
          </button>
        )}
        <button className="nav-icon-btn" onClick={onToggleMute} aria-label={muted ? 'Unmute voice' : 'Mute voice'}>
          {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
        </button>
        <button className="nav-end-btn" onClick={onEnd}>
          <X size={15} /> {status === 'arrived' ? 'Done' : 'End'}
        </button>
      </div>
    </>
  )
}

export default NavigationHud
