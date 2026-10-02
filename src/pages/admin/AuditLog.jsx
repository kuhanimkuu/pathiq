import { useEffect, useState } from 'react'
import { fetchAuditLog, formatKes, TASK_LABELS } from '../../lib/admin'
import { reportTypeLabel } from '../../lib/roadReports'
import { Segmented } from './AdminUi'
import { formatDate } from './adminUtils'

const TABLES = [
  { value: null, label: 'Everything' },
  { value: 'gems', label: 'Gems' },
  { value: 'road_reports', label: 'Road reports' },
  { value: 'scout_applications', label: 'Applications' },
  { value: 'scout_earnings', label: 'Earnings' },
  { value: 'task_rates', label: 'Rates' },
  { value: 'profiles', label: 'Roles' },
]

const NOUN = {
  gems: 'gem',
  road_reports: 'road report',
  scout_applications: 'Scout application from',
  scout_earnings: 'earning',
  task_rates: 'pay rate for',
  profiles: '',
}

function targetName(e) {
  if (e.target_table === 'road_reports') return reportTypeLabel(e.summary)
  if (e.target_table === 'task_rates') return TASK_LABELS[e.summary] ?? e.summary
  return e.summary
}

// "approved gem Mama Oliech's", "changed the pay rate for Flood survey: KSh 500 → KSh 600"…
function describe(e) {
  const d = e.details ?? {}
  const noun = NOUN[e.target_table] ?? e.target_table
  const name = targetName(e)
  const [verb, arg] = e.action.split(':')
  if (verb === 'role') return `made ${name} ${arg === 'admin' ? 'an admin' : `a ${arg}`} (was ${d.role?.from})`
  if (e.target_table === 'task_rates' && d.amount_kes) {
    return `changed the pay rate for ${name}: ${formatKes(d.amount_kes.from)} → ${formatKes(d.amount_kes.to)}`
  }
  if (e.target_table === 'scout_earnings') {
    const task = TASK_LABELS[d.task] ?? d.task
    const amount = formatKes(d.amount_kes?.to ?? d.amount_kes)
    if (verb === 'create') return `approved ${amount} for ${name ?? 'a Scout'} (${task})`
    if (arg === 'paid') return `paid ${name ?? 'a Scout'} ${amount} for ${task} (M-Pesa ${d.mpesa_ref?.to ?? ''})`
  }
  if (verb === 'create') return `added ${noun} ${name}`
  if (verb === 'delete') return `deleted ${noun} ${name}`
  if (verb === 'status') {
    const wasPending = d.status?.from === 'pending'
    if (arg === 'verified') return `${wasPending ? 'approved' : 'restored'} ${noun} ${name}`
    if (arg === 'rejected') return `${wasPending ? 'rejected' : 'hid'} ${noun} ${name}`
    return `set ${noun} ${name} to ${arg}`
  }
  if (d.expires_at && Object.keys(d).length <= 2) return `cleared ${noun} ${name} (road fixed)`
  const fields = Object.keys(d).filter((k) => !['verified_by', 'reviewed_by'].includes(k))
  return `edited ${noun} ${name}${fields.length ? ` (${fields.join(', ').replace(/_/g, ' ')})` : ''}`
}

function Details({ details }) {
  const entries = Object.entries(details ?? {}).filter(([k]) => !['id', 'verified_by', 'reviewed_by'].includes(k))
  if (!entries.length) return null
  return (
    <dl className="admin-audit-details">
      {entries.map(([k, v]) => (
        <div key={k}>
          <dt>{k.replace(/_/g, ' ')}</dt>
          <dd>
            {v && typeof v === 'object' && 'to' in v ? (
              <>
                <s>{String(v.from ?? '–')}</s> → {String(v.to ?? '–')}
              </>
            ) : (
              String(v ?? '–')
            )}
          </dd>
        </div>
      ))}
    </dl>
  )
}

function AuditLog() {
  const [table, setTable] = useState(null)
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [more, setMore] = useState(false)
  const [error, setError] = useState('')
  const [open, setOpen] = useState(null)

  useEffect(() => {
    let cancelled = false
    fetchAuditLog({ table })
      .then((rows) => {
        if (cancelled) return
        setEntries(rows)
        setMore(rows.length === 50)
        setError('')
      })
      .catch((err) => !cancelled && setError(err.message))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [table])

  async function loadMore() {
    try {
      const rows = await fetchAuditLog({ table, before: entries.at(-1).id })
      setEntries((cur) => [...cur, ...rows])
      setMore(rows.length === 50)
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div>
      <h1 className="page-title">Audit log</h1>
      <p className="admin-hint">
        Every change an admin makes to gems, reports, applications, earnings, rates and roles. It can&apos;t be edited or
        deleted, even by admins.
      </p>
      <div className="admin-toolbar">
        <Segmented
          label="Show"
          options={TABLES}
          value={table}
          onChange={(t) => {
            setLoading(true)
            setTable(t)
          }}
        />
      </div>
      {error && <p className="auth-error">{error}</p>}
      {loading ? (
        <p className="list-row-sub">Loading…</p>
      ) : entries.length === 0 ? (
        <div className="admin-empty">Nothing logged yet.</div>
      ) : (
        <ul className="admin-audit">
          {entries.map((e) => (
            <li key={e.id}>
              <button type="button" onClick={() => setOpen(open === e.id ? null : e.id)} aria-expanded={open === e.id}>
                <span className="admin-audit-when">{formatDate(e.created_at)}</span>
                <span>
                  <strong>{e.admin?.username ?? 'removed admin'}</strong> {describe(e)}
                </span>
              </button>
              {open === e.id && <Details details={e.details} />}
            </li>
          ))}
        </ul>
      )}
      {more && !loading && (
        <button className="admin-btn" onClick={loadMore}>
          Load older
        </button>
      )}
    </div>
  )
}

export default AuditLog
