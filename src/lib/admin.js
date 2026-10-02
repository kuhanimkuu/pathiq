import { supabase } from './supabase'

// The admin dashboard's data. Everything goes through admin_* functions
// (supabase/migrations/20261002000000_admin_dashboard.sql): each one checks
// the caller is an admin, and every admin write lands in admin_audit_log.

async function rpc(name, args = {}) {
  const { data, error } = await supabase.rpc(name, args)
  if (error) throw error
  return data
}

export const PAGE_SIZE = 50

// Lists come back with total_count on every row (window count).
const withTotal = (rows) => ({ rows: rows ?? [], total: rows?.[0]?.total_count ?? 0 })

export const fetchOverview = () => rpc('admin_overview')

// ── Gems ──
export async function fetchGems({ status = null, search = null, category = null, page = 0 } = {}) {
  const rows = await rpc('admin_gems', {
    p_status: status,
    p_search: search || null,
    p_category: category,
    p_limit: PAGE_SIZE,
    p_offset: page * PAGE_SIZE,
  })
  return withTotal(rows)
}

export const reviewGem = (id, approve, note = null) =>
  rpc('review_gem', { p_gem_id: id, p_approve: approve, p_note: note })

export const saveGem = ({ id = null, name, category, lat, lng, description = null, address = null }) =>
  rpc('admin_save_gem', {
    p_id: id,
    p_name: name,
    p_category: category,
    p_lat: lat,
    p_lng: lng,
    p_description: description,
    p_address: address,
  })

export const setGemStatus = (id, status, note = null) =>
  rpc('admin_set_gem_status', { p_id: id, p_status: status, p_note: note })

export async function deleteGem(id) {
  const { error } = await supabase.from('gems').delete().eq('id', id)
  if (error) throw error
}

// ── Road reports ──
export async function fetchRoadReports({ status = null, type = null, live = null, page = 0 } = {}) {
  const rows = await rpc('admin_road_reports', {
    p_status: status,
    p_type: type,
    p_live: live,
    p_limit: PAGE_SIZE,
    p_offset: page * PAGE_SIZE,
  })
  return withTotal(rows)
}

export const reviewRoadReport = (id, approve, note = null) =>
  rpc('review_road_report', { p_report_id: id, p_approve: approve, p_note: note })

export const saveRoadReport = ({ id = null, type, severity, lat, lng, description = null, expiresAt = null }) =>
  rpc('admin_save_road_report', {
    p_id: id,
    p_type: type,
    p_severity: severity,
    p_lat: lat,
    p_lng: lng,
    p_description: description,
    p_expires_at: expiresAt,
  })

export const setReportStatus = (id, status, note = null) =>
  rpc('admin_set_report_status', { p_id: id, p_status: status, p_note: note })

export const clearRoadReport = (id) => rpc('admin_clear_road_report', { p_id: id })

export async function deleteRoadReport(id) {
  const { error } = await supabase.from('road_reports').delete().eq('id', id)
  if (error) throw error
}

// ── Scout applications ──
export async function fetchPendingScoutApplications() {
  const { data, error } = await supabase
    .from('scout_applications')
    .select('id, area, motivation, mpesa_phone, created_at, user_id, applicant:profiles!scout_applications_user_id_fkey(username, display_name)')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
  if (error) throw error
  return data ?? []
}

export const reviewScoutApplication = (id, approve, note = null) =>
  rpc('review_scout_application', { p_application_id: id, p_approve: approve, p_note: note })

// ── Users ──
export async function fetchUsers({ search = null, role = null, includeGuests = false, sort = 'newest', page = 0 } = {}) {
  const rows = await rpc('admin_users', {
    p_search: search || null,
    p_role: role,
    p_include_guests: includeGuests,
    p_sort: sort,
    p_limit: PAGE_SIZE,
    p_offset: page * PAGE_SIZE,
  })
  return withTotal(rows)
}

export const setUserRole = (userId, role) => rpc('admin_set_role', { p_user_id: userId, p_role: role })

// ── Payouts and rates ──
export const fetchPayouts = async () => (await rpc('admin_payouts')) ?? []

export async function payScout(scoutId, earningIds, mpesaRef) {
  const rows = await rpc('admin_pay_scout', { p_scout_id: scoutId, p_earning_ids: earningIds, p_mpesa_ref: mpesaRef })
  return rows?.[0] ?? { items: 0, total_kes: 0 }
}

export async function fetchPaidEarnings(limit = 100) {
  const { data, error } = await supabase
    .from('scout_earnings')
    .select('id, task, amount_kes, mpesa_ref, paid_at, scout:profiles!scout_earnings_scout_id_fkey(username, mpesa_phone)')
    .eq('status', 'paid')
    .order('paid_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return data ?? []
}

export async function fetchTaskRates() {
  const { data, error } = await supabase.from('task_rates').select('task, amount_kes').order('amount_kes')
  if (error) throw error
  return data ?? []
}

export async function updateTaskRate(task, amountKes) {
  const { data, error } = await supabase.from('task_rates').update({ amount_kes: amountKes }).eq('task', task).select()
  if (error) throw error
  if (!data?.length) throw new Error('Rate not updated')
}

// ── Audit log ──
export async function fetchAuditLog({ table = null, before = null, limit = 50 } = {}) {
  let query = supabase
    .from('admin_audit_log')
    .select('id, action, target_table, target_id, summary, details, created_at, admin:profiles!admin_audit_log_admin_id_fkey(username)')
    .order('id', { ascending: false })
    .limit(limit)
  if (table) query = query.eq('target_table', table)
  if (before) query = query.lt('id', before)
  const { data, error } = await query
  if (error) throw error
  return data ?? []
}

// scout-photos is private; admins can read it (storage policy), via a
// short-lived signed URL.
export async function scoutPhotoUrl(path) {
  const { data, error } = await supabase.storage.from('scout-photos').createSignedUrl(path, 60 * 10)
  if (error) throw error
  return data.signedUrl
}

export const TASK_LABELS = {
  road_report: 'Road report',
  place_verification: 'Place verification',
  gem_discovery: 'Gem discovery',
  flood_survey: 'Flood survey',
}

export function formatKes(n) {
  return 'KSh ' + Number(n ?? 0).toLocaleString('en-KE')
}

// Payout list for M-Pesa bulk payment (B2C): phone, amount, reference.
export function payoutsCsv(payouts) {
  // Usernames are user-chosen: neutralise anything a spreadsheet would run as a formula.
  const esc = (v) => {
    const s = String(v ?? '')
    return `"${(/^[=+\-@\t\r]/.test(s) ? "'" + s : s).replace(/"/g, '""')}"`
  }
  const lines = [['phone', 'amount_kes', 'username', 'items', 'scout_id'].join(',')]
  for (const p of payouts) {
    lines.push([p.mpesa_phone, p.total_kes, p.username, p.items, p.scout_id].map(esc).join(','))
  }
  return lines.join('\n')
}
