import { supabase } from './supabase'
import { haversineDistanceM } from './geo'

// Straight-line "planned route" between two points — not real road routing.
// There's no Google Maps key yet (see architecture.md), so there's no real
// street geometry to follow. This is honest about that: one straight line,
// not fabricated alternatives. What IS real: the gems and road reports
// returned along it, via the same PostGIS functions the (built, tested, not
// yet wired-in) route-scoring edge function uses — see
// supabase/migrations/20260920000000_init.sql.

const GEM_CORRIDOR_M = 400
const REPORT_CORRIDOR_M = 150

function toWkt(origin, destination) {
  return `LINESTRING(${origin.lng} ${origin.lat}, ${destination.lng} ${destination.lat})`
}

export async function planRoute(origin, destination) {
  const wkt = toWkt(origin, destination)
  const [{ data: gems, error: gemsError }, { data: reports, error: reportsError }] = await Promise.all([
    supabase.rpc('gems_along_route', { route_wkt: wkt, corridor_m: GEM_CORRIDOR_M }),
    supabase.rpc('road_reports_along_route', { route_wkt: wkt, corridor_m: REPORT_CORRIDOR_M }),
  ])
  if (gemsError) throw gemsError
  if (reportsError) throw reportsError

  const distanceM = haversineDistanceM(origin.lat, origin.lng, destination.lat, destination.lng)

  return {
    origin,
    destination,
    distanceM,
    gems: gems ?? [],
    reports: reports ?? [],
    roadQuality: roadQualityScore(reports ?? []),
  }
}

// A lighter version of the penalty formula in
// supabase/functions/_shared/scoring.ts (that one also needs traffic/time
// data from Google, which isn't available here) — same idea: potholes and
// surface reports hurt road quality, weighted by severity and how fresh the
// report is. 100 = no known issues on this stretch.
const BASE_PENALTY = { pothole: 6, surface: 8, construction: 10, flooding: 20, incident: 15 }
const PENALTY_SCALE = 40

function roadQualityScore(reports) {
  const total = reports.reduce((sum, r) => {
    const severity = Math.min(5, Math.max(1, r.severity)) / 5
    const confidence = r.confidence ?? 0.7
    return sum + (BASE_PENALTY[r.type] ?? 8) * severity * confidence
  }, 0)
  return Math.round(100 * Math.exp(-total / PENALTY_SCALE))
}
