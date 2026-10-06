import { supabase } from './supabase'
import { distanceM } from './navigation'

// Google's own places, as a second tier of gems under PathIQ's (the `places`
// edge function — supabase/functions/places). PathIQ gems always come first:
// Google places are drawn smaller, listed after them, and dropped when they
// duplicate a PathIQ gem. Later, business-uploaded gems join PathIQ's tier.
//
// Each place: { id: 'google:…', name, category, lat, lng, rating, ratingCount,
// mapsUri, source: 'google' }. Never stored (Google's terms), only kept for
// the session.

// A Google place this close to a PathIQ gem is the same place.
const DUPLICATE_M = 80

// Top-rated Google places may also trigger driving alerts (after PathIQ gems).
export const ALERT_MIN_RATING = 4.5
export const ALERT_MIN_REVIEWS = 100
export const isTopRated = (p) => (p.rating ?? 0) >= ALERT_MIN_RATING && p.ratingCount >= ALERT_MIN_REVIEWS

// Returns { places, ok, limited }. Never throws: when Google is unavailable or
// the rate limit is reached, the app carries on with PathIQ gems alone.
async function invoke(body) {
  const { data, error } = await supabase.functions.invoke('places', { body })
  if (error) return { places: [], ok: false, limited: error.context?.status === 429 }
  return { places: (data?.places ?? []).map((p) => ({ ...p, source: 'google' })), ok: true, limited: false }
}

// The most popular places within radiusM (the server keeps it to 1–50 km).
export function fetchGooglePlacesNearby(center, radiusM = 5000) {
  return invoke({ mode: 'nearby', center: { lat: center.lat, lng: center.lng }, radiusM: Math.round(radiusM) })
}

export function fetchGooglePlacesAlongRoute(encodedPolyline, categories) {
  return invoke({ mode: 'route', encodedPolyline, categories })
}

export function withoutDuplicates(googlePlaces, pathiqGems) {
  return googlePlaces.filter((p) => !pathiqGems.some((g) => distanceM(p, g) < DUPLICATE_M))
}
