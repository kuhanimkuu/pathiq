# PathIQ Navigators: progress

A snapshot of where things stand, for picking this up again — on this machine or another. For the product vision and longer-term plan, see `description.md`, `features.md`, `architecture.md` and `design-brief.md`; this file is the "where are we right now" summary.

Last updated: 2026-09-23.

---

## The one blocker

**The Google Maps API key.** David is getting it now (Routes API + Maps JavaScript API, two separate keys — server key for the edge function, browser key restricted by referrer for the frontend; see the last exchange in this session for the exact Cloud Console steps). Once it exists:

```bash
supabase secrets set GOOGLE_MAPS_API_KEY=<server key>
supabase functions deploy routes
```
and add `VITE_GOOGLE_MAPS_API_KEY=<browser key>` to the root `.env`.

Everything downstream of that (real map tiles, real turn-by-turn routing, real route alternatives) is designed and partly built already, just not reachable without it.

---

## What's live right now

**Hosted Supabase project:** `nabzfpbpfmcjbbwsxiob` ("kuhanimkuu's Project"). Linked (`supabase link`), migrations applied, seeded with 11 gems and 3 road reports around Nairobi. Repo: `https://github.com/loisegakii/pathiq-navigators` (note: different account than the git user on this machine — see `architecture.md` history if that matters later).

**Backend** (`supabase/`):
- Schema, RLS, and 5 migrations (init → review/Scouts → guest mode → two "near point" spatial functions). All verified locally and against the hosted project.
- Guest mode via Supabase anonymous auth — a real `authenticated` session, so existing RLS just works for guests with no extra rules.
- Admin review workflow (`review_gem`, `review_road_report`, `review_scout_application`, `mark_earning_paid`) — creates Scout earnings automatically on approval.
- `routes` edge function: built, unit-tested (17 passing tests), deployed — but every call 500s until the Google key exists.
- Two spatial-query families: `*_along_route` (for a route line — built for the suggestion engine, now actually used by route planning) and `*_near_point` (for "near me" on Home, independent of any route).

**Frontend, all verified live against the real hosted project, not mocked:**
- **Auth:** sign up, sign in, guest mode, guest→real-account upgrade, sign out. Guest sessions start **silently** — no login wall to view anything (`RequireSession` in `src/App.jsx`), per David's "should work like Google Maps" direction.
- **Multipage marketing site:** `/`, `/map`, `/hidden-gems`, `/scout-program`, `/developers`, `/pricing`, sharing one layout/nav. Road Conditions and Route Intelligence were folded into `/map` as sections rather than their own pages/nav items (old URLs redirect). Nav is deliberately just **Map, Hidden Gems, Scout Program** — see the `pathiq-tiered-user-access` memory for why.
- **One design system, two themes.** Dark (default, matches the original look) and light, both real — the Settings "Dark mode" toggle used to be a dead stub, now works and persists. Figma-designed; see `design-brief.md`. The app shell is a responsive sidebar at ≥900px, bottom tabs below that.
- **Home dashboard:** real "Incidents near you" / "Gems near you" via geolocation. "Active route" is still a mock card (see Next steps).
- **Gems page:** real browse/filter/save/5-star-rate against the `gems` table.
- **Map (`/app/map`):** the actual live map screen. Not a real street map yet (no Google key) — it's an honest radar view: pins placed by real bearing/distance from the driver, not fabricated street geometry. Search-by-name, category filters, tap-a-pin for details with working save/rate.
- **Route planning, on the map:** tap the map, or "Route here" on a gem, to plan a route. Draws a straight-line path (clearly labelled as a preview, not real routing), and highlights real gems/road-reports along the corridor in amber, with a real distance and a road-quality score computed from real reports. Deliberately does **not** fake multiple route alternatives — that needs real road-network data.
- **Scout tools (`/app/scout`):** submit road reports and new gems (Scouts/admins only).
- **Admin console (`/app/admin`):** approve/reject pending gems, reports, Scout applications; mark earnings paid (admins only).
- **Profile:** role-conditional — guest upgrade form, Become-a-Scout application, or Scout/Admin tool links, depending on who's looking.

**Not built / explicitly still mock:**
- Real map tiles and real turn-by-turn routing (blocked on the Google key, above).
- Route alternatives (Recommended/Fastest/Best Road as genuinely different paths) — the `routes` edge function and scoring engine exist and are tested, just have no real street geometry to score yet.
- "Active route" card on Home, trip tracking, the IQ Score algorithm.
- The **business/partner account tier** (people listing hotels etc.) and the **developer account tier** (API keys) — both are real product direction (see `pathiq-tiered-user-access` memory), neither is designed in detail or built.
- A mobile menu for the marketing nav (links just disappear under 980px — pre-existing gap, never fixed).
- Email confirmation is currently **off** on the hosted project (an artifact of an accidental full `config push` earlier this session) — fine with no real users yet, but needs revisiting before launch. See `supabase/README.md`'s status section.

---

## Immediate next steps, once the Google key exists

1. `supabase secrets set` + deploy `routes` (above).
2. Wire the Maps JavaScript API into `MapPage.jsx`, replacing the radar canvas with a real map — the chrome (search, filters, pin sheet, route summary) is already built and should mostly carry over.
3. Call the `routes` edge function from `RoutesPage.jsx` for real route alternatives, replacing its mock data.
4. Revisit route planning on the map to use real road geometry instead of the straight-line preview.

## Where to look for more detail

| Question | File |
|---|---|
| What is this product, for whom | `description.md` |
| MVP scope, what's P0/P1/P2, build status | `features.md` |
| Stack decisions, the two engines | `architecture.md` |
| Design system, screens, the Figma prompt | `design-brief.md` |
| Database schema, RLS, spatial functions, deploy gotchas | `supabase/README.md` |
| Map-first / zero-auth / tiered-nav product direction | memory: `pathiq-tiered-user-access` |
