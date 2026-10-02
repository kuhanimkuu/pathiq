import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus } from 'lucide-react'
import {
  fetchRoadReports,
  saveRoadReport,
  setReportStatus,
  clearRoadReport,
  deleteRoadReport,
} from '../../lib/admin'
import { REPORT_STYLE } from '../../lib/placeStyles'
import { ReportBadge } from '../../components/PlaceIcons'
import { reportTypeLabel, timeAgo } from '../../lib/roadReports'
import { LocationField } from './AdminMap'
import { Dialog, Pager, ReasonDialog, ReviewPhoto, Segmented, StatusPill } from './AdminUi'
import { formatDate } from './adminUtils'

// "Live" and "Expired" are both verified; the split is on expires_at.
const FILTERS = [
  { value: 'live', label: 'Live', args: { status: 'verified', live: true } },
  { value: 'pending', label: 'Pending', args: { status: 'pending' } },
  { value: 'expired', label: 'Expired', args: { status: 'verified', live: false } },
  { value: 'rejected', label: 'Hidden', args: { status: 'rejected' } },
  { value: 'all', label: 'All', args: {} },
]

const displayStatus = (r) => (r.status === 'verified' && !r.is_live ? 'expired' : r.status)

// <input type="date"> value from an ISO time, and back (end of that day, Nairobi).
const toDateInput = (iso) => (iso ? new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' }) : '')
const fromDateInput = (d) => (d ? new Date(`${d}T23:59:00+03:00`).toISOString() : null)

function ReportEditor({ report, onClose, onSaved }) {
  const isNew = !report.id
  const [type, setType] = useState(report.type ?? 'pothole')
  const [severity, setSeverity] = useState(report.severity ?? 3)
  const [description, setDescription] = useState(report.description ?? '')
  const [expires, setExpires] = useState(toDateInput(report.expires_at))
  const [loc, setLoc] = useState(report.lat != null ? { lat: report.lat, lng: report.lng } : null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [hiding, setHiding] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  async function run(fn) {
    setBusy(true)
    setError('')
    try {
      await fn()
      onSaved()
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  function submit(e) {
    e.preventDefault()
    if (!loc) {
      setError('Set the location on the map first.')
      return
    }
    const expiresAt = expires !== toDateInput(report.expires_at) ? fromDateInput(expires) : null
    run(() => saveRoadReport({ id: report.id, type, severity, description, lat: loc.lat, lng: loc.lng, expiresAt }))
  }

  return (
    <Dialog title={isNew ? 'Add a road report' : 'Edit road report'} onClose={onClose} wide>
      <form onSubmit={submit} className="admin-editor">
        <div className="admin-editor-fields">
          {!isNew && (
            <div className="admin-editor-meta">
              <StatusPill status={displayStatus(report)} /> Reported by {report.reporter_username ?? 'unknown'} ·{' '}
              {formatDate(report.created_at)}
            </div>
          )}
          {report.review_note && <p className="admin-hint">Note: {report.review_note}</p>}
          <label className="admin-field">
            <span>Type</span>
            <select className="form-select" value={type} onChange={(e) => setType(e.target.value)}>
              {Object.keys(REPORT_STYLE).map((key) => (
                <option key={key} value={key}>
                  {reportTypeLabel(key)}
                </option>
              ))}
            </select>
          </label>
          <div className="admin-field">
            <span>Severity</span>
            <Segmented
              label="Severity"
              value={severity}
              onChange={setSeverity}
              options={[1, 2, 3, 4, 5].map((n) => ({ value: n, label: String(n) }))}
            />
          </div>
          <label className="admin-field">
            <span>Description</span>
            <textarea
              className="form-textarea"
              rows={3}
              maxLength={1000}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>
          <label className="admin-field">
            <span>{isNew ? 'Expires (blank = the usual time for this type)' : 'Expires'}</span>
            <input className="form-input" type="date" value={expires} onChange={(e) => setExpires(e.target.value)} />
          </label>
          {report.photo_path && <ReviewPhoto path={report.photo_path} />}
        </div>
        <LocationField value={loc} onChange={setLoc} kind="report" type={type} severity={severity} />

        {error && <p className="auth-error">{error}</p>}
        <div className="admin-dialog-actions">
          {!isNew && report.is_live && (
            <button type="button" className="admin-btn" disabled={busy} onClick={() => run(() => clearRoadReport(report.id))}>
              Road fixed: clear it
            </button>
          )}
          {!isNew && report.status === 'verified' && (
            <button type="button" className="admin-btn" disabled={busy} onClick={() => setHiding(true)}>
              Hide
            </button>
          )}
          {!isNew && (report.status === 'rejected' || (report.status === 'verified' && !report.is_live)) && (
            <button
              type="button"
              className="admin-btn"
              disabled={busy}
              onClick={() => run(() => setReportStatus(report.id, 'verified'))}
            >
              Put back on map
            </button>
          )}
          {!isNew && report.status === 'pending' && (
            <Link className="admin-btn" to="/app/admin/review">
              Review in queue
            </Link>
          )}
          {!isNew &&
            (confirmDelete ? (
              <button
                type="button"
                className="admin-btn danger"
                disabled={busy}
                onClick={() => run(() => deleteRoadReport(report.id))}
              >
                Really delete?
              </button>
            ) : (
              <button type="button" className="admin-btn ghost-danger" onClick={() => setConfirmDelete(true)}>
                Delete
              </button>
            ))}
          <span className="admin-spacer" />
          <button type="button" className="admin-btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="admin-btn primary" disabled={busy}>
            {isNew ? 'Add to map' : 'Save'}
          </button>
        </div>
      </form>
      {hiding && (
        <ReasonDialog
          title="Hide this report?"
          confirmLabel="Hide"
          placeholder="e.g. Wrong location, not a real hazard…"
          onClose={() => setHiding(false)}
          onConfirm={(note) => {
            setHiding(false)
            run(() => setReportStatus(report.id, 'rejected', note))
          }}
        />
      )}
    </Dialog>
  )
}

function ReportsManager({ onChanged }) {
  const [filter, setFilter] = useState('live')
  const [type, setType] = useState(null)
  const [page, setPage] = useState(0)
  const [data, setData] = useState({ rows: [], total: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(null)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    const { args } = FILTERS.find((f) => f.value === filter)
    fetchRoadReports({ ...args, type, page })
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
  }, [filter, type, page, reloadKey])

  const change = (fn) => (v) => {
    setLoading(true)
    setPage(0)
    fn(v)
  }

  return (
    <div>
      <div className="admin-title-row">
        <h1 className="page-title">Road reports</h1>
        <button className="admin-btn primary" onClick={() => setEditing({})}>
          <Plus size={16} /> Add report
        </button>
      </div>

      <div className="admin-toolbar">
        <Segmented label="Status" options={FILTERS} value={filter} onChange={change(setFilter)} />
        <select
          className="form-select admin-inline-select"
          value={type ?? ''}
          aria-label="Type"
          onChange={(e) => change(setType)(e.target.value || null)}
        >
          <option value="">All types</option>
          {Object.keys(REPORT_STYLE).map((key) => (
            <option key={key} value={key}>
              {reportTypeLabel(key)}
            </option>
          ))}
        </select>
      </div>

      {error && <p className="auth-error">{error}</p>}
      {loading ? (
        <p className="list-row-sub">Loading…</p>
      ) : data.rows.length === 0 ? (
        <div className="admin-empty">No road reports match.</div>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table clickable">
            <thead>
              <tr>
                <th>Report</th>
                <th>Status</th>
                <th className="hide-sm">Expires</th>
                <th className="hide-sm">Reported by</th>
                <th className="hide-sm">Reported</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => (
                <tr key={r.id} onClick={() => setEditing(r)}>
                  <td>
                    <button type="button" className="admin-row-btn" onClick={() => setEditing(r)}>
                      <ReportBadge type={r.type} severity={r.severity} size={24} />
                      <span>
                        <span className="admin-queue-title">
                          {reportTypeLabel(r.type)} · severity {r.severity}
                        </span>
                        {r.description && <span className="admin-queue-sub">{r.description}</span>}
                      </span>
                    </button>
                  </td>
                  <td>
                    <StatusPill status={displayStatus(r)} />
                  </td>
                  <td className="hide-sm">{r.expires_at ? formatDate(r.expires_at) : 'Never'}</td>
                  <td className="hide-sm">{r.reporter_username ?? '–'}</td>
                  <td className="hide-sm">{timeAgo(r.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pager page={page} total={data.total} onPage={change(setPage)} />

      {editing && (
        <ReportEditor
          report={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            setReloadKey((k) => k + 1)
            onChanged()
          }}
        />
      )}
    </div>
  )
}

export default ReportsManager
