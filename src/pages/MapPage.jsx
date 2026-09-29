import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { createRoot } from 'react-dom/client'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { X, Bookmark, Star, Navigation2, Play, LocateOff, Gem, TriangleAlert, TrafficCone, MapPinPlus, List, Eye, LocateFixed, MapPin, Plus, Share2, Pin } from 'lucide-react'
import { useAuth } from '../context/useAuth'
import { fetchNearbyGems, fetchSavedGemIds, fetchSavedGems, saveGem, unsaveGem, confirmGem, getCurrentPosition, locationErrorReason } from '../lib/gems'
import { locationHelp } from '../lib/locationHelp'
import { fetchNearbyRoadReports, reportTypeLabel, severityBand } from '../lib/roadReports'
import { planRoutes, fetchRouteCorridor, formatDuration, routeLabel, MAX_STOPS } from '../lib/routePlanning'
import { loadGoogleMaps, createPathiqMap, AUTH_FAILURE_EVENT, mapsAuthFailed } from '../lib/googleMaps'
import { buildNavModel, locate, progress, distanceM, spokenDistance, formatDistance, slicePath } from '../lib/navigation'
import { GemPin, ReportPin, GemBadge, ReportBadge, GemGlyph } from '../components/PlaceIcons'
import { gemStyle } from '../lib/placeStyles'
import { saveActiveTrip, clearActiveTrip, loadActiveTrip } from '../lib/activeTrip'
import { startTrip, endTrip, recordReroute, recordGemEvent, fetchRecentDestinations } from '../lib/trips'
import { loadAlertPrefs, detourMinutes, corridorForDetour } from '../lib/alertPrefs'
import { holdWakeLock, notifyIfHidden } from '../lib/driveAssist'
import NavigationHud from '../components/NavigationHud'
import DestinationSearch from '../components/DestinationSearch'
import RouteEditor from '../components/RouteEditor'
import RoutePreviewHud from '../components/RoutePreviewHud'
import PlaceSheet from '../components/PlaceSheet'
import { PinnedPin } from '../components/PinnedIcon'
import { fetchPinnedPlaces, pinPlace, updatePinnedPlace, unpinPlace } from '../lib/pinnedPlaces'
import { shareLocation, parseSharedLocation } from '../lib/share'
import DirectionsList from '../components/DirectionsList'
import ManeuverIcon from '../components/ManeuverIcon'

const RADIUS_M = 5000
const NAV_ZOOM = 17
const OFF_ROUTE_M = 50 // further than this from the line counts as off-route
const OFF_ROUTE_FIXES = 3 // …for this many GPS fixes in a row, then reroute
const REROUTE_COOLDOWN_MS = 15_000
const ARRIVE_M = 40
const TRIP_SAVE_INTERVAL_MS = 10_000
const GEM_AHEAD_M = 600 // "approaching" alert when a gem is this close ahead on the route
const GEM_PASSED_MIN_M = 20 // "just passed" alert once it's this far behind…
const GEM_PASSED_MAX_M = 400 // …and not later than this
const GEM_ALERT_MS = 10_000
// Live navigation needs the driver at the start of the route. A route starting
// somewhere else (or planned with location off) can only be previewed.
const LIVE_START_M = 150

// "Your location" as a route point: resolved to the latest GPS fix when planning.
const ME = { me: true, name: 'Your location' }
const PICK_PLACEHOLDER = { from: 'Search for a starting point…', to: 'Search for a destination…', stop: 'Search for a stop…' }
const PICK_ON_MAP_TEXT = { from: 'the starting point', to: 'the destination', stop: 'a stop' }

const categories = [
  { value: 'attractions', label: 'Attractions' },
  { value: 'hotels', label: 'Hotels' },
  { value: 'food', label: 'Food' },
  { value: 'scenic', label: 'Scenic' },
  { value: 'fuel', label: 'Fuel' },
  { value: 'facilities', label: 'Facilities' },
]

// Route line colours: CSS variables can't reach into the map canvas, so these
// mirror --primary and --muted-foreground.
const ROUTE_COLOR = '#00C9A7'
const ALT_ROUTE_COLOR = '#7A8C88'

const MUTE_KEY = 'pathiq-nav-muted'

// Live traffic on the selected route, as in Google Maps: the route colour
// where it's clear, amber where it's slow, red where it's jammed.
const TRAFFIC_COLOR = { SLOW: '#F59E0B', TRAFFIC_JAM: '#EF4444' }

// Road reports on the route: a dotted stretch this far either side of the
// report, in its severity colour (mirrors --red / --amber / --blue). Dotted so
// it never reads as traffic.
const REPORT_STRETCH_M = 120
const SEVERITY_COLOR = { high: '#EF4444', medium: '#F59E0B', low: '#3B82F6' }

// Turn icons along the route appear from this zoom level (street level);
// further out they'd just be clutter.
const MANEUVER_MIN_ZOOM = 15

// How much of a route is slow or jammed, in metres, from Google's traffic
// intervals (polyline point indexes) and the route's own geometry.
function trafficMetres(option) {
  if (!option.traffic?.length) return { slowM: 0, jamM: 0 }
  const { cum } = buildNavModel(option)
  const out = { slowM: 0, jamM: 0 }
  for (const t of option.traffic) {
    const m = (cum[Math.min(t.to, cum.length - 1)] ?? 0) - (cum[Math.min(t.from, cum.length - 1)] ?? 0)
    if (t.speed === 'TRAFFIC_JAM') out.jamM += m
    else out.slowM += m
  }
  return out
}

function trafficText({ slowM, jamM }) {
  if (jamM >= 100) return { text: `Heavy traffic ${(jamM / 1000).toFixed(1)} km`, level: 'jam' }
  if (slowM >= 100) return { text: `Slow ${(slowM / 1000).toFixed(1)} km`, level: 'slow' }
  return { text: 'Traffic clear', level: 'clear' }
}

// `?to=lat,lng&name=…&route=…&stops=[…]&nav=1` plans a route on arrival (and
// starts navigating with nav=1) — used by History and Home's "Resume".
function parseUrlPlan(params) {
  const [lat, lng] = (params.get('to') ?? '').split(',').map(Number)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  return {
    to: { lat, lng },
    name: params.get('name') || 'Dropped pin',
    stops: parseUrlStops(params.get('stops')),
    routeId: params.get('route'),
    nav: params.get('nav') === '1',
  }
}

function parseUrlStops(value) {
  try {
    const stops = JSON.parse(value ?? '[]')
    if (!Array.isArray(stops)) return []
    return stops
      .filter((s) => Number.isFinite(s?.lat) && Number.isFinite(s?.lng))
      .slice(0, MAX_STOPS)
      .map((s, i) => ({ lat: s.lat, lng: s.lng, name: typeof s.name === 'string' && s.name ? s.name : `Stop ${i + 1}` }))
  } catch {
    return []
  }
}

// What to call a spot when it becomes part of a route.
function placeName(place) {
  if (place.kind === 'me') return ME.name
  return place.name || 'Dropped pin'
}

function readMuted() {
  try {
    return localStorage.getItem(MUTE_KEY) === '1'
  } catch {
    return false
  }
}

// A real Google map with PathIQ's own data on top: gems and road reports from
// Supabase as markers, destination search (Places API), real driving routes
// from the `routes` edge function (Google Routes API, scored against verified
// road reports), and turn-by-turn navigation along the chosen route.
function MapPage() {
  const { user, session, profile } = useAuth()
  const userId = user?.id
  const isScout = profile?.role === 'scout' || profile?.role === 'admin'
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const urlPlan = useRef(parseUrlPlan(searchParams))
  // A shared location link: `?at=lat,lng&name=…` (see lib/share.js).
  const sharedAt = useRef(parseSharedLocation(searchParams))

  const [position, setPosition] = useState(null)
  const [gems, setGems] = useState([])
  const [incidents, setIncidents] = useState([])
  const [savedIds, setSavedIds] = useState(new Set())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [activeCategories, setActiveCategories] = useState(new Set())
  // { type, id } only — looked up live below, so the sheet reflects the
  // latest rating/save state instead of a snapshot frozen at click-time.
  const [selected, setSelected] = useState(null)
  const [busy, setBusy] = useState(false)

  // Tapping the map drops a pin (with Route here / Scout actions) rather than
  // planning straight away: a stray tap shouldn't spend a Google Routes call.
  // The spot the place sheet is showing: { lat, lng, name?, kind: 'dropped' |
  // 'shared' | 'me' | 'pinned', pinId?, label?, pinning? }
  const [dropped, setDropped] = useState(null)
  const [pinned, setPinned] = useState([]) // the driver's pinned places
  const [notice, setNotice] = useState('') // brief confirmation, e.g. "Link copied"
  // One-tap destinations in the search box (see DestinationSearch).
  const [quickPicks, setQuickPicks] = useState({ recent: [], saved: [] })
  const routePanelRef = useRef(null)
  // PathIQ's layers, toggled from the map. Traffic is Google's live layer.
  const [layers, setLayers] = useState({ gems: true, reports: true, traffic: false })

  // The route being set up: from (ME, a place, or null until chosen), stops
  // on the way, and to (null until chosen). Places are { lat, lng, name }.
  const [draft, setDraft] = useState(null)
  // Which route point is being chosen: { slot: 'from' | 'to' | 'stop', index,
  // onMap } — onMap means the next tap on the map chooses it.
  const [picking, setPicking] = useState(null)
  const editorRef = useRef(null)
  const planSeqRef = useRef(0) // only the latest planning request may land
  // Stepping through the directions by hand (no GPS): { index }
  const [preview, setPreview] = useState(null)
  // Planned routes for `draft`: { origin, fromMe, stops, destination,
  // destinationName, options, selectedId }
  const [plan, setPlan] = useState(null)
  const [corridor, setCorridor] = useState({ routeId: null, gems: [] })
  // Read once per visit: they're changed on the Profile page.
  const [alertPrefs] = useState(loadAlertPrefs)
  const [routing, setRouting] = useState(false)
  const [routeError, setRouteError] = useState('')

  // { status: 'active' | 'rerouting' | 'arrived', model, step, routeId, destination, destinationName,
  //   tripId, reroutes, startedAt }
  const [nav, setNav] = useState(null)
  const [gemAlert, setGemAlert] = useState(null) // { type: 'approaching' | 'passed', gem, aheadM, detourMin, key }
  const alertedRef = useRef(new Set())
  const [navError, setNavError] = useState('')
  const [muted, setMuted] = useState(readMuted)
  const [showRouteSteps, setShowRouteSteps] = useState(false)
  const trackRef = useRef({ s: 0, seg: 0, offCount: 0, lastRerouteAt: 0, lastSavedStep: -1 })
  const recenteredRef = useRef(false)
  const spokenRef = useRef(new Set())

  const mapDivRef = useRef(null)
  const mapRef = useRef(null)
  const mapsApiRef = useRef(null)
  const [mapReady, setMapReady] = useState(false)
  const [mapError, setMapError] = useState('')

  const selectedGem = selected?.type === 'gem' ? gems.find((g) => g.id === selected.id) : null
  const selectedIncident = selected?.type === 'incident' ? incidents.find((i) => i.id === selected.id) : null
  const selectedRoute = plan?.options.find((o) => o.id === plan.selectedId) ?? null
  const navActive = nav != null && nav.status !== 'arrived'
  // Only a real GPS fix, never the central-Nairobi stand-in used when location is off.
  const livePos = position && !position.isFallback ? position : null
  // Live navigation needs the driver at the route's start; otherwise, preview.
  const canNavigateLive =
    plan != null && livePos != null && (plan.fromMe || distanceM(livePos, plan.origin) <= LIVE_START_M)

  const fetchAround = useCallback(
    async (pos) => {
      const [gemRows, incidentRows, saved] = await Promise.all([
        fetchNearbyGems(pos.lat, pos.lng, { radiusM: RADIUS_M }),
        fetchNearbyRoadReports(pos.lat, pos.lng, RADIUS_M),
        fetchSavedGemIds(userId),
      ])
      return { gemRows, incidentRows, saved }
    },
    [userId],
  )

  const load = useCallback(async () => {
    try {
      const pos = position ?? (await getCurrentPosition())
      const { gemRows, incidentRows, saved } = await fetchAround(pos)
      setGems(gemRows)
      setIncidents(incidentRows)
      setSavedIds(saved)
      setError('')
    } catch (err) {
      setError(err.message)
    }
  }, [fetchAround, position])

  useEffect(() => {
    if (!session) return
    let cancelled = false
    async function run() {
      try {
        const pos = await getCurrentPosition()
        const { gemRows, incidentRows, saved } = await fetchAround(pos)
        if (cancelled) return
        // The GPS watch may already have a live fix; don't replace it with the stand-in.
        setPosition((p) => (p && !p.isFallback ? p : pos))
        setGems(gemRows)
        setIncidents(incidentRows)
        setSavedIds(saved)
        setError('')
      } catch (err) {
        if (!cancelled) setError(err.message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    run()
    return () => {
      cancelled = true
    }
  }, [session, fetchAround])

  // Recent destinations and saved gems for the search box. Refreshed when a
  // trip starts, so the place you just drove to is in Recent next time.
  const loadQuickPicks = useCallback(async () => {
    try {
      const [recent, saved] = await Promise.all([fetchRecentDestinations(5), fetchSavedGems()])
      setQuickPicks({ recent, saved })
    } catch {
      // a convenience only; search still works
    }
  }, [])
  const loadPinned = useCallback(async () => {
    try {
      setPinned(await fetchPinnedPlaces())
    } catch {
      // pins are a convenience; the map works without them
    }
  }, [])
  useEffect(() => {
    if (!session) return
    let cancelled = false
    fetchPinnedPlaces()
      .then((rows) => !cancelled && setPinned(rows))
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [session])

  useEffect(() => {
    if (!session) return
    let cancelled = false
    Promise.all([fetchRecentDestinations(5), fetchSavedGems()])
      .then(([recent, saved]) => !cancelled && setQuickPicks({ recent, saved }))
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [session])

  // Your live position for planning: the latest GPS fix, or a fresh attempt
  // (which is also when the browser asks for permission). Null if there's no
  // fix; the reason is kept on `position` for the location notice.
  async function currentLivePosition() {
    return (await locateNow()).live
  }

  // { live: position or null, reason } — reason says why there's no fix.
  async function locateNow() {
    if (livePos) return { live: livePos, reason: null }
    const pos = await getCurrentPosition({ timeoutMs: 8000 })
    if (pos.isFallback) {
      setPosition((p) => (!p || p.isFallback ? { ...(p ?? pos), reason: pos.reason } : p))
      return { live: null, reason: pos.reason }
    }
    setPosition(pos)
    return { live: pos, reason: null }
  }

  // Sets the route being planned and, once it has a start and a destination,
  // plans it. Resolves to the chosen route option, or null.
  async function planDraft(next, preferredRouteId = null) {
    const seq = ++planSeqRef.current
    setDraft(next)
    setRouteError('')
    setSelected(null)
    setDropped(null)
    setShowRouteSteps(false)
    setPreview(null)
    if (!next.from || !next.to) {
      setPlan(null)
      setRouting(false)
      setPicking({ slot: next.from ? 'to' : 'from' })
      return null
    }
    setRouting(true)
    try {
      const points = [next.from, ...next.stops, next.to]
      if (points.some((p) => p.me)) {
        const here = await currentLivePosition()
        if (!here) {
          if (seq !== planSeqRef.current) return null
          const cleared = {
            from: next.from.me ? null : next.from,
            stops: next.stops,
            to: next.to.me ? null : next.to,
          }
          setDraft(cleared)
          setPlan(null)
          setPicking({ slot: cleared.from ? 'to' : 'from' })
          setRouteError(`${locationHelp(latest.current.position?.reason).title}. Choose a starting place instead.`)
          return null
        }
        points.forEach((p, i) => p.me && (points[i] = { ...here, name: ME.name, me: true }))
      }
      const [origin, ...rest] = points
      const destination = rest.pop()
      const options = await planRoutes(origin, destination, rest)
      if (seq !== planSeqRef.current) return null
      // A routes function from before stops existed ignores them; don't show
      // a route that silently skips the driver's stops.
      if (rest.length > 0 && buildNavModel(options[0]).legEnds.length !== rest.length) {
        throw new Error("Stops couldn't be added to this route. Please try again later.")
      }
      const option = options.find((o) => o.id === preferredRouteId) ?? options[0]
      setPlan({
        origin: { lat: origin.lat, lng: origin.lng },
        fromMe: !!origin.me,
        stops: rest.map((s) => ({ lat: s.lat, lng: s.lng, name: s.name })),
        destination: { lat: destination.lat, lng: destination.lng },
        destinationName: destination.name,
        options,
        selectedId: option.id,
      })
      return option
    } catch (err) {
      if (seq !== planSeqRef.current) return null
      setRouteError(err.message)
      setPlan(null)
      return null
    } finally {
      if (seq === planSeqRef.current) setRouting(false)
    }
  }

  // Route to somewhere (search, "Route here", History), keeping the start and
  // stops already chosen. Starts from your location when it's on.
  function planTo(to, name = 'Dropped pin', preferredRouteId = null, stops = null) {
    const base = draft ?? { from: livePos ? ME : null, stops: [] }
    return planDraft({ ...base, stops: stops ?? base.stops, to: { lat: to.lat, lng: to.lng, name } }, preferredRouteId)
  }

  // Put a chosen place into one of the route editor's points.
  function fillSlot(target, place) {
    const d = draft ?? { from: livePos ? ME : null, stops: [], to: null }
    setPicking(null)
    if (target.slot === 'from') return planDraft({ ...d, from: place })
    if (target.slot === 'to') return planDraft({ ...d, to: place })
    const stops = [...d.stops]
    if (target.index == null) stops.push(place)
    else stops[target.index] = place
    return planDraft({ ...d, stops })
  }

  function removeStop(index) {
    planDraft({ ...draft, stops: draft.stops.filter((_, i) => i !== index) })
  }

  function swapEnds() {
    planDraft({ ...draft, from: draft.to, to: draft.from, stops: [...draft.stops].reverse() })
  }

  function clearDirections() {
    planSeqRef.current++
    setDraft(null)
    setPicking(null)
    setPreview(null)
    setPlan(null)
    setRouting(false)
    setShowRouteSteps(false)
    setCorridor({ routeId: null, gems: [] })
    setRouteError('')
  }

  function speak(text) {
    if (muted || !('speechSynthesis' in window)) return
    window.speechSynthesis.cancel()
    window.speechSynthesis.speak(new SpeechSynthesisUtterance(text))
  }

  function toggleMute() {
    setMuted((m) => {
      try {
        localStorage.setItem(MUTE_KEY, m ? '0' : '1')
      } catch {
        // ignore — mute still applies for this session
      }
      if (!m && 'speechSynthesis' in window) window.speechSynthesis.cancel()
      return !m
    })
  }

  function tripRecord(n, step) {
    return {
      destination: n.destination,
      destinationName: n.destinationName,
      stops: n.stops.slice(n.stopsReached),
      routeId: n.routeId,
      routeLabel: n.routeLabel,
      roadQuality: n.roadQuality,
      remainingM: step?.remainingM ?? n.model.total,
      remainingS: step?.remainingS ?? n.model.durationS,
      startedAt: n.startedAt,
      tripId: n.tripId,
      reroutes: n.reroutes,
    }
  }

  // `trip` is { destination, destinationName, stops } — stops in route order.
  function startNavigation(option, { destination, destinationName, stops = [] }) {
    const model = buildNavModel(option)
    const loc = livePos ? locate(model, livePos) : { s: 0, seg: 0 }
    trackRef.current = { s: loc.s, seg: loc.seg, offCount: 0, lastRerouteAt: 0, lastSavedStep: -1 }
    spokenRef.current = new Set()
    const step = livePos ? progress(model, loc.s) : null
    // Resuming from Home continues the same trip rather than starting another.
    const saved = loadActiveTrip()
    const resumed = saved?.tripId && distanceM(saved.destination, destination) < 50 ? saved : null
    const next = {
      status: 'active',
      model,
      step,
      routeId: option.id,
      routeLabel: routeLabel(option),
      roadQuality: option.scores.roadQuality,
      destination,
      destinationName,
      stops,
      stopsReached: 0,
      startedAt: resumed?.startedAt ?? Date.now(),
      tripId: resumed?.tripId ?? null,
      reroutes: resumed?.reroutes ?? 0,
    }
    alertedRef.current = new Set()
    setGemAlert(null)
    setNav(next)
    if (!resumed && userId) {
      startTrip(userId, { origin: livePos ?? position, destination, destinationName, option })
        .then((tripId) => {
          setNav((n) => n && { ...n, tripId })
          saveActiveTrip(tripRecord({ ...next, tripId }, step))
          loadQuickPicks()
        })
        .catch((err) => setNavError(`Trip not recorded: ${err.message}`))
    }
    setNavError('')
    setSelected(null)
    setDropped(null)
    setPicking(null)
    setPreview(null)
    setShowRouteSteps(false)
    saveActiveTrip(tripRecord(next, step))
    speak(`Starting route to ${destinationName}.`)
    const map = mapRef.current
    if (map && livePos) {
      map.setZoom(NAV_ZOOM)
      map.panTo(livePos)
    }
  }

  function endNavigation() {
    if (nav?.tripId && nav.status !== 'arrived') {
      endTrip(nav.tripId, { arrived: false, reroutes: nav.reroutes }).catch(() => {})
    }
    setNav(null)
    setNavError('')
    setGemAlert(null)
    clearActiveTrip()
    if ('speechSynthesis' in window) window.speechSynthesis.cancel()
  }

  // Speak the upcoming manoeuvre once when it becomes next, and again just
  // before it.
  function announce(step) {
    const spoken = spokenRef.current
    const key = String(step.stepIndex)
    if (!spoken.has(`${key}:far`)) {
      spoken.add(`${key}:far`)
      if (step.toNextM > 150) {
        speak(`In ${spokenDistance(step.toNextM)}, ${step.nextInstruction}.`)
      } else {
        spoken.add(`${key}:near`)
        speak(`${step.nextInstruction}.`)
      }
    } else if (step.toNextM < 80 && !spoken.has(`${key}:near`)) {
      spoken.add(`${key}:near`)
      speak(`${step.nextInstruction}.`)
    }
  }

  async function reroute(from, current) {
    trackRef.current.lastRerouteAt = Date.now()
    const reroutes = current.reroutes + 1
    setNav((n) => n && { ...n, status: 'rerouting', reroutes })
    if (current.tripId) recordReroute(current.tripId, reroutes).catch(() => {})
    speak('Rerouting.')
    // Stops already reached are done; the new route goes through the rest.
    const stops = current.stops.slice(current.stopsReached)
    try {
      const options = await planRoutes(from, current.destination, stops)
      const option = options[0]
      const model = buildNavModel(option)
      const loc = locate(model, from)
      trackRef.current = { ...trackRef.current, s: loc.s, seg: loc.seg, offCount: 0, lastSavedStep: -1 }
      spokenRef.current = new Set()
      setPlan((p) => p && { ...p, origin: from, fromMe: true, stops, options, selectedId: option.id })
      setDraft((d) => d && { ...d, from: ME, stops })
      setNav((n) => n && {
        ...n,
        status: 'active',
        stops,
        stopsReached: 0,
        model,
        step: progress(model, loc.s),
        routeId: option.id,
        routeLabel: routeLabel(option),
        roadQuality: option.scores.roadQuality,
      })
    } catch (err) {
      setNavError(`Couldn't reroute: ${err.message}`)
      setNav((n) => n && { ...n, status: 'active' })
    }
  }

  // Gem suggestions (features.md, "Suggestion system"): one "approaching" alert
  // when a gem within the driver's max detour is coming up on the route, and
  // one "just passed" alert with save-for-later. Once per gem per trip —
  // locally, and by trip_gem_events' unique key server-side.
  function checkGemAlerts(current, s) {
    if (!alertPrefs.enabled || corridor.routeId !== current.routeId) return
    for (const gem of corridor.gems) {
      if (!alertPrefs.categories.includes(gem.category)) continue
      const detourMin = detourMinutes(gem.distance_from_route_m)
      if (detourMin > alertPrefs.maxDetourMin) continue
      const ahead = gem.route_fraction * current.model.total - s
      let type = null
      if (ahead > 0 && ahead <= GEM_AHEAD_M) type = 'approaching'
      else if (-ahead >= GEM_PASSED_MIN_M && -ahead <= GEM_PASSED_MAX_M) type = 'passed'
      if (!type || alertedRef.current.has(`${gem.id}:${type}`)) continue
      alertedRef.current.add(`${gem.id}:${type}`)
      // Joined the route already past it (e.g. after a reroute): "just passed" would be noise.
      if (type === 'passed' && !alertedRef.current.has(`${gem.id}:approaching`)) continue
      setGemAlert({ type, gem, aheadM: ahead, detourMin, key: `${gem.id}:${type}` })
      if (current.tripId) recordGemEvent(current.tripId, gem.id, type).catch(() => {})
      const message =
        type === 'approaching'
          ? `Hidden gem ahead: ${gem.name}, in ${spokenDistance(ahead)}. About ${detourMin} minute detour.`
          : `You just passed ${gem.name}. You can save it for later.`
      speak(message)
      if (profile?.notifications_on !== false) {
        notifyIfHidden(type === 'approaching' ? 'Hidden gem ahead' : 'You just passed a gem', message)
      }
      return // one alert at a time
    }
  }

  function handleFix(pos) {
    // The first real fix after starting with location off: fetch what's
    // around the driver, and move there unless a route is on screen.
    if (position?.isFallback && !recenteredRef.current) {
      recenteredRef.current = true
      if (!draft) mapRef.current?.panTo(pos)
      fetchAround(pos)
        .then(({ gemRows, incidentRows }) => {
          setGems(gemRows)
          setIncidents(incidentRows)
        })
        .catch(() => {})
    }
    setPosition(pos)
    const current = nav
    if (!current || current.status !== 'active') return
    setNavError('')
    const t = trackRef.current
    const loc = locate(current.model, pos, t)
    const onRoute = loc.offRouteM <= OFF_ROUTE_M
    t.offCount = onRoute ? 0 : t.offCount + 1
    if (onRoute) {
      t.s = loc.s
      t.seg = loc.seg
    }
    mapRef.current?.panTo(pos)

    // Stops on the way, in order: reached when progress gets to the end of its leg.
    const legEnds = current.model.legEnds
    let stopsReached = current.stopsReached
    if (stopsReached < legEnds.length && t.s >= legEnds[stopsReached] - ARRIVE_M) {
      const stop = current.stops[stopsReached]
      stopsReached += 1
      const nextName = current.stops[stopsReached]?.name ?? current.destinationName
      speak(`You've reached ${stop?.name ?? `stop ${stopsReached}`}. Continuing to ${nextName}.`)
    }
    const allStopsDone = stopsReached >= legEnds.length

    // A round trip ends where it started, so only count the destination once every stop is done.
    if (allStopsDone && (distanceM(pos, current.destination) < ARRIVE_M || current.model.total - t.s < ARRIVE_M)) {
      setNav({ ...current, status: 'arrived' })
      setGemAlert(null)
      clearActiveTrip()
      if (current.tripId) endTrip(current.tripId, { arrived: true, reroutes: current.reroutes }).catch(() => {})
      speak(`You have arrived at ${current.destinationName}.`)
      return
    }
    if (t.offCount >= OFF_ROUTE_FIXES && Date.now() - t.lastRerouteAt > REROUTE_COOLDOWN_MS) {
      reroute(pos, current)
      return
    }
    const step = progress(current.model, t.s)
    const updated = { ...current, step, stopsReached }
    setNav(updated)
    announce(step)
    checkGemAlerts(current, t.s)
    // Keep Home's Active route card roughly current without writing on every fix.
    if (
      step.stepIndex !== t.lastSavedStep ||
      stopsReached !== current.stopsReached ||
      Date.now() - (t.lastSavedAt ?? 0) > TRIP_SAVE_INTERVAL_MS
    ) {
      t.lastSavedStep = step.stepIndex
      t.lastSavedAt = Date.now()
      saveActiveTrip(tripRecord(updated, step))
    }
  }

  // Callbacks registered once (map click, GPS watch, URL auto-start) call
  // through this ref so they always reach the current render's functions.
  const latest = useRef({})
  useEffect(() => {
    latest.current = { planTo, startNavigation, handleFix, fillSlot, nav, preview, picking, position }
  })

  // Create the map once we know where the driver is (or that location is off).
  const hasPosition = position != null
  useEffect(() => {
    if (!hasPosition || mapRef.current || !mapDivRef.current) return
    let cancelled = false
    const onAuthFailure = () => setMapError('Google Maps rejected the API key — check its restrictions in Cloud Console.')
    window.addEventListener(AUTH_FAILURE_EVENT, onAuthFailure)
    if (mapsAuthFailed()) onAuthFailure()

    loadGoogleMaps()
      .then((api) => {
        if (cancelled || !mapDivRef.current) return
        const map = createPathiqMap(api, mapDivRef.current, { center: latest.current.position, zoom: 14 })
        // Turn icons only at street level (CSS hides them otherwise).
        const div = mapDivRef.current
        const syncZoomClass = () => div.classList.toggle('show-maneuvers', map.getZoom() >= MANEUVER_MIN_ZOOM)
        map.addListener('zoom_changed', syncZoomClass)
        syncZoomClass()
        map.addListener('click', (e) => {
          const l = latest.current
          if (l.nav || l.preview) return // no re-planning mid-drive
          const at = { lat: e.latLng.lat(), lng: e.latLng.lng() }
          // Choosing a route point by tapping the map.
          if (l.picking?.onMap) {
            l.fillSlot(l.picking, { ...at, name: 'Pin on map' })
            return
          }
          setSelected(null)
          setDropped(at)
        })
        mapsApiRef.current = api
        mapRef.current = map
        setMapReady(true)
      })
      .catch((err) => !cancelled && setMapError(err.message))

    return () => {
      cancelled = true
      window.removeEventListener(AUTH_FAILURE_EVENT, onAuthFailure)
    }
  }, [hasPosition])

  // Arriving with ?to=… — plan it once the map is up, and start navigating
  // straight away with nav=1.
  // Opened from a shared location link: show that spot.
  useEffect(() => {
    if (!mapReady || !sharedAt.current || urlPlan.current) return
    const at = sharedAt.current
    sharedAt.current = null
    setDropped({ ...at, kind: 'shared' })
    mapRef.current?.setZoom(16)
    mapRef.current?.panTo(at)
  }, [mapReady])

  useEffect(() => {
    if (!mapReady || !urlPlan.current) return
    const { to, name, routeId, stops, nav: startNav } = urlPlan.current
    urlPlan.current = null
    latest.current.planTo(to, name, routeId, stops).then((option) => {
      if (option && startNav) latest.current.startNavigation(option, { destination: to, destinationName: name, stops })
    })
  }, [mapReady])

  // Live GPS the whole time the map is open, not just while navigating, so a
  // route starts from where the driver is now rather than where they were
  // when the page loaded, and turning location on later is picked up.
  useEffect(() => {
    // Insecure pages never get location; getCurrentPosition already reported why.
    if (!('geolocation' in navigator) || !window.isSecureContext) return
    const id = navigator.geolocation.watchPosition(
      (p) => latest.current.handleFix({ lat: p.coords.latitude, lng: p.coords.longitude, isFallback: false }),
      (err) => {
        const reason = locationErrorReason(err)
        // Keep the notice's reason current (e.g. permission denied after a slow first try).
        setPosition((p) => (p?.isFallback ? { ...p, reason } : p))
        const n = latest.current.nav
        if (n && n.status !== 'arrived') setNavError(`${locationHelp(reason).title}. Navigation needs your live location.`)
      },
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 15000 },
    )
    return () => navigator.geolocation.clearWatch(id)
  }, [])

  useEffect(() => {
    if (navActive && !('geolocation' in navigator)) {
      queueMicrotask(() => setNavError('This device has no GPS — navigation needs your live location.'))
    }
  }, [navActive])

  // Gems/reports along whichever route is selected, on its real geometry.
  useEffect(() => {
    if (!selectedRoute) return
    let cancelled = false
    const gemCorridorM = alertPrefs.enabled ? corridorForDetour(alertPrefs.maxDetourMin) : undefined
    fetchRouteCorridor(selectedRoute.path, { gemCorridorM })
      .then((c) => !cancelled && setCorridor({ routeId: selectedRoute.id, ...c }))
      .catch((err) => !cancelled && setRouteError(err.message))
    return () => {
      cancelled = true
    }
  }, [selectedRoute, alertPrefs])

  // Keep the screen on while navigating.
  useEffect(() => {
    if (!navActive) return
    return holdWakeLock()
  }, [navActive])

  // Gem alerts clear themselves — nothing to tap while driving.
  const gemAlertKey = gemAlert?.key
  useEffect(() => {
    if (!gemAlertKey) return
    const timer = setTimeout(() => setGemAlert((a) => (a?.key === gemAlertKey ? null : a)), GEM_ALERT_MS)
    return () => clearTimeout(timer)
  }, [gemAlertKey])

  function flash(text) {
    setNotice(text)
  }
  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(() => setNotice(''), 2500)
    return () => clearTimeout(timer)
  }, [notice])

  async function handleShare(place) {
    try {
      const result = await shareLocation(place)
      if (result === 'copied') flash('Link copied. Paste it into a chat or SMS.')
    } catch {
      flash("Couldn't share this place.")
    }
  }

  // Pin a spot, or save changes to a pinned place (name, Home / Work / Other).
  async function handleSavePin(place, { name, label }) {
    if (place.kind === 'pinned') {
      await updatePinnedPlace(place.pinId, { name, label })
      setDropped({ ...place, name, label, pinning: false })
      flash('Pinned place updated')
    } else {
      const pinId = await pinPlace({ name, label, lat: place.lat, lng: place.lng })
      setDropped({ lat: place.lat, lng: place.lng, name, label, kind: 'pinned', pinId })
      flash(`Pinned "${name}"`)
    }
    loadPinned()
  }

  async function handleUnpin(pinId) {
    try {
      await unpinPlace(pinId)
      setDropped(null)
      setPinned((rows) => rows.filter((p) => p.id !== pinId))
      flash('Place unpinned')
    } catch (err) {
      setError(err.message)
    }
  }

  // "Where am I?": centre on the driver and offer to share or pin the spot.
  async function showMyLocation() {
    const { live: here, reason } = await locateNow()
    if (!here) {
      flash(locationHelp(reason).title)
      return
    }
    setSelected(null)
    setDropped({ lat: here.lat, lng: here.lng, kind: 'me' })
    mapRef.current?.setZoom(16)
    mapRef.current?.panTo(here)
  }

  function handlePickGem(gem) {
    setDropped(null)
    setSelected({ type: 'gem', id: gem.id })
    mapRef.current?.panTo({ lat: gem.lat, lng: gem.lng })
  }

  const visibleGems = useMemo(
    () =>
      layers.gems ? gems.filter((g) => activeCategories.size === 0 || activeCategories.has(g.category)) : [],
    [gems, activeCategories, layers.gems],
  )
  const visibleIncidents = useMemo(() => (layers.reports ? incidents : []), [incidents, layers.reports])

  const routeGemIds = useMemo(() => new Set((plan ? corridor.gems : []).map((g) => g.id)), [plan, corridor])
  // Reports that still matter on the selected route, as judged by the routes
  // edge function (old ones fade out — see isStillRelevant in scoring.ts).
  const routeReportIds = useMemo(() => new Set((selectedRoute?.hazards ?? []).map((h) => h.id)), [selectedRoute])

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
  }, [mapReady, livePos])

  // Markers: gems, road reports, destination.
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

    for (const gem of visibleGems) {
      const onRoute = routeGemIds.has(gem.id)
      const isSelected = selected?.type === 'gem' && selected.id === gem.id
      const el = host(
        gem.name,
        <GemPin category={gem.category} onRoute={onRoute} saved={savedIds.has(gem.id)} selected={isSelected} />,
      )
      add({ lat: gem.lat, lng: gem.lng }, el, isSelected ? 40 : onRoute ? 20 : 10, () =>
        setSelected({ type: 'gem', id: gem.id }),
      )
    }

    for (const p of pinned) {
      const isSelected = dropped?.kind === 'pinned' && dropped.pinId === p.id
      const el = host(p.name, <PinnedPin label={p.label} selected={isSelected} />)
      add({ lat: p.lat, lng: p.lng }, el, isSelected ? 40 : 24, () => {
        setSelected(null)
        setDropped({ lat: p.lat, lng: p.lng, name: p.name, label: p.label, kind: 'pinned', pinId: p.id })
      })
    }

    for (const incident of visibleIncidents) {
      const onRoute = routeReportIds.has(incident.id)
      const isSelected = selected?.type === 'incident' && selected.id === incident.id
      const el = host(
        `${reportTypeLabel(incident.type)}, severity ${incident.severity}`,
        <ReportPin type={incident.type} severity={incident.severity} onRoute={onRoute} selected={isSelected} />,
      )
      add({ lat: incident.lat, lng: incident.lng }, el, isSelected ? 40 : onRoute ? 21 : 11, () =>
        setSelected({ type: 'incident', id: incident.id }),
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
  }, [mapReady, visibleGems, visibleIncidents, routeGemIds, routeReportIds, draft, dropped, selected, savedIds, pinned])

  // Google's live traffic, as an optional layer under ours.
  const trafficRef = useRef(null)
  useEffect(() => {
    const api = mapsApiRef.current
    if (!mapReady || !api) return
    trafficRef.current ??= new api.TrafficLayer()
    trafficRef.current.setMap(layers.traffic ? mapRef.current : null)
  }, [mapReady, layers.traffic])

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
  }, [mapReady, selectedRoute, layers.reports])

  // Route lines: every alternative, the selected one on top and in colour.
  // Tapping a grey alternative selects it. While navigating or previewing,
  // only the route being followed is shown.
  const followingRoute = navActive || preview != null
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
        base.addListener('click', () => setPlan((p) => (p ? { ...p, selectedId: option.id } : p)))
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
  }, [mapReady, plan, followingRoute])

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
  }, [mapReady, selectedRoute])

  const trafficByRoute = useMemo(
    () => new Map((plan?.options ?? []).map((o) => [o.id, trafficText(trafficMetres(o))])),
    [plan],
  )

  // Frame a new set of routes (not when merely switching between them, and
  // not mid-drive, where the camera follows the driver instead).
  const options = plan?.options
  const fitRoutes = useCallback(() => {
    const map = mapRef.current
    const api = mapsApiRef.current
    if (!map || !api || !options) return
    const bounds = new api.LatLngBounds()
    options.forEach((o) => o.path.forEach((p) => bounds.extend(p)))
    // Keep the routes clear of the route editor above and the route panel below.
    const top = (editorRef.current?.offsetHeight ?? 110) + 36
    const panelHeight = routePanelRef.current?.offsetHeight ?? 280
    map.fitBounds(bounds, { top, bottom: panelHeight + 24, left: 40, right: 72 })
  }, [options])
  useEffect(() => {
    if (!mapReady || latest.current.nav || latest.current.preview) return
    fitRoutes()
  }, [mapReady, fitRoutes])

  // Previewing: the map follows the step being shown.
  const previewStep = preview != null ? selectedRoute?.steps?.[preview.index] : null
  useEffect(() => {
    const map = mapRef.current
    if (!mapReady || !map || !previewStep) return
    map.setZoom(NAV_ZOOM)
    map.panTo(previewStep.start)
  }, [mapReady, previewStep])

  function closePreview() {
    setPreview(null)
    // After the panel re-renders, so its height is known.
    setTimeout(fitRoutes)
  }

  function toggleCategory(cat) {
    setActiveCategories((prev) => {
      const next = new Set(prev)
      next.has(cat) ? next.delete(cat) : next.add(cat)
      return next
    })
  }

  async function handleToggleSave(gemId) {
    setBusy(true)
    try {
      if (savedIds.has(gemId)) {
        await unsaveGem(userId, gemId)
        setSavedIds((prev) => {
          const next = new Set(prev)
          next.delete(gemId)
          return next
        })
      } else {
        await saveGem(userId, gemId)
        setSavedIds((prev) => new Set(prev).add(gemId))
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function handleRate(gemId, rating) {
    setBusy(true)
    try {
      await confirmGem(userId, gemId, rating)
      await load()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }



  // One-tap choices above search results while choosing a route point.
  const pickExtras = picking
    ? [
        ...(picking.slot === 'stop'
          ? []
          : [
              {
                key: 'me',
                icon: <LocateFixed size={15} />,
                title: 'Your location',
                sub: livePos ? 'Where you are now' : 'Location is off. Tap to try again.',
                onPick: () => fillSlot(picking, ME),
              },
            ]),
        {
          key: 'map',
          icon: <MapPin size={15} />,
          title: 'Choose on the map',
          sub: 'Tap a spot on the map',
          onPick: () => setPicking({ ...picking, onMap: true }),
        },
      ]
    : []
  const legNames = plan ? [...plan.stops.map((s) => s.name), plan.destinationName] : []
  const nextStop =
    nav && nav.stopsReached < nav.stops.length
      ? { name: nav.stops[nav.stopsReached].name, left: nav.stops.length - nav.stopsReached }
      : null
  const canAddStop = draft?.to != null && draft.stops.length < MAX_STOPS

  return (
    <div className="map-page">
      <div className="map-canvas" ref={mapDivRef} />

      {(loading || (!mapReady && !mapError)) && <p className="map-status">Loading map…</p>}
      {mapError && <p className="map-status">{mapError}</p>}

      {nav ? (
        <NavigationHud
          step={nav.step}
          steps={nav.model.steps}
          status={nav.status}
          destinationName={nav.destinationName}
          nextStop={nextStop}
          muted={muted}
          onToggleMute={toggleMute}
          onEnd={endNavigation}
        >
          {/* Gem alerts stack under the banner (and any "Then" strip). */}
          {gemAlert && (
            <div className={'nav-gem-alert' + (gemAlert.type === 'passed' ? ' passed' : '')} role="status" aria-live="polite">
              <GemBadge category={gemAlert.gem.category} size={40} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="nav-gem-alert-kicker">
                  {gemAlert.type === 'approaching' ? `Hidden gem ahead · ${formatDistance(gemAlert.aheadM)}` : 'You just passed'}
                </div>
                <div className="nav-gem-alert-name">{gemAlert.gem.name}</div>
                <div className="nav-gem-alert-sub">~{gemAlert.detourMin} min detour (estimate)</div>
              </div>
              {gemAlert.type === 'passed' &&
                (savedIds.has(gemAlert.gem.id) ? (
                  <span className="nav-gem-alert-saved">Saved</span>
                ) : (
                  <button className="nav-gem-alert-save" disabled={busy} onClick={() => handleToggleSave(gemAlert.gem.id)}>
                    <Bookmark size={14} /> Save
                  </button>
                ))}
            </div>
          )}
        </NavigationHud>
      ) : preview != null && selectedRoute?.steps?.length > 0 ? (
        <RoutePreviewHud
          steps={selectedRoute.steps}
          index={preview.index}
          legNames={legNames}
          route={selectedRoute}
          onPrev={() => setPreview((p) => ({ index: Math.max(0, p.index - 1) }))}
          onNext={() => setPreview((p) => ({ index: Math.min(selectedRoute.steps.length - 1, p.index + 1) }))}
          onClose={closePreview}
        />
      ) : (
        <>
          {picking && !picking.onMap ? (
            <DestinationSearch
              key={`${picking.slot}:${picking.index ?? ''}`}
              gems={gems}
              recent={quickPicks.recent}
              saved={quickPicks.saved}
              pinned={pinned}
              near={livePos ?? position}
              placeholder={PICK_PLACEHOLDER[picking.slot]}
              autoFocus
              gemsAsPlaces
              extraItems={pickExtras}
              hint="Type a place, address or gem above, or pick one below"
              onCancel={() => (draft ? setPicking(null) : clearDirections())}
              onPickPlace={(place) => fillSlot(picking, place)}
            />
          ) : picking?.onMap ? (
            <div className="map-pick-banner" role="status">
              <MapPin size={15} />
              <span>Tap the map to choose {PICK_ON_MAP_TEXT[picking.slot]}</span>
              <button onClick={() => setPicking({ ...picking, onMap: false })}>Cancel</button>
            </div>
          ) : draft ? (
            <RouteEditor
              draft={draft}
              maxStops={MAX_STOPS}
              editorRef={editorRef}
              onEdit={(target) => setPicking(target)}
              onRemoveStop={removeStop}
              onAddStop={() => setPicking({ slot: 'stop' })}
              onSwap={swapEnds}
              onClose={clearDirections}
            />
          ) : (
            <DestinationSearch
              gems={gems}
              recent={quickPicks.recent}
              saved={quickPicks.saved}
              pinned={pinned}
              near={livePos ?? position}
              placeholder="Where to? Search or tap the map"
              onPickGem={handlePickGem}
              onPickPlace={(place) => planTo({ lat: place.lat, lng: place.lng }, place.name)}
            />
          )}

          <div className="map-layers" role="group" aria-label="Map layers">
            <button className="map-layer-btn" onClick={showMyLocation} title="My location" aria-label="My location">
              <LocateFixed size={16} />
            </button>
            <button
              className={'map-layer-btn' + (layers.gems ? ' active' : '')}
              onClick={() => setLayers((l) => ({ ...l, gems: !l.gems }))}
              aria-pressed={layers.gems}
              title="Hidden Gems"
            >
              <Gem size={16} />
            </button>
            <button
              className={'map-layer-btn' + (layers.reports ? ' active' : '')}
              onClick={() => setLayers((l) => ({ ...l, reports: !l.reports }))}
              aria-pressed={layers.reports}
              title="Road reports"
            >
              <TriangleAlert size={16} />
            </button>
            <button
              className={'map-layer-btn' + (layers.traffic ? ' active' : '')}
              onClick={() => setLayers((l) => ({ ...l, traffic: !l.traffic }))}
              aria-pressed={layers.traffic}
              title="Live traffic"
            >
              <TrafficCone size={16} />
            </button>
          </div>

          <div className="map-filter-row" hidden={draft != null}>
            {categories.map((c) => (
              <button
                key={c.value}
                className={'chip' + (activeCategories.has(c.value) ? ' active' : '')}
                onClick={() => toggleCategory(c.value)}
              >
                <GemGlyph category={c.value} /> {c.label}
              </button>
            ))}
          </div>

          {(routing || plan || routeError) && !selectedGem && !selectedIncident && !dropped && !picking && (
            // Every alternative side by side — time, distance, PathIQ's scores and
            // the road problems on it — then the selected route's problems and
            // Start. This is the whole route-comparison feature; there's no
            // separate page for it.
            <div className="map-route-panel" ref={routePanelRef}>
              {routing && <p className="list-row-sub" style={{ margin: 0 }}>Planning route…</p>}
              {!routing && routeError && <p className="auth-error" style={{ margin: 0 }}>{routeError}</p>}
              {!routing && selectedRoute && (
                <>
                  <div className="route-panel-head">
                    <div style={{ minWidth: 0 }}>
                      <div className="route-panel-title">To {plan.destinationName}</div>
                      <div className="route-panel-sub">
                        {plan.stops.length > 0
                          ? `Via ${plan.stops.length} stop${plan.stops.length === 1 ? '' : 's'} · `
                          : `${plan.options.length} route${plan.options.length === 1 ? '' : 's'} · `}
                        {corridor.gems.length} gem{corridor.gems.length === 1 ? '' : 's'} along the{' '}
                        {plan.options.length === 1 ? 'route' : 'selected one'}
                      </div>
                    </div>
                    <button
                      className="map-route-clear"
                      onClick={() => setDropped({ ...plan.destination, name: plan.destinationName, kind: 'shared', pinning: true })}
                      aria-label="Pin this destination"
                      title="Pin this destination"
                    >
                      <Pin size={16} />
                    </button>
                    <button className="map-route-clear" onClick={clearDirections} aria-label="Clear route">
                      <X size={16} />
                    </button>
                  </div>

                  <div className="route-option-list">
                    {plan.options.map((o) => (
                      <button
                        key={o.id}
                        className={'route-option-row' + (o.id === plan.selectedId ? ' selected' : '')}
                        onClick={() => setPlan((p) => ({ ...p, selectedId: o.id }))}
                        aria-pressed={o.id === plan.selectedId}
                      >
                        <span className="route-option-time">{formatDuration(o.durationS)}</span>
                        <span className="route-option-body">
                          <span className="route-option-label">
                            {routeLabel(o)} · {(o.distanceM / 1000).toFixed(1)} km
                          </span>
                          <span className="route-option-scores">
                            <span>Road {o.scores.roadQuality}</span>
                            <span className={`traffic-${trafficByRoute.get(o.id)?.level}`}>{trafficByRoute.get(o.id)?.text}</span>
                            <span className={o.reportCount ? 'has-reports' : ''}>
                              {o.reportCount ? `${o.reportCount} report${o.reportCount === 1 ? '' : 's'}` : 'No reports'}
                            </span>
                          </span>
                        </span>
                      </button>
                    ))}
                  </div>

                  {selectedRoute.alerts?.length > 0 && (
                    <div className="route-alerts">
                      {selectedRoute.alerts.map((a, i) => (
                        <div key={i} className={`route-alert route-alert-${severityBand(a.severity)}`}>
                          <ReportBadge type={a.type} severity={a.severity} size={20} /> {reportTypeLabel(a.type)} · severity{' '}
                          {a.severity}/5, painted on the route
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="route-legend" aria-label="Route line colours">
                    <span><i className="swatch" style={{ background: ROUTE_COLOR }} /> Clear</span>
                    <span><i className="swatch" style={{ background: TRAFFIC_COLOR.SLOW }} /> Slow</span>
                    <span><i className="swatch" style={{ background: TRAFFIC_COLOR.TRAFFIC_JAM }} /> Heavy traffic</span>
                    <span><i className="swatch dotted" /> Road report</span>
                  </div>

                  {!canNavigateLive && (
                    <p className="route-preview-note">
                      <Eye size={13} />
                      <span>
                        {!livePos
                          ? 'Location is off, so you can preview the directions step by step. Turn it on for live turn-by-turn.'
                          : plan.fromMe
                            ? 'Waiting for your location…'
                            : `This route starts ${formatDistance(distanceM(livePos, plan.origin))} from you. Live turn-by-turn starts once you're there, or set the start to Your location.`}
                      </span>
                    </p>
                  )}

                  <div className="route-panel-actions">
                    {canNavigateLive ? (
                      <button
                        className="map-route-start route-panel-start"
                        onClick={() => startNavigation(selectedRoute, plan)}
                      >
                        <Play size={14} fill="currentColor" /> Start
                      </button>
                    ) : (
                      <button
                        className="map-route-start route-panel-start"
                        disabled={!selectedRoute.steps?.length}
                        onClick={() => setPreview({ index: 0 })}
                      >
                        <Eye size={14} /> Preview directions
                      </button>
                    )}
                    {selectedRoute.steps?.length > 0 && (
                      <button className="route-panel-steps" onClick={() => setShowRouteSteps(true)}>
                        <List size={15} /> Steps
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
        </>
      )}

      {!nav && showRouteSteps && selectedRoute?.steps?.length > 0 && (
        <DirectionsList
          steps={selectedRoute.steps}
          destinationName={plan.destinationName}
          onClose={() => setShowRouteSteps(false)}
        />
      )}

      {!nav && !loading && position?.isFallback && !draft && !dropped && (
        // Says *why* there's no location and how to fix it, not just "off".
        <div className="map-location-notice" role="status">
          <LocateOff size={14} />
          <span>
            <b>{locationHelp(position.reason).title}.</b> {locationHelp(position.reason).detail} Meanwhile the map shows
            central Nairobi, and you can plan a route by choosing a starting point.{' '}
            <Link to="/privacy">How we use location</Link>
          </span>
        </div>
      )}

      {(error || navError) && (
        <p className="auth-error map-floating-error" style={{ top: nav ? 124 : 108 }}>
          {navError || error}
        </p>
      )}

      {!nav && dropped && !selectedGem && !selectedIncident && (
        <PlaceSheet
          key={`${dropped.kind}:${dropped.pinId ?? ''}:${dropped.lat},${dropped.lng}:${dropped.pinning ? 1 : 0}`}
          place={dropped}
          startPinning={!!dropped.pinning}
          subtitle={livePos && dropped.kind !== 'me' ? `${(distanceM(livePos, dropped) / 1000).toFixed(1)} km away` : ''}
          routeLabel={draft?.to ? 'Make destination' : 'Route here'}
          routing={routing}
          onClose={() => setDropped(null)}
          onRoute={dropped.kind === 'me' ? null : () => planTo(dropped, placeName(dropped))}
          onAddStop={canAddStop && dropped.kind !== 'me' ? () => fillSlot({ slot: 'stop' }, { ...dropped, name: placeName(dropped) }) : null}
          onStart={() => fillSlot({ slot: 'from' }, dropped.kind === 'me' ? ME : { ...dropped, name: placeName(dropped) })}
          // "Your location" would mean the recipient's own spot to them, so it goes out unnamed ("Shared location").
          onShare={() =>
            handleShare({
              lat: dropped.lat,
              lng: dropped.lng,
              name: dropped.kind === 'dropped' || dropped.kind === 'me' ? '' : placeName(dropped),
              title: dropped.kind === 'me' ? 'My location' : undefined,
            })
          }
          onSavePin={(fields) => handleSavePin(dropped, fields)}
          onUnpin={() => handleUnpin(dropped.pinId)}
        >
          {isScout && dropped.kind !== 'pinned' && (
            <>
              <button
                className="map-route-here-btn"
                onClick={() => navigate(`/app/scout?form=report&lat=${dropped.lat.toFixed(6)}&lng=${dropped.lng.toFixed(6)}`)}
              >
                <TriangleAlert size={13} /> Report a road issue here
              </button>
              <button
                className="map-route-here-btn"
                onClick={() => navigate(`/app/scout?form=gem&lat=${dropped.lat.toFixed(6)}&lng=${dropped.lng.toFixed(6)}`)}
              >
                <MapPinPlus size={13} /> Add a gem here
              </button>
            </>
          )}
        </PlaceSheet>
      )}

      {notice && (
        <p className="map-toast" role="status">
          {notice}
        </p>
      )}

      {(selectedGem || selectedIncident) && (
        <>
          <button className="map-sheet-handle" onClick={() => setSelected(null)} aria-label="Close">
            <X size={16} />
          </button>
          <div className="map-sheet">
            {selectedGem ? (
              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <GemBadge category={selectedGem.category} size={44} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 16 }}>{selectedGem.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--muted-foreground)', marginTop: 2 }}>
                    {gemStyle(selectedGem.category).label} · {(selectedGem.distance_m / 1000).toFixed(1)} km away
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10 }}>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button
                        key={n}
                        className="rate-star-btn"
                        disabled={busy}
                        onClick={() => handleRate(selectedGem.id, n)}
                        aria-label={`Rate ${n} stars`}
                      >
                        <Star size={16} />
                      </button>
                    ))}
                    <span style={{ fontSize: 12, color: 'var(--muted-foreground)' }}>
                      {selectedGem.confirmations_count} confirmed
                    </span>
                  </div>
                  {!nav && (
                    <div className="map-pin-actions">
                      <button
                        className="map-route-here-btn"
                        disabled={routing}
                        onClick={() => planTo({ lat: selectedGem.lat, lng: selectedGem.lng }, selectedGem.name)}
                      >
                        <Navigation2 size={13} /> {draft?.to ? 'Make destination' : 'Route here'}
                      </button>
                      {canAddStop && (
                        <button
                          className="map-route-here-btn"
                          onClick={() => fillSlot({ slot: 'stop' }, { lat: selectedGem.lat, lng: selectedGem.lng, name: selectedGem.name })}
                        >
                          <Plus size={13} /> Add as stop
                        </button>
                      )}
                      <button
                        className="map-route-here-btn"
                        onClick={() => handleShare({ lat: selectedGem.lat, lng: selectedGem.lng, name: selectedGem.name })}
                      >
                        <Share2 size={13} /> Share
                      </button>
                    </div>
                  )}
                </div>
                <button
                  className={'save-btn' + (savedIds.has(selectedGem.id) ? ' saved' : '')}
                  disabled={busy}
                  onClick={() => handleToggleSave(selectedGem.id)}
                  aria-label={savedIds.has(selectedGem.id) ? 'Remove from saved' : 'Save gem'}
                >
                  <Bookmark size={18} fill={savedIds.has(selectedGem.id) ? 'currentColor' : 'none'} />
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <ReportBadge type={selectedIncident.type} severity={selectedIncident.severity} size={44} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 16 }}>
                    {reportTypeLabel(selectedIncident.type)} — severity {selectedIncident.severity}/5
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--muted-foreground)', marginTop: 4 }}>
                    {(selectedIncident.distance_m / 1000).toFixed(1)} km away
                    {selectedIncident.description ? ` · ${selectedIncident.description}` : ''}
                  </div>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

export default MapPage
