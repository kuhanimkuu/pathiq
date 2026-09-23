// A simple equirectangular projection — accurate enough for the few
// kilometres this radar view covers, not meant for anything beyond that.
// Returns {x, y} in [-1, 1], x east-positive, y north-negative (so it drops
// straight into CSS top/left percentages around a centered origin).
export function projectRelative(lat, lng, originLat, originLng, maxDistanceM) {
  const metersPerDegLat = 111_320
  const metersPerDegLng = 111_320 * Math.cos((originLat * Math.PI) / 180)
  const dx = (lng - originLng) * metersPerDegLng
  const dy = (lat - originLat) * metersPerDegLat
  return {
    x: clamp(dx / maxDistanceM, -1, 1),
    y: clamp(-dy / maxDistanceM, -1, 1),
  }
}

// The inverse of projectRelative — turns a tap at {x, y} in [-1, 1] back into
// an approximate lat/lng, so tapping the radar view can set a destination.
export function unprojectRelative(x, y, originLat, originLng, maxDistanceM) {
  const metersPerDegLat = 111_320
  const metersPerDegLng = 111_320 * Math.cos((originLat * Math.PI) / 180)
  const dx = x * maxDistanceM
  const dy = -y * maxDistanceM
  return {
    lat: originLat + dy / metersPerDegLat,
    lng: originLng + dx / metersPerDegLng,
  }
}

// Real great-circle distance, in metres — used for the route summary, not
// just the radar view's approximate projection.
export function haversineDistanceM(lat1, lng1, lat2, lng2) {
  const R = 6_371_000
  const toRad = (d) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n))
}
