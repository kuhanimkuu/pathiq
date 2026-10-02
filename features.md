# PathIQ Navigators: MVP and future features

Derived from `description.md`. The MVP is the smallest product that proves the core idea: **a driver in Nairobi gets a better route and is told about Hidden Gems as they approach or pass them.**

Priority key: **P0** = the MVP doesn't work without it. **P1** = MVP, should ship. **P2** = MVP if time allows.

---

## Build status (2026-09-26)

Every MVP row below is built and verified against the hosted Supabase project (browser tests with simulated GPS, plus `npm run test:security`), except where noted. Details are in `progress.md`.

| Area | Status |
|---|---|
| Sign up / sign in, guest mode, upgrade | Built. Guests start silently with no login wall |
| Live map | Built: Google Maps JS, gem and road-report markers, dark/light |
| Route options + route scoring | Built: `routes` edge function, Google alternatives scored against road reports |
| Turn-by-turn / route-following | Built: GPS snapped to the route, voice, reroute, arrival |
| Suggestions: approaching + just passed, safe alerts, filters | Built: once per gem per trip, voiced, auto-dismissed, category and max-detour settings |
| Hidden Gems browse/filter, save, ratings | Built |
| Road condition layer | Built (Scout-reported, admin-reviewed) |
| Home dashboard, Profile/settings | Built, including real trips, gems found, IQ Score and a working notifications toggle |
| Driver IQ Score | Simple v1: 50% road quality chosen, 30% trips completed, 20% staying on route, last 30 days |
| Scouts: sign-up, reports with photo + GPS, review queue | Built. Payouts are marked paid by hand (P2 as planned) |
| Admin tool: add, edit and approve gems and reports | Built as the admin dashboard (`/app/admin`): overview, review queue, gem/report editing, users and roles, batch M-Pesa payouts, pay rates, audit log |
| Installable app: manifest, icons, service worker, Wake Lock, install prompt | Built. Opens offline |
| Location permission and privacy | In-app notice when location is off. Privacy and Terms pages drafted, **need legal review** |
| Seed data: 50–100 verified gems | **Not done:** 11 gems. Needs real, verified places |
| Security | RLS on every table, trip/IQ rules, photo ownership, rate limits (see `supabase/README.md`) |

**Product direction (2026-09-23):** the platform is map-first with **zero auth friction** for viewing. The primary nav is **Map, Hidden Gems, Scout Program**. There are three user tiers: casual drivers (built), **business/partner** accounts (not built, not designed), and **developer** accounts with API keys (not built, not designed). See the `pathiq-tiered-user-access` memory.

---

## MVP (Nairobi only, web app)

### Driver app
| Feature | Priority | Notes |
|---|---|---|
| Sign up / sign in | P0 | Real auth and a backend replace the current UI-only modal |
| Live map | P0 | Replaces the `MapPage` placeholder. Shows the user's position, the route and gems |
| Route options | P0 | Recommended / Fastest / Best Road with time, distance and scores. Needs a routing provider |
| Turn-by-turn or route-following | P0 | The app must know where the driver is on the route |
| Hidden Gems browse and filter | P0 | Already prototyped. Categories: Attractions, Hotels, Food, Scenic, Fuel, Facilities |
| Suggestion system: approaching | P0 | Alert when a gem is within a radius of the route ahead, with the detour cost |
| Suggestion system: just passed | P1 | Alert after passing a gem, with save-for-later |
| Safe alerts | P0 | Short and glanceable, no interaction while driving, one alert per gem per trip |
| Suggestion filters | P1 | By category and maximum detour |
| Save a gem | P1 | Needed for "just passed" to be useful |
| Road condition layer (potholes, flooding, construction, incidents) | P1 | Seeded and Scout-reported. Feeds the route road-quality score |
| Route scoring | P1 | A simple score from road-condition reports and traffic. Doesn't need to be a model |
| Home dashboard | P2 | Active route, nearby incidents, nearby gems |
| Profile and settings | P2 | Working notification toggle. Dark mode persisted |
| Driver IQ Score | P2 | Defer the algorithm. Show it only if a simple version is ready |

### Scouts (lean version)
The data has to come from somewhere, so the MVP needs a minimal Scout loop.

| Feature | Priority | Notes |
|---|---|---|
| Scout sign-up | P1 | A role on the same auth system |
| Submit a report with photo and GPS | P1 | Road condition report or gem discovery |
| Manual review queue | P1 | An admin approves or rejects. No AI at this stage |
| Manual M-Pesa payout | P2 | Paid by hand or in batches at first |

### Platform basics
| Feature | Priority |
|---|---|
| Backend and database for users, gems, road reports and trips | P0 |
| Seed data: 50-100 verified gems and known problem roads in Nairobi | P0 |
| Admin tool to add, edit and approve gems and reports | P1 |
| Location permission and privacy handling | P0 |
| Landing page wired to the real app (CTAs lead to sign-up and `/app`) | P1 |

### Explicitly out of MVP
Everything under "Future" below, plus the unbuilt pages: Pricing, docs and legal. Legal pages (privacy and terms) are needed before launch because the app collects location data.

---

## Future features

### Phase 2: Data quality and Scouts at scale
- **AI photo validation:** analyse Scout photos and pre-fill condition data.
- **Automated M-Pesa payouts** on approval.
- **Scout portal:** task assignment by GPS, earnings dashboard, training and community.
- **Confidence scores and provenance tags** on road insights (AI-assisted, Scout-verified, Live).
- **Flood zone surveys** and real-time flood alerts.
- **Community confirmations and ratings** on gems.

### Phase 3: Smarter driving
- **Full route intelligence:** historical reliability, incidents and live traffic in the scoring.
- **Personalised suggestions:** learned from interests, past trips and time of day.
- **Voice alerts and hands-free mode.**
- **Driver IQ Score** with a full, explained algorithm.
- **Trip history, saved places and trip planning** with gems added as stops.
- **Offline maps and alerts** for areas with weak signal.

### Phase 4: Platform and business
- **Developer API and documentation,** with API keys and usage tiers.
- **Pricing and billing** (model to be decided).
- **Business products:**
  - Logistics route optimisation.
  - Fleet management with driver safety scoring.
  - Travel-platform place data.
- **Connected-vehicle and satellite data ingestion.**

### Phase 5: Expansion
- **County Road Intelligence:** road monitoring and budget planning for counties. Pilot 2026.
- **Matatu SACCO Intelligence:** route optimisation, occupancy tracking and passenger safety scoring. 2027.
- **PathIQ Mobile:** native iOS and Android app. Q2 2027.
- **Expansion beyond Nairobi** to other cities and the rest of Kenya.

---

## Suggested build order for the MVP
1. Backend, auth and the gem/road-report data model.
2. Live map with the user's position.
3. Routing with route options.
4. Gem-proximity suggestions (approaching, then just passed).
5. Road-condition layer and simple route scoring.
6. Lean Scout submission and the admin review queue.
7. Seed data, legal pages and wiring the landing page to the app.

## Decision: Google Maps Platform
Maps, routing and geocoding use the Google Maps Platform.

| Need | Google API |
|---|---|
| Live map in the web app | Maps JavaScript API |
| Route options with live traffic and alternatives | Routes API (computeRoutes with alternatives) |
| Search and place details, and matching gems to real places | Places API |
| Address to coordinates and back | Geocoding API |
| User position while driving | Browser Geolocation API (not a Google API) |

What this means for the build:
- **Google does not supply road quality.** It gives time, distance and traffic. PathIQ's own road-condition reports must supply the road quality, incident and reliability parts of each route score. The three route options are built by scoring Google's alternative routes against PathIQ's data.
- **Gem proximity is our own code.** The suggestion system compares the driver's position with gem coordinates from PathIQ's database. It uses Google's route geometry, not a Google feature.
- **Costs are per request.** Routes and Places calls are billed, so cache route results, avoid re-requesting routes on every position update, and set a budget alert in Google Cloud.
- **API key security:** restrict the browser key by HTTP referrer and by API. Keep any server-side key out of the front end, and never commit keys (use `.env` and check that it is in `.gitignore`).
- **Terms of use:** Google's terms limit how its data can be stored and shown. Check them before caching Places data or drawing Google routes on a non-Google map.

## Decision: mobile-friendly PWA
The MVP ships as a progressive web app: the existing React/Vite codebase, installable on a phone's home screen. Native iOS and Android (PathIQ Mobile, Q2 2027) comes after the concept is proven.

MVP additions this requires:
| Feature | Priority | Notes |
|---|---|---|
| Web manifest and app icons | P0 | Makes the app installable and full-screen |
| Service worker | P1 | Caches the app shell so it loads with weak signal |
| Mobile-first layout | P0 | The app shell is already phone-styled. Check on real devices |
| Screen Wake Lock during an active trip | P0 | Keeps the screen on so location tracking and gem alerts keep running |
| Install prompt | P2 | A prompt to add the app to the home screen |

Known limits to design around:
- **Background tracking:** browsers pause location tracking when the screen is off or the app is in the background, especially on iPhone. Gem alerts can be missed if the phone locks.
- **Test on Android first,** with the phone mounted and the screen awake. Treat iPhone support as best effort for the MVP.
- **Push notifications** on iPhone only work after the PWA is installed to the home screen.
- Drivers must be told to keep the app open during a trip.

## Decision: pricing
- **MVP:** free for drivers. No paywall and no Pricing page yet.
- **After the MVP:** freemium. Free navigation and Hidden Gems, with a paid tier for advanced route intelligence and other extras. Gem partnerships (labelled, paid placement) are an option.
- **Later:** API usage tiers and business contracts.

Implications for the build:
- **Design for a paid tier now, without building it.** Keep a `plan` field (free or paid) on the user record, and check features against it in one place, so gating a feature later doesn't mean rewriting the app.
- **Keep the free tier cheap to run.** Google Maps requests are billed per call, so cache routes and limit how often the app re-requests them. The MVP has no revenue to cover them.
- **Payments:** M-Pesa is the likely payment method for the paid tier. Build it when the tier launches.

Proposed free/paid split (to be confirmed):
| Free | Paid (future) |
|---|---|
| Route options (Recommended, Fastest, Best Road) | Advanced route intelligence: historical reliability and deeper scoring |
| Hidden Gems browse and the basic suggestions | Personalised suggestions and detour preferences |
| Basic road-condition alerts | Offline maps and alerts |
| Saved gems | Trip planning with gems as stops, and full trip history |

## Open questions
- **Free/paid split and price:** the split above is a proposal. Confirm it and set a price before the paid tier launches.
