import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Search, X, Bookmark, Star, Navigation2, MapPin, Play, LocateOff } from 'lucide-react'
import { useAuth } from '../context/useAuth'
import { fetchNearbyGems, fetchSavedGemIds, saveGem, unsaveGem, confirmGem, getCurrentPosition } from '../lib/gems'
import { fetchNearbyRoadReports, reportTypeLabel, severityBand } from '../lib/roadReports'
import { planRoutes, fetchRouteCorridor, formatDuration, routeLabel } from '../lib/routePlanning'
import { loadGoogleMaps, MAP_ID, AUTH_FAILURE_EVENT, mapsAuthFailed } from '../lib/googleMaps'
import { newSearchSession, searchPlaces, resolvePlace } from '../lib/placeSearch'
import { buildNavModel, locate, progress, distanceM, spokenDistance, formatDistance } from '../lib/navigation'
import { saveActiveTrip, clearActiveTrip, loadActiveTrip } from '../lib/activeTrip'
import { startTrip, endTrip, recordReroute, recordGemEvent } from '../lib/trips'
import { loadAlertPrefs, detourMinutes, corridorForDetour } from '../lib/alertPrefs'
import { holdWakeLock, notifyIfHidden } from '../lib/driveAssist'
import NavigationHud from '../components/NavigationHud'

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

const CATEGORY_ICON = {
  attractions: '🎯', hotels: '🏨', food: '🍽️', scenic: '🌄', fuel: '⛽', facilities: '🏢',
}
const INCIDENT_ICON = { pothole: '🕳️', flooding: '🌊', construction: '🚧', surface: '🛣️', incident: '⚠️' }

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
const MIN_PLACE_QUERY = 3

// `?to=lat,lng&name=…&route=…&nav=1` plans a route on arrival (and starts
// navigating with nav=1) — used by the Routes tab and Home's "Resume".
function parseUrlPlan(params) {
  const [lat, lng] = (params.get('to') ?? '').split(',').map(Number)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  return {
    to: { lat, lng },
    name: params.get('name') || 'Dropped pin',
    routeId: params.get('route'),
    nav: params.get('nav') === '1',
  }
}

function pinElement(className, style, content, label) {
  const el = document.createElement('button')
  el.type = 'button'
  el.className = className
  el.setAttribute('aria-label', label)
  Object.assign(el.style, style)
  el.textContent = content
  return el
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
  const [searchParams] = useSearchParams()
  const urlPlan = useRef(parseUrlPlan(searchParams))

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

  const [query, setQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [placeResults, setPlaceResults] = useState({ query: '', items: [] })
  const [searchError, setSearchError] = useState('')
  const searchSessionRef = useRef(null)

  const [plan, setPlan] = useState(null) // { destination, destinationName, options, selectedId }
  const [corridor, setCorridor] = useState({ routeId: null, gems: [], reports: [] })
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
  const trackRef = useRef({ s: 0, seg: 0, offCount: 0, lastRerouteAt: 0, lastSavedStep: -1 })
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
        setPosition(pos)
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

  // Plans routes and shows them; resolves to the chosen option (or null).
  const planTo = useCallback(
    async (destination, destinationName = 'Dropped pin', preferredRouteId = null) => {
      if (!position) return null
      setRouteError('')
      setRouting(true)
      setSelected(null)
      try {
        const options = await planRoutes(position, destination)
        const option = options.find((o) => o.id === preferredRouteId) ?? options[0]
        setPlan({ destination, destinationName, options, selectedId: option.id })
        return option
      } catch (err) {
        setRouteError(err.message)
        setPlan(null)
        return null
      } finally {
        setRouting(false)
      }
    },
    [position],
  )

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

  function startNavigation(option, destination, destinationName) {
    const model = buildNavModel(option)
    const livePos = position && !position.isFallback ? position : null
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
        })
        .catch((err) => setNavError(`Trip not recorded: ${err.message}`))
    }
    setNavError('')
    setSelected(null)
    setQuery('')
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
    try {
      const options = await planRoutes(from, current.destination)
      const option = options[0]
      const model = buildNavModel(option)
      const loc = locate(model, from)
      trackRef.current = { ...trackRef.current, s: loc.s, seg: loc.seg, offCount: 0, lastSavedStep: -1 }
      spokenRef.current = new Set()
      setPlan((p) => p && { ...p, options, selectedId: option.id })
      setNav((n) => n && {
        ...n,
        status: 'active',
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
    setPosition(pos)
    setNavError('')
    const current = nav
    if (!current || current.status !== 'active') return
    const t = trackRef.current
    const loc = locate(current.model, pos, t)
    const onRoute = loc.offRouteM <= OFF_ROUTE_M
    t.offCount = onRoute ? 0 : t.offCount + 1
    if (onRoute) {
      t.s = loc.s
      t.seg = loc.seg
    }
    mapRef.current?.panTo(pos)

    if (distanceM(pos, current.destination) < ARRIVE_M || current.model.total - t.s < ARRIVE_M) {
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
    setNav({ ...current, step })
    announce(step)
    checkGemAlerts(current, t.s)
    // Keep Home's Active route card roughly current without writing on every fix.
    if (step.stepIndex !== t.lastSavedStep || Date.now() - (t.lastSavedAt ?? 0) > TRIP_SAVE_INTERVAL_MS) {
      t.lastSavedStep = step.stepIndex
      t.lastSavedAt = Date.now()
      saveActiveTrip(tripRecord(current, step))
    }
  }

  // Callbacks registered once (map click, GPS watch, URL auto-start) call
  // through this ref so they always reach the current render's functions.
  const latest = useRef({})
  useEffect(() => {
    latest.current = { planTo, startNavigation, handleFix, nav }
  })

  // Create the map once we know where the driver is.
  useEffect(() => {
    if (!position || mapRef.current || !mapDivRef.current) return
    let cancelled = false
    const onAuthFailure = () => setMapError('Google Maps rejected the API key — check its restrictions in Cloud Console.')
    window.addEventListener(AUTH_FAILURE_EVENT, onAuthFailure)
    if (mapsAuthFailed()) onAuthFailure()

    loadGoogleMaps()
      .then((api) => {
        if (cancelled || !mapDivRef.current) return
        const light = document.documentElement.classList.contains('light')
        const map = new api.Map(mapDivRef.current, {
          center: position,
          zoom: 14,
          mapId: MAP_ID,
          colorScheme: light ? 'LIGHT' : 'DARK',
          disableDefaultUI: true,
          zoomControl: true,
          clickableIcons: false,
          gestureHandling: 'greedy',
        })
        map.addListener('click', (e) => {
          if (latest.current.nav) return // no re-planning mid-drive
          latest.current.planTo({ lat: e.latLng.lat(), lng: e.latLng.lng() })
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
  }, [position])

  // Arriving with ?to=… — plan it once the map is up, and start navigating
  // straight away with nav=1.
  useEffect(() => {
    if (!mapReady || !urlPlan.current) return
    const { to, name, routeId, nav: startNav } = urlPlan.current
    urlPlan.current = null
    latest.current.planTo(to, name, routeId).then((option) => {
      if (option && startNav) latest.current.startNavigation(option, to, name)
    })
  }, [mapReady])

  // Live GPS while navigating.
  useEffect(() => {
    if (!navActive) return
    if (!('geolocation' in navigator)) {
      queueMicrotask(() => setNavError('This device has no GPS — navigation needs your live location.'))
      return
    }
    const id = navigator.geolocation.watchPosition(
      (p) => latest.current.handleFix({ lat: p.coords.latitude, lng: p.coords.longitude, isFallback: false }),
      () => setNavError('Live location unavailable — allow location access to navigate.'),
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 15000 },
    )
    return () => navigator.geolocation.clearWatch(id)
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

  // Place suggestions, debounced. Gem matches come from what's already loaded.
  const positionRef = useRef(position)
  useEffect(() => {
    positionRef.current = position
  }, [position])
  useEffect(() => {
    const q = query.trim()
    // Places Autocomplete is billed per request on the browser key, which can't
    // be rate-limited server-side — so search only from 3 characters, and only
    // once typing pauses. (Set a per-day quota on the key in Cloud Console too.)
    if (q.length < MIN_PLACE_QUERY || !mapReady) return
    let cancelled = false
    const timer = setTimeout(async () => {
      try {
        searchSessionRef.current ??= await newSearchSession()
        const near = positionRef.current && { lat: positionRef.current.lat, lng: positionRef.current.lng }
        const items = await searchPlaces(q, near, searchSessionRef.current)
        if (!cancelled) {
          setPlaceResults({ query: q, items })
          setSearchError('')
        }
      } catch (err) {
        if (!cancelled) setSearchError(err.message)
      }
    }, 350)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [query, mapReady])

  const trimmedQuery = query.trim()
  const gemMatches = useMemo(() => {
    if (!trimmedQuery) return []
    const q = trimmedQuery.toLowerCase()
    return gems.filter((g) => g.name.toLowerCase().includes(q)).slice(0, 3)
  }, [gems, trimmedQuery])

  function closeSearch() {
    setQuery('')
    setSearchOpen(false)
    searchSessionRef.current = null // the session ends with a selection
  }

  function handlePickGem(gem) {
    closeSearch()
    setSelected({ type: 'gem', id: gem.id })
    mapRef.current?.panTo({ lat: gem.lat, lng: gem.lng })
  }

  async function handlePickPlace(item) {
    closeSearch()
    try {
      const place = await resolvePlace(item)
      planTo({ lat: place.lat, lng: place.lng }, place.name)
    } catch (err) {
      setRouteError(err.message)
    }
  }

  const visibleGems = useMemo(
    () => gems.filter((g) => activeCategories.size === 0 || activeCategories.has(g.category)),
    [gems, activeCategories],
  )

  const routeGemIds = useMemo(() => new Set((plan ? corridor.gems : []).map((g) => g.id)), [plan, corridor])
  const routeReportIds = useMemo(() => new Set((plan ? corridor.reports : []).map((r) => r.id)), [plan, corridor])

  // The driver's dot: one marker, moved as GPS updates arrive.
  const userMarkerRef = useRef(null)
  useEffect(() => {
    const api = mapsApiRef.current
    if (!mapReady || !api || !position) return
    if (!userMarkerRef.current) {
      const dot = document.createElement('div')
      dot.className = 'map-user-dot'
      dot.setAttribute('aria-label', 'Your location')
      userMarkerRef.current = new api.AdvancedMarkerElement({ map: mapRef.current, position, content: dot, zIndex: 30 })
    } else {
      userMarkerRef.current.position = position
    }
  }, [mapReady, position])

  // Markers: gems, road reports, destination.
  useEffect(() => {
    const map = mapRef.current
    const api = mapsApiRef.current
    if (!mapReady || !map || !api) return
    const markers = []
    const add = (latLng, content, zIndex, onClick) => {
      const marker = new api.AdvancedMarkerElement({ map, position: latLng, content, zIndex })
      if (onClick) {
        content.addEventListener('click', (e) => {
          e.stopPropagation()
          onClick()
        })
      }
      markers.push(marker)
    }

    for (const gem of visibleGems) {
      const onRoute = routeGemIds.has(gem.id)
      const el = pinElement(
        'map-pin' + (onRoute ? ' map-pin-on-route' : ''),
        { background: 'var(--card)', border: `2px solid ${onRoute ? 'var(--amber)' : 'var(--primary)'}` },
        CATEGORY_ICON[gem.category] ?? '📍',
        gem.name,
      )
      add({ lat: gem.lat, lng: gem.lng }, el, onRoute ? 20 : 10, () => setSelected({ type: 'gem', id: gem.id }))
    }

    for (const incident of incidents) {
      const band = severityBand(incident.severity)
      const onRoute = routeReportIds.has(incident.id)
      const el = pinElement(
        'map-pin' + (onRoute ? ' map-pin-on-route' : ''),
        {
          background: 'var(--card)',
          border: `2px solid var(--${band === 'high' ? 'red' : band === 'medium' ? 'amber' : 'blue'})`,
          width: '24px',
          height: '24px',
        },
        INCIDENT_ICON[incident.type] ?? '⚠️',
        reportTypeLabel(incident.type),
      )
      add({ lat: incident.lat, lng: incident.lng }, el, onRoute ? 20 : 10, () =>
        setSelected({ type: 'incident', id: incident.id }),
      )
    }

    if (plan) {
      const dest = document.createElement('div')
      dest.className = 'map-pin-destination'
      dest.setAttribute('aria-label', 'Destination')
      add(plan.destination, dest, 25)
    }

    return () => markers.forEach((m) => (m.map = null))
  }, [mapReady, visibleGems, incidents, routeGemIds, routeReportIds, plan])

  // Route lines: every alternative, the selected one on top and in colour.
  // Tapping a grey alternative selects it. While navigating, only the route
  // being driven is shown.
  useEffect(() => {
    const map = mapRef.current
    const api = mapsApiRef.current
    if (!mapReady || !map || !api || !plan) return
    const lines = plan.options
      .filter((option) => !navActive || option.id === plan.selectedId)
      .map((option) => {
        const isSelected = option.id === plan.selectedId
        const line = new api.Polyline({
          map,
          path: option.path,
          strokeColor: isSelected ? ROUTE_COLOR : ALT_ROUTE_COLOR,
          strokeOpacity: isSelected ? 0.95 : 0.7,
          strokeWeight: isSelected ? 6 : 5,
          zIndex: isSelected ? 2 : 1,
        })
        line.addListener('click', () => setPlan((p) => (p ? { ...p, selectedId: option.id } : p)))
        return line
      })
    return () => lines.forEach((l) => l.setMap(null))
  }, [mapReady, plan, navActive])

  // Frame a new set of routes (not when merely switching between them, and
  // not mid-drive, where the camera follows the driver instead).
  const options = plan?.options
  useEffect(() => {
    const map = mapRef.current
    const api = mapsApiRef.current
    if (!mapReady || !map || !api || !options || latest.current.nav) return
    const bounds = new api.LatLngBounds()
    options.forEach((o) => o.path.forEach((p) => bounds.extend(p)))
    map.fitBounds(bounds, { top: 300, bottom: 40, left: 40, right: 40 })
  }, [mapReady, options])

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

  function handleClearRoute() {
    setPlan(null)
    setCorridor({ routeId: null, gems: [], reports: [] })
    setRouteError('')
  }

  const tooShortForPlaces = trimmedQuery.length < MIN_PLACE_QUERY
  const placesPending = !tooShortForPlaces && placeResults.query !== trimmedQuery && !searchError

  return (
    <div className="map-page">
      <div className="map-canvas" ref={mapDivRef} />

      {(loading || (!mapReady && !mapError)) && <p className="map-status">Loading map…</p>}
      {mapError && <p className="map-status">{mapError}</p>}

      {nav ? (
        <NavigationHud
          step={nav.step}
          status={nav.status}
          destinationName={nav.destinationName}
          muted={muted}
          onToggleMute={toggleMute}
          onEnd={endNavigation}
        />
      ) : (
        <>
          <div className="map-search-bar">
            <Search size={16} color="var(--muted-foreground)" />
            <input
              placeholder="Search for a place or gem, or tap the map…"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                setSearchOpen(true)
              }}
              onFocus={() => setSearchOpen(true)}
              onBlur={() => setSearchOpen(false)}
              onKeyDown={(e) => e.key === 'Escape' && closeSearch()}
              aria-label="Search for a destination"
            />
            {query && (
              <button className="map-search-clear" onMouseDown={(e) => e.preventDefault()} onClick={closeSearch} aria-label="Clear search">
                <X size={14} />
              </button>
            )}
          </div>

          {searchOpen && trimmedQuery && (
            // mousedown is swallowed so picking a result doesn't blur the
            // input (and close the list) before the click lands.
            <div className="map-search-results" onMouseDown={(e) => e.preventDefault()}>
              {gemMatches.map((gem) => (
                <button key={gem.id} className="map-search-result" onClick={() => handlePickGem(gem)}>
                  <span className="map-search-result-icon">{CATEGORY_ICON[gem.category] ?? '📍'}</span>
                  <span>
                    <span className="map-search-result-title">{gem.name}</span>
                    <span className="map-search-result-sub">PathIQ gem · {(gem.distance_m / 1000).toFixed(1)} km away</span>
                  </span>
                </button>
              ))}
              {placeResults.query === trimmedQuery &&
                placeResults.items.map((item) => (
                  <button key={item.id} className="map-search-result" onClick={() => handlePickPlace(item)}>
                    <span className="map-search-result-icon"><MapPin size={15} /></span>
                    <span>
                      <span className="map-search-result-title">{item.title}</span>
                      <span className="map-search-result-sub">{item.subtitle}</span>
                    </span>
                  </button>
                ))}
              {placesPending && <div className="map-search-note">Searching…</div>}
              {searchError && <div className="map-search-note">{searchError}</div>}
              {tooShortForPlaces && gemMatches.length === 0 && <div className="map-search-note">Keep typing…</div>}
              {!tooShortForPlaces && !placesPending && !searchError && gemMatches.length === 0 && placeResults.items.length === 0 && (
                <div className="map-search-note">No places found.</div>
              )}
            </div>
          )}

          <div className="map-filter-row">
            {categories.map((c) => (
              <button
                key={c.value}
                className={'chip' + (activeCategories.has(c.value) ? ' active' : '')}
                onClick={() => toggleCategory(c.value)}
              >
                {CATEGORY_ICON[c.value]} {c.label}
              </button>
            ))}
          </div>

          {(routing || plan || routeError) && (
            <div className="map-route-summary">
              {routing && <span>Planning route…</span>}
              {!routing && routeError && <span className="auth-error" style={{ margin: 0 }}>{routeError}</span>}
              {!routing && selectedRoute && (
                <>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                      {routeLabel(selectedRoute)} · to {plan.destinationName}
                    </div>
                    <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 15, marginTop: 2 }}>
                      {formatDuration(selectedRoute.durationS)} &middot; {(selectedRoute.distanceM / 1000).toFixed(1)} km &middot; road
                      score {selectedRoute.scores.roadQuality}
                    </div>
                    <div style={{ fontSize: 11.5, color: 'var(--muted-foreground)', marginTop: 2 }}>
                      {corridor.gems.length} gem{corridor.gems.length === 1 ? '' : 's'} and {corridor.reports.length} road report
                      {corridor.reports.length === 1 ? '' : 's'} along the way, highlighted in amber.
                    </div>
                    {plan.options.length > 1 && (
                      <div className="map-route-options">
                        {plan.options.map((o) => (
                          <button
                            key={o.id}
                            className={'chip' + (o.id === plan.selectedId ? ' active' : '')}
                            onClick={() => setPlan((p) => ({ ...p, selectedId: o.id }))}
                          >
                            {routeLabel(o)} · {formatDuration(o.durationS)}
                          </button>
                        ))}
                      </div>
                    )}
                    <div className="map-route-actions">
                      <button
                        className="map-route-start"
                        onClick={() => startNavigation(selectedRoute, plan.destination, plan.destinationName)}
                      >
                        <Play size={13} fill="currentColor" /> Start
                      </button>
                      <Link
                        className="map-route-compare"
                        to={`/app/routes?${new URLSearchParams({
                          to: `${plan.destination.lat.toFixed(5)},${plan.destination.lng.toFixed(5)}`,
                          name: plan.destinationName,
                        })}`}
                      >
                        Compare route scores →
                      </Link>
                    </div>
                  </div>
                  <button className="map-route-clear" onClick={handleClearRoute} aria-label="Clear route">
                    <X size={14} />
                  </button>
                </>
              )}
            </div>
          )}
        </>
      )}

      {nav && gemAlert && (
        <div className={'nav-gem-alert' + (gemAlert.type === 'passed' ? ' passed' : '')} role="status" aria-live="polite">
          <span className="nav-gem-alert-icon">{CATEGORY_ICON[gemAlert.gem.category] ?? '📍'}</span>
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

      {!nav && !loading && position?.isFallback && (
        <div className="map-location-notice">
          <LocateOff size={14} />
          <span>
            Location is off, so this shows central Nairobi. Turn it on to plan from where you are and to navigate.{' '}
            <Link to="/privacy">How we use location</Link>
          </span>
        </div>
      )}

      {(error || navError) && (
        <p className="auth-error map-floating-error" style={{ top: nav ? 124 : plan || routing ? 256 : 108 }}>
          {navError || error}
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
                <div style={{
                  width: 44, height: 44, borderRadius: 12, background: 'var(--secondary)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 20,
                }}>
                  {CATEGORY_ICON[selectedGem.category] ?? '📍'}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 16 }}>{selectedGem.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--muted-foreground)', marginTop: 2 }}>
                    {selectedGem.category} · {(selectedGem.distance_m / 1000).toFixed(1)} km away
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
                    <button
                      className="map-route-here-btn"
                      disabled={routing}
                      onClick={() => planTo({ lat: selectedGem.lat, lng: selectedGem.lng }, selectedGem.name)}
                    >
                      <Navigation2 size={13} /> Route here
                    </button>
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
              <div>
                <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 16 }}>
                  {reportTypeLabel(selectedIncident.type)} — severity {selectedIncident.severity}/5
                </div>
                <div style={{ fontSize: 12, color: 'var(--muted-foreground)', marginTop: 4 }}>
                  {(selectedIncident.distance_m / 1000).toFixed(1)} km away
                  {selectedIncident.description ? ` · ${selectedIncident.description}` : ''}
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
