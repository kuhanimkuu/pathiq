# PathIQ Navigators

Navigation for drivers in Kenya: better routes scored against community road reports, turn-by-turn directions, and alerts for Hidden Gems along the way. React + Vite web app (installable as an app on your phone), Supabase backend, Google Maps Platform.

Where things stand is in [`progress.md`](progress.md). How the map is styled, and how to add map layers, is in [`docs/map-styling.md`](docs/map-styling.md). The product is described in [`description.md`](description.md) and [`features.md`](features.md), with the stack in [`architecture.md`](architecture.md) and the backend in [`supabase/README.md`](supabase/README.md).

## Run it

```bash
npm install
cp .env.example .env   # fill in the Supabase URL/anon key and the Google Maps browser key
npm run dev            # http://localhost:5173
```

| Script | What it does |
|---|---|
| `npm run dev` | Dev server. The service worker is off in dev. |
| `npm run dev:phone` | Dev server over **HTTPS** on your Wi-Fi, for testing on a phone. Open the `https://192.168…` Network address it prints (accept the one-time certificate warning). The plain `http://` address can't get location on a phone: browsers only share location with https pages. |
| `npm run build` / `npm run preview` | Production build, and serve it locally (use this to test offline/install). |
| `npm run lint` | ESLint. |
| `npm run export:road-archive` | Copy the anonymous road archive to `road-archive/` for the offline database (see Location data and retention). |
| `npm run test:security` | RLS, trip rules, Scout photo rules and rate limits against a real project. Needs `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`. Use a dev project, since it creates and deletes test users. |

Edge function tests (Deno): `cd supabase/functions && deno test _shared/` (or `npx deno@2 test _shared/`).

## Keys and secrets

- **`.env`** (git-ignored): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_GOOGLE_MAPS_API_KEY`. The Maps key ends up in the browser bundle, so restrict it by HTTP referrer and to the Maps JavaScript + Places APIs, and set a daily quota.
- **Supabase secrets**: `GOOGLE_MAPS_API_KEY` (server key, Routes API only) for the `routes` edge function. Optional: `ROUTES_GLOBAL_LIMIT_PER_HOUR` (default 1500), and `ROUTES_TRAFFIC_ON_POLYLINE=false` to turn off traffic shading on routes, which Google bills at a higher rate.

## Location data and retention

Drivers can opt in (Profile → "Help improve road data") to share anonymous speeds while they navigate. It's off by default. The public wording is the "Helping improve road data" section of the privacy policy (`/privacy#road-data`), and the two must always agree.

**What's collected** (`src/lib/locationContribution.js`, migration `20261012000000_location_contributions.sql`):
- Points are recorded only during navigation, with no user ID. Each point carries a random code that the device replaces every day.
- Points within 200 m of a trip's start or end are dropped on the phone before anything is sent.
- Uploads go through `contribute_location_samples`, which checks consent and is rate-limited (120 calls per hour). No client can read the tables.

**Retention rules.** Data is kept in three tiers (migrations `20261012000000_location_contributions.sql` and `20261013000000_road_archive.sql`):

| Tier | What's in it | How long |
|---|---|---|
| Raw points (`location_samples`) | point, time, speed, heading, daily code | **83 to 90 days**, then deleted |
| Road speeds (`road_speed_daily`) | typical speed per ~110 m cell, direction and hour of the week, per day | Permanent (anonymous). Rolled up nightly at 00:15 UTC |
| Road archive (`road_archive_cells`, `road_archive_turns`) | how often each ~11 m cell was driven, in which direction and how fast; and at each ~110 m cell, which direction drivers left in by the direction they arrived (turns made and never made), per week | Permanent (anonymous) |

**How raw points leave the system.** `archive_location_samples()` runs nightly at 00:45 UTC (pg_cron). It takes every full UTC week (Monday to Sunday) whose last day is at least 83 days old, adds it to the road archive, then deletes that week's raw points. It also deletes anything received more than 90 days ago, whatever happened. Grouping by week gives the 5-contributor rule a week of drives to count instead of one day, so quieter roads still make it into the archive. Device codes, the order of points and any time finer than the week are used while it runs, but never stored.

**Offline copy.** `npm run export:road-archive -- [out-dir]` (needs `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`) writes one NDJSON file per table per week to `road-archive/` (git-ignored), skipping weeks already exported, so it can run on a schedule. A week's archive is written once and never changes. This is the only data that may be exported or backed up long-term.

**Rules:**
- Never back up or export raw points. A copy kept past 90 days is still retention under Kenya's Data Protection Act, and it would make the privacy policy untrue.
- Public reads (`road_speeds_near`, and anything reading the archive later) only return places with 5+ different contributors.
- Any change to what's collected or how long it's kept also needs the privacy policy, the DPIA and the security tests updated.

## Layout

```
src/
  pages/            app screens (/app/*, incl. admin/ with the blog editor and
                    messages inbox) and marketing pages (pages/marketing,
                    company/ = About, Blog, Careers, Press, Contact)
  components/       shared UI (NavigationHud, TabBar, …)
  lib/              data access and logic: routePlanning, navigation, trips,
                    placeSearch, googleMaps, alertPrefs, driveAssist, …
  context/          auth + user (profile, stats) providers
public/             manifest, service worker (sw.js), icons
docs/               map-styling.md
supabase/
  migrations/       schema, RLS, spatial functions, trips/IQ score, rate limits
  functions/        `routes` edge function (+ Deno tests in _shared/)
  tests/            security.test.mjs
```
