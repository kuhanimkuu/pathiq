import {
  ArrowUp, ArrowUpLeft, ArrowUpRight, CornerUpLeft, CornerUpRight, Undo2, Redo2,
  RotateCcw, RotateCw, Merge, Split, Flag, Ship, Volume2, VolumeX, X,
} from 'lucide-react'
import { formatDuration } from '../lib/routePlanning'
import { formatDistance } from '../lib/navigation'

// Google Routes API manoeuvre names → icons.
const MANEUVER_ICON = {
  TURN_LEFT: CornerUpLeft,
  TURN_SHARP_LEFT: CornerUpLeft,
  TURN_SLIGHT_LEFT: ArrowUpLeft,
  TURN_RIGHT: CornerUpRight,
  TURN_SHARP_RIGHT: CornerUpRight,
  TURN_SLIGHT_RIGHT: ArrowUpRight,
  UTURN_LEFT: Undo2,
  UTURN_RIGHT: Redo2,
  RAMP_LEFT: ArrowUpLeft,
  RAMP_RIGHT: ArrowUpRight,
  FORK_LEFT: Split,
  FORK_RIGHT: Split,
  MERGE: Merge,
  ROUNDABOUT_LEFT: RotateCcw,
  ROUNDABOUT_RIGHT: RotateCw,
  FERRY: Ship,
  FERRY_TRAIN: Ship,
  ARRIVE: Flag,
}

function NavigationHud({ step, destinationName, muted, onToggleMute, onEnd, status }) {
  const Icon = MANEUVER_ICON[step?.nextManeuver] ?? ArrowUp
  const arrivalTime = step
    ? new Date(step.computedAt + step.remainingS * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : null

  return (
    <>
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
            <div className="nav-banner-icon"><Icon size={26} /></div>
            <div style={{ minWidth: 0 }}>
              <div className="nav-banner-distance">{formatDistance(step.toNextM)}</div>
              <div className="nav-banner-instruction">{step.nextInstruction}</div>
            </div>
          </>
        )}
      </div>

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
