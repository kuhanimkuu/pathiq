// Copies PathIQ's anonymous road archive out of Supabase, for the offline
// database and long-term backups (README "Location data and retention").
//
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npm run export:road-archive -- [out-dir]
//
// Writes one NDJSON file per table per week: <out-dir>/<table>/<week>.ndjson
// (default out-dir: road-archive/, git-ignored). Weeks already exported are
// skipped, so it can run on a schedule. A week's archive is written once and
// never changes, so a file that exists is complete.
//
// Only the archive tables are exported. Never add location_samples here: raw
// points must not outlive their 90 days anywhere.

import { mkdir, writeFile, access } from 'node:fs/promises'
import { join } from 'node:path'

const TABLES = {
  road_archive_cells: 'cell_lat,cell_lng,heading_bin',
  road_archive_turns: 'cell_lat,cell_lng,heading_in,heading_out',
}
const PAGE = 5000

const U = process.env.SUPABASE_URL
const SRK = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!U || !SRK) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.')
  process.exit(2)
}
const OUT = process.argv[2] ?? 'road-archive'

const get = async (path) => {
  const r = await fetch(U + path, { headers: { apikey: SRK, Authorization: `Bearer ${SRK}` } })
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`)
  return r.json()
}
const exists = (p) => access(p).then(() => true, () => false)

// Weeks present in a table. PostgREST has no DISTINCT, so walk forward one
// week at a time from the oldest.
async function weeks(table) {
  const found = []
  let after = '0001-01-01'
  for (;;) {
    const rows = await get(`/rest/v1/${table}?select=week&week=gt.${after}&order=week&limit=1`)
    if (rows.length === 0) return found
    found.push(rows[0].week)
    after = rows[0].week
  }
}

let files = 0, rows = 0
for (const [table, order] of Object.entries(TABLES)) {
  await mkdir(join(OUT, table), { recursive: true })
  for (const week of await weeks(table)) {
    const file = join(OUT, table, `${week}.ndjson`)
    if (await exists(file)) continue
    const lines = []
    for (let offset = 0; ; offset += PAGE) {
      const page = await get(`/rest/v1/${table}?select=*&week=eq.${week}&order=${order}&limit=${PAGE}&offset=${offset}`)
      lines.push(...page.map((row) => JSON.stringify(row)))
      if (page.length < PAGE) break
    }
    await writeFile(file, lines.join('\n') + '\n')
    files++
    rows += lines.length
  }
}
console.log(`Exported ${rows} rows in ${files} new week files to ${OUT}/`)
