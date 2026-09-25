import { supabase } from './supabase'

// Real driving routes: the `routes` edge function asks Google for alternatives
// (server-side key), scores each against verified road reports, and tags them
// Recommended / Fastest / Best Road — see supabase/functions/routes/index.ts.
// The gem corridor isn't part of that response, so it's fetched here for
// whichever route the driver is looking at, using the real road geometry.

const GEM_CORRIDOR_M = 400
const REPORT_CORRIDOR_M = 50 // same as the edge function, so counts agree

export const ROUTE_TAG_LABEL = { recommended: 'Recommended', fastest: 'Fastest', best_road: 'Best Road' }

export async function planRoutes(origin, destination) {
  const { data, error } = await supabase.functions.invoke('routes', {
    body: { origin: { lat: origin.lat, lng: origin.lng }, destination },
  })
  if (error) throw new Error(await edgeErrorMessage(error))
  return data.options.map((o) => ({ ...o, path: decodePolyline(o.encodedPolyline) }))
}

export async function fetchRouteCorridor(path, { gemCorridorM = GEM_CORRIDOR_M } = {}) {
  const wkt = toWkt(path)
  const [{ data: gems, error: gemsError }, { data: reports, error: reportsError }] = await Promise.all([
    supabase.rpc('gems_along_route', { route_wkt: wkt, corridor_m: Math.max(GEM_CORRIDOR_M, gemCorridorM) }),
    supabase.rpc('road_reports_along_route', { route_wkt: wkt, corridor_m: REPORT_CORRIDOR_M }),
  ])
  if (gemsError) throw gemsError
  if (reportsError) throw reportsError
  return { gems: gems ?? [], reports: reports ?? [] }
}

export function formatDuration(seconds) {
  const mins = Math.round(seconds / 60)
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
