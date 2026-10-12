import { MAX_STOPS } from '../../lib/routePlanning'

// `?to=lat,lng&name=…&route=…&stops=[…]&nav=1` plans a route on arrival (and
// starts navigating with nav=1) — used by History and "Resume".
export function parseUrlPlan(params) {
  const [lat, lng] = (params.get('to') ?? '').split(',').map(Number)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  return {
    to: { lat, lng },
    name: params.get('name') || 'Dropped pin',
    stops: parseUrlStops(params.get('stops')),
    routeId: params.get('route'),
    nav: params.get('nav') === '1',
  }
}

function parseUrlStops(value) {
  try {
    const stops = JSON.parse(value ?? '[]')
    if (!Array.isArray(stops)) return []
    return stops
      .filter((s) => Number.isFinite(s?.lat) && Number.isFinite(s?.lng))
      .slice(0, MAX_STOPS)
      .map((s, i) => ({ lat: s.lat, lng: s.lng, name: typeof s.name === 'string' && s.name ? s.name : `Stop ${i + 1}` }))
  } catch {
    return []
  }
}
