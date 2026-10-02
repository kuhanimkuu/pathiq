import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Download, Upload, Merge } from 'lucide-react'
import { importGems, fetchDuplicateGems, mergeGems, parseCsv, GEM_IMPORT_TEMPLATE } from '../../lib/admin'
import { GemBadge } from '../../components/PlaceIcons'
import { Dialog, StatusPill } from './AdminUi'

const RESULT_LABEL = { ok: 'Ready', added: 'Added', duplicate: 'Duplicate', invalid: 'Problem' }

function downloadTemplate() {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([GEM_IMPORT_TEMPLATE], { type: 'text/csv' }))
  a.download = 'pathiq-gems-template.csv'
  a.click()
  URL.revokeObjectURL(a.href)
}

function Importer({ onChanged }) {
  const [fileName, setFileName] = useState('')
  const [rows, setRows] = useState([])
  const [results, setResults] = useState(null)
  const [committed, setCommitted] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function onFile(file) {
    setError('')
    setResults(null)
    setCommitted(false)
    if (!file) return
    if (file.size > 1_000_000) {
      setError('That file is over 1 MB. Split it into smaller files.')
      return
    }
    setFileName(file.name)
    const parsed = parseCsv(await file.text())
    if (parsed.length === 0) {
      setError('No rows found. The first line should be the header: name,category,lat,lng,description,address')
      setRows([])
      return
    }
    if (parsed.length > 500) {
      setError(`That's ${parsed.length} rows; import up to 500 at a time.`)
      setRows([])
      return
    }
    setRows(parsed)
    check(parsed, false)
  }

  async function check(list, commit) {
    setBusy(true)
    setError('')
    try {
      setResults(await importGems(list, commit))
      if (commit) {
        setCommitted(true)
        onChanged()
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const counts = (results ?? []).reduce((c, r) => ({ ...c, [r.status]: (c[r.status] ?? 0) + 1 }), {})

  return (
    <section>
      <h2 className="admin-h2">Import gems from a spreadsheet</h2>
      <p className="admin-hint">
        A CSV with columns <code>name, category, lat, lng</code> and optionally <code>description, address</code>.
        Categories: attractions, hotels, food, scenic, fuel, facilities. Everything is checked first; nothing is added
        until you confirm. Imported gems go straight onto the map as verified, so only import places you trust.
      </p>
      <div className="admin-toolbar">
        <label className="admin-btn primary admin-file-btn">
          <Upload size={16} /> Choose CSV file
          <input type="file" accept=".csv,text/csv" hidden onChange={(e) => onFile(e.target.files?.[0])} />
        </label>
        <button type="button" className="admin-link-btn" onClick={downloadTemplate}>
          <Download size={15} /> Download a template
        </button>
        {fileName && <span className="admin-hint">{fileName}</span>}
      </div>
      {error && <p className="auth-error">{error}</p>}
      {busy && <p className="list-row-sub">Checking…</p>}

      {results && (
        <>
          <div className="admin-import-summary">
            {committed ? (
              <p className="admin-notice">
                Added {counts.added ?? 0} gem{counts.added === 1 ? '' : 's'} to the map.
              </p>
            ) : (
              <p className="admin-body-text">
                <strong>{counts.ok ?? 0}</strong> ready to add · <strong>{counts.duplicate ?? 0}</strong> look like
                duplicates · <strong>{counts.invalid ?? 0}</strong> have problems. Only the ready ones will be added.
              </p>
            )}
            {!committed && counts.ok > 0 && (
              <button className="admin-btn primary" disabled={busy} onClick={() => check(rows, true)}>
                Add {counts.ok} gem{counts.ok === 1 ? '' : 's'} to the map
              </button>
            )}
          </div>
          <div className="admin-table-wrap admin-import-table">
            <table className="admin-table">
              <thead>
                <tr>
                  <th className="num">Row</th>
                  <th>Name</th>
                  <th className="hide-sm">Category</th>
                  <th className="hide-sm">Location</th>
                  <th>Result</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r) => {
                  const row = rows[r.row_no - 1] ?? {}
                  return (
                    <tr key={r.row_no}>
                      <td className="num">{r.row_no + 1}</td>
                      <td>
                        {r.gem_id ? <Link to={`/app/admin/gems/${r.gem_id}`}>{row.name}</Link> : row.name || '–'}
                      </td>
                      <td className="hide-sm">{row.category}</td>
                      <td className="mono small hide-sm">
                        {row.lat}, {row.lng}
                      </td>
                      <td>
                        <span className={`admin-pill import-${r.status}`}>{RESULT_LABEL[r.status]}</span>
                        {r.message && <span className="admin-queue-sub">{r.message}</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <p className="admin-hint">Row numbers count the header as row 1, like a spreadsheet.</p>
        </>
      )}
    </section>
  )
}

function Duplicates({ onChanged }) {
  const [radius, setRadius] = useState(100)
  const [pairs, setPairs] = useState(null)
  const [error, setError] = useState('')
  const [merging, setMerging] = useState(null) // { keep, remove }
  const [busy, setBusy] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    fetchDuplicateGems(radius)
      .then((p) => !cancelled && setPairs(p))
      .catch((err) => !cancelled && setError(err.message))
    return () => {
      cancelled = true
    }
  }, [radius, reloadKey])

  async function merge() {
    setBusy(true)
    setError('')
    try {
      await mergeGems(merging.keep.id, merging.remove.id)
      setMerging(null)
      setReloadKey((k) => k + 1)
      onChanged()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const side = (p, s) => ({
    id: p[`${s}_id`],
    name: p[`${s}_name`],
    category: p[`${s}_category`],
    status: p[`${s}_status`],
  })

  return (
    <section>
      <div className="admin-h2-row">
        <h2 className="admin-h2">Possible duplicate gems</h2>
        <label className="admin-hint admin-inline-field">
          Within
          <select className="form-select admin-inline-select" value={radius} onChange={(e) => setRadius(Number(e.target.value))}>
            {[25, 50, 100, 200, 500].map((m) => (
              <option key={m} value={m}>
                {m} m
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="admin-hint">
        Gems close to each other are often the same place submitted twice. Pick the one to keep; the other&apos;s saves,
        ratings and alerts move to it.
      </p>
      {error && <p className="auth-error">{error}</p>}
      {pairs == null ? (
        <p className="list-row-sub">Loading…</p>
      ) : pairs.length === 0 ? (
        <div className="admin-empty">No gems within {radius} m of each other.</div>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <tbody>
              {pairs.map((p) => {
                const a = side(p, 'a')
                const b = side(p, 'b')
                return (
                  <tr key={`${a.id}-${b.id}`}>
                    {[a, b].map((g, i) => (
                      <td key={g.id}>
                        <Link to={`/app/admin/gems/${g.id}`} className="admin-row-btn">
                          <GemBadge category={g.category} size={22} />
                          <span>
                            <span className="admin-queue-title">{g.name}</span>
                            <span className="admin-queue-sub">
                              <StatusPill status={g.status} />
                            </span>
                          </span>
                        </Link>
                        <button
                          className="admin-btn small admin-keep-btn"
                          onClick={() => setMerging({ keep: g, remove: i === 0 ? b : a })}
                        >
                          <Merge size={13} /> Keep this
                        </button>
                      </td>
                    ))}
                    <td className="num">{p.distance_m} m apart</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      {merging && (
        <Dialog title="Merge these gems?" onClose={() => setMerging(null)}>
          <p className="admin-body-text">
            Keep <strong>{merging.keep.name}</strong> and fold <strong>{merging.remove.name}</strong> into it. Saves,
            ratings and trip alerts move across, missing details are copied, and {merging.remove.name} is deleted. This
            can&apos;t be undone.
          </p>
          <div className="admin-dialog-actions">
            <button className="admin-btn" onClick={() => setMerging(null)}>
              Cancel
            </button>
            <button className="admin-btn danger" disabled={busy} onClick={merge}>
              Merge
            </button>
          </div>
        </Dialog>
      )}
    </section>
  )
}

function DataTools({ onChanged }) {
  return (
    <div>
      <h1 className="page-title">Data tools</h1>
      <Importer onChanged={onChanged} />
      <Duplicates onChanged={onChanged} />
    </div>
  )
}

export default DataTools
