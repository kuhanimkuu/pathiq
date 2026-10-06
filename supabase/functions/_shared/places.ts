// Google Places API (New) client. Server-side only: the key never reaches the
// browser. Google's places are a second tier under PathIQ's own gems — the app
// draws them smaller, drops any that duplicate a PathIQ gem, and only lets the
// top-rated ones trigger alerts.
// https://developers.google.com/maps/documentation/places/web-service/op-overview
//
// Terms: Places content (names, ratings) may not be stored, so nothing here is
// cached; results are fetched when needed and shown with Google attribution.

import type { LatLng } from './google.ts'

export type GemCategory = 'attractions' | 'hotels' | 'food' | 'scenic' | 'fuel' | 'facilities'

export interface GooglePlace {
  id: string // Google place ID (prefixed "google:" so it can't clash with a PathIQ gem id)
  name: string
  category: GemCategory
  lat: number
  lng: number
  rating: number | null
  ratingCount: number
  mapsUri: string | null
}

// Google place types → PathIQ categories, checked in this order (a hotel with a
// restaurant is a hotel). Only types from Google's Table A.
const TYPE_TO_CATEGORY: [string, GemCategory][] = [
  ['lodging', 'hotels'],
  ['hotel', 'hotels'],
  ['motel', 'hotels'],
  ['guest_house', 'hotels'],
  ['campground', 'hotels'],
  ['gas_station', 'fuel'],
  ['electric_vehicle_charging_station', 'fuel'],
  ['national_park', 'scenic'],
  ['hiking_area', 'scenic'],
  ['park', 'scenic'],
  ['tourist_attraction', 'attractions'],
  ['museum', 'attractions'],
  ['art_gallery', 'attractions'],
  ['zoo', 'attractions'],
  ['aquarium', 'attractions'],
  ['amusement_park', 'attractions'],
  ['restaurant', 'food'],
  ['cafe', 'food'],
  ['bakery', 'food'],
  ['meal_takeaway', 'food'],
  ['rest_stop', 'facilities'],
]

export const NEARBY_TYPES = [...new Set(TYPE_TO_CATEGORY.map(([type]) => type))]

// One text query per category for searching along a route.
export const ROUTE_QUERY: Record<GemCategory, string> = {
  food: 'restaurants and cafes',
  hotels: 'hotels and lodges',
  fuel: 'petrol stations',
  attractions: 'tourist attractions',
  scenic: 'scenic viewpoints and parks',
  facilities: 'rest stops',
}

export function categoryOf(types: string[] = [], primaryType?: string): GemCategory | null {
  for (const [type, category] of TYPE_TO_CATEGORY) {
    if (type === primaryType) return category
  }
  for (const [type, category] of TYPE_TO_CATEGORY) {
    if (types.includes(type)) return category
  }
  return null
}

interface ApiPlace {
  id?: string
  displayName?: { text?: string }
  location?: { latitude?: number; longitude?: number }
  primaryType?: string
  types?: string[]
  rating?: number
  userRatingCount?: number
  googleMapsUri?: string
  businessStatus?: string
}

// Our shape for one result, or null if it isn't something PathIQ shows.
export function toPlace(p: ApiPlace): GooglePlace | null {
  const lat = p.location?.latitude
  const lng = p.location?.longitude
  if (!p.id || !p.displayName?.text || typeof lat !== 'number' || typeof lng !== 'number') return null
  if (p.businessStatus && p.businessStatus !== 'OPERATIONAL') return null
  const category = categoryOf(p.types, p.primaryType)
  if (!category) return null
  return {
    id: `google:${p.id}`,
    name: p.displayName.text,
    category,
    lat,
    lng,
    rating: typeof p.rating === 'number' ? p.rating : null,
    ratingCount: p.userRatingCount ?? 0,
    mapsUri: p.googleMapsUri ?? null,
  }
}

const FIELDS = [
  'id',
  'displayName',
  'location',
  'primaryType',
  'types',
  'rating',
  'userRatingCount',
  'googleMapsUri',
  'businessStatus',
].map((f) => `places.${f}`)

async function call(apiKey: string, endpoint: string, body: unknown): Promise<GooglePlace[]> {
  const response = await fetch(`https://places.googleapis.com/v1/${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': FIELDS.join(','),
    },
    body: JSON.stringify(body),
  })
  if (!response.ok) throw new Error(`Google Places API ${response.status}: ${await response.text()}`)
  const data = await response.json()
  return ((data.places ?? []) as ApiPlace[]).map(toPlace).filter((p): p is GooglePlace => p !== null)
}

// Popular places of every PathIQ category within radiusM of a point.
export function searchNearby(apiKey: string, center: LatLng, radiusM: number): Promise<GooglePlace[]> {
  return call(apiKey, 'places:searchNearby', {
    includedTypes: NEARBY_TYPES,
    maxResultCount: 20,
    rankPreference: 'POPULARITY',
    locationRestriction: { circle: { center: { latitude: center.lat, longitude: center.lng }, radius: radiusM } },
  })
}

// Places of one category along a route (Google decides how far off it to look).
export function searchAlongRoute(apiKey: string, encodedPolyline: string, category: GemCategory): Promise<GooglePlace[]> {
  return call(apiKey, 'places:searchText', {
    textQuery: ROUTE_QUERY[category],
    pageSize: 20,
    searchAlongRouteParameters: { polyline: { encodedPolyline } },
  })
}
