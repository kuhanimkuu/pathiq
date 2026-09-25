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
export async function submitRoadReport(userId, { type, severity, description, lat, lng, photoPath = null }) {
  const { error } = await supabase.from('road_reports').insert({
    reported_by: userId,
    type,
    severity,
    description,
    location: `SRID=4326;POINT(${lng} ${lat})`,
    photo_path: photoPath,
  })
  if (error) throw error
}

export async function submitGem(userId, { name, category, description, lat, lng, photoPath = null }) {
  const { error } = await supabase.from('gems').insert({
    created_by: userId,
    name,
    category,
    description,
    location: `SRID=4326;POINT(${lng} ${lat})`,
    photo_path: photoPath,
  })
  if (error) throw error
}

// Phone photos are often 5–10 MB; admins only need enough detail to verify.
const PHOTO_MAX_EDGE = 1600
const PHOTO_QUALITY = 0.8

async function shrinkPhoto(file) {
  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, PHOTO_MAX_EDGE / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bitmap.width * scale)
    canvas.height = Math.round(bitmap.height * scale)
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    bitmap.close()
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', PHOTO_QUALITY))
    return blob ?? file
  } catch {
    return file // format the browser can't decode (e.g. HEIC on desktop) — upload as-is
  }
}

// Uploads to the private scout-photos bucket under <user id>/, which is what
// its storage policy requires. Returns the object path to store on the row.
export async function uploadScoutPhoto(userId, file) {
  const body = await shrinkPhoto(file)
  const ext = body.type === 'image/jpeg' ? 'jpg' : (file.name.split('.').pop() || 'img').toLowerCase()
  const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
  const { error } = await supabase.storage.from('scout-photos').upload(path, body, { contentType: body.type || file.type })
  if (error) throw error
  return path
}
