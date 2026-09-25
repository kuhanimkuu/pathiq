import { supabase } from './supabase'

// Real Nairobi CBD (Kenyatta Ave / Moi Ave). Used when geolocation is denied
// or unavailable, so "gems near you" still shows something useful in a demo.
export const FALLBACK_LOCATION = { lat: -1.2833, lng: 36.8167 }

const NEARBY_RADIUS_M = 5000

export async function fetchNearbyGems(lat, lng, { radiusM = NEARBY_RADIUS_M, categories = null } = {}) {
  const { data, error } = await supabase.rpc('gems_near_point', {
    lat,
    lng,
    radius_m: radiusM,
    categories,
  })
  if (error) throw error
  return data ?? []
}

// All verified gems, for the Gems page's browse/filter view. Small dataset
// for now — fine to fetch in full and filter client-side.
export async function fetchGems() {
  const { data, error } = await supabase
    .from('gems')
    .select('id, name, category, description, rating_avg, confirmations_count')
    .eq('status', 'verified')
    .order('confirmations_count', { ascending: false })
  if (error) throw error
  return data ?? []
}

export async function fetchSavedGemIds(userId) {
  if (!userId) return new Set()
  const { data, error } = await supabase.from('saved_gems').select('gem_id').eq('user_id', userId)
  if (error) throw error
  return new Set((data ?? []).map((row) => row.gem_id))
}

export async function saveGem(userId, gemId) {
  const { error } = await supabase.from('saved_gems').insert({ user_id: userId, gem_id: gemId })
  if (error) throw error
}

export async function unsaveGem(userId, gemId) {
  const { error } = await supabase.from('saved_gems').delete().eq('user_id', userId).eq('gem_id', gemId)
  if (error) throw error
}

// Upserts the caller's confirmation/rating for a gem. gem_confirmations has a
// (gem_id, user_id) primary key, so this both confirms and re-rates in one call.
export async function confirmGem(userId, gemId, rating = null) {
  const { error } = await supabase
    .from('gem_confirmations')
    .upsert({ gem_id: gemId, user_id: userId, rating }, { onConflict: 'gem_id,user_id' })
  if (error) throw error
}

// Requests the browser's geolocation, resolving to the fallback location
// (rather than rejecting) if it's denied, unavailable, or times out — callers
// don't need two code paths for "no location".
//
// The PositionOptions `timeout` alone isn't enough: Chrome doesn't count time
// spent waiting on an unanswered permission prompt against it, so if the
// driver never responds to the prompt, getCurrentPosition never calls either
// callback and this would hang forever. Racing a plain setTimeout guarantees
// it always settles.
export function getCurrentPosition({ timeoutMs = 8000 } = {}) {
  const geolocationResult = new Promise((resolve) => {
    if (!('geolocation' in navigator)) {
      resolve({ ...FALLBACK_LOCATION, isFallback: true })
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, isFallback: false }),
      () => resolve({ ...FALLBACK_LOCATION, isFallback: true }),
      { timeout: timeoutMs, maximumAge: 60_000 },
    )
  })

  const hardTimeout = new Promise((resolve) => {
    setTimeout(() => resolve({ ...FALLBACK_LOCATION, isFallback: true }), timeoutMs + 500)
  })

  return Promise.race([geolocationResult, hardTimeout])
}

// Saved gems with coordinates, newest first (for one-tap routing).
export async function fetchSavedGems() {
  const { data, error } = await supabase.rpc('my_saved_gems')
  if (error) throw error
  return data ?? []
}
