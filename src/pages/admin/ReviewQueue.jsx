import { useCallback, useEffect, useMemo, useState } from 'react'
import { Check, X, TriangleAlert } from 'lucide-react'
import {
  fetchGems,
  fetchRoadReports,
  fetchPendingScoutApplications,
  reviewGem,
  reviewRoadReport,
  reviewScoutApplication,
} from '../../lib/admin'
import { reportTypeLabel, timeAgo } from '../../lib/roadReports'
import { gemStyle } from '../../lib/placeStyles'
import { GemBadge, ReportBadge } from '../../components/PlaceIcons'
import AdminMap from './AdminMap'
import { ReviewPhoto, ReasonDialog, Segmented } from './AdminUi'

const KINDS = {
  gems: {
    load: async () => (await fetchGems({ status: 'pending' })).rows,
    review: reviewGem,
    empty: 'No gems waiting.',
    title: (g) => g.name,
    badge: (g) => <GemBadge category={g.category} size={26} />,
    sub: (g) => `${gemStyle(g.category).label} · ${g.creator_username ?? 'unknown'} · ${timeAgo(g.created_at)}`,
  },
  reports: {
    load: async () => (await fetchRoadReports({ status: 'pending' })).rows,
    review: reviewRoadReport,
    empty: 'No road reports waiting.',
    title: (r) => `${reportTypeLabel(r.type)} · severity ${r.severity}`,
    badge: (r) => <ReportBadge type={r.type} severity={r.severity} size={26} />,
    sub: (r) => `${r.reporter_username ?? 'unknown'} · ${timeAgo(r.created_at)}`,
  },
  applications: {
    load: fetchPendingScoutApplications,
    review: reviewScoutApplication,
    empty: 'No Scout applications waiting.',
    title: (a) => a.applicant?.display_name || a.applicant?.username || 'Applicant',
    badge: () => null,
    sub: (a) => `${a.area} · ${timeAgo(a.created_at)}`,
  },
}

function Detail({ kind, item }) {
  if (kind === 'applications') {
    return (
      <dl className="admin-dl">
        <dt>Username</dt>
        <dd>{item.applicant?.username}</dd>
        <dt>Area they&apos;ll cover</dt>
        <dd>{item.area}</dd>
        <dt>M-Pesa number</dt>
        <dd className="mono">{item.mpesa_phone}</dd>
        <dt>Why they want to Scout</dt>
        <dd>{item.motivation || '–'}</dd>
      </dl>
    )
  }
  const isGem = kind === 'gems'
  const nearby = isGem ? item.nearby_verified : item.nearby_live
  return (
    <>
      {nearby > 0 && (
        <p className="admin-warning">
          <TriangleAlert size={16} />
          {nearby} live {isGem ? 'gem' : 'report'}
          {nearby === 1 ? ' is' : 's are'} within {isGem ? '150' : '100'} m. Possible duplicate.
        </p>
      )}
      <AdminMap
        key={item.id}
        lat={item.lat}
        lng={item.lng}
        kind={isGem ? 'gem' : 'report'}
        category={item.category}
        type={item.type}
        severity={item.severity}
      />
      <div className="admin-coords mono">
        {item.lat.toFixed(5)}, {item.lng.toFixed(5)} ·{' '}
        <a href={`https://www.google.com/maps?q=${item.lat},${item.lng}`} target="_blank" rel="noreferrer">
          Open in Google Maps
        </a>
      </div>
      {item.photo_path && <ReviewPhoto path={item.photo_path} />}
      <dl className="admin-dl">
        {isGem && item.address && (
          <>
            <dt>Address</dt>
            <dd>{item.address}</dd>
          </>
        )}
        <dt>Description</dt>
        <dd>{item.description || '–'}</dd>
        <dt>Submitted by</dt>
        <dd>
          {(isGem ? item.creator_username : item.reporter_username) ?? 'unknown'} (
          {(isGem ? item.creator_role : item.reporter_role) ?? '–'})
        </dd>
      </dl>
    </>
  )
}

function ReviewQueue({ overview, onChanged }) {
  const [kind, setKind] = useState('gems')
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedId, setSelectedId] = useState(null)
  const [checked, setChecked] = useState(new Set())
  const [busy, setBusy] = useState(false)
  const [rejecting, setRejecting] = useState(null)

  const cfg = KINDS[kind]

  const load = useCallback(async (k) => {
    setLoading(true)
    try {
      const rows = await KINDS[k].load()
      setItems(rows)
      setSelectedId((cur) => (rows.some((r) => r.id === cur) ? cur : rows[0]?.id ?? null))
      setError('')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    KINDS[kind]
      .load()
      .then((rows) => {
        if (cancelled) return
        setItems(rows)
        setSelectedId(rows[0]?.id ?? null)
        setError('')
      })
      .catch((err) => !cancelled && setError(err.message))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [kind])

  const index = items.findIndex((i) => i.id === selectedId)
  const selected = index >= 0 ? items[index] : null

  // Decide on some items, then move to the next one still waiting.
  const decide = useCallback(
    async (ids, approve, note = null) => {
      setBusy(true)
      setError('')
      const failed = []
      for (const id of ids) {
        try {
          await cfg.review(id, approve, note)
        } catch (err) {
          failed.push(err.message)
        }
      }
      const remaining = items.filter((i) => !ids.includes(i.id))
      const nextIdx = Math.min(index, remaining.length - 1)
      setItems(remaining)
      setSelectedId(remaining[nextIdx]?.id ?? null)
      setChecked(new Set())
      setBusy(false)
      if (failed.length) {
        setError(failed[0])
        load(kind)
      }
      onChanged()
    },
    [cfg, items, index, kind, load, onChanged],
  )

  // Keyboard: J/K or arrows to move, A to approve, R to reject.
  useEffect(() => {
    function onKey(e) {
      if (rejecting || busy || e.target.closest('input, textarea, select, dialog')) return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const k = e.key.toLowerCase()
      if ((k === 'j' || k === 'arrowdown') && index < items.length - 1) setSelectedId(items[index + 1].id)
      else if ((k === 'k' || k === 'arrowup') && index > 0) setSelectedId(items[index - 1].id)
      else if (k === 'a' && selected) decide([selected.id], true)
      else if (k === 'r' && selected) setRejecting([selected.id])
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [items, index, selected, decide, rejecting, busy])

  const counts = useMemo(
    () =>
      overview && {
        gems: overview.pending_gems,
        reports: overview.pending_reports,
        applications: overview.pending_applications,
      },
    [overview],
  )

  function toggle(id) {
    setChecked((cur) => {
      const next = new Set(cur)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div>
      <h1 className="page-title">Review queue</h1>
      <div className="admin-toolbar">
        <Segmented
          label="What to review"
          value={kind}
          onChange={(k) => {
            setLoading(true)
            setKind(k)
            setChecked(new Set())
          }}
          options={[
            { value: 'gems', label: 'Gems', count: counts?.gems },
            { value: 'reports', label: 'Road reports', count: counts?.reports },
            { value: 'applications', label: 'Scout applications', count: counts?.applications },
          ]}
        />
        <span className="admin-hint">Keys: J/K move · A approve · R reject</span>
      </div>

      {error && <p className="auth-error">{error}</p>}
      {loading ? (
        <p className="list-row-sub">Loading…</p>
      ) : items.length === 0 ? (
        <div className="admin-empty">
          <Check size={22} />
          {cfg.empty}
        </div>
      ) : (
        <div className="admin-split">
          <div className="admin-queue">
            <div className="admin-queue-bar">
              <label className="admin-check">
                <input
                  type="checkbox"
                  checked={checked.size === items.length}
                  onChange={(e) => setChecked(e.target.checked ? new Set(items.map((i) => i.id)) : new Set())}
                />
                {checked.size ? `${checked.size} selected` : `${items.length} waiting, oldest first`}
              </label>
              {checked.size > 0 && (
                <span className="admin-queue-bulk">
                  <button className="admin-btn primary small" disabled={busy} onClick={() => decide([...checked], true)}>
                    Approve {checked.size}
                  </button>
                  <button className="admin-btn danger small" disabled={busy} onClick={() => setRejecting([...checked])}>
                    Reject {checked.size}
                  </button>
                </span>
              )}
            </div>
            <ul>
              {items.map((item) => (
                <li key={item.id} className={item.id === selectedId ? 'active' : ''}>
                  <input
                    type="checkbox"
                    aria-label={`Select ${cfg.title(item)}`}
                    checked={checked.has(item.id)}
                    onChange={() => toggle(item.id)}
                  />
                  <button type="button" className="admin-queue-item" onClick={() => setSelectedId(item.id)}>
                    {cfg.badge(item)}
                    <span>
                      <span className="admin-queue-title">{cfg.title(item)}</span>
                      <span className="admin-queue-sub">{cfg.sub(item)}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>

          {selected && (
            <div className="admin-detail">
              <div className="admin-detail-head">
                {cfg.badge(selected)}
                <div>
                  <h2>{cfg.title(selected)}</h2>
                  <div className="admin-queue-sub">{cfg.sub(selected)}</div>
                </div>
              </div>
              <Detail kind={kind} item={selected} />
              <div className="admin-detail-actions">
                <button className="admin-btn primary" disabled={busy} onClick={() => decide([selected.id], true)}>
                  <Check size={16} /> Approve
                </button>
                <button className="admin-btn danger" disabled={busy} onClick={() => setRejecting([selected.id])}>
                  <X size={16} /> Reject
                </button>
              </div>
              {kind !== 'applications' && (
                <p className="admin-hint">
                  Approving a Scout&apos;s {kind === 'gems' ? 'gem' : 'report'} puts it on the map and adds their pay to
                  Payouts.
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {rejecting && (
        <ReasonDialog
          title={rejecting.length === 1 ? 'Reject this?' : `Reject ${rejecting.length} items?`}
          confirmLabel="Reject"
          placeholder="e.g. Duplicate of an existing gem, photo doesn't show the road…"
          onClose={() => setRejecting(null)}
          onConfirm={(note) => {
            const ids = rejecting
            setRejecting(null)
            decide(ids, false, note)
          }}
        />
      )}
    </div>
  )
}

export default ReviewQueue
