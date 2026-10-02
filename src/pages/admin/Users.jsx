import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search } from 'lucide-react'
import { useAuth } from '../../context/useAuth'
import { fetchUsers, formatKes } from '../../lib/admin'
import { timeAgo } from '../../lib/roadReports'
import { Pager, Segmented } from './AdminUi'
import { useDebounced } from './adminUtils'

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
  { value: 'suspended', label: 'Suspended first' },
]

function RolePill({ role, guest }) {
  if (guest) return <span className="admin-pill role-guest">Guest</span>
  return <span className={`admin-pill role-${role}`}>{role[0].toUpperCase() + role.slice(1)}</span>
}

function Users() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [role, setRole] = useState(null)
  const [sort, setSort] = useState('newest')
  const [includeGuests, setIncludeGuests] = useState(false)
  const [search, setSearch] = useState('')
  const debounced = useDebounced(search)
  const [page, setPage] = useState(0)
  const [data, setData] = useState({ rows: [], total: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

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
  }, [debounced, role, includeGuests, sort, page])

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
                <tr key={u.id} onClick={() => navigate(`/app/admin/users/${u.id}`)}>
                  <td>
                    <button type="button" className="admin-row-btn" onClick={() => navigate(`/app/admin/users/${u.id}`)}>
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
                    {u.suspended_until && <span className="admin-pill status-rejected admin-pill-gap">Suspended</span>}
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

    </div>
  )
}

export default Users
