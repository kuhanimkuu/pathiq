# Supabase

Everything backend for PathIQ Navigators lives here: the database schema, seed data and (later) edge functions. See `../architecture.md` for how it fits together.

## Layout

```
supabase/
├── config.toml
├── migrations/
│   ├── 20260920000000_init.sql             # schema, RLS policies, spatial functions, storage
│   └── 20260920000100_review_and_scouts.sql # Scout applications, admin review, payouts
├── seed.sql                                # development data (gems and road reports)
└── functions/
    ├── _shared/                            # scoring, polyline, Google client (with tests)
    ├── routes/                             # route intelligence edge function
    └── .env.example
```

## Running it locally

Needs the [Supabase CLI](https://supabase.com/docs/guides/cli) and Docker Desktop running.

```bash
supabase init        # once, only if supabase/config.toml is missing
supabase start       # starts local Postgres, auth and storage in Docker
supabase db reset    # applies every migration, then seed.sql
```

`supabase start` prints the local API URL and anon key. Put them in a git-ignored `.env` at the project root:

```
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_GOOGLE_MAPS_API_KEY=
```

To deploy to a hosted project:

```bash
supabase link --project-ref <ref>
supabase db push
supabase secrets set GOOGLE_MAPS_API_KEY=<server key>
supabase functions deploy routes
```

## Tables

| Table | Purpose |
|---|---|
| `profiles` | One row per user: username, `role` (driver, scout, admin), `plan` (free, paid), IQ score, settings |
| `gems` | Hidden Gems with a PostGIS point, category, review status, rating and confirmation counts |
| `gem_confirmations` | A user's confirmation of a gem, with an optional 1-5 rating. Triggers keep the gem's counts current |
| `saved_gems` | Gems a driver saved |
| `road_reports` | Potholes, flooding, construction, surface and incidents. They feed route scoring |
| `task_rates` | Scout pay per task type (KSh 150 / 200 / 350 / 500) |
| `scout_applications` | A driver's application to become a Scout (area, M-Pesa number). One per user |
| `scout_earnings` | What each Scout has earned and whether it was paid via M-Pesa |
| `trips` | Trip summary only (start, end, distance). The GPS trace is not stored |
| `trip_gem_events` | Which gems were suggested on a trip (approaching or passed), once per trip |
| `route_cache` | Cached Google route responses. Server only |

Gems and road reports have a `status` (`pending`, `verified`, `rejected`). Scouts submit `pending` rows, an admin reviews them, and only `verified` rows reach drivers.

## Spatial functions

Both take a WGS84 `LINESTRING` in lng/lat order, such as `LINESTRING(36.82 -1.29, 36.80 -1.27)`. The client decodes Google's encoded polyline into that form.

| Function | Used by | Returns |
|---|---|---|
| `gems_along_route(route_wkt, corridor_m := 500, categories := null)` | Suggestion engine, at trip start | Verified gems in the corridor, in driving order, with `route_fraction` (0 to 1) and distance from the route |
| `road_reports_along_route(route_wkt, corridor_m := 50)` | Route intelligence engine | Verified, unexpired reports near the route, with severity, confidence and age |

```js
const { data } = await supabase.rpc('gems_along_route', {
  route_wkt: 'LINESTRING(36.82 -1.29, 36.80 -1.27)',
  corridor_m: 500,
  categories: ['attractions', 'hotels'],
})
```

## Admin and Scout workflow

These are called with `supabase.rpc(...)`. Each one checks that the caller is an admin.

| Function | What it does |
|---|---|
| `review_scout_application(p_application_id, p_approve)` | Approves or rejects an application. Approval sets the user's role to `scout` and copies their M-Pesa number to their profile |
| `review_gem(p_gem_id, p_approve, p_task := 'gem_discovery')` | Verifies or rejects a pending gem. If a Scout submitted it, creates an `approved` earning at the task's rate |
| `review_road_report(p_report_id, p_approve, p_task := 'road_report')` | Same for road reports. Also sets the report's expiry from its type (`road_report_ttl`) |
| `mark_earning_paid(p_earning_id, p_mpesa_ref)` | Records that an approved earning was paid through M-Pesa |

A gem or report earns its Scout at most once. Use `p_task := 'place_verification'` or `'flood_survey'` for those task types.

Scouts apply by inserting into `scout_applications`. Payouts are manual for the MVP: an admin pays through M-Pesa, then calls `mark_earning_paid` with the reference.

## Route intelligence: `routes` edge function

`POST /functions/v1/routes` with the user's session token.

```js
const { data } = await supabase.functions.invoke('routes', {
  body: {
    origin: { lat: -1.2921, lng: 36.8219 },
    destination: { lat: -1.3290, lng: 36.7100 },
  },
})
```

It returns the route options, best first:

```json
{
  "cached": false,
  "options": [{
    "id": "route-1",
    "tags": ["recommended", "best_road"],
    "durationS": 7920,
    "staticDurationS": 7400,
    "distanceM": 156000,
    "encodedPolyline": "...",
    "scores": { "roadQuality": 92, "traffic": 78, "incidents": 96, "time": 95, "overall": 90 },
    "reportCount": 4,
    "alerts": [{ "type": "pothole", "severity": 4, "lng": 36.77, "lat": -1.30, "routeFraction": 0.31 }]
  }]
}
```

How it works:
1. Validates the request. Both points must be inside Kenya, to protect the Google quota.
2. Gets driving alternatives with live traffic from Google's Routes API. The response is cached for 10 minutes by rounded origin and destination.
3. For each route, fetches verified road reports within 50 m with `road_reports_along_route`.
4. Scores each route (`_shared/scoring.ts`), then labels the winners: **recommended** (best overall), **fastest** (least time) and **best_road** (best road quality). One route can hold several labels.

Scoring: each report adds a penalty from its type, severity, confidence and age. The penalty halves every so many days, and the half-life depends on the type (flooding 2 days, incidents 6 hours, potholes 60 days). Scores then follow `100 * exp(-penalty / 40)`. The overall score is 35% road quality, 25% time, 20% traffic and 20% incidents. All the numbers are constants at the top of `scoring.ts`, so they are easy to tune.

The gem suggestion engine runs in the app rather than here. It uses `gems_along_route` once at trip start, then works from the phone's position.

## Tests

The scoring and polyline tests are Deno tests. Without Deno installed, run them in Docker:

```bash
docker run --rm -v "$PWD/supabase/functions:/app" -w /app denoland/deno test _shared/
```

## Security

Row-level security is on for every table.

- **Drivers** read verified gems and reports, and manage only their own confirmations, saved gems and trips.
- **Scouts** can also submit `pending` gems and road reports, and upload photos to their own folder in the private `scout-photos` bucket.
- **Admins** review, edit and delete gems and reports, and manage earnings.
- **`role`, `plan` and `iq_score`** cannot be changed from the client. Column privileges only allow users to edit `username`, `display_name`, `notifications_on` and `mpesa_phone`.
- **`route_cache`** has RLS on with no policies, so only the service role (edge functions) can use it.

Make yourself an admin after signing up:

```sql
update public.profiles set role = 'admin' where username = 'your-username';
```

## Status and open items

- **Not yet run.** Neither migration, the seed nor the edge function has been executed. Run `supabase db reset`, the Deno tests, and `supabase functions serve` before relying on any of it.
- **Sign-up passes the username** as user metadata: `supabase.auth.signUp({ email, password, options: { data: { username } } })`. A duplicate username makes sign-up fail, and the app needs to show that error.
- **Scout application** exists in the database, but the app screens for applying and for the admin review queue are not built.
- **Scoring weights, half-lives and expiry** are first guesses and need tuning against real reports.
- **A rejected Scout applicant** cannot reapply, because there is one application per user. An admin has to delete the row.
- **No rate limiting** on the `routes` function beyond the Kenya bounds check and the cache.
- **M-Pesa payouts** are manual. Automating them (Daraja B2C) is a later edge function.
- **Seed data** uses approximate coordinates, and some place names are placeholders.
