import { supabase } from './supabase'

// Kenyan mobile numbers in 254XXXXXXXXX form — matches the DB check constraint
// on scout_applications.mpesa_phone / profiles.mpesa_phone.
export const MPESA_PHONE_PATTERN = /^254[17][0-9]{8}$/

export async function fetchMyScoutApplication(userId) {
  if (!userId) return null
  const { data, error } = await supabase
    .from('scout_applications')
    .select('id, area, status, created_at, reviewed_at')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw error
  return data
}

export async function applyAsScout(userId, { area, motivation, mpesaPhone }) {
  const { error } = await supabase
    .from('scout_applications')
    .insert({ user_id: userId, area, motivation, mpesa_phone: mpesaPhone })
  if (error) throw error
}

// Road condition report, submitted as 'pending' — RLS only lets scouts and
// admins insert these. lat/lng come from the browser's geolocation.
export async function submitRoadReport(userId, { type, severity, description, lat, lng }) {
  const { error } = await supabase.from('road_reports').insert({
    reported_by: userId,
    type,
    severity,
    description,
    location: `SRID=4326;POINT(${lng} ${lat})`,
  })
  if (error) throw error
}

export async function submitGem(userId, { name, category, description, lat, lng }) {
  const { error } = await supabase.from('gems').insert({
    created_by: userId,
    name,
    category,
    description,
    location: `SRID=4326;POINT(${lng} ${lat})`,
  })
  if (error) throw error
}
