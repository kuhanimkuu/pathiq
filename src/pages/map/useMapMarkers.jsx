import { useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { GemPin, ReportPin } from '../../components/PlaceIcons'
import { PinnedPin } from '../../components/PinnedIcon'
import { reportTypeLabel } from '../../lib/roadReports'

// Everything pinned on the map: gems (PathIQ's above Google's), pinned
// places, road reports, and the route's own points (start, stops, destination,
// a dropped pin). Redrawn whenever any of them change.
export default function useMapMarkers({
  mapRef,
  mapsApiRef,
  mapReady,
  gems,
  incidents,
  pinned,
  routeGemIds,
  routeReportIds,
  routeFocus,
  draft,
  dropped,
  selected,
  savedIds,
  onSelectGem,
  onSelectIncident,
  onSelectPinned,
}) {
  useEffect(() => {
    const map = mapRef.current
    const api = mapsApiRef.current
    if (!mapReady || !map || !api) return
    const markers = []
    const roots = []
    const add = (latLng, content, zIndex, onClick) => {
      markers.push(new api.HtmlMarker({ map, position: latLng, content, zIndex }))
      if (onClick) {
        content.addEventListener('click', (e) => {
          e.stopPropagation()
          onClick()
        })
      }
    }
    // A focusable button hosting one of our React pins (components/PlaceIcons).
    const host = (label, pin) => {
      const el = document.createElement('button')
      el.type = 'button'
      el.className = 'marker-host'
      el.setAttribute('aria-label', label)
      const root = createRoot(el)
      root.render(pin)
      roots.push(root)
      return el
    }

    for (const gem of gems) {
      const onRoute = routeGemIds.has(gem.id)
      const isSelected = selected?.type === 'gem' && selected.id === gem.id
      const google = gem.source === 'google'
      const el = host(
        google ? `${gem.name} (from Google)` : gem.name,
        <GemPin
          category={gem.category}
          onRoute={onRoute}
          dimmed={routeFocus && !onRoute && !isSelected}
          google={google}
          saved={savedIds.has(gem.id)}
          selected={isSelected}
        />,
      )
      // PathIQ gems always sit above Google's places.
      const zIndex = isSelected ? 40 : (onRoute ? 20 : 10) - (google ? 5 : 0)
      add({ lat: gem.lat, lng: gem.lng }, el, zIndex, () => onSelectGem(gem))
    }

    for (const p of pinned) {
      const isSelected = dropped?.kind === 'pinned' && dropped.pinId === p.id
      const el = host(p.name, <PinnedPin label={p.label} selected={isSelected} />)
      add({ lat: p.lat, lng: p.lng }, el, isSelected ? 40 : 24, () => onSelectPinned(p))
    }

    for (const incident of incidents) {
      const onRoute = routeReportIds.has(incident.id)
      const isSelected = selected?.type === 'incident' && selected.id === incident.id
      const el = host(
        `${reportTypeLabel(incident.type)}, severity ${incident.severity}`,
        <ReportPin
          type={incident.type}
          severity={incident.severity}
          onRoute={onRoute}
          dimmed={routeFocus && !onRoute && !isSelected}
          selected={isSelected}
        />,
      )
      add({ lat: incident.lat, lng: incident.lng }, el, isSelected ? 40 : onRoute ? 21 : 11, () =>
        onSelectIncident(incident),
      )
    }

    // The route's own points: a chosen start (not "Your location", which is
    // the blue dot), numbered stops, and the destination.
    if (draft?.from && !draft.from.me) {
      const start = document.createElement('div')
      start.className = 'map-pin-start'
      start.setAttribute('aria-label', 'Start: ' + draft.from.name)
      add(draft.from, start, 26)
    }
    draft?.stops.forEach((stop, i) => {
      const el = document.createElement('div')
      el.className = 'map-pin-stop'
      el.textContent = String(i + 1)
      el.setAttribute('aria-label', `Stop ${i + 1}: ${stop.name}`)
      add(stop, el, 26)
    })
    for (const [pin, label] of [
      [draft?.to && !draft.to.me ? draft.to : null, 'Destination'],
      [dropped && (dropped.kind === 'dropped' || dropped.kind === 'shared') ? dropped : null, 'Dropped pin'],
    ]) {
      if (!pin) continue
      const dest = document.createElement('div')
      dest.className = 'map-pin-destination'
      dest.setAttribute('aria-label', label)
      add(pin, dest, 25)
    }

    return () => {
      markers.forEach((m) => m.setMap(null))
      setTimeout(() => roots.forEach((r) => r.unmount())) // not during React's own commit
    }
    // The select handlers only call state setters; leaving them out keeps the
    // markers from being rebuilt on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapReady, gems, incidents, routeGemIds, routeReportIds, routeFocus, draft, dropped, selected, savedIds, pinned])
}
