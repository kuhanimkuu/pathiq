// Google Routes API client. Server-side only: the key never reaches the browser.
// https://developers.google.com/maps/documentation/routes/compute_route_directions

export interface LatLng {
  lat: number
  lng: number
}

export interface GoogleRoute {
  durationS: number // with live traffic
  staticDurationS: number // without traffic
  distanceM: number
  encodedPolyline: string
}

const ENDPOINT = 'https://routes.googleapis.com/directions/v2:computeRoutes'
const FIELD_MASK =
  'routes.duration,routes.staticDuration,routes.distanceMeters,routes.polyline.encodedPolyline'

// Google returns durations as strings such as "1234s".
const seconds = (value: string | undefined): number => (value ? parseInt(value, 10) : 0)

const waypoint = (p: LatLng) => ({ location: { latLng: { latitude: p.lat, longitude: p.lng } } })

export async function computeRoutes(
  apiKey: string,
  origin: LatLng,
  destination: LatLng,
): Promise<GoogleRoute[]> {
  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': FIELD_MASK,
    },
    body: JSON.stringify({
      origin: waypoint(origin),
      destination: waypoint(destination),
      travelMode: 'DRIVE',
      routingPreference: 'TRAFFIC_AWARE',
      computeAlternativeRoutes: true,
      polylineEncoding: 'ENCODED_POLYLINE',
    }),
  })

  if (!response.ok) {
    throw new Error(`Google Routes API ${response.status}: ${await response.text()}`)
  }

  const data = await response.json()
  return (data.routes ?? []).map(
    (r: {
      duration?: string
      staticDuration?: string
      distanceMeters?: number
      polyline?: { encodedPolyline?: string }
    }) => ({
      durationS: seconds(r.duration),
      staticDurationS: seconds(r.staticDuration),
      distanceM: r.distanceMeters ?? 0,
      encodedPolyline: r.polyline?.encodedPolyline ?? '',
    }),
  )
}
