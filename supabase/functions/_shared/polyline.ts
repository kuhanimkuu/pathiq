// Google's encoded polyline format (precision 5).
// https://developers.google.com/maps/documentation/utilities/polylinealgorithm

export type LngLat = [lng: number, lat: number]

export function decodePolyline(encoded: string): LngLat[] {
  const points: LngLat[] = []
  let index = 0
  let lat = 0
  let lng = 0

  const nextDelta = (): number => {
    let result = 0
    let shift = 0
    let byte: number
    do {
      if (index >= encoded.length) throw new Error('Malformed polyline')
      byte = encoded.charCodeAt(index++) - 63
      result |= (byte & 0x1f) << shift
      shift += 5
    } while (byte >= 0x20)
    return result & 1 ? ~(result >> 1) : result >> 1
  }

  while (index < encoded.length) {
    lat += nextDelta()
    lng += nextDelta()
    points.push([lng / 1e5, lat / 1e5])
  }
  return points
}

// The WKT LINESTRING the spatial SQL functions expect, in lng/lat order.
export function toWkt(points: LngLat[]): string {
  if (points.length < 2) throw new Error('A route needs at least two points')
  return `LINESTRING(${points.map(([lng, lat]) => `${lng} ${lat}`).join(', ')})`
}
