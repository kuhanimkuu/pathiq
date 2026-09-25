// Loads the Google Maps JavaScript API once, on demand. The key is a browser
// key (VITE_GOOGLE_MAPS_API_KEY) and is visible to anyone, so it must be
// restricted by HTTP referrer in Cloud Console. Routing never uses it — that
// goes through the `routes` edge function and its server-side key.

const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY

// Google's demo map ID: enables Advanced Markers and light/dark color schemes
// without creating a Cloud-styled map. Swap for a real map ID to customise.
export const MAP_ID = 'DEMO_MAP_ID'

// Google calls gm_authFailure when the key is invalid or the referrer isn't
// allowed — usually *after* the script has loaded and a map was created, so it
// can't just reject the load promise. Pages subscribe instead.
export const AUTH_FAILURE_EVENT = 'pathiq:maps-auth-failure'
let authFailed = false
window.gm_authFailure = () => {
  authFailed = true
  window.dispatchEvent(new Event(AUTH_FAILURE_EVENT))
}
export const mapsAuthFailed = () => authFailed

let loading = null

export function loadGoogleMaps() {
  if (loading) return loading
  loading = new Promise((resolve, reject) => {
    if (!apiKey) {
      reject(new Error('Missing VITE_GOOGLE_MAPS_API_KEY in .env'))
      return
    }
    window.__pathiqMapsReady = async () => {
      try {
        const [maps, marker, core, places] = await Promise.all([
          window.google.maps.importLibrary('maps'),
          window.google.maps.importLibrary('marker'),
          window.google.maps.importLibrary('core'),
          window.google.maps.importLibrary('places'),
        ])
        resolve({ ...core, ...maps, ...marker, ...places })
      } catch (err) {
        reject(err)
      }
    }
    const script = document.createElement('script')
    script.src =
      `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}` +
      '&v=weekly&loading=async&callback=__pathiqMapsReady'
    script.async = true
    script.onerror = () => {
      script.remove()
      loading = null // allow a retry on the next mount
      reject(new Error('Could not load Google Maps — check your connection'))
    }
    document.head.appendChild(script)
  })
  return loading
}
