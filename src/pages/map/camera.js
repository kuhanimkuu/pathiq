import { offsetPoint } from '../../lib/navigation'
import { NAV_ZOOM } from './constants'

// The heading-up camera (navigation and step preview), two ways:
//  - native: with a vector map ID (lib/googleMaps.js), Google turns and tilts
//    the map itself; the camera glides there (animateCamera).
//  - fallback: a raster map styled from code can't be rotated by Google, so
//    MapPage turns the whole canvas: .map-page.heading-up makes it a square
//    big enough to cover the screen at any angle and rotates it by --map-rot.

// Where the driver sits: this share of the map's height below its middle,
// so more of the road ahead is on screen, as in Google Maps.
const AHEAD_SHARE = 0.17
// Native heading-up: tilted like a driving view, and how long each move glides.
export const NAV_TILT = 45
const GLIDE_MS = 800

const isVector = (map) => map.getRenderingType?.() === 'VECTOR'

// Glide a vector map's camera to `target` ({ center?, heading?, tilt?, zoom? }),
// the short way round for the heading. A new move replaces one in progress.
export function animateCamera(map, target, ms = GLIDE_MS) {
  cancelAnimationFrame(map.__pathiqGlide ?? 0)
  const c = map.getCenter()
  const from = {
    lat: c?.lat(),
    lng: c?.lng(),
    heading: map.getHeading?.() ?? 0,
    tilt: map.getTilt?.() ?? 0,
    zoom: map.getZoom(),
  }
  const turn = target.heading == null ? 0 : ((((target.heading - from.heading) % 360) + 540) % 360) - 180
  const start = performance.now()
  const step = (now) => {
    const t = Math.min(1, (now - start) / ms)
    const e = 1 - (1 - t) ** 3 // ease out
    // Only what was asked for moves; the rest is left alone (e.g. a fitBounds in progress).
    const lerp = (a, b) => (b == null || a == null ? undefined : a + (b - a) * e)
    map.moveCamera({
      center: target.center && from.lat != null ? { lat: lerp(from.lat, target.center.lat), lng: lerp(from.lng, target.center.lng) } : undefined,
      heading: target.heading == null ? undefined : from.heading + turn * e,
      tilt: lerp(from.tilt, target.tilt),
      zoom: lerp(from.zoom, target.zoom),
    })
    if (t < 1) map.__pathiqGlide = requestAnimationFrame(step)
  }
  map.__pathiqGlide = requestAnimationFrame(step)
}

// Centre the map a little ahead of `pos` along `heading` (degrees), which on
// a heading-up map puts `pos` in the lower part of the screen.
export function cameraAhead(map, pos, heading, { zoom = false } = {}) {
  if (!map || !pos) return
  const native = isVector(map)
  if (zoom && !native) map.setZoom(NAV_ZOOM)
  const targetZoom = zoom ? NAV_ZOOM : map.getZoom() ?? NAV_ZOOM
  let center = pos
  if (heading != null) {
    const height = document.querySelector('.map-page')?.offsetHeight ?? 600
    const metresPerPx = (156543.03392 * Math.cos((pos.lat * Math.PI) / 180)) / 2 ** targetZoom
    center = offsetPoint(pos, heading, height * AHEAD_SHARE * metresPerPx)
  }
  if (native) {
    animateCamera(map, { center, zoom: zoom ? NAV_ZOOM : undefined, ...(heading != null && { heading, tilt: NAV_TILT }) })
  } else {
    map.panTo(center)
  }
}

// How far the (oversized, heading-up) canvas reaches past the visible map on
// each side, in px — fitBounds padding has to add it to keep things on screen.
export function canvasOverflow() {
  const canvas = document.querySelector('.map-canvas')
  const page = document.querySelector('.map-page')
  if (!canvas || !page) return { x: 0, y: 0 }
  return {
    x: Math.max(0, (canvas.offsetWidth - page.offsetWidth) / 2),
    y: Math.max(0, (canvas.offsetHeight - page.offsetHeight) / 2),
  }
}
