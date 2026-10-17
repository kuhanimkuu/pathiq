import { useEffect, useMemo, useRef, useState } from 'react'
import { planRoutes, routeLabel } from '../../lib/routePlanning'
import { buildNavModel, locate, progress, distanceM, spokenDistance, headingAt, pointAt } from '../../lib/navigation'
import { itemsAhead, briefing } from '../../lib/routeAhead'
import { reportTypeLabel } from '../../lib/roadReports'
import { saveActiveTrip, clearActiveTrip, loadActiveTrip } from '../../lib/activeTrip'
import { startTrip, endTrip, recordReroute, recordGemEvent } from '../../lib/trips'
import { detourMinutes } from '../../lib/alertPrefs'
import { isTopRated } from '../../lib/googlePlaces'
import { holdWakeLock, notifyIfHidden } from '../../lib/driveAssist'
import { createTripCollector } from '../../lib/locationContribution'
import { cameraAhead, canvasOverflow } from './camera'

const OFF_ROUTE_M = 50 // further than this from the line counts as off-route
const OFF_ROUTE_FIXES = 3 // …for this many GPS fixes in a row, then reroute
const REROUTE_COOLDOWN_MS = 15_000
const ARRIVE_M = 40
const TRIP_SAVE_INTERVAL_MS = 10_000
const GEM_AHEAD_M = 600 // "approaching" alert when a gem is this close ahead on the route
const GEM_PASSED_MIN_M = 20 // "just passed" alert once it's this far behind…
const GEM_PASSED_MAX_M = 400 // …and not later than this
const GEM_ALERT_MS = 10_000
const REPORT_WARN_M = 2000 // early warning for a road report ahead: time to take another road
const REPORT_NEAR_M = 300 // and a reminder just before it (severity 3+)
const TRAFFIC_WARN_M = 1500 // spoken warning for slow traffic this far ahead
const MOVING_MPS = 1.5 // GPS heading only means something above walking pace
const MUTE_KEY = 'pathiq-nav-muted'

function readMuted() {
  try {
    return localStorage.getItem(MUTE_KEY) === '1'
  } catch {
    return false
  }
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

// Navigation mode: turn-by-turn along a chosen route, with voice, rerouting,
// gem and road-report alerts, trip recording, and (if the driver opted in)
// anonymous road-speed contributions. The map page feeds it GPS fixes with
// `onFix` and shows its state; everything about driving lives here.
//   nav  { status: 'active' | 'rerouting' | 'arrived', model, step, routeId, routeLabel, roadQuality,
//          destination, destinationName, stops, stopsReached, tripId, reroutes, startedAt }
export default function useTurnByTurn({
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
  onRerouted,
  onTripStarted,
}) {
  const [nav, setNav] = useState(null)
  const [gemAlert, setGemAlert] = useState(null) // { type: 'approaching' | 'passed', gem, aheadM, detourMin, key }
  const [reportAlert, setReportAlert] = useState(null) // { report, aheadM, key }
  // While navigating the camera follows the driver, until they drag the map
  // to look along the route; "Re-centre" turns it back on.
  const [follow, setFollow] = useState(true)
  const [navError, setNavError] = useState('')
  const [muted, setMuted] = useState(readMuted)
  // Where to draw the driver and which way they face: snapped onto the route
  // while on it, so the arrow sits on the line and turns with the road.
  const [driver, setDriver] = useState(null) // { pos, heading }
  const alertedRef = useRef(new Set())
  const trackRef = useRef({ s: 0, seg: 0, offCount: 0, lastRerouteAt: 0, lastSavedStep: -1 })
  const spokenRef = useRef(new Set())
  const collectorRef = useRef(null) // road-data contributions for this trip, when opted in
  const navActive = nav != null && nav.status !== 'arrived'

  // Queued, so an alert doesn't cut off the turn just announced; `interrupt`
  // for what can't wait (the turn right ahead, rerouting).
  function speak(text, { interrupt = false } = {}) {
    if (muted || !('speechSynthesis' in window)) return
    if (interrupt) window.speechSynthesis.cancel()
    window.speechSynthesis.speak(new SpeechSynthesisUtterance(text))
  }

  // The camera while following: a little ahead of the driver, who sits in
  // the lower part of the heading-up map (./camera.js).
  function followCamera(pos, heading, options) {
    cameraAhead(mapRef.current, pos, heading, options)
  }

  // What's ahead of `s` on the current route (lib/routeAhead.js).
  function aheadOf(current, s) {
    const onThisRoute = (id) => id === current.routeId
    const legEnds = current.model.legEnds
    return itemsAhead({
      model: current.model,
      s,
      traffic: current.traffic,
      hazards: layers.reports && selectedRoute?.id === current.routeId ? selectedRoute.hazards ?? [] : [],
      places: [
        ...(onThisRoute(corridor.routeId) ? corridor.gems : []),
        ...(onThisRoute(googleRoute.routeId) ? googleRoutePlaces : []),
      ],
      stops: current.stops
        .slice(current.stopsReached)
        .map((stop, i) => ({ name: stop.name, atS: legEnds[current.stopsReached + i] })),
    })
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

  function finishCollecting() {
    collectorRef.current?.finish()
    collectorRef.current = null
  }

  // `trip` is { destination, destinationName, stops } — stops in route order.
  function start(option, { destination, destinationName, stops = [] }) {
    const model = buildNavModel(option)
    const loc = livePos ? locate(model, livePos) : { s: 0, seg: 0 }
    trackRef.current = { s: loc.s, seg: loc.seg, offCount: 0, lastRerouteAt: 0, lastSavedStep: -1 }
    spokenRef.current = new Set()
    const step = livePos ? progress(model, loc.s) : null
    const heading = headingAt(model, loc.s)
    setDriver(livePos ? { pos: pointAt(model, loc.s), heading } : null)
    // Resuming continues the same trip rather than starting another.
    const saved = loadActiveTrip()
    const resumed = saved?.tripId && distanceM(saved.destination, destination) < 50 ? saved : null
    const next = {
      status: 'active',
      model,
      step,
      routeId: option.id,
      routeLabel: routeLabel(option),
      roadQuality: option.scores.roadQuality,
      traffic: option.traffic ?? [],
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
    setReportAlert(null)
    setNav(next)
    if (!resumed && userId) {
      startTrip(userId, { origin: livePos ?? position, destination, destinationName, option })
        .then((tripId) => {
          setNav((n) => n && { ...n, tripId })
          saveActiveTrip(tripRecord({ ...next, tripId }, step))
          onTripStarted?.()
        })
        .catch((err) => setNavError(`Trip not recorded: ${err.message}`))
    }
    finishCollecting()
    if (profile?.location_sharing_at) {
      collectorRef.current = createTripCollector({ origin: livePos, destination })
    }
    setNavError('')
    saveActiveTrip(tripRecord(next, step))
    if ('speechSynthesis' in window) window.speechSynthesis.cancel()
    speak(`Starting route to ${destinationName}. ${briefing(aheadOf(next, loc.s))}`)
    setFollow(true)
    if (livePos) followCamera(livePos, heading, { zoom: true })
  }

  // "What's ahead", read out on request.
  function readAhead() {
    if (!nav?.step) return
    speak(briefing(aheadOf(nav, nav.step.s)), { interrupt: true })
  }

  function end() {
    if (nav?.tripId && nav.status !== 'arrived') {
      endTrip(nav.tripId, { arrived: false, reroutes: nav.reroutes }).catch(() => {})
    }
    finishCollecting()
    setNav(null)
    setDriver(null)
    setNavError('')
    setGemAlert(null)
    setReportAlert(null)
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
      speak(`${step.nextInstruction}.`, { interrupt: true })
    }
  }

  async function reroute(from, current) {
    trackRef.current.lastRerouteAt = Date.now()
    const reroutes = current.reroutes + 1
    setNav((n) => n && { ...n, status: 'rerouting', reroutes })
    if (current.tripId) recordReroute(current.tripId, reroutes).catch(() => {})
    speak('Rerouting.', { interrupt: true })
    // Stops already reached are done; the new route goes through the rest.
    const stops = current.stops.slice(current.stopsReached)
    try {
      const options = await planRoutes(from, current.destination, stops)
      const option = options[0]
      const model = buildNavModel(option)
      const loc = locate(model, from)
      trackRef.current = { ...trackRef.current, s: loc.s, seg: loc.seg, offCount: 0, lastSavedStep: -1 }
      spokenRef.current = new Set()
      onRerouted({ from, stops, options, option })
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
        traffic: option.traffic ?? [],
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
    if (!alertPrefs.enabled) return
    // PathIQ gems first; Google's places only when top-rated (lib/googlePlaces).
    const candidates = [
      ...(corridor.routeId === current.routeId ? corridor.gems : []),
      ...(googleRoute.routeId === current.routeId ? googleRoutePlaces.filter(isTopRated) : []),
    ]
    for (const gem of candidates) {
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
      const google = gem.source === 'google'
      // Trip events are for PathIQ gems (they reference the gems table).
      if (current.tripId && !google) recordGemEvent(current.tripId, gem.id, type).catch(() => {})
      const message =
        type === 'approaching'
          ? google
            ? `Top rated on Google ahead: ${gem.name}, ${gem.rating} stars, in ${spokenDistance(ahead)}. About ${detourMin} minute detour.`
            : `Hidden gem ahead: ${gem.name}, in ${spokenDistance(ahead)}. About ${detourMin} minute detour.`
          : google
            ? `You just passed ${gem.name}.`
            : `You just passed ${gem.name}. You can save it for later.`
      speak(message)
      if (profile?.notifications_on !== false) {
        notifyIfHidden(type === 'approaching' ? 'Hidden gem ahead' : 'You just passed a gem', message)
      }
      return // one alert at a time
    }
  }

  // Road reports ahead: an early warning while there's still time to choose
  // another road, and a reminder just before it for the serious ones. Once
  // each per report per trip.
  function checkReportAlerts(current, s) {
    if (!layers.reports || selectedRoute?.id !== current.routeId) return
    for (const h of selectedRoute.hazards ?? []) {
      const ahead = h.routeFraction * current.model.total - s
      if (ahead <= 0) continue
      let type = null
      if (ahead <= REPORT_NEAR_M && h.severity >= 3) type = 'near'
      else if (ahead <= REPORT_WARN_M && ahead > REPORT_NEAR_M) type = 'early'
      if (!type || alertedRef.current.has(`r${h.id}:${type}`)) continue
      alertedRef.current.add(`r${h.id}:${type}`)
      if (type === 'near') alertedRef.current.add(`r${h.id}:early`)
      setReportAlert({ report: h, aheadM: ahead, key: `r${h.id}:${type}` })
      const what = reportTypeLabel(h.type).toLowerCase()
      const message =
        type === 'early'
          ? `Heads up: ${what} reported ${spokenDistance(ahead)} ahead, severity ${h.severity}.`
          : `${reportTypeLabel(h.type)} ahead in ${spokenDistance(ahead)}.`
      speak(message)
      if (profile?.notifications_on !== false) notifyIfHidden('Road report ahead', message)
      return // one alert at a time
    }
  }

  // Slow traffic ahead: one spoken heads-up per stretch, early enough to
  // expect it. (It's always on screen in the "Ahead" strip.)
  function checkTrafficAlerts(current, s) {
    const next = aheadOf(current, s).find((i) => i.kind === 'traffic' && i.aheadM > 0 && i.aheadM <= TRAFFIC_WARN_M)
    if (!next || alertedRef.current.has(next.key)) return
    alertedRef.current.add(next.key)
    speak(
      `Heads up: ${next.jam ? 'heavy' : 'slow'} traffic in ${spokenDistance(next.aheadM)}, for about ${spokenDistance(next.lengthM)}.`,
    )
  }

  // A live GPS fix while navigating.
  function onFix(pos) {
    const current = nav
    if (!current || current.status !== 'active') return
    collectorRef.current?.add(pos)
    setNavError('')
    const t = trackRef.current
    const loc = locate(current.model, pos, t)
    const onRoute = loc.offRouteM <= OFF_ROUTE_M
    t.offCount = onRoute ? 0 : t.offCount + 1
    if (onRoute) {
      t.s = loc.s
      t.seg = loc.seg
    }
    // On the route: the road's direction (steady, and right even when stopped).
    // Off it: the GPS heading when moving, else the last one.
    const gpsHeading = pos.speed > MOVING_MPS && Number.isFinite(pos.heading) ? pos.heading : null
    const heading = onRoute ? headingAt(current.model, t.s) : gpsHeading ?? driver?.heading ?? null
    const drawAt = onRoute ? pointAt(current.model, t.s) : pos
    setDriver({ pos: drawAt, heading })
    if (follow) followCamera(drawAt, heading)

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
      setReportAlert(null)
      clearActiveTrip()
      finishCollecting()
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
    checkReportAlerts(current, t.s)
    checkTrafficAlerts(current, t.s)
    checkGemAlerts(current, t.s)
    // Keep the Resume card roughly current without writing on every fix.
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

  // Leaving the map mid-trip still sends what's safe to send.
  useEffect(() => () => collectorRef.current?.finish(), [])

  useEffect(() => {
    if (navActive && !('geolocation' in navigator)) {
      queueMicrotask(() => setNavError('This device has no GPS — navigation needs your live location.'))
    }
  }, [navActive])

  // Keep the screen on while navigating.
  useEffect(() => {
    if (!navActive) return
    return holdWakeLock()
  }, [navActive])

  // Alerts clear themselves — nothing to tap while driving.
  const gemAlertKey = gemAlert?.key
  useEffect(() => {
    if (!gemAlertKey) return
    const timer = setTimeout(() => setGemAlert((a) => (a?.key === gemAlertKey ? null : a)), GEM_ALERT_MS)
    return () => clearTimeout(timer)
  }, [gemAlertKey])
  const reportAlertKey = reportAlert?.key
  useEffect(() => {
    if (!reportAlertKey) return
    const timer = setTimeout(() => setReportAlert((a) => (a?.key === reportAlertKey ? null : a)), GEM_ALERT_MS)
    return () => clearTimeout(timer)
  }, [reportAlertKey])

  // Mid-drive: the whole route at once (to see the traffic ahead), or back to
  // following the driver.
  function showOverview() {
    const map = mapRef.current
    const api = mapsApiRef.current
    const path = nav?.model.path ?? selectedRoute?.path
    if (!map || !api || !path?.length) return
    setFollow(false)
    const bounds = new api.LatLngBounds()
    path.forEach((p) => bounds.extend(p))
    // Clear of the banner above and the footer stack below (taller on phones),
    // and of the part of the heading-up canvas that's off screen.
    const over = canvasOverflow()
    const top = (document.querySelector('.nav-top')?.offsetHeight ?? 110) + 32 + over.y
    const bottom = (document.querySelector('.nav-bottom')?.offsetHeight ?? 140) + 32 + over.y
    map.fitBounds(bounds, { top, bottom, left: 40 + over.x, right: 40 + over.x })
  }
  function recentre() {
    setFollow(true)
    followCamera(driver?.pos ?? livePos, driver?.heading ?? null, { zoom: true })
  }

  // Everything ahead, for the "Ahead" strip and list; recomputed per fix.
  const s = nav?.step?.s
  const ahead = useMemo(
    () => (nav && nav.status !== 'arrived' && s != null ? aheadOf(nav, s) : []),
    // aheadOf reads the route's data, all listed here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [nav, s, layers.reports, selectedRoute, corridor, googleRoute, googleRoutePlaces],
  )

  return {
    nav,
    navActive,
    driver,
    ahead,
    readAhead,
    gemAlert,
    reportAlert,
    follow,
    setFollow,
    navError,
    setNavError,
    muted,
    toggleMute,
    start,
    end,
    onFix,
    showOverview,
    recentre,
  }
}
