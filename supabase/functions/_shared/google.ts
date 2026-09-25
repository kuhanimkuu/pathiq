// Google Routes API client. Server-side only: the key never reaches the browser.
// https://developers.google.com/maps/documentation/routes/compute_route_directions

export interface LatLng {
  lat: number
  lng: number
}

// One turn-by-turn step. The instruction describes the manoeuvre at the
// *start* of the step ("Turn left onto Ngong Rd"), then you drive distanceM.
export interface GoogleStep {
  instruction: string
  maneuver: string
  distanceM: number
  durationS: number
  start: LatLng
  end: LatLng
}

export interface GoogleRoute {
  durationS: number // with live traffic
  staticDurationS: number // without traffic
  distanceM: number
  encodedPolyline: string
  steps: GoogleStep[]
}

const ENDPOINT = 'https://routes.googleapis.com/directions/v2:computeRoutes'
const FIELD_MASK = [
  'routes.duration',
  'routes.staticDuration',
  'routes.distanceMeters',
  'routes.polyline.encodedPolyline',
  'routes.legs.steps.distanceMeters',
  'routes.legs.steps.staticDuration',
  'routes.legs.steps.startLocation',
  'routes.legs.steps.endLocation',
  'routes.legs.steps.navigationInstruction',
].join(',')

// Google returns durations as strings such as "1234s".
const seconds = (value: string | undefined): number => (value ? parseInt(value, 10) : 0)

const waypoint = (p: LatLng) => ({ location: { latLng: { latitude: p.lat, longitude: p.lng } } })

interface ApiLocation {
  latLng?: { latitude?: number; longitude?: number }
}
interface ApiStep {
  distanceMeters?: number
  staticDuration?: string
  startLocation?: ApiLocation
  endLocation?: ApiLocation
  navigationInstruction?: { maneuver?: string; instructions?: string }
}
interface ApiRoute {
  duration?: string
  staticDuration?: string
  distanceMeters?: number
  polyline?: { encodedPolyline?: string }
  legs?: { steps?: ApiStep[] }[]
}

const toLatLng = (l: ApiLocation | undefined): LatLng => ({
  lat: l?.latLng?.latitude ?? 0,
  lng: l?.latLng?.longitude ?? 0,
})

export function parseSteps(route: ApiRoute): GoogleStep[] {
  return (route.legs ?? []).flatMap((leg) =>
    (leg.steps ?? []).map((s) => ({
      // Google appends extra lines such as "Pass by X (on the left)" — the
      // first line is the actual manoeuvre.
      instruction: (s.navigationInstruction?.instructions ?? '').split('\n')[0],
      maneuver: s.navigationInstruction?.maneuver ?? 'STRAIGHT',
      distanceM: s.distanceMeters ?? 0,
      durationS: seconds(s.staticDuration),
      start: toLatLng(s.startLocation),
      end: toLatLng(s.endLocation),
    })),
  )
}

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
  return (data.routes ?? []).map((r: ApiRoute) => ({
    durationS: seconds(r.duration),
    staticDurationS: seconds(r.staticDuration),
    distanceM: r.distanceMeters ?? 0,
    encodedPolyline: r.polyline?.encodedPolyline ?? '',
    steps: parseSteps(r),
  }))
}
