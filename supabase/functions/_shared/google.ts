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

// How you're getting there. Bus and train are both Google's TRANSIT, limited
// to those vehicles; traffic only applies to the two on the road.
export type TravelMode = 'drive' | 'two_wheeler' | 'bus' | 'train' | 'bicycle' | 'walk'
export const TRAVEL_MODES: TravelMode[] = ['drive', 'two_wheeler', 'bus', 'train', 'bicycle', 'walk']
const GOOGLE_MODE: Record<TravelMode, string> = {
  drive: 'DRIVE',
  two_wheeler: 'TWO_WHEELER',
  bus: 'TRANSIT',
  train: 'TRANSIT',
  bicycle: 'BICYCLE',
  walk: 'WALK',
}
const TRANSIT_VEHICLES: Partial<Record<TravelMode, string[]>> = {
  bus: ['BUS'],
  train: ['TRAIN', 'RAIL', 'SUBWAY', 'LIGHT_RAIL'],
}
export const hasTraffic = (mode: TravelMode) => mode === 'drive' || mode === 'two_wheeler'
export const isTransit = (mode: TravelMode) => mode === 'bus' || mode === 'train'

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
const TRANSIT_FIELDS = ['routes.legs.steps.transitDetails']

// Google returns durations as strings such as "1234s".
const seconds = (value: string | undefined): number => (value ? parseInt(value, 10) : 0)

const waypoint = (p: LatLng) => ({ location: { latLng: { latitude: p.lat, longitude: p.lng } } })

interface ApiLocation {
  latLng?: { latitude?: number; longitude?: number }
}
export interface ApiTransitDetails {
  stopDetails?: { arrivalStop?: { name?: string }; departureStop?: { name?: string } }
  localizedValues?: { departureTime?: { time?: { text?: string } } }
  headsign?: string
  stopCount?: number
  transitLine?: { name?: string; nameShort?: string; vehicle?: { type?: string; name?: { text?: string } } }
}
interface ApiStep {
  distanceMeters?: number
  staticDuration?: string
  startLocation?: ApiLocation
  endLocation?: ApiLocation
  navigationInstruction?: { maneuver?: string; instructions?: string }
  transitDetails?: ApiTransitDetails
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

// A ride on a bus or train, in the same words-and-icon shape as a turn:
// "Take the 46 bus towards Kawangware", "from Ambassadeur · 8 stops · get off
// at Yaya · departs 10:42". The manoeuvre is TRANSIT_<vehicle type>
// (TRANSIT_BUS, TRANSIT_HEAVY_RAIL…), which the app shows as a bus or a train.
export function transitInstruction(t: ApiTransitDetails): { instruction: string; detail: string; maneuver: string } {
  const line = t.transitLine?.nameShort || t.transitLine?.name || ''
  const vehicle = (t.transitLine?.vehicle?.name?.text || 'bus').toLowerCase()
  const towards = t.headsign ? ` towards ${t.headsign}` : ''
  const from = t.stopDetails?.departureStop?.name ? `from ${t.stopDetails.departureStop.name}` : ''
  const stops = t.stopCount ? `${t.stopCount} stop${t.stopCount === 1 ? '' : 's'}` : ''
  const getOff = t.stopDetails?.arrivalStop?.name ? `get off at ${t.stopDetails.arrivalStop.name}` : ''
  const departs = t.localizedValues?.departureTime?.time?.text ? `departs ${t.localizedValues.departureTime.time.text}` : ''
  return {
    instruction: `Take the ${line ? `${line} ` : ''}${vehicle}${towards}`,
    detail: [from, stops, getOff, departs].filter(Boolean).join(' · '),
    maneuver: `TRANSIT_${t.transitLine?.vehicle?.type ?? 'BUS'}`,
  }
}

export function parseSteps(route: ApiRoute): GoogleStep[] {
  return (route.legs ?? []).flatMap((leg, legIndex) =>
    (leg.steps ?? []).map((s) => ({
      ...splitInstructions(s.navigationInstruction?.instructions),
      maneuver: s.navigationInstruction?.maneuver ?? 'STRAIGHT',
      ...(s.transitDetails ? transitInstruction(s.transitDetails) : {}),
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
//
// `mode` is how you're travelling (TravelMode). Traffic only applies on the
// road (drive, two-wheeler), and Google won't take stops on a bus or train
// trip — routes/index.ts refuses those first.
export function routeRequestBody(
  origin: LatLng,
  destination: LatLng,
  { mode = 'drive', withTraffic = false, stops = [], alternatives = true }: {
    mode?: TravelMode
    withTraffic?: boolean
    stops?: LatLng[]
    alternatives?: boolean
  } = {},
) {
  const traffic = withTraffic && hasTraffic(mode)
  return {
    origin: waypoint(origin),
    destination: waypoint(destination),
    ...(stops.length > 0 ? { intermediates: stops.map(waypoint) } : {}),
    travelMode: GOOGLE_MODE[mode],
    ...(hasTraffic(mode) ? { routingPreference: 'TRAFFIC_AWARE' } : {}),
    ...(isTransit(mode) ? { transitPreferences: { allowedTravelModes: TRANSIT_VEHICLES[mode] } } : {}),
    computeAlternativeRoutes: alternatives && stops.length === 0,
    polylineEncoding: 'ENCODED_POLYLINE',
    // The default (OVERVIEW) line is simplified and can sit tens of metres
    // off the real road on bends, so reports on the road would be missed.
    polylineQuality: 'HIGH_QUALITY',
    ...(traffic ? { extraComputations: ['TRAFFIC_ON_POLYLINE'] } : {}),
  }
}

export async function computeRoutes(
  apiKey: string,
  origin: LatLng,
  destination: LatLng,
  { withTraffic = true, stops = [], mode = 'drive' }: { withTraffic?: boolean; stops?: LatLng[]; mode?: TravelMode } = {},
): Promise<GoogleRoute[]> {
  const traffic = withTraffic && hasTraffic(mode)
  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': [...BASE_FIELDS, ...(traffic ? TRAFFIC_FIELDS : []), ...(isTransit(mode) ? TRANSIT_FIELDS : [])].join(','),
    },
    body: JSON.stringify(routeRequestBody(origin, destination, { mode, withTraffic: traffic, stops })),
  })

  if (!response.ok) {
    throw new Error(`Google Routes API ${response.status}: ${await response.text()}`)
  }

  const data = await response.json()
  return (data.routes ?? []).map((r: ApiRoute) => ({
    durationS: seconds(r.duration),
    // Not given for bus/train trips: there's no "without traffic" time.
    staticDurationS: seconds(r.staticDuration) || seconds(r.duration),
    distanceM: r.distanceMeters ?? 0,
    encodedPolyline: r.polyline?.encodedPolyline ?? '',
    steps: parseSteps(r),
    traffic: parseTraffic(r),
  }))
}

// Just the time and distance by one mode, for the mode tabs above the routes
// (Car 18 min · Bus 35 min · Walk 1 h 40): no alternatives, steps or traffic
// colours, so it's Google's cheapest request. Null when there's no way there
// by that mode (no bus or train nearby, too far to walk…).
export async function computeModeSummary(
  apiKey: string,
  origin: LatLng,
  destination: LatLng,
  mode: TravelMode,
  stops: LatLng[] = [],
): Promise<{ durationS: number; distanceM: number } | null> {
  const { polylineQuality: _quality, polylineEncoding: _encoding, ...body } = routeRequestBody(origin, destination, {
    mode,
    stops,
    alternatives: false,
  })
  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': 'routes.duration,routes.distanceMeters',
    },
    body: JSON.stringify(body),
  })
  if (!response.ok) {
    throw new Error(`Google Routes API ${response.status}: ${await response.text()}`)
  }
  const data = await response.json()
  const r = (data.routes ?? [])[0] as ApiRoute | undefined
  if (!r?.duration) return null
  return { durationS: seconds(r.duration), distanceM: r.distanceMeters ?? 0 }
}
