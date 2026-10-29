import { useEffect, useMemo, useRef } from 'react'
import { createRoot } from 'react-dom/client'
import ManeuverIcon from '../../components/ManeuverIcon'
import { buildNavModel, slicePath, headingAt } from '../../lib/navigation'
import { severityBand } from '../../lib/roadReports'
import { currentTheme } from '../../lib/theme'
import { ROUTE_COLOR, ALT_ROUTE_COLOR, TRAFFIC_COLOR } from './constants'

// Road reports on the route: a dotted stretch this far either side of the
// report, in its severity colour (mirrors --red / --amber / --blue). Dotted so
// it never reads as traffic.
const REPORT_STRETCH_M = 120
const SEVERITY_COLOR = { high: '#EF4444', medium: '#F59E0B', low: '#3B82F6' }
// The road already driven: grey rather than the route's colour, and fading
// the further behind the driver it is — strongest just behind them, down to
// a faint trace that never quite disappears, so you can still see where you
// came from. The coloured route, its traffic and arrows only cover what's ahead.
const FADE_BANDS = [0.8, 0.66, 0.54, 0.44, 0.36] // strength of each band behind the driver, nearest first
const FADE_BAND_M = 80
const FADED_OPACITY = 0.26 // everything further back
// The bands are solid colours (the grey mixed into the map's own colour)
// rather than see-through lines: see-through lines darken where they
// overlap, which left a dot at every band's joint.
function fadedColor(strength) {
  const bg = currentTheme() === 'light' ? [0xff, 0xff, 0xff] : [0x1a, 0x26, 0x23]
  const fg = [0x8a, 0x98, 0x95] // the driven road's grey, #8A9895
  return '#' + fg.map((c, i) => Math.round(bg[i] + (c - bg[i]) * strength).toString(16).padStart(2, '0')).join('')
}
// Manoeuvres whose icon points along the road (no turn): their arrow is
// turned to the road's direction after them, so it never points backwards.
const ALONG_ROAD = new Set(['DEPART', 'STRAIGHT', 'NAME_CHANGE', 'MERGE'])

// The driver: a PathIQ arrow pointing the way they're heading, or a dot when
// that isn't known (standing still, no route).
const USER_MARKER_HTML = `
  <div class="map-user-halo"></div>
  <svg class="map-user-arrow" viewBox="0 0 40 40" width="34" height="34" aria-hidden="true">
    <path d="M20 3 L34 35 L20 27.5 L6 35 Z" fill="#00C9A7" stroke="#FFFFFF" stroke-width="3" stroke-linejoin="round"/>
    <path d="M20 12 L23.5 17.5 L20 23 L16.5 17.5 Z" fill="#FFB020"/>
  </svg>
  <div class="map-user-dot-core"></div>`

// Everything drawn on the map canvas that isn't a pin: the driver's arrow,
// Google's traffic layer, and the planned routes with their traffic, road
// reports, direction arrows and turn icons.
//   driverPos / driverHeading   where to draw the driver, and which way they face (degrees, or null)
//   navModel / travelledM       while navigating: the route and how far along it the driver is
//   passedStepIndex             turn icons up to this step are behind the driver
export default function useRouteOverlays({
  mapRef,
  mapsApiRef,
  mapReady,
  driverPos,
  driverHeading,
  layers,
  plan,
  selectedRoute,
  followingRoute,
  navModel,
  travelledM,
  passedStepIndex,
  onSelectRoute,
}) {
  // The driver: one marker, moved as GPS updates arrive. Only for a real
  // fix; with location off there's no "you are here". It turns with the map
  // (not `upright`), so on a heading-up map the arrow points up the screen.
  const userMarkerRef = useRef(null)
  const headingRef = useRef(0) // unwrapped, so 359° → 1° turns 2°, not back round
  useEffect(() => {
    const api = mapsApiRef.current
    if (!mapReady || !api || !driverPos) return
    if (!userMarkerRef.current) {
      const el = document.createElement('div')
      el.className = 'map-user-marker'
      el.setAttribute('aria-label', 'Your location')
      el.innerHTML = USER_MARKER_HTML
      userMarkerRef.current = new api.HtmlMarker({ map: mapRef.current, position: driverPos, content: el, zIndex: 30, upright: false })
    } else {
      userMarkerRef.current.setPosition(driverPos)
    }
    const el = userMarkerRef.current.content
    el.classList.toggle('has-heading', driverHeading != null)
    if (driverHeading != null) {
      const prev = headingRef.current
      headingRef.current = prev + ((((driverHeading - prev) % 360) + 540) % 360) - 180
      el.style.setProperty('--heading', `${headingRef.current}deg`)
    }
  }, [mapRef, mapsApiRef, mapReady, driverPos, driverHeading])

  // The part of the route already driven, fading out behind the driver: one
  // line for everything well behind, and a band per FADE_BANDS getting
  // stronger towards the driver.
  const travelledRef = useRef([])
  useEffect(() => {
    const api = mapsApiRef.current
    if (!mapReady || !api || !navModel) return
    const lines = [FADED_OPACITY, ...[...FADE_BANDS].reverse()].map(
      (strength, i) =>
        new api.Polyline({
          map: mapRef.current,
          path: [],
          strokeColor: fadedColor(strength),
          strokeOpacity: 1,
          strokeWeight: 7,
          zIndex: 6 + i * 0.01,
          clickable: false,
        }),
    )
    travelledRef.current = lines
    return () => {
      lines.forEach((l) => l.setMap(null))
      travelledRef.current = []
    }
  }, [mapRef, mapsApiRef, mapReady, navModel])
  useEffect(() => {
    const lines = travelledRef.current
    if (!lines.length || !navModel) return
    const bands = FADE_BANDS.length
    const fadeStart = travelledM - bands * FADE_BAND_M
    // lines[0]: start → fadeStart; lines[1..]: the bands, furthest first.
    lines[0].setPath(fadeStart > 0 ? slicePath(navModel, 0, fadeStart) : [])
    for (let i = 0; i < bands; i++) {
      const from = fadeStart + i * FADE_BAND_M
      lines[i + 1].setPath(slicePath(navModel, Math.max(0, from), Math.min(travelledM, from + FADE_BAND_M)))
    }
  }, [navModel, travelledM])

  // Google's live traffic, as an optional layer under ours.
  const trafficRef = useRef(null)
  useEffect(() => {
    const api = mapsApiRef.current
    if (!mapReady || !api) return
    trafficRef.current ??= new api.TrafficLayer()
    trafficRef.current.setMap(layers.traffic ? mapRef.current : null)
  }, [mapRef, mapsApiRef, mapReady, layers.traffic])

  // PathIQ's road intelligence drawn onto the route itself: the stretch around
  // each live report on the selected route, in its severity colour.
  useEffect(() => {
    const api = mapsApiRef.current
    if (!mapReady || !api || !selectedRoute?.hazards?.length || !layers.reports) return
    const model = buildNavModel(selectedRoute)
    const lines = selectedRoute.hazards
      .map((report) => {
        const s = report.routeFraction * model.total
        const stretch = slicePath(model, s - REPORT_STRETCH_M, s + REPORT_STRETCH_M)
        if (stretch.length < 2) return null
        return new api.Polyline({
          map: mapRef.current,
          path: stretch,
          strokeOpacity: 0, // drawn entirely by the dots below
          zIndex: 4,
          icons: [
            {
              icon: {
                path: api.SymbolPath.CIRCLE,
                scale: 3.2,
                fillColor: SEVERITY_COLOR[severityBand(report.severity)],
                fillOpacity: 1,
                strokeColor: '#050D0B',
                strokeOpacity: 1, // symbols inherit the line's opacity (0) otherwise
                strokeWeight: 1.2,
              },
              offset: '0',
              repeat: '11px',
            },
          ],
        })
      })
      .filter(Boolean)
    return () => lines.forEach((l) => l.setMap(null))
  }, [mapRef, mapsApiRef, mapReady, selectedRoute, layers.reports])

  // Route lines: every alternative, the selected one on top and in colour.
  // Tapping a grey alternative selects it. While navigating or previewing,
  // only the route being followed is shown.
  const selectRef = useRef(onSelectRoute)
  useEffect(() => {
    selectRef.current = onSelectRoute
  })
  // The selected route's own lines, so navigation can trim them to what's
  // still ahead: { path, cum, parts: [{ line, fromS, toS }] }.
  const selectedLinesRef = useRef(null)
  useEffect(() => {
    const map = mapRef.current
    const api = mapsApiRef.current
    if (!mapReady || !map || !api || !plan) return
    const lines = plan.options
      .filter((option) => !followingRoute || option.id === plan.selectedId)
      .flatMap((option) => {
        const isSelected = option.id === plan.selectedId
        const base = new api.Polyline({
          map,
          path: option.path,
          strokeColor: isSelected ? ROUTE_COLOR : ALT_ROUTE_COLOR,
          strokeOpacity: isSelected ? 0.95 : 0.7,
          strokeWeight: isSelected ? 7 : 5,
          zIndex: isSelected ? 2 : 1,
        })
        base.addListener('click', () => selectRef.current(option.id))
        if (!isSelected) return [base]
        const { cum, total } = buildNavModel(option)
        const at = (i) => cum[Math.min(i, cum.length - 1)] ?? total
        // Traffic on the selected route, over the base line.
        const traffic = (option.traffic ?? []).map((t) => ({
          line: new api.Polyline({
            map,
            path: option.path.slice(t.from, t.to + 1),
            strokeColor: TRAFFIC_COLOR[t.speed],
            strokeOpacity: 1,
            strokeWeight: 7,
            zIndex: 3,
          }),
          fromS: at(t.from),
          toS: at(t.to),
        }))
        // Direction arrows along the whole route, on top of everything.
        const arrows = new api.Polyline({
          map,
          path: option.path,
          strokeOpacity: 0,
          zIndex: 5,
          clickable: false,
          icons: [
            {
              // Symbols inherit the line's opacity (0 here) unless they set their own.
              icon: { path: api.SymbolPath.FORWARD_OPEN_ARROW, scale: 1.8, strokeColor: '#050D0B', strokeOpacity: 0.85, strokeWeight: 2 },
              offset: '30px',
              repeat: '80px',
            },
          ],
        })
        selectedLinesRef.current = {
          path: option.path,
          parts: [{ line: base, fromS: 0, toS: total }, ...traffic, { line: arrows, fromS: 0, toS: total }],
        }
        return [base, ...traffic.map((t) => t.line), arrows]
      })
    return () => {
      selectedLinesRef.current = null
      lines.forEach((l) => l.setMap(null))
    }
  }, [mapRef, mapsApiRef, mapReady, plan, followingRoute])

  // While navigating, the coloured route, its traffic and its arrows start at
  // the driver; behind them is the fading trace above.
  useEffect(() => {
    const sel = selectedLinesRef.current
    if (!sel || !navModel || navModel.path !== sel.path) return
    sel.parts.forEach(({ line, fromS, toS }) => line.setPath(slicePath(navModel, Math.max(fromS, travelledM), toS)))
  }, [navModel, travelledM, plan, followingRoute])

  // Turn icons at each manoeuvre of the selected route (shown at street level).
  // Each is turned to the road: a turn icon's "up" is the way you arrive, and
  // a straight-on arrow points the way you'll go — on a north-up map too.
  const selectedModel = useMemo(() => (selectedRoute?.path?.length ? buildNavModel(selectedRoute) : null), [selectedRoute])
  const maneuversRef = useRef([])
  useEffect(() => {
    const api = mapsApiRef.current
    if (!mapReady || !api || !selectedModel || !selectedRoute?.steps?.length) return
    const created = selectedRoute.steps.map((step, i) => {
      if (i === 0) return null // the start: the driver's own arrow is there
      const s = selectedModel.stepEnds[i - 1]
      // Getting on a bus or train: the vehicle, upright, not a direction.
      const transit = step.maneuver?.startsWith('TRANSIT_')
      const bearing = transit
        ? 0
        : ALONG_ROAD.has(step.maneuver)
          ? headingAt(selectedModel, s, 0, 30)
          : headingAt(selectedModel, s, 30, 0)
      const el = document.createElement('div')
      el.className = 'maneuver-marker' + (transit ? ' transit' : '')
      el.title = step.instruction
      el.style.setProperty('--bearing', `${bearing ?? 0}deg`)
      const root = createRoot(el)
      root.render(<ManeuverIcon maneuver={step.maneuver} size={13} strokeWidth={2.5} />)
      return {
        el,
        marker: new api.HtmlMarker({ map: mapRef.current, position: step.start, content: el, zIndex: 22, upright: transit }),
        root,
      }
    })
    maneuversRef.current = created
    return () => {
      maneuversRef.current = []
      created.forEach((m) => {
        if (!m) return
        m.marker.setMap(null)
        setTimeout(() => m.root.unmount()) // not during React's own commit
      })
    }
  }, [mapRef, mapsApiRef, mapReady, selectedRoute, selectedModel])

  // While driving, turns already made drop off the map.
  useEffect(() => {
    maneuversRef.current.forEach((m, i) => m?.el.classList.toggle('passed', passedStepIndex != null && i <= passedStepIndex))
  }, [passedStepIndex, selectedRoute])
}
