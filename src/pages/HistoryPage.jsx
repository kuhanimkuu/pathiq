import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Navigation2, Trash2, Gem, RotateCw, Flag, CircleSlash } from 'lucide-react'
import { useAuth } from '../context/useAuth'
import { useUser } from '../context/useUser'
import { fetchTripHistory, deleteTrip } from '../lib/trips'
import { loadActiveTrip, resumeUrl } from '../lib/activeTrip'
import { formatDuration, ROUTE_TAG_LABEL } from '../lib/routePlanning'

const PAGE = 30

function dayLabel(date) {
  const today = new Date()
  const d = new Date(date)
  const startOf = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const diff = Math.round((startOf(today) - startOf(d)) / 86_400_000)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Yesterday'
  return d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short', year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric' })
}

function groupByDay(trips) {
  const groups = []
  for (const trip of trips) {
    const label = dayLabel(trip.started_at)
    const last = groups[groups.length - 1]
    if (last?.label === label) last.trips.push(trip)
    else groups.push({ label, trips: [trip] })
  }
  return groups
}

function mapUrl(trip) {
  const params = new URLSearchParams({ to: `${trip.lat.toFixed(5)},${trip.lng.toFixed(5)}`, name: trip.destination_name || 'Dropped pin' })
  return `/app/map?${params}`
}

// Past trips, newest first: where you went, which route, how it went. Route
// planning itself lives on the map; this is the record of what you drove,
// with "Go again" to plan the same trip there.
function HistoryPage() {
  const { session } = useAuth()
  const { user, refresh } = useUser()
  const navigate = useNavigate()
  const [trips, setTrips] = useState([])
  const [loading, setLoading] = useState(true)
  const [hasMore, setHasMore] = useState(false)
  const [error, setError] = useState('')
  const [confirmingId, setConfirmingId] = useState(null)
  const [active] = useState(loadActiveTrip)

  useEffect(() => {
    if (!session) return
    let cancelled = false
    fetchTripHistory({ limit: PAGE })
      .then((rows) => {
        if (cancelled) return
        setTrips(rows)
        setHasMore(rows.length === PAGE)
      })
      .catch((err) => !cancelled && setError(err.message))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [session])

  const loadMore = useCallback(async () => {
    const oldest = trips[trips.length - 1]
    if (!oldest) return
    try {
      const rows = await fetchTripHistory({ limit: PAGE, before: oldest.started_at })
      setTrips((prev) => [...prev, ...rows])
      setHasMore(rows.length === PAGE)
    } catch (err) {
      setError(err.message)
    }
  }, [trips])

  async function handleDelete(tripId) {
    setConfirmingId(null)
    try {
      await deleteTrip(tripId)
      setTrips((prev) => prev.filter((t) => t.id !== tripId))
      refresh() // trips this month and the IQ Score may change
    } catch (err) {
      setError(err.message)
    }
  }

  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
  const thisMonth = trips.filter((t) => new Date(t.started_at) >= monthStart && t.ended_at)
  const kmThisMonth = thisMonth.reduce((sum, t) => sum + (t.distance_m ?? 0), 0) / 1000

  return (
    <div className="history-page">
      <h1 className="page-title">History</h1>

      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-value">{user.tripsThisMonth ?? '–'}</div>
          <div className="stat-label">Trips this month</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{loading ? '–' : `${kmThisMonth.toFixed(0)} km`}</div>
          <div className="stat-label">Planned distance this month</div>
        </div>
      </div>

      {active && (
        <div className="section-card history-active">
          <div>
            <div className="section-title">In progress</div>
            <div className="history-dest">{active.destinationName}</div>
          </div>
          <button className="home-route-btn" onClick={() => navigate(resumeUrl(active))}>
            Resume
          </button>
        </div>
      )}

      {error && <p className="auth-error">{error}</p>}
      {loading && <p className="list-row-sub">Loading…</p>}
      {!loading && trips.length === 0 && (
        <div className="section-card">
          <p className="list-row-sub" style={{ margin: 0 }}>
            No trips yet. Plan a route on the <Link to="/app/map">map</Link> and tap Start. Your trips will show up here.
          </p>
        </div>
      )}

      {groupByDay(trips).map((group) => (
        <div key={group.label} className="section-card">
          <div className="section-title">{group.label}</div>
          {group.trips.map((trip) => {
            const status = !trip.ended_at ? 'open' : trip.arrived ? 'arrived' : 'ended'
            const tookS = trip.ended_at ? (new Date(trip.ended_at) - new Date(trip.started_at)) / 1000 : null
            return (
              <div key={trip.id} className="history-trip">
                <div className="history-trip-main">
                  <div className="history-dest">{trip.destination_name || 'Dropped pin'}</div>
                  <div className="history-meta">
                    {new Date(trip.started_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    {trip.route_option ? ` · ${ROUTE_TAG_LABEL[trip.route_option]}` : ''}
                    {trip.distance_m ? ` · ${(trip.distance_m / 1000).toFixed(1)} km` : ''}
                    {tookS ? ` · took ${formatDuration(tookS)}` : ''}
                  </div>
                  <div className="history-badges">
                    {status === 'arrived' && <span className="history-badge ok"><Flag size={11} /> Arrived</span>}
                    {status === 'ended' && <span className="history-badge"><CircleSlash size={11} /> Ended early</span>}
                    {status === 'ended' && tookS < 120 && (
                      // Same rule as trip_counts() in the trip tracking migration.
                      <span className="history-badge" title="Trips ended within 2 minutes don't count towards stats or your IQ Score">
                        Too short to count
                      </span>
                    )}
                    {status === 'open' && <span className="history-badge">Not finished</span>}
                    {trip.road_quality != null && <span className="history-badge">Road score {trip.road_quality}</span>}
                    {trip.reroutes > 0 && (
                      <span className="history-badge"><RotateCw size={11} /> {trip.reroutes} reroute{trip.reroutes === 1 ? '' : 's'}</span>
                    )}
                    {trip.gems_alerted > 0 && (
                      <span className="history-badge gem"><Gem size={11} /> {trip.gems_alerted} gem{trip.gems_alerted === 1 ? '' : 's'} passed</span>
                    )}
                  </div>
                </div>
                <div className="history-actions">
                  {confirmingId === trip.id ? (
                    <>
                      <button className="history-btn danger" onClick={() => handleDelete(trip.id)}>Remove</button>
                      <button className="history-btn" onClick={() => setConfirmingId(null)}>Keep</button>
                    </>
                  ) : (
                    <>
                      {trip.lat != null && (
                        <button className="history-btn primary" onClick={() => navigate(mapUrl(trip))}>
                          <Navigation2 size={13} /> Go again
                        </button>
                      )}
                      <button className="history-btn icon" onClick={() => setConfirmingId(trip.id)} aria-label="Remove trip">
                        <Trash2 size={14} />
                      </button>
                    </>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      ))}

      {hasMore && (
        <button className="auth-guest-btn" onClick={loadMore}>
          Show older trips
        </button>
      )}
    </div>
  )
}

export default HistoryPage
