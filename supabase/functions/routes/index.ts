// POST /functions/v1/routes
// Body: { origin: { lat, lng }, destination: { lat, lng }, stops?: [{ lat, lng }] }
//
// `stops` (up to MAX_STOPS, in order) are places to stop at on the way. With
// stops Google returns a single route, so there's nothing to compare.
//
// Gets driving alternatives from Google, scores each against PathIQ's verified
// road reports, and labels them Recommended, Fastest and Best Road. Each option
// carries its turn-by-turn steps for in-app navigation.

import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders, json } from '../_shared/cors.ts'
import { computeRoutes, type GoogleRoute, type LatLng } from '../_shared/google.ts'
import { decodePolyline, toWkt } from '../_shared/polyline.ts'
import {
  isStillRelevant,
  labelRoutes,
  reportPenalty,
  scoreRoute,
  type ReportType,
  type RoadReport,
} from '../_shared/scoring.ts'

// Google responses are cached this long. Scoring runs on every request, so new
// road reports show up straight away.
const CACHE_TTL_MS = 10 * 60 * 1000
// How far either side of the route line a report can be and still count as
// on the road — the whole length of the route is always searched. Allows for
// GPS error in where a scout dropped the report.
const REPORT_CORRIDOR_M = 100
const MAX_ALERTS = 3
const MAX_STOPS = 5

// Rate limits (see the rate_limits migration). Per user and per IP on every
// request; the global cap only counts requests that actually reach Google,
// so it bounds the Google bill however many guest accounts someone creates.
const USER_LIMIT = { max: 30, window: '10 minutes' }
const IP_LIMIT = { max: 60, window: '10 minutes' }
const GLOBAL_GOOGLE_CALLS_PER_HOUR = Number(Deno.env.get('ROUTES_GLOBAL_LIMIT_PER_HOUR') ?? 1500)
// Live traffic colours on the route line. Google bills these requests at its
// higher "Advanced" rate; set ROUTES_TRAFFIC_ON_POLYLINE=false to turn it off.
const TRAFFIC_ON_POLYLINE = Deno.env.get('ROUTES_TRAFFIC_ON_POLYLINE') !== 'false'

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

const pointKey = (p: LatLng) => `${round3(p.lat)},${round3(p.lng)}`

function cacheKey(origin: LatLng, destination: LatLng, stops: LatLng[]): string {
  const bucket = Math.floor(Date.now() / CACHE_TTL_MS)
  return [origin, ...stops, destination].map(pointKey).join('>') + `@${bucket}`
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

  // The body is a handful of points; anything big is not a real request.
  if (Number(req.headers.get('content-length') ?? 0) > 4096) return json({ error: 'Body too large' }, 413)

  let body: { origin?: unknown; destination?: unknown; stops?: unknown }
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
  const rawStops = body.stops ?? []
  if (!Array.isArray(rawStops) || rawStops.length > MAX_STOPS) {
    return json({ error: `stops must be a list of at most ${MAX_STOPS} points` }, 400)
  }
  const stops = rawStops.map(parsePoint)
  if (stops.some((p) => !p)) return json({ error: 'every stop needs numeric lat and lng inside Kenya' }, 400)
  const stopPoints = stops as LatLng[]

  // The cache and rate-limit tables are server-only, so they use the service role.
  const admin = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const consume = async (key: string, max: number, window: string): Promise<boolean> => {
    const { data, error } = await admin.rpc('consume_rate_limit', { p_key: key, p_max: max, p_window: window })
    if (error) {
      console.error('rate limit check failed', error)
      return true // fail open: a broken limiter shouldn't take routing down
    }
    return data === true
  }
  // Daily counts for the admin dashboard's usage and cost panel
  // (route_usage_daily). Never lets a counting problem break routing.
  const track = async (outcome: 'google' | 'google_traffic' | 'cache' | 'limited' | 'error') => {
    const { error } = await admin.rpc('record_route_usage', { p_outcome: outcome })
    if (error) console.error('usage count failed', error)
  }
  const tooMany = async (message: string) => {
    await track('limited')
    return json({ error: message }, 429, { 'Retry-After': '600' })
  }

  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'unknown'
  if (!(await consume(`routes:user:${userData.user.id}`, USER_LIMIT.max, USER_LIMIT.window))) {
    return tooMany('Too many route requests. Please wait a few minutes and try again.')
  }
  if (!(await consume(`routes:ip:${ip}`, IP_LIMIT.max, IP_LIMIT.window))) {
    return tooMany('Too many route requests from this network. Please wait a few minutes and try again.')
  }

  const key = cacheKey(origin, destination, stopPoints)

  let googleRoutes: GoogleRoute[] | null = null
  let cached = false

  const { data: hit } = await admin
    .from('route_cache')
    .select('response')
    .eq('key', key)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle()
  // Entries cached before turn-by-turn steps were added have no `steps`;
  // treat those as a miss rather than serving routes you can't navigate.
  const hitRoutes = hit?.response as GoogleRoute[] | undefined
  if (hitRoutes && hitRoutes.every((r) => Array.isArray(r.steps) && Array.isArray(r.traffic))) {
    googleRoutes = hitRoutes
    cached = true
    await track('cache')
  }

  if (!googleRoutes) {
    if (!(await consume('routes:google:global', GLOBAL_GOOGLE_CALLS_PER_HOUR, '1 hour'))) {
      console.error('global Google Routes budget reached for this hour')
      await track('limited')
      return json({ error: 'Routing is busy right now. Please try again shortly.' }, 503, { 'Retry-After': '300' })
    }
    try {
      googleRoutes = await computeRoutes(googleKey, origin, destination, {
        withTraffic: TRAFFIC_ON_POLYLINE,
        stops: stopPoints,
      })
    } catch (error) {
      console.error(error)
      await track('error')
      return json({ error: 'Could not get routes from Google' }, 502)
    }
    await track(TRAFFIC_ON_POLYLINE ? 'google_traffic' : 'google')
    if (googleRoutes.length > 0) {
      await admin.from('route_cache').upsert({
        key,
        response: googleRoutes,
        expires_at: new Date(Date.now() + CACHE_TTL_MS).toISOString(),
      })
    }
  }

  const usable = googleRoutes.filter((r) => r.encodedPolyline)
  if (usable.length === 0) {
    await track('error')
    return json({ error: 'No route found' }, 404)
  }

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
    .map((r) => ({ ...r, live: r.reports.filter(isStillRelevant) }))
    .map((r) => ({
      id: r.id,
      tags: tags.get(r.id) ?? [],
      durationS: r.route.durationS,
      staticDurationS: r.route.staticDurationS,
      distanceM: r.route.distanceM,
      encodedPolyline: r.route.encodedPolyline,
      steps: r.route.steps,
      traffic: r.route.traffic,
      scores: r.scores,
      // Only reports that still matter (see isStillRelevant): a two-day-old
      // accident has faded out of the score, so it shouldn't be shown either.
      reportCount: r.live.length,
      // Every live report, for painting onto the route.
      hazards: r.live.map(({ row }) => ({
        id: row.id,
        type: row.type,
        severity: row.severity,
        routeFraction: row.route_fraction,
        lat: row.lat,
        lng: row.lng,
      })),
      // The worst problems on this route, for the UI to list.
      alerts: [...r.live]
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
