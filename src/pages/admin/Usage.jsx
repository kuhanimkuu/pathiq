import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchUsage, saveRoutePrices } from '../../lib/admin'
import DailyBars from './DailyBars'

// What each rate-limit key means, and its limit (see the rate_limits
// migration and the routes edge function).
const LIMIT_KINDS = [
  { prefix: 'routes:user:', label: 'Route requests (user)', limit: 30, per: '10 min' },
  { prefix: 'routes:ip:', label: 'Route requests (network)', limit: 60, per: '10 min' },
  { prefix: 'routes:google:global', label: 'All Google route calls', limit: 1500, per: 'hour' },
  { prefix: 'trips:', label: 'Trip starts', limit: 30, per: 'hour' },
  { prefix: 'road_reports:', label: 'Road reports', limit: 30, per: 'hour' },
  { prefix: 'gems:', label: 'Gem submissions', limit: 20, per: 'hour' },
  { prefix: 'pinned_places:', label: 'Pinned places', limit: 60, per: 'hour' },
  { prefix: 'scout-photos:', label: 'Photo uploads', limit: 40, per: 'hour' },
  { prefix: 'admin:', label: 'Admin requests', limit: 3000, per: 'hour' },
]

function describeKey(key) {
  const kind = LIMIT_KINDS.find((k) => key.startsWith(k.prefix))
  const rest = kind ? key.slice(kind.prefix.length) : key
  return { kind, who: kind?.prefix === 'routes:ip:' ? rest : null }
}

const usd = (n) => '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function Usage() {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [prices, setPrices] = useState(null)
  const [saved, setSaved] = useState('')

  useEffect(() => {
    let cancelled = false
    fetchUsage(30)
      .then((d) => {
        if (cancelled) return
        setData(d)
        setPrices({ google: String(d.prices?.google ?? ''), google_traffic: String(d.prices?.google_traffic ?? '') })
      })
      .catch((err) => !cancelled && setError(err.message))
    return () => {
      cancelled = true
    }
  }, [])

  async function savePrices(e) {
    e.preventDefault()
    setError('')
    setSaved('')
    const next = { google: Number(prices.google), google_traffic: Number(prices.google_traffic) }
    if (![next.google, next.google_traffic].every((n) => Number.isFinite(n) && n >= 0 && n < 1000)) {
      setError('Prices must be numbers between 0 and 1000.')
      return
    }
    try {
      await saveRoutePrices(next)
      setData((d) => ({ ...d, prices: next }))
      setSaved('Saved.')
    } catch (err) {
      setError(err.message)
    }
  }

  if (error && !data) return <p className="auth-error">{error}</p>
  if (!data) return <p className="list-row-sub">Loading…</p>

  const m = data.this_month
  const billed = (m.google ?? 0) + (m.google_traffic ?? 0)
  const cost = ((m.google ?? 0) * (data.prices?.google ?? 0) + (m.google_traffic ?? 0) * (data.prices?.google_traffic ?? 0)) / 1000
  const served = billed + (m.cache ?? 0)
  const cacheRate = served ? Math.round(((m.cache ?? 0) / served) * 100) : null
  const daily = data.daily.map((d) => ({ ...d, billed: d.google + d.google_traffic }))
  const nothingYet = daily.every((d) => d.billed + d.cache + d.limited + d.error === 0)

  return (
    <div>
      <h1 className="page-title">Usage &amp; costs</h1>
      {error && <p className="auth-error">{error}</p>}
      {nothingYet && (
        <p className="admin-warning">
          No route requests counted yet. Counting starts once the updated routes function is deployed (
          <code>supabase functions deploy routes</code>).
        </p>
      )}

      <h2 className="admin-h2">Google Routes this month</h2>
      <div className="admin-tiles">
        <div className="admin-tile tone-attention">
          <div className="admin-tile-label">Estimated Google cost</div>
          <div className="admin-tile-value">{usd(cost)}</div>
          <div className="admin-tile-sub">from the prices below; your Google bill is the real number</div>
        </div>
        <div className="admin-tile">
          <div className="admin-tile-label">Billed Google calls</div>
          <div className="admin-tile-value">{billed.toLocaleString()}</div>
          <div className="admin-tile-sub">{(m.google_traffic ?? 0).toLocaleString()} with live traffic (higher rate)</div>
        </div>
        <div className="admin-tile">
          <div className="admin-tile-label">Served from cache</div>
          <div className="admin-tile-value">{(m.cache ?? 0).toLocaleString()}</div>
          <div className="admin-tile-sub">{cacheRate == null ? 'no requests yet' : `${cacheRate}% of routes cost nothing`}</div>
        </div>
        <div className="admin-tile">
          <div className="admin-tile-label">Refused or failed</div>
          <div className="admin-tile-value">{((m.limited ?? 0) + (m.error ?? 0)).toLocaleString()}</div>
          <div className="admin-tile-sub">
            {(m.limited ?? 0).toLocaleString()} by rate limits · {(m.error ?? 0).toLocaleString()} errors
          </div>
        </div>
      </div>

      <h2 className="admin-h2">Last 30 days</h2>
      <div className="admin-charts">
        <DailyBars title="Billed Google calls" data={daily} field="billed" />
        <DailyBars title="Served from cache" data={daily} field="cache" />
        <DailyBars title="Refused by rate limits" data={daily} field="limited" />
      </div>

      <h2 className="admin-h2">Who&apos;s hitting the limits (last 24 hours)</h2>
      {data.rate_limits.length === 0 ? (
        <div className="admin-empty">No rate-limited activity in the last day.</div>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>What</th>
                <th>Who</th>
                <th className="num">Requests</th>
                <th className="num">Busiest window</th>
                <th className="num hide-sm">Limit</th>
              </tr>
            </thead>
            <tbody>
              {data.rate_limits.map((r) => {
                const { kind, who } = describeKey(r.key)
                const hit = kind && r.worst_window > kind.limit
                return (
                  <tr key={r.key}>
                    <td>{kind?.label ?? r.key}</td>
                    <td>
                      {r.username ? (
                        <Link to={`/app/admin/users/${r.key.match(/[0-9a-f-]{36}/)?.[0]}`}>{r.username}</Link>
                      ) : (
                        <span className="mono small">{who ?? (kind?.prefix === 'routes:google:global' ? 'everyone' : '–')}</span>
                      )}
                    </td>
                    <td className="num">{r.hits.toLocaleString()}</td>
                    <td className={'num' + (hit ? ' admin-danger-text strong' : '')}>
                      {r.worst_window.toLocaleString()}
                      {hit && ' · blocked'}
                    </td>
                    <td className="num hide-sm">{kind ? `${kind.limit} / ${kind.per}` : '–'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <h2 className="admin-h2">Google prices used for the estimate</h2>
      <p className="admin-hint">
        US dollars per 1,000 route calls. Check Google Cloud billing for your actual Routes API rates. Calls with live
        traffic colours are billed higher; they can be turned off with the <code>ROUTES_TRAFFIC_ON_POLYLINE</code>{' '}
        secret.
      </p>
      {prices && (
        <form className="admin-price-form" onSubmit={savePrices}>
          <label className="admin-field">
            <span>Standard call</span>
            <span className="admin-kes-input">
              $
              <input
                type="number"
                step="0.01"
                min="0"
                value={prices.google}
                onChange={(e) => setPrices((p) => ({ ...p, google: e.target.value }))}
              />
            </span>
          </label>
          <label className="admin-field">
            <span>With live traffic</span>
            <span className="admin-kes-input">
              $
              <input
                type="number"
                step="0.01"
                min="0"
                value={prices.google_traffic}
                onChange={(e) => setPrices((p) => ({ ...p, google_traffic: e.target.value }))}
              />
            </span>
          </label>
          <button type="submit" className="admin-btn primary">
            Save prices
          </button>
          {saved && <span className="admin-hint">{saved}</span>}
        </form>
      )}
    </div>
  )
}

export default Usage
