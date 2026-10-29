import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { GripHorizontal, Minus, Maximize2 } from 'lucide-react'

// The trip card while navigating (ETA, what's ahead, the trip's buttons),
// floating over the map rather than pinned to the bottom of the screen.
// Drag it by its top strip to wherever it's out of the way, or shrink it to
// a small ETA pill (which drags too); both are remembered on this device.
//   summary   what the pill shows when shrunk (the ETA)
//   header    extra buttons in the top strip (Overview / Re-centre)
const STORE_KEY = 'pathiq-trip-card'
const MARGIN = 8

function loadPlacement() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY) ?? 'null')
    if (saved && typeof saved === 'object') return { x: saved.x ?? null, y: saved.y ?? null, min: !!saved.min }
  } catch {
    // ignore: start at the default place
  }
  return { x: null, y: null, min: false }
}

function savePlacement(p) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(p))
  } catch {
    // only a convenience
  }
}

function TripCard({ summary, header, children }) {
  const cardRef = useRef(null)
  // x / y: the card's top-left as a share of the room it has to move in
  // (0-1), so it stays in the same place on rotation; null = default spot.
  const [placement, setPlacement] = useState(loadPlacement)
  const [pos, setPos] = useState(null) // { left, top } in px while placed
  const dragRef = useRef(null)

  // Where the card sits for a placement, kept on screen whatever its size.
  const place = (p) => {
    const card = cardRef.current
    const page = card?.offsetParent
    if (!card || !page || p.x == null || p.y == null) return null
    const roomX = Math.max(0, page.clientWidth - card.offsetWidth - 2 * MARGIN)
    const roomY = Math.max(0, page.clientHeight - card.offsetHeight - 2 * MARGIN)
    return { left: MARGIN + roomX * p.x, top: MARGIN + roomY * p.y }
  }
  useLayoutEffect(() => {
    // Not mid-drag: the drag places the card itself until it's let go.
    const sync = () => !dragRef.current && setPos(place(placement))
    sync()
    const card = cardRef.current
    const observer = new ResizeObserver(sync)
    if (card) observer.observe(card)
    if (card?.offsetParent) observer.observe(card.offsetParent)
    return () => observer.disconnect()
  }, [placement])

  useEffect(() => savePlacement(placement), [placement])

  function onPointerDown(e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    if (e.target.closest('button') && !e.target.closest('.trip-card-grip')) return
    const card = cardRef.current
    if (!card) return
    e.currentTarget.setPointerCapture?.(e.pointerId)
    dragRef.current = { id: e.pointerId, x: e.clientX, y: e.clientY, left: card.offsetLeft, top: card.offsetTop, moved: false }
  }
  function onPointerMove(e) {
    const d = dragRef.current
    const card = cardRef.current
    const page = card?.offsetParent
    if (!d || d.id !== e.pointerId || !card || !page) return
    const dx = e.clientX - d.x
    const dy = e.clientY - d.y
    if (!d.moved && Math.hypot(dx, dy) < 4) return
    d.moved = true
    const maxLeft = page.clientWidth - card.offsetWidth - MARGIN
    const maxTop = page.clientHeight - card.offsetHeight - MARGIN
    setPos({
      left: Math.min(Math.max(MARGIN, d.left + dx), Math.max(MARGIN, maxLeft)),
      top: Math.min(Math.max(MARGIN, d.top + dy), Math.max(MARGIN, maxTop)),
    })
  }
  function onPointerUp(e) {
    const d = dragRef.current
    dragRef.current = null
    const card = cardRef.current
    const page = card?.offsetParent
    if (!d || !d.moved || !card || !page) return
    const roomX = page.clientWidth - card.offsetWidth - 2 * MARGIN
    const roomY = page.clientHeight - card.offsetHeight - 2 * MARGIN
    const share = (v, room) => (room > 0 ? Math.min(1, Math.max(0, (v - MARGIN) / room)) : 0)
    setPlacement((p) => ({ ...p, x: share(card.offsetLeft, roomX), y: share(card.offsetTop, roomY) }))
    e.preventDefault()
  }
  const dragHandlers = { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp }

  const style = pos ? { left: pos.left, top: pos.top, bottom: 'auto' } : undefined
  const setMin = (min) => setPlacement((p) => ({ ...p, min }))

  if (placement.min) {
    return (
      <div ref={cardRef} className="trip-card minimized" style={style} {...dragHandlers}>
        <span className="trip-card-grip" aria-hidden="true">
          <GripHorizontal size={14} />
        </span>
        <span className="trip-card-summary">{summary}</span>
        <button className="nav-icon-btn small" onClick={() => setMin(false)} aria-label="Show trip details">
          <Maximize2 size={15} />
        </button>
      </div>
    )
  }
  return (
    <div ref={cardRef} className="trip-card" style={style}>
      <div className="trip-card-head" {...dragHandlers}>
        <span className="trip-card-grip" title="Drag to move" aria-label="Drag to move the trip card">
          <GripHorizontal size={16} />
        </span>
        <span className="trip-card-head-actions">
          {header}
          <button className="nav-icon-btn small" onClick={() => setMin(true)} aria-label="Shrink the trip card" title="Shrink">
            <Minus size={15} />
          </button>
        </span>
      </div>
      {children}
    </div>
  )
}

export default TripCard
