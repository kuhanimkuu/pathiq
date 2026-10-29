import { supabase } from './supabase'

// Real driving routes: the `routes` edge function asks Google for alternatives
// (server-side key), scores each against verified road reports, tags them
// Recommended / Fastest / Best Road, and lists each route's live reports
// (`hazards`) — see supabase/functions/routes/index.ts. The gem corridor isn't
// part of that response, so it's fetched here for whichever route the driver
// is looking at, using the real road geometry.

const GEM_CORRIDOR_M = 400

export const ROUTE_TAG_LABEL = { recommended: 'Recommended', fastest: 'Fastest', best_road: 'Best Road' }

// The routes edge function accepts this many stops on the way (MAX_STOPS).
export const MAX_STOPS = 5

const point = (p) => ({ lat: p.lat, lng: p.lng })

// Ways to travel, in the order the mode tabs show them (the routes edge
// function's TravelMode). `road`: shares the road with cars, so traffic and
// road reports matter most. `transit`: Google's bus/train routing, which
// can't take stops on the way.
export const TRAVEL_MODES = [
  { id: 'drive', label: 'Car', road: true },
  { id: 'two_wheeler', label: 'Motorbike', road: true },
  { id: 'bus', label: 'Bus', transit: true },
  { id: 'train', label: 'Train', transit: true },
  { id: 'bicycle', label: 'Bicycle' },
  { id: 'walk', label: 'Walk' },
]
export const travelMode = (id) => TRAVEL_MODES.find((m) => m.id === id) ?? TRAVEL_MODES[0]

const MODE_KEY = 'pathiq-travel-mode'
export function loadTravelMode() {
  try {
    const id = localStorage.getItem(MODE_KEY)
    return TRAVEL_MODES.some((m) => m.id === id) ? id : 'drive'
  } catch {
    return 'drive'
  }
}
export function saveTravelMode(id) {
  try {
    localStorage.setItem(MODE_KEY, id)
  } catch {
    // still applies for this visit
  }
}

// `stops` are places to stop at on the way, in order. With stops Google gives
// a single route rather than alternatives. `mode` is a TRAVEL_MODES id.
export async function planRoutes(origin, destination, stops = [], mode = 'drive') {
  const { data, error } = await supabase.functions.invoke('routes', {
    body: { origin: point(origin), destination: point(destination), stops: stops.map(point), mode },
  })
  if (error) throw new Error(await edgeErrorMessage(error))
  // A routes function from before modes existed always drives.
  return data.options.map((o) => ({ ...o, mode: o.mode ?? 'drive', path: decodePolyline(o.encodedPolyline) }))
}

// How long the trip takes by every mode except `mode` (already planned), for
// the mode tabs: { [modeId]: { durationS, distanceM } | { unavailable: true } }.
// Empty when the routes function doesn't offer it.
export async function fetchModeTimes(origin, destination, stops = [], mode = 'drive') {
  const { data, error } = await supabase.functions.invoke('routes', {
    body: { origin: point(origin), destination: point(destination), stops: stops.map(point), mode, modeTimes: true },
  })
  if (error) throw new Error(await edgeErrorMessage(error))
  return Object.fromEntries((data?.modes ?? []).map(({ mode: id, ...time }) => [id, time]))
}

export async function fetchRouteCorridor(path, { gemCorridorM = GEM_CORRIDOR_M } = {}) {
  const { data, error } = await supabase.rpc('gems_along_route', {
    route_wkt: toWkt(path),
    corridor_m: gemCorridorM,
  })
  if (error) throw error
  return { gems: data ?? [] }
}

export function formatDuration(seconds) {
  const mins = Math.round(seconds / 60)
  if (mins < 1) return 'under 1 min'
  if (mins < 60) return `${mins} min`
  return `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, '0')}m`
}

export function routeLabel(option) {
  return option.tags.map((t) => ROUTE_TAG_LABEL[t] ?? t).join(' · ') || 'Alternative'
}

// The edge function returns { error } JSON with a useful message; supabase-js
// hides it behind a generic "non-2xx" error unless we read the response.
async function edgeErrorMessage(error) {
  try {
    const body = await error.context?.json()
    if (body?.error) return body.error
  } catch {
    // not JSON — fall through
  }
  return error.message
}

// Google's encoded polyline format (precision 5) — same algorithm as
// supabase/functions/_shared/polyline.ts. Returns [{ lat, lng }].
function decodePolyline(encoded) {
  const points = []
  let index = 0
  let lat = 0
  let lng = 0
  const nextDelta = () => {
    let result = 0
    let shift = 0
    let byte
    do {
      byte = encoded.charCodeAt(index++) - 63
      result |= (byte & 0x1f) << shift
      shift += 5
    } while (byte >= 0x20)
    return result & 1 ? ~(result >> 1) : result >> 1
  }
  while (index < encoded.length) {
    lat += nextDelta()
    lng += nextDelta()
    points.push({ lat: lat / 1e5, lng: lng / 1e5 })
  }
  return points
}

function toWkt(path) {
  return `LINESTRING(${path.map((p) => `${p.lng} ${p.lat}`).join(', ')})`
}
