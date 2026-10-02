import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Ban, ShieldCheck } from 'lucide-react'
import { useAuth } from '../../context/useAuth'
import { fetchUserDetail, setUserRole, suspendUser, unsuspendUser, formatKes, TASK_LABELS } from '../../lib/admin'
import { reportTypeLabel, timeAgo } from '../../lib/roadReports'
import { gemStyle } from '../../lib/placeStyles'
import { GemBadge, ReportBadge } from '../../components/PlaceIcons'
import { Dialog, Segmented, StatusPill } from './AdminUi'
import { AuditList } from './AuditLog'
import { formatDate, suspendedUntilText } from './adminUtils'

const ROLE_HELP = {
  driver: 'Uses the map and gems. Can’t submit reports.',
  scout: 'Can submit road reports and gems, and gets paid for approved ones.',
  admin: 'Full access to this dashboard: reviews, edits, users and payouts.',
}
const cap = (s) => s[0].toUpperCase() + s.slice(1)

const DURATIONS = [
  { value: 1, label: '1 day' },
  { value: 7, label: '7 days' },
  { value: 30, label: '30 days' },
  { value: null, label: 'Until lifted' },
]

function SuspendDialog({ name, onClose, onConfirm }) {
  const [days, setDays] = useState(7)
  const [reason, setReason] = useState('')
  return (
    <Dialog title={`Suspend ${name}?`} onClose={onClose}>
      <p className="admin-body-text">
        They can keep using the map, but can&apos;t submit gems or road reports, upload photos, rate places or apply to be
        a Scout. They see the reason in the app.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          onConfirm(days == null ? null : new Date(Date.now() + days * 86_400_000).toISOString(), reason.trim())
        }}
      >
        <div className="admin-field">
          <span>For how long</span>
          <Segmented label="Duration" value={days} onChange={setDays} options={DURATIONS} />
        </div>
        <label className="admin-field">
          <span>Reason (they see this)</span>
          <textarea
            className="form-textarea"
            rows={3}
            maxLength={500}
            required
            value={reason}
            placeholder="e.g. Repeated fake road reports"
            onChange={(e) => setReason(e.target.value)}
          />
        </label>
        <div className="admin-dialog-actions">
          <button type="button" className="admin-btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="admin-btn danger" disabled={!reason.trim()}>
            Suspend
          </button>
        </div>
      </form>
    </Dialog>
  )
}

const TABS = [
  { value: 'submissions', label: 'Submissions' },
  { value: 'trips', label: 'Trips' },
  { value: 'earnings', label: 'Earnings' },
  { value: 'activity', label: 'Admin history' },
]

function UserDetail({ onChanged }) {
  const { id } = useParams()
  const { profile: me } = useAuth()
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [tab, setTab] = useState('submissions')
  const [pendingRole, setPendingRole] = useState(null)
  const [suspending, setSuspending] = useState(false)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setData(await fetchUserDetail(id))
  }, [id])

  useEffect(() => {
    let cancelled = false
    fetchUserDetail(id)
      .then((d) => !cancelled && setData(d))
      .catch((err) => !cancelled && setError(err.message))
    return () => {
      cancelled = true
    }
  }, [id])

  async function act(fn) {
    setBusy(true)
    setError('')
    try {
      await fn()
      await load()
      onChanged()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  if (error && !data) return <p className="auth-error">{error}</p>
  if (!data) return <p className="list-row-sub">Loading…</p>
  const { profile: p, stats, submissions, trips, earnings, application, audit } = data
  const isSelf = p.id === me?.id
  const name = p.display_name || p.username

  return (
    <div>
      <Link to="/app/admin/users" className="admin-back">
        <ArrowLeft size={15} /> Users &amp; Scouts
      </Link>
      <div className="admin-detail-title">
        <div className="admin-avatar">{name[0]?.toUpperCase()}</div>
        <div>
          <h1>
            {name}
            {isSelf && ' (you)'}
          </h1>
          <div className="admin-editor-meta">
            {p.is_guest ? (
              <span className="admin-pill role-guest">Guest</span>
            ) : (
              <span className={`admin-pill role-${p.role}`}>{cap(p.role)}</span>
            )}
            {p.suspended && <span className="admin-pill status-rejected">Suspended</span>}@{p.username}
            {p.email && ` · ${p.email}`}
            {p.sign_in_with.length > 0 && ` · signs in with ${p.sign_in_with.join(', ').replace('email', 'password')}`}
          </div>
          <div className="admin-editor-meta">
            Joined {formatDate(p.created_at)} · last signed in {p.last_sign_in_at ? timeAgo(p.last_sign_in_at) : '–'}
            {p.mpesa_phone && (
              <>
                {' '}
                · M-Pesa <span className="mono">{p.mpesa_phone}</span>
              </>
            )}
          </div>
        </div>
      </div>
      {error && <p className="auth-error">{error}</p>}

      {p.suspended && (
        <div className="admin-warning admin-suspended">
          <Ban size={16} />
          <span>
            Suspended {suspendedUntilText(p.suspended_until)}: “{p.suspension_reason}”
          </span>
          <button className="admin-btn small" disabled={busy} onClick={() => act(() => unsuspendUser(p.id))}>
            Lift suspension
          </button>
        </div>
      )}

      <div className="admin-tiles compact">
        <div className="admin-tile">
          <div className="admin-tile-label">Trips (30 days)</div>
          <div className="admin-tile-value">{stats.trips_30d}</div>
          <div className="admin-tile-sub">
            {stats.arrived_30d} arrived · {stats.trips_total} all time
          </div>
        </div>
        <div className="admin-tile">
          <div className="admin-tile-label">IQ Score</div>
          <div className="admin-tile-value">{p.iq_score ?? '–'}</div>
        </div>
        <div className="admin-tile">
          <div className="admin-tile-label">Saved gems · ratings</div>
          <div className="admin-tile-value">
            {stats.saved_gems} · {stats.ratings}
          </div>
          <div className="admin-tile-sub">{stats.pinned_places} pinned places</div>
        </div>
        {(p.role === 'scout' || stats.earned_kes > 0) && (
          <div className="admin-tile">
            <div className="admin-tile-label">Earned</div>
            <div className="admin-tile-value">{formatKes(stats.earned_kes)}</div>
            <div className="admin-tile-sub">
              {formatKes(stats.paid_kes)} paid · {formatKes(stats.owed_kes)} owed
            </div>
          </div>
        )}
      </div>

      <div className="admin-detail-grid narrow-right">
        <div>
          <div className="admin-toolbar">
            <Segmented label="Show" value={tab} onChange={setTab} options={TABS} />
          </div>
          {tab === 'submissions' &&
            (submissions.length === 0 ? (
              <div className="admin-empty">No gems or road reports submitted.</div>
            ) : (
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <tbody>
                    {submissions.map((s) => (
                      <tr key={s.id}>
                        <td>
                          <span className="admin-row-btn">
                            {s.kind === 'gem' ? (
                              <GemBadge category={s.detail} size={22} />
                            ) : (
                              <ReportBadge type={s.title} severity={Number(s.detail)} size={22} />
                            )}
                            <span>
                              {s.kind === 'gem' ? (
                                <Link to={`/app/admin/gems/${s.id}`} className="admin-queue-title">
                                  {s.title}
                                </Link>
                              ) : (
                                <span className="admin-queue-title">
                                  {reportTypeLabel(s.title)} · severity {s.detail}
                                </span>
                              )}
                              <span className="admin-queue-sub">
                                {s.kind === 'gem' ? gemStyle(s.detail).label : 'Road report'}
                                {s.review_note && ` · “${s.review_note}”`}
                              </span>
                            </span>
                          </span>
                        </td>
                        <td>
                          <StatusPill status={s.status} />
                        </td>
                        <td className="hide-sm">{timeAgo(s.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          {tab === 'trips' &&
            (trips.length === 0 ? (
              <div className="admin-empty">No trips.</div>
            ) : (
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>To</th>
                      <th>Started</th>
                      <th className="num hide-sm">Distance</th>
                      <th className="num hide-sm">Road score</th>
                      <th>Outcome</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trips.map((t) => (
                      <tr key={t.id}>
                        <td>{t.destination_name || '–'}</td>
                        <td>{formatDate(t.started_at)}</td>
                        <td className="num hide-sm">{t.distance_m ? `${(t.distance_m / 1000).toFixed(1)} km` : '–'}</td>
                        <td className="num hide-sm">{t.road_quality ?? '–'}</td>
                        <td>
                          {!t.ended_at ? 'In progress' : t.arrived ? 'Arrived' : 'Ended early'}
                          {t.reroutes > 0 && ` · ${t.reroutes} reroute${t.reroutes === 1 ? '' : 's'}`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          {tab === 'earnings' &&
            (earnings.length === 0 ? (
              <div className="admin-empty">No earnings.</div>
            ) : (
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Task</th>
                      <th className="num">Amount</th>
                      <th>Status</th>
                      <th className="hide-sm">M-Pesa code</th>
                      <th className="hide-sm">When</th>
                    </tr>
                  </thead>
                  <tbody>
                    {earnings.map((e) => (
                      <tr key={e.id}>
                        <td>{TASK_LABELS[e.task] ?? e.task}</td>
                        <td className="num">{formatKes(e.amount_kes)}</td>
                        <td>{e.status === 'paid' ? 'Paid' : e.status === 'approved' ? 'Owed' : 'Pending'}</td>
                        <td className="mono hide-sm">{e.mpesa_ref ?? '–'}</td>
                        <td className="hide-sm">{formatDate(e.paid_at ?? e.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          {tab === 'activity' && <AuditList entries={audit} empty="No admin changes involving this person." />}
        </div>

        <div className="admin-side-panel">
          <h2 className="admin-h3">
            <ShieldCheck size={15} /> Role
          </h2>
          {isSelf ? (
            <p className="admin-hint">You can&apos;t change your own role. Another admin has to.</p>
          ) : p.is_guest ? (
            <p className="admin-hint">Guests need a real account before they can be a Scout or admin.</p>
          ) : (
            <>
              <Segmented
                label="Role"
                value={pendingRole ?? p.role}
                onChange={(r) => setPendingRole(r === p.role ? null : r)}
                options={['driver', 'scout', 'admin'].map((r) => ({ value: r, label: cap(r) }))}
              />
              <p className="admin-hint">{ROLE_HELP[pendingRole ?? p.role]}</p>
              {pendingRole && (
                <div className="admin-confirm">
                  Change from {p.role} to {pendingRole}?
                  <button
                    className="admin-btn primary small"
                    disabled={busy}
                    onClick={() => act(async () => {
                      await setUserRole(p.id, pendingRole)
                      setPendingRole(null)
                    })}
                  >
                    Yes, change
                  </button>
                  <button className="admin-btn small" onClick={() => setPendingRole(null)}>
                    Cancel
                  </button>
                </div>
              )}
            </>
          )}

          {application && (
            <>
              <h2 className="admin-h3">Scout application</h2>
              <p className="admin-body-text">
                <StatusPill status={application.status} /> {application.area} · {formatDate(application.created_at)}
                {application.motivation && <><br />“{application.motivation}”</>}
                {application.review_note && <><br />Note: {application.review_note}</>}
              </p>
            </>
          )}

          {!isSelf && p.role !== 'admin' && !p.suspended && (
            <>
              <h2 className="admin-h3">
                <Ban size={15} /> Suspend
              </h2>
              <p className="admin-hint">Stops them adding or rating anything. They can still use the map.</p>
              <button className="admin-btn ghost-danger" onClick={() => setSuspending(true)}>
                Suspend {name}
              </button>
            </>
          )}
        </div>
      </div>

      {suspending && (
        <SuspendDialog
          name={name}
          onClose={() => setSuspending(false)}
          onConfirm={(until, reason) => {
            setSuspending(false)
            act(() => suspendUser(p.id, until, reason))
          }}
        />
      )}
    </div>
  )
}

export default UserDetail
