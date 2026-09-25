import { useEffect, useState, useCallback } from 'react'
import { Star, Bookmark } from 'lucide-react'
import { useAuth } from '../context/useAuth'
import { fetchGems, fetchSavedGemIds, saveGem, unsaveGem, confirmGem } from '../lib/gems'
import { GemBadge, GemGlyph } from '../components/PlaceIcons'
import { gemStyle } from '../lib/placeStyles'

const categories = [
  { value: 'All', label: 'All' },
  { value: 'attractions', label: 'Attractions' },
  { value: 'hotels', label: 'Hotels' },
  { value: 'food', label: 'Food' },
  { value: 'scenic', label: 'Scenic' },
  { value: 'fuel', label: 'Fuel' },
  { value: 'facilities', label: 'Facilities' },
]

function Gems() {
  const { user, session } = useAuth()
  const userId = user?.id
  const [activeCategory, setActiveCategory] = useState('All')
  const [gems, setGems] = useState([])
  const [savedIds, setSavedIds] = useState(new Set())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState(null)

  const load = useCallback(async () => {
    try {
      const [gemRows, saved] = await Promise.all([fetchGems(), fetchSavedGemIds(userId)])
      setGems(gemRows)
      setSavedIds(saved)
      setError('')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [userId])

  // Not just `load()` here: react-hooks/set-state-in-effect only traces
  // control flow it can see directly in the effect body, so it treats any
  // call to an outside (e.g. useCallback) function as a possible synchronous
  // setState. An inline async function it can see through avoids that.
  useEffect(() => {
    if (!session) return
    let cancelled = false
    async function run() {
      try {
        const [gemRows, saved] = await Promise.all([fetchGems(), fetchSavedGemIds(userId)])
        if (cancelled) return
        setGems(gemRows)
        setSavedIds(saved)
        setError('')
      } catch (err) {
        if (!cancelled) setError(err.message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    run()
    return () => {
      cancelled = true
    }
  }, [session, userId])

  const filteredGems =
    activeCategory === 'All' ? gems : gems.filter((gem) => gem.category === activeCategory)

  async function handleToggleSave(gemId) {
    setBusyId(gemId)
    try {
      if (savedIds.has(gemId)) {
        await unsaveGem(userId, gemId)
        setSavedIds((prev) => {
          const next = new Set(prev)
          next.delete(gemId)
          return next
        })
      } else {
        await saveGem(userId, gemId)
        setSavedIds((prev) => new Set(prev).add(gemId))
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setBusyId(null)
    }
  }

  async function handleRate(gemId, rating) {
    setBusyId(gemId)
    try {
      await confirmGem(userId, gemId, rating)
      await load()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="gems-page">
      <h1 className="page-title">Hidden Gems</h1>

      <div className="filter-row">
        {categories.map((category) => (
          <button
            key={category.value}
            className={'filter-chip' + (category.value === activeCategory ? ' active' : '')}
            onClick={() => setActiveCategory(category.value)}
          >
            {category.value !== 'All' && <GemGlyph category={category.value} />} {category.label}
          </button>
        ))}
      </div>

      {error && <p className="auth-error">{error}</p>}

      <div className="section-card">
        <div className="section-title">
          {loading ? 'Loading…' : `${filteredGems.length} gems found`}
        </div>

        {!loading && filteredGems.length === 0 && (
          <p className="list-row-sub">No gems in this category yet.</p>
        )}

        {filteredGems.map((gem) => (
          <div key={gem.id} className="list-row gem-row">
            <GemBadge category={gem.category} size={40} />
            <div className="gem-row-main">
              <div className="list-row-title">{gem.name}</div>
              <div className="list-row-sub">
                {gemStyle(gem.category).label}
                {gem.rating_avg ? ` · ${gem.rating_avg}★` : ''} · {gem.confirmations_count} confirmations
              </div>
              {gem.description && <div className="list-row-sub">{gem.description}</div>}
            </div>
            <div className="gem-row-actions">
              <div className="rate-stars">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    className="rate-star-btn"
                    disabled={busyId === gem.id}
                    onClick={() => handleRate(gem.id, n)}
                    aria-label={`Rate ${n} stars`}
                  >
                    <Star size={14} />
                  </button>
                ))}
              </div>
              <button
                className={'save-btn' + (savedIds.has(gem.id) ? ' saved' : '')}
                disabled={busyId === gem.id}
                onClick={() => handleToggleSave(gem.id)}
                aria-label={savedIds.has(gem.id) ? 'Remove from saved' : 'Save gem'}
              >
                <Bookmark size={16} fill={savedIds.has(gem.id) ? 'currentColor' : 'none'} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default Gems
