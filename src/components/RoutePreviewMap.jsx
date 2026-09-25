import { useEffect, useRef, useState } from 'react'
import { loadGoogleMaps, createPathiqMap } from '../lib/googleMaps'

const ROUTE_COLOR = '#00C9A7'
const ALT_ROUTE_COLOR = '#7A8C88'

// A small map for the Routes tab: every alternative, the selected one in
// colour, the start and the destination. Tapping a grey route selects it.
function RoutePreviewMap({ options, selectedId, origin, destination, onSelect }) {
  const divRef = useRef(null)
  const mapRef = useRef(null)
  const apiRef = useRef(null)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    loadGoogleMaps()
      .then((api) => {
        if (cancelled || !divRef.current || mapRef.current) return
        apiRef.current = api
        mapRef.current = createPathiqMap(api, divRef.current, {
          center: destination,
          zoom: 13,
          gestureHandling: 'cooperative', // the page scrolls; two fingers pan the map
        })
        setReady(true)
      })
      .catch((err) => !cancelled && setError(err.message))
    return () => {
      cancelled = true
    }
  }, [destination])

  // Lines and pins.
  const onSelectRef = useRef(onSelect)
  useEffect(() => {
    onSelectRef.current = onSelect
  }, [onSelect])
  useEffect(() => {
    const api = apiRef.current
    const map = mapRef.current
    if (!ready || !api || !options) return
    const lines = options.map((o) => {
      const selected = o.id === selectedId
      const line = new api.Polyline({
        map,
        path: o.path,
        strokeColor: selected ? ROUTE_COLOR : ALT_ROUTE_COLOR,
        strokeOpacity: selected ? 0.95 : 0.65,
        strokeWeight: selected ? 6 : 4,
        zIndex: selected ? 2 : 1,
      })
      line.addListener('click', () => onSelectRef.current?.(o.id))
      return line
    })
    const pins = []
    if (origin) {
      const dot = document.createElement('div')
      dot.className = 'map-user-dot'
      pins.push(new api.HtmlMarker({ map, position: origin, content: dot, zIndex: 5 }))
    }
    const dest = document.createElement('div')
    dest.className = 'map-pin-destination'
    pins.push(new api.HtmlMarker({ map, position: destination, content: dest, zIndex: 6 }))
    return () => {
      lines.forEach((l) => l.setMap(null))
      pins.forEach((p) => p.setMap(null))
    }
  }, [ready, options, selectedId, origin, destination])

  // Frame all alternatives when they arrive.
  useEffect(() => {
    const api = apiRef.current
    if (!ready || !api || !options?.length) return
    const bounds = new api.LatLngBounds()
    options.forEach((o) => o.path.forEach((p) => bounds.extend(p)))
    mapRef.current.fitBounds(bounds, 32)
  }, [ready, options])

  return (
    <div className="route-preview-map">
      <div ref={divRef} style={{ position: 'absolute', inset: 0 }} />
      {error && <p className="map-status">{error}</p>}
    </div>
  )
}

export default RoutePreviewMap
