import { useEffect, useRef } from 'react'
import { createRoot } from 'react-dom/client'
import ManeuverIcon from '../../components/ManeuverIcon'
import { buildNavModel, slicePath } from '../../lib/navigation'
import { severityBand } from '../../lib/roadReports'
import { ROUTE_COLOR, ALT_ROUTE_COLOR, TRAFFIC_COLOR } from './constants'

// Road reports on the route: a dotted stretch this far either side of the
// report, in its severity colour (mirrors --red / --amber / --blue). Dotted so
// it never reads as traffic.
const REPORT_STRETCH_M = 120
const SEVERITY_COLOR = { high: '#EF4444', medium: '#F59E0B', low: '#3B82F6' }

// Everything drawn on the map canvas that isn't a pin: the driver's dot,
// Google's traffic layer, and the planned routes with their traffic, road
// reports, direction arrows and turn icons.
export default function useRouteOverlays({ mapRef, mapsApiRef, mapReady, livePos, layers, plan, selectedRoute, followingRoute, onSelectRoute }) {
  // The driver's dot: one marker, moved as GPS updates arrive. Only for a
  // real fix; with location off there's no "you are here".
  const userMarkerRef = useRef(null)
  useEffect(() => {
    const api = mapsApiRef.current
    if (!mapReady || !api || !livePos) return
    if (!userMarkerRef.current) {
      const dot = document.createElement('div')
      dot.className = 'map-user-dot'
      dot.setAttribute('aria-label', 'Your location')
      userMarkerRef.current = new api.HtmlMarker({ map: mapRef.current, position: livePos, content: dot, zIndex: 30 })
    } else {
      userMarkerRef.current.setPosition(livePos)
    }
  }, [mapRef, mapsApiRef, mapReady, livePos])

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
        // Traffic on the selected route, over the base line.
        const traffic = (option.traffic ?? []).map(
          (t) =>
            new api.Polyline({
              map,
              path: option.path.slice(t.from, t.to + 1),
              strokeColor: TRAFFIC_COLOR[t.speed],
              strokeOpacity: 1,
              strokeWeight: 7,
              zIndex: 3,
            }),
        )
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
        return [base, ...traffic, arrows]
      })
    return () => lines.forEach((l) => l.setMap(null))
  }, [mapRef, mapsApiRef, mapReady, plan, followingRoute])

  // Turn icons at each manoeuvre of the selected route (shown at street level).
  useEffect(() => {
    const api = mapsApiRef.current
    if (!mapReady || !api || !selectedRoute?.steps?.length) return
    const created = selectedRoute.steps.slice(1).map((step) => {
      const el = document.createElement('div')
      el.className = 'maneuver-marker'
      el.title = step.instruction
      const root = createRoot(el)
      root.render(<ManeuverIcon maneuver={step.maneuver} size={13} strokeWidth={2.5} />)
      return { marker: new api.HtmlMarker({ map: mapRef.current, position: step.start, content: el, zIndex: 22 }), root }
    })
    return () =>
      created.forEach(({ marker, root }) => {
        marker.setMap(null)
        setTimeout(() => root.unmount()) // not during React's own commit
      })
  }, [mapRef, mapsApiRef, mapReady, selectedRoute])
}
