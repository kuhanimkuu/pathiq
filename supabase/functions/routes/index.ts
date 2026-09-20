// POST /functions/v1/routes
// Body: { origin: { lat, lng }, destination: { lat, lng } }
//
// Gets driving alternatives from Google, scores each against PathIQ's verified
// road reports, and labels them Recommended, Fastest and Best Road.

import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders, json } from '../_shared/cors.ts'
import { computeRoutes, type GoogleRoute, type LatLng } from '../_shared/google.ts'
import { decodePolyline, toWkt } from '../_shared/polyline.ts'
import {
  labelRoutes,
  reportPenalty,
  scoreRoute,
  type ReportType,
  type RoadReport,
} from '../_shared/scoring.ts'

// Google responses are cached this long. Scoring runs on every request, so new
// road reports show up straight away.
const CACHE_TTL_MS = 10 * 60 * 1000
const REPORT_CORRIDOR_M = 50
const MAX_ALERTS = 3

// Kenya, with some margin. Keeps stray requests from spending Google quota.
const BOUNDS = { minLat: -5, maxLat: 5.5, minLng: 33.5, maxLng: 42 }

interface ReportRow {
  id: string
  type: ReportType
  severity: number
  confidence: number | null
  lng: number
  lat: number
  created_at: string
  route_fraction: number
}

function parsePoint(value: unknown): LatLng | null {
  const p = value as Partial<LatLng> | null
  if (!p || typeof p.lat !== 'number' || typeof p.lng !== 'number') return null
  if (p.lat < BOUNDS.minLat || p.lat > BOUNDS.maxLat) return null
  if (p.lng < BOUNDS.minLng || p.lng > BOUNDS.maxLng) return null
  return { lat: p.lat, lng: p.lng }
}

// About 110 m of precision, so nearby requests share a cache entry.
const round3 = (n: number) => n.toFixed(3)

function cacheKey(origin: LatLng, destination: LatLng): string {
  const bucket = Math.floor(Date.now() / CACHE_TTL_MS)
  return `${round3(origin.lat)},${round3(origin.lng)}>${round3(destination.lat)},${round3(destination.lng)}@${bucket}`
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Use POST' }, 405)

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json({ error: 'Missing Authorization header' }, 401)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const googleKey = Deno.env.get('GOOGLE_MAPS_API_KEY')
  if (!googleKey) return json({ error: 'GOOGLE_MAPS_API_KEY is not set' }, 500)

  // Acts as the caller, so row-level security applies to the road report query.
  const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: userData, error: userError } = await userClient.auth.getUser()
  if (userError || !userData.user) return json({ error: 'Not signed in' }, 401)

  let body: { origin?: unknown; destination?: unknown }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Body must be JSON' }, 400)
  }
  const origin = parsePoint(body.origin)
  const destination = parsePoint(body.destination)
  if (!origin || !destination) {
    return json({ error: 'origin and destination need numeric lat and lng inside Kenya' }, 400)
  }

  // The cache table is server-only, so it uses the service role.
  const admin = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const key = cacheKey(origin, destination)

  let googleRoutes: GoogleRoute[] | null = null
  let cached = false

  const { data: hit } = await admin
    .from('route_cache')
    .select('response')
    .eq('key', key)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle()
  if (hit) {
    googleRoutes = hit.response as GoogleRoute[]
    cached = true
  }

  if (!googleRoutes) {
    try {
      googleRoutes = await computeRoutes(googleKey, origin, destination)
    } catch (error) {
      console.error(error)
      return json({ error: 'Could not get routes from Google' }, 502)
    }
    if (googleRoutes.length > 0) {
      await admin.from('route_cache').upsert({
        key,
        response: googleRoutes,
        expires_at: new Date(Date.now() + CACHE_TTL_MS).toISOString(),
      })
    }
  }

  const usable = googleRoutes.filter((r) => r.encodedPolyline)
  if (usable.length === 0) return json({ error: 'No route found' }, 404)

  // Road reports along each route, fetched in parallel.
  const now = Date.now()
  const withReports = await Promise.all(
    usable.map(async (route, index) => {
      const { data, error } = await userClient.rpc('road_reports_along_route', {
        route_wkt: toWkt(decodePolyline(route.encodedPolyline)),
        corridor_m: REPORT_CORRIDOR_M,
      })
      if (error) throw new Error(`road_reports_along_route: ${error.message}`)

      const rows = (data ?? []) as ReportRow[]
      const reports: (RoadReport & { row: ReportRow })[] = rows.map((row) => ({
        type: row.type,
        severity: row.severity,
        confidence: row.confidence === null ? null : Number(row.confidence),
        ageDays: (now - new Date(row.created_at).getTime()) / 86_400_000,
        row,
      }))
      return { id: `route-${index + 1}`, route, reports }
    }),
  ).catch((error) => {
    console.error(error)
    return null
  })
  if (!withReports) return json({ error: 'Could not read road reports' }, 500)

  const fastestDurationS = Math.min(...withReports.map((r) => r.route.durationS))
  const scored = withReports.map((r) => ({
    ...r,
    scores: scoreRoute(
      {
        id: r.id,
        durationS: r.route.durationS,
        staticDurationS: r.route.staticDurationS,
        distanceM: r.route.distanceM,
        reports: r.reports,
      },
      fastestDurationS,
    ),
  }))

  const tags = labelRoutes(scored.map((r) => ({ id: r.id, durationS: r.route.durationS, scores: r.scores })))

  const options = scored
    .map((r) => ({
      id: r.id,
      tags: tags.get(r.id) ?? [],
      durationS: r.route.durationS,
      staticDurationS: r.route.staticDurationS,
      distanceM: r.route.distanceM,
      encodedPolyline: r.route.encodedPolyline,
      scores: r.scores,
      reportCount: r.reports.length,
      // The worst problems on this route, for the UI to show.
      alerts: [...r.reports]
        .sort((a, b) => reportPenalty(b) - reportPenalty(a))
        .slice(0, MAX_ALERTS)
        .map(({ row }) => ({
          type: row.type,
          severity: row.severity,
          lng: row.lng,
          lat: row.lat,
          routeFraction: row.route_fraction,
        })),
    }))
    .sort((a, b) => b.scores.overall - a.scores.overall)

  return json({ options, cached })
})
