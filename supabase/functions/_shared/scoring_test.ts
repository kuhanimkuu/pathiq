import { assert, assertEquals } from 'jsr:@std/assert@1'
import {
  labelRoutes,
  reportPenalty,
  scoreRoute,
  type RoadReport,
  type RouteInput,
} from './scoring.ts'

const report = (over: Partial<RoadReport> = {}): RoadReport => ({
  type: 'pothole',
  severity: 5,
  confidence: 1,
  ageDays: 0,
  ...over,
})

const route = (over: Partial<RouteInput> = {}): RouteInput => ({
  id: 'r',
  durationS: 1000,
  staticDurationS: 1000,
  distanceM: 10_000,
  reports: [],
  ...over,
})

Deno.test('a route with no reports and no delay scores 100 everywhere', () => {
  assertEquals(scoreRoute(route(), 1000), {
    roadQuality: 100,
    traffic: 100,
    incidents: 100,
    time: 100,
    overall: 100,
  })
})

Deno.test('a severe fresh pothole costs its base penalty', () => {
  assertEquals(reportPenalty(report()), 6)
})

Deno.test('penalty falls with severity, confidence and age', () => {
  assert(reportPenalty(report({ severity: 2 })) < reportPenalty(report({ severity: 5 })))
  assert(reportPenalty(report({ confidence: 0.5 })) < reportPenalty(report()))
  assertEquals(reportPenalty(report({ ageDays: 60 })), 3) // one half-life
})

Deno.test('flooding fades within days, potholes last months', () => {
  const flood = report({ type: 'flooding', ageDays: 6 })
  const pothole = report({ ageDays: 6 })
  assert(reportPenalty(flood) < 20 * 0.2) // 3 half-lives, under 1/8 of base
  assert(reportPenalty(pothole) > 6 * 0.9)
})

Deno.test('potholes hurt road quality, accidents hurt incidents', () => {
  const potholes = scoreRoute(route({ reports: [report(), report()] }), 1000)
  assert(potholes.roadQuality < 100)
  assertEquals(potholes.incidents, 100)

  const accident = scoreRoute(route({ reports: [report({ type: 'incident' })] }), 1000)
  assert(accident.incidents < 100)
  assertEquals(accident.roadQuality, 100)
})

Deno.test('missing confidence is treated as 0.7', () => {
  assertEquals(reportPenalty(report({ confidence: null })), 6 * 0.7)
})

Deno.test('traffic score drops with delay and hits 0 at 50% slower', () => {
  assertEquals(scoreRoute(route({ durationS: 1250, staticDurationS: 1000 }), 1250).traffic, 50)
  assertEquals(scoreRoute(route({ durationS: 1500, staticDurationS: 1000 }), 1500).traffic, 0)
  assertEquals(scoreRoute(route({ durationS: 900, staticDurationS: 1000 }), 900).traffic, 100)
})

Deno.test('time score compares against the fastest alternative', () => {
  assertEquals(scoreRoute(route({ durationS: 2000 }), 1000).time, 50)
})

const scored = (id: string, durationS: number, roadQuality: number, overall: number) => ({
  id,
  durationS,
  scores: { roadQuality, traffic: 80, incidents: 80, time: 80, overall },
})

Deno.test('three different winners get one label each', () => {
  const tags = labelRoutes([
    scored('a', 7900, 70, 75), // fastest
    scored('b', 8000, 80, 90), // recommended
    scored('c', 8500, 95, 80), // best road
  ])
  assertEquals(tags.get('a'), ['fastest'])
  assertEquals(tags.get('b'), ['recommended'])
  assertEquals(tags.get('c'), ['best_road'])
})

Deno.test('one route can win several labels', () => {
  const tags = labelRoutes([scored('a', 7000, 90, 95), scored('b', 8000, 60, 60)])
  assertEquals(tags.get('a'), ['recommended', 'fastest', 'best_road'])
  assertEquals(tags.get('b'), [])
})

Deno.test('a single route holds every label', () => {
  const tags = labelRoutes([scored('only', 5000, 50, 50)])
  assertEquals(tags.get('only'), ['recommended', 'fastest', 'best_road'])
})

Deno.test('no routes gives no labels', () => {
  assertEquals(labelRoutes([]).size, 0)
})
