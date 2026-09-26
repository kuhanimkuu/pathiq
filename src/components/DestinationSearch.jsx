import { useEffect, useMemo, useRef, useState } from 'react'
import { Search, X, MapPin, History, Bookmark, ArrowLeft } from 'lucide-react'
import { newSearchSession, searchPlaces, resolvePlace } from '../lib/placeSearch'
import { loadGoogleMaps } from '../lib/googleMaps'
import { GemBadge } from './PlaceIcons'

// Places Autocomplete is billed per request on the browser key, which can't
// be rate-limited server-side — so search only from 3 characters, and only
// once typing pauses. (Set a per-day quota on the key in Cloud Console too.)
const MIN_PLACE_QUERY = 3
const DEBOUNCE_MS = 350

// "Where to?" search over the map. Before anything is typed it offers one-tap
// destinations: where you've navigated recently and the gems you've saved.
// While typing: PathIQ gems (matched locally from `gems`) first, then Google places.
//   onPickGem(gem)                  a nearby PathIQ gem was chosen (show it)
//   onPickPlace({ lat, lng, name }) somewhere to route to: a Google place, a
//                                   recent destination or a saved gem
// When choosing one end of a route or a stop (the route editor on the map):
//   onCancel     shows a back arrow that closes the search
//   extraItems   one-tap choices above Recent, e.g. "Your location" and
//                "Choose on the map": [{ key, icon, title, sub, disabled, onPick }]
//   gemsAsPlaces a matching gem is picked as a place, not shown on the map
function DestinationSearch({
  gems = [],
  recent = [],
  saved = [],
  near,
  onPickGem,
  onPickPlace,
  placeholder,
  autoFocus = false,
  onCancel,
  extraItems = [],
  gemsAsPlaces = false,
}) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(autoFocus)
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

  function pickQuick(place) {
    reset()
    onPickPlace?.({ lat: place.lat, lng: place.lng, name: place.name })
  }

  function pickGem(gem) {
    reset()
    if (gemsAsPlaces) onPickPlace?.({ lat: gem.lat, lng: gem.lng, name: gem.name })
    else onPickGem?.(gem)
  }

  function pickExtra(item) {
    reset()
    item.onPick()
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
    <div className="dest-search floating">
      <div className="map-search-bar">
        {onCancel ? (
          <button className="map-search-back" onMouseDown={(e) => e.preventDefault()} onClick={onCancel} aria-label="Back">
            <ArrowLeft size={16} />
          </button>
        ) : (
          <Search size={16} color="var(--muted-foreground)" />
        )}
        <input
          autoFocus={autoFocus}
          placeholder={placeholder}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={(e) => e.key === 'Escape' && (onCancel ? onCancel() : reset())}
          aria-label={placeholder}
        />
        {query && (
          <button className="map-search-clear" onMouseDown={(e) => e.preventDefault()} onClick={reset} aria-label="Clear search">
            <X size={14} />
          </button>
        )}
      </div>

      {open && !trimmed && !error && (extraItems.length > 0 || recent.length > 0 || saved.length > 0) && (
        <div className="map-search-results" onMouseDown={(e) => e.preventDefault()}>
          {extraItems.map((item) => (
            <button key={item.key} className="map-search-result" disabled={item.disabled} onClick={() => pickExtra(item)}>
              <span className="map-search-result-icon">{item.icon}</span>
              <span>
                <span className="map-search-result-title">{item.title}</span>
                {item.sub && <span className="map-search-result-sub">{item.sub}</span>}
              </span>
            </button>
          ))}
          {recent.length > 0 && <div className="map-search-heading"><History size={12} /> Recent</div>}
          {recent.map((r) => (
            <button key={`r:${r.lat},${r.lng},${r.name}`} className="map-search-result" onClick={() => pickQuick(r)}>
              <span className="map-search-result-icon"><History size={15} /></span>
              <span className="map-search-result-title">{r.name}</span>
            </button>
          ))}
          {saved.length > 0 && <div className="map-search-heading"><Bookmark size={12} /> Saved gems</div>}
          {saved.map((g) => (
            <button key={`s:${g.id}`} className="map-search-result" onClick={() => pickQuick(g)}>
              <GemBadge category={g.category} size={30} />
              <span className="map-search-result-title">{g.name}</span>
            </button>
          ))}
        </div>
      )}

      {open && (trimmed || error) && (
        // mousedown is swallowed so picking a result doesn't blur the input
        // (and close the list) before the click lands.
        <div className="map-search-results" onMouseDown={(e) => e.preventDefault()}>
          {gemMatches.map((gem) => (
            <button key={gem.id} className="map-search-result" onClick={() => pickGem(gem)}>
              <GemBadge category={gem.category} size={30} />
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
