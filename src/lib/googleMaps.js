import { mapStyles } from './mapStyle'
import { currentTheme, onThemeChange } from './theme'

// Loads the Google Maps JavaScript API once, on demand. The key is a browser
// key (VITE_GOOGLE_MAPS_API_KEY) and is visible to anyone, so it must be
// restricted by HTTP referrer in Cloud Console. Routing never uses it — that
// goes through the `routes` edge function and its server-side key.

const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY

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
        const [maps, core, places] = await Promise.all([
          window.google.maps.importLibrary('maps'),
          window.google.maps.importLibrary('core'),
          window.google.maps.importLibrary('places'),
        ])
        const api = { ...core, ...maps, ...places }
        // Arrow/dot shapes for route lines; not in every library bundle.
        api.SymbolPath ??= window.google.maps.SymbolPath
        api.HtmlMarker = defineHtmlMarker(api)
        resolve(api)
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

// A map in PathIQ's own style (src/lib/mapStyle.js), for the current theme.
const mapBackground = (theme) => (theme === 'light' ? '#F4F7F6' : '#0A1512')

export function createPathiqMap(api, element, options) {
  const map = new api.Map(element, {
    styles: mapStyles(currentTheme()),
    backgroundColor: mapBackground(currentTheme()),
    disableDefaultUI: true,
    zoomControl: true,
    clickableIcons: false,
    gestureHandling: 'greedy',
    ...options,
  })
  // Restyle when the theme changes (header switch, Profile, or the device
  // going dark), until the map leaves the page.
  const stop = onThemeChange((theme) => {
    if (!element.isConnected) return stop()
    map.setOptions({ styles: mapStyles(theme), backgroundColor: mapBackground(theme) })
  })
  return map
}

// Our markers: any DOM element, positioned on the map with its centre on the
// point (CSS decides the exact anchor — see .map-pin in App.css). Built on
// OverlayView rather than AdvancedMarkerElement, because Advanced Markers need
// a Cloud map ID, which rules out styling the map from code.
function defineHtmlMarker(api) {
  return class HtmlMarker extends api.OverlayView {
    constructor({ map, position, content, zIndex = 1 }) {
      super()
      this.position = position
      this.content = content
      content.style.position = 'absolute'
      content.style.zIndex = String(zIndex)
      // Taps on a marker shouldn't also count as a tap on the map underneath.
      api.OverlayView.preventMapHitsAndGesturesFrom(content)
      this.setMap(map)
    }

    onAdd() {
      this.getPanes().overlayMouseTarget.appendChild(this.content)
    }

    draw() {
      const point = this.getProjection()?.fromLatLngToDivPixel(new api.LatLng(this.position))
      if (!point) return
      this.content.style.left = `${point.x}px`
      this.content.style.top = `${point.y}px`
    }

    onRemove() {
      this.content.remove()
    }

    setPosition(position) {
      this.position = position
      this.draw()
    }
  }
}
