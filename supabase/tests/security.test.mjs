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
const guest = async () => { const r = await req(null, 'POST', '/auth/v1/signup', {}); return { token: r.json.access_token, id: r.json.user.id } }
const point = 'SRID=4326;POINT(36.82 -1.29)'
const created = { users: [], photos: [], reports: [] }

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
  await svc('PATCH', `/rest/v1/profiles?id=eq.${B.id}`, { role: 'admin' })
  r = await req(B.token, 'POST', '/rest/v1/rpc/review_road_report', { p_report_id: report.id, p_approve: false })
  ok('admin can review a report with a photo', r.status < 300, `${r.status} ${r.text.slice(0, 150)}`)

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
  for (const id of created.users) await fetch(`${U}/auth/v1/admin/users/${id}`, { method: 'DELETE', headers: { apikey: SRK, Authorization: `Bearer ${SRK}` } })
  console.log(`\n${pass} passed, ${fail} failed — cleaned up ${created.users.length} users, ${created.reports.length} reports, ${created.photos.length} photos`)
}
