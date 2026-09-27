// Sharing a location as a link that opens PathIQ's map with a pin there
// (MapPage reads `?at=lat,lng&name=…`). Uses the phone's share sheet
// (WhatsApp, SMS, …) where there is one, otherwise copies the link.
// A Google Maps link goes along too, for people without PathIQ.

export function locationLink({ lat, lng, name }) {
  const params = new URLSearchParams({ at: `${lat.toFixed(6)},${lng.toFixed(6)}` })
  if (name) params.set('name', name)
  return `${window.location.origin}/app/map?${params}`
}

// Resolves to 'shared', 'copied' or 'cancelled'. `title` overrides the
// message heading without changing the name the link opens with.
export async function shareLocation(place) {
  const url = locationLink(place)
  const title = place.title || place.name || 'A place on PathIQ'
  const text = `${title}\nGoogle Maps: https://www.google.com/maps/search/?api=1&query=${place.lat.toFixed(6)},${place.lng.toFixed(6)}`
  if (navigator.share) {
    try {
      await navigator.share({ title, text, url })
      return 'shared'
    } catch (err) {
      if (err?.name === 'AbortError') return 'cancelled'
      // Some browsers refuse (e.g. not triggered by a tap); fall back to copying.
    }
  }
  await copyText(`${title}\n${url}`)
  return 'copied'
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    // Older browsers / insecure contexts: the textarea trick.
    const el = document.createElement('textarea')
    el.value = text
    el.setAttribute('readonly', '')
    el.style.position = 'fixed'
    el.style.opacity = '0'
    document.body.appendChild(el)
    el.select()
    document.execCommand('copy')
    el.remove()
  }
}

// `?at=lat,lng&name=…` from a shared link, or null.
export function parseSharedLocation(params) {
  const [lat, lng] = (params.get('at') ?? '').split(',').map(Number)
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null
  const name = (params.get('name') ?? '').slice(0, 80).trim()
  return { lat, lng, name: name || 'Shared location' }
}
