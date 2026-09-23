import { supabase } from './supabase'

export async function fetchNearbyRoadReports(lat, lng, radiusM = 5000) {
  const { data, error } = await supabase.rpc('road_reports_near_point', {
    lat,
    lng,
    radius_m: radiusM,
  })
  if (error) throw error
  return data ?? []
}

// Maps a report's severity (1-5) to the severity-dot classes App.css already
// defines (severity-high / -medium / -low).
export function severityBand(severity) {
  if (severity >= 4) return 'high'
  if (severity >= 3) return 'medium'
  return 'low'
}

const TYPE_LABELS = {
  pothole: 'Pothole',
  flooding: 'Flooding',
  construction: 'Road works',
  surface: 'Road surface',
  incident: 'Incident',
}

export function reportTypeLabel(type) {
  return TYPE_LABELS[type] ?? type
}

export function timeAgo(isoString) {
  const ms = Date.now() - new Date(isoString).getTime()
  const minutes = Math.floor(ms / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} hr ago`
  return `${Math.floor(hours / 24)} d ago`
}
