import { useEffect, useRef } from 'react'

// Touch gestures on the heading-up map when it's turned by rotating its
// canvas (camera.js, no vector map ID). Google reads finger movement in
// screen terms but the canvas under the finger is turned, so its own drag
// went sideways or backwards (on a map turned 90°, dragging up moved the map
// left), and a raster map can't be twisted at all. While navigating, Google's
// gestures are switched off and these take over:
//   drag         turned by the canvas's angle before panning, so the map
//                moves with the finger
//   pinch, wheel zoom in steps (a raster map only has whole zoom levels)
//   twist        two fingers turning turn the map with them (`onTwist`)
//
// `active`: navigating on a canvas-turned map. `angle`: how far the canvas
// is turned, in degrees (--map-rot). `onMove`: the driver started moving the
// map themselves. `onTwist(deg)`: they turned it this much more, clockwise.
const DRAG_START_PX = 6
const PINCH_STEP = 1.6 // fingers this many times further apart (or closer): one zoom level
const WHEEL_STEP = 120
// A pinch always twists the fingers a little: only this much turn counts as
// meaning to rotate the map.
const TWIST_START_DEG = 10

export default function useRotatedGestures({ mapRef, canvasRef, active, angle, onMove, onTwist }) {
  const angleRef = useRef(angle)
  const onMoveRef = useRef(onMove)
  const onTwistRef = useRef(onTwist)
  useEffect(() => {
    angleRef.current = angle
    onMoveRef.current = onMove
    onTwistRef.current = onTwist
  })

  useEffect(() => {
    const map = mapRef.current
    const el = canvasRef.current
    if (!active || !map || !el) return
    map.setOptions({ gestureHandling: 'none' })
    const page = el.parentElement
    const pointers = new Map()
    let last = null // { x, y, spread, turn }
    let moving = false
    let pinch = 1
    let wheel = 0
    let twist = 0 // turn so far in this two-finger gesture, before it counts
    let twisting = false

    const snapshot = () => {
      const pts = [...pointers.values()]
      const x = pts.reduce((sum, p) => sum + p.x, 0) / pts.length
      const y = pts.reduce((sum, p) => sum + p.y, 0) / pts.length
      const two = pts.length >= 2
      const spread = two ? Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) : 0
      // The line between the two fingers, in degrees (clockwise on screen).
      const turn = two ? (Math.atan2(pts[1].y - pts[0].y, pts[1].x - pts[0].x) * 180) / Math.PI : null
      return { x, y, spread, turn }
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
    const endTwist = () => {
      twist = 0
      if (!twisting) return
      twisting = false
      page?.classList.remove('twisting')
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
      endTwist()
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
      if (now.turn != null && last.turn != null) {
        const d = ((now.turn - last.turn + 540) % 360) - 180
        if (twisting) {
          onTwistRef.current?.(d)
        } else {
          twist += d
          if (Math.abs(twist) >= TWIST_START_DEG) {
            // Follow the fingers straight away, without the canvas's glide.
            twisting = true
            page?.classList.add('twisting')
            onTwistRef.current?.(twist)
          }
        }
      }
      last = now
    }
    const up = (e) => {
      pointers.delete(e.pointerId)
      last = pointers.size ? snapshot() : null
      pinch = 1
      if (pointers.size < 2) endTwist()
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
      endTwist()
      map.setOptions({ gestureHandling: 'greedy' })
      el.removeEventListener('pointerdown', down, true)
      el.removeEventListener('pointermove', move, true)
      el.removeEventListener('pointerup', up, true)
      el.removeEventListener('pointercancel', up, true)
      el.removeEventListener('wheel', onWheel, { capture: true })
    }
  }, [mapRef, canvasRef, active])
}
