import { useState } from 'react'
import { useAuth } from '../context/useAuth'
import { submitRoadReport, submitGem } from '../lib/scouts'
import { getCurrentPosition } from '../lib/gems'

const reportTypes = [
  { value: 'pothole', label: 'Pothole' },
  { value: 'flooding', label: 'Flooding' },
  { value: 'construction', label: 'Construction' },
  { value: 'surface', label: 'Road surface' },
  { value: 'incident', label: 'Incident' },
]

const gemCategories = [
  { value: 'attractions', label: 'Attractions' },
  { value: 'hotels', label: 'Hotels' },
  { value: 'food', label: 'Food' },
  { value: 'scenic', label: 'Scenic' },
  { value: 'fuel', label: 'Fuel' },
  { value: 'facilities', label: 'Facilities' },
]

function LocationField({ position, locating, onLocate }) {
  return (
    <div className="location-status">
      {position
        ? `Location: ${position.lat.toFixed(5)}, ${position.lng.toFixed(5)}${position.isFallback ? ' (fallback — check GPS access)' : ''}`
        : 'Location not captured yet.'}{' '}
      <button type="button" className="auth-link" onClick={onLocate} disabled={locating}>
        {locating ? 'Locating…' : position ? 'Update location' : 'Use current location'}
      </button>
    </div>
  )
}

function Scout() {
  const { session, profile } = useAuth()
  const userId = session?.user?.id
  const [form, setForm] = useState('report') // 'report' | 'gem'

  const [reportType, setReportType] = useState('pothole')
  const [severity, setSeverity] = useState(3)
  const [reportPosition, setReportPosition] = useState(null)
  const [reportLocating, setReportLocating] = useState(false)
  const [reportSubmitting, setReportSubmitting] = useState(false)
  const [reportError, setReportError] = useState('')
  const [reportDone, setReportDone] = useState(false)

  const [gemCategory, setGemCategory] = useState('food')
  const [gemPosition, setGemPosition] = useState(null)
  const [gemLocating, setGemLocating] = useState(false)
  const [gemSubmitting, setGemSubmitting] = useState(false)
  const [gemError, setGemError] = useState('')
  const [gemDone, setGemDone] = useState(false)

  if (profile && profile.role !== 'scout' && profile.role !== 'admin') {
    return (
      <div className="profile-page">
        <h1 className="page-title">Scout tools</h1>
        <p className="list-row-sub">
          This area is for approved Scouts. Apply from your Profile page to get access.
        </p>
      </div>
    )
  }

  async function locate(setPosition, setLocating) {
    setLocating(true)
    try {
      setPosition(await getCurrentPosition())
    } finally {
      setLocating(false)
    }
  }

  async function handleSubmitReport(e) {
    e.preventDefault()
    setReportError('')
    if (!reportPosition) {
      setReportError('Capture a location first.')
      return
    }
    setReportSubmitting(true)
    const description = new FormData(e.target).get('description')
    try {
      await submitRoadReport(userId, {
        type: reportType,
        severity,
        description,
        lat: reportPosition.lat,
        lng: reportPosition.lng,
      })
      setReportDone(true)
      e.target.reset()
    } catch (err) {
      setReportError(err.message)
    } finally {
      setReportSubmitting(false)
    }
  }

  async function handleSubmitGem(e) {
    e.preventDefault()
    setGemError('')
    if (!gemPosition) {
      setGemError('Capture a location first.')
      return
    }
    setGemSubmitting(true)
    const form = new FormData(e.target)
    try {
      await submitGem(userId, {
        name: form.get('name'),
        category: gemCategory,
        description: form.get('description'),
        lat: gemPosition.lat,
        lng: gemPosition.lng,
      })
      setGemDone(true)
      e.target.reset()
    } catch (err) {
      setGemError(err.message)
    } finally {
      setGemSubmitting(false)
    }
  }

  return (
    <div className="profile-page">
      <h1 className="page-title">Scout tools</h1>

      <div className="review-tabs">
        <button className={'review-tab' + (form === 'report' ? ' active' : '')} onClick={() => setForm('report')}>
          Road report
        </button>
        <button className={'review-tab' + (form === 'gem' ? ' active' : '')} onClick={() => setForm('gem')}>
          New gem
        </button>
      </div>

      {form === 'report' && (
        <div className="section-card">
          <div className="section-title">Report a road condition</div>
          {reportDone && (
            <p className="list-row-sub" style={{ marginBottom: 12 }}>
              <span className="status-pill pending">Submitted</span> Awaiting admin review.
            </p>
          )}
          {reportError && <p className="auth-error">{reportError}</p>}
          <form onSubmit={handleSubmitReport}>
            <select className="form-select" value={reportType} onChange={(e) => setReportType(e.target.value)}>
              {reportTypes.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>

            <div className="severity-picker">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  className={'severity-btn' + (n === severity ? ' active' : '')}
                  onClick={() => setSeverity(n)}
                >
                  {n}
                </button>
              ))}
            </div>

            <textarea name="description" className="form-textarea" placeholder="What did you see? (optional)" />

            <LocationField
              position={reportPosition}
              locating={reportLocating}
              onLocate={() => locate(setReportPosition, setReportLocating)}
            />

            <button type="submit" className="btn btn-primary btn-lg auth-btn" disabled={reportSubmitting}>
              {reportSubmitting ? 'Submitting…' : 'Submit report'}
            </button>
          </form>
        </div>
      )}

      {form === 'gem' && (
        <div className="section-card">
          <div className="section-title">Submit a Hidden Gem</div>
          {gemDone && (
            <p className="list-row-sub" style={{ marginBottom: 12 }}>
              <span className="status-pill pending">Submitted</span> Awaiting admin review.
            </p>
          )}
          {gemError && <p className="auth-error">{gemError}</p>}
          <form onSubmit={handleSubmitGem}>
            <input
              name="name"
              className="auth-input"
              style={{ marginBottom: 14 }}
              type="text"
              placeholder="Place name"
              required
            />
            <select className="form-select" value={gemCategory} onChange={(e) => setGemCategory(e.target.value)}>
              {gemCategories.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
            <textarea name="description" className="form-textarea" placeholder="What makes it worth a detour? (optional)" />

            <LocationField
              position={gemPosition}
              locating={gemLocating}
              onLocate={() => locate(setGemPosition, setGemLocating)}
            />

            <button type="submit" className="btn btn-primary btn-lg auth-btn" disabled={gemSubmitting}>
              {gemSubmitting ? 'Submitting…' : 'Submit gem'}
            </button>
          </form>
        </div>
      )}
    </div>
  )
}

export default Scout
