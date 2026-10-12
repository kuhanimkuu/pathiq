import { supabase } from './supabase'
import { distanceM } from './navigation'

// Opt-in location contributions (migration 20261012000000): while a driver
// who turned it on is navigating, a thinned-out GPS trail is sent without
// their account, under a random token the device replaces every day. Each
// trip's first and last stretch never leaves the phone, so where someone
// lives or works isn't in it.

const TOKENS_KEY = 'pathiq-location-tokens'
const PRIVACY_M = 200 // dropped around the start and the end of every trip
const MIN_GAP_MS = 5000 // at most one sample this often…
const MIN_MOVE_M = 20 // …and only once the car has moved this far
const MAX_ACCURACY_M = 50 // vaguer fixes are no use for road speeds
const BATCH = 100
const KEEP_TOKENS_DAYS = 91 // covers the server keeping raw samples up to 90 days

export async function setLocationSharing(on) {
  const { data, error } = await supabase.rpc('set_location_sharing', { p_on: on })
  if (error) throw error
  return data
}

function readTokens() {
  try {
    const rows = JSON.parse(localStorage.getItem(TOKENS_KEY) ?? '[]')
    return Array.isArray(rows) ? rows.filter((r) => r?.token && r?.day) : []
  } catch {
    return []
  }
}

function writeTokens(rows) {
  try {
    localStorage.setItem(TOKENS_KEY, JSON.stringify(rows))
  } catch {
    // without storage the token just lives for this trip
  }
}

// Today's token (UTC day), made on first use and remembered so this device
// can delete what it sent.
function todaysToken() {
  const day = new Date().toISOString().slice(0, 10)
  const cutoff = new Date(Date.now() - KEEP_TOKENS_DAYS * 86400_000).toISOString().slice(0, 10)
  const rows = readTokens().filter((r) => r.day >= cutoff)
  let row = rows.find((r) => r.day === day)
  if (!row) {
    row = { day, token: crypto.randomUUID() }
    rows.push(row)
  }
  writeTokens(rows)
  return row.token
}

// Removes the raw samples this device sent (statistics already made from
// them are anonymous and stay). Resolves to how many were removed.
export async function deleteMyLocationSamples() {
  const tokens = readTokens().map((r) => r.token)
  if (tokens.length === 0) return 0
  const { data, error } = await supabase.rpc('delete_location_samples', { p_tokens: tokens })
  if (error) throw error
  writeTokens([])
  return data ?? 0
}

async function send(samples) {
  if (samples.length === 0) return
  const p_token = todaysToken()
  for (let i = 0; i < samples.length; i += BATCH) {
    const { error } = await supabase.rpc('contribute_location_samples', {
      p_token,
      p_samples: samples.slice(i, i + BATCH),
    })
    // Contributions are best-effort: never retry in a loop or bother the driver.
    if (error) return
  }
}

// One trip's collector. `add` every GPS fix; `finish` when the trip ends
// (arrived or not). Samples are held back until the car is PRIVACY_M past
// them, so the last stretch of a trip is never sent, wherever it ends.
export function createTripCollector({ origin, destination }) {
  let held = [] // { sample, s } in order, s = metres driven when recorded
  let driven = 0
  let last = null // last fix seen (for distance driven)
  let lastKept = null
  let finished = false

  const nearEnds = (p) =>
    (origin && distanceM(p, origin) < PRIVACY_M) || (destination && distanceM(p, destination) < PRIVACY_M)

  function add(fix) {
    if (finished || !fix || fix.isFallback) return
    if (fix.accuracy != null && fix.accuracy > MAX_ACCURACY_M) return
    if (last) driven += distanceM(last, fix)
    last = fix
    const t = fix.timestamp ?? Date.now()
    if (lastKept && (t - lastKept.t < MIN_GAP_MS || distanceM(lastKept, fix) < MIN_MOVE_M)) return
    if (driven < PRIVACY_M) return // the trip's first stretch
    lastKept = { lat: fix.lat, lng: fix.lng, t }
    if (nearEnds(fix)) return
    held.push({
      s: driven,
      sample: {
        lat: Number(fix.lat.toFixed(5)),
        lng: Number(fix.lng.toFixed(5)),
        t: new Date(t).toISOString(),
        speed: Number.isFinite(fix.speed) ? Math.round(fix.speed * 10) / 10 : null,
        heading: Number.isFinite(fix.heading) ? Math.round(fix.heading) % 360 : null,
      },
    })
    // Release what's now safely behind the car, in batches.
    const ready = held.filter((h) => driven - h.s >= PRIVACY_M)
    if (ready.length >= BATCH) {
      held = held.slice(ready.length)
      send(ready.map((h) => h.sample))
    }
  }

  function finish() {
    if (finished) return
    finished = true
    const ready = held.filter((h) => driven - h.s >= PRIVACY_M)
    held = []
    send(ready.map((h) => h.sample))
  }

  return { add, finish }
}
