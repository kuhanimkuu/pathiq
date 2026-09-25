import { supabase } from './supabase'

// Trip summaries (no GPS trace) — see the trip tracking migration. Closing a
// trip recomputes the driver's IQ Score server-side.

const TAG_TO_OPTION = { recommended: 'recommended', fastest: 'fastest', best_road: 'best_road' }

export async function startTrip(userId, { origin, destination, destinationName, option }) {
  const { data, error } = await supabase
    .from('trips')
    .insert({
      user_id: userId,
      destination_name: destinationName,
      origin: origin ? `SRID=4326;POINT(${origin.lng} ${origin.lat})` : null,
      destination: `SRID=4326;POINT(${destination.lng} ${destination.lat})`,
      route_option: TAG_TO_OPTION[option.tags?.[0]] ?? null,
      distance_m: Math.round(option.distanceM),
      duration_s: Math.round(option.durationS),
      road_quality: option.scores?.roadQuality ?? null,
    })
    .select('id')
    .single()
  if (error) throw error
  return data.id
}

export async function endTrip(tripId, { arrived, reroutes }) {
  const { error } = await supabase
    .from('trips')
    .update({ ended_at: new Date().toISOString(), arrived, reroutes })
    .eq('id', tripId)
  if (error) throw error
}

export async function recordReroute(tripId, reroutes) {
  const { error } = await supabase.from('trips').update({ reroutes }).eq('id', tripId)
  if (error) throw error
}

// 'approaching' | 'passed'. The table's unique key makes this once per trip.
export async function recordGemEvent(tripId, gemId, event) {
  const { error } = await supabase.from('trip_gem_events').insert({ trip_id: tripId, gem_id: gemId, event })
  if (error && error.code !== '23505') throw error // 23505 = already recorded
}

export async function fetchDriverStats() {
  const { data, error } = await supabase.rpc('my_driver_stats')
  if (error) throw error
  return { tripsThisMonth: data[0]?.trips_this_month ?? 0, gemsFound: data[0]?.gems_found ?? 0 }
}

// Where the driver has navigated recently — one-tap destinations on Routes.
export async function fetchRecentDestinations(limit = 5) {
  const { data, error } = await supabase.rpc('my_recent_destinations', { p_limit: limit })
  if (error) throw error
  return data ?? []
}

// Past trips, newest first (History tab). Pass the oldest started_at you have
// as `before` to load the next page.
export async function fetchTripHistory({ limit = 30, before = null } = {}) {
  const { data, error } = await supabase.rpc('my_trip_history', { p_limit: limit, p_before: before })
  if (error) throw error
  return data ?? []
}

// Removing a trip is the driver's call (RLS: delete own). Its gem events go
// with it, and the IQ Score is recomputed on the next trip that ends.
export async function deleteTrip(tripId) {
  const { error } = await supabase.from('trips').delete().eq('id', tripId)
  if (error) throw error
}
