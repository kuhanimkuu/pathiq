import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/useAuth'
import { submitRoadReport, submitGem, uploadScoutPhoto } from '../lib/scouts'
import { getCurrentPosition } from '../lib/gems'
import { locationHelp } from '../lib/locationHelp'
import { suspensionNotice } from '../lib/suspension'

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
        ? `Location: ${position.lat.toFixed(5)}, ${position.lng.toFixed(5)}${
            position.fromMap ? ' (picked on the map)' : position.isFallback ? ` (not your real location: ${locationHelp(position.reason).title.toLowerCase()})` : ''
          }`
        : 'Location not captured yet.'}{' '}
      <button type="button" className="auth-link" onClick={onLocate} disabled={locating}>
        {locating ? 'Locating…' : position ? 'Update location' : 'Use current location'}
      </button>
    </div>
  )
}

// Opens the rear camera on phones (capture="environment"), file picker elsewhere.
function PhotoField({ file, onChange }) {
  const [preview, setPreview] = useState(null)
  function handleChange(e) {
    const next = e.target.files?.[0] ?? null
    if (preview) URL.revokeObjectURL(preview)
    setPreview(next ? URL.createObjectURL(next) : null)
    onChange(next)
  }
  return (
    <div className="photo-field">
      <label className="photo-field-btn">
        {file ? 'Change photo' : 'Add a photo (optional)'}
        <input type="file" accept="image/*" capture="environment" onChange={handleChange} hidden />
      </label>
      {preview && file && <img src={preview} alt="Selected" className="photo-field-preview" />}
    </div>
  )
}

// "Report a road issue here" / "Add a gem here" on the map's dropped pin
// arrive as ?form=report|gem&lat=…&lng=… with the spot already chosen.
function pinFromUrl(params) {
  const lat = Number(params.get('lat'))
  const lng = Number(params.get('lng'))
  if (!params.get('lat') || !Number.isFinite(lat) || !Number.isFinite(lng)) return null
  return { lat, lng, isFallback: false, fromMap: true }
}

function Scout() {
  const { session, profile } = useAuth()
  const userId = session?.user?.id
  const [searchParams] = useSearchParams()
  const [mapPin] = useState(() => pinFromUrl(searchParams))
  const [form, setForm] = useState(searchParams.get('form') === 'gem' ? 'gem' : 'report') // 'report' | 'gem'

  const [reportType, setReportType] = useState('pothole')
  const [severity, setSeverity] = useState(3)
  const [reportPosition, setReportPosition] = useState(mapPin)
  const [reportLocating, setReportLocating] = useState(false)
  const [reportSubmitting, setReportSubmitting] = useState(false)
  const [reportError, setReportError] = useState('')
  const [reportDone, setReportDone] = useState(false)
  const [reportPhoto, setReportPhoto] = useState(null)

  const [gemCategory, setGemCategory] = useState('food')
  const [gemPosition, setGemPosition] = useState(mapPin)
  const [gemLocating, setGemLocating] = useState(false)
  const [gemSubmitting, setGemSubmitting] = useState(false)
  const [gemError, setGemError] = useState('')
  const [gemDone, setGemDone] = useState(false)
  const [gemPhoto, setGemPhoto] = useState(null)

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

  const suspended = suspensionNotice(profile)
  if (suspended) {
    return (
      <div className="profile-page">
        <h1 className="page-title">Scout tools</h1>
        <p className="list-row-sub">Scout tools are paused while your account is suspended (see the note above).</p>
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
      const photoPath = reportPhoto ? await uploadScoutPhoto(userId, reportPhoto) : null
      await submitRoadReport(userId, {
        type: reportType,
        severity,
        description,
        lat: reportPosition.lat,
        lng: reportPosition.lng,
        photoPath,
      })
      setReportDone(true)
      setReportPhoto(null)
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
      const photoPath = gemPhoto ? await uploadScoutPhoto(userId, gemPhoto) : null
      await submitGem(userId, {
        name: form.get('name'),
        category: gemCategory,
        description: form.get('description'),
        lat: gemPosition.lat,
        lng: gemPosition.lng,
        photoPath,
      })
      setGemDone(true)
      setGemPhoto(null)
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

            <PhotoField file={reportPhoto} onChange={setReportPhoto} />

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

            <PhotoField file={gemPhoto} onChange={setGemPhoto} />

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
