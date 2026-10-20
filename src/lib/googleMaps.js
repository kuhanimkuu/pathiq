import { mapStyles } from './mapStyle'
import { currentTheme, onThemeChange } from './theme'

// Loads the Google Maps JavaScript API once, on demand. The key is a browser
// key (VITE_GOOGLE_MAPS_API_KEY) and is visible to anyone, so it must be
// restricted by HTTP referrer in Cloud Console. Routing never uses it — that
// goes through the `routes` edge function and its server-side key.

const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY
// A Cloud map ID for a *vector* map with PathIQ's style (docs/map-styling.md,
// "Heading-up map ID"). Optional: with it, Google turns and tilts the map
// natively while navigating; without it the app turns the canvas itself.
const mapId = import.meta.env.VITE_GOOGLE_MAP_ID

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

//
// `vector: true` (the driving map) uses the vector map ID when one is set, so
// it can turn heading-up and tilt. Its look then comes from the Cloud style
// behind the ID (code styles don't apply to map IDs), in the theme's light
// or dark variant as of when the map was made — a vector map can't switch
// colour scheme afterwards, so a theme change applies on the next visit.
export function createPathiqMap(api, element, { vector = false, ...options } = {}) {
  const g = window.google.maps
  const useMapId = vector && mapId
  const map = new api.Map(element, {
    ...(useMapId
      ? {
          mapId,
          renderingType: g.RenderingType?.VECTOR,
          colorScheme: currentTheme() === 'light' ? g.ColorScheme?.LIGHT : g.ColorScheme?.DARK,
          // Two-finger twist turns it and two-finger drag tilts it, as in
          // Google Maps (Ctrl/Shift + drag with a mouse); the compass in
          // MapControls turns it back north-up.
          headingInteractionEnabled: true,
          tiltInteractionEnabled: true,
        }
      : { styles: mapStyles(currentTheme()) }),
    backgroundColor: mapBackground(currentTheme()),
    disableDefaultUI: true,
    zoomControl: true,
    clickableIcons: false,
    gestureHandling: 'greedy',
    ...options,
  })
  if (useMapId) return map
  // Restyle when the theme changes (header switch, Profile, or the device
  // going dark), until the map leaves the page.
  const stop = onThemeChange((theme) => {
    if (!element.isConnected) return stop()
    map.setOptions({ styles: mapStyles(theme), backgroundColor: mapBackground(theme) })
  })
  return map
}

// Whether Google can turn and tilt this map itself (a vector map). Known once
// the map has picked its renderer: `onChange(isVector)` is called then.
export function watchVector(map, onChange) {
  const check = () => onChange(map.getRenderingType?.() === 'VECTOR')
  check()
  return map.addListener('renderingtype_changed', check)
}

// Our markers: any DOM element, positioned on the map with its centre on the
// point (CSS decides the exact anchor — see .map-pin in App.css). Built on
// OverlayView rather than AdvancedMarkerElement, because Advanced Markers need
// a Cloud map ID, which rules out styling the map from code.
//
// Each sits in a zero-size wrapper on the exact point. When the map is turned
// heading-up (.map-page.heading-up in App.css), `upright` markers (pins,
// badges) counter-rotate about that point so they stay readable; the others
// (the driver's arrow, turn icons) turn with the map, because which way they
// point is part of what they say.
function defineHtmlMarker(api) {
  return class HtmlMarker extends api.OverlayView {
    constructor({ map, position, content, zIndex = 1, upright = true }) {
      super()
      this.position = position
      this.content = content
      content.style.position = 'absolute'
      const wrapper = document.createElement('div')
      wrapper.className = upright ? 'html-marker upright' : 'html-marker'
      wrapper.style.position = 'absolute'
      wrapper.style.zIndex = String(zIndex)
      wrapper.appendChild(content)
      this.wrapper = wrapper
      // Taps on a marker shouldn't also count as a tap on the map underneath.
      api.OverlayView.preventMapHitsAndGesturesFrom(wrapper)
      this.setMap(map)
    }

    onAdd() {
      this.getPanes().overlayMouseTarget.appendChild(this.wrapper)
    }

    draw() {
      const point = this.getProjection()?.fromLatLngToDivPixel(new api.LatLng(this.position))
      if (!point) return
      this.wrapper.style.left = `${point.x}px`
      this.wrapper.style.top = `${point.y}px`
    }

    onRemove() {
      this.wrapper.remove()
    }

    setPosition(position) {
      this.position = position
      this.draw()
    }
  }
}
