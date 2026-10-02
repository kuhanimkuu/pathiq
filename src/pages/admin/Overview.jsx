import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { formatKes } from '../../lib/admin'
import { timeAgo } from '../../lib/roadReports'
import DailyBars from './DailyBars'
import { dayLabel } from './adminUtils'

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
