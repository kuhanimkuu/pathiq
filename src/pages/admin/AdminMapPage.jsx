import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { useNavigate } from 'react-router-dom'
import { Check, X, ExternalLink, Pencil } from 'lucide-react'
import { loadGoogleMaps, createPathiqMap, AUTH_FAILURE_EVENT, mapsAuthFailed } from '../../lib/googleMaps'
import { fetchMapPoints, fetchRoadReport, reviewGem, reviewRoadReport } from '../../lib/admin'
import { gemStyle } from '../../lib/placeStyles'
import { reportTypeLabel } from '../../lib/roadReports'
import { GemPin, ReportPin } from '../../components/PlaceIcons'
import { ReportEditor } from './ReportsManager'
import { ReasonDialog, StatusPill } from './AdminUi'

// Which layers to show. Pending items always stand out (amber ring), since
// the map doubles as a visual review queue.
const LAYERS = [
  { key: 'gemsLive', label: 'Live gems' },
  { key: 'pending', label: 'Pending review' },
  { key: 'gemsHidden', label: 'Hidden gems' },
  { key: 'reportsLive', label: 'Live reports' },
  { key: 'reportsOld', label: 'Expired / hidden reports' },
  { key: 'trips', label: 'Trip destinations (30 days)' },
]

const gemLayer = (g) => (g.status === 'pending' ? 'pending' : g.status === 'verified' ? 'gemsLive' : 'gemsHidden')
const reportLayer = (r) => (r.status === 'pending' ? 'pending' : r.live ? 'reportsLive' : 'reportsOld')
const reportStatus = (r) => (r.status === 'verified' && !r.live ? 'expired' : r.status)

function AdminMapPage({ onChanged }) {
  const navigate = useNavigate()
  const elRef = useRef(null)
  const mapRef = useRef(null)
  const apiRef = useRef(null)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState('')
  const [points, setPoints] = useState({ gems: [], reports: [], trips: [] })
  const [bounds, setBounds] = useState(null)
  const [zoomHint, setZoomHint] = useState(false)
  const [layers, setLayers] = useState(() => new Set(['gemsLive', 'pending', 'reportsLive', 'trips']))
  const [selected, setSelected] = useState(null) // { kind: 'gem' | 'report', item }
  const [editing, setEditing] = useState(null)
  const [rejecting, setRejecting] = useState(null)
  const [busy, setBusy] = useState(false)

  // Map, once.
  useEffect(() => {
    let cancelled = false
    const onAuthFailure = () => setError('Google Maps refused this site’s key.')
    window.addEventListener(AUTH_FAILURE_EVENT, onAuthFailure)
    if (mapsAuthFailed()) onAuthFailure()
    let idleTimer
    loadGoogleMaps()
      .then((api) => {
        if (cancelled || !elRef.current) return
        apiRef.current = api
        const map = createPathiqMap(api, elRef.current, { center: { lat: -1.2833, lng: 36.8167 }, zoom: 12 })
        mapRef.current = map
        map.addListener('idle', () => {
          clearTimeout(idleTimer)
          idleTimer = setTimeout(() => {
            const b = map.getBounds()
            if (!b) return
            const ne = b.getNorthEast()
            const sw = b.getSouthWest()
            setBounds({ south: sw.lat(), west: sw.lng(), north: ne.lat(), east: ne.lng() })
          }, 300)
        })
        map.addListener('click', () => setSelected(null))
        setReady(true)
      })
      .catch((err) => !cancelled && setError(err.message))
    return () => {
      cancelled = true
      clearTimeout(idleTimer)
      window.removeEventListener(AUTH_FAILURE_EVENT, onAuthFailure)
    }
  }, [])

  // Data for the visible area.
  const [reloadKey, setReloadKey] = useState(0)
  useEffect(() => {
    if (!bounds) return
    const tooBig = bounds.north - bounds.south > 20 || bounds.east - bounds.west > 20
    let cancelled = false
    if (tooBig) {
      Promise.resolve().then(() => !cancelled && setZoomHint(true))
      return () => {
        cancelled = true
      }
    }
    fetchMapPoints(bounds)
      .then((p) => {
        if (cancelled) return
        setPoints(p)
        setZoomHint(false)
        setError('')
      })
      .catch((err) => !cancelled && setError(err.message))
    return () => {
      cancelled = true
    }
  }, [bounds, reloadKey])

  const counts = useMemo(() => {
    const c = Object.fromEntries(LAYERS.map((l) => [l.key, 0]))
    for (const g of points.gems) c[gemLayer(g)]++
    for (const r of points.reports) c[reportLayer(r)]++
    c.trips = points.trips.reduce((s, t) => s + t.count, 0)
    return c
  }, [points])

  // Markers and trip cells.
  useEffect(() => {
    const api = apiRef.current
    const map = mapRef.current
    if (!ready || !api || !map) return
    const markers = []
    const roots = []
    const circles = []
    const host = (label, pin, item, kind, pending) => {
      const el = document.createElement('button')
      el.type = 'button'
      el.className = 'marker-host' + (pending ? ` admin-pin-pending is-${kind}` : '')
      el.setAttribute('aria-label', label)
      const root = createRoot(el)
      root.render(pin)
      roots.push(root)
      el.addEventListener('click', (e) => {
        e.stopPropagation()
        setSelected({ kind, item })
      })
      return el
    }
    if (layers.has('trips')) {
      const max = Math.max(1, ...points.trips.map((t) => t.count))
      for (const t of points.trips) {
        circles.push(
          new api.Circle({
            map,
            center: { lat: Number(t.lat), lng: Number(t.lng) },
            radius: 150 + 350 * Math.sqrt(t.count / max),
            fillColor: '#F59E0B',
            fillOpacity: 0.12 + 0.3 * (t.count / max),
            strokeWeight: 0,
            clickable: false,
          }),
        )
      }
    }
    for (const r of points.reports) {
      const layer = reportLayer(r)
      if (!layers.has(layer)) continue
      const el = host(reportTypeLabel(r.type), <ReportPin type={r.type} severity={r.severity} />, r, 'report', r.status === 'pending')
      if (layer === 'reportsOld') el.classList.add('admin-pin-faded')
      markers.push(new api.HtmlMarker({ map, position: { lat: r.lat, lng: r.lng }, content: el, zIndex: r.status === 'pending' ? 30 : 10 }))
    }
    for (const g of points.gems) {
      const layer = gemLayer(g)
      if (!layers.has(layer)) continue
      const el = host(g.name, <GemPin category={g.category} />, g, 'gem', g.status === 'pending')
      if (layer === 'gemsHidden') el.classList.add('admin-pin-faded')
      markers.push(new api.HtmlMarker({ map, position: { lat: g.lat, lng: g.lng }, content: el, zIndex: g.status === 'pending' ? 31 : 11 }))
    }
    return () => {
      markers.forEach((m) => m.setMap(null))
      circles.forEach((c) => c.setMap(null))
      setTimeout(() => roots.forEach((r) => r.unmount()))
    }
  }, [ready, points, layers])

  function toggle(key) {
    setLayers((cur) => {
      const next = new Set(cur)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const afterChange = useCallback(() => {
    setSelected(null)
    setReloadKey((k) => k + 1)
    onChanged()
  }, [onChanged])

  async function review(approve, note = null) {
    const { kind, item } = selected
    setBusy(true)
    setError('')
    try {
      if (kind === 'gem') await reviewGem(item.id, approve, note)
      else await reviewRoadReport(item.id, approve, note)
      afterChange()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function openReport(item) {
    try {
      setEditing(await fetchRoadReport(item.id, item))
    } catch (err) {
      setError(err.message)
    }
  }

  const sel = selected?.item
  return (
    <div className="admin-map-page">
      <div className="admin-title-row">
        <h1 className="page-title">Map</h1>
        <span className="admin-hint">Everything PathIQ knows about, in the area you&apos;re looking at.</span>
      </div>
      <div className="admin-layer-chips" role="group" aria-label="Layers">
        {LAYERS.map((l) => (
          <button
            key={l.key}
            type="button"
            className={`admin-layer-chip layer-${l.key}` + (layers.has(l.key) ? ' on' : '')}
            aria-pressed={layers.has(l.key)}
            onClick={() => toggle(l.key)}
          >
            <span className="admin-layer-dot" />
            {l.label}
            <span className="admin-layer-count">{counts[l.key]}</span>
          </button>
        ))}
      </div>
      {error && <p className="auth-error">{error}</p>}

      <div className="admin-bigmap">
        <div ref={elRef} className="admin-map-canvas" />
        {zoomHint && <div className="admin-bigmap-hint">Zoom in to see points</div>}

        {sel && (
          <div className="admin-map-card">
            <button type="button" className="admin-icon-btn admin-map-card-close" onClick={() => setSelected(null)} aria-label="Close">
              <X size={16} />
            </button>
            <div className="admin-map-card-title">
              {selected.kind === 'gem' ? sel.name : `${reportTypeLabel(sel.type)} · severity ${sel.severity}`}
            </div>
            <div className="admin-map-card-sub">
              <StatusPill status={selected.kind === 'gem' ? sel.status : reportStatus(sel)} />
              {selected.kind === 'gem' && <span>{gemStyle(sel.category).label}</span>}
            </div>
            <div className="admin-map-card-actions">
              {sel.status === 'pending' && (
                <>
                  <button className="admin-btn primary small" disabled={busy} onClick={() => review(true)}>
                    <Check size={14} /> Approve
                  </button>
                  <button className="admin-btn danger small" disabled={busy} onClick={() => setRejecting(true)}>
                    <X size={14} /> Reject
                  </button>
                </>
              )}
              {selected.kind === 'gem' ? (
                <button className="admin-btn small" onClick={() => navigate(`/app/admin/gems/${sel.id}`)}>
                  <ExternalLink size={14} /> Details
                </button>
              ) : (
                <button className="admin-btn small" onClick={() => openReport(sel)}>
                  <Pencil size={14} /> Edit
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="admin-map-legend">
        <span>
          <span className="admin-legend-ring" /> Waiting for review
        </span>
        <span>
          <span className="admin-legend-faded" /> Hidden or expired
        </span>
        <span>
          <span className="admin-legend-trip" /> Where trips ended (bigger = more)
        </span>
      </div>

      {rejecting && (
        <ReasonDialog
          title="Reject this?"
          confirmLabel="Reject"
          placeholder="e.g. Duplicate, wrong location…"
          onClose={() => setRejecting(false)}
          onConfirm={(note) => {
            setRejecting(false)
            review(false, note)
          }}
        />
      )}
      {editing && (
        <ReportEditor
          report={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            afterChange()
          }}
        />
      )}
    </div>
  )
}

export default AdminMapPage
