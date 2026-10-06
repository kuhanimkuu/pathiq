// POST /functions/v1/places
// Body, one of:
//   { mode: 'nearby', center: { lat, lng }, radiusM? }
//   { mode: 'route', encodedPolyline, categories: ['food', ...] }
//
// Google's own places as a second tier of gems (see _shared/places.ts). The
// app ranks them under PathIQ gems and drops duplicates. Rate-limited per user,
// per IP and globally, because every call here is billed by Google.

import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders, json } from '../_shared/cors.ts'
import { searchAlongRoute, searchNearby, ROUTE_QUERY, type GemCategory, type GooglePlace } from '../_shared/places.ts'

// Nearby searches cover the area on screen: the app sends its radius, kept
// within Google's limits (Nearby Search allows up to 50 km).
const NEARBY_RADIUS_M = { min: 1000, max: 50_000, default: 5000 }
const MAX_POLYLINE_CHARS = 60_000
const USER_LIMIT = { max: 40, window: '10 minutes' }
const IP_LIMIT = { max: 80, window: '10 minutes' }
// Counted per Google call (a route search makes one per category).
const GLOBAL_GOOGLE_CALLS_PER_HOUR = Number(Deno.env.get('PLACES_GLOBAL_LIMIT_PER_HOUR') ?? 600)

// Any real point on Earth. PathIQ works worldwide; Google's own coverage
// decides what comes back.
const isLatLng = (lat: number, lng: number) => lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180
const CATEGORIES = Object.keys(ROUTE_QUERY) as GemCategory[]

function parsePoint(value: unknown) {
  const p = value as { lat?: unknown; lng?: unknown } | null
  if (!p || typeof p.lat !== 'number' || typeof p.lng !== 'number') return null
  if (!isLatLng(p.lat, p.lng)) return null
  return { lat: p.lat, lng: p.lng }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Use POST' }, 405)

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json({ error: 'Missing Authorization header' }, 401)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const googleKey = Deno.env.get('GOOGLE_MAPS_API_KEY')
  if (!googleKey) return json({ error: 'GOOGLE_MAPS_API_KEY is not set' }, 500)

  const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: userData, error: userError } = await userClient.auth.getUser()
  if (userError || !userData.user) return json({ error: 'Not signed in' }, 401)

  if (Number(req.headers.get('content-length') ?? 0) > MAX_POLYLINE_CHARS + 1024) {
    return json({ error: 'Body too large' }, 413)
  }
  let body: { mode?: unknown; center?: unknown; radiusM?: unknown; encodedPolyline?: unknown; categories?: unknown }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Body must be JSON' }, 400)
  }

  // Validate before spending anything.
  let run: () => Promise<GooglePlace[]>
  let googleCalls = 1
  if (body.mode === 'nearby') {
    const center = parsePoint(body.center)
    if (!center) return json({ error: 'center needs valid numeric lat and lng' }, 400)
    const radiusM =
      typeof body.radiusM === 'number' && Number.isFinite(body.radiusM)
        ? Math.min(Math.max(body.radiusM, NEARBY_RADIUS_M.min), NEARBY_RADIUS_M.max)
        : NEARBY_RADIUS_M.default
    run = () => searchNearby(googleKey, center, radiusM)
  } else if (body.mode === 'route') {
    const polyline = body.encodedPolyline
    if (typeof polyline !== 'string' || polyline.length === 0 || polyline.length > MAX_POLYLINE_CHARS) {
      return json({ error: 'encodedPolyline must be a non-empty string' }, 400)
    }
    const raw = Array.isArray(body.categories) ? body.categories : CATEGORIES
    const categories = CATEGORIES.filter((c) => raw.includes(c))
    if (categories.length === 0) return json({ places: [] })
    googleCalls = categories.length
    run = async () => (await Promise.all(categories.map((c) => searchAlongRoute(googleKey, polyline, c)))).flat()
  } else {
    return json({ error: "mode must be 'nearby' or 'route'" }, 400)
  }

  // Rate limits and usage counts live in server-only tables.
  const admin = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const consume = async (key: string, max: number, window: string, cost = 1): Promise<boolean> => {
    for (let i = 0; i < cost; i++) {
      const { data, error } = await admin.rpc('consume_rate_limit', { p_key: key, p_max: max, p_window: window })
      if (error) {
        console.error('rate limit check failed', error)
        return true // fail open, like routes
      }
      if (data !== true) return false
    }
    return true
  }
  const track = async (outcome: 'places' | 'places_limited' | 'places_error', times = 1) => {
    for (let i = 0; i < times; i++) {
      const { error } = await admin.rpc('record_route_usage', { p_outcome: outcome })
      if (error) console.error('usage count failed', error)
    }
  }

  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'unknown'
  const allowed =
    (await consume(`places:user:${userData.user.id}`, USER_LIMIT.max, USER_LIMIT.window)) &&
    (await consume(`places:ip:${ip}`, IP_LIMIT.max, IP_LIMIT.window)) &&
    (await consume('places:google:global', GLOBAL_GOOGLE_CALLS_PER_HOUR, '1 hour', googleCalls))
  if (!allowed) {
    await track('places_limited')
    // Not an error for the app: it just shows PathIQ gems on their own.
    return json({ places: [], limited: true }, 429, { 'Retry-After': '600' })
  }

  let places: GooglePlace[]
  try {
    places = await run()
  } catch (error) {
    console.error(error)
    await track('places_error')
    return json({ error: 'Could not get places from Google' }, 502)
  }
  await track('places', googleCalls)

  // A place can match more than one route query.
  const unique = [...new Map(places.map((p) => [p.id, p])).values()]
  return json({ places: unique })
})
