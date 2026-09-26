import { assertEquals } from 'jsr:@std/assert@1'
import { parseSteps, parseTraffic } from './google.ts'

// Shape taken from a real Routes API response (Nairobi CBD, field mask as in google.ts).
const ROUTE = {
  legs: [
    {
      steps: [
        {
          distanceMeters: 86,
          staticDuration: '16s',
          startLocation: { latLng: { latitude: -1.2863739, longitude: 36.8171742 } },
          endLocation: { latLng: { latitude: -1.2866999, longitude: 36.8175649 } },
          navigationInstruction: {
            maneuver: 'DEPART',
            instructions: 'Head northeast toward Uhuru Hwy/A104\nPass by sharkflow ltd (on the left)',
          },
        },
        {
          distanceMeters: 725,
          staticDuration: '92s',
          startLocation: { latLng: { latitude: -1.2866999, longitude: 36.8175649 } },
          endLocation: { latLng: { latitude: -1.29, longitude: 36.82 } },
          navigationInstruction: { maneuver: 'TURN_RIGHT', instructions: 'Turn right onto Uhuru Hwy/A104' },
        },
      ],
    },
  ],
}

Deno.test('flattens steps; first line is the instruction, the rest is detail', () => {
  const steps = parseSteps(ROUTE)
  assertEquals(steps.length, 2)
  assertEquals(steps[0], {
    instruction: 'Head northeast toward Uhuru Hwy/A104',
    detail: 'Pass by sharkflow ltd (on the left)',
    maneuver: 'DEPART',
    distanceM: 86,
    durationS: 16,
    start: { lat: -1.2863739, lng: 36.8171742 },
    end: { lat: -1.2866999, lng: 36.8175649 },
    leg: 0,
  })
  assertEquals(steps[1].maneuver, 'TURN_RIGHT')
  assertEquals(steps[1].detail, '')
})

Deno.test('tolerates missing fields', () => {
  const steps = parseSteps({ legs: [{ steps: [{}] }] })
  assertEquals(steps, [
    { instruction: '', detail: '', maneuver: 'STRAIGHT', distanceM: 0, durationS: 0, start: { lat: 0, lng: 0 }, end: { lat: 0, lng: 0 }, leg: 0 },
  ])
  assertEquals(parseSteps({}), [])
})

Deno.test('numbers steps by leg, so stops can be detected', () => {
  const steps = parseSteps({ legs: [{ steps: [{}, {}] }, { steps: [{}] }, { steps: [{}] }] })
  assertEquals(steps.map((s) => s.leg), [0, 0, 1, 2])
})

Deno.test('traffic keeps only slow and jammed stretches', () => {
  // Shape from a real TRAFFIC_ON_POLYLINE response; Google omits a 0 start index.
  const traffic = parseTraffic({
    travelAdvisory: {
      speedReadingIntervals: [
        { endPolylinePointIndex: 11, speed: 'NORMAL' },
        { startPolylinePointIndex: 11, endPolylinePointIndex: 17, speed: 'TRAFFIC_JAM' },
        { startPolylinePointIndex: 17, endPolylinePointIndex: 23, speed: 'NORMAL' },
        { startPolylinePointIndex: 23, endPolylinePointIndex: 31, speed: 'SLOW' },
        { startPolylinePointIndex: 40, endPolylinePointIndex: 40, speed: 'SLOW' }, // empty, dropped
      ],
    },
  })
  assertEquals(traffic, [
    { from: 11, to: 17, speed: 'TRAFFIC_JAM' },
    { from: 23, to: 31, speed: 'SLOW' },
  ])
  assertEquals(parseTraffic({}), [])
})
