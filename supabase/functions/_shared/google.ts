// Google Routes API client. Server-side only: the key never reaches the browser.
// https://developers.google.com/maps/documentation/routes/compute_route_directions

export interface LatLng {
  lat: number
  lng: number
}

// One turn-by-turn step. The instruction describes the manoeuvre at the
// *start* of the step ("Turn left onto Ngong Rd"), then you drive distanceM.
// `detail` is Google's extra text for the step, e.g. "Pass by Sarit Centre (on
// the left)" or "Destination will be on the right" — shown, not spoken.
// `leg` is which part of the trip the step is on: 0 up to the first stop, and
// so on, so the app can tell when a stop has been reached.
export interface GoogleStep {
  instruction: string
  detail: string
  maneuver: string
  distanceM: number
  durationS: number
  start: LatLng
  end: LatLng
  leg: number
}

// Live traffic along the route: a stretch of the polyline, by point index
// (end exclusive), and how fast traffic is moving on it.
export type TrafficSpeed = 'NORMAL' | 'SLOW' | 'TRAFFIC_JAM'
export interface TrafficInterval {
  from: number
  to: number
  speed: TrafficSpeed
}

export interface GoogleRoute {
  durationS: number // with live traffic
  staticDurationS: number // without traffic
  distanceM: number
  encodedPolyline: string
  steps: GoogleStep[]
  traffic: TrafficInterval[]
}

const ENDPOINT = 'https://routes.googleapis.com/directions/v2:computeRoutes'
const BASE_FIELDS = [
  'routes.duration',
  'routes.staticDuration',
  'routes.distanceMeters',
  'routes.polyline.encodedPolyline',
  'routes.legs.steps.distanceMeters',
  'routes.legs.steps.staticDuration',
  'routes.legs.steps.startLocation',
  'routes.legs.steps.endLocation',
  'routes.legs.steps.navigationInstruction',
]
const TRAFFIC_FIELDS = ['routes.travelAdvisory.speedReadingIntervals']

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
interface ApiSpeedInterval {
  startPolylinePointIndex?: number
  endPolylinePointIndex?: number
  speed?: string
}
interface ApiRoute {
  duration?: string
  staticDuration?: string
  distanceMeters?: number
  polyline?: { encodedPolyline?: string }
  legs?: { steps?: ApiStep[] }[]
  travelAdvisory?: { speedReadingIntervals?: ApiSpeedInterval[] }
}

const toLatLng = (l: ApiLocation | undefined): LatLng => ({
  lat: l?.latLng?.latitude ?? 0,
  lng: l?.latLng?.longitude ?? 0,
})

// Google's first line is the manoeuvre; any further lines ("Pass by X (on the
// left)", "Destination will be on the right") are detail.
function splitInstructions(text: string | undefined): { instruction: string; detail: string } {
  const [instruction = '', ...rest] = (text ?? '').split('\n').map((line) => line.trim())
  return { instruction, detail: rest.filter(Boolean).join(' · ') }
}

export function parseSteps(route: ApiRoute): GoogleStep[] {
  return (route.legs ?? []).flatMap((leg, legIndex) =>
    (leg.steps ?? []).map((s) => ({
      ...splitInstructions(s.navigationInstruction?.instructions),
      maneuver: s.navigationInstruction?.maneuver ?? 'STRAIGHT',
      distanceM: s.distanceMeters ?? 0,
      durationS: seconds(s.staticDuration),
      start: toLatLng(s.startLocation),
      end: toLatLng(s.endLocation),
      leg: legIndex,
    })),
  )
}

// Keeps only the slow and jammed stretches — "normal" is just the route colour.
// Google omits startPolylinePointIndex when it's 0.
export function parseTraffic(route: ApiRoute): TrafficInterval[] {
  return (route.travelAdvisory?.speedReadingIntervals ?? [])
    .filter((i) => i.speed === 'SLOW' || i.speed === 'TRAFFIC_JAM')
    .map((i) => ({ from: i.startPolylinePointIndex ?? 0, to: i.endPolylinePointIndex ?? 0, speed: i.speed as TrafficSpeed }))
    .filter((i) => i.to > i.from)
}

// withTraffic adds live traffic along each route (TRAFFIC_ON_POLYLINE). Google
// bills that request at its higher "Advanced" rate, so it can be switched off
// with the ROUTES_TRAFFIC_ON_POLYLINE secret (see routes/index.ts).
//
// `stops` are places to stop at on the way, in order. Google doesn't return
// alternative routes for a trip with stops, so that gives a single route.
// Up to 10 stops stays on the same billing SKU; routes/index.ts caps it lower.
export async function computeRoutes(
  apiKey: string,
  origin: LatLng,
  destination: LatLng,
  { withTraffic = true, stops = [] }: { withTraffic?: boolean; stops?: LatLng[] } = {},
): Promise<GoogleRoute[]> {
  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': [...BASE_FIELDS, ...(withTraffic ? TRAFFIC_FIELDS : [])].join(','),
    },
    body: JSON.stringify({
      origin: waypoint(origin),
      destination: waypoint(destination),
      ...(stops.length > 0 ? { intermediates: stops.map(waypoint) } : {}),
      travelMode: 'DRIVE',
      routingPreference: 'TRAFFIC_AWARE',
      computeAlternativeRoutes: stops.length === 0,
      polylineEncoding: 'ENCODED_POLYLINE',
      // The default (OVERVIEW) line is simplified and can sit tens of metres
      // off the real road on bends, so reports on the road would be missed.
      polylineQuality: 'HIGH_QUALITY',
      ...(withTraffic ? { extraComputations: ['TRAFFIC_ON_POLYLINE'] } : {}),
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
    traffic: parseTraffic(r),
  }))
}
