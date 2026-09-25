import { loadGoogleMaps } from './googleMaps'

// Destination search via Places API (New), through the Maps JS SDK and the
// browser key. One session token covers a run of keystrokes plus the final
// place lookup, which Google bills as a single session.

const BIAS_RADIUS_M = 50_000

export async function newSearchSession() {
  const api = await loadGoogleMaps()
  return new api.AutocompleteSessionToken()
}

// Returns [{ id, title, subtitle, prediction }].
export async function searchPlaces(input, near, sessionToken) {
  const api = await loadGoogleMaps()
  const { suggestions } = await api.AutocompleteSuggestion.fetchAutocompleteSuggestions({
    input,
    sessionToken,
    includedRegionCodes: ['ke'], // routing only covers Kenya (see the routes edge function)
    locationBias: near ? { center: near, radius: BIAS_RADIUS_M } : undefined,
  })
  return suggestions
    .filter((s) => s.placePrediction)
    .map(({ placePrediction: p }) => ({
      id: p.placeId,
      title: p.mainText?.text ?? p.text.text,
      subtitle: p.secondaryText?.text ?? '',
      prediction: p,
    }))
}

// Turns a chosen suggestion into { lat, lng, name }.
export async function resolvePlace(suggestion) {
  const place = suggestion.prediction.toPlace()
  await place.fetchFields({ fields: ['displayName', 'location'] })
  return { lat: place.location.lat(), lng: place.location.lng(), name: place.displayName ?? suggestion.title }
}
