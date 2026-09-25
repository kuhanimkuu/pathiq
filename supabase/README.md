# Supabase

Everything backend for PathIQ Navigators lives here: the database schema, seed data and (later) edge functions. See `../architecture.md` for how it fits together.

## Layout

```
supabase/
├── config.toml
├── migrations/
│   ├── 20260920000000_init.sql             # schema, RLS policies, spatial functions, storage
│   ├── 20260920000100_review_and_scouts.sql # Scout applications, admin review, payouts
│   ├── 20260922000000_guest_mode.sql        # guest mode (anonymous auth), blocks anon Scouts
│   ├── 20260923000000_gems_near_point.sql   # "gems near me" — no route/Google Maps needed
│   └── 20260923000100_road_reports_near_point.sql # "incidents near me" — same idea
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
supabase db push --include-seed
supabase secrets set GOOGLE_MAPS_API_KEY=<server key>
supabase functions deploy routes
```

A few things that only bite on a hosted project, not locally:

- **If any migration was ever run by hand** (e.g. pasted into the dashboard's SQL editor before linking), `db push` will try to recreate those objects and fail on the first `CREATE TYPE`/`CREATE TABLE`. Reconcile the CLI's tracking table instead of re-running the SQL:
  ```bash
  supabase migration list                                    # compare Local vs Remote
  supabase migration repair --status applied <version> ...   # mark ones already applied
  ```
- **`seed.sql` needs schema-qualified PostGIS names** (`extensions.st_makepoint(...)`, `::extensions.geography`, not the bare names). The connection `db push --include-seed` uses doesn't have `extensions` on its search_path, unlike local `db reset`. This is already how the checked-in `seed.sql` is written — worth knowing if you add more seed data.
- **`supabase config push` pushes the *entire* `config.toml` auth section, not one setting.** There's no per-key push. Pushing it once to enable `enable_anonymous_sign_ins` also overwrote this project's `enable_confirmations`, MFA and rate-limit settings with the local-dev-convenient values from this file. `config.toml`'s auth settings are now kept at hardened (non-dev) values for exactly this reason — see the comments above `enable_confirmations` and `[auth.mfa.totp]` in the file. Don't loosen those back for local convenience; use Mailpit (`http://127.0.0.1:54324`) locally instead.

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
| `gems_near_point(lat, lng, radius_m := 3000, categories := null)` | Home dashboard ("Gems near you") | Verified gems in a plain radius, nearest first. Needs only the browser's Geolocation API, no route — usable before Google Maps is wired up |
| `road_reports_near_point(lat, lng, radius_m := 5000)` | Home dashboard ("Incidents near you") | Same idea, for road reports |

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

The scoring, polyline and Google-response tests are Deno tests (19 of them). Without Deno installed, run them with `npx deno@2 test _shared/` from `supabase/functions`, or in Docker:

```bash
docker run --rm -v "$PWD/supabase/functions:/app" -w /app denoland/deno test _shared/
```

`supabase/tests/security.test.mjs` (`npm run test:security`) checks the security rules against a live project, as real users: anon access, cross-user access, trip and IQ-score rules, Scout photo rules and rate limits. 50 checks. It creates throwaway guest users and deletes everything it made.

## Security

Row-level security is on for every table.

- **Drivers** read verified gems and reports, and manage only their own confirmations and saved gems.
- **Trips** feed the IQ Score, so they're locked down more tightly. A trip can only be *started* (inserted open). `started_at` and `ended_at` are stamped by the server. Only `ended_at`, `arrived` and `reroutes` can be updated, and reroutes can only go up. A closed trip is frozen. Gem events can only be added to your own trip while it's open. Still self-reported: the route's road score at start and whether you arrived. Verifying those would need server-side tracking.
- **Scouts** can also submit `pending` gems and road reports, and upload photos to their own folder in the private `scout-photos` bucket.
- **Admins** review, edit and delete gems and reports, and manage earnings.
- **Scout photos** must live in the uploader's own folder. Uploads are limited by the storage policy, and a report or gem can only reference a photo in the submitter's folder (insert trigger). The bucket only accepts images up to 8 MB.
- **`role`, `plan` and `iq_score`** cannot be changed from the client. `iq_score` is recomputed by a trigger when a trip ends (`compute_iq_score`). Column privileges only allow users to edit `username`, `display_name`, `notifications_on` and `mpesa_phone`.
- **`route_cache`** and **`rate_limit_hits`** have RLS on with no policies, so only the service role (edge functions) can use them.
- **Functions**: internal and trigger functions have `EXECUTE` revoked from clients. `consume_rate_limit` is service-role only.

### Rate limits

| What | Limit | Where |
|---|---|---|
| Anonymous (guest) sign-ups | 30 / hour / IP | Supabase Auth (`config.toml` `[auth.rate_limit]`) |
| Sign-in / sign-up attempts | 30 / 5 min / IP | Supabase Auth |
| `routes` edge function | 30 / 10 min per user, 60 / 10 min per IP | `consume_rate_limit`, returns 429 + `Retry-After` |
| Google Routes calls, all users | 1500 / hour (env `ROUTES_GLOBAL_LIMIT_PER_HOUR`) | edge function, counted on cache misses only, returns 503 |
| Trips started | 30 / hour / user | insert trigger, HTTP 429 |
| Road reports / gems submitted | 30 / 20 per hour / user | insert triggers, HTTP 429 |
| Scout photo uploads | 40 / hour / user, images only, 8 MB max | storage trigger + bucket limits |
| Places autocomplete (browser key) | from 3 characters, 350 ms debounce, session tokens | client only. **Also set a daily quota on the browser key in Cloud Console.** |

Limits are fixed-window counters in `rate_limit_hits` (see the `rate_limits` migration). Change a limit by editing its trigger argument or the constants at the top of `functions/routes/index.ts`.

Make yourself an admin after signing up:

```sql
update public.profiles set role = 'admin' where username = 'your-username';
```

## Status and open items

- **Verified on the hosted project (2026-09-26).** All migrations apply cleanly, the 19 Deno tests pass, `npm run test:security` passes 50/50, and the `routes` function is deployed and returning real Google routes.
- **Email confirmation is currently off on the hosted project** (`enable_confirmations = false`), left that way after an accidental `config push` (see the warning above) and a follow-up dashboard fix that didn't fully take — the "Confirm email" toggle wasn't findable in this Supabase dashboard build under Auth Providers → Email. Anyone can sign up with an unverified email address until this is fixed. Low risk pre-launch (no real users yet), but **must be resolved before real users sign up** — try Authentication → Emails, or the Management API (`PATCH /v1/projects/{ref}/config/auth`) if the dashboard toggle can't be found.
- **`GOOGLE_MAPS_API_KEY` is set** (2026-09-25) to a single demo key that has both the Routes and Maps JS APIs enabled. Split it into a server key and a browser key before launch (see `progress.md`).
- **Turning on email confirmation needs custom SMTP first.** Supabase's built-in mailer only sends to the project's team members, so with confirmation on and no SMTP, real sign-ups would never get their email.
- **Sign-up passes the username** as user metadata: `supabase.auth.signUp({ email, password, options: { data: { username } } })`. A duplicate username makes sign-up fail, and the app needs to show that error.
- **Scoring weights, half-lives and expiry** are first guesses and need tuning against real reports.
- **A rejected Scout applicant** cannot reapply, because there is one application per user. An admin has to delete the row.
- **Guest sign-ups have no CAPTCHA.** Auth's per-IP limit and the global Google cap bound the cost, but for launch consider Cloudflare Turnstile (`[auth.captcha]`).
- **M-Pesa payouts** are manual. Automating them (Daraja B2C) is a later edge function.
- **Seed data** uses approximate coordinates, and some place names are placeholders.
