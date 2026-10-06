import { assertEquals } from 'jsr:@std/assert@1'
import { categoryOf, toPlace } from './places.ts'

Deno.test('the primary type decides the category', () => {
  assertEquals(categoryOf(['restaurant', 'lodging'], 'restaurant'), 'food')
  assertEquals(categoryOf(['restaurant', 'lodging'], 'hotel'), 'hotels')
})

Deno.test('without a known primary type, the first matching type wins in priority order', () => {
  assertEquals(categoryOf(['restaurant', 'lodging', 'point_of_interest']), 'hotels')
  assertEquals(categoryOf(['gas_station', 'cafe']), 'fuel')
})

Deno.test('places of types PathIQ does not show are dropped', () => {
  assertEquals(categoryOf(['bank', 'point_of_interest']), null)
  assertEquals(
    toPlace({ id: 'x', displayName: { text: 'KCB' }, location: { latitude: -1, longitude: 36 }, types: ['bank'] }),
    null,
  )
})

Deno.test('a usable place is mapped, with a prefixed id', () => {
  assertEquals(
    toPlace({
      id: 'abc',
      displayName: { text: 'Java House' },
      location: { latitude: -1.28, longitude: 36.82 },
      primaryType: 'cafe',
      rating: 4.4,
      userRatingCount: 812,
      googleMapsUri: 'https://maps.google.com/?cid=1',
      businessStatus: 'OPERATIONAL',
    }),
    {
      id: 'google:abc',
      name: 'Java House',
      category: 'food',
      lat: -1.28,
      lng: 36.82,
      rating: 4.4,
      ratingCount: 812,
      mapsUri: 'https://maps.google.com/?cid=1',
    },
  )
})

Deno.test('closed places and places without a location are dropped', () => {
  const base = { id: 'a', displayName: { text: 'A' }, location: { latitude: -1, longitude: 36 }, types: ['cafe'] }
  assertEquals(toPlace({ ...base, businessStatus: 'CLOSED_PERMANENTLY' }), null)
  assertEquals(toPlace({ ...base, location: {} }), null)
})
