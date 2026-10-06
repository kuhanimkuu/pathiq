import { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Link, useNavigate } from 'react-router-dom'
import { loadGoogleMaps, createPathiqMap, AUTH_FAILURE_EVENT, mapsAuthFailed } from '../../../lib/googleMaps'
import { supabase } from '../../../lib/supabase'
import { FALLBACK_LOCATION } from '../../../lib/gems'
import { GemPin, ReportPin, GemBadge, ReportBadge } from '../../../components/PlaceIcons'

// Nairobi, wide enough to show the city's gems and reports.
const CENTER = FALLBACK_LOCATION
const ZOOM = 12

// The hero's map: a real Google map in PathIQ's style with the live Hidden
// Gems and road reports from the database. (No Google traffic layer: it paints
// every road green and drowns out PathIQ's own data.)
// Visitors here usually have no session, so the data comes from
// public_map_points, which returns only what the map draws (see its
// migration). Until the map is up (or if Google can't load), the drawn map
// below stands in.
//   onData({ gems, reports }) once PathIQ's data has loaded
export default function HeroMap({ onData }) {
  const navigate = useNavigate()
  const divRef = useRef(null)
  const [ready, setReady] = useState(false)
  const [data, setData] = useState(null) // { gems, reports }
  const onDataRef = useRef(onData)
  useEffect(() => {
    onDataRef.current = onData
  })

  // PathIQ's own data: independent of Google, so the counts show either way.
  useEffect(() => {
    let cancelled = false
    supabase
      .rpc('public_map_points')
      .then(({ data: points, error }) => {
        if (cancelled || error || !points) return
        const { gems, reports } = points
        setData({ gems, reports })
        onDataRef.current?.({ gems, reports })
      })
      .catch(() => {}) // the map still shows without pins
    return () => {
      cancelled = true
    }
  }, [])

  // The map itself, loaded only once the hero is on screen.
  const mapRef = useRef(null)
  const apiRef = useRef(null)
  useEffect(() => {
    const el = divRef.current
    if (!el) return
    let cancelled = false
    const onAuthFailure = () => setReady(false)
    window.addEventListener(AUTH_FAILURE_EVENT, onAuthFailure)
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((e) => e.isIntersecting)) return
      observer.disconnect()
      loadGoogleMaps()
        .then((api) => {
          if (cancelled || mapsAuthFailed()) return
          const map = createPathiqMap(api, el, {
            center: CENTER,
            zoom: ZOOM,
            // Scrolling the page shouldn't zoom the map; two fingers / ctrl+scroll do.
            gestureHandling: 'cooperative',
            zoomControl: false,
          })
          apiRef.current = api
          mapRef.current = map
          api.event.addListenerOnce(map, 'tilesloaded', () => !cancelled && setReady(true))
        })
        .catch(() => {}) // keep the drawn map
    })
    observer.observe(el)
    return () => {
      cancelled = true
      observer.disconnect()
      window.removeEventListener(AUTH_FAILURE_EVENT, onAuthFailure)
    }
  }, [])

  // Gems and reports as the app draws them. A tap opens the app's map.
  useEffect(() => {
    const map = mapRef.current
    const api = apiRef.current
    if (!ready || !map || !api || !data) return
    const roots = []
    const markers = []
    const add = (point, label, pin, zIndex) => {
      const el = document.createElement('button')
      el.type = 'button'
      el.className = 'marker-host'
      el.setAttribute('aria-label', label)
      el.title = label
      el.addEventListener('click', () => navigate('/app/map'))
      const root = createRoot(el)
      root.render(pin)
      roots.push(root)
      markers.push(new api.HtmlMarker({ map, position: { lat: point.lat, lng: point.lng }, content: el, zIndex }))
    }
    data.gems.forEach((g) => add(g, g.name, <GemPin category={g.category} />, 10))
    data.reports.forEach((r) => add(r, `Road report, severity ${r.severity}`, <ReportPin type={r.type} severity={r.severity} />, 11))
    return () => {
      markers.forEach((m) => m.setMap(null))
      setTimeout(() => roots.forEach((r) => r.unmount()))
    }
  }, [ready, data, navigate])

  const gemCount = data?.gems.length ?? 0
  const reportCount = data?.reports.length ?? 0
  const sampleGem = data?.gems[0]
  const sampleReport = data?.reports[0]

  return (
    <div className="hero-map">
      <DrawnMap hidden={ready} />
      <div ref={divRef} className={'hero-map-live' + (ready ? ' ready' : '')} />

      <Link to="/app/map" className="hero-map-cta">
        Open the live map &rarr;
      </Link>

      {data && (
        <Link to="/app/map" className="hero-route-card hero-live-card">
          <div className="hero-route-card-label">
            <span className="dot dot-green" /> Live from Nairobi
          </div>
          <div className="hero-live-row">
            {sampleGem && <GemBadge category={sampleGem.category} size={22} />}
            <span>
              <b>{gemCount}</b> Hidden Gem{gemCount === 1 ? '' : 's'}
            </span>
          </div>
          <div className="hero-live-row">
            {sampleReport && <ReportBadge type={sampleReport.type} severity={sampleReport.severity} size={22} />}
            <span>
              <b>{reportCount}</b> road report{reportCount === 1 ? '' : 's'}
            </span>
          </div>
        </Link>
      )}
    </div>
  )
}

// The illustrated map shown while the real one loads, or if it can't.
function DrawnMap({ hidden }) {
  return (
    <svg viewBox="0 0 700 620" className={'map-svg' + (hidden ? ' faded' : '')} aria-hidden="true">
      <line x1="60" y1="90" x2="450" y2="330" stroke="#1c3a2c" strokeWidth="2" />
      <line x1="230" y1="20" x2="450" y2="330" stroke="#1c3a2c" strokeWidth="2" />
      <line x1="450" y1="330" x2="640" y2="40" stroke="#1c3a2c" strokeWidth="2" />
      <line x1="450" y1="330" x2="660" y2="230" stroke="#1c3a2c" strokeWidth="2" />
      <line x1="450" y1="330" x2="560" y2="470" stroke="#1c3a2c" strokeWidth="2" />
      <line x1="450" y1="330" x2="330" y2="560" stroke="#1c3a2c" strokeWidth="2" />
      <path d="M60,560 Q150,480 260,420 T450,330" fill="none" stroke="#33d17a" strokeWidth="4" />
      <path d="M260,420 L300,380 L340,350" fill="none" stroke="#f5a623" strokeWidth="4" />
      {[
        [60, 90, 'Westlands'],
        [230, 20, 'Kasarani'],
        [640, 40, 'Thika Rd'],
        [450, 330, 'CBD'],
        [560, 470, 'Industrial'],
        [330, 560, 'Karen'],
        [60, 560, 'Langata'],
      ].map(([x, y, label]) => (
        <g key={label}>
          <circle cx={x} cy={y} r="7" fill="#0d1f16" stroke="#33d17a" strokeWidth="2" />
          <text x={x + 12} y={y + 4} className="map-label">{label}</text>
        </g>
      ))}
    </svg>
  )
}
