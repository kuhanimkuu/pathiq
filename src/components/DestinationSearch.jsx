import { useEffect, useMemo, useRef, useState } from 'react'
import { Search, X, MapPin } from 'lucide-react'
import { newSearchSession, searchPlaces, resolvePlace } from '../lib/placeSearch'
import { loadGoogleMaps } from '../lib/googleMaps'
import { CATEGORY_ICON } from '../lib/icons'

// Places Autocomplete is billed per request on the browser key, which can't
// be rate-limited server-side — so search only from 3 characters, and only
// once typing pauses. (Set a per-day quota on the key in Cloud Console too.)
const MIN_PLACE_QUERY = 3
const DEBOUNCE_MS = 350

// "Where to?" search: PathIQ gems (matched locally from `gems`) first, then
// Google places. Used floating over the map and inline on the Routes tab.
//   onPickGem(gem)                 a PathIQ gem was chosen
//   onPickPlace({ lat, lng, name }) a Google place was chosen (already resolved)
function DestinationSearch({ gems = [], near, onPickGem, onPickPlace, placeholder, variant = 'floating', autoFocus }) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [results, setResults] = useState({ query: '', items: [] })
  const [error, setError] = useState('')
  const sessionRef = useRef(null)
  const nearRef = useRef(near)
  useEffect(() => {
    nearRef.current = near
  }, [near])

  // Start loading the Maps SDK as soon as the box is on screen, so the first
  // search doesn't also wait for the script (seconds on a phone).
  useEffect(() => {
    loadGoogleMaps().catch(() => {}) // a real failure surfaces on search
  }, [])

  const trimmed = query.trim()

  useEffect(() => {
    if (trimmed.length < MIN_PLACE_QUERY) return
    let cancelled = false
    const timer = setTimeout(async () => {
      try {
        sessionRef.current ??= await newSearchSession()
        const n = nearRef.current && { lat: nearRef.current.lat, lng: nearRef.current.lng }
        const items = await searchPlaces(trimmed, n, sessionRef.current)
        if (!cancelled) {
          setResults({ query: trimmed, items })
          setError('')
        }
      } catch (err) {
        if (!cancelled) setError(err.message)
      }
    }, DEBOUNCE_MS)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [trimmed])

  const gemMatches = useMemo(() => {
    if (!trimmed) return []
    const q = trimmed.toLowerCase()
    return gems.filter((g) => g.name.toLowerCase().includes(q)).slice(0, 3)
  }, [gems, trimmed])

  function reset() {
    setQuery('')
    setOpen(false)
    sessionRef.current = null // a Places session ends with a selection
  }

  function pickGem(gem) {
    reset()
    onPickGem?.(gem)
  }

  async function pickPlace(item) {
    reset()
    try {
      onPickPlace?.(await resolvePlace(item))
    } catch (err) {
      setError(err.message)
      setOpen(true)
    }
  }

  const tooShort = trimmed.length < MIN_PLACE_QUERY
  const pending = !tooShort && results.query !== trimmed && !error
  const places = results.query === trimmed ? results.items : []

  return (
    <div className={`dest-search ${variant}`}>
      <div className="map-search-bar">
        <Search size={16} color="var(--muted-foreground)" />
        <input
          placeholder={placeholder}
          value={query}
          autoFocus={autoFocus}
          onChange={(e) => {
            setQuery(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={(e) => e.key === 'Escape' && reset()}
          aria-label="Search for a destination"
        />
        {query && (
          <button className="map-search-clear" onMouseDown={(e) => e.preventDefault()} onClick={reset} aria-label="Clear search">
            <X size={14} />
          </button>
        )}
      </div>

      {open && (trimmed || error) && (
        // mousedown is swallowed so picking a result doesn't blur the input
        // (and close the list) before the click lands.
        <div className="map-search-results" onMouseDown={(e) => e.preventDefault()}>
          {gemMatches.map((gem) => (
            <button key={gem.id} className="map-search-result" onClick={() => pickGem(gem)}>
              <span className="map-search-result-icon">{CATEGORY_ICON[gem.category] ?? '📍'}</span>
              <span>
                <span className="map-search-result-title">{gem.name}</span>
                <span className="map-search-result-sub">
                  PathIQ gem{gem.distance_m != null ? ` · ${(gem.distance_m / 1000).toFixed(1)} km away` : ''}
                </span>
              </span>
            </button>
          ))}
          {places.map((item) => (
            <button key={item.id} className="map-search-result" onClick={() => pickPlace(item)}>
              <span className="map-search-result-icon"><MapPin size={15} /></span>
              <span>
                <span className="map-search-result-title">{item.title}</span>
                <span className="map-search-result-sub">{item.subtitle}</span>
              </span>
            </button>
          ))}
          {pending && <div className="map-search-note">Searching…</div>}
          {error && <div className="map-search-note">{error}</div>}
          {tooShort && gemMatches.length === 0 && !error && <div className="map-search-note">Keep typing…</div>}
          {!tooShort && !pending && !error && gemMatches.length === 0 && places.length === 0 && (
            <div className="map-search-note">No places found.</div>
          )}
        </div>
      )}
    </div>
  )
}

export default DestinationSearch
