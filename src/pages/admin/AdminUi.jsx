import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { scoutPhotoUrl, PAGE_SIZE } from '../../lib/admin'

export function ReviewPhoto({ path }) {
  const [url, setUrl] = useState(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let cancelled = false
    scoutPhotoUrl(path)
      .then((u) => !cancelled && setUrl(u))
      .catch(() => !cancelled && setFailed(true))
    return () => {
      cancelled = true
    }
  }, [path])
  if (failed) return <p className="list-row-sub">Photo couldn&apos;t be loaded.</p>
  if (!url) return <div className="review-photo review-photo-loading" />
  return (
    <a href={url} target="_blank" rel="noreferrer">
      <img src={url} alt="Scout's photo" className="review-photo" />
    </a>
  )
}

// A modal built on <dialog>, so focus trapping and Esc come from the browser.
export function Dialog({ title, onClose, children, wide = false }) {
  const ref = useRef(null)
  useEffect(() => {
    const el = ref.current
    el?.showModal()
    return () => el?.close()
  }, [])
  return (
    <dialog
      ref={ref}
      className={'admin-dialog' + (wide ? ' wide' : '')}
      onCancel={(e) => {
        e.preventDefault()
        onClose()
      }}
      onClick={(e) => e.target === ref.current && onClose()}
    >
      <div className="admin-dialog-head">
        <h2>{title}</h2>
        <button type="button" className="admin-icon-btn" onClick={onClose} aria-label="Close">
          <X size={18} />
        </button>
      </div>
      <div className="admin-dialog-body">{children}</div>
    </dialog>
  )
}

// Asks for an optional reason before a reject / hide. Resolves via onConfirm(note).
export function ReasonDialog({ title, confirmLabel, placeholder, onConfirm, onClose, required = false }) {
  const [note, setNote] = useState('')
  return (
    <Dialog title={title} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          onConfirm(note.trim() || null)
        }}
      >
        <label className="admin-field">
          <span>Reason {required ? '' : '(optional, the Scout sees it)'}</span>
          <textarea
            className="form-textarea"
            rows={3}
            maxLength={500}
            value={note}
            placeholder={placeholder}
            onChange={(e) => setNote(e.target.value)}
            required={required}
            autoFocus
          />
        </label>
        <div className="admin-dialog-actions">
          <button type="button" className="admin-btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="admin-btn danger">
            {confirmLabel}
          </button>
        </div>
      </form>
    </Dialog>
  )
}

export function Pager({ page, total, onPage }) {
  const pages = Math.ceil(total / PAGE_SIZE)
  if (pages <= 1) return null
  return (
    <div className="admin-pager">
      <button className="admin-btn" disabled={page === 0} onClick={() => onPage(page - 1)}>
        Previous
      </button>
      <span>
        Page {page + 1} of {pages} · {total} total
      </span>
      <button className="admin-btn" disabled={page + 1 >= pages} onClick={() => onPage(page + 1)}>
        Next
      </button>
    </div>
  )
}

const STATUS_LABEL = { pending: 'Pending', verified: 'Live', rejected: 'Hidden', expired: 'Expired' }

export function StatusPill({ status }) {
  return <span className={`admin-pill status-${status}`}>{STATUS_LABEL[status] ?? status}</span>
}

export function Segmented({ options, value, onChange, label }) {
  return (
    <div className="admin-segmented" role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          className={o.value === value ? 'active' : ''}
          aria-pressed={o.value === value}
          onClick={() => onChange(o.value)}
        >
          {o.label}
          {o.count != null && <span className="admin-count">{o.count}</span>}
        </button>
      ))}
    </div>
  )
}
