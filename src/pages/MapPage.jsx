import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Navigation2, LocateOff, TriangleAlert, MapPinPlus, Eye, LocateFixed, MapPin, Play } from 'lucide-react'
import { useAuth } from '../context/useAuth'
import {
  fetchNearbyGems, fetchSavedGemIds, fetchSavedGems, saveGem, unsaveGem, confirmGem,
  getCurrentPosition, locationErrorReason, refineLocationReason, locationPermission,
} from '../lib/gems'
import { locationHelp } from '../lib/locationHelp'
import { fetchNearbyRoadReports } from '../lib/roadReports'
import { planRoutes, fetchRouteCorridor, formatDuration, MAX_STOPS } from '../lib/routePlanning'
import { loadGoogleMaps, createPathiqMap, watchVector, AUTH_FAILURE_EVENT, mapsAuthFailed } from '../lib/googleMaps'
import { buildNavModel, distanceM, formatDistance, slicePath, headingAt } from '../lib/navigation'
import { loadActiveTrip } from '../lib/activeTrip'
import { fetchRecentDestinations } from '../lib/trips'
import { loadAlertPrefs, saveAlertPrefs, corridorForDetour } from '../lib/alertPrefs'
import NavigationHud from '../components/NavigationHud'
import DestinationSearch from '../components/DestinationSearch'
import RouteEditor from '../components/RouteEditor'
import RoutePreviewHud from '../components/RoutePreviewHud'
import PlaceSheet from '../components/PlaceSheet'
import { fetchPinnedPlaces, pinPlace, updatePinnedPlace, unpinPlace } from '../lib/pinnedPlaces'
import { shareLocation, parseSharedLocation } from '../lib/share'
import DirectionsList from '../components/DirectionsList'
import { ME, NAV_ZOOM, placeName } from './map/constants'
import { parseUrlPlan } from './map/urlPlan'
import { cameraAhead, animateCamera } from './map/camera'
import { LayerButtons, CategoryChips } from './map/MapControls'
import { GemAlert, ReportAlert } from './map/NavAlerts'
import FeatureSheet from './map/FeatureSheet'
import RoutePanel from './map/RoutePanel'
import useGooglePlaces from './map/useGooglePlaces'
import useMapMarkers from './map/useMapMarkers'
import useRouteOverlays from './map/useRouteOverlays'
import useTurnByTurn from './map/useTurnByTurn'

const RADIUS_M = 5000
const VIEW_MAX_RADIUS_M = 30_000 // PathIQ gems/reports for the area on screen: at most this far out
// Live navigation needs the driver at the start of the route. A route starting
// somewhere else (or planned with location off) can only be previewed.
const LIVE_START_M = 150
// Turn icons along the route appear from this zoom level (street level);
// further out they'd just be clutter.
const MANEUVER_MIN_ZOOM = 15

const PICK_PLACEHOLDER = { from: 'Search for a starting point…', to: 'Search for a destination…', stop: 'Search for a stop…' }
const PICK_ON_MAP_TEXT = { from: 'the starting point', to: 'the destination', stop: 'a stop' }

// Fetched rows added to what's loaded; a newer copy of the same row wins.
function mergeById(prev, rows) {
  const byId = new Map(prev.map((r) => [r.id, r]))
  rows.forEach((r) => byId.set(r.id, r))
  return [...byId.values()]
}

// The app's home: a real Google map with PathIQ's own data on top. Explore
// first — gems, road reports, pinned places and Google's places, each with a
// sheet and Directions — then plan a route (Google Routes, scored against
// verified road reports) and drive it in navigation mode (useTurnByTurn).
// The pieces live in ./map/.
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

  // Tapping the map drops a pin (with Directions / Scout actions) rather than
  // planning straight away: a stray tap shouldn't spend a Google Routes call.
  // The spot the place sheet is showing: { lat, lng, name?, kind: 'dropped' |
  // 'shared' | 'me' | 'pinned', pinId?, label?, pinning? }
  const [dropped, setDropped] = useState(null)
  const [pinned, setPinned] = useState([]) // the driver's pinned places
  const [notice, setNotice] = useState('') // brief confirmation, e.g. "Link copied"
  // One-tap destinations in the search box (see DestinationSearch).
  const [quickPicks, setQuickPicks] = useState({ recent: [], saved: [] })
  // A trip left mid-drive on this device, offered as "Resume".
  const [resumable, setResumable] = useState(loadActiveTrip)
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
  const [alertPrefs, setAlertPrefs] = useState(loadAlertPrefs)
  const [choosingDetour, setChoosingDetour] = useState(false)
  function chooseDetour(maxDetourMin) {
    const next = { ...alertPrefs, enabled: true, maxDetourMin, detourAsked: true }
    saveAlertPrefs(next)
    setAlertPrefs(next) // refetches the route's gems for the new detour
    setChoosingDetour(false)
  }
  const [routing, setRouting] = useState(false)
  const [routeError, setRouteError] = useState('')
  // On phones the route panel starts compact (chosen route + Start) so the
  // route itself stays visible; "More" shows the alternatives and details.
  const [routeDetails, setRouteDetails] = useState(false)
  const [showRouteSteps, setShowRouteSteps] = useState(false)
  const recenteredRef = useRef(false)

  const pageRef = useRef(null)
  const mapDivRef = useRef(null)
  const mapRef = useRef(null)
  const mapsApiRef = useRef(null)
  const [mapReady, setMapReady] = useState(false)
  // A vector map (VITE_GOOGLE_MAP_ID) turns and tilts natively; otherwise the
  // canvas is turned instead (map/camera.js).
  const [nativeHeading, setNativeHeading] = useState(false)
  const [mapError, setMapError] = useState('')
  const [view, setView] = useState(null) // { center, radiusM, zoom } — the map area on screen

  // Gems near the driver, plus any along the planned route, which can be far
  // beyond RADIUS_M on a long trip.
  const allGems = useMemo(() => {
    if (!plan || corridor.gems.length === 0) return gems
    // A gem in both keeps its route details (distance off the route).
    const onRoute = new Map(corridor.gems.map((g) => [g.id, g]))
    const near = new Set(gems.map((g) => g.id))
    return [
      ...gems.map((g) => (onRoute.has(g.id) ? { ...onRoute.get(g.id), ...g } : g)),
      ...corridor.gems.filter((g) => !near.has(g.id)),
    ]
  }, [gems, plan, corridor])
  const selectedRoute = plan?.options.find((o) => o.id === plan.selectedId) ?? null

  const { googleRoute, googleRoutePlaces, googleGems } = useGooglePlaces({
    session,
    position,
    view,
    plan,
    selectedRoute,
    alertPrefs,
    pathiqGems: allGems,
    onPaused: () => setNotice('Google places paused for a few minutes (search limit). PathIQ gems still show.'),
  })
  // Every gem on the map: PathIQ's first, then Google's.
  const everyGem = useMemo(() => [...allGems, ...googleGems], [allGems, googleGems])
  // Reports on the selected route, likewise: the routes function only says
  // how far along the route each one is, so far-off ones are pinned there.
  const allIncidents = useMemo(() => {
    const known = new Set(incidents.map((i) => i.id))
    const missing = (selectedRoute?.hazards ?? []).filter((h) => !known.has(h.id))
    if (missing.length === 0) return incidents
    const model = buildNavModel(selectedRoute)
    const placed = missing
      .map((h) => {
        if (h.lat != null) return { id: h.id, type: h.type, severity: h.severity, lat: h.lat, lng: h.lng }
        // Older routes function: no coordinates, so place it on the route.
        const s = Math.min(h.routeFraction * model.total, model.total - 1)
        const [at] = slicePath(model, s, s + 1)
        return at && { id: h.id, type: h.type, severity: h.severity, lat: at.lat, lng: at.lng }
      })
      .filter(Boolean)
    return [...incidents, ...placed]
  }, [incidents, selectedRoute])
  const selectedGem = selected?.type === 'gem' ? everyGem.find((g) => g.id === selected.id) : null
  const selectedIncident = selected?.type === 'incident' ? allIncidents.find((i) => i.id === selected.id) : null
  // Only a real GPS fix, never the central-Nairobi stand-in used when location is off.
  const livePos = position && !position.isFallback ? position : null
  // Live navigation needs the driver at the route's start; otherwise, preview.
  const canNavigateLive =
    plan != null && livePos != null && (plan.fromMe || distanceM(livePos, plan.origin) <= LIVE_START_M)

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

  const turn = useTurnByTurn({
    mapRef,
    mapsApiRef,
    userId,
    profile,
    livePos,
    position,
    alertPrefs,
    layers,
    selectedRoute,
    corridor,
    googleRoute,
    googleRoutePlaces,
    onRerouted: ({ from, stops, options, option }) => {
      setPlan((p) => p && { ...p, origin: from, fromMe: true, stops, options, selectedId: option.id })
      setDraft((d) => d && { ...d, from: ME, stops })
    },
    onTripStarted: loadQuickPicks,
  })
  const { nav, navActive, follow } = turn

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

  // PathIQ gems and reports for the area on screen (free: our own database),
  // added to what's loaded, so browsing anywhere shows what's there.
  const viewAreasRef = useRef([])
  useEffect(() => {
    if (!session || !view) return
    const radiusM = Math.round(Math.min(Math.max(view.radiusM, RADIUS_M), VIEW_MAX_RADIUS_M))
    // Already covered by an area fetched this session.
    if (viewAreasRef.current.some((a) => distanceM(a.center, view.center) + radiusM <= a.radiusM)) return
    viewAreasRef.current.push({ center: view.center, radiusM })
    const { lat, lng } = view.center
    // distance_m here is from the middle of the screen, not the driver, so
    // rows already loaded around the driver are kept as they are.
    const withoutDistance = (rows) => rows.map((r) => ({ ...r, distance_m: undefined }))
    Promise.all([fetchNearbyGems(lat, lng, { radiusM }), fetchNearbyRoadReports(lat, lng, radiusM)])
      .then(([gemRows, incidentRows]) => {
        setGems((prev) => mergeById(withoutDistance(gemRows), prev))
        setIncidents((prev) => mergeById(withoutDistance(incidentRows), prev))
      })
      .catch(() => {})
  }, [session, view])

  const load = useCallback(async () => {
    try {
      const pos = position ?? (await getCurrentPosition())
      const { gemRows, incidentRows, saved } = await fetchAround(pos)
      setGems((prev) => mergeById(prev, gemRows))
      setIncidents((prev) => mergeById(prev, incidentRows))
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
        setGems((prev) => mergeById(prev, gemRows))
        setIncidents((prev) => mergeById(prev, incidentRows))
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

  // Directions to somewhere (search, a place's sheet, History), keeping the
  // start and stops already chosen. Starts from your location when it's on.
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

  // Into navigation mode: the map's own sheets and pickers step aside.
  function startNavigation(option, trip) {
    setSelected(null)
    setDropped(null)
    setPicking(null)
    setPreview(null)
    setShowRouteSteps(false)
    setResumable(null)
    turn.start(option, trip)
  }

  function endNavigation() {
    turn.end()
    setResumable(null)
  }

  // Plan the route to a trip's destination (with its remaining stops) and,
  // when `drive` is set, start navigating it at once.
  function planAndMaybeStart({ to, name, routeId = null, stops = [], drive }) {
    return planTo(to, name, routeId, stops).then((option) => {
      if (option && drive) startNavigation(option, { destination: to, destinationName: name, stops })
    })
  }

  function resumeTrip() {
    const trip = resumable
    if (!trip) return
    planAndMaybeStart({ to: trip.destination, name: trip.destinationName, routeId: trip.routeId, stops: trip.stops ?? [], drive: true })
  }

  function handleFix(pos) {
    // The first real fix after starting with location off: fetch what's
    // around the driver, and move there unless a route is on screen.
    if (position?.isFallback && !recenteredRef.current) {
      recenteredRef.current = true
      if (!draft) mapRef.current?.panTo(pos)
      fetchAround(pos)
        .then(({ gemRows, incidentRows }) => {
          setGems((prev) => mergeById(prev, gemRows))
          setIncidents((prev) => mergeById(prev, incidentRows))
        })
        .catch(() => {})
    }
    setPosition(pos)
    turn.onFix(pos)
  }

  // Callbacks registered once (map click, GPS watch, URL auto-start) call
  // through this ref so they always reach the current render's functions.
  const latest = useRef({})
  useEffect(() => {
    latest.current = { planAndMaybeStart, handleFix, fillSlot, nav, preview, picking, position, setFollow: turn.setFollow }
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
        const map = createPathiqMap(api, mapDivRef.current, { center: latest.current.position, zoom: 14, vector: true })
        watchVector(map, setNativeHeading)
        // Upright markers and the driver's arrow follow the map's own heading.
        const page = pageRef.current
        map.addListener('heading_changed', () => page?.style.setProperty('--map-heading', `${map.getHeading() ?? 0}deg`))
        // Turn icons only at street level (CSS hides them otherwise).
        const div = mapDivRef.current
        const syncZoomClass = () => div.classList.toggle('show-maneuvers', map.getZoom() >= MANEUVER_MIN_ZOOM)
        map.addListener('zoom_changed', syncZoomClass)
        syncZoomClass()
        map.addListener('dragstart', () => {
          latest.current.setFollow(false)
          setRouteDetails(false)
        })
        // What's on screen, once the map settles: gems and reports are
        // fetched for wherever the driver is looking, not just around them.
        map.addListener('idle', () => {
          const c = map.getCenter()
          const ne = map.getBounds()?.getNorthEast()
          if (!c || !ne) return
          const center = { lat: c.lat(), lng: c.lng() }
          setView({ center, radiusM: distanceM(center, { lat: ne.lat(), lng: ne.lng() }), zoom: map.getZoom() })
        })
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

  // Opened from a shared location link: show that spot.
  useEffect(() => {
    if (!mapReady || !sharedAt.current || urlPlan.current) return
    const at = sharedAt.current
    sharedAt.current = null
    setDropped({ ...at, kind: 'shared' })
    mapRef.current?.setZoom(16)
    mapRef.current?.panTo(at)
  }, [mapReady])

  // Arriving with ?to=… — plan it once the map is up, and start navigating
  // straight away with nav=1.
  useEffect(() => {
    if (!mapReady || !urlPlan.current) return
    const { to, name, routeId, stops, nav: drive } = urlPlan.current
    urlPlan.current = null
    latest.current.planAndMaybeStart({ to, name, routeId, stops, drive })
  }, [mapReady])

  // Live GPS the whole time the map is open, not just while navigating, so a
  // route starts from where the driver is now rather than where they were
  // when the page loaded, and turning location on later is picked up.
  // A watch that was refused stays dead, so it's restarted when the
  // permission changes to allowed, and by the notice's Try again.
  const watchRef = useRef({ id: null, restart: () => {} })
  useEffect(() => {
    // Insecure pages never get location; getCurrentPosition already reported why.
    if (!('geolocation' in navigator) || !window.isSecureContext) return
    const w = watchRef.current
    const start = () => {
      if (w.id != null) navigator.geolocation.clearWatch(w.id)
      w.id = navigator.geolocation.watchPosition(
        (p) =>
          latest.current.handleFix({
            lat: p.coords.latitude,
            lng: p.coords.longitude,
            isFallback: false,
            // for road-data contributions (lib/locationContribution), when opted in
            accuracy: p.coords.accuracy,
            speed: p.coords.speed,
            heading: p.coords.heading,
            timestamp: p.timestamp,
          }),
        async (err) => {
          const reason = await refineLocationReason(locationErrorReason(err))
          // Keep the notice's reason current (e.g. permission denied after a slow first try).
          setPosition((p) => (p?.isFallback ? { ...p, reason } : p))
          const n = latest.current.nav
          if (n && n.status !== 'arrived') {
            // A lost signal mid-drive (tunnel, trees) isn't a settings problem.
            turn.setNavError(
              reason === 'timeout' ? 'GPS signal lost. Waiting for your location…' : `${locationHelp(reason).title}. Navigation needs your live location.`,
            )
          }
        },
        { enableHighAccuracy: true, maximumAge: 2000, timeout: 15000 },
      )
    }
    w.restart = start
    start()
    let permission = null
    const onPermission = () => permission?.state === 'granted' && start()
    locationPermission().then((status) => {
      permission = status
      permission?.addEventListener('change', onPermission)
    })
    return () => {
      permission?.removeEventListener('change', onPermission)
      if (w.id != null) navigator.geolocation.clearWatch(w.id)
      w.id = null
    }
    // setNavError is a state setter: stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // "Try again" on the location notice: ask once more (which shows the
  // browser's prompt again where it can) and restart the GPS watch.
  async function retryLocation() {
    watchRef.current.restart()
    const { live, reason } = await locateNow()
    if (live) {
      mapRef.current?.panTo(live)
      setNotice('Location found')
    } else {
      setNotice(locationHelp(reason).title)
    }
  }

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

  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(() => setNotice(''), 2500)
    return () => clearTimeout(timer)
  }, [notice])

  async function handleShare(place) {
    try {
      const result = await shareLocation(place)
      if (result === 'copied') setNotice('Link copied. Paste it into a chat or SMS.')
    } catch {
      setNotice("Couldn't share this place.")
    }
  }

  // Pin a spot, or save changes to a pinned place (name, Home / Work / Other).
  async function handleSavePin(place, { name, label }) {
    if (place.kind === 'pinned') {
      await updatePinnedPlace(place.pinId, { name, label })
      setDropped({ ...place, name, label, pinning: false })
      setNotice('Pinned place updated')
    } else {
      const pinId = await pinPlace({ name, label, lat: place.lat, lng: place.lng })
      setDropped({ lat: place.lat, lng: place.lng, name, label, kind: 'pinned', pinId })
      setNotice(`Pinned "${name}"`)
    }
    loadPinned()
  }

  async function handleUnpin(pinId) {
    try {
      await unpinPlace(pinId)
      setDropped(null)
      setPinned((rows) => rows.filter((p) => p.id !== pinId))
      setNotice('Place unpinned')
    } catch (err) {
      setError(err.message)
    }
  }

  // "Where am I?": centre on the driver and offer to share or pin the spot.
  async function showMyLocation() {
    const { live: here, reason } = await locateNow()
    if (!here) {
      setNotice(locationHelp(reason).title)
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
      layers.gems ? everyGem.filter((g) => activeCategories.size === 0 || activeCategories.has(g.category)) : [],
    [everyGem, activeCategories, layers.gems],
  )
  const visibleIncidents = useMemo(() => (layers.reports ? allIncidents : []), [allIncidents, layers.reports])

  const routeGemIds = useMemo(
    () => new Set((plan ? [...corridor.gems, ...googleRoutePlaces] : []).map((g) => g.id)),
    [plan, corridor, googleRoutePlaces],
  )
  // Reports that still matter on the selected route, as judged by the routes
  // edge function (old ones fade out — see isStillRelevant in scoring.ts).
  const routeReportIds = useMemo(() => new Set((selectedRoute?.hazards ?? []).map((h) => h.id)), [selectedRoute])
  // With a route planned the map focuses on it: what's along it (or a short
  // detour off it) glows, everything else fades back.
  const routeFocus = plan != null
  // Everything along the selected route, in the order you'll reach it:
  // PathIQ gems and reports first, then Google's places.
  const alongRoute = useMemo(() => {
    if (!plan) return []
    const shown = (g) => layers.gems && (activeCategories.size === 0 || activeCategories.has(g.category))
    const gemItems = corridor.gems.filter(shown).map((g) => ({ kind: 'gem', id: g.id, at: g.route_fraction, item: g }))
    const googleItems = googleRoutePlaces
      .filter(shown)
      .map((g) => ({ kind: 'gem', id: g.id, at: g.route_fraction, item: g }))
      .sort((a, b) => a.at - b.at)
    const reportItems = layers.reports
      ? (selectedRoute?.hazards ?? []).map((h) => ({
          kind: 'incident',
          id: h.id,
          at: h.routeFraction,
          item: allIncidents.find((i) => i.id === h.id) ?? h,
        }))
      : []
    return [...[...gemItems, ...reportItems].sort((a, b) => a.at - b.at), ...googleItems]
  }, [plan, corridor, googleRoutePlaces, selectedRoute, allIncidents, layers, activeCategories])

  useMapMarkers({
    mapRef,
    mapsApiRef,
    mapReady,
    gems: visibleGems,
    incidents: visibleIncidents,
    pinned,
    routeGemIds,
    routeReportIds,
    routeFocus,
    draft,
    dropped,
    selected,
    savedIds,
    onSelectGem: (gem) => setSelected({ type: 'gem', id: gem.id }),
    onSelectIncident: (incident) => setSelected({ type: 'incident', id: incident.id }),
    onSelectPinned: (p) => {
      setSelected(null)
      setDropped({ lat: p.lat, lng: p.lng, name: p.name, label: p.label, kind: 'pinned', pinId: p.id })
    },
  })

  const followingRoute = navActive || preview != null
  // Outside navigation the arrow uses the GPS heading, when moving.
  const gpsHeading = livePos?.speed > 1.5 && Number.isFinite(livePos.heading) ? livePos.heading : null
  useRouteOverlays({
    mapRef,
    mapsApiRef,
    mapReady,
    driverPos: (navActive && turn.driver?.pos) || livePos,
    driverHeading: navActive && turn.driver ? turn.driver.heading : gpsHeading,
    layers,
    plan,
    selectedRoute,
    followingRoute,
    navModel: navActive ? nav.model : null,
    travelledM: navActive ? nav.step?.s ?? 0 : 0,
    passedStepIndex: navActive ? nav.step?.stepIndex ?? null : null,
    onSelectRoute: (id) => setPlan((p) => (p ? { ...p, selectedId: id } : p)),
  })

  // Frame a new set of routes (not when merely switching between them, and
  // not mid-drive, where the camera follows the driver instead).
  const options = plan?.options
  const fitRoutes = useCallback(() => {
    const map = mapRef.current
    const api = mapsApiRef.current
    if (!map || !api || !options) return
    const bounds = new api.LatLngBounds()
    options.forEach((o) => o.path.forEach((p) => bounds.extend(p)))
    // Keep the routes clear of the route editor and the route panel: above and
    // below on phones, a column down the left on wide screens.
    if (window.matchMedia('(min-width: 900px)').matches) {
      map.fitBounds(bounds, { top: 40, bottom: 40, left: 420 + 16 + 40, right: 72 })
      return
    }
    const top = (editorRef.current?.offsetHeight ?? 110) + 36
    const panelHeight = routePanelRef.current?.offsetHeight ?? 280
    map.fitBounds(bounds, { top, bottom: panelHeight + 24, left: 40, right: 72 })
  }, [options])

  // Wide screens: the route panel sits right under the route editor, so the
  // routes' summary is next to where they were chosen (App.css, --editor-h).
  const editorShown = draft != null && !picking && !nav && preview == null
  useEffect(() => {
    const page = pageRef.current
    const el = editorRef.current
    if (!page || !el || !editorShown) return
    const sync = () => page.style.setProperty('--editor-h', `${el.offsetHeight}px`)
    sync()
    const observer = new ResizeObserver(sync)
    observer.observe(el)
    return () => observer.disconnect()
  }, [editorShown])
  useEffect(() => {
    if (!mapReady || latest.current.nav || latest.current.preview) return
    fitRoutes()
  }, [mapReady, fitRoutes])

  // Previewing: the map follows the step being shown, turned the way you'd
  // be driving there.
  const previewStep = preview != null ? selectedRoute?.steps?.[preview.index] : null
  const previewIndex = preview?.index
  const previewHeading = useMemo(() => {
    if (previewIndex == null || !selectedRoute?.path?.length) return null
    const model = buildNavModel(selectedRoute)
    return headingAt(model, previewIndex > 0 ? model.stepEnds[previewIndex - 1] : 0, 0, 40)
  }, [selectedRoute, previewIndex])
  useEffect(() => {
    const map = mapRef.current
    if (!mapReady || !map || !previewStep) return
    map.setZoom(NAV_ZOOM)
    cameraAhead(map, previewStep.start, previewHeading)
  }, [mapReady, previewStep, previewHeading])

  // Heading-up, like Google Maps: while following a route the map turns so the
  // way you're going is up the screen (camera.js). North-up again once the
  // driver drags the map or asks for the overview.
  const headingUp = navActive || preview != null
  const mapHeading = navActive ? (follow ? turn.driver?.heading ?? null : null) : preview != null ? previewHeading : null
  const rotationRef = useRef(0)
  useEffect(() => {
    const page = pageRef.current
    if (!page) return
    // Native: the camera turns with each move (cameraAhead); back to
    // north-up and flat when not following.
    if (nativeHeading) {
      if (mapHeading == null && mapRef.current) animateCamera(mapRef.current, { heading: 0, tilt: 0 })
      return
    }
    // The shortest way round: 350° → 10° turns 20°, not 340° backwards.
    const prev = rotationRef.current
    const delta = ((((mapHeading ?? 0) - prev) % 360) + 540) % 360 - 180
    rotationRef.current = prev + delta
    page.style.setProperty('--map-rot', `${rotationRef.current}deg`)
  }, [mapHeading, nativeHeading])

  // Phones: navigation gets the whole screen (no header or tab bar).
  useEffect(() => {
    document.documentElement.classList.toggle('driving', navActive)
    return () => document.documentElement.classList.remove('driving')
  }, [navActive])

  function closePreview() {
    setPreview(null)
    // Once the panel has re-rendered and the map is back to its normal size.
    setTimeout(fitRoutes, 120)
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
                sub: livePos ? 'Where you are now' : `${locationHelp(position?.reason).title}. Tap to try again.`,
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
  const directionsLabel = draft?.to ? 'Make destination' : 'Directions'
  const exploring = !nav && !draft && !dropped && !selectedGem && !selectedIncident && !picking

  return (
    <div className={'map-page' + (nativeHeading ? ' native-heading' : headingUp ? ' heading-up' : '')} ref={pageRef}>
      <div className="map-canvas" ref={mapDivRef} />

      {(loading || (!mapReady && !mapError)) && <p className="map-status">Loading map…</p>}
      {mapError && <p className="map-status">{mapError}</p>}

      {nav ? (
        <NavigationHud
          aside={
            nav.status !== 'arrived' && (
              <button className="nav-camera-btn" onClick={follow ? turn.showOverview : turn.recentre}>
                {follow ? <Eye size={15} /> : <Navigation2 size={15} />} {follow ? 'Overview' : 'Re-centre'}
              </button>
            )
          }
          step={nav.step}
          steps={nav.model.steps}
          status={nav.status}
          destinationName={nav.destinationName}
          nextStop={nextStop}
          ahead={turn.ahead}
          briefing={turn.briefing}
          onReadAhead={turn.readAhead}
          muted={turn.muted}
          onToggleMute={turn.toggleMute}
          onEnd={endNavigation}
        >
          {turn.reportAlert && <ReportAlert alert={turn.reportAlert} />}
          {/* Gem alerts stack under the banner (and any "Then" strip). */}
          {turn.gemAlert && (
            <GemAlert
              alert={turn.gemAlert}
              saved={savedIds.has(turn.gemAlert.gem.id)}
              busy={busy}
              onSave={() => handleToggleSave(turn.gemAlert.gem.id)}
            />
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
              near={view?.center ?? livePos ?? position}
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
            // Search finds a place and shows it; Directions is one tap from there.
            <DestinationSearch
              gems={gems}
              recent={quickPicks.recent}
              saved={quickPicks.saved}
              pinned={pinned}
              near={view?.center ?? livePos ?? position}
              placeholder="Search PathIQ Maps"
              onPickGem={handlePickGem}
              onPickPlace={(place) => {
                setSelected(null)
                setDropped({ lat: place.lat, lng: place.lng, name: place.name, kind: 'shared' })
                mapRef.current?.setZoom(16)
                mapRef.current?.panTo(place)
              }}
            />
          )}

          <LayerButtons
            layers={layers}
            onToggle={(key) => setLayers((l) => ({ ...l, [key]: !l[key] }))}
            onMyLocation={showMyLocation}
          />

          <CategoryChips active={activeCategories} onToggle={toggleCategory} hidden={draft != null} />

          {(routing || plan || routeError) && !selectedGem && !selectedIncident && !dropped && !picking && (
            <RoutePanel
              panelRef={routePanelRef}
              plan={plan}
              selectedRoute={selectedRoute}
              routing={routing}
              routeError={routeError}
              corridorGemCount={corridor.gems.length}
              googleCount={googleRoutePlaces.length}
              alongRoute={alongRoute}
              alertPrefs={alertPrefs}
              choosingDetour={choosingDetour}
              expanded={routeDetails}
              livePos={livePos}
              canNavigateLive={canNavigateLive}
              onSelect={(id) => setPlan((p) => ({ ...p, selectedId: id }))}
              onPin={() => setDropped({ ...plan.destination, name: plan.destinationName, kind: 'shared', pinning: true })}
              onClear={clearDirections}
              onChooseDetour={chooseDetour}
              onChangeDetour={() => setChoosingDetour(true)}
              onPickAlong={(kind, item) => {
                if (kind === 'gem') return handlePickGem(item)
                setDropped(null)
                setSelected({ type: 'incident', id: item.id })
                if (item.lat != null) mapRef.current?.panTo({ lat: item.lat, lng: item.lng })
              }}
              onToggleExpanded={() => setRouteDetails((v) => !v)}
              onStart={() => startNavigation(selectedRoute, plan)}
              onPreview={() => setPreview({ index: 0 })}
              onShowSteps={() => setShowRouteSteps(true)}
            />
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

      {exploring && resumable && (
        <div className="map-resume-card" role="status">
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="map-resume-title">Trip to {resumable.destinationName}</div>
            <div className="map-resume-sub">
              {formatDuration(resumable.remainingS)} · {formatDistance(resumable.remainingM)} left
            </div>
          </div>
          <button className="map-route-start" disabled={routing} onClick={resumeTrip}>
            <Play size={13} fill="currentColor" /> Resume
          </button>
          <button className="map-resume-dismiss" onClick={() => setResumable(null)} aria-label="Dismiss">
            ×
          </button>
        </div>
      )}

      {exploring && !resumable && !loading && position?.isFallback && (
        // Says *why* there's no location and how to fix it, not just "off".
        <div className="map-location-notice" role="status">
          <LocateOff size={14} />
          <span>
            <b>{locationHelp(position.reason).title}.</b> {locationHelp(position.reason).detail} Meanwhile the map shows
            central Nairobi, and you can plan a route by choosing a starting point.{' '}
            <Link to="/privacy">How we use location</Link>
          </span>
          {position.reason !== 'insecure' && position.reason !== 'unsupported' && (
            <button className="map-location-retry" onClick={retryLocation}>
              Try again
            </button>
          )}
        </div>
      )}

      {(error || turn.navError) && (
        <p className="auth-error map-floating-error" style={{ top: nav ? 124 : 108 }}>
          {turn.navError || error}
        </p>
      )}

      {!nav && dropped && !selectedGem && !selectedIncident && (
        <PlaceSheet
          key={`${dropped.kind}:${dropped.pinId ?? ''}:${dropped.lat},${dropped.lng}:${dropped.pinning ? 1 : 0}`}
          place={dropped}
          startPinning={!!dropped.pinning}
          subtitle={livePos && dropped.kind !== 'me' ? `${(distanceM(livePos, dropped) / 1000).toFixed(1)} km away` : ''}
          routeLabel={directionsLabel}
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
        <FeatureSheet
          gem={selectedGem}
          incident={selectedIncident}
          position={position}
          onRoute={selectedIncident ? routeReportIds.has(selectedIncident.id) : false}
          saved={selectedGem ? savedIds.has(selectedGem.id) : false}
          busy={busy}
          routing={routing}
          directionsLabel={directionsLabel}
          onClose={() => setSelected(null)}
          onDirections={nav || !selectedGem ? null : () => planTo({ lat: selectedGem.lat, lng: selectedGem.lng }, selectedGem.name)}
          onAddStop={
            canAddStop && selectedGem
              ? () => fillSlot({ slot: 'stop' }, { lat: selectedGem.lat, lng: selectedGem.lng, name: selectedGem.name })
              : null
          }
          onShare={() => selectedGem && handleShare({ lat: selectedGem.lat, lng: selectedGem.lng, name: selectedGem.name })}
          onToggleSave={selectedGem ? () => handleToggleSave(selectedGem.id) : null}
          onRate={selectedGem ? (n) => handleRate(selectedGem.id, n) : null}
        />
      )}
    </div>
  )
}

export default MapPage
