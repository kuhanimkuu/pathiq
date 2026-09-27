import { useState } from 'react'
import { X, Navigation2, Plus, CircleDot, Share2, Pin, Pencil, Trash2 } from 'lucide-react'
import { PIN_LABELS } from '../lib/pinnedPlaces'
import { PinnedGlyph } from './PinnedIcon'

const KIND_TITLE = { dropped: 'Dropped pin', shared: 'Shared location', me: 'Your location' }
const LABEL_TEXT = { home: 'Home', work: 'Work', other: 'Pinned place' }

// The bottom sheet for one spot on the map: a dropped pin, a shared link, your
// own location, or one of your pinned places.
//   place      { lat, lng, name?, kind: 'dropped' | 'shared' | 'me' | 'pinned', pinId?, label? }
//   subtitle   e.g. "2.3 km away"
//   routeLabel "Route here" / "Make destination"
//   onRoute, onAddStop, onStart   route actions (omit to hide)
//   onShare()                     share a link to this spot
//   onSavePin({ name, label })    pin it, or save changes to a pinned place
//   onUnpin()                     remove a pinned place
//   children                      extra actions (Scout tools)
function PlaceSheet({ place, subtitle, routeLabel, routing, onClose, onRoute, onAddStop, onStart, onShare, onSavePin, onUnpin, startPinning = false, children }) {
  const isPinned = place.kind === 'pinned'
  const defaultName = isPinned ? place.name : place.kind === 'dropped' || place.kind === 'me' ? '' : place.name
  const [editing, setEditing] = useState(startPinning)
  const [name, setName] = useState(defaultName ?? '')
  const [label, setLabel] = useState(place.label ?? 'other')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const title = isPinned ? place.name : place.name || KIND_TITLE[place.kind] || 'Dropped pin'

  async function save(e) {
    e.preventDefault()
    const finalName = name.trim() || (label === 'home' ? 'Home' : label === 'work' ? 'Work' : 'Pinned place')
    setSaving(true)
    setError('')
    try {
      await onSavePin({ name: finalName, label })
      setEditing(false)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <button className="map-sheet-handle" onClick={onClose} aria-label="Close">
        <X size={16} />
      </button>
      <div className="map-sheet">
        <div className="place-sheet-head">
          {isPinned && (
            <span className="place-sheet-icon">
              <PinnedGlyph label={place.label} size={18} />
            </span>
          )}
          <div style={{ minWidth: 0 }}>
            <div className="place-sheet-title">{title}</div>
            <div className="place-sheet-sub">
              {isPinned ? `${LABEL_TEXT[place.label]} · ` : ''}
              {place.lat.toFixed(5)}, {place.lng.toFixed(5)}
              {subtitle ? ` · ${subtitle}` : ''}
            </div>
          </div>
        </div>

        {editing ? (
          <form className="pin-form" onSubmit={save}>
            <input
              className="auth-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Name, e.g. Mum's place"
              maxLength={80}
              aria-label="Name for this place"
              autoFocus
            />
            <div className="chip-row" role="radiogroup" aria-label="Type of place">
              {PIN_LABELS.map((l) => (
                <button
                  key={l.value}
                  type="button"
                  role="radio"
                  aria-checked={label === l.value}
                  className={'chip' + (label === l.value ? ' active' : '')}
                  onClick={() => setLabel(l.value)}
                >
                  <PinnedGlyph label={l.value} size={13} /> {l.label}
                </button>
              ))}
            </div>
            {error && <p className="auth-error" style={{ margin: 0 }}>{error}</p>}
            <div className="map-pin-actions" style={{ marginTop: 0 }}>
              <button type="submit" className="map-route-start" disabled={saving}>
                <Pin size={13} /> {saving ? 'Saving…' : isPinned ? 'Save changes' : 'Pin this place'}
              </button>
              <button type="button" className="map-route-here-btn" onClick={() => setEditing(false)}>
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <div className="map-pin-actions">
            {onRoute && (
              <button className="map-route-start" disabled={routing} onClick={onRoute}>
                <Navigation2 size={13} /> {routeLabel}
              </button>
            )}
            {onAddStop && (
              <button className="map-route-here-btn" onClick={onAddStop}>
                <Plus size={13} /> Add as stop
              </button>
            )}
            {onStart && (
              <button className="map-route-here-btn" onClick={onStart}>
                <CircleDot size={13} /> Start here
              </button>
            )}
            <button className="map-route-here-btn" onClick={onShare}>
              <Share2 size={13} /> Share
            </button>
            {isPinned ? (
              <>
                <button className="map-route-here-btn" onClick={() => setEditing(true)}>
                  <Pencil size={13} /> Edit
                </button>
                <button className="map-route-here-btn danger" onClick={onUnpin}>
                  <Trash2 size={13} /> Unpin
                </button>
              </>
            ) : (
              <button className="map-route-here-btn" onClick={() => setEditing(true)}>
                <Pin size={13} /> Pin
              </button>
            )}
            {children}
          </div>
        )}
      </div>
    </>
  )
}

export default PlaceSheet
