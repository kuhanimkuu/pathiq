import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { formatKes } from '../../lib/admin'
import { timeAgo } from '../../lib/roadReports'

function Tile({ label, value, sub, to, tone }) {
  const body = (
    <>
      <div className="admin-tile-label">{label}</div>
      <div className="admin-tile-value">{value ?? '–'}</div>
      {sub && <div className="admin-tile-sub">{sub}</div>}
      {to && <ArrowRight className="admin-tile-arrow" size={16} aria-hidden />}
    </>
  )
  const cls = 'admin-tile' + (tone ? ` tone-${tone}` : '')
  return to ? (
    <Link to={to} className={cls}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  )
}

const dayLabel = (d, opts = { weekday: 'short', day: 'numeric', month: 'short' }) =>
  new Date(d + 'T12:00:00').toLocaleDateString('en-KE', opts)

// One series, 14 daily bars. Small multiples rather than one chart with
// three scales; each has a per-bar hover/focus tooltip.
function DailyBars({ title, data, field }) {
  const [hover, setHover] = useState(null)
  const values = data.map((d) => d[field])
  const total = values.reduce((a, b) => a + b, 0)
  const max = Math.max(1, ...values)
  const W = 280
  const H = 96
  const gap = 2
  const bw = (W - gap * (data.length - 1)) / data.length
  const h = (v) => (v / max) * (H - 4)
  // Bar with a 4px rounded top, square on the baseline.
  const bar = (x, v) => {
    const bh = h(v)
    if (bh <= 0) return null
    const r = Math.min(4, bh, bw / 2)
    const y = H - bh
    return `M${x},${H} V${y + r} Q${x},${y} ${x + r},${y} H${x + bw - r} Q${x + bw},${y} ${x + bw},${y + r} V${H} Z`
  }

  return (
    <figure className="admin-chart">
      <figcaption>
        <span className="admin-chart-title">{title}</span>
        <span className="admin-chart-total">{total} in 14 days</span>
      </figcaption>
      <div className="admin-chart-plot">
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={`${title}: ${total} over the last 14 days`}>
          <line x1="0" x2={W} y1={H - 0.5} y2={H - 0.5} className="admin-chart-base" />
          {data.map((d, i) => {
            const x = i * (bw + gap)
            return (
              <g key={d.day}>
                <path d={bar(x, d[field])} className={'admin-chart-bar' + (hover === i ? ' hover' : '')} />
                <rect
                  x={x - gap / 2}
                  y="0"
                  width={bw + gap}
                  height={H}
                  fill="transparent"
                  tabIndex={0}
                  aria-label={`${dayLabel(d.day)}: ${d[field]}`}
                  onMouseEnter={() => setHover(i)}
                  onMouseLeave={() => setHover(null)}
                  onFocus={() => setHover(i)}
                  onBlur={() => setHover(null)}
                />
              </g>
            )
          })}
        </svg>
        {hover != null && (
          <div className="admin-chart-tip" style={{ left: `${((hover + 0.5) / data.length) * 100}%` }}>
            <strong>{data[hover][field]}</strong> {dayLabel(data[hover].day)}
          </div>
        )}
      </div>
      <div className="admin-chart-axis">
        <span>{dayLabel(data[0].day, { day: 'numeric', month: 'short' })}</span>
        <span>{hover == null ? 'Today' : ''}</span>
      </div>
    </figure>
  )
}

function Overview({ overview: o, error }) {
  const [asTable, setAsTable] = useState(false)
  if (error) return <p className="auth-error">{error}</p>
  if (!o) return <p className="list-row-sub">Loading…</p>

  const pending = o.pending_gems + o.pending_reports + o.pending_applications

  return (
    <div>
      <h1 className="page-title">Overview</h1>

      <h2 className="admin-h2">Needs you</h2>
      <div className="admin-tiles">
        <Tile
          label="Waiting for review"
          value={pending}
          tone={pending ? 'attention' : null}
          sub={
            pending
              ? `${o.pending_gems} gems · ${o.pending_reports} reports · ${o.pending_applications} application${o.pending_applications === 1 ? '' : 's'}` +
                (o.oldest_pending_at ? ` · oldest ${timeAgo(o.oldest_pending_at)}` : '')
              : 'All caught up'
          }
          to="/app/admin/review"
        />
        <Tile
          label="Owed to Scouts"
          value={formatKes(o.owed_kes)}
          tone={o.owed_kes ? 'attention' : null}
          sub={o.owed_scouts ? `${o.owed_scouts} Scout${o.owed_scouts === 1 ? '' : 's'} to pay` : 'Nothing owed'}
          to="/app/admin/payouts"
        />
        <Tile label="Paid this month" value={formatKes(o.paid_this_month_kes)} sub="via M-Pesa" to="/app/admin/payouts" />
      </div>

      <h2 className="admin-h2">People</h2>
      <div className="admin-tiles">
        <Tile label="Accounts" value={o.users} sub={`+${o.new_users_7d} this week`} to="/app/admin/users" />
        <Tile label="Guests" value={o.guests} sub="using the app without an account" />
        <Tile label="Scouts" value={o.scouts} sub={`${o.admins} admin${o.admins === 1 ? '' : 's'}`} to="/app/admin/users" />
        <Tile label="Trips this week" value={o.trips_7d} sub={`${o.active_drivers_7d} drivers`} />
      </div>

      <h2 className="admin-h2">On the map</h2>
      <div className="admin-tiles">
        <Tile label="Live Hidden Gems" value={o.verified_gems} to="/app/admin/gems" />
        <Tile label="Live road reports" value={o.live_reports} to="/app/admin/reports" />
      </div>

      <div className="admin-h2-row">
        <h2 className="admin-h2">Last 14 days</h2>
        <button className="admin-link-btn" onClick={() => setAsTable((v) => !v)}>
          {asTable ? 'Show charts' : 'Show as table'}
        </button>
      </div>
      {asTable ? (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Day</th>
                <th className="num">Trips</th>
                <th className="num">New accounts</th>
                <th className="num">Scout submissions</th>
              </tr>
            </thead>
            <tbody>
              {o.daily.map((d) => (
                <tr key={d.day}>
                  <td>{dayLabel(d.day)}</td>
                  <td className="num">{d.trips}</td>
                  <td className="num">{d.signups}</td>
                  <td className="num">{d.submissions}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="admin-charts">
          <DailyBars title="Trips started" data={o.daily} field="trips" />
          <DailyBars title="New accounts" data={o.daily} field="signups" />
          <DailyBars title="Scout submissions" data={o.daily} field="submissions" />
        </div>
      )}
    </div>
  )
}

export default Overview
