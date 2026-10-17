# PathIQ Navigators: progress

A snapshot of where things stand, for picking this up again on this machine or another. For the product vision and longer-term plan, see `description.md`, `features.md`, `architecture.md` and `design-brief.md`. This file is the "where are we right now" summary.

Last updated: 2026-10-12.

---

## Status in one paragraph

The MVP in `features.md` is built end to end against the hosted Supabase project:
- **Driving:** a real Google map, place search, scored route alternatives, and turn-by-turn navigation with voice, rerouting and arrival.
- **Hidden Gems:** alerts while driving ("ahead" and "just passed", with filters).
- **Trips:** trip recording feeding real "Trips this month", "Gems found" and IQ Score numbers.
- **Scouts:** reports and gems with photos, plus admin review.
- **Platform:** installs as a phone app and opens offline, Privacy and Terms pages, locked-down RLS, and rate limits.

What's left is mostly **decisions and accounts only David's team can set up** (see "Before launch"), plus the business/developer tiers, which aren't designed yet.

## Maps app restructure and road data (2026-10-12)

PathIQ is moving from "a navigation app" to "a maps app with navigation in it":
- **The map is the app's home** (`/app`). The Home tab is gone: IQ Score moved to Profile, the active-trip card is a "Resume" card on the map, and nearby gems/reports were already on the map. Tabs: Explore, History, Gems, Profile. Old `/app/map?...` links redirect with their query.
- **Search shows a place, Directions plans the route.** Picking a search result opens its sheet; gem sheets have Directions as the main button.
- **`MapPage.jsx` split up** (2,077 → ~1,100 lines) into `src/pages/map/`: `useTurnByTurn` (navigation mode: voice, rerouting, alerts, trips), `useGooglePlaces`, `useMapMarkers`, `useRouteOverlays`, `RoutePanel`, `FeatureSheet`, `MapControls`, `NavAlerts`.
- **Opt-in road data** (migration `20261012000000_location_contributions.sql`, `src/lib/locationContribution.js`, Profile → "Help improve road data", privacy policy `#road-data`). Off by default; consent time set by the server; samples have no user id (daily random device token); first/last 200 m of each trip never sent; nightly pg_cron roll-up into `road_speed_daily` then raw rows deleted (7-day backstop); `road_speeds_near` only returns cells with 5+ device-days. Security tests added to `npm run test:security`.
  - Applied on the hosted project by hand in the SQL editor (2026-10-12); the roll-up job is scheduled. `npm run test:security` not run yet.
- **90-day raw window and road archive** (migration `20261013000000_road_archive.sql`, 2026-10-13). The roll-up now marks raw samples instead of deleting them. `archive_location_samples()` (pg_cron, 00:45 UTC) turns each full week 83+ days old into `road_archive_cells` (~11 m cells: passes, direction, speed) and `road_archive_turns` (direction in → out per ~110 m cell), keeping only rows with 5+ device-days, then deletes those raw points; anything received over 90 days ago goes too. The device keeps its daily codes 91 days so "Delete what this device has sent" still covers everything. `npm run export:road-archive` copies the archive to NDJSON for the offline database; raw points are never exported. Privacy policy, Profile text, README and security tests updated. Checked in PGlite + PostGIS; not yet run on the hosted project.
  - **Needs:** run the migration in the SQL editor (or `supabase db push`), check `select jobname, schedule from cron.job` lists `pathiq-archive-location-samples`, then `npm run test:security`.
  - **Before relying on it:** lawyer review of the new privacy section; ODPC registration and a DPIA under the Kenya DPA (location tracking).
- **Hosted `routes` function returned 500 "Could not read road reports"** during testing on 2026-10-12 (not caused by these changes; client code for routes is unchanged). Needs a look at the function logs.

## Company pages, blog and contact inbox (2026-10-14)

- **Footer "Company" links are real pages:** `/about`, `/blog` (+ `/blog/:slug`), `/careers`, `/press`, `/contact` (`src/pages/marketing/company/`). Careers lists no roles (honest "introduce yourself" via the contact form); Press has the boilerplate, key facts, logo/icon downloads and brand colours. Pages set their own titles; marketing pages now open at the top (or at a `#section`) on navigation.
- **Blog written in the admin dashboard** (Admin → Blog): Markdown editor with preview, cover and inline image uploads (public `blog-images` bucket, 5 MB, images only), drafts, publish/unpublish, scheduled publishing, editable web address and author, delete. Visitors only ever see published posts (RLS); an admin opening a draft's link gets a preview. Rendered with react-markdown + remark-gfm (no raw HTML), loaded only on post pages and the editor.
- **Contact form → Admin → Messages** (badge with the count of new ones): reply by email, mark done, delete. Writes go through `submit_contact_message` only: 5 per hour per connection (counted under a hash of the IP) and 200 per hour site-wide, plus a honeypot field. Done messages are deleted after a year (pg_cron, 01:30 UTC). Privacy policy has a new "Messages you send us" section.
- Migration `20261014000000_blog_and_contact.sql`; admin writes audited in `admin_audit_log`. Checked in PGlite (RLS for anon/user/admin, rate limit, clean-up) and in the browser against mocked data; security tests added to `npm run test:security` (not yet run on the hosted project).
  - **Needs:** run the migration in the SQL editor, check `cron.job` lists `pathiq-delete-old-contact-messages`, then `npm run test:security`. Set `CONTACT` in `LegalPages.jsx` when there's a public email (until then the policy points to the contact form).

## Before launch (needs a person, not code)

1. **Google key.** The single demo key (Routes + Maps JS + Places) is in `.env`, `supabase/functions/.env` and the hosted secrets. It's visible in the browser bundle. Whoever owns the Cloud account should:
   - create a **server key** (Routes API only) for `supabase secrets set GOOGLE_MAPS_API_KEY=…`;
   - create a **browser key** (Maps JavaScript + Places only, restricted to the site's domains) for `VITE_GOOGLE_MAPS_API_KEY`;
   - set **daily quotas and a budget alert**;
   - then delete the demo key, which has also been pasted into a chat.
2. **Email.** Email confirmation is off on the hosted project. Turning it on needs **custom SMTP** first (Supabase's built-in mailer only sends to team members). Details are in `supabase/README.md`.
3. **Legal.** `/privacy` and `/terms` are a plain-language first draft that matches what the code does. They need a lawyer's review (Kenya Data Protection Act 2019) and a contact address (`CONTACT` in `src/pages/marketing/LegalPages.jsx`).
4. **Seed data.** 11 gems and 3 road reports. Their coordinates are approximate, so none of the 3 reports sits on an actual road, and the one accident is days old. Routes currently show no road reports until real ones come in from Scouts. A temporary on-road pothole was used to verify the painting and the re-ranking: Best Road avoided it. `features.md` wants 50–100 verified gems, which means real places checked by real people, the Scout workflow's job.
5. **Sign in with Google.** The code is in; the Google buttons stay hidden until Google is switched on in Supabase. To switch it on:
   - In **Google Cloud Console** (APIs & Services): set up the **OAuth consent screen** (app name, logo, support email, privacy/terms links; scopes are just email, profile, openid) and **publish** it, since in "Testing" only listed test users can sign in. Then **Credentials → Create OAuth client ID → Web application**, with authorised redirect URI `https://<project-ref>.supabase.co/auth/v1/callback`. OAuth clients cost nothing.
   - In **Supabase → Authentication → Sign In / Providers → Google**: paste the client ID and secret and enable it. Also turn on **Allow manual linking** (guests use it to save their account with Google).
   - In **Supabase → Authentication → URL Configuration**: set Site URL to the production domain and add redirect URLs for every place the app runs (`https://<domain>/**`, `http://localhost:5173/**`, `https://<lan-ip>:5173/**` for phone testing). Google sign-in only returns to addresses on that list.
   - Do this in the dashboard, not with `supabase config push` (see `supabase/README.md`).
6. **Optional.** Add a CAPTCHA (Cloudflare Turnstile) on guest sign-up. For vector-map features (tilt, heading-up navigation), create a Cloud map ID and copy `src/lib/mapStyle.js` into a Cloud-based style.

## What's live

**Hosted Supabase project** `nabzfpbpfmcjbbwsxiob`, linked. All migrations applied. `routes` edge function deployed with the Google key. Repo: `https://github.com/loisegakii/pathiq-navigators` (a different account from the git user on this machine).

**Driver app (`/app/*`), no login wall.** A guest session starts silently (`RequireSession`).
- **Map:** Google streets in **PathIQ's own style** (`src/lib/mapStyle.js`). Google's shop, hospital and bus-stop pins are hidden, so PathIQ's layers stand out. A layer switcher toggles Gems, Road reports and Google live traffic. Tapping the map drops a pin with "Route here", plus, for Scouts, "Report a road issue here" and "Add a gem here" (these open the Scout form with the spot filled in). Gem details with save/rate. Shows a notice when location is off.
- **How to style the map or add a new kind of PathIQ data to it:** see [`docs/map-styling.md`](docs/map-styling.md).
- **Search:** tapping the box shows **Recent** destinations and **Saved gems** for one tap. Typing searches Google Places (New) limited to Kenya, plus matching PathIQ gems. Places searches start at 3 characters.
- **Routes:** the `routes` edge function returns Google alternatives scored against verified road reports, tagged Recommended / Fastest / Best Road. Live reports on each route (`hazards`) are **painted onto the route** in their severity colour. Reports that have faded (e.g. an accident older than about 20 h) are neither painted nor listed; see `isStillRelevant` in `scoring.ts`.
- **Route planning lives on the map.** A bottom panel lists every alternative side by side (time, distance, road and traffic scores, number of reports), then the selected route's problems and Start.
- **Start, stops and destination** (`src/components/RouteEditor.jsx`), like Google Maps' directions card. The start defaults to **Your location** (the live GPS fix, which is watched the whole time the map is open, so routes start from where you are *now*). Any point can be set by search, "Your location", "Choose on the map", or from a dropped pin / gem sheet ("Start here", "Add as stop"). Up to 5 stops (`MAX_STOPS`); with stops Google returns one route, not alternatives. Swap reverses the trip.
- **Pinned places** (`pinned_places` table, `my_pinned_places` RPC, `src/lib/pinnedPlaces.js`): pin any spot (dropped pin, your location, a shared link, a planned destination) with a name and Home / Work / Other. One Home and one Work per driver (choosing a new one demotes the old), up to 100 pins, 60 new pins an hour. Pins show on the map (white badges), first in search, and open a sheet with Route here / Add as stop / Start here / Share / Edit / Unpin (`components/PlaceSheet.jsx`).
- **Sharing a location** (`src/lib/share.js`): Share on any place sheet, gem, or "My location" (the locate button on the map) sends a link `/app/map?at=lat,lng&name=…` plus a Google Maps link, through the phone's share sheet or copied to the clipboard. Opening the link shows that spot with the same actions. Your own location is shared unnamed, so the recipient doesn't see "Your location".
- **Location off:** the app no longer routes silently from central Nairobi. Choosing a destination asks for a starting point. A route that doesn't start where you are (location off, or a start more than 150 m away) gets **Preview directions** (`RoutePreviewHud.jsx`: step by step, map follows) instead of Start.
- **History tab (`/app/history`)** (was Routes): past trips grouped by day. Each shows destination, route type, distance, time taken, Arrived / Ended early / Too short to count, road score, reroutes and gems passed, with **Go again** (plans it on the map) and **Remove** (recomputes the IQ Score). `my_trip_history` RPC. Old `/app/routes` links redirect.
- **Navigation:** turn-by-turn from Google's steps, GPS snapped to the route line (`src/lib/navigation.js`), reroute after 3 fixes more than 50 m off route, arrival within 40 m. The screen stays on (Wake Lock). With stops: each step carries its `leg`; `buildNavModel` turns that into `legEnds`, a stop is "reached" (voiced) at the end of its leg, rerouting keeps the stops not yet reached, and arrival only counts once every stop is done (so round trips work). Resume from Home keeps the remaining stops (`?stops=` in `resumeUrl`).
  - **Voice and text:** the banner shows the next turn with Google's detail line ("Pass by …", "Toll road", "Destination will be on the right"). A **"Then …"** strip appears when two turns are under 400 m apart. A **Steps** list shows the full written directions: done steps dimmed, next highlighted. Steps are also available before starting, from the route panel.
- **Icons:** one icon set for PathIQ data (`src/lib/placeStyles.js`, `src/components/PlaceIcons.jsx`). Gems are coloured teardrop pins per category (with saved, on-route and selected states); reports are diamonds coloured by severity with a type glyph. The same icons appear in search, chips, sheets, alerts, Home, Gems and Admin. No more emoji.
- **Route line (like Google Maps):** teal base, **amber/red live-traffic shading** (Google `TRAFFIC_ON_POLYLINE`, switchable with the `ROUTES_TRAFFIC_ON_POLYLINE` secret because it's billed at a higher rate), direction arrows, turn icons at street level, and road reports as **dotted** stretches. Each route option says how much slow or heavy traffic it has.
- **Gem alerts:** "Hidden gem ahead" within 600 m, and "You just passed" with a Save button. Filtered by category and max detour (Profile settings). Once per gem per trip, voiced, and a system notification if the app is in the background and notifications are on.
- **Trips:** recorded in `trips` (summary only, no GPS trail). A trigger recomputes `iq_score` when a trip ends: 50% road quality of the routes chosen, 30% trips completed, 20% staying on route, over the last 30 days. Home and Profile show real "Trips this month" and "Gems found" (`my_driver_stats`).
- **Home:** IQ Score, stats, Active route card (resume navigation), incidents and gems near you.
- **Sign in with Google** (once switched on, see Before launch): "Continue with Google" in the Sign in / Sign up modal; guests can **Save with Google** on Profile, which links Google to their guest account so saved gems and trips carry over (if that Google account already has a PathIQ account, they're told to sign in with it instead). The profile's display name comes from Google. Admins who use Google confirm with Google to unlock the dashboard.
- **Profile:** guest upgrade, Become a Scout, notifications toggle (saved on the profile, asks the browser for permission), gem-alert settings, Install app, dark mode.
- **Scouts** (`/app/scout`): road reports and gems with an optional photo (shrunk on the phone, private bucket). **Admins** review them in the admin dashboard (below).
- **Admin dashboard** (`/app/admin`, an Admin tab appears for admins only, and non-admins who type the URL are sent to `/app`. Opening it asks for the admin's password again, good for an hour; the database enforces this too, see Security; code in `src/pages/admin/`, backend in `supabase/migrations/20261002000000_admin_dashboard.sql`):
  - **Overview:** what needs attention (items waiting and how old, KSh owed), people (accounts, guests, Scouts), trips this week, live gems and reports, and 14-day charts (trips, new accounts, Scout submissions) with a table view.
  - **Review queue:** gems, road reports and Scout applications, oldest first, with a map of the spot, the photo, who sent it, and a warning when a live gem or report is already within 150 m / 100 m. Reject with a reason (the Scout sees it), bulk approve/reject, keyboard J/K/A/R.
  - **Gems / Road reports:** every item, not just pending. Search and filter, edit details, move the pin (tap the map or paste coordinates), hide/restore, delete, add new ones straight to the map, and clear a report when the road is fixed.
  - **Users & Scouts:** search by name, email or ID; trips, IQ Score, approval rate, earned/owed; change role (not your own, and guests can't be made Scout/admin). Sort by top Scouts or most owed.
  - **Payouts & rates:** one row per Scout owed, paid with one M-Pesa code covering exactly the earnings shown; CSV for M-Pesa bulk pay; edit pay per task; recent payments.
  - **Map:** everything in the visible area at once: live, pending (pulsing amber halo) and hidden gems; live and expired reports; and where trips ended over 30 days (grouped into ~500 m areas, no single trip shown). Tap a pin to approve/reject, open the gem, or edit the report.
  - **Gem pages** (`/app/admin/gems/:id`): saves, alerts triggered ("ahead" / "just passed"), confirmations and a ratings breakdown, nearby gems within 300 m with one-click merge, and the gem's full admin history.
  - **User pages** (`/app/admin/users/:id`): sign-in methods, trips, IQ Score, saves, earnings (paid/owed), submissions with their review notes, Scout application, everything admins did involving them; change role or suspend from here.
  - **Suspend:** for 1/7/30 days or until lifted, with a reason the person sees. They keep the map but can't submit gems or reports, upload photos, rate places or apply as a Scout (enforced in the database). Admins can't be suspended, and nobody can suspend themselves.
  - **Usage & costs:** Google Routes calls per day (billed, with traffic, from cache, refused, failed), an estimated cost from editable per-1,000 prices, and who has been hitting rate limits in the last 24 hours. Counting is done by the `routes` edge function, so it starts once that's redeployed.
  - **Data tools:** import up to 500 gems from a CSV (checked first: bad rows and duplicates within 75 m, or same name within 300 m, are flagged and skipped), and a duplicate finder that merges pairs, moving saves, ratings and trip alerts to the gem you keep.
  - **Audit log:** every admin change to gems, reports, applications, earnings, rates and roles, written by trigger. Nobody can edit or delete it, admins included.

**Logo** (`src/components/Logo.jsx`): a road winding up to an amber Hidden Gem on the teal tile, with the "PathIQ Navigators" wordmark. Used in the app top bar, site nav, footer and sign-in modal. The same drawing is in `public/favicon.svg` (simplified for tab size), `public/icons/` (app icons, maskable icon, notification badge) and `public/og-image.png` (link previews; the og:image URL is relative, so make it absolute once the production domain is known).

**Installable app:** manifest, icons, and a service worker that caches the app shell so the app opens with no signal. Verified: Chrome reports it installable, and it opens offline.

**Marketing site:** `/`, `/map`, `/hidden-gems`, `/scout-program`, `/developers`, `/pricing`, `/privacy`, `/terms`. Mobile menu below 980px.

**Security** (`supabase/README.md` → Security):
- RLS on every table, with trips locked down so the IQ Score can't be gamed by editing rows.
- Photo ownership checks.
- Rate limits on routes (per user, per IP, and a global Google budget), trip starts, submissions and uploads.
- `npm run test:security` passes 61/61 against the hosted project (before the admin dashboard). With the admin checks it is 137 tests: 136 pass against local Supabase; the one failure is a photo upload hitting a schema quirk in the local storage container, unrelated to this work. Not yet run against hosted (needs `db push`).
- Admin powers need the admin role **and** a password sign-in in the last hour (`admin_auth_fresh()`, read from the session token's `amr` claim). This applies to every admin function and every "or admin" RLS policy, so a stolen or left-open admin session can't do admin things. Admin functions also share a 3,000-calls-per-hour limit per admin, and every admin change is logged.
- **Making the first admin:** sign up normally, then in Supabase SQL Editor: `update public.profiles set role = 'admin' where id = (select id from auth.users where email = '…');`. Later admins are promoted from Users & Scouts.

## Not built

- **Business/partner** and **developer** account tiers (see the `pathiq-tiered-user-access` memory). They're product direction, not designed yet.
- Company pages linked from the footer (About, Blog, Careers, Press, Contact, Docs, Status, Changelog, Scout Portal/Earnings/Training/Community) are still `#` links.
- A true vector-map heading-up camera with tilt. The map is raster (styled from code), so heading-up is done by rotating the canvas (`src/pages/map/camera.js`): it works, but street labels turn with it. A Cloud map ID with the same style would let Google rotate it natively.
- A generative-AI narrative of the road ahead. "Ahead on your route" (`src/lib/routeAhead.js`) is built from the route's own data (traffic, reports, gems, facilities, stops), not an LLM.
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
