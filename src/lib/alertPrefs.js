// The driver's gem-alert preferences (features.md: "Suggestion filters — by
// category and maximum detour"). Per device, in localStorage.

const STORAGE_KEY = 'pathiq-gem-alerts'

export const ALERT_CATEGORIES = ['attractions', 'hotels', 'food', 'scenic', 'fuel', 'facilities']
export const DETOUR_CHOICES_MIN = [2, 5, 10, 15]

// detourAsked: the driver has chosen their max detour (asked the first time
// they plan a route; until then 5 min is assumed and the panel says so).
const DEFAULTS = { enabled: true, maxDetourMin: 5, categories: ALERT_CATEGORIES, detourAsked: false }

export function loadAlertPrefs() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY))
    return stored ? { ...DEFAULTS, ...stored } : DEFAULTS
  } catch {
    return DEFAULTS
  }
}

export function saveAlertPrefs(prefs) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs))
  } catch {
    // ignore — the change still applies until reload
  }
}

// Rough extra driving time to visit a gem off the route and come back: there
// and back at typical town driving speed (~20 km/h), rounded up. An estimate,
// and labelled as one in the UI.
const URBAN_M_PER_MIN = 20_000 / 60

export function detourMinutes(distanceFromRouteM) {
  return Math.max(1, Math.ceil((2 * distanceFromRouteM) / URBAN_M_PER_MIN))
}

// The widest corridor (metres either side of the route) a gem can sit in and
// still be within the driver's max detour.
export function corridorForDetour(maxDetourMin) {
  return Math.round((maxDetourMin * URBAN_M_PER_MIN) / 2)
}
