import { Bookmark } from 'lucide-react'
import { GemBadge, ReportBadge } from '../../components/PlaceIcons'
import { reportTypeLabel } from '../../lib/roadReports'
import { formatDistance } from '../../lib/navigation'

// Cards that stack under the navigation banner while driving.

export function ReportAlert({ alert }) {
  return (
    <div className="nav-gem-alert nav-report-alert" role="alert">
      <ReportBadge type={alert.report.type} severity={alert.report.severity} size={40} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="nav-gem-alert-kicker">Road report ahead · {formatDistance(alert.aheadM)}</div>
        <div className="nav-gem-alert-name">{reportTypeLabel(alert.report.type)}</div>
        <div className="nav-gem-alert-sub">Severity {alert.report.severity}/5 · on your route</div>
      </div>
    </div>
  )
}

export function GemAlert({ alert, saved, busy, onSave }) {
  const google = alert.gem.source === 'google'
  return (
    <div className={'nav-gem-alert' + (alert.type === 'passed' ? ' passed' : '')} role="status" aria-live="polite">
      <GemBadge category={alert.gem.category} size={40} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="nav-gem-alert-kicker">
          {alert.type === 'approaching'
            ? `${google ? 'Top rated on Google' : 'Hidden gem ahead'} · ${formatDistance(alert.aheadM)}`
            : 'You just passed'}
        </div>
        <div className="nav-gem-alert-name">{alert.gem.name}</div>
        <div className="nav-gem-alert-sub">
          {google && `★ ${alert.gem.rating} on Google · `}~{alert.detourMin} min detour (estimate)
        </div>
      </div>
      {alert.type === 'passed' &&
        !google &&
        (saved ? (
          <span className="nav-gem-alert-saved">Saved</span>
        ) : (
          <button className="nav-gem-alert-save" disabled={busy} onClick={onSave}>
            <Bookmark size={14} /> Save
          </button>
        ))}
    </div>
  )
}
