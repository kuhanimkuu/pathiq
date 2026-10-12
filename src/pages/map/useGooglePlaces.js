import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { fetchGooglePlacesNearby, fetchGooglePlacesAlongRoute, withoutDuplicates } from '../../lib/googlePlaces'
import { buildNavModel, snapToRoute, distanceM } from '../../lib/navigation'
import { corridorForDetour, ALERT_CATEGORIES } from '../../lib/alertPrefs'

const GOOGLE_AROUND_ME_M = 5000 // Google's places around the driver: this far out
const GOOGLE_VIEW_MIN_ZOOM = 9 // and for the area on screen from about county level in
const GOOGLE_VIEW_SETTLE_MS = 700 // …once the map has stopped moving this long
const GOOGLE_PAUSE_MS = 5 * 60 * 1000 // after hitting the search limit, wait this long
const GEM_ROUTE_DEFAULT_M = 400 // gem corridor when gem alerts are off (as routePlanning.js)

// Google's places, a second tier under PathIQ gems (lib/googlePlaces):
// popular ones near the driver and across the area on screen, and ones along
// the selected route. PathIQ gems win where both have the same place.
//   returns { googleRoute: { routeId, places }, googleRoutePlaces, googleGems }
export default function useGooglePlaces({ session, position, view, plan, selectedRoute, alertPrefs, pathiqGems, onPaused }) {
  const [googleNearby, setGoogleNearby] = useState([])
  const [googleRoute, setGoogleRoute] = useState({ routeId: null, places: [] })
  const googleAreasRef = useRef([]) // { center, radiusM } whose Google places loaded this session
  const googlePendingRef = useRef([]) // areas being fetched now
  const googlePausedUntilRef = useRef(0) // after hitting the rate limit
  const googleRouteCache = useRef(new Map()) // polyline → places, this session only
  const onPausedRef = useRef(onPaused)
  useEffect(() => {
    onPausedRef.current = onPaused
  })

  // Around the driver, and for the area on screen as they browse, like
  // Google Maps: zoomed out, the most popular places across the whole view
  // (one search covers up to 50 km); zoomed in, another search fills in the
  // detail. Each search is billed, so an area already searched at about this
  // zoom isn't searched again. Results add up as they move around. An area
  // only counts as done once its search succeeds, so a refused or failed one
  // is tried again next time it's on screen.
  const fetchGoogleAround = useCallback((center, radiusM) => {
    const area = { center, radiusM }
    // Same area, searched at a similar scale (so zooming in still adds detail).
    const covers = (a) => distanceM(a.center, center) < radiusM / 2 && a.radiusM <= radiusM * 2.5
    if (googleAreasRef.current.some(covers) || googlePendingRef.current.some(covers)) return
    if (Date.now() < googlePausedUntilRef.current) return
    googlePendingRef.current.push(area)
    fetchGooglePlacesNearby(center, radiusM).then(({ places, ok, limited }) => {
      googlePendingRef.current = googlePendingRef.current.filter((a) => a !== area)
      if (limited) {
        googlePausedUntilRef.current = Date.now() + GOOGLE_PAUSE_MS
        onPausedRef.current?.()
        return
      }
      if (!ok) return
      googleAreasRef.current.push(area)
      setGoogleNearby((prev) => {
        const seen = new Set(prev.map((p) => p.id))
        return [...prev, ...places.filter((p) => !seen.has(p.id))]
      })
    })
  }, [])
  useEffect(() => {
    if (session && position) fetchGoogleAround(position, GOOGLE_AROUND_ME_M)
  }, [session, position, fetchGoogleAround])
  // Once the map has settled for a moment, so a run of pans costs one search.
  useEffect(() => {
    if (!session || !view || view.zoom < GOOGLE_VIEW_MIN_ZOOM) return
    const timer = setTimeout(() => fetchGoogleAround(view.center, view.radiusM), GOOGLE_VIEW_SETTLE_MS)
    return () => clearTimeout(timer)
  }, [session, view, fetchGoogleAround])

  useEffect(() => {
    const polyline = selectedRoute?.encodedPolyline
    if (!polyline) return
    let cancelled = false
    const corridorM = alertPrefs.enabled ? corridorForDetour(alertPrefs.maxDetourMin) : GEM_ROUTE_DEFAULT_M
    const cached = googleRouteCache.current.get(polyline)
    const load = cached
      ? Promise.resolve(cached)
      : fetchGooglePlacesAlongRoute(polyline, ALERT_CATEGORIES).then(({ places, ok }) => {
          if (ok) googleRouteCache.current.set(polyline, places)
          return places
        })
    load.then((rows) => {
      if (cancelled) return
      const model = buildNavModel(selectedRoute)
      const places = rows
        .map((p) => {
          const at = snapToRoute(model, p)
          return { ...p, distance_from_route_m: at.offRouteM, route_fraction: at.s / model.total }
        })
        .filter((p) => p.distance_from_route_m <= corridorM)
      setGoogleRoute({ routeId: selectedRoute.id, places })
    })
    return () => {
      cancelled = true
    }
  }, [selectedRoute, alertPrefs])

  // Google places that aren't PathIQ gems already, nearest-tier merged.
  const googleRoutePlaces = useMemo(
    () => (plan && googleRoute.routeId === selectedRoute?.id ? withoutDuplicates(googleRoute.places, pathiqGems) : []),
    [plan, googleRoute, selectedRoute, pathiqGems],
  )
  const googleGems = useMemo(() => {
    const onRoute = new Set(googleRoutePlaces.map((p) => p.id))
    return [...googleRoutePlaces, ...withoutDuplicates(googleNearby, pathiqGems).filter((p) => !onRoute.has(p.id))]
  }, [googleRoutePlaces, googleNearby, pathiqGems])

  return { googleRoute, googleRoutePlaces, googleGems }
}
