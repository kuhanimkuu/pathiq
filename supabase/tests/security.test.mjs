// Security checks against a real Supabase project: RLS on every table, the
// trip/IQ-score rules, Scout photo rules, and the write rate limits.
//
//   SUPABASE_URL=... SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=... npm run test:security
//
// Creates throwaway guest users and deletes everything it made, even on
// failure. The service role key is only used to set up roles (a Scout, an
// admin) and to clean up — never for the checks themselves.
// Run it against a dev/staging project, not one with real users.

const U = process.env.SUPABASE_URL
const ANON = process.env.SUPABASE_ANON_KEY
const SRK = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!U || !ANON || !SRK) {
  console.error('Set SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY.')
  process.exit(2)
}

let pass = 0, fail = 0
const ok = (name, cond, detail = '') => { cond ? pass++ : fail++; console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : '  ← ' + detail}`) }
const req = async (token, method, path, body, extra = {}) => {
  const r = await fetch(U + path, { method, headers: { apikey: ANON, Authorization: `Bearer ${token ?? ANON}`, 'Content-Type': 'application/json', Prefer: 'return=representation', ...extra }, body: body === undefined ? undefined : typeof body === 'string' || body instanceof Uint8Array ? body : JSON.stringify(body) })
  const text = await r.text(); let json = null; try { json = JSON.parse(text) } catch {}
  return { status: r.status, json, text }
}
const svc = (method, path, body) => fetch(U + path, { method, headers: { apikey: SRK, Authorization: `Bearer ${SRK}`, 'Content-Type': 'application/json', Prefer: 'return=representation' }, body: body && JSON.stringify(body) }).then(async (r) => ({ status: r.status, json: await r.json().catch(() => null) }))
// A real (non-guest) account, signed in with a password just now.
const passwordUser = async (email) => {
  const password = 'Rls-' + Math.random().toString(36).slice(2) + 'A1!'
  const u = await svc('POST', '/auth/v1/admin/users', { email, password, email_confirm: true })
  const r = await req(null, 'POST', '/auth/v1/token?grant_type=password', { email, password })
  return { id: u.json.id, token: r.json.access_token }
}
const guest = async () => { const r = await req(null, 'POST', '/auth/v1/signup', {}); return { token: r.json.access_token, id: r.json.user.id } }
const point = 'SRID=4326;POINT(36.82 -1.29)'
const created = { users: [], photos: [], reports: [], gems: [] }

try {
  const A = await guest(), B = await guest(); created.users.push(A.id, B.id)

  // ── anon ──
  for (const t of ['trips', 'trip_gem_events', 'profiles', 'gems', 'road_reports', 'saved_gems', 'scout_earnings', 'scout_applications', 'route_cache']) {
    const r = await req(null, 'GET', `/rest/v1/${t}?select=*&limit=1`)
    ok(`anon cannot read ${t}`, r.status >= 400 || (Array.isArray(r.json) && r.json.length === 0), `${r.status} ${r.text.slice(0, 80)}`)
  }
  let r = await req(null, 'POST', '/rest/v1/rpc/my_driver_stats', {})
  ok('anon cannot call my_driver_stats', r.status >= 400, `${r.status}`)
  r = await req(A.token, 'POST', '/rest/v1/rpc/compute_iq_score', { p_user: B.id })
  ok('users cannot call compute_iq_score', r.status >= 400, `${r.status} ${r.text.slice(0, 80)}`)

  // The landing page's map: anon gets map points only, never who submitted them.
  r = await req(null, 'POST', '/rest/v1/rpc/public_map_points', {})
  ok('anon can read public map points', r.status === 200 && Array.isArray(r.json?.gems) && Array.isArray(r.json?.reports), `${r.status} ${r.text.slice(0, 80)}`)
  const allowed = { gems: ['id', 'name', 'category', 'lng', 'lat', 'distance_m'], reports: ['id', 'type', 'severity', 'lng', 'lat', 'distance_m'] }
  const extra = ['gems', 'reports'].flatMap((k) => (r.json?.[k] ?? []).flatMap((row) => Object.keys(row).filter((f) => !allowed[k].includes(f))))
  ok('public map points expose no other fields', extra.length === 0, [...new Set(extra)].join(', '))

  // ── trips ──
  const base = { user_id: A.id, destination: point, destination_name: 'Test', road_quality: 80 }
  r = await req(A.token, 'POST', '/rest/v1/trips', { ...base, ended_at: new Date().toISOString(), arrived: true })
  ok('cannot insert an already-finished trip', r.status >= 400, `${r.status}`)
  r = await req(A.token, 'POST', '/rest/v1/trips', { ...base, reroutes: 2 })
  ok('cannot insert a trip with reroutes', r.status >= 400, `${r.status}`)
  r = await req(A.token, 'POST', '/rest/v1/trips', { ...base, user_id: B.id })
  ok("cannot insert a trip for someone else", r.status >= 400, `${r.status}`)
  const backdated = new Date(Date.now() - 3 * 86400_000).toISOString()
  r = await req(A.token, 'POST', '/rest/v1/trips', { ...base, started_at: backdated })
  ok('can start own open trip', r.status === 201, `${r.status} ${r.text.slice(0, 120)}`)
  const trip = r.json[0]
  ok('started_at is forced to server time (no backdating)', Math.abs(new Date(trip.started_at) - Date.now()) < 60_000, trip.started_at)

  r = await req(A.token, 'PATCH', `/rest/v1/trips?id=eq.${trip.id}`, { road_quality: 100 })
  ok('cannot change road_quality after start', r.status >= 400, `${r.status}`)
  r = await req(A.token, 'PATCH', `/rest/v1/trips?id=eq.${trip.id}`, { arrived: true })
  ok('cannot mark arrived without ending', r.status >= 400, `${r.status}`)
  r = await req(A.token, 'PATCH', `/rest/v1/trips?id=eq.${trip.id}`, { reroutes: 2 })
  ok('can record reroutes', r.status === 200 && r.json[0].reroutes === 2, `${r.status}`)
  r = await req(A.token, 'PATCH', `/rest/v1/trips?id=eq.${trip.id}`, { reroutes: 0 })
  ok('reroutes cannot go down', r.status >= 400, `${r.status}`)

  // B vs A's trip
  r = await req(B.token, 'GET', `/rest/v1/trips?id=eq.${trip.id}&select=id`)
  ok("B cannot see A's trip", Array.isArray(r.json) && r.json.length === 0, r.text)
  r = await req(B.token, 'PATCH', `/rest/v1/trips?id=eq.${trip.id}`, { ended_at: new Date().toISOString() })
  ok("B cannot end A's trip", Array.isArray(r.json) && r.json.length === 0, `${r.status} ${r.text}`)
  r = await req(B.token, 'DELETE', `/rest/v1/trips?id=eq.${trip.id}`)
  ok("B cannot delete A's trip", Array.isArray(r.json) && r.json.length === 0, `${r.status} ${r.text}`)

  // gem events
  const gem = (await req(A.token, 'GET', '/rest/v1/gems?select=id&status=eq.verified&limit=1')).json[0]
  r = await req(B.token, 'POST', '/rest/v1/trip_gem_events', { trip_id: trip.id, gem_id: gem.id, event: 'approaching' })
  ok("B cannot add gem events to A's trip", r.status >= 400, `${r.status}`)
  r = await req(A.token, 'POST', '/rest/v1/trip_gem_events', { trip_id: trip.id, gem_id: gem.id, event: 'approaching' })
  ok('A can add a gem event to own open trip', r.status === 201, `${r.status} ${r.text.slice(0, 100)}`)
  r = await req(A.token, 'POST', '/rest/v1/trip_gem_events', { trip_id: trip.id, gem_id: gem.id, event: 'approaching' })
  ok('same gem event twice is rejected (once per trip)', r.status === 409, `${r.status}`)

  // end the trip
  const fakeEnd = new Date(Date.now() + 86400_000).toISOString()
  r = await req(A.token, 'PATCH', `/rest/v1/trips?id=eq.${trip.id}`, { ended_at: fakeEnd, arrived: true })
  ok('A can end own trip', r.status === 200, `${r.status} ${r.text.slice(0, 100)}`)
  ok('ended_at is forced to server time', Math.abs(new Date(r.json[0].ended_at) - Date.now()) < 60_000, r.json[0].ended_at)
  r = await req(A.token, 'PATCH', `/rest/v1/trips?id=eq.${trip.id}`, { reroutes: 5 })
  ok('a closed trip is frozen', r.status >= 400, `${r.status}`)
  r = await req(A.token, 'POST', '/rest/v1/trip_gem_events', { trip_id: trip.id, gem_id: gem.id, event: 'passed' })
  ok('no gem events on a closed trip', r.status >= 400, `${r.status}`)
  r = await req(A.token, 'GET', `/rest/v1/profiles?id=eq.${A.id}&select=iq_score`)
  ok('IQ score still recomputed by trigger', r.json[0].iq_score === 77, JSON.stringify(r.json)) // 0.5*80 + 30 + 0.2*(100 - 2*33.3)

  // profiles
  r = await req(A.token, 'PATCH', `/rest/v1/profiles?id=eq.${A.id}`, { iq_score: 100 })
  ok('cannot set own iq_score', r.status >= 400, `${r.status}`)
  r = await req(A.token, 'PATCH', `/rest/v1/profiles?id=eq.${A.id}`, { role: 'admin' })
  ok('cannot set own role', r.status >= 400, `${r.status}`)
  r = await req(A.token, 'PATCH', `/rest/v1/profiles?id=eq.${A.id}`, { notifications_on: false })
  ok('can set own notifications_on', r.status === 200, `${r.status}`)
  r = await req(B.token, 'GET', `/rest/v1/profiles?id=eq.${A.id}&select=id`)
  ok("B cannot read A's profile", Array.isArray(r.json) && r.json.length === 0, r.text)
  r = await req(A.token, 'POST', '/rest/v1/rpc/my_driver_stats', {})
  ok('stats count only own data', r.json[0].trips_this_month === 1 && r.json[0].gems_found === 1, JSON.stringify(r.json))
  r = await req(B.token, 'POST', '/rest/v1/rpc/my_driver_stats', {})
  ok("B's stats don't include A's", r.json[0].trips_this_month === 0 && r.json[0].gems_found === 0, JSON.stringify(r.json))

  // quick picks on the Routes tab
  r = await req(A.token, 'POST', '/rest/v1/rpc/my_recent_destinations', { p_limit: 5 })
  ok('A sees own recent destination', Array.isArray(r.json) && r.json.length === 1 && r.json[0].name === 'Test', JSON.stringify(r.json))
  r = await req(B.token, 'POST', '/rest/v1/rpc/my_recent_destinations', { p_limit: 5 })
  ok("B doesn't see A's recent destinations", Array.isArray(r.json) && r.json.length === 0, JSON.stringify(r.json))
  await req(A.token, 'POST', '/rest/v1/saved_gems', { user_id: A.id, gem_id: gem.id })
  r = await req(A.token, 'POST', '/rest/v1/rpc/my_saved_gems', {})
  ok('A sees own saved gem with coordinates', r.json?.length === 1 && typeof r.json[0].lat === 'number', JSON.stringify(r.json))
  r = await req(B.token, 'POST', '/rest/v1/rpc/my_saved_gems', {})
  ok("B doesn't see A's saved gems", Array.isArray(r.json) && r.json.length === 0, JSON.stringify(r.json))
  // History tab
  r = await req(A.token, 'POST', '/rest/v1/rpc/my_trip_history', { p_limit: 10 })
  ok('A sees own trip in history, with gems alerted', r.json?.length === 1 && r.json[0].id === trip.id && r.json[0].gems_alerted === 1, JSON.stringify(r.json))
  r = await req(B.token, 'POST', '/rest/v1/rpc/my_trip_history', { p_limit: 10 })
  ok("B doesn't see A's history", Array.isArray(r.json) && r.json.every((t) => t.id !== trip.id), JSON.stringify(r.json).slice(0, 120))
  // deleting a trip recomputes the IQ Score (A's only counted trip → no score)
  r = await req(A.token, 'DELETE', `/rest/v1/trips?id=eq.${trip.id}`)
  ok('A can remove own trip', r.status === 200 && r.json?.length === 1, `${r.status}`)
  r = await req(A.token, 'GET', `/rest/v1/profiles?id=eq.${A.id}&select=iq_score`)
  ok('removing a trip updates the IQ Score', r.json[0].iq_score === null, JSON.stringify(r.json))

  for (const fn of ['my_recent_destinations', 'my_saved_gems', 'my_trip_history']) {
    r = await req(null, 'POST', `/rest/v1/rpc/${fn}`, {})
    ok(`anon cannot call ${fn}`, r.status >= 400, `${r.status}`)
  }

  // ── Pinned places ──
  r = await req(A.token, 'POST', '/rest/v1/pinned_places', { name: 'Home', label: 'home', location: point })
  ok('A can pin a place', r.status === 201, `${r.status} ${r.text.slice(0, 120)}`)
  const pinA = r.json?.[0]
  r = await req(A.token, 'POST', '/rest/v1/pinned_places', { name: 'Home', label: 'home', location: point, user_id: B.id })
  ok('cannot pin a place for someone else', r.status >= 400, `${r.status}`)
  r = await req(B.token, 'GET', `/rest/v1/pinned_places?id=eq.${pinA?.id}&select=*`)
  ok("B cannot read A's pins", r.status === 200 && r.json.length === 0, JSON.stringify(r.json))
  r = await req(B.token, 'POST', '/rest/v1/rpc/my_pinned_places', {})
  ok("my_pinned_places doesn't leak A's pins to B", r.status === 200 && r.json.length === 0, JSON.stringify(r.json))
  r = await req(B.token, 'PATCH', `/rest/v1/pinned_places?id=eq.${pinA?.id}`, { name: 'Mine now' })
  ok("B cannot rename A's pin", r.status >= 400 || r.json?.length === 0, `${r.status}`)
  r = await req(B.token, 'DELETE', `/rest/v1/pinned_places?id=eq.${pinA?.id}`)
  ok("B cannot remove A's pin", r.status >= 400 || r.json?.length === 0, `${r.status}`)
  r = await req(A.token, 'POST', '/rest/v1/pinned_places', { name: 'New home', label: 'home', location: point })
  ok('a second Home is allowed', r.status === 201, `${r.status} ${r.text.slice(0, 120)}`)
  r = await req(A.token, 'POST', '/rest/v1/rpc/my_pinned_places', {})
  ok('the old Home becomes a plain pin', r.json?.filter((p) => p.label === 'home').length === 1 && r.json?.length === 2, JSON.stringify(r.json))
  r = await req(null, 'POST', '/rest/v1/rpc/my_pinned_places', {})
  ok('anon cannot call my_pinned_places', r.status >= 400, `${r.status}`)
  r = await req(null, 'GET', '/rest/v1/pinned_places?select=*&limit=1')
  ok('anon cannot read pinned_places', r.status >= 400 || (Array.isArray(r.json) && r.json.length === 0), `${r.status}`)

  // ── Scout submissions and photos ──
  r = await req(B.token, 'POST', '/rest/v1/road_reports', { type: 'pothole', severity: 3, location: point, reported_by: B.id })
  ok('non-Scouts cannot submit road reports', r.status >= 400, `${r.status}`)
  const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])
  r = await req(B.token, 'POST', `/storage/v1/object/scout-photos/${B.id}/x.png`, png, { 'Content-Type': 'image/png' })
  ok('non-Scouts cannot upload photos', r.status >= 400, `${r.status}`)

  await svc('PATCH', `/rest/v1/profiles?id=eq.${A.id}`, { role: 'scout' })
  r = await req(A.token, 'POST', `/storage/v1/object/scout-photos/${B.id}/x.png`, png, { 'Content-Type': 'image/png' })
  ok("Scout cannot upload into someone else's folder", r.status >= 400, `${r.status}`)
  r = await req(A.token, 'POST', `/storage/v1/object/scout-photos/${A.id}/x.png`, png, { 'Content-Type': 'image/png' })
  ok('Scout can upload into own folder', r.status === 200, `${r.status} ${r.text.slice(0, 100)}`)
  created.photos.push(`${A.id}/x.png`)
  r = await req(B.token, 'POST', `/storage/v1/object/list/scout-photos`, { prefix: `${A.id}/` })
  ok("others cannot list or read a Scout's photos", Array.isArray(r.json) && r.json.length === 0, r.text.slice(0, 100))
  r = await req(A.token, 'POST', '/rest/v1/road_reports', { type: 'pothole', severity: 3, location: point, reported_by: A.id, photo_path: `${B.id}/stolen.png` })
  ok("report cannot reference someone else's photo", r.status >= 400, `${r.status}`)
  r = await req(A.token, 'POST', '/rest/v1/gems', { name: 'RLS test gem', category: 'food', location: point, created_by: A.id, photo_path: `${B.id}/stolen.png` })
  ok("gem cannot reference someone else's photo", r.status >= 400, `${r.status}`)
  r = await req(A.token, 'POST', '/rest/v1/road_reports', { type: 'pothole', severity: 3, location: point, reported_by: A.id, photo_path: `${A.id}/x.png`, description: 'RLS test' })
  ok('report with own photo is accepted', r.status === 201, `${r.status} ${r.text.slice(0, 120)}`)
  const report = r.json?.[0]; if (report) created.reports.push(report.id)

  // an admin reviewing it must not trip the photo check (it's insert-only)
  // Admin powers need a password entered in the last hour, not just the role:
  // a guest session promoted to admin has no password sign-in, so it's refused.
  await svc('PATCH', `/rest/v1/profiles?id=eq.${B.id}`, { role: 'admin' })
  r = await req(B.token, 'POST', '/rest/v1/rpc/review_road_report', { p_report_id: report.id, p_approve: false })
  ok('an admin without a recent password sign-in is refused (401)', r.status === 401, `${r.status} ${r.text.slice(0, 120)}`)
  r = await req(B.token, 'GET', `/rest/v1/profiles?id=eq.${A.id}&select=id`)
  ok('…including on direct table reads', Array.isArray(r.json) && r.json.length === 0, r.text)
  const C = await passwordUser(`rls-admin-${Date.now()}@pathiq.test`); created.users.push(C.id)
  await svc('PATCH', `/rest/v1/profiles?id=eq.${C.id}`, { role: 'admin' })
  r = await req(C.token, 'POST', '/rest/v1/rpc/admin_auth_fresh', {})
  ok('a password sign-in counts as fresh', r.json === true, r.text)
  r = await req(C.token, 'POST', '/rest/v1/rpc/review_road_report', { p_report_id: report.id, p_approve: false })
  ok('admin can review a report with a photo', r.status < 300, `${r.status} ${r.text.slice(0, 150)}`)

  // ── Admin dashboard (B is the admin, A a Scout) ──
  const adminRpcs = {
    admin_overview: {}, admin_users: {}, admin_gems: {}, admin_road_reports: {}, admin_payouts: {},
    admin_set_role: { p_user_id: B.id, p_role: 'admin' },
    admin_save_gem: { p_id: null, p_name: 'x', p_category: 'food', p_lat: -1.29, p_lng: 36.82 },
    admin_set_gem_status: { p_id: gem.id, p_status: 'rejected' },
    admin_save_road_report: { p_id: null, p_type: 'pothole', p_severity: 3, p_lat: -1.29, p_lng: 36.82 },
    admin_set_report_status: { p_id: report.id, p_status: 'verified' },
    admin_clear_road_report: { p_id: report.id },
    admin_pay_scout: { p_scout_id: A.id, p_earning_ids: [], p_mpesa_ref: 'ABC123' },
  }
  for (const [fn, body] of Object.entries(adminRpcs)) {
    r = await req(A.token, 'POST', `/rest/v1/rpc/${fn}`, body)
    ok(`non-admins cannot call ${fn}`, r.status >= 400, `${r.status} ${r.text.slice(0, 80)}`)
    r = await req(null, 'POST', `/rest/v1/rpc/${fn}`, body)
    ok(`anon cannot call ${fn}`, r.status >= 400, `${r.status}`)
  }
  for (const fn of ['admin_guard', 'audit_admin_write', 'admin_check_point']) {
    r = await req(C.token, 'POST', `/rest/v1/rpc/${fn}`, fn === 'admin_check_point' ? { p_lat: 0, p_lng: 0 } : {})
    ok(`internal ${fn} is not callable`, r.status >= 400, `${r.status}`)
  }

  r = await req(C.token, 'POST', '/rest/v1/rpc/admin_overview', {})
  ok('admin sees the overview', r.status === 200 && typeof r.json?.pending_gems === 'number' && r.json?.daily?.length === 14, `${r.status} ${r.text.slice(0, 120)}`)
  r = await req(C.token, 'POST', '/rest/v1/rpc/admin_users', { p_include_guests: true, p_search: A.id })
  ok('admin can find a user', r.status === 200 && r.json?.length === 1 && r.json[0].role === 'scout' && r.json[0].is_guest === true, `${r.status} ${r.text.slice(0, 120)}`)
  r = await req(C.token, 'POST', '/rest/v1/rpc/admin_set_role', { p_user_id: C.id, p_role: 'driver' })
  ok('admin cannot change own role', r.status >= 400, `${r.status}`)
  r = await req(C.token, 'POST', '/rest/v1/rpc/admin_set_role', { p_user_id: A.id, p_role: 'admin' })
  ok('a guest cannot be made admin', r.status >= 400, `${r.status}`)
  r = await req(C.token, 'POST', '/rest/v1/rpc/admin_users', { p_limit: 100000 })
  ok('user listing is capped', r.status === 200 && r.json.length <= 200, `${r.status}`)

  // Rejecting with a reason: the Scout sees it on their own submission.
  r = await req(A.token, 'POST', '/rest/v1/gems', { name: 'RLS review gem', category: 'food', location: point, created_by: A.id })
  const pendingGem = r.json?.[0]; if (pendingGem) created.gems.push(pendingGem.id)
  r = await req(C.token, 'POST', '/rest/v1/rpc/admin_gems', { p_status: 'pending', p_search: 'RLS review gem' })
  ok('admin lists pending gems with coordinates and submitter', r.json?.length === 1 && Math.abs(r.json[0].lat + 1.29) < 1e-6 && r.json[0].creator_role === 'scout', JSON.stringify(r.json).slice(0, 160))
  r = await req(C.token, 'POST', '/rest/v1/rpc/review_gem', { p_gem_id: pendingGem.id, p_approve: false, p_note: 'Duplicate of an existing gem' })
  ok('admin can reject with a reason', r.status === 200, `${r.status} ${r.text.slice(0, 120)}`)
  r = await req(A.token, 'GET', `/rest/v1/gems?id=eq.${pendingGem.id}&select=status,review_note`)
  ok('the Scout sees why it was rejected', r.json?.[0]?.status === 'rejected' && r.json[0].review_note === 'Duplicate of an existing gem', JSON.stringify(r.json))

  // Admin adds and edits a gem directly.
  r = await req(C.token, 'POST', '/rest/v1/rpc/admin_save_gem', { p_id: null, p_name: 'RLS admin gem', p_category: 'scenic', p_lat: -1.3, p_lng: 36.8 })
  const adminGemId = r.json; if (typeof adminGemId === 'string') created.gems.push(adminGemId)
  ok('admin can add a gem straight to the map', r.status === 200 && typeof adminGemId === 'string', `${r.status} ${r.text.slice(0, 120)}`)
  r = await req(A.token, 'GET', `/rest/v1/gems?id=eq.${adminGemId}&select=status`)
  ok('an admin-added gem is verified (drivers see it)', r.json?.[0]?.status === 'verified', JSON.stringify(r.json))
  r = await req(C.token, 'POST', '/rest/v1/rpc/admin_save_gem', { p_id: adminGemId, p_name: 'RLS admin gem 2', p_category: 'scenic', p_lat: 95, p_lng: 36.8 })
  ok('an invalid location is rejected', r.status >= 400, `${r.status}`)
  r = await req(C.token, 'POST', '/rest/v1/rpc/admin_save_gem', { p_id: adminGemId, p_name: '  ', p_category: 'scenic', p_lat: -1.3, p_lng: 36.8 })
  ok('a blank name is rejected', r.status >= 400, `${r.status}`)
  r = await req(C.token, 'POST', '/rest/v1/rpc/admin_save_gem', { p_id: adminGemId, p_name: 'RLS admin gem 2', p_category: 'scenic', p_lat: -1.31, p_lng: 36.8 })
  ok('admin can edit and move a gem', r.status === 200, `${r.status} ${r.text.slice(0, 120)}`)
  r = await req(C.token, 'POST', '/rest/v1/rpc/admin_set_gem_status', { p_id: adminGemId, p_status: 'rejected', p_note: 'Closed down' })
  ok('admin can hide a verified gem', r.status === 200 && r.json?.status === 'rejected', `${r.status} ${r.text.slice(0, 120)}`)
  r = await req(A.token, 'GET', `/rest/v1/gems?id=eq.${adminGemId}&select=id`)
  ok('a hidden gem disappears for drivers', Array.isArray(r.json) && r.json.length === 0, JSON.stringify(r.json))

  // Audit log: every admin write is there, and nobody can write or erase it.
  r = await req(C.token, 'GET', `/rest/v1/admin_audit_log?target_id=eq.${adminGemId}&select=action,admin_id,details&order=id`)
  ok('admin edits are in the audit log', r.json?.map((e) => e.action).join() === 'create,update,status:rejected' && r.json.every((e) => e.admin_id === C.id), JSON.stringify(r.json).slice(0, 200))
  ok('a moved location is logged without raw coordinates', r.json?.[1]?.details?.location === 'moved' && r.json[1].details.name?.to === 'RLS admin gem 2', JSON.stringify(r.json?.[1]))
  r = await req(A.token, 'GET', '/rest/v1/admin_audit_log?select=id&limit=1')
  ok('non-admins cannot read the audit log', r.status >= 400 || (Array.isArray(r.json) && r.json.length === 0), `${r.status}`)
  r = await req(C.token, 'POST', '/rest/v1/admin_audit_log', { action: 'fake', target_table: 'gems' })
  ok('even admins cannot write the audit log', r.status >= 400, `${r.status}`)
  r = await req(C.token, 'DELETE', `/rest/v1/admin_audit_log?target_id=eq.${adminGemId}`)
  ok('even admins cannot erase the audit log', r.status >= 400, `${r.status}`)
  r = await req(C.token, 'GET', `/rest/v1/admin_audit_log?target_id=eq.${adminGemId}&select=id`)
  ok('audit entries survive a delete attempt', r.json?.length === 3, JSON.stringify(r.json))

  // Road reports: clearing one (expires now) takes it off the map.
  r = await req(C.token, 'POST', '/rest/v1/rpc/admin_save_road_report', { p_id: null, p_type: 'flooding', p_severity: 4, p_lat: -1.29, p_lng: 36.82 })
  const adminReportId = r.json; if (typeof adminReportId === 'string') created.reports.push(adminReportId)
  ok('admin can add a road report', r.status === 200, `${r.status} ${r.text.slice(0, 120)}`)
  r = await req(C.token, 'POST', '/rest/v1/rpc/admin_save_road_report', { p_id: adminReportId, p_type: 'flooding', p_severity: 9, p_lat: -1.29, p_lng: 36.82 })
  ok('severity outside 1-5 is rejected', r.status >= 400, `${r.status}`)
  r = await req(C.token, 'POST', '/rest/v1/rpc/admin_clear_road_report', { p_id: adminReportId })
  ok('admin can clear a report (road fixed)', r.status === 200, `${r.status} ${r.text.slice(0, 120)}`)
  r = await req(A.token, 'GET', `/rest/v1/road_reports?id=eq.${adminReportId}&select=id`)
  ok('a cleared report disappears for drivers', Array.isArray(r.json) && r.json.length === 0, JSON.stringify(r.json))

  // Payouts: one M-Pesa code pays exactly the earnings the admin saw.
  r = await req(A.token, 'POST', '/rest/v1/gems', { name: 'RLS paid gem', category: 'food', location: point, created_by: A.id })
  const paidGem = r.json?.[0]; if (paidGem) created.gems.push(paidGem.id)
  await req(C.token, 'POST', '/rest/v1/rpc/review_gem', { p_gem_id: paidGem.id, p_approve: true })
  r = await req(C.token, 'POST', '/rest/v1/rpc/admin_payouts', {})
  const owed = r.json?.find((p) => p.scout_id === A.id)
  ok('approving a Scout gem shows up as owed', owed?.items === 1 && owed.total_kes === 350, JSON.stringify(owed))
  r = await req(C.token, 'POST', '/rest/v1/rpc/admin_pay_scout', { p_scout_id: A.id, p_earning_ids: owed.earning_ids, p_mpesa_ref: 'not a code!' })
  ok('payout needs a real M-Pesa code', r.status >= 400, `${r.status}`)
  r = await req(C.token, 'POST', '/rest/v1/rpc/admin_pay_scout', { p_scout_id: B.id, p_earning_ids: owed.earning_ids, p_mpesa_ref: 'QJK3XYZ12A' })
  ok("can't pay one Scout's earnings to another", r.json?.[0]?.items === 0, JSON.stringify(r.json))
  r = await req(C.token, 'POST', '/rest/v1/rpc/admin_pay_scout', { p_scout_id: A.id, p_earning_ids: owed.earning_ids, p_mpesa_ref: 'qjk3xyz12a' })
  ok('admin pays a Scout in one go', r.json?.[0]?.items === 1 && r.json[0].total_kes === 350, JSON.stringify(r.json))
  r = await req(C.token, 'POST', '/rest/v1/rpc/admin_pay_scout', { p_scout_id: A.id, p_earning_ids: owed.earning_ids, p_mpesa_ref: 'QJK3XYZ12A' })
  ok('the same earnings cannot be paid twice', r.json?.[0]?.items === 0, JSON.stringify(r.json))
  r = await req(A.token, 'GET', `/rest/v1/scout_earnings?gem_id=eq.${paidGem.id}&select=status,mpesa_ref`)
  ok('the Scout sees it paid with the code', r.json?.[0]?.status === 'paid' && r.json[0].mpesa_ref === 'QJK3XYZ12A', JSON.stringify(r.json))

  // Rates: admins only, and logged.
  r = await req(A.token, 'PATCH', '/rest/v1/task_rates?task=eq.flood_survey', { amount_kes: 99999 })
  ok('non-admins cannot change pay rates', r.status >= 400 || r.json?.length === 0, `${r.status}`)
  r = await req(C.token, 'PATCH', '/rest/v1/task_rates?task=eq.flood_survey', { amount_kes: 501 })
  ok('admin can change a pay rate', r.status === 200 && r.json?.[0]?.amount_kes === 501, `${r.status} ${r.text.slice(0, 100)}`)
  await req(C.token, 'PATCH', '/rest/v1/task_rates?task=eq.flood_survey', { amount_kes: 500 })
  r = await req(C.token, 'GET', '/rest/v1/admin_audit_log?target_table=eq.task_rates&target_id=eq.flood_survey&select=details&order=id.desc&limit=2')
  ok('rate changes are logged', r.json?.length === 2 && r.json[1].details.amount_kes?.to === 501, JSON.stringify(r.json))

  // ── Admin tools: map, detail, usage, import, merge, suspend ──
  const toolRpcs = {
    admin_map_points: { p_south: -1.4, p_west: 36.7, p_north: -1.2, p_east: 36.9 },
    admin_user_detail: { p_user_id: A.id },
    admin_gem_detail: { p_gem_id: gem.id },
    admin_usage: {},
    admin_duplicate_gems: {},
    admin_import_gems: { p_rows: [] },
    admin_merge_gems: { p_keep: gem.id, p_remove: gem.id },
    admin_suspend_user: { p_user_id: B.id, p_reason: 'x' },
    admin_unsuspend_user: { p_user_id: B.id },
  }
  for (const [fn, body] of Object.entries(toolRpcs)) {
    r = await req(A.token, 'POST', `/rest/v1/rpc/${fn}`, body)
    ok(`non-admins cannot call ${fn}`, r.status >= 400, `${r.status}`)
  }
  r = await req(A.token, 'POST', '/rest/v1/rpc/record_route_usage', { p_outcome: 'google' })
  ok('clients cannot inflate route usage', r.status >= 400, `${r.status}`)
  r = await req(C.token, 'POST', '/rest/v1/rpc/record_route_usage', { p_outcome: 'google' })
  ok('…not even admins', r.status >= 400, `${r.status}`)
  r = await req(A.token, 'GET', '/rest/v1/route_usage_daily?select=*')
  ok('clients cannot read route usage directly', r.status >= 400 || (Array.isArray(r.json) && r.json.length === 0), `${r.status}`)
  r = await req(A.token, 'GET', '/rest/v1/app_settings?select=*')
  ok('non-admins cannot read settings', r.status >= 400 || (Array.isArray(r.json) && r.json.length === 0), `${r.status}`)
  r = await req(A.token, 'PATCH', '/rest/v1/app_settings?key=eq.routes_usd_per_1000', { value: { google: 0 } })
  ok('non-admins cannot change settings', r.status >= 400 || r.json?.length === 0, `${r.status}`)

  r = await req(C.token, 'POST', '/rest/v1/rpc/admin_map_points', toolRpcs.admin_map_points)
  ok('admin map returns gems, reports and trip cells', Array.isArray(r.json?.gems) && Array.isArray(r.json?.reports) && Array.isArray(r.json?.trips), `${r.status} ${r.text.slice(0, 120)}`)
  r = await req(C.token, 'POST', '/rest/v1/rpc/admin_map_points', { p_south: -40, p_west: 0, p_north: 40, p_east: 60 })
  ok('admin map refuses a huge area', r.status >= 400, `${r.status}`)
  r = await req(C.token, 'POST', '/rest/v1/rpc/admin_user_detail', { p_user_id: A.id })
  ok('admin sees a user in detail', r.status === 200 && r.json?.profile?.id === A.id && r.json.submissions.length >= 1 && r.json.earnings.length >= 1, `${r.status} ${r.text.slice(0, 120)}`)
  r = await req(C.token, 'POST', '/rest/v1/rpc/admin_usage', {})
  ok('admin sees route usage', r.status === 200 && r.json?.daily?.length === 30 && r.json.prices?.google_traffic === 10, `${r.status} ${r.text.slice(0, 120)}`)
  r = await req(C.token, 'PATCH', '/rest/v1/app_settings?key=eq.routes_usd_per_1000', { value: { google: 5, google_traffic: 12 } })
  ok('admin can set Google prices', r.status === 200 && r.json?.[0]?.value?.google_traffic === 12, `${r.status} ${r.text.slice(0, 100)}`)

  // Import: dry run flags bad rows and duplicates, commit adds only good ones.
  const importRows = [
    { name: 'RLS import A', category: 'food', lat: -1.35, lng: 36.75 },
    { name: 'RLS import A', category: 'food', lat: -1.3501, lng: 36.7501 },
    { name: '', category: 'food', lat: -1.35, lng: 36.76 },
    { name: 'RLS import bad cat', category: 'nightclub', lat: -1.35, lng: 36.77 },
    { name: 'RLS import B', category: 'scenic', lat: 'x', lng: 36.78 },
    { name: 'RLS import C', category: 'Scenic', lat: -1.36, lng: 36.79, description: 'ok' },
  ]
  r = await req(C.token, 'POST', '/rest/v1/rpc/admin_import_gems', { p_rows: importRows, p_commit: false })
  ok('import dry run checks every row', r.json?.map((x) => x.status).join() === 'ok,duplicate,invalid,invalid,invalid,ok', JSON.stringify(r.json))
  r = await req(C.token, 'POST', '/rest/v1/rpc/admin_import_gems', { p_rows: importRows, p_commit: true })
  const imported = (r.json ?? []).filter((x) => x.status === 'added').map((x) => x.gem_id); created.gems.push(...imported)
  ok('import adds only the good rows, verified', imported.length === 2, JSON.stringify(r.json))
  r = await req(C.token, 'POST', '/rest/v1/rpc/admin_import_gems', { p_rows: Array.from({ length: 501 }, () => importRows[0]) })
  ok('import is capped at 500 rows', r.status >= 400, `${r.status}`)
  r = await req(C.token, 'POST', '/rest/v1/rpc/admin_import_gems', { p_rows: [importRows[0]], p_commit: true })
  ok('re-importing the same place is caught as a duplicate', r.json?.[0]?.status === 'duplicate', JSON.stringify(r.json))

  // Merge: confirmations and saves move to the kept gem; the other is gone.
  r = await req(C.token, 'POST', '/rest/v1/rpc/admin_save_gem', { p_id: null, p_name: 'RLS import A copy', p_category: 'food', p_lat: -1.3502, p_lng: 36.7502 })
  const dupId = r.json; created.gems.push(dupId)
  await req(A.token, 'POST', '/rest/v1/gem_confirmations', { gem_id: dupId, user_id: A.id, rating: 4 })
  await req(A.token, 'POST', '/rest/v1/saved_gems', { user_id: A.id, gem_id: dupId })
  r = await req(C.token, 'POST', '/rest/v1/rpc/admin_duplicate_gems', { p_radius_m: 100 })
  ok('duplicate finder pairs nearby gems', r.json?.some((p) => [p.a_id, p.b_id].includes(dupId) && [p.a_id, p.b_id].includes(imported[0])), JSON.stringify(r.json).slice(0, 160))
  r = await req(C.token, 'POST', '/rest/v1/rpc/admin_merge_gems', { p_keep: imported[0], p_remove: dupId })
  ok('admin can merge duplicates', r.status === 200 && r.json?.confirmations_count === 1, `${r.status} ${r.text.slice(0, 120)}`)
  r = await req(A.token, 'POST', '/rest/v1/rpc/my_saved_gems', {})
  ok("a driver's save follows the merge", r.json?.some((g) => g.id === imported[0]), JSON.stringify(r.json).slice(0, 160))
  r = await req(C.token, 'POST', '/rest/v1/rpc/admin_gem_detail', { p_gem_id: imported[0] })
  ok('gem detail shows saves, ratings and the merge', r.json?.stats?.saves === 1 && r.json.stats.ratings?.['4'] === 1 && r.json.audit.some((e) => e.action === 'merge'), JSON.stringify(r.json?.stats))

  // Suspensions: A (a Scout) can't contribute; admins can't be suspended.
  r = await req(C.token, 'POST', '/rest/v1/rpc/admin_suspend_user', { p_user_id: C.id, p_reason: 'test' })
  ok('admin cannot suspend themselves', r.status >= 400, `${r.status}`)
  r = await req(C.token, 'POST', '/rest/v1/rpc/admin_suspend_user', { p_user_id: B.id, p_reason: 'test' })
  ok('an admin cannot be suspended', r.status >= 400, `${r.status}`)
  r = await req(C.token, 'POST', '/rest/v1/rpc/admin_suspend_user', { p_user_id: A.id, p_reason: '' })
  ok('suspending needs a reason', r.status >= 400, `${r.status}`)
  r = await req(C.token, 'POST', '/rest/v1/rpc/admin_suspend_user', { p_user_id: A.id, p_reason: 'Fake reports' })
  ok('admin can suspend a Scout', r.status === 200, `${r.status} ${r.text.slice(0, 120)}`)
  r = await req(A.token, 'GET', `/rest/v1/profiles?id=eq.${A.id}&select=suspended_until,suspension_reason`)
  ok('the person sees why', r.json?.[0]?.suspension_reason === 'Fake reports' && r.json[0].suspended_until, JSON.stringify(r.json))
  r = await req(A.token, 'PATCH', `/rest/v1/profiles?id=eq.${A.id}`, { suspended_until: null })
  ok('…and cannot lift it themselves', r.status >= 400, `${r.status}`)
  r = await req(A.token, 'POST', '/rest/v1/road_reports', { type: 'pothole', severity: 3, location: point, reported_by: A.id })
  ok('a suspended Scout cannot submit reports', r.status === 403, `${r.status} ${r.text.slice(0, 100)}`)
  r = await req(A.token, 'POST', '/rest/v1/gem_confirmations', { gem_id: gem.id, user_id: A.id, rating: 5 })
  ok('…or rate gems', r.status >= 400, `${r.status}`)
  r = await req(A.token, 'POST', `/storage/v1/object/scout-photos/${A.id}/y.png`, png, { 'Content-Type': 'image/png' })
  ok('…or upload photos', r.status >= 400, `${r.status}`)
  r = await req(A.token, 'POST', '/rest/v1/rpc/my_driver_stats', {})
  ok('…but can still use the app', r.status === 200, `${r.status}`)
  r = await req(C.token, 'POST', '/rest/v1/rpc/admin_unsuspend_user', { p_user_id: A.id })
  ok('admin can lift a suspension', r.status === 200, `${r.status}`)
  r = await req(A.token, 'POST', '/rest/v1/road_reports', { type: 'pothole', severity: 3, location: point, reported_by: A.id, description: 'RLS after unsuspend' })
  ok('…and they can submit again', r.status === 201, `${r.status} ${r.text.slice(0, 100)}`)
  if (r.json?.[0]) created.reports.push(r.json[0].id)
  r = await req(C.token, 'GET', `/rest/v1/admin_audit_log?target_id=eq.${A.id}&action=in.(suspend,unsuspend)&select=action&order=id`)
  ok('suspensions are logged', r.json?.map((e) => e.action).join() === 'suspend,unsuspend', JSON.stringify(r.json))

  // ── rate limits ──
  let last
  for (let i = 0; i < 31; i++) {
    last = await req(B.token, 'POST', '/rest/v1/trips', { user_id: B.id, destination: point })
  }
  ok('trip starts are rate-limited (31st in an hour → 429)', last.status === 429, `${last.status} ${last.text.slice(0, 80)}`)
  r = await req(A.token, 'POST', '/rest/v1/rpc/consume_rate_limit', { p_key: 'x', p_max: 1, p_window: '1 hour' })
  ok('clients cannot call the rate limiter directly', r.status >= 400, `${r.status}`)
  r = await req(A.token, 'GET', '/rest/v1/rate_limit_hits?select=*')
  ok('clients cannot read rate-limit counters', r.status >= 400 || (Array.isArray(r.json) && r.json.length === 0), `${r.status}`)
  r = await req(A.token, 'POST', `/storage/v1/object/scout-photos/${A.id}/evil.html`, '<script></script>', { 'Content-Type': 'text/html' })
  ok('photo bucket rejects non-images', r.status >= 400, `${r.status}`)
} finally {
  for (const p of created.photos) await fetch(`${U}/storage/v1/object/scout-photos`, { method: 'DELETE', headers: { apikey: SRK, Authorization: `Bearer ${SRK}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ prefixes: [p] }) })
  for (const id of created.reports) await svc('DELETE', `/rest/v1/road_reports?id=eq.${id}`)
  for (const id of created.gems) await svc('DELETE', `/rest/v1/gems?id=eq.${id}`)
  for (const id of created.users) await fetch(`${U}/auth/v1/admin/users/${id}`, { method: 'DELETE', headers: { apikey: SRK, Authorization: `Bearer ${SRK}` } })
  console.log(`\n${pass} passed, ${fail} failed — cleaned up ${created.users.length} users, ${created.reports.length} reports, ${created.gems.length} gems, ${created.photos.length} photos`)
}
