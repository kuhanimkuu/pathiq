import { assertEquals } from 'jsr:@std/assert@1'
import { parseSteps } from './google.ts'

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

Deno.test('flattens steps and keeps only the first instruction line', () => {
  const steps = parseSteps(ROUTE)
  assertEquals(steps.length, 2)
  assertEquals(steps[0], {
    instruction: 'Head northeast toward Uhuru Hwy/A104',
    maneuver: 'DEPART',
    distanceM: 86,
    durationS: 16,
    start: { lat: -1.2863739, lng: 36.8171742 },
    end: { lat: -1.2866999, lng: 36.8175649 },
  })
  assertEquals(steps[1].maneuver, 'TURN_RIGHT')
})

Deno.test('tolerates missing fields', () => {
  const steps = parseSteps({ legs: [{ steps: [{}] }] })
  assertEquals(steps, [
    { instruction: '', maneuver: 'STRAIGHT', distanceM: 0, durationS: 0, start: { lat: 0, lng: 0 }, end: { lat: 0, lng: 0 } },
  ])
  assertEquals(parseSteps({}), [])
})
