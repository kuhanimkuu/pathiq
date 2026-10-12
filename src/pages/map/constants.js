// Shared by the map page and its parts (src/pages/map/*).

export const NAV_ZOOM = 17
export const ON_ROUTE_M = 100 // a gem this close to the route is "on" it; further is a detour

// "Your location" as a route point: resolved to the latest GPS fix when planning.
export const ME = { me: true, name: 'Your location' }

export const CATEGORIES = [
  { value: 'attractions', label: 'Attractions' },
  { value: 'hotels', label: 'Hotels' },
  { value: 'food', label: 'Food' },
  { value: 'scenic', label: 'Scenic' },
  { value: 'fuel', label: 'Fuel' },
  { value: 'facilities', label: 'Facilities' },
]

// Route line colours: CSS variables can't reach into the map canvas, so these
// mirror --primary and --muted-foreground.
export const ROUTE_COLOR = '#00C9A7'
export const ALT_ROUTE_COLOR = '#7A8C88'

// Live traffic on the selected route, as in Google Maps: the route colour
// where it's clear, amber where it's slow, red where it's jammed.
export const TRAFFIC_COLOR = { SLOW: '#F59E0B', TRAFFIC_JAM: '#EF4444' }

// What to call a spot when it becomes part of a route.
export function placeName(place) {
  if (place.kind === 'me') return ME.name
  return place.name || 'Dropped pin'
}
