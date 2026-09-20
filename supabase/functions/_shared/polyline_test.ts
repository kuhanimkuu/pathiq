import { assertAlmostEquals, assertEquals, assertThrows } from 'jsr:@std/assert@1'
import { decodePolyline, toWkt } from './polyline.ts'

// The worked example from Google's polyline algorithm documentation.
const GOOGLE_EXAMPLE = '_p~iF~ps|U_ulLnnqC_mqNvxq`@'

Deno.test('decodes Google\'s documented example', () => {
  const points = decodePolyline(GOOGLE_EXAMPLE)
  assertEquals(points.length, 3)
  const expected = [
    [-120.2, 38.5],
    [-120.95, 40.7],
    [-126.453, 43.252],
  ]
  points.forEach(([lng, lat], i) => {
    assertAlmostEquals(lng, expected[i][0], 1e-6)
    assertAlmostEquals(lat, expected[i][1], 1e-6)
  })
})

Deno.test('an empty polyline decodes to no points', () => {
  assertEquals(decodePolyline(''), [])
})

Deno.test('a truncated polyline throws', () => {
  assertThrows(() => decodePolyline('_p~iF~ps|U_ulL'), Error, 'Malformed polyline')
})

Deno.test('toWkt writes lng then lat', () => {
  assertEquals(
    toWkt([
      [36.82, -1.29],
      [36.8, -1.27],
    ]),
    'LINESTRING(36.82 -1.29, 36.8 -1.27)',
  )
})

Deno.test('toWkt needs at least two points', () => {
  assertThrows(() => toWkt([[36.82, -1.29]]), Error, 'at least two points')
})
