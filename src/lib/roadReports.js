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

// Groups a report's severity (1-5) into high / medium / low, which picks its
// colour (SEVERITY_COLOR in lib/placeStyles.js) on markers, badges and routes.
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
  incident: 'Accident',
  traffic: 'Heavy traffic',
  closure: 'Road closed',
  hazard: 'Hazard on road',
}

// What a driver can report from the navigation screen, most urgent first
// (submit_road_report in 20261029000000_live_road_reports.sql).
export const QUICK_REPORT_TYPES = ['incident', 'traffic', 'closure', 'hazard', 'flooding', 'pothole', 'construction']

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

// ── Live reports from drivers ──
// The database decides when a report is trusted enough to show as live
// (see the live_road_reports migration); these just send what the driver saw.

// Report something where the driver is. Merged into a nearby report of the
// same thing if there is one. Resolves to { id, merged, live, score }.
export async function submitRoadReport({ type, lat, lng, severity = null }) {
  const { data, error } = await supabase.rpc('submit_road_report', {
    p_type: type,
    p_lat: lat,
    p_lng: lng,
    p_severity: severity,
  })
  if (error) throw error
  return data
}

// "Still there?" Resolves to { id, live, ended, score }.
export async function voteRoadReport(id, stillThere) {
  const { data, error } = await supabase.rpc('vote_road_report', { p_id: id, p_still_there: stillThere })
  if (error) throw error
  return data
}

// How sure PathIQ is about one report, and how many drivers backed it: null
// once it's ended.
export async function fetchRoadReportStatus(id) {
  const { data, error } = await supabase.rpc('road_report_status', { p_id: id })
  if (error) throw error
  return data
}

// Open reports on a route the driver hasn't answered yet, to ask about as
// they pass: [{ id, type, severity, live, lat, lng, route_fraction }].
export async function fetchReportsToConfirm(path) {
  const { data, error } = await supabase.rpc('reports_to_confirm_along_route', {
    route_wkt: `LINESTRING(${path.map((p) => `${p.lng} ${p.lat}`).join(', ')})`,
    corridor_m: 60,
  })
  if (error) throw error
  return data ?? []
}
