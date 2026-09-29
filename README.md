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
| `npm run test:security` | RLS, trip rules, Scout photo rules and rate limits against a real project. Needs `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`. Use a dev project, since it creates and deletes test users. |

Edge function tests (Deno): `cd supabase/functions && deno test _shared/` (or `npx deno@2 test _shared/`).

## Keys and secrets

- **`.env`** (git-ignored): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_GOOGLE_MAPS_API_KEY`. The Maps key ends up in the browser bundle, so restrict it by HTTP referrer and to the Maps JavaScript + Places APIs, and set a daily quota.
- **Supabase secrets**: `GOOGLE_MAPS_API_KEY` (server key, Routes API only) for the `routes` edge function. Optional: `ROUTES_GLOBAL_LIMIT_PER_HOUR` (default 1500), and `ROUTES_TRAFFIC_ON_POLYLINE=false` to turn off traffic shading on routes, which Google bills at a higher rate.

## Layout

```
src/
  pages/            app screens (/app/*) and marketing pages (pages/marketing)
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
