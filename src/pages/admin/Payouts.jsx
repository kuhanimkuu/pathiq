import { useCallback, useEffect, useState } from 'react'
import { Download, Copy, Check } from 'lucide-react'
import {
  fetchPayouts,
  payScout,
  fetchPaidEarnings,
  fetchTaskRates,
  updateTaskRate,
  formatKes,
  payoutsCsv,
  TASK_LABELS,
} from '../../lib/admin'
import { timeAgo } from '../../lib/roadReports'
import { Dialog } from './AdminUi'
import { formatDate } from './adminUtils'

function CopyButton({ text, label }) {
  const [done, setDone] = useState(false)
  return (
    <button
      type="button"
      className="admin-icon-btn"
      aria-label={`Copy ${label}`}
      onClick={() =>
        navigator.clipboard?.writeText(text).then(() => {
          setDone(true)
          setTimeout(() => setDone(false), 1500)
        })
      }
    >
      {done ? <Check size={15} /> : <Copy size={15} />}
    </button>
  )
}

function PayDialog({ payout, onClose, onPaid }) {
  const [ref, setRef] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const result = await payScout(payout.scout_id, payout.earning_ids, ref)
      if (result.items === 0) throw new Error('Nothing was paid: these earnings were already paid or changed. Reload.')
      onPaid(result)
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <Dialog title={`Pay ${payout.display_name || payout.username}`} onClose={onClose}>
      <ol className="admin-steps">
        <li>
          Send <strong>{formatKes(payout.total_kes)}</strong> <CopyButton text={String(payout.total_kes)} label="amount" /> by
          M-Pesa to{' '}
          {payout.mpesa_phone ? (
            <>
              <strong className="mono">{payout.mpesa_phone}</strong>{' '}
              <CopyButton text={payout.mpesa_phone} label="phone number" />
            </>
          ) : (
            <strong className="admin-danger-text">no M-Pesa number on file</strong>
          )}
        </li>
        <li>Enter the transaction code from the M-Pesa confirmation SMS:</li>
      </ol>
      <form onSubmit={submit}>
        <input
          className="form-input mono"
          value={ref}
          onChange={(e) => setRef(e.target.value.toUpperCase())}
          placeholder="e.g. QJK3XYZ12A"
          pattern="[A-Za-z0-9]{6,20}"
          required
          autoFocus
        />
        <p className="admin-hint">
          Covers {payout.items} approved task{payout.items === 1 ? '' : 's'}. Each is marked paid with this code, and the
          Scout sees it in their earnings.
        </p>
        {error && <p className="auth-error">{error}</p>}
        <div className="admin-dialog-actions">
          <button type="button" className="admin-btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="admin-btn primary" disabled={busy}>
            Mark {formatKes(payout.total_kes)} paid
          </button>
        </div>
      </form>
    </Dialog>
  )
}

function RateRow({ rate, onSaved }) {
  const [value, setValue] = useState(String(rate.amount_kes))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const n = Number(value)
  const changed = n !== rate.amount_kes
  const valid = Number.isInteger(n) && n > 0 && n <= 100000

  async function save() {
    setBusy(true)
    setError('')
    try {
      await updateTaskRate(rate.task, n)
      onSaved()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <tr>
      <td>{TASK_LABELS[rate.task] ?? rate.task}</td>
      <td className="num">
        <span className="admin-kes-input">
          KSh
          <input
            type="number"
            min="1"
            max="100000"
            step="1"
            value={value}
            aria-label={`${TASK_LABELS[rate.task]} rate in KSh`}
            onChange={(e) => setValue(e.target.value)}
          />
        </span>
        {error && <div className="auth-error">{error}</div>}
      </td>
      <td className="num">
        {changed && (
          <button className="admin-btn primary small" disabled={busy || !valid} onClick={save}>
            Save
          </button>
        )}
      </td>
    </tr>
  )
}

function Payouts({ onChanged }) {
  const [payouts, setPayouts] = useState([])
  const [paid, setPaid] = useState([])
  const [rates, setRates] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [paying, setPaying] = useState(null)
  const [notice, setNotice] = useState('')

  const load = useCallback(async () => {
    try {
      const [p, h, r] = await Promise.all([fetchPayouts(), fetchPaidEarnings(), fetchTaskRates()])
      setPayouts(p)
      setPaid(h)
      setRates(r)
      setError('')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    Promise.all([fetchPayouts(), fetchPaidEarnings(), fetchTaskRates()])
      .then(([p, h, r]) => {
        if (cancelled) return
        setPayouts(p)
        setPaid(h)
        setRates(r)
      })
      .catch((err) => !cancelled && setError(err.message))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [])

  function downloadCsv() {
    const blob = new Blob([payoutsCsv(payouts)], { type: 'text/csv' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `pathiq-payouts-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  if (loading) return <p className="list-row-sub">Loading…</p>

  const owedTotal = payouts.reduce((s, p) => s + p.total_kes, 0)

  return (
    <div>
      <h1 className="page-title">Payouts &amp; rates</h1>
      {error && <p className="auth-error">{error}</p>}
      {notice && <p className="admin-notice">{notice}</p>}

      <div className="admin-h2-row">
        <h2 className="admin-h2">
          Owed {payouts.length > 0 && <span className="admin-h2-sub">{formatKes(owedTotal)} to {payouts.length} Scout{payouts.length === 1 ? '' : 's'}</span>}
        </h2>
        {payouts.length > 0 && (
          <button className="admin-link-btn" onClick={downloadCsv}>
            <Download size={15} /> CSV for M-Pesa bulk pay
          </button>
        )}
      </div>
      {payouts.length === 0 ? (
        <div className="admin-empty">No Scouts are owed anything right now.</div>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Scout</th>
                <th className="hide-sm">M-Pesa</th>
                <th className="num">Tasks</th>
                <th className="num">Amount</th>
                <th className="hide-sm">Waiting since</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {payouts.map((p) => (
                <tr key={p.scout_id}>
                  <td>
                    <span className="admin-queue-title">{p.display_name || p.username}</span>
                    <span className="admin-queue-sub">@{p.username}</span>
                  </td>
                  <td className="mono hide-sm">{p.mpesa_phone || <span className="admin-danger-text">missing</span>}</td>
                  <td className="num">{p.items}</td>
                  <td className="num strong">{formatKes(p.total_kes)}</td>
                  <td className="hide-sm">{timeAgo(p.oldest_at)}</td>
                  <td className="num">
                    <button className="admin-btn primary small" onClick={() => setPaying(p)}>
                      Pay
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2 className="admin-h2">Pay per task</h2>
      <p className="admin-hint">
        Applies to submissions approved from now on. Earnings already approved keep the rate they were approved at.
      </p>
      <div className="admin-table-wrap narrow">
        <table className="admin-table">
          <tbody>
            {rates.map((r) => (
              <RateRow key={`${r.task}-${r.amount_kes}`} rate={r} onSaved={load} />
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="admin-h2">Recent payments</h2>
      {paid.length === 0 ? (
        <div className="admin-empty">Nothing paid yet.</div>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Scout</th>
                <th className="hide-sm">Task</th>
                <th className="num">Amount</th>
                <th>M-Pesa code</th>
                <th className="hide-sm">Paid</th>
              </tr>
            </thead>
            <tbody>
              {paid.map((e) => (
                <tr key={e.id}>
                  <td>{e.scout?.username ?? '–'}</td>
                  <td className="hide-sm">{TASK_LABELS[e.task] ?? e.task}</td>
                  <td className="num">{formatKes(e.amount_kes)}</td>
                  <td className="mono">{e.mpesa_ref}</td>
                  <td className="hide-sm">{formatDate(e.paid_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {paying && (
        <PayDialog
          payout={paying}
          onClose={() => setPaying(null)}
          onPaid={(result) => {
            setNotice(`Marked ${formatKes(result.total_kes)} paid to ${paying.username}.`)
            setPaying(null)
            load()
            onChanged()
          }}
        />
      )}
    </div>
  )
}

export default Payouts
