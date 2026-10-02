import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Plus, Search, Upload } from 'lucide-react'
import { fetchGems, saveGem, setGemStatus, deleteGem } from '../../lib/admin'
import { GEM_STYLE, gemStyle } from '../../lib/placeStyles'
import { GemBadge } from '../../components/PlaceIcons'
import { timeAgo } from '../../lib/roadReports'
import { LocationField } from './AdminMap'
import { Dialog, Pager, ReasonDialog, ReviewPhoto, Segmented, StatusPill } from './AdminUi'
import { formatDate, useDebounced } from './adminUtils'

const STATUS_FILTERS = [
  { value: 'verified', label: 'Live' },
  { value: 'pending', label: 'Pending' },
  { value: 'rejected', label: 'Hidden' },
  { value: null, label: 'All' },
]

export function GemEditor({ gem, onClose, onSaved }) {
  const isNew = !gem.id
  const [name, setName] = useState(gem.name ?? '')
  const [category, setCategory] = useState(gem.category ?? 'attractions')
  const [description, setDescription] = useState(gem.description ?? '')
  const [address, setAddress] = useState(gem.address ?? '')
  const [loc, setLoc] = useState(gem.lat != null ? { lat: gem.lat, lng: gem.lng } : null)
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
    run(() => saveGem({ id: gem.id, name, category, description, address, lat: loc.lat, lng: loc.lng }))
  }

  return (
    <Dialog title={isNew ? 'Add a Hidden Gem' : 'Edit gem'} onClose={onClose} wide>
      <form onSubmit={submit} className="admin-editor">
        <div className="admin-editor-fields">
          {!isNew && (
            <div className="admin-editor-meta">
              <StatusPill status={gem.status} /> Added by {gem.creator_username ?? 'unknown'} · {formatDate(gem.created_at)}
              {gem.confirmations_count > 0 &&
                ` · ${gem.confirmations_count} confirmations${gem.rating_avg ? `, rated ${gem.rating_avg}` : ''}`}
            </div>
          )}
          {gem.review_note && <p className="admin-hint">Note: {gem.review_note}</p>}
          <label className="admin-field">
            <span>Name</span>
            <input className="form-input" value={name} maxLength={120} required onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="admin-field">
            <span>Category</span>
            <select className="form-select" value={category} onChange={(e) => setCategory(e.target.value)}>
              {Object.entries(GEM_STYLE).map(([key, s]) => (
                <option key={key} value={key}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
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
            <span>Address (optional)</span>
            <input className="form-input" value={address} maxLength={200} onChange={(e) => setAddress(e.target.value)} />
          </label>
          {gem.photo_path && <ReviewPhoto path={gem.photo_path} />}
        </div>
        <LocationField value={loc} onChange={setLoc} kind="gem" category={category} />

        {error && <p className="auth-error">{error}</p>}
        <div className="admin-dialog-actions">
          {!isNew && gem.status === 'verified' && (
            <button type="button" className="admin-btn" disabled={busy} onClick={() => setHiding(true)}>
              Hide from map
            </button>
          )}
          {!isNew && gem.status === 'rejected' && (
            <button type="button" className="admin-btn" disabled={busy} onClick={() => run(() => setGemStatus(gem.id, 'verified'))}>
              Put back on map
            </button>
          )}
          {!isNew && gem.status === 'pending' && (
            <Link className="admin-btn" to="/app/admin/review">
              Review in queue
            </Link>
          )}
          {!isNew &&
            (confirmDelete ? (
              <button type="button" className="admin-btn danger" disabled={busy} onClick={() => run(() => deleteGem(gem.id))}>
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
          title="Hide this gem?"
          confirmLabel="Hide"
          placeholder="e.g. Closed down, moved, duplicate…"
          onClose={() => setHiding(false)}
          onConfirm={(note) => {
            setHiding(false)
            run(() => setGemStatus(gem.id, 'rejected', note))
          }}
        />
      )}
    </Dialog>
  )
}

function GemsManager({ onChanged }) {
  const navigate = useNavigate()
  const [status, setStatus] = useState('verified')
  const [category, setCategory] = useState(null)
  const [search, setSearch] = useState('')
  const debounced = useDebounced(search)
  const [page, setPage] = useState(0)
  const [data, setData] = useState({ rows: [], total: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(null)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    fetchGems({ status, category, search: debounced, page })
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
  }, [status, category, debounced, page, reloadKey])

  const filter = (fn) => (v) => {
    setLoading(true)
    setPage(0)
    fn(v)
  }

  return (
    <div>
      <div className="admin-title-row">
        <h1 className="page-title">Hidden Gems</h1>
        <span className="admin-title-actions">
          <Link className="admin-btn" to="/app/admin/data">
            <Upload size={16} /> Import / duplicates
          </Link>
          <button className="admin-btn primary" onClick={() => setEditing({})}>
            <Plus size={16} /> Add gem
          </button>
        </span>
      </div>

      <div className="admin-toolbar">
        <Segmented label="Status" options={STATUS_FILTERS} value={status} onChange={filter(setStatus)} />
        <select
          className="form-select admin-inline-select"
          value={category ?? ''}
          aria-label="Category"
          onChange={(e) => filter(setCategory)(e.target.value || null)}
        >
          <option value="">All categories</option>
          {Object.entries(GEM_STYLE).map(([key, s]) => (
            <option key={key} value={key}>
              {s.label}
            </option>
          ))}
        </select>
        <label className="admin-search">
          <Search size={16} />
          <input
            type="search"
            placeholder="Search name, description, address"
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
        <div className="admin-empty">No gems match.</div>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table clickable">
            <thead>
              <tr>
                <th>Gem</th>
                <th>Status</th>
                <th className="num hide-sm">Confirmations</th>
                <th className="hide-sm">Added by</th>
                <th className="hide-sm">Updated</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((g) => (
                <tr key={g.id} onClick={() => navigate(`/app/admin/gems/${g.id}`)}>
                  <td>
                    <button type="button" className="admin-row-btn" onClick={() => navigate(`/app/admin/gems/${g.id}`)}>
                      <GemBadge category={g.category} size={24} />
                      <span>
                        <span className="admin-queue-title">{g.name}</span>
                        <span className="admin-queue-sub">{gemStyle(g.category).label}</span>
                      </span>
                    </button>
                  </td>
                  <td>
                    <StatusPill status={g.status} />
                  </td>
                  <td className="num hide-sm">
                    {g.confirmations_count}
                    {g.rating_avg ? ` · ★ ${g.rating_avg}` : ''}
                  </td>
                  <td className="hide-sm">{g.creator_username ?? '–'}</td>
                  <td className="hide-sm">{timeAgo(g.updated_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pager page={page} total={data.total} onPage={filter(setPage)} />

      {editing && (
        <GemEditor
          gem={editing}
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

export default GemsManager
