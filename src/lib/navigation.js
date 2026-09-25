// Turn-by-turn progress along a route from the `routes` edge function.
//
// The driver's GPS fix is snapped onto the route polyline to get `s`, the
// distance travelled along it. Google's steps are laid end to end along the
// same line, so `s` tells us which step we're on, how far to the next
// manoeuvre, and how much is left — without needing per-step geometry.

const EARTH_R = 6_371_000
const RAD = Math.PI / 180
// A car can't cover more than this between two GPS fixes, so the snap search
// stops here — otherwise a route that doubles back on itself could make
// progress jump ahead to the later pass.
const MAX_JUMP_M = 2000

export function distanceM(a, b) {
  const dLat = (b.lat - a.lat) * RAD
  const dLng = (b.lng - a.lng) * RAD
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_R * Math.asin(Math.sqrt(h))
}

// Local flat projection in metres — plenty accurate over a city-scale route.
function toXY(p, lat0) {
  return { x: p.lng * RAD * EARTH_R * Math.cos(lat0 * RAD), y: p.lat * RAD * EARTH_R }
}

export function buildNavModel(route) {
  const path = route.path
  const lat0 = path[0].lat
  const pts = path.map((p) => toXY(p, lat0))
  const cum = [0]
  for (let i = 1; i < pts.length; i++) {
    cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y))
  }
  const total = cum[cum.length - 1]

  // Step distances don't sum to exactly the polyline length; scale them so
  // the last step ends where the line does.
  const steps = route.steps ?? []
  const stepSum = steps.reduce((sum, st) => sum + st.distanceM, 0) || 1
  let acc = 0
  const stepEnds = steps.map((st) => (acc += (st.distanceM * total) / stepSum))

  return { lat0, pts, cum, total, steps, stepEnds, durationS: route.durationS, destination: path[path.length - 1] }
}

// Snap `pos` onto the route, searching forward from the last known progress.
// Returns { s, seg, offRouteM }.
export function locate(model, pos, prev = { s: 0, seg: 0 }) {
  const p = toXY(pos, model.lat0)
  const { pts, cum } = model
  let best = { s: prev.s, seg: prev.seg, offRouteM: Infinity }
  const from = Math.max(0, prev.seg - 5) // allow a little backtracking (GPS jitter)
  for (let i = from; i < pts.length - 1; i++) {
    if (cum[i] > prev.s + MAX_JUMP_M) break
    const a = pts[i]
    const b = pts[i + 1]
    const dx = b.x - a.x
    const dy = b.y - a.y
    const len2 = dx * dx + dy * dy
    const t = len2 === 0 ? 0 : Math.min(1, Math.max(0, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2))
    const d = Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
    if (d < best.offRouteM) best = { s: cum[i] + t * Math.sqrt(len2), seg: i, offRouteM: d }
  }
  return best
}

// Where we are in the directions, given distance travelled `s`.
// The instruction on step i+1 is the manoeuvre at the end of step i, so while
// on step i the *next* thing to do is steps[i + 1] (or arriving).
export function progress(model, s) {
  const { stepEnds, steps, total, durationS } = model
  let stepIndex = stepEnds.findIndex((end) => end > s)
  if (stepIndex === -1) stepIndex = Math.max(0, steps.length - 1)
  const nextStep = steps[stepIndex + 1] ?? null
  const remainingM = Math.max(0, total - s)
  return {
    stepIndex,
    toNextM: Math.max(0, (stepEnds[stepIndex] ?? total) - s),
    nextInstruction: nextStep ? nextStep.instruction : 'Arrive at your destination',
    nextManeuver: nextStep ? nextStep.maneuver : 'ARRIVE',
    remainingM,
    remainingS: total > 0 ? (durationS * remainingM) / total : 0,
    computedAt: Date.now(), // so the arrival time can be shown without reading the clock in render
  }
}

export function formatDistance(m) {
  if (m < 1000) return `${Math.max(10, Math.round(m / 10) * 10)} m`
  return `${(m / 1000).toFixed(m < 10_000 ? 1 : 0)} km`
}

// Spoken form: "in 300 metres", "in 1.2 kilometres".
export function spokenDistance(m) {
  if (m < 1000) return `${Math.max(10, Math.round(m / 50) * 50)} metres`
  return `${(m / 1000).toFixed(1)} kilometres`
}
