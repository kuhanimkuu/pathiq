import { useState } from 'react'
import { Flag, Volume2, VolumeX, X, List, Radar, TrafficCone, MapPin } from 'lucide-react'
import { formatDuration } from '../lib/routePlanning'
import { formatDistance } from '../lib/navigation'
import { describeAhead, headlineAhead } from '../lib/routeAhead'
import ManeuverIcon from './ManeuverIcon'
import DirectionsList from './DirectionsList'
import { GemBadge, ReportBadge } from './PlaceIcons'

// The icon for one thing ahead on the route (lib/routeAhead.js).
function AheadIcon({ item, size = 28 }) {
  if (item.kind === 'report') return <ReportBadge type={item.report.type} severity={item.report.severity} size={size} />
  if (item.kind === 'gem' || item.kind === 'facility') return <GemBadge category={item.place.category} size={size} />
  const Icon = item.kind === 'traffic' ? TrafficCone : MapPin
  return (
    <span className={`nav-ahead-icon ${item.kind}${item.jam ? ' jam' : ''}`} style={{ width: size, height: size }}>
      <Icon size={Math.round(size * 0.55)} />
    </span>
  )
}

// "Ahead on your route": everything PathIQ knows is coming up, nearest first.
function AheadList({ items, onRead, onClose }) {
  return (
    <div className="directions nav-ahead-list" role="dialog" aria-label="Ahead on your route">
      <div className="directions-head">
        <span>Ahead on your route</span>
        <span style={{ display: 'flex', gap: 6 }}>
          <button className="nav-icon-btn" onClick={onRead} aria-label="Read out what's ahead">
            <Volume2 size={16} />
          </button>
          <button className="nav-icon-btn" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </span>
      </div>
      {items.length === 0 ? (
        <p className="nav-ahead-empty">No traffic, road reports or places of note between here and your destination.</p>
      ) : (
        <ul className="directions-list">
          {items.slice(0, 15).map((item) => {
            const { title, sub } = describeAhead(item)
            return (
              <li key={item.key} className="nav-ahead-row">
                <AheadIcon item={item} />
                <div style={{ minWidth: 0 }}>
                  <div className="nav-ahead-title">{title}</div>
                  <div className="nav-ahead-sub">{sub}</div>
                </div>
              </li>
            )
          })}
        </ul>
      )}
      <p className="nav-ahead-source">From live traffic and PathIQ road reports, gems and places on this route.</p>
    </div>
  )
}

// Everything the voice says, also on screen, like Google Maps: the next
// manoeuvre with its distance and Google's extra detail, a "Then …" preview
// when two turns come close together, and the full written directions.
// `nextStop` is the next stop on the way ({ name, left }: stops still to go).
// `ahead` is what's coming up on the route (lib/routeAhead.js): the nearest
// thing sits just above the footer, and the Ahead button lists the rest.
function NavigationHud({ step, steps = [], destinationName, nextStop, ahead = [], onReadAhead, muted, onToggleMute, onEnd, status, aside, children }) {
  const [panel, setPanel] = useState(null) // 'steps' | 'ahead' | null
  const showSteps = panel === 'steps'
  const toggle = (name) => setPanel((p) => (p === name ? null : name))
  const nextAhead = status === 'active' ? headlineAhead(ahead) : null
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
          onClose={() => setPanel(null)}
        />
      )}
      {panel === 'ahead' && status !== 'arrived' && (
        <AheadList items={ahead} onRead={onReadAhead} onClose={() => setPanel(null)} />
      )}

      {/* `aside` (Overview / Re-centre) sits on top of the footer, whatever its height. */}
      <div className="nav-bottom">
      {aside}
      {nextAhead && panel == null && (
        <button className="nav-ahead" onClick={() => setPanel('ahead')} aria-label="Ahead on your route: show all">
          <AheadIcon item={nextAhead} size={30} />
          <span style={{ minWidth: 0, flex: 1, textAlign: 'left' }}>
            <span className="nav-ahead-kicker">Ahead</span>
            <span className="nav-ahead-title">{describeAhead(nextAhead).title}</span>
            <span className="nav-ahead-sub">{describeAhead(nextAhead).sub}</span>
          </span>
          {ahead.length > 1 && <span className="nav-ahead-more">+{ahead.length - 1}</span>}
        </button>
      )}
      <div className="nav-footer">
        <div style={{ minWidth: 0 }}>
          {step && status !== 'arrived' ? (
            <>
              <div className="nav-footer-eta">
                {formatDuration(step.remainingS)} <span>· {formatDistance(step.remainingM)} · arrive {arrivalTime}</span>
              </div>
              <div className="nav-footer-dest">
                {nextStop
                  ? `Next stop: ${nextStop.name}${nextStop.left > 1 ? ` (+${nextStop.left - 1} more)` : ''} · then ${destinationName}`
                  : `to ${destinationName}`}
              </div>
            </>
          ) : (
            <div className="nav-footer-dest">{destinationName}</div>
          )}
        </div>
        {status !== 'arrived' && (
          <button
            className={'nav-icon-btn' + (panel === 'ahead' ? ' active' : '')}
            onClick={() => toggle('ahead')}
            aria-label={panel === 'ahead' ? 'Hide what is ahead' : 'Ahead on your route'}
            aria-pressed={panel === 'ahead'}
          >
            <Radar size={18} />
          </button>
        )}
        {steps.length > 0 && status !== 'arrived' && (
          <button
            className={'nav-icon-btn' + (showSteps ? ' active' : '')}
            onClick={() => toggle('steps')}
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
      </div>
    </>
  )
}

export default NavigationHud
