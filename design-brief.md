# PathIQ Navigators: design brief and Figma prompts

Companion to `description.md`, `features.md` and `architecture.md`. This exists to brief a Figma design (via Figma's AI generation or a human designer) for the **whole platform**, not just the map — because the platform has several kinds of users and not every screen should look the same to all of them.

---

## 1. Design system audit (fix before/while designing)

The codebase currently has **two inconsistent visual systems** that should become one:

| Token | Marketing site (`Landing.css`) | App (`App.css`) | Recommendation |
|---|---|---|---|
| Accent green | `#33d17a` | `#00C9A7` | Pick one. `#00C9A7` reads more "tech/data platform"; `#33d17a` reads more "road/go". |
| Page background | `#060b08` | `#050D0B` | Nearly identical — merge. |
| Panel background | `#0c1712` | `#081512` | Merge. |
| Border | `#1c2c22` | `rgba(255,255,255,.08)` | Pick one method (solid color vs. white-alpha). |
| Heading font | Sora | Space Grotesk | Pick one geometric sans for headings. |
| Body font | Inter | (system default) | Keep Inter — already used for body text and widely available. |
| Numeric/mono | none | IBM Plex Mono | Keep for scores/stats — gives the "data platform" feel description.md leans on. |
| Amber / Blue / Purple / Red | `#f5a623` / `#4f8cff` / `#b17cf0` / `#ef5a5a` | `#f59e0b` / `#60a5fa` / — / `#ef4444` | Merge to one set; app is missing a purple token. |

**Instruction for the Figma prompt:** design one token set (colors, type scale, radii, spacing) — **in both a dark and a light theme** — and apply it to both the marketing site and the app shell. Treat this as a rebrand-in-place, not two brands.

**Light mode isn't new scope — it's already half-promised.** `Profile.jsx` has a "Dark mode" settings toggle today, but it's a stub: it just flips local state and does nothing, because there's only ever been one theme to flip to. Design should make that toggle real. Loose direction for a light theme (not final, same relationship dark has to itself):
- Background: near-white with a faint green or cool-grey cast, not stark `#FFFFFF`.
- Panels: white or a hair off-white, with a light grey or low-opacity-black border instead of the dark theme's white-alpha border.
- Text: a near-black for primary text, a mid-grey for the dim/faint tiers.
- Accent green: likely needs to darken slightly from whichever dark-mode green is chosen, so text/icon usage of it still passes contrast on a light background — but the same hue should read as "the same brand" in both themes.
- Severity/status colors (amber, blue, purple, red) can likely stay close to their dark-mode values, just contrast-checked against a light background.

---

## 2. Users and what they should see

| Role | How they get here | What's different for them |
|---|---|---|
| **Public visitor** | No account | Marketing site only. Every CTA either opens the auth modal or (if already signed in) skips straight into the app. |
| **Guest** | "Continue as guest" — anonymous account | Full driver app. A persistent, low-urgency prompt to save an account. **Cannot** apply to become a Scout (blocked at the database level — Scouts need a durable identity for M-Pesa payouts). |
| **Driver (free)** | Signed up with email | Full driver app. Can apply to become a Scout from Profile. |
| **Driver (paid)** — *not built yet* | Same, on the paid tier | Same UI, plus advanced route intelligence / personalization (features.md, "Decision: pricing"). Design should leave room for a paid-tier badge/upsell, not build the features. |
| **Scout** | Application approved by an admin | Everything a Driver has, **plus** a Scout submission tool (road reports, new gems) and an earnings view. |
| **Admin** | Set by another admin (no self-service) | Everything, **plus** a review console (approve/reject Scout submissions and applications, mark payouts). |

This matters visually: **the bottom tab bar, Profile page content, and available routes all change by role.** The Figma file should show at least: a Guest state, a Driver state, a Scout state, and an Admin state for any screen where they differ (Profile, and the nav itself).

---

## 3. Sitemap

**Marketing (public, desktop nav + mobile — no mobile menu exists yet, worth designing one):**
`/` (overview) · `/product` (Road Conditions) · `/route-intelligence` · `/hidden-gems` · `/map` · `/scout-program` · `/developers` · `/pricing`, plus an auth modal (sign in / sign up / continue as guest) that overlays any of them.

**App (`/app/*`, mobile-first, bottom tab bar — the primary surface):**
- `/app` — Home dashboard
- `/app/map` — **live map (not designed yet — the main gap this brief exists to fill)**
- `/app/routes` — route options
- `/app/gems` — Hidden Gems browse/save/rate
- `/app/profile` — account, settings, and role-conditional sections

**Role-gated, reachable from Profile, not in the tab bar:**
- `/app/scout` — Scout submission tool (Scouts, Admins)
- `/app/admin` — review console (Admins)

---

## 4. Screen-by-screen content (what's real, so Figma doesn't invent placeholder copy)

### Marketing
- **Home:** hero ("Navigate Kenya with the road intelligence Google Maps doesn't have"), a live stat row (42K+ drivers, 18K+ places, 1,284 Scouts, 1.8M routes — currently placeholder numbers), then condensed versions of every section below.
- **Road Conditions:** 6 condition types (Potholes, Flooding, Construction, Road Surface, Traffic, Incidents) as stat cards.
- **Route Intelligence:** 3 route cards (Recommended / Fastest / Best Road) with road-quality and traffic bars.
- **Hidden Gems:** 4 example gems as image cards (name, category, rating, one-line description, distance).
- **Map:** currently 3 highlight cards (road condition layers, route options, Hidden Gem alerts) + one CTA. This is the thin placeholder — see §5.
- **Scout Program:** an earnings table (KSh 150–500 per task type) and a 5-step process (Receive task → Field visit → AI validation → Submission → M-Pesa payment).
- **Developers:** 6 audience cards (Logistics, Matatu SACCOs, County Government, Developers, Travel Platforms, Fleet Management).
- **Pricing:** currently just "free for drivers, for now" — pricing model is undecided (see `description.md`).

### App
- **Home:** IQ score ring, two stat cards (trips this month, gems found), an "Active route" card (**still mock data**), "Incidents near you" and "Gems near you" (**both real**, from the driver's live location).
- **Map:** placeholder only. This is the actual design gap.
- **Routes:** 3 route option cards, same shape as the marketing version, plus a "Start navigation" button (**not wired up yet** — depends on the Google Maps key).
- **Gems:** category filter chips (Attractions, Hotels, Food, Scenic, Fuel, Facilities), a list of gems each with a 5-star rate control and a save/bookmark toggle.
- **Profile:** avatar + name + IQ score, stat cards, then role-conditional cards: guest-upgrade form, or a Become-a-Scout application form / pending-status badge, or Scout/Admin tool links — then settings toggles and sign out.
- **Scout submission:** two tabs — a road report form (type, 1–5 severity picker, description, "use current location" button) and a new-gem form (name, category, description, location).
- **Admin console:** four tabs — pending Gems / pending Road Reports / Scout Applications / Earnings — each a list of cards with Approve/Reject (or "mark paid") actions.

---

## 5. The map screen — my proposed defaults

I was about to ask you to choose between a few directions before you asked for this brief instead, so I'm stating my recommendation plainly rather than leaving it open — change any of it when you see the Figma output:

- **Layout:** full-screen map with minimal chrome (Google Maps / Waze pattern) — a floating destination-search bar up top, a collapsible bottom sheet for route/gem details, rather than a fixed side panel or a dashboard-first layout. This is a mobile-first PWA, so it should feel native to a phone first.
- **Hidden Gems as a core layer:** gem pins visible on the map by default (filterable by category), not opt-in and not only-as-alerts — this is the product's stated differentiator (`description.md`).
- **Road conditions as an overlay:** potholes/flooding/construction/incidents drawn along the route, consistent with the condition colors in §1's token table.
- **The approaching/just-passed alert:** a short, glanceable toast or bottom-sheet card, never a blocking dialog — matches the "safe while driving" rule in `features.md`.

---

## 6. The Figma prompt

Paste this into Figma's AI design generation (First Draft) or hand it to a designer as the brief. It's written to produce the design system first, then the highest-value screens.

> Design a dark-mode, mobile-first progressive web app called **PathIQ Navigators** — a Kenya-focused navigation app that combines road-condition intelligence, scored route options, and a "Hidden Gems" layer of verified local places (attractions, hotels, food, scenic spots, fuel, facilities), with alerts as a driver approaches or passes a gem.
>
> **Design system:** one set of design tokens, expressed in **both a dark and a light theme**, used consistently across the whole platform. Dark theme: a near-black background (`#050D0B`–`#060b08` range), a slightly lighter panel color (`#08–0c1712` range) with a subtle 8%-white or `#1c2c22` border. Light theme: a near-white background with a faint cool or green cast (not stark white), white or hair-off-white panels with a light grey/low-opacity-black border, near-black primary text. Both themes share one accent green (pick between `#00C9A7` and `#33d17a`, contrast-checked on both backgrounds) for primary actions and success states, plus amber, blue, purple and red for status/severity. Headings in a geometric sans (Sora or Space Grotesk — pick one), body text in Inter, and numeric/stat values in a monospace face (IBM Plex Mono) for a "data platform" feel. 14px corner radius on cards, generous whitespace. Include a theme toggle in the app's Settings screen (it already exists as a non-functional stub today) and design both themes for every screen below, not just the primary one.
>
> **Primary surface — the app, mobile-first (375×812 frame), with a bottom tab bar (Home / Map / Routes / Gems / Profile):**
>
> 1. **Map (the main screen to design):** full-screen map, minimal chrome. A floating search/destination bar at the top. Hidden Gem pins visible by default, colored/icon-coded by category (attraction, hotel, food, scenic, fuel, facilities), with a category filter chip row collapsible from the top bar. Road-condition markers (pothole, flooding, construction, incident) along the visible route, using the severity colors. A collapsible bottom sheet that expands to show route details (time, distance, road-quality/traffic/incidents scores) or a tapped gem's details (name, category, rating, confirmations, detour distance, save button). Include a short, non-blocking toast/card state for a "Hidden Gem approaching — 2.1 km detour" alert, and a distinct "you just passed" variant.
> 2. **Home dashboard:** an IQ-score ring, two stat cards (trips this month, gems found), an active-route summary card, and two scrollable lists — "Incidents near you" and "Gems near you" — each row showing a severity/category icon, title, and distance or time.
> 3. **Routes:** three stacked cards — Recommended / Fastest / Best Road — each with time, distance, and horizontal bar meters for road quality and traffic, plus a full-width "Start navigation" button.
> 4. **Gems:** a horizontal category filter chip row, then a list of gem rows, each with a name, category, rating, confirmation count, a 5-star rate control, and a bookmark/save toggle.
> 5. **Profile:** avatar, name, IQ score, two stat cards, then **show three variants of this screen**: (a) a guest variant with a "save your account" email/password form, (b) a driver variant with a "Become a Scout" application form (area, M-Pesa number, motivation), and (c) a Scout/Admin variant showing tool links instead ("Open Scout tools", and for admins, "Open admin review console").
> 6. **Scout submission tool** (Scouts and Admins only): a two-tab screen — a road-report form (condition type selector, 1–5 severity picker, description, "use current location" control) and a new-gem form (name, category selector, description, location).
> 7. **Admin review console** (Admins only): a four-tab screen — pending Gems, pending Road Reports, Scout Applications, Earnings — each tab a list of review cards with Approve/Reject actions (or "mark paid" on Earnings), showing what was submitted and by whom.
>
> **Secondary surface — the marketing site (desktop 1440px + mobile 375px), sharing the same design system:**
>
> A sticky nav (logo, links to Map / Road Conditions / Route Intelligence / Hidden Gems / Scout Program / Developers / Pricing, plus Sign in / Open PathIQ Navigators) and footer across all pages. Design: a home page with a hero (headline, live-stat row, a clickable map preview graphic), a Road Conditions page (6 condition-type stat cards), a Route Intelligence page (the 3 route cards), a Hidden Gems page (4 example gem cards with photos), a **Map page** (a feature pitch — 3 highlight cards on road layers / route options / gem alerts — plus a large CTA into the live map), a Scout Program page (an earnings table and a 5-step process diagram), a Developers page (6 business-audience cards), and a simple Pricing placeholder page. Include an auth modal (sign in / sign up / continue-as-guest tabs) as an overlay component reusable across every page.
>
> Design for a Kenyan, Nairobi-first audience — real place names (Westlands, Karen, CBD, Ngong Road) are fine as sample content, and M-Pesa is the expected payment reference point for the Scout earnings screens.

---

## 7. Suggested order to actually generate this in Figma

Generating "the whole platform" in one shot tends to produce shallow results. Better order:

1. Run the prompt above once to get the **design system in both themes + the Map screen** (the actual gap), in dark first (it's the existing default) then light. If the tool lets you scope a first pass, prioritize the token set and screen 1.
2. Then screen-by-screen: Home → Gems → Routes → Profile (all three role variants) → Scout tool → Admin console — dark and light for each before moving on, so theme parity doesn't get dropped halfway through.
3. Marketing pages last — they're mostly already built and working, so this is closer to a re-skin than new design.

## 8. Open decisions this brief doesn't settle

- **Final accent color and heading font** (§1) — pick one from each pair; I didn't choose for you.
- **Default theme and switching behavior:** does the app default to dark (matching today), to the OS/browser's `prefers-color-scheme`, or ask on first launch? The toggle in Settings should probably override whatever the default is and persist per device.
- **Light-theme exact values:** I gave direction, not final hex values (§1) — that's genuinely a design decision, not something to reverse-engineer from the dark theme mechanically.
- **Map provider chrome:** once Google Maps is wired in, its default UI (native markers, info windows) will need restyling to match this system, in both themes — flag that to whoever builds it.
- **Mobile marketing nav:** there's currently no mobile menu (nav links just disappear under 980px) — worth designing one while this file's already open.
