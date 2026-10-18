// "Ahead on your route": what's coming up between the driver and the
// destination, from data PathIQ already has for the route — Google's live
// traffic on it, PathIQ road reports, gems and facilities along it (PathIQ's
// and Google's), and the stops on the way. Shown while driving and read out
// at the start, so the driver knows what the road holds before they reach it.

import { supabase } from './supabase'
import { reportTypeLabel } from './roadReports'
import { isTopRated } from './googlePlaces'
import { formatDistance, spokenDistance } from './navigation'

const FACILITY_CATEGORIES = new Set(['fuel', 'facilities'])
const GOOGLE_MAX_OFF_ROUTE_M = 400 // further off than this, Google's places aren't "on your route"
const PRIORITY_WITHIN_M = 3000 // traffic, reports and stops this close outrank nearer places

// Every item ahead of distance `s` on the route, nearest first:
//   { kind: 'traffic' | 'report' | 'gem' | 'facility' | 'stop', key, aheadM, ... }
// `traffic` is the route's [{ from, to, speed }] by polyline index (model.path).
// `places` carry route_fraction (gems from the corridor, Google's places).
export function itemsAhead({ model, s, traffic = [], hazards = [], places = [], stops = [] }) {
  const { cum, total } = model
  const items = []
  const last = cum.length - 1

  for (const t of traffic) {
    const startS = cum[Math.min(t.from, last)]
    const endS = cum[Math.min(t.to, last)]
    if (endS <= s) continue
    items.push({
      kind: 'traffic',
      key: `t${t.from}-${t.to}`,
      aheadM: Math.max(0, startS - s),
      lengthM: endS - Math.max(startS, s),
      jam: t.speed === 'TRAFFIC_JAM',
    })
  }

  for (const h of hazards) {
    const aheadM = h.routeFraction * total - s
    if (aheadM <= 0) continue
    items.push({ kind: 'report', key: `r${h.id}`, aheadM, report: h })
  }

  for (const p of places) {
    if (p.route_fraction == null) continue
    const aheadM = p.route_fraction * total - s
    if (aheadM <= 0) continue
    const facility = FACILITY_CATEGORIES.has(p.category)
    // Google's places only when they're worth mentioning: a facility, or top rated.
    if (p.source === 'google' && ((!facility && !isTopRated(p)) || p.distance_from_route_m > GOOGLE_MAX_OFF_ROUTE_M)) continue
    items.push({ kind: facility ? 'facility' : 'gem', key: `g${p.id}`, aheadM, place: p })
  }

  stops.forEach((stop) => {
    const aheadM = stop.atS - s
    if (aheadM > 0) items.push({ kind: 'stop', key: `s${stop.name}:${stop.atS}`, aheadM, stop })
  })

  return items.sort((a, b) => a.aheadM - b.aheadM)
}

// The one thing to show while driving: traffic, a road report or a stop
// coming up soon, else whatever is nearest.
export function headlineAhead(items) {
  return items.find((i) => ['traffic', 'report', 'stop'].includes(i.kind) && i.aheadM <= PRIORITY_WITHIN_M) ?? items[0] ?? null
}

// Words for the screen: { title, sub }.
export function describeAhead(item) {
  const where = item.aheadM < 20 ? 'Now' : `In ${formatDistance(item.aheadM)}`
  switch (item.kind) {
    case 'traffic':
      return {
        title: item.jam ? 'Heavy traffic' : 'Slow traffic',
        sub: `${item.aheadM < 20 ? "You're in it" : where} · ${formatDistance(item.lengthM)} long`,
      }
    case 'report':
      return {
        title: reportTypeLabel(item.report.type),
        sub: `${where} · severity ${item.report.severity}/5 · reported by PathIQ drivers`,
      }
    case 'facility':
    case 'gem': {
      const p = item.place
      const off = p.distance_from_route_m > 100 ? ` · ${formatDistance(p.distance_from_route_m)} off the route` : ' · on the route'
      return {
        title: p.name,
        sub: `${where}${off}${p.source === 'google' && p.rating ? ` · ★ ${p.rating}` : ''}`,
      }
    }
    case 'stop':
      return { title: `Stop: ${item.stop.name}`, sub: where }
    default:
      return { title: '', sub: where }
  }
}

// Words for the voice.
export function spokenAhead(item) {
  const inD = item.aheadM < 20 ? 'now' : `in ${spokenDistance(item.aheadM)}`
  switch (item.kind) {
    case 'traffic':
      return item.aheadM < 20
        ? `${item.jam ? 'Heavy' : 'Slow'} traffic for the next ${spokenDistance(item.lengthM)}`
        : `${item.jam ? 'heavy' : 'slow'} traffic ${inD}, for about ${spokenDistance(item.lengthM)}`
    case 'report':
      return `a ${reportTypeLabel(item.report.type).toLowerCase()} report ${inD}`
    case 'facility':
      return `${item.place.category === 'fuel' ? 'fuel at ' : ''}${item.place.name} ${inD}`
    case 'gem':
      return `${item.place.name} ${inD}`
    case 'stop':
      return `your stop at ${item.stop.name} ${inD}`
    default:
      return ''
  }
}

// A short spoken summary: the first of each kind that matters most, nearest
// first, at most four. Empty string when the road ahead is clear.
export function briefing(items) {
  const firstOf = (kind) => items.find((i) => i.kind === kind)
  const fuel = items.find((i) => i.kind === 'facility' && i.place.category === 'fuel') ?? firstOf('facility')
  const picks = [firstOf('traffic'), firstOf('report'), fuel, firstOf('gem')]
    .filter(Boolean)
    .sort((a, b) => a.aheadM - b.aheadM)
    .slice(0, 4)
  if (picks.length === 0) return 'No traffic or road reports on this route right now.'
  const parts = picks.map(spokenAhead)
  const list = parts.length > 1 ? `${parts.slice(0, -1).join(', ')}, and ${parts.at(-1)}` : parts[0]
  return `Ahead on this route: ${list}.`
}

// ── PathIQ AI ──
// The same items, worded by Claude (supabase/functions/briefing). Only the
// fields the function accepts are sent: what's ahead and how far, never the
// driver's position or route geometry. Resolves to the text, or null when it
// isn't available (limited, offline, not deployed) — callers then use
// briefing() above, so the driver always hears something.
const AI_TIMEOUT_MS = 12_000

export async function fetchAiBriefing({ items, destinationName, remainingM, remainingS }) {
  const body = {
    destinationName,
    remainingM: Math.round(remainingM ?? 0),
    remainingS: Math.round(remainingS ?? 0),
    items: items.slice(0, 20).map((i) => ({
      kind: i.kind,
      aheadM: Math.round(i.aheadM),
      ...(i.kind === 'traffic' && { lengthM: Math.round(i.lengthM), jam: i.jam }),
      ...(i.kind === 'report' && { type: reportTypeLabel(i.report.type), severity: i.report.severity }),
      ...((i.kind === 'gem' || i.kind === 'facility') && {
        name: i.place.name,
        category: i.place.category,
        offRouteM: Math.round(i.place.distance_from_route_m ?? 0),
        ...(i.place.rating != null && { rating: i.place.rating }),
      }),
      ...(i.kind === 'stop' && { name: i.stop.name }),
    })),
  }
  try {
    const timeout = new Promise((resolve) => setTimeout(() => resolve({ data: null, error: 'timeout' }), AI_TIMEOUT_MS))
    const { data, error } = await Promise.race([supabase.functions.invoke('briefing', { body }), timeout])
    if (error || typeof data?.text !== 'string' || !data.text.trim()) return null
    return data.text.trim()
  } catch {
    return null
  }
}
