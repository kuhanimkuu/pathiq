// The trip being navigated right now, so Home can show it and offer to resume.
// Per-device only (localStorage): an in-progress drive belongs to the phone
// doing the driving, and losing it just means the Home card goes empty.

const STORAGE_KEY = 'pathiq-active-trip'
const STALE_AFTER_MS = 12 * 60 * 60 * 1000 // a "trip" older than this was abandoned

export function loadActiveTrip() {
  try {
    const trip = JSON.parse(localStorage.getItem(STORAGE_KEY))
    if (!trip?.destination || Date.now() - trip.updatedAt > STALE_AFTER_MS) return null
    return trip
  } catch {
    return null
  }
}

// { destination: {lat,lng}, destinationName, stops: [{lat,lng,name}] (still to
//   visit), routeId, routeLabel, roadQuality, remainingM, remainingS, startedAt }
export function saveActiveTrip(trip) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...trip, updatedAt: Date.now() }))
  } catch {
    // storage unavailable — navigation still works, Home just won't show it
  }
}

export function clearActiveTrip() {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // ignore
  }
}

// The map URL that resumes navigating to this trip.
export function resumeUrl(trip) {
  const params = new URLSearchParams({
    to: `${trip.destination.lat.toFixed(5)},${trip.destination.lng.toFixed(5)}`,
    name: trip.destinationName ?? '',
    nav: '1',
  })
  if (trip.routeId) params.set('route', trip.routeId)
  if (trip.stops?.length) {
    params.set('stops', JSON.stringify(trip.stops.map((s) => ({ lat: +s.lat.toFixed(5), lng: +s.lng.toFixed(5), name: s.name }))))
  }
  return `/app/map?${params}`
}
