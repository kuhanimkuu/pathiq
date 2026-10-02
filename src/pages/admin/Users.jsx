import { useEffect, useState } from 'react'
import { Search } from 'lucide-react'
import { useAuth } from '../../context/useAuth'
import { fetchUsers, setUserRole, formatKes } from '../../lib/admin'
import { timeAgo } from '../../lib/roadReports'
import { Dialog, Pager, Segmented } from './AdminUi'
import { formatDate, useDebounced } from './adminUtils'

const ROLE_FILTERS = [
  { value: null, label: 'Everyone' },
  { value: 'driver', label: 'Drivers' },
  { value: 'scout', label: 'Scouts' },
  { value: 'admin', label: 'Admins' },
]

const SORTS = [
  { value: 'newest', label: 'Newest first' },
  { value: 'submissions', label: 'Top Scouts (approved submissions)' },
  { value: 'owed', label: 'Most owed' },
]

const ROLE_HELP = {
  driver: 'Uses the map and gems. Can’t submit reports.',
  scout: 'Can submit road reports and gems, and gets paid for approved ones.',
  admin: 'Full access to this dashboard: reviews, edits, users and payouts.',
}

function RolePill({ role, guest }) {
  if (guest) return <span className="admin-pill role-guest">Guest</span>
  return <span className={`admin-pill role-${role}`}>{role[0].toUpperCase() + role.slice(1)}</span>
}

function UserDialog({ user, isSelf, onClose, onChanged }) {
  const [role, setRole] = useState(user.role)
  const [pending, setPending] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function apply() {
    setBusy(true)
    setError('')
    try {
      const updated = await setUserRole(user.id, pending)
      setRole(updated.role)
      setPending(null)
      onChanged()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const approvalRate = user.submissions ? Math.round((user.verified_submissions / user.submissions) * 100) : null

  return (
    <Dialog title={user.display_name || user.username} onClose={onClose}>
      <div className="admin-editor-meta">
        <RolePill role={role} guest={user.is_guest} /> @{user.username}
      </div>
      <dl className="admin-dl two-col">
        <dt>Email</dt>
        <dd>{user.email || (user.is_guest ? 'Guest, no email' : '–')}</dd>
        <dt>Joined</dt>
        <dd>{formatDate(user.created_at)}</dd>
        <dt>Last signed in</dt>
        <dd>{user.last_sign_in_at ? timeAgo(user.last_sign_in_at) : '–'}</dd>
        <dt>Trips (30 days)</dt>
        <dd>{user.trips_30d}</dd>
        <dt>IQ Score</dt>
        <dd>{user.iq_score ?? '–'}</dd>
        {(user.submissions > 0 || role === 'scout') && (
          <>
            <dt>Submissions</dt>
            <dd>
              {user.verified_submissions} approved of {user.submissions}
              {approvalRate != null && ` (${approvalRate}%)`}
            </dd>
            <dt>Earned</dt>
            <dd>
              {formatKes(user.earned_kes)}
              {user.owed_kes > 0 && `, ${formatKes(user.owed_kes)} still owed`}
            </dd>
            <dt>M-Pesa</dt>
            <dd className="mono">{user.mpesa_phone || '–'}</dd>
          </>
        )}
        <dt>User ID</dt>
        <dd className="mono small">{user.id}</dd>
      </dl>

      <h3 className="admin-h3">Role</h3>
      {isSelf ? (
        <p className="admin-hint">You can&apos;t change your own role. Another admin has to.</p>
      ) : user.is_guest ? (
        <p className="admin-hint">Guests need a real account before they can be a Scout or admin.</p>
      ) : (
        <>
          <Segmented
            label="Role"
            value={pending ?? role}
            onChange={(r) => setPending(r === role ? null : r)}
            options={['driver', 'scout', 'admin'].map((r) => ({ value: r, label: r[0].toUpperCase() + r.slice(1) }))}
          />
          <p className="admin-hint">{ROLE_HELP[pending ?? role]}</p>
          {pending && (
            <div className="admin-confirm">
              Change {user.username} from {role} to {pending}?
              <button className="admin-btn primary small" disabled={busy} onClick={apply}>
                Yes, change
              </button>
              <button className="admin-btn small" onClick={() => setPending(null)}>
                Cancel
              </button>
            </div>
          )}
          {role === 'scout' && pending === 'driver' && user.owed_kes > 0 && (
            <p className="admin-warning">They&apos;re still owed {formatKes(user.owed_kes)}. That stays in Payouts.</p>
          )}
        </>
      )}
      {error && <p className="auth-error">{error}</p>}
    </Dialog>
  )
}

function Users({ onChanged }) {
  const { profile } = useAuth()
  const [role, setRole] = useState(null)
  const [sort, setSort] = useState('newest')
  const [includeGuests, setIncludeGuests] = useState(false)
  const [search, setSearch] = useState('')
  const debounced = useDebounced(search)
  const [page, setPage] = useState(0)
  const [data, setData] = useState({ rows: [], total: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [open, setOpen] = useState(null)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    fetchUsers({ search: debounced, role, includeGuests, sort, page })
      .then((d) => {
        if (cancelled) return
        setData(d)
        setError('')
      })
      .catch((err) => !cancelled && setError(err.message))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [debounced, role, includeGuests, sort, page, reloadKey])

  const change = (fn) => (v) => {
    setLoading(true)
    setPage(0)
    fn(v)
  }

  return (
    <div>
      <h1 className="page-title">Users &amp; Scouts</h1>
      <div className="admin-toolbar">
        <Segmented label="Role" options={ROLE_FILTERS} value={role} onChange={change(setRole)} />
        <select
          className="form-select admin-inline-select"
          value={sort}
          aria-label="Sort"
          onChange={(e) => change(setSort)(e.target.value)}
        >
          {SORTS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        <label className="admin-check">
          <input type="checkbox" checked={includeGuests} onChange={(e) => change(setIncludeGuests)(e.target.checked)} />
          Include guests
        </label>
        <label className="admin-search">
          <Search size={16} />
          <input
            type="search"
            placeholder="Username, name, email or ID"
            value={search}
            onChange={(e) => {
              setPage(0)
              setSearch(e.target.value)
            }}
          />
        </label>
      </div>

      {error && <p className="auth-error">{error}</p>}
      {loading ? (
        <p className="list-row-sub">Loading…</p>
      ) : data.rows.length === 0 ? (
        <div className="admin-empty">No users match.</div>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table clickable">
            <thead>
              <tr>
                <th>User</th>
                <th>Role</th>
                <th className="num hide-sm">Trips 30d</th>
                <th className="num hide-sm">IQ</th>
                <th className="num">Approved</th>
                <th className="num hide-sm">Owed</th>
                <th className="hide-sm">Joined</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((u) => (
                <tr key={u.id} onClick={() => setOpen(u)}>
                  <td>
                    <button type="button" className="admin-row-btn" onClick={() => setOpen(u)}>
                      <span>
                        <span className="admin-queue-title">
                          {u.display_name || u.username}
                          {u.id === profile.id && ' (you)'}
                        </span>
                        <span className="admin-queue-sub">{u.email || `@${u.username}`}</span>
                      </span>
                    </button>
                  </td>
                  <td>
                    <RolePill role={u.role} guest={u.is_guest} />
                  </td>
                  <td className="num hide-sm">{u.trips_30d}</td>
                  <td className="num hide-sm">{u.iq_score ?? '–'}</td>
                  <td className="num">{u.submissions ? `${u.verified_submissions}/${u.submissions}` : '–'}</td>
                  <td className="num hide-sm">{u.owed_kes ? formatKes(u.owed_kes) : '–'}</td>
                  <td className="hide-sm">{timeAgo(u.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pager page={page} total={data.total} onPage={change(setPage)} />

      {open && (
        <UserDialog
          user={open}
          isSelf={open.id === profile.id}
          onClose={() => setOpen(null)}
          onChanged={() => {
            setReloadKey((k) => k + 1)
            onChanged()
          }}
        />
      )}
    </div>
  )
}

export default Users
