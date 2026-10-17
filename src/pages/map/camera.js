import { offsetPoint } from '../../lib/navigation'
import { NAV_ZOOM } from './constants'

// The heading-up camera (navigation and step preview). The map is a raster
// map styled from code, which Google can't rotate (that needs a vector map
// with a Cloud map ID), so MapPage turns the whole canvas instead: while
// following a route, .map-page.heading-up makes the canvas a square big
// enough to cover the screen at any angle and rotates it by --map-rot.

// Where the driver sits: this share of the map's height below its middle,
// so more of the road ahead is on screen, as in Google Maps.
const AHEAD_SHARE = 0.17

// Centre the map a little ahead of `pos` along `heading` (degrees), which on
// a heading-up map puts `pos` in the lower part of the screen.
export function cameraAhead(map, pos, heading, { zoom = false } = {}) {
  if (!map || !pos) return
  if (zoom) map.setZoom(NAV_ZOOM)
  if (heading == null) return map.panTo(pos)
  const height = document.querySelector('.map-page')?.offsetHeight ?? 600
  const metresPerPx = (156543.03392 * Math.cos((pos.lat * Math.PI) / 180)) / 2 ** (map.getZoom() ?? NAV_ZOOM)
  map.panTo(offsetPoint(pos, heading, height * AHEAD_SHARE * metresPerPx))
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
