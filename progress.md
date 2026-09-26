# PathIQ Navigators: progress

A snapshot of where things stand, for picking this up again on this machine or another. For the product vision and longer-term plan, see `description.md`, `features.md`, `architecture.md` and `design-brief.md`. This file is the "where are we right now" summary.

Last updated: 2026-09-27.

---

## Status in one paragraph

The MVP in `features.md` is built end to end against the hosted Supabase project:
- **Driving:** a real Google map, place search, scored route alternatives, and turn-by-turn navigation with voice, rerouting and arrival.
- **Hidden Gems:** alerts while driving ("ahead" and "just passed", with filters).
- **Trips:** trip recording feeding real "Trips this month", "Gems found" and IQ Score numbers.
- **Scouts:** reports and gems with photos, plus admin review.
- **Platform:** installs as a phone app and opens offline, Privacy and Terms pages, locked-down RLS, and rate limits.

What's left is mostly **decisions and accounts only David's team can set up** (see "Before launch"), plus the business/developer tiers, which aren't designed yet.

## Before launch (needs a person, not code)

1. **Google key.** The single demo key (Routes + Maps JS + Places) is in `.env`, `supabase/functions/.env` and the hosted secrets. It's visible in the browser bundle. Whoever owns the Cloud account should:
   - create a **server key** (Routes API only) for `supabase secrets set GOOGLE_MAPS_API_KEY=…`;
   - create a **browser key** (Maps JavaScript + Places only, restricted to the site's domains) for `VITE_GOOGLE_MAPS_API_KEY`;
   - set **daily quotas and a budget alert**;
   - then delete the demo key, which has also been pasted into a chat.
2. **Email.** Email confirmation is off on the hosted project. Turning it on needs **custom SMTP** first (Supabase's built-in mailer only sends to team members). Details are in `supabase/README.md`.
3. **Legal.** `/privacy` and `/terms` are a plain-language first draft that matches what the code does. They need a lawyer's review (Kenya Data Protection Act 2019) and a contact address (`CONTACT` in `src/pages/marketing/LegalPages.jsx`).
4. **Seed data.** 11 gems and 3 road reports. Their coordinates are approximate, so none of the 3 reports sits on an actual road, and the one accident is days old. Routes currently show no road reports until real ones come in from Scouts. A temporary on-road pothole was used to verify the painting and the re-ranking: Best Road avoided it. `features.md` wants 50–100 verified gems, which means real places checked by real people, the Scout workflow's job.
5. **Optional.** Add a CAPTCHA (Cloudflare Turnstile) on guest sign-up. For vector-map features (tilt, heading-up navigation), create a Cloud map ID and copy `src/lib/mapStyle.js` into a Cloud-based style.

## What's live

**Hosted Supabase project** `nabzfpbpfmcjbbwsxiob`, linked. All migrations applied. `routes` edge function deployed with the Google key. Repo: `https://github.com/loisegakii/pathiq-navigators` (a different account from the git user on this machine).

**Driver app (`/app/*`), no login wall.** A guest session starts silently (`RequireSession`).
- **Map:** Google streets in **PathIQ's own style** (`src/lib/mapStyle.js`). Google's shop, hospital and bus-stop pins are hidden, so PathIQ's layers stand out. A layer switcher toggles Gems, Road reports and Google live traffic. Tapping the map drops a pin with "Route here", plus, for Scouts, "Report a road issue here" and "Add a gem here" (these open the Scout form with the spot filled in). Gem details with save/rate. Shows a notice when location is off.
- **How to style the map or add a new kind of PathIQ data to it:** see [`docs/map-styling.md`](docs/map-styling.md).
- **Search:** tapping the box shows **Recent** destinations and **Saved gems** for one tap. Typing searches Google Places (New) limited to Kenya, plus matching PathIQ gems. Places searches start at 3 characters.
- **Routes:** the `routes` edge function returns Google alternatives scored against verified road reports, tagged Recommended / Fastest / Best Road. Live reports on each route (`hazards`) are **painted onto the route** in their severity colour. Reports that have faded (e.g. an accident older than about 20 h) are neither painted nor listed; see `isStillRelevant` in `scoring.ts`.
- **Route planning lives on the map.** A bottom panel lists every alternative side by side (time, distance, road and traffic scores, number of reports), then the selected route's problems and Start.
- **Start, stops and destination** (`src/components/RouteEditor.jsx`), like Google Maps' directions card. The start defaults to **Your location** (the live GPS fix, which is watched the whole time the map is open, so routes start from where you are *now*). Any point can be set by search, "Your location", "Choose on the map", or from a dropped pin / gem sheet ("Start here", "Add as stop"). Up to 5 stops (`MAX_STOPS`); with stops Google returns one route, not alternatives. Swap reverses the trip.
- **Location off:** the app no longer routes silently from central Nairobi. Choosing a destination asks for a starting point. A route that doesn't start where you are (location off, or a start more than 150 m away) gets **Preview directions** (`RoutePreviewHud.jsx`: step by step, map follows) instead of Start.
- **History tab (`/app/history`)** (was Routes): past trips grouped by day. Each shows destination, route type, distance, time taken, Arrived / Ended early / Too short to count, road score, reroutes and gems passed, with **Go again** (plans it on the map) and **Remove** (recomputes the IQ Score). `my_trip_history` RPC. Old `/app/routes` links redirect.
- **Navigation:** turn-by-turn from Google's steps, GPS snapped to the route line (`src/lib/navigation.js`), reroute after 3 fixes more than 50 m off route, arrival within 40 m. The screen stays on (Wake Lock). With stops: each step carries its `leg`; `buildNavModel` turns that into `legEnds`, a stop is "reached" (voiced) at the end of its leg, rerouting keeps the stops not yet reached, and arrival only counts once every stop is done (so round trips work). Resume from Home keeps the remaining stops (`?stops=` in `resumeUrl`).
  - **Voice and text:** the banner shows the next turn with Google's detail line ("Pass by …", "Toll road", "Destination will be on the right"). A **"Then …"** strip appears when two turns are under 400 m apart. A **Steps** list shows the full written directions: done steps dimmed, next highlighted. Steps are also available before starting, from the route panel.
- **Icons:** one icon set for PathIQ data (`src/lib/placeStyles.js`, `src/components/PlaceIcons.jsx`). Gems are coloured teardrop pins per category (with saved, on-route and selected states); reports are diamonds coloured by severity with a type glyph. The same icons appear in search, chips, sheets, alerts, Home, Gems and Admin. No more emoji.
- **Route line (like Google Maps):** teal base, **amber/red live-traffic shading** (Google `TRAFFIC_ON_POLYLINE`, switchable with the `ROUTES_TRAFFIC_ON_POLYLINE` secret because it's billed at a higher rate), direction arrows, turn icons at street level, and road reports as **dotted** stretches. Each route option says how much slow or heavy traffic it has.
- **Gem alerts:** "Hidden gem ahead" within 600 m, and "You just passed" with a Save button. Filtered by category and max detour (Profile settings). Once per gem per trip, voiced, and a system notification if the app is in the background and notifications are on.
- **Trips:** recorded in `trips` (summary only, no GPS trail). A trigger recomputes `iq_score` when a trip ends: 50% road quality of the routes chosen, 30% trips completed, 20% staying on route, over the last 30 days. Home and Profile show real "Trips this month" and "Gems found" (`my_driver_stats`).
- **Home:** IQ Score, stats, Active route card (resume navigation), incidents and gems near you.
- **Profile:** guest upgrade, Become a Scout, notifications toggle (saved on the profile, asks the browser for permission), gem-alert settings, Install app, dark mode.
- **Scouts** (`/app/scout`): road reports and gems with an optional photo (shrunk on the phone, private bucket). **Admins** (`/app/admin`) review them with a photo preview.

**Installable app:** manifest, icons, and a service worker that caches the app shell so the app opens with no signal. Verified: Chrome reports it installable, and it opens offline.

**Marketing site:** `/`, `/map`, `/hidden-gems`, `/scout-program`, `/developers`, `/pricing`, `/privacy`, `/terms`. Mobile menu below 980px.

**Security** (`supabase/README.md` → Security):
- RLS on every table, with trips locked down so the IQ Score can't be gamed by editing rows.
- Photo ownership checks.
- Rate limits on routes (per user, per IP, and a global Google budget), trip starts, submissions and uploads.
- `npm run test:security` passes 61/61 against the hosted project.

## Not built

- **Business/partner** and **developer** account tiers (see the `pathiq-tiered-user-access` memory). They're product direction, not designed yet.
- Company pages linked from the footer (About, Blog, Careers, Press, Contact, Docs, Status, Changelog, Scout Portal/Earnings/Training/Community) are still `#` links.
- Navigation polish: heading-up camera (needs a vector map ID), greying out the part of the route already driven, and warnings about road reports ahead.
- Verifying trips on the server: the route's road score at start and "arrived" are self-reported by the client.

## Test data note

End-to-end runs on 2026-09-25/26 created a few anonymous (guest) users with test trips to "Sarit Centre" on the hosted project. The security and photo tests clean up after themselves. The browser drive tests' guests don't, and they're harmless. There are no real users yet.

## Where to look for more detail

| Question | File |
|---|---|
| What is this product, for whom | `description.md` |
| MVP scope, what's P0/P1/P2, build status | `features.md` |
| Stack decisions, the two engines | `architecture.md` |
| Design system, screens, the Figma prompt | `design-brief.md` |
| Database schema, RLS, rate limits, spatial functions, deploy gotchas | `supabase/README.md` |
| How to run, scripts, keys | `README.md` |
| Map styling, markers, adding map layers | `docs/map-styling.md` |
| Map-first / zero-auth / tiered-nav product direction | memory: `pathiq-tiered-user-access` |
