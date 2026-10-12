import { useEffect, useState } from 'react'
import { Mail, Trash2 } from 'lucide-react'
import { ADMIN_PAGE_SIZE, deleteMessage, fetchMessages, setMessageStatus, topicLabel } from '../../lib/company'
import { timeAgo } from '../../lib/roadReports'
import { Dialog, Segmented } from './AdminUi'
import { formatDate } from './adminUtils'

const FILTERS = [
  { value: 'new', label: 'New' },
  { value: 'done', label: 'Done' },
  { value: null, label: 'All' },
]

function MessageDialog({ message, onClose, onChanged }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)

  async function run(fn) {
    setBusy(true)
    setError('')
    try {
      await fn()
      onChanged()
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  const subject = encodeURIComponent('Re: your message to PathIQ')
  const quoted = encodeURIComponent(
    `\n\n\n---\nOn ${formatDate(message.created_at)}, ${message.name} wrote:\n` +
      message.message.split('\n').map((l) => '> ' + l).join('\n'),
  )
  return (
    <Dialog title={topicLabel(message.topic)} onClose={onClose} wide>
      <div className="admin-editor-meta">
        <span className={'admin-pill ' + (message.status === 'new' ? 'status-pending' : 'status-verified')}>
          {message.status === 'new' ? 'New' : 'Done'}
        </span>
        From <strong>{message.name}</strong> &lt;{message.email}&gt; · {formatDate(message.created_at)}
        {message.user_id && ' · signed in'}
        {message.handled_at && ` · handled ${formatDate(message.handled_at)}`}
      </div>
      <p className="admin-body-text message-body">{message.message}</p>
      {error && <p className="auth-error">{error}</p>}
      <div className="admin-dialog-actions">
        {confirmDelete ? (
          <div className="admin-confirm">
            Delete this message for good?
            <button type="button" className="admin-btn small danger" disabled={busy} onClick={() => run(() => deleteMessage(message.id))}>
              Delete
            </button>
            <button type="button" className="admin-btn small" onClick={() => setConfirmDelete(false)}>
              Cancel
            </button>
          </div>
        ) : (
          <button type="button" className="admin-btn ghost-danger" onClick={() => setConfirmDelete(true)}>
            <Trash2 size={15} /> Delete
          </button>
        )}
        <span className="admin-spacer" />
        <a className="admin-btn" href={`mailto:${message.email}?subject=${subject}&body=${quoted}`}>
          <Mail size={15} /> Reply by email
        </a>
        {message.status === 'new' ? (
          <button type="button" className="admin-btn primary" disabled={busy} onClick={() => run(() => setMessageStatus(message.id, 'done'))}>
            Mark as done
          </button>
        ) : (
          <button type="button" className="admin-btn" disabled={busy} onClick={() => run(() => setMessageStatus(message.id, 'new'))}>
            Mark as new
          </button>
        )}
      </div>
    </Dialog>
  )
}

// /app/admin/messages: what people sent through the contact form.
function Messages({ onChanged }) {
  const [status, setStatus] = useState('new')
  const [page, setPage] = useState(0)
  const [reloadKey, setReloadKey] = useState(0)
  const key = `${status}:${page}:${reloadKey}`
  const [data, setData] = useState({ key: null, rows: [], total: 0, error: '' })
  const [open, setOpen] = useState(null)

  useEffect(() => {
    let cancelled = false
    fetchMessages({ status, page })
      .then(({ rows, total }) => !cancelled && setData({ key, rows, total, error: '' }))
      .catch((err) => !cancelled && setData({ key, rows: [], total: 0, error: err.message }))
    return () => {
      cancelled = true
    }
  }, [status, page, key])

  const pages = Math.ceil(data.total / ADMIN_PAGE_SIZE)
  return (
    <div>
      <div className="admin-title-row">
        <h1 className="page-title">Messages</h1>
      </div>
      <div className="admin-toolbar">
        <Segmented
          label="Status"
          options={FILTERS}
          value={status}
          onChange={(v) => {
            setStatus(v)
            setPage(0)
          }}
        />
        <span className="admin-hint">From the contact form. Done messages are deleted after a year.</span>
      </div>

      {data.error && <p className="auth-error">{data.error}</p>}
      {data.key !== key ? (
        <p className="list-row-sub">Loading…</p>
      ) : data.rows.length === 0 ? (
        <div className="admin-empty">{status === 'new' ? 'No new messages.' : 'No messages.'}</div>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table clickable">
            <thead>
              <tr>
                <th>From</th>
                <th>Topic</th>
                <th className="hide-sm">Received</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((m) => (
                <tr key={m.id} onClick={() => setOpen(m)} className={m.status === 'new' ? 'message-new' : ''}>
                  <td>
                    <button type="button" className="admin-row-btn" onClick={() => setOpen(m)}>
                      <span>
                        <span className="admin-queue-title">
                          {m.name} <span className="admin-hint">{m.email}</span>
                        </span>
                        <span className="admin-queue-sub">{m.message.slice(0, 140)}</span>
                      </span>
                    </button>
                  </td>
                  <td>{topicLabel(m.topic)}</td>
                  <td className="hide-sm">{timeAgo(m.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {pages > 1 && (
        <div className="admin-pager">
          <button className="admin-btn" disabled={page === 0} onClick={() => setPage(page - 1)}>
            Previous
          </button>
          <span>
            Page {page + 1} of {pages} · {data.total} messages
          </span>
          <button className="admin-btn" disabled={page + 1 >= pages} onClick={() => setPage(page + 1)}>
            Next
          </button>
        </div>
      )}

      {open && (
        <MessageDialog
          message={open}
          onClose={() => setOpen(null)}
          onChanged={() => {
            setOpen(null)
            setReloadKey((k) => k + 1)
            onChanged()
          }}
        />
      )}
    </div>
  )
}

export default Messages
