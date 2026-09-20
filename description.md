# PathIQ Navigators

> Navigate Kenya with the road intelligence that general-purpose maps don't have.

PathIQ Navigators is a navigation and geographic-data platform for Kenya. It combines real road conditions, traffic intelligence and community-verified places to help drivers choose better routes and discover more along the way. It starts in Nairobi and plans to expand nationally.

It has three parts:

1. **A driver app:** route intelligence, road conditions and Hidden Gems with proactive suggestions.
2. **A Scout Program:** paid contributors who keep the data accurate.
3. **A data platform:** an API and business products built on the same data.

---

## 1. The problem

Map apps optimise for time and distance. On Kenyan roads that misses a lot:

- Potholes, flooding, construction and poor road surface change which route is actually best.
- Two 20-minute routes are not equal in quality, reliability or safety.
- The best local places are often unlisted or unverified, and drivers drive past them.

---

## 2. The driver app

### 2.1 Route intelligence
Every route is scored on road quality, traffic, distance, incidents and historical reliability. The app then recommends the route that makes sense for the journey.

| Option | What it optimises |
|---|---|
| **Recommended** | The best balance of time and road quality |
| **Fastest** | The shortest journey time, even on worse roads |
| **Best Road** | The best surface and reliability, even if it is longer |

Each option shows its time, distance and score bars, for example road quality 92, traffic 78 and incidents 96.

### 2.2 Road conditions
An aggregated road-intelligence layer built from Scouts on the ground, connected vehicles, satellite imagery and community reports:

| Layer | Description |
|---|---|
| Potholes | Reported and verified by Scouts and sensors |
| Flooding | Real-time flood zone detection and alerts |
| Construction | Active sites and detours |
| Road surface | Surface quality reports |
| Traffic | Real-time congestion and speed data |
| Incidents | Accidents, breakdowns and road closures |

Insights come with a confidence level and provenance tags (AI-assisted, Scout-verified, Live data). An example: *"3.2 km of Ngong Road between Kilimani and Karen has poor surface conditions. Two pothole clusters reported in the last 24 hours. Confidence: 94%."*

### 2.3 Hidden Gems
Verified places of interest along or near your route:

| Category | Examples |
|---|---|
| Attractions | Museums, wildlife centres, markets, waterfalls, cultural sites |
| Hotels | Hotels, lodges, places to stay |
| Food | Local restaurants and cafés |
| Scenic | Viewpoints, forests, trails |
| Fuel | 24-hour, well-lit stations |
| Facilities | Clean washrooms, practical stops |

Each gem shows its category, rating, a short note (for example "Famous tilapia. Cash only."), distance or detour, and a **Scout Verified** badge. Gems can be filtered by category.

#### Suggestion system
The app watches your position and route and tells you about gems at two moments:

1. **Approaching:** a gem within a set radius of the route ahead is suggested early enough to act on, with the detour cost. For example: "Ngong Hills viewpoint, 2.1 km detour."
2. **Just passed:** the app tells you when you drive past a gem, so you can turn back or save it.

Rules:
- Suggestions follow the planned route and the distance to the gem, so a gem on a parallel road isn't suggested by mistake.
- They can be filtered by category and by the detour you're willing to make.
- Alerts are short, glanceable or voiced, and never ask for interaction while driving.
- A gem is suggested once per trip.

### 2.4 Driver profile
- **IQ Score:** a score based on the last 30 days of driving.
- Trips this month and gems found.
- Settings: push notifications and dark mode.

### 2.5 App screens
| Screen | Purpose |
|---|---|
| Home | IQ score, stats, active route, nearby incidents, gems on usual routes |
| Map | Live map with routes, conditions and gems |
| Routes | Compare and choose route options, start navigation |
| Gems | Browse and filter Hidden Gems |
| Profile | Account, stats and settings |

---

## 3. The Scout Program

Scouts are paid contributors who verify roads, discover local places and keep the data current. They earn via **M-Pesa** for every approved task.

**Workflow**
1. **Receive task:** a nearby verification task with a GPS location.
2. **Field visit:** the Scout travels there and captures photos and GPS.
3. **AI validation:** AI analyses the photos and pre-fills the condition data.
4. **Submission:** the Scout reviews and submits the verified report.
5. **M-Pesa payment:** approved submissions are paid directly.

**Example earnings**
| Task | Pay |
|---|---|
| Road condition report | KSh 150 |
| Place verification | KSh 200 |
| Hidden Gem discovery | KSh 350 |
| Flood zone survey | KSh 500 |

Scouts also need a portal, earnings tracking, training and a community. The site's footer lists all four.

---

## 4. Data platform and business

The same data is offered through a developer API and to organisations:

| Audience | Use |
|---|---|
| Logistics | Route optimisation for delivery fleets |
| Matatu SACCOs | Real-time route intelligence for operators |
| County governments | Road condition monitoring and budget planning |
| Developers | Location apps with Kenya-specific data |
| Travel platforms | Enrich booking flows with local place data |
| Fleet management | Driver safety scoring and route analytics |

---

### Pricing model

| Stage | Model |
|---|---|
| **MVP** | Free for drivers. No pricing section. The goal is to prove the gem-suggestion idea and collect data |
| **After the MVP** | **Freemium** for drivers: free navigation and Hidden Gems, with a paid tier for advanced route intelligence and other extras. Gem partnerships (businesses paying to be featured, clearly labelled) may be added |
| **Later** | API usage tiers and business contracts, once the data is solid |

> **TODO:** Decide exactly which features are free and which are paid, and the price. The site's nav and footer still link to a Pricing section that doesn't exist. Add it when the paid tier launches.

---

## 5. Roadmap

| Item | Description | Timing |
|---|---|---|
| County Road Intelligence | Data platform for counties to monitor, budget and plan road maintenance | Pilot 2026 |
| Matatu SACCO Intelligence | Route optimisation, occupancy tracking and passenger safety scoring | Coming 2027 |
| PathIQ Mobile | Native iOS and Android app | Q2 2027 |

---

## 6. Website structure

The marketing site (`/`) is a single page with these sections, in order:

1. **Nav:** Product, Route Intelligence, Hidden Gems, Scout Program, API, Business, Pricing, plus Sign in and "Open PathIQ Navigators".
2. **Hero:** the headline, two calls to action (Explore PathIQ Navigators, Become a Scout), key stats and a map with a recommended-route card.
3. **Road conditions:** the six condition layers and an example insight.
4. **Route intelligence:** the three route options.
5. **Hidden Gems:** gem cards and an "Explore all" call to action.
6. **Scout Program:** earnings examples and the five-step workflow.
7. **Data platform:** API and documentation calls to action, and the six business audiences.
8. **Roadmap.**
9. **Footer:** Product, Scouts, Developers and Company columns, and legal links.

Sign-in and sign-up happen in a modal.

---

## 7. Current state

A front-end prototype built with React 19, Vite, React Router and lucide-react.

**Built**
- The marketing landing page and the auth modal (UI only).
- The app shell at `/app` with Home, Routes, Gems and Profile screens, using mock data (`src/data/mockData.js`).

**Not built yet**
- The suggestion system.
- The map (`MapPage` is a placeholder) and location tracking.
- Real authentication and a backend.
- Scout tooling, payments and the API.
- Pages the site links to: Pricing (launches with the paid tier, see section 4), the Scout Portal, docs and legal pages.

**Placeholders to replace before launch**
- The landing-page stats (42K+ drivers, 18K+ places, 1,284 Scouts, 1.8M routes) and the "Now live in Nairobi" pill are marketing placeholders. Replace them with real numbers.
- The gem photos are Unsplash images.

---

## 8. Getting started

```bash
npm install
npm run dev      # start the dev server
npm run build    # production build
npm run lint
```
