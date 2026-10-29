import { useEffect, useMemo, useRef, useState } from 'react'
import { planRoutes, routeLabel } from '../../lib/routePlanning'
import { buildNavModel, locate, progress, distanceM, spokenDistance, headingAt, pointAt } from '../../lib/navigation'
import { itemsAhead, briefing, fetchAiBriefing } from '../../lib/routeAhead'
import { reportTypeLabel, submitRoadReport, voteRoadReport, fetchReportsToConfirm } from '../../lib/roadReports'
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
const BRIEFING_REUSE_MS = 60_000 // asked again within this, the last briefing is read again
const BRIEFING_SHOW_MS = 15_000 // how long a new briefing stays on screen under the banner
const MUTE_KEY = 'pathiq-nav-muted'
// "Still there?" about a report the driver has just passed: asked once it's
// this far behind them (they've seen it), not after this far, and shown for
// this long. The list of reports to ask about is refreshed this often.
const CONFIRM_AFTER_M = 25
const CONFIRM_BEFORE_M = 300
const CONFIRM_SHOW_MS = 15_000
const CONFIRM_REFRESH_MS = 3 * 60_000
const REPORT_NOTICE_MS = 6000

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
    mode: n.mode,
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
//          destination, destinationName, stops, stopsReached, tripId, reroutes, startedAt, mode }
//
// The camera: 'follow' (heading-up, a little ahead of the driver), 'free'
// (the driver moved the map: it stays turned the way it was, like Google
// Maps, so the turn arrows keep pointing the way they did), or 'overview'
// (the whole route, north-up). `mapHeading` is which way the map faces.
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
  onReportsChanged,
}) {
  const [nav, setNav] = useState(null)
  const [gemAlert, setGemAlert] = useState(null) // { type: 'approaching' | 'passed', gem, aheadM, detourMin, key }
  const [reportAlert, setReportAlert] = useState(null) // { report, aheadM, key }
  // While navigating the camera follows the driver, until they drag the map
  // to look along the route ('free') or ask for the overview; "Re-centre"
  // turns it back on.
  const [camera, setCamera] = useState({ mode: 'follow', heading: null }) // heading: held while 'free'
  const follow = camera.mode === 'follow'
  // Reports on the route to ask "still there?" about, and the one being asked.
  const [toConfirm, setToConfirm] = useState([]) // [{ id, type, severity, live, atS }]
  const [confirmPrompt, setConfirmPrompt] = useState(null) // { report, key }
  const [reportNotice, setReportNotice] = useState(null) // { text, key, error? }
  const [reporting, setReporting] = useState(false)
  const [navError, setNavError] = useState('')
  const [muted, setMuted] = useState(readMuted)
  // Where to draw the driver and which way they face: snapped onto the route
  // while on it, so the arrow sits on the line and turns with the road.
  const [driver, setDriver] = useState(null) // { pos, heading }
  // The latest spoken briefing of the road ahead: { text, ai, at, fresh }, or
  // { loading: true } while PathIQ AI writes one. `fresh` while it's on screen.
  const [briefingState, setBriefingState] = useState(null)
  const briefingSeqRef = useRef(0)
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
      mode: option.mode ?? 'drive',
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
    setConfirmPrompt(null)
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
    speak(`Starting route to ${destinationName}.`)
    requestBriefing(next, loc.s)
    setCamera({ mode: 'follow', heading: null })
    if (livePos) followCamera(livePos, heading, { zoom: true })
  }

  // A briefing of the road ahead: PathIQ AI's when it answers in time,
  // otherwise the plain one (lib/routeAhead.js), so there's always one.
  // Spoken, and shown under the banner for a while.
  async function requestBriefing(current, s) {
    const seq = ++briefingSeqRef.current
    const items = aheadOf(current, s)
    const remainingM = Math.max(0, current.model.total - s)
    setBriefingState({ loading: true })
    const text = await fetchAiBriefing({
      items,
      destinationName: current.destinationName,
      remainingM,
      remainingS: current.model.total > 0 ? (current.model.durationS * remainingM) / current.model.total : 0,
    })
    if (seq !== briefingSeqRef.current) return // a newer one was asked for, or the trip ended
    const result = { text: text ?? briefing(items), ai: text != null, at: Date.now(), fresh: true }
    setBriefingState(result)
    speak(result.text)
  }

  // "What's ahead", read out on request: the briefing from the last minute
  // again, or a new one.
  function readAhead() {
    if (!nav?.step || briefingState?.loading) return
    if (briefingState?.text && Date.now() - briefingState.at < BRIEFING_REUSE_MS) {
      setBriefingState({ ...briefingState, fresh: true })
      speak(briefingState.text, { interrupt: true })
      return
    }
    if ('speechSynthesis' in window) window.speechSynthesis.cancel()
    requestBriefing(nav, nav.step.s)
  }

  function end() {
    if (nav?.tripId && nav.status !== 'arrived') {
      endTrip(nav.tripId, { arrived: false, reroutes: nav.reroutes }).catch(() => {})
    }
    finishCollecting()
    setNav(null)
    setDriver(null)
    briefingSeqRef.current++
    setBriefingState(null)
    setNavError('')
    setGemAlert(null)
    setReportAlert(null)
    setConfirmPrompt(null)
    setToConfirm([])
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
      const options = await planRoutes(from, current.destination, stops, current.mode)
      const option = options[0]
      const model = buildNavModel(option)
      const loc = locate(model, from)
      trackRef.current = { ...trackRef.current, s: loc.s, seg: loc.seg, offCount: 0, lastSavedStep: -1 }
      spokenRef.current = new Set()
      onRerouted({ from, stops, options, option })
      requestBriefing({ ...current, model, stops, stopsReached: 0, routeId: option.id, traffic: option.traffic ?? [] }, loc.s)
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

  // "Still there?" once the driver has just passed a report (one at a time,
  // once per report per trip). Not spoken: it's a single tap, or ignored.
  function checkConfirmPrompts(s) {
    if (confirmPrompt) return
    const passed = toConfirm.find(
      (r) => s - r.atS >= CONFIRM_AFTER_M && s - r.atS <= CONFIRM_BEFORE_M && !alertedRef.current.has(`c${r.id}`),
    )
    if (!passed) return
    alertedRef.current.add(`c${passed.id}`)
    setConfirmPrompt({ report: passed, key: `c${passed.id}` })
  }

  async function answerPrompt(stillThere) {
    const prompt = confirmPrompt
    if (!prompt) return
    setConfirmPrompt(null)
    setToConfirm((list) => list.filter((r) => r.id !== prompt.report.id))
    try {
      const result = await voteRoadReport(prompt.report.id, stillThere)
      setReportNotice({
        text: result.ended ? 'Thanks. It has been taken off the map.' : 'Thanks, that helps other drivers.',
        key: Date.now(),
      })
      if (result.ended || result.live !== prompt.report.live) onReportsChanged?.()
    } catch (err) {
      setReportNotice({ text: `Couldn't send that: ${err.message}`, key: Date.now(), error: true })
    }
  }

  // The driver reports something where they are now. It shows for everyone
  // once PathIQ is sure enough (the live_road_reports migration).
  async function reportHere(type) {
    const at = driver?.pos ?? livePos
    if (!at) {
      setReportNotice({ text: 'Your location is needed to report.', key: Date.now(), error: true })
      return
    }
    setReporting(true)
    try {
      const result = await submitRoadReport({ type, lat: at.lat, lng: at.lng })
      // Don't ask them about their own report as they pass it.
      alertedRef.current.add(`c${result.id}`)
      const what = reportTypeLabel(type)
      setReportNotice({
        key: Date.now(),
        text: result.live
          ? `${what} reported. It's live for drivers around you.`
          : result.merged
            ? `${what}: added to what other drivers reported here.`
            : `${what} reported. Others see it once another driver or live traffic backs it up.`,
      })
      speak('Reported. Thank you.')
      if (result.live) onReportsChanged?.()
    } catch (err) {
      setReportNotice({ text: `Couldn't report: ${err.message}`, key: Date.now(), error: true })
    } finally {
      setReporting(false)
    }
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
    checkConfirmPrompts(t.s)
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

  // A new briefing shows under the banner for a while, then stays in the Ahead list.
  const briefingFreshAt = briefingState?.fresh ? briefingState.at : null
  useEffect(() => {
    if (!briefingFreshAt) return
    const timer = setTimeout(() => setBriefingState((b) => (b?.at === briefingFreshAt ? { ...b, fresh: false } : b)), BRIEFING_SHOW_MS)
    return () => clearTimeout(timer)
  }, [briefingFreshAt])

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
    setCamera({ mode: 'overview', heading: null })
    // A vector map is turned and tilted while following: flat and north-up first.
    cancelAnimationFrame(map.__pathiqGlide ?? 0)
    if (map.getRenderingType?.() === 'VECTOR') map.moveCamera({ heading: 0, tilt: 0 })
    const bounds = new api.LatLngBounds()
    path.forEach((p) => bounds.extend(p))
    // Clear of the banner above and the footer stack below (taller on phones),
    // and of the part of the heading-up canvas that's off screen.
    const over = canvasOverflow()
    const top = (document.querySelector('.nav-top')?.offsetHeight ?? 110) + 32 + over.y
    const bottom = (document.querySelector('.trip-card')?.offsetHeight ?? 140) + 32 + over.y
    map.fitBounds(bounds, { top, bottom, left: 40 + over.x, right: 40 + over.x })
  }
  function recentre() {
    setCamera({ mode: 'follow', heading: null })
    followCamera(driver?.pos ?? livePos, driver?.heading ?? null, { zoom: true })
  }
  // The driver moved the map: stop following, but keep facing the same way.
  function freeLook() {
    setCamera((c) => (c.mode === 'follow' ? { mode: 'free', heading: driver?.heading ?? null } : c))
  }
  // The driver twisted the map with two fingers (`deg` clockwise): it stops
  // following and stays turned the way they left it.
  function twist(deg) {
    setCamera((c) => {
      const from = c.mode === 'free' ? c.heading : c.mode === 'follow' ? driver?.heading : 0
      return { mode: 'free', heading: ((((from ?? 0) - deg) % 360) + 360) % 360 }
    })
  }
  const mapHeading = !navActive
    ? null
    : camera.mode === 'follow'
      ? driver?.heading ?? null
      : camera.mode === 'free'
        ? camera.heading
        : null

  // Reports on this route to ask about: whenever the route changes, and
  // every few minutes in case drivers have reported something new.
  const confirmModel = navActive ? nav.model : null
  useEffect(() => {
    if (!confirmModel) return
    let cancelled = false
    const load = () =>
      fetchReportsToConfirm(confirmModel.path)
        .then((rows) => !cancelled && setToConfirm(rows.map((r) => ({ ...r, atS: r.route_fraction * confirmModel.total }))))
        .catch(() => {}) // a convenience: navigation works without it
    load()
    const timer = setInterval(load, CONFIRM_REFRESH_MS)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [confirmModel])
  const promptKey = confirmPrompt?.key
  useEffect(() => {
    if (!promptKey) return
    const timer = setTimeout(() => setConfirmPrompt((p) => (p?.key === promptKey ? null : p)), CONFIRM_SHOW_MS)
    return () => clearTimeout(timer)
  }, [promptKey])
  const noticeKey = reportNotice?.key
  useEffect(() => {
    if (!noticeKey) return
    const timer = setTimeout(() => setReportNotice((n) => (n?.key === noticeKey ? null : n)), REPORT_NOTICE_MS)
    return () => clearTimeout(timer)
  }, [noticeKey])

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
    briefing: briefingState,
    readAhead,
    gemAlert,
    reportAlert,
    follow,
    camera: camera.mode,
    mapHeading,
    freeLook,
    twist,
    navError,
    setNavError,
    muted,
    toggleMute,
    start,
    end,
    onFix,
    showOverview,
    recentre,
    confirmPrompt,
    answerPrompt,
    dismissPrompt: () => setConfirmPrompt(null),
    reportHere,
    reporting,
    reportNotice,
  }
}
