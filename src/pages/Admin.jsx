import { useEffect, useState, useCallback } from 'react'
import { useAuth } from '../context/useAuth'
import {
  fetchPendingGems,
  fetchPendingRoadReports,
  fetchPendingScoutApplications,
  fetchApprovedEarnings,
  reviewGem,
  reviewRoadReport,
  reviewScoutApplication,
  markEarningPaid,
  scoutPhotoUrl,
} from '../lib/admin'
import { reportTypeLabel, timeAgo } from '../lib/roadReports'

function ReviewPhoto({ path }) {
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

const tabs = [
  { key: 'gems', label: 'Gems' },
  { key: 'reports', label: 'Road reports' },
  { key: 'applications', label: 'Scout applications' },
  { key: 'earnings', label: 'Earnings' },
]

function Admin() {
  const { profile } = useAuth()
  const [activeTab, setActiveTab] = useState('gems')
  const [gems, setGems] = useState([])
  const [reports, setReports] = useState([])
  const [applications, setApplications] = useState([])
  const [earnings, setEarnings] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState(null)

  const load = useCallback(async () => {
    try {
      const [gemRows, reportRows, applicationRows, earningRows] = await Promise.all([
        fetchPendingGems(),
        fetchPendingRoadReports(),
        fetchPendingScoutApplications(),
        fetchApprovedEarnings(),
      ])
      setGems(gemRows)
      setReports(reportRows)
      setApplications(applicationRows)
      setEarnings(earningRows)
      setError('')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  // Inline rather than calling `load()` — see the note in Gems.jsx.
  useEffect(() => {
    if (profile?.role !== 'admin') return
    let cancelled = false
    async function run() {
      try {
        const [gemRows, reportRows, applicationRows, earningRows] = await Promise.all([
          fetchPendingGems(),
          fetchPendingRoadReports(),
          fetchPendingScoutApplications(),
          fetchApprovedEarnings(),
        ])
        if (cancelled) return
        setGems(gemRows)
        setReports(reportRows)
        setApplications(applicationRows)
        setEarnings(earningRows)
        setError('')
      } catch (err) {
        if (!cancelled) setError(err.message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    run()
    return () => {
      cancelled = true
    }
  }, [profile])

  if (profile && profile.role !== 'admin') {
    return (
      <div className="profile-page">
        <h1 className="page-title">Admin</h1>
        <p className="list-row-sub">This area is for admins only.</p>
      </div>
    )
  }

  async function withBusy(id, fn) {
    setBusyId(id)
    setError('')
    try {
      await fn()
      await load()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusyId(null)
    }
  }

  async function handleMarkPaid(earningId) {
    const ref = window.prompt('M-Pesa transaction reference:')
    if (!ref) return
    withBusy(earningId, () => markEarningPaid(earningId, ref))
  }

  return (
    <div className="profile-page">
      <h1 className="page-title">Admin review</h1>

      <div className="review-tabs">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            className={'review-tab' + (tab.key === activeTab ? ' active' : '')}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {error && <p className="auth-error">{error}</p>}
      {loading && <p className="list-row-sub">Loading…</p>}

      {!loading && activeTab === 'gems' && (
        <>
          {gems.length === 0 && <p className="list-row-sub">No pending gems.</p>}
          {gems.map((gem) => (
            <div key={gem.id} className="review-card">
              <div className="review-card-title">{gem.name}</div>
              <div className="review-card-sub">
                {gem.category} · submitted {timeAgo(gem.created_at)}
                {gem.description ? ` · ${gem.description}` : ''}
              </div>
              {gem.photo_path && <ReviewPhoto path={gem.photo_path} />}
              <div className="review-card-actions">
                <button
                  className="review-approve-btn"
                  disabled={busyId === gem.id}
                  onClick={() => withBusy(gem.id, () => reviewGem(gem.id, true))}
                >
                  Approve
                </button>
                <button
                  className="review-reject-btn"
                  disabled={busyId === gem.id}
                  onClick={() => withBusy(gem.id, () => reviewGem(gem.id, false))}
                >
                  Reject
                </button>
              </div>
            </div>
          ))}
        </>
      )}

      {!loading && activeTab === 'reports' && (
        <>
          {reports.length === 0 && <p className="list-row-sub">No pending road reports.</p>}
          {reports.map((report) => (
            <div key={report.id} className="review-card">
              <div className="review-card-title">
                {reportTypeLabel(report.type)} · severity {report.severity}
              </div>
              <div className="review-card-sub">
                submitted {timeAgo(report.created_at)}
                {report.description ? ` · ${report.description}` : ''}
              </div>
              {report.photo_path && <ReviewPhoto path={report.photo_path} />}
              <div className="review-card-actions">
                <button
                  className="review-approve-btn"
                  disabled={busyId === report.id}
                  onClick={() => withBusy(report.id, () => reviewRoadReport(report.id, true))}
                >
                  Approve
                </button>
                <button
                  className="review-reject-btn"
                  disabled={busyId === report.id}
                  onClick={() => withBusy(report.id, () => reviewRoadReport(report.id, false))}
                >
                  Reject
                </button>
              </div>
            </div>
          ))}
        </>
      )}

      {!loading && activeTab === 'applications' && (
        <>
          {applications.length === 0 && <p className="list-row-sub">No pending Scout applications.</p>}
          {applications.map((app) => (
            <div key={app.id} className="review-card">
              <div className="review-card-title">{app.area}</div>
              <div className="review-card-sub">
                {app.mpesa_phone} · submitted {timeAgo(app.created_at)}
                {app.motivation ? ` · ${app.motivation}` : ''}
              </div>
              <div className="review-card-actions">
                <button
                  className="review-approve-btn"
                  disabled={busyId === app.id}
                  onClick={() => withBusy(app.id, () => reviewScoutApplication(app.id, true))}
                >
                  Approve
                </button>
                <button
                  className="review-reject-btn"
                  disabled={busyId === app.id}
                  onClick={() => withBusy(app.id, () => reviewScoutApplication(app.id, false))}
                >
                  Reject
                </button>
              </div>
            </div>
          ))}
        </>
      )}

      {!loading && activeTab === 'earnings' && (
        <>
          {earnings.length === 0 && <p className="list-row-sub">No earnings awaiting payout.</p>}
          {earnings.map((earning) => (
            <div key={earning.id} className="review-card">
              <div className="review-card-title">KSh {earning.amount_kes}</div>
              <div className="review-card-sub">
                {earning.task.replace('_', ' ')} · approved {timeAgo(earning.created_at)}
              </div>
              <div className="review-card-actions">
                <button
                  className="review-approve-btn"
                  disabled={busyId === earning.id}
                  onClick={() => handleMarkPaid(earning.id)}
                >
                  Mark paid via M-Pesa
                </button>
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  )
}

export default Admin
