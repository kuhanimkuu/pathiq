# PathIQ Navigators: architecture

Companion to `description.md` (what the product is) and `features.md` (what ships when).

## Decisions

| Area | Choice | Why |
|---|---|---|
| Client | React 19 + Vite, delivered as a **PWA** | The existing codebase. Installable on a phone without an app store |
| Maps, routing, places | **Google Maps Platform** | Maps JavaScript, Routes, Places and Geocoding APIs |
| Backend | **Supabase** | Postgres with PostGIS, auth, file storage, row-level security and edge functions in one service |
| Suggestion engine | Runs **in the PWA** | Needs low latency and has to keep working on weak signal |
| Route intelligence engine | Runs **on the server** (Supabase Edge Functions) | Keeps the Google key private, reads road reports and can cache results |

## Overview

```
PWA (React)
 ├─ Map + UI ──────────────► Google Maps JS API
 ├─ Suggestion engine (local) ◄── gem corridor from server
 └─ Geolocation + Screen Wake Lock
        │
        ▼
Supabase
 ├─ Edge Functions
 │    ├─ Route engine ──► Google Routes API
 │    ├─ Scoring rules over road reports
 │    └─ Scout review / admin workflow
 ├─ Postgres + PostGIS
 ├─ Auth
 └─ Storage (Scout photos)
```

## Suggestion engine (on the device)

1. **Trip start:** take the chosen route's polyline. One server query returns every gem inside a corridor around it (for example 500 m each side), using PostGIS `ST_DWithin`.
2. **Precompute:** for each candidate gem, work out where it sits along the route and its detour cost.
3. **During the trip:** watch the driver's position and check each gem.
   - **Approaching:** the driver is within an alert distance before the gem's position on the route. The distance scales with speed, so highway alerts fire earlier than city ones.
   - **Just passed:** the driver has gone beyond the gem's position on the route.
4. **Rules:** fire once per gem per trip, respect the user's category and detour filters, and throttle alerts so they don't stack up.

Ranking for the MVP is simple: rating, confirmations and detour. Personalisation is a later, paid feature. The corridor is loaded up front, so a dropped signal doesn't stop alerts.

## Route intelligence engine (on the server)

1. Call Google's Routes API with alternatives and live traffic.
2. For each alternative, query the road reports that fall along it (potholes, flooding, construction, incidents) with PostGIS.
3. Score each route on road quality, traffic, incidents and distance with weighted rules. Each report has a severity, and its weight falls as it ages.
4. Label the results: **Recommended** (best balance), **Fastest** (lowest time) and **Best Road** (highest road score).
5. Cache results by origin, destination and time bucket to control Google costs.

MVP scoring is a transparent formula, not machine learning. It is easy to debug and to explain to the user.

## Code structure principles

- **Keep the engines pure.** The scoring rules and the suggestion rules live in their own modules with no UI or database calls inside them. They take routes, positions and reports as inputs and return results. That lets them be unit-tested with fake data and moved to a server or a native app later without a rewrite.
- **Gate features by plan in one place.** The user record has a `plan` field (free or paid) and a single function decides what each plan can use.
- **Secrets stay server-side.** The Google Routes calls go through the edge function. The browser Maps key is restricted by referrer and by API. Keys live in `.env`, which is git-ignored.

## Later additions

| Feature | Approach |
|---|---|
| Scout photo validation | A vision model that returns the road condition from a photo |
| Historical reliability | Aggregate trip data over time in a scheduled job |
| Personalised suggestions | A ranking model trained on saved and ignored gems |
| M-Pesa payouts and payments | A payment integration behind an edge function |
| Public API | API keys and usage limits on top of the same data |
| Live traffic and vehicle data | A streaming ingestion pipeline |

## Data model

Drafted in `supabase/migrations/20260920000000_init.sql`, with an overview in `supabase/README.md`. Everything Supabase-related lives in the `supabase/` folder.

- **Tables:** `profiles` (role and plan), `gems`, `gem_confirmations`, `saved_gems`, `road_reports`, `task_rates`, `scout_applications`, `scout_earnings`, `trips`, `trip_gem_events` and `route_cache`.
- **Spatial:** `gems` and `road_reports` have PostGIS points with GiST indexes. The functions `gems_along_route` and `road_reports_along_route` serve the two engines.
- **Review flow:** gems and reports are `pending` until an admin marks them `verified`. Only verified rows reach drivers.
- **Security:** row-level security on every table. Users cannot change their own role, plan or IQ score.
- **Review workflow:** admin functions (`review_gem`, `review_road_report`, `review_scout_application`, `mark_earning_paid`) verify submissions and create Scout earnings at the rates in `task_rates`.
- **Route engine:** the `routes` edge function (`supabase/functions/routes`) calls Google, scores each alternative with `_shared/scoring.ts` and returns the labelled options.
- **Status:** written but not yet run.
