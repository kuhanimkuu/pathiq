import { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { loadGoogleMaps, createPathiqMap, AUTH_FAILURE_EVENT, mapsAuthFailed } from '../../lib/googleMaps'
import { GemPin, ReportPin } from '../../components/PlaceIcons'

// A small map for checking or setting where a gem or report is. One point,
// drawn with the same pins drivers see. With onMove, tapping the map moves it.
function AdminMap({ lat, lng, kind, category, type, severity, onMove, height = 220, zoom = 16 }) {
  const elRef = useRef(null)
  const mapRef = useRef(null)
  const apiRef = useRef(null)
  const markerRef = useRef(null)
  const onMoveRef = useRef(onMove)
  const pointRef = useRef(null)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    onMoveRef.current = onMove
  }, [onMove])

  const hasPoint = Number.isFinite(lat) && Number.isFinite(lng)
  useEffect(() => {
    pointRef.current = hasPoint ? { lat, lng } : null
  }, [hasPoint, lat, lng])

  // Create the map once.
  useEffect(() => {
    let cancelled = false
    let cleanup = () => {}
    const onAuthFailure = () => setError('Google Maps refused this site’s key.')
    window.addEventListener(AUTH_FAILURE_EVENT, onAuthFailure)
    if (mapsAuthFailed()) onAuthFailure()
    loadGoogleMaps()
      .then((api) => {
        if (cancelled || !elRef.current) return
        apiRef.current = api
        const center = hasPoint ? { lat, lng } : { lat: -1.2833, lng: 36.8167 }
        mapRef.current = createPathiqMap(api, elRef.current, {
          center,
          zoom: hasPoint ? zoom : 12,
          draggableCursor: onMoveRef.current ? 'crosshair' : undefined,
          gestureHandling: 'cooperative',
        })
        mapRef.current.addListener('click', (e) => {
          onMoveRef.current?.({ lat: e.latLng.lat(), lng: e.latLng.lng() })
        })
        // In a dialog the map is often created before its box has its final
        // size, which leaves the pin off-centre. Re-centre when it settles.
        const ro = new ResizeObserver(() => pointRef.current && mapRef.current?.setCenter(pointRef.current))
        ro.observe(elRef.current)
        cleanup = () => ro.disconnect()
        setReady(true)
      })
      .catch((err) => !cancelled && setError(err.message))
    return () => {
      cancelled = true
      cleanup()
      window.removeEventListener(AUTH_FAILURE_EVENT, onAuthFailure)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- created once; the point is synced below
  }, [])

  // Draw / move the pin.
  useEffect(() => {
    const api = apiRef.current
    const map = mapRef.current
    if (!ready || !api || !map || !hasPoint) return
    const el = document.createElement('div')
    el.className = 'marker-host'
    const root = createRoot(el)
    root.render(kind === 'report' ? <ReportPin type={type} severity={severity} selected /> : <GemPin category={category} selected />)
    const marker = new api.HtmlMarker({ map, position: { lat, lng }, content: el, zIndex: 10 })
    markerRef.current = marker
    if (!map.getBounds()?.contains({ lat, lng })) map.panTo({ lat, lng })
    return () => {
      marker.setMap(null)
      setTimeout(() => root.unmount())
    }
  }, [ready, hasPoint, lat, lng, kind, category, type, severity])

  return (
    <div className="admin-map" style={{ height }}>
      <div ref={elRef} className="admin-map-canvas" />
      {error && <div className="admin-map-error">{error}</div>}
    </div>
  )
}

// Location input for the editors: tap the map, or type / paste "lat, lng"
// (what Google Maps copies when you right-click a spot).
export function LocationField({ value, onChange, ...pin }) {
  const [text, setText] = useState(value ? `${value.lat.toFixed(6)}, ${value.lng.toFixed(6)}` : '')
  const [bad, setBad] = useState(false)

  function move(p) {
    setText(`${p.lat.toFixed(6)}, ${p.lng.toFixed(6)}`)
    setBad(false)
    onChange(p)
  }

  function onText(t) {
    setText(t)
    const m = t.match(/^\s*(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)\s*$/)
    const lat = m && Number(m[1])
    const lng = m && Number(m[2])
    const ok = m && Math.abs(lat) <= 90 && Math.abs(lng) <= 180
    setBad(!ok && t.trim() !== '')
    if (ok) onChange({ lat, lng })
  }

  return (
    <div className="admin-field">
      <span>Location: tap the map, or paste coordinates</span>
      <input
        className={'form-input mono' + (bad ? ' invalid' : '')}
        value={text}
        placeholder="-1.28333, 36.81667"
        onChange={(e) => onText(e.target.value)}
        aria-invalid={bad}
      />
      <AdminMap lat={value?.lat} lng={value?.lng} onMove={move} height={260} {...pin} />
    </div>
  )
}

export default AdminMap
