import { useEffect, useRef } from 'react'

// Dragging and pinching a heading-up map that was turned by rotating its
// canvas (camera.js, no vector map ID). Google reads finger movement in
// screen terms but the canvas under the finger is turned, so its own drag
// went sideways or backwards (on a map turned 90°, dragging up moved the map
// left). While the canvas is turned, Google's gestures are switched off and
// these take over: a drag is turned by the canvas's angle before panning, so
// the map moves with the finger, and pinch / the mouse wheel zoom in steps
// (a raster map only has whole zoom levels).
//
// `active`: the canvas is turned. `angle`: how far, in degrees (--map-rot).
// `onMove`: the driver started moving the map themselves.
const DRAG_START_PX = 6
const PINCH_STEP = 1.6 // fingers this many times further apart (or closer): one zoom level
const WHEEL_STEP = 120

export default function useRotatedGestures({ mapRef, canvasRef, active, angle, onMove }) {
  const angleRef = useRef(angle)
  const onMoveRef = useRef(onMove)
  useEffect(() => {
    angleRef.current = angle
    onMoveRef.current = onMove
  })

  useEffect(() => {
    const map = mapRef.current
    const el = canvasRef.current
    if (!active || !map || !el) return
    map.setOptions({ gestureHandling: 'none' })
    const pointers = new Map()
    let last = null // { x, y, spread }
    let moving = false
    let pinch = 1
    let wheel = 0

    const snapshot = () => {
      const pts = [...pointers.values()]
      const x = pts.reduce((sum, p) => sum + p.x, 0) / pts.length
      const y = pts.reduce((sum, p) => sum + p.y, 0) / pts.length
      const spread = pts.length >= 2 ? Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) : 0
      return { x, y, spread }
    }
    const zoomBy = (step) => {
      const z = map.getZoom() ?? 15
      map.setZoom(Math.min(21, Math.max(3, z + step)))
    }
    const started = () => {
      if (moving) return
      moving = true
      onMoveRef.current?.()
    }

    const down = (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return
      // Markers and Google's own buttons keep their taps.
      if (e.target.closest?.('.html-marker, button, a, [role="button"]')) return
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
      el.setPointerCapture?.(e.pointerId)
      last = snapshot()
      if (pointers.size === 1) moving = false
      pinch = 1
    }
    const move = (e) => {
      if (!pointers.has(e.pointerId)) return
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
      const now = snapshot()
      const dx = now.x - last.x
      const dy = now.y - last.y
      if (!moving && pointers.size < 2 && Math.hypot(dx, dy) < DRAG_START_PX) return
      started()
      // The canvas is turned by −angle, so the finger's movement on screen is
      // turned by +angle to get it in the map's own terms.
      const a = (angleRef.current * Math.PI) / 180
      const mx = dx * Math.cos(a) - dy * Math.sin(a)
      const my = dx * Math.sin(a) + dy * Math.cos(a)
      if (mx || my) map.panBy(-mx, -my)
      if (pointers.size >= 2 && last.spread > 0 && now.spread > 0) {
        pinch *= now.spread / last.spread
        if (pinch >= PINCH_STEP) {
          zoomBy(1)
          pinch = 1
        } else if (pinch <= 1 / PINCH_STEP) {
          zoomBy(-1)
          pinch = 1
        }
      }
      last = now
    }
    const up = (e) => {
      pointers.delete(e.pointerId)
      last = pointers.size ? snapshot() : null
      pinch = 1
    }
    const onWheel = (e) => {
      e.preventDefault()
      started()
      moving = false
      wheel += e.deltaY
      if (Math.abs(wheel) >= WHEEL_STEP) {
        zoomBy(wheel > 0 ? -1 : 1)
        wheel = 0
      }
    }

    el.addEventListener('pointerdown', down, true)
    el.addEventListener('pointermove', move, true)
    el.addEventListener('pointerup', up, true)
    el.addEventListener('pointercancel', up, true)
    el.addEventListener('wheel', onWheel, { passive: false, capture: true })
    return () => {
      map.setOptions({ gestureHandling: 'greedy' })
      el.removeEventListener('pointerdown', down, true)
      el.removeEventListener('pointermove', move, true)
      el.removeEventListener('pointerup', up, true)
      el.removeEventListener('pointercancel', up, true)
      el.removeEventListener('wheel', onWheel, { capture: true })
    }
  }, [mapRef, canvasRef, active])
}
