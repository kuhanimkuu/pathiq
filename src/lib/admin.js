import { supabase } from './supabase'

// Every list here relies on the "admin sees everything" clause already built
// into each table's RLS select policy — no separate admin-only endpoint
// needed, just querying as a user whose profile has role = 'admin'.

export async function fetchPendingGems() {
  const { data, error } = await supabase
    .from('gems')
    .select('id, name, category, description, photo_path, created_at, created_by')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
  if (error) throw error
  return data ?? []
}

export async function fetchPendingRoadReports() {
  const { data, error } = await supabase
    .from('road_reports')
    .select('id, type, severity, description, photo_path, created_at, reported_by')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
  if (error) throw error
  return data ?? []
}

export async function fetchPendingScoutApplications() {
  const { data, error } = await supabase
    .from('scout_applications')
    .select('id, area, motivation, mpesa_phone, created_at, user_id')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
  if (error) throw error
  return data ?? []
}

export async function fetchApprovedEarnings() {
  const { data, error } = await supabase
    .from('scout_earnings')
    .select('id, scout_id, task, amount_kes, created_at')
    .eq('status', 'approved')
    .order('created_at', { ascending: true })
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

export async function reviewGem(gemId, approve) {
  const { error } = await supabase.rpc('review_gem', { p_gem_id: gemId, p_approve: approve })
  if (error) throw error
}

export async function reviewRoadReport(reportId, approve) {
  const { error } = await supabase.rpc('review_road_report', { p_report_id: reportId, p_approve: approve })
  if (error) throw error
}

export async function reviewScoutApplication(applicationId, approve) {
  const { error } = await supabase.rpc('review_scout_application', {
    p_application_id: applicationId,
    p_approve: approve,
  })
  if (error) throw error
}

export async function markEarningPaid(earningId, mpesaRef) {
  const { error } = await supabase.rpc('mark_earning_paid', { p_earning_id: earningId, p_mpesa_ref: mpesaRef })
  if (error) throw error
}
