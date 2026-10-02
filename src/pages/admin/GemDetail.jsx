import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Pencil, Merge } from 'lucide-react'
import { fetchGemDetail, mergeGems } from '../../lib/admin'
import { gemStyle } from '../../lib/placeStyles'
import { GemBadge } from '../../components/PlaceIcons'
import AdminMap from './AdminMap'
import { GemEditor } from './GemsManager'
import { Dialog, ReviewPhoto, StatusPill } from './AdminUi'
import { AuditList } from './AuditLog'
import { formatDate } from './adminUtils'

function RatingBars({ ratings }) {
  const total = Object.values(ratings).reduce((a, b) => a + b, 0)
  if (!total) return <p className="admin-hint">No ratings yet.</p>
  const max = Math.max(...Object.values(ratings))
  return (
    <div className="admin-rating-bars" role="img" aria-label="Ratings from 1 to 5 stars">
      {[5, 4, 3, 2, 1].map((star) => {
        const n = ratings[star] ?? 0
        return (
          <div key={star} className="admin-rating-row">
            <span>{star}★</span>
            <span className="admin-rating-track">
              <span className="admin-rating-fill" style={{ width: `${(n / max) * 100}%` }} />
            </span>
            <span className="num">{n}</span>
          </div>
        )
      })}
    </div>
  )
}

function GemDetail({ onChanged }) {
  const { id } = useParams()
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(false)
  const [merging, setMerging] = useState(null) // the nearby gem to fold into this one
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      setData(await fetchGemDetail(id))
      setError('')
    } catch (err) {
      setError(err.message)
    }
  }, [id])

  useEffect(() => {
    let cancelled = false
    fetchGemDetail(id)
      .then((d) => !cancelled && setData(d))
      .catch((err) => !cancelled && setError(err.message))
    return () => {
      cancelled = true
    }
  }, [id])

  async function merge() {
    setBusy(true)
    try {
      await mergeGems(id, merging.id)
      setMerging(null)
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
  const { gem, stats, nearby, audit } = data

  return (
    <div>
      <Link to="/app/admin/gems" className="admin-back">
        <ArrowLeft size={15} /> Gems
      </Link>
      <div className="admin-detail-title">
        <GemBadge category={gem.category} size={40} />
        <div>
          <h1>{gem.name}</h1>
          <div className="admin-editor-meta">
            <StatusPill status={gem.status} /> {gemStyle(gem.category).label} · added by{' '}
            {gem.created_by ? <Link to={`/app/admin/users/${gem.created_by}`}>{gem.creator_username}</Link> : 'unknown'} ·{' '}
            {formatDate(gem.created_at)}
            {gem.reviewer_username && ` · reviewed by ${gem.reviewer_username}`}
          </div>
        </div>
        <button className="admin-btn" onClick={() => setEditing(true)}>
          <Pencil size={15} /> Edit
        </button>
      </div>
      {error && <p className="auth-error">{error}</p>}
      {gem.review_note && <p className="admin-warning">Note: {gem.review_note}</p>}

      <div className="admin-detail-grid">
        <div>
          <AdminMap key={`${gem.lat},${gem.lng}`} lat={gem.lat} lng={gem.lng} kind="gem" category={gem.category} height={260} />
          <div className="admin-coords mono">
            {gem.lat.toFixed(5)}, {gem.lng.toFixed(5)}
            {gem.address && <span className="admin-coords-address"> · {gem.address}</span>}
          </div>
          {gem.description && <p className="admin-body-text">{gem.description}</p>}
          {gem.photo_path && <ReviewPhoto path={gem.photo_path} />}
        </div>
        <div>
          <div className="admin-tiles compact">
            <div className="admin-tile">
              <div className="admin-tile-label">Saved by drivers</div>
              <div className="admin-tile-value">{stats.saves}</div>
            </div>
            <div className="admin-tile">
              <div className="admin-tile-label">Alerts (30 days)</div>
              <div className="admin-tile-value">{stats.alerts_approaching_30d}</div>
              <div className="admin-tile-sub">
                “ahead” alerts · {stats.alerts_passed_30d} “just passed” · {stats.alerts_total} all time
              </div>
            </div>
            <div className="admin-tile">
              <div className="admin-tile-label">Confirmations</div>
              <div className="admin-tile-value">{stats.confirmations}</div>
              <div className="admin-tile-sub">{stats.rating_avg ? `average ${stats.rating_avg}★` : 'no ratings'}</div>
            </div>
          </div>
          <h2 className="admin-h3">Ratings</h2>
          <RatingBars ratings={stats.ratings} />
        </div>
      </div>

      <h2 className="admin-h2">Nearby gems (300 m)</h2>
      {nearby.length === 0 ? (
        <div className="admin-empty">Nothing close by, so no likely duplicates.</div>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <tbody>
              {nearby.map((n) => (
                <tr key={n.id}>
                  <td>
                    <Link to={`/app/admin/gems/${n.id}`} className="admin-row-btn">
                      <GemBadge category={n.category} size={22} />
                      <span className="admin-queue-title">{n.name}</span>
                    </Link>
                  </td>
                  <td>
                    <StatusPill status={n.status} />
                  </td>
                  <td className="num">{n.distance_m} m</td>
                  <td className="num">
                    <button className="admin-btn small" onClick={() => setMerging(n)}>
                      <Merge size={14} /> Merge into this one
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2 className="admin-h2">History</h2>
      <AuditList entries={audit} empty="No admin changes yet." />

      {editing && (
        <GemEditor
          gem={gem}
          onClose={() => setEditing(false)}
          onSaved={async () => {
            setEditing(false)
            onChanged()
            // A deleted gem has no page to come back to.
            try {
              setData(await fetchGemDetail(id))
            } catch {
              navigate('/app/admin/gems', { replace: true })
            }
          }}
        />
      )}
      {merging && (
        <Dialog title="Merge these gems?" onClose={() => setMerging(null)}>
          <p className="admin-body-text">
            <strong>{merging.name}</strong> will be folded into <strong>{gem.name}</strong> and deleted. Its saves,
            ratings and trip alerts move here, and any details this gem is missing (description, address, photo) are
            copied over. This can&apos;t be undone.
          </p>
          <div className="admin-dialog-actions">
            <button className="admin-btn" onClick={() => setMerging(null)}>
              Cancel
            </button>
            <button className="admin-btn danger" disabled={busy} onClick={merge}>
              Merge and delete {merging.name}
            </button>
          </div>
        </Dialog>
      )}
    </div>
  )
}

export default GemDetail
