// Route intelligence scoring. Pure functions: no database, network or Deno APIs,
// so this can be unit-tested and reused in a native app later.
//
// Every score is 0-100, higher is better.
//   roadQuality  potholes and surface damage on the route
//   incidents    construction, flooding and accidents on the route
//   traffic      delay compared with free-flowing time
//   time         journey time compared with the fastest alternative
//   overall      weighted blend of the four

export type ReportType = 'pothole' | 'flooding' | 'construction' | 'surface' | 'incident'
export type RouteTag = 'recommended' | 'fastest' | 'best_road'

export interface RoadReport {
  type: ReportType
  severity: number // 1-5
  confidence: number | null // 0-1
  ageDays: number
}

export interface RouteInput {
  id: string
  durationS: number // with live traffic
  staticDurationS: number // without traffic
  distanceM: number
  reports: RoadReport[]
}

export interface RouteScores {
  roadQuality: number
  traffic: number
  incidents: number
  time: number
  overall: number
}

// Penalty points a fresh, severity-5, fully trusted report adds.
export const BASE_PENALTY: Record<ReportType, number> = {
  pothole: 6,
  surface: 8,
  construction: 10,
  flooding: 20,
  incident: 15,
}

// A report's weight halves every this many days.
export const HALF_LIFE_DAYS: Record<ReportType, number> = {
  pothole: 60,
  surface: 90,
  construction: 30,
  flooding: 2,
  incident: 0.25,
}

const ROAD_TYPES: ReportType[] = ['pothole', 'surface']
const INCIDENT_TYPES: ReportType[] = ['construction', 'flooding', 'incident']

export const WEIGHTS = { roadQuality: 0.35, traffic: 0.2, incidents: 0.2, time: 0.25 }

const DEFAULT_CONFIDENCE = 0.7
// Total penalty at which a group's score falls to about 37 (100 / e).
const PENALTY_SCALE = 40

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

export function reportPenalty(report: RoadReport): number {
  const severity = clamp(report.severity, 1, 5) / 5
  const confidence = clamp(report.confidence ?? DEFAULT_CONFIDENCE, 0, 1)
  const decay = Math.pow(0.5, Math.max(0, report.ageDays) / HALF_LIFE_DAYS[report.type])
  return BASE_PENALTY[report.type] * severity * confidence * decay
}

function groupScore(reports: RoadReport[], types: ReportType[]): number {
  const total = reports
    .filter((r) => types.includes(r.type))
    .reduce((sum, r) => sum + reportPenalty(r), 0)
  return Math.round(100 * Math.exp(-total / PENALTY_SCALE))
}

function trafficScore(durationS: number, staticDurationS: number): number {
  if (staticDurationS <= 0) return 100
  const delayRatio = Math.max(0, (durationS - staticDurationS) / staticDurationS)
  // A journey 50% slower than free flow scores 0.
  return Math.round(100 - Math.min(100, delayRatio * 200))
}

export function scoreRoute(route: RouteInput, fastestDurationS: number): RouteScores {
  const roadQuality = groupScore(route.reports, ROAD_TYPES)
  const incidents = groupScore(route.reports, INCIDENT_TYPES)
  const traffic = trafficScore(route.durationS, route.staticDurationS)
  const time = route.durationS > 0 ? Math.round(100 * Math.min(1, fastestDurationS / route.durationS)) : 100

  const overall = Math.round(
    WEIGHTS.roadQuality * roadQuality +
      WEIGHTS.traffic * traffic +
      WEIGHTS.incidents * incidents +
      WEIGHTS.time * time,
  )
  return { roadQuality, traffic, incidents, time, overall }
}

export interface ScoredRoute {
  id: string
  durationS: number
  scores: RouteScores
}

// Picks the winner for each label. One route can hold several labels, and with a
// single route it holds all three.
export function labelRoutes(routes: ScoredRoute[]): Map<string, RouteTag[]> {
  const tags = new Map<string, RouteTag[]>(routes.map((r) => [r.id, []]))
  if (routes.length === 0) return tags

  const best = (compare: (a: ScoredRoute, b: ScoredRoute) => number) => [...routes].sort(compare)[0]

  const recommended = best(
    (a, b) => b.scores.overall - a.scores.overall || a.durationS - b.durationS,
  )
  const fastest = best(
    (a, b) => a.durationS - b.durationS || b.scores.overall - a.scores.overall,
  )
  const bestRoad = best(
    (a, b) =>
      b.scores.roadQuality - a.scores.roadQuality ||
      b.scores.overall - a.scores.overall ||
      a.durationS - b.durationS,
  )

  tags.get(recommended.id)!.push('recommended')
  tags.get(fastest.id)!.push('fastest')
  tags.get(bestRoad.id)!.push('best_road')
  return tags
}
