# Map styling

How the PathIQ map gets its look, and how to change it: colours, what Google shows, how our own markers and route lines are drawn, and how to add a new layer of PathIQ data.

**The short version:** Google supplies the streets. Everything that makes the map PathIQ's is in our code:

| What | Where |
|---|---|
| Base-map colours, and which Google features are hidden | `src/lib/mapStyle.js` |
| Creating a map with that style | `createPathiqMap()` in `src/lib/googleMaps.js` |
| Our markers (gems, road reports, you, destination) | colours + glyphs in `src/lib/placeStyles.js`, pin components in `src/components/PlaceIcons.jsx`, shapes in `src/App.css` (`.pin-gem`, `.pin-report`), placed by `HtmlMarker` in `src/lib/googleMaps.js` |
| Route line colours, traffic shading, direction arrows, road-report dots, turn icons | constants at the top of `src/pages/MapPage.jsx`; turn icons in `src/components/ManeuverIcon.jsx` |
| Layer switcher (Gems / Road reports / Traffic) | `layers` state in `src/pages/MapPage.jsx` |

---

## 1. How it fits together

```
┌───────────────────────────────────────────────┐
│  PathIQ layers   gems · road reports · you ·   │  ← our data (Supabase), our markers
│                  routes · painted hazards      │
├───────────────────────────────────────────────┤
│  Base map        streets, water, parks, labels │  ← Google tiles, coloured by mapStyle.js
└───────────────────────────────────────────────┘
```

- The **base map** is Google's. Its colours and visibility are controlled by a list of **JSON style rules** in `src/lib/mapStyle.js`: one list for dark mode, one for light, plus a shared "declutter" list that hides Google's own places (shops, hospitals, bus stops…).
- The **PathIQ layers** are drawn by us on top: HTML markers for points, `google.maps.Polyline` for lines. They use our CSS and our colours, so they always stand out against the muted base map.

Every map in the app is created through `createPathiqMap(api, element, options)`, so a change to `mapStyle.js` applies everywhere.

---

## 2. Anatomy of a style rule

Each rule picks some map features and says how to draw them:

```js
{ featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#2C413C' }] }
```

| Part | Meaning | Examples |
|---|---|---|
| `featureType` | *What* on the map. Leave it out to mean everything. | `road`, `road.highway`, `road.arterial`, `road.local`, `water`, `poi`, `poi.park`, `poi.business`, `poi.medical`, `transit`, `transit.station`, `administrative.locality`, `landscape.man_made` |
| `elementType` | *Which part* of it. Leave it out to mean all parts. | `geometry` (fill + stroke), `geometry.fill`, `geometry.stroke`, `labels`, `labels.text.fill`, `labels.text.stroke`, `labels.icon` |
| `stylers` | *How* to draw it | `{ color: '#hex' }`, `{ visibility: 'off' \| 'on' \| 'simplified' }`, `{ lightness: -20 }`, `{ saturation: -100 }`, `{ weight: 2 }` |

Rules are applied **in order, later ones win**. That's why the declutter list is added *after* the colour list: it can switch things off whatever colour they were given.

Full reference: <https://developers.google.com/maps/documentation/javascript/style-reference>

---

## 3. Recipes

### Change a colour

Find the rule in the `DARK` (and/or `LIGHT`) list and edit the hex. The colours mirror the design tokens in `src/index.css`:

| Map element | Dark | Light | Token it follows |
|---|---|---|---|
| Land / background | `#0A1512` | `#F4F7F6` | `--card` / `--background` |
| Local roads | `#1A2724` | `#FFFFFF` | between `--card` and `--secondary` |
| Highways | `#2C413C` | `#E3ECE9` | a step lighter than roads |
| Parks | `#0E2A21` | `#DCEFE8` | a tint of `--primary` |
| Water | `#06212B` | `#CFE3EA` | a blue close to `--background` |
| Labels | `#7A8C88` | `#5F706C` | `--muted-foreground` |

CSS variables can't reach inside the map canvas, so these are real hex values. **If you change a token in `index.css`, update the matching hex here too.**

Keep the base map *quiet*: low contrast, low saturation. Our markers and route lines are what should stand out.

### Show a kind of Google place again

Everything under `poi` is hidden by the first `DECLUTTER` rule. To bring one category back, add a rule *after* it that turns that category on:

```js
// in DECLUTTER, after { featureType: 'poi', stylers: [{ visibility: 'off' }] }
{ featureType: 'poi.medical', stylers: [{ visibility: 'on' }] },   // hospitals, clinics
```

Other categories: `poi.attraction`, `poi.business`, `poi.government`, `poi.place_of_worship`, `poi.school`, `poi.sports_complex`, `poi.park`.

Think twice before showing `poi.business`. It's what made the map look like plain Google Maps, and it competes with Hidden Gems.

### Hide or soften something else

```js
{ featureType: 'road.local', elementType: 'labels', stylers: [{ visibility: 'off' }] },    // no small-street names
{ featureType: 'road.arterial', stylers: [{ visibility: 'simplified' }] },                  // thinner, fewer details
{ featureType: 'administrative.neighborhood', stylers: [{ visibility: 'off' }] },           // no estate names
```

### Make one kind of road stand out

Useful if PathIQ ever wants to highlight, say, highways for long-distance drivers:

```js
{ featureType: 'road.highway', elementType: 'geometry.fill', stylers: [{ color: '#3E5A53' }] },
{ featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#00C9A7' }, { weight: 0.6 }] },
```

### Try a style quickly

1. `npm run dev` and open `/app/map`.
2. Edit `src/lib/mapStyle.js` and save. The page reloads with the new style.
3. Check **both themes**: Profile → Dark mode, then go back to the map. The style is picked when the map is created, so switch theme, then reopen the map.
4. Check a planned route: the route lines and the painted report stretches must still read clearly on top.

Google's Styling Wizard (<https://mapstyle.withgoogle.com>) can generate rules visually. Paste the JSON it exports into `DARK` or `LIGHT`.

---

## 4. Our own markers and lines

### Markers and icons

PathIQ's data has one icon set, used on the map **and** everywhere gems or reports are listed (search, filter chips, sheets, alerts, Home, Gems, Admin), so a category looks the same on every screen.

**Colours and glyphs:** `src/lib/placeStyles.js`

| Gem category | Colour | Glyph (lucide) |
|---|---|---|
| Attractions | pink `#EC4899` | `Landmark` |
| Hotels | blue `#3B82F6` | `BedDouble` |
| Food | orange `#F97316` | `UtensilsCrossed` |
| Scenic | green `#22C55E` | `Mountain` |
| Fuel | yellow `#EAB308` | `Fuel` |
| Facilities | purple `#8B5CF6` | `Toilet` |

| Report type | Glyph | Colour |
|---|---|---|
| Pothole | `ArrowDownToDot` | by severity: red (4–5), amber (3), blue (1–2) |
| Flooding | `Waves` | 〃 |
| Construction | `Construction` | 〃 |
| Rough surface | `Activity` | 〃 |
| Accident / incident | `Siren` | 〃 |

To add a category: add it to the database enum, then one line in `GEM_STYLE`. Pick a colour that isn't already used and that reads on both map themes. Avoid teal (that's the route and your location).

**Components:** `src/components/PlaceIcons.jsx`

| Component | Used for | Looks like |
|---|---|---|
| `GemPin` | gem on the map | teardrop in the category colour, white glyph, tip on the location. Amber glow when on the selected route, bookmark badge when saved, bigger when selected |
| `ReportPin` | report on the map | diamond in the severity colour, white glyph, centred on the location |
| `GemBadge` / `ReportBadge` | lists, sheets, alerts | tinted rounded tile with the coloured glyph |
| `GemGlyph` | filter chips | the glyph alone, in the category colour |

Gems are teardrops and reports are diamonds, so you can tell them apart even when colours are similar.

**Other markers** (CSS only): `.map-user-dot` for you (teal dot with a halo), and `.map-pin-destination` for the destination or dropped pin (teal teardrop).

**How they're placed:** `HtmlMarker` (in `googleMaps.js`) puts any DOM element on the map with its top-left corner on the point. Each shape then uses `transform` to put its tip (`.pin-gem`, `.map-pin-destination`) or centre (`.pin-report`, `.map-user-dot`) on the point. **Keep that transform** if you restyle a marker, or it will sit off its location. `MapPage` renders the React pins into these elements with `createRoot`.

### Route lines

The selected route is drawn in layers, bottom to top:

| Layer | Looks like | Data |
|---|---|---|
| Base line | solid teal (`ROUTE_COLOR`); alternatives grey (`ALT_ROUTE_COLOR`), tap to select | the route polyline |
| Traffic | solid **amber** where slow, **red** where jammed (`TRAFFIC_COLOR`), like Google Maps | `traffic` intervals from the `routes` function (Google's `TRAFFIC_ON_POLYLINE`) |
| Road reports | **dotted** stretch in the report's severity colour (`SEVERITY_COLOR`), `REPORT_STRETCH_M` either side | `hazards` from the `routes` function |
| Direction arrows | small dark chevrons every 80 px along the line | — |
| Turn icons | white discs with the manoeuvre arrow at each turn, shown from zoom `MANEUVER_MIN_ZOOM` (15) | route `steps` |

Reports are **dotted** and traffic is **solid** on purpose: both use amber and red, and the pattern is what tells them apart. The route panel shows a legend for this.

Traffic shading costs extra: Google bills requests with traffic-on-polyline at its higher "Advanced" rate. Set the Supabase secret `ROUTES_TRAFFIC_ON_POLYLINE=false` to turn it off (routes then draw plain teal).

Only reports that still matter are painted (see `isStillRelevant` in `supabase/functions/_shared/scoring.ts`), so an old accident isn't.

**A gotcha with arrows and dots:** they're `icons` on a polyline whose own stroke is invisible (`strokeOpacity: 0`). Symbols inherit the line's opacity unless they set their own, so every symbol must set `strokeOpacity` (and `fillOpacity` if filled), or it won't show.

---

## 5. Adding a new layer of PathIQ data

Gems and road reports both follow the same pattern. For a new kind of data, say fuel prices or flood zones:

1. **Database:** a table with a `geography` column, RLS policies, and a "near point" function returning `lat`/`lng` (copy `gems_near_point` in `supabase/migrations/`). Add checks to `supabase/tests/security.test.mjs`.
2. **Fetch:** a function in `src/lib/` that calls it (like `fetchNearbyGems`).
3. **State:** load it in `MapPage` alongside gems and incidents (`fetchAround`).
4. **Draw it:**
   - Points: add them in the markers effect with `new api.HtmlMarker({ map, position, content, zIndex })`, using a new CSS class.
   - Lines or areas: `new api.Polyline(...)` / `new api.Polygon(...)` in their own effect. Return a cleanup that calls `setMap(null)`.
5. **Toggle:** add a key to the `layers` state and a button in `.map-layers`.
6. **Details on tap:** reuse the bottom sheet (`selected` state) as gems and reports do.

---

## 6. When to switch to Cloud-based styling

Google also lets you style a map in Cloud Console and attach it to a **Map ID**. We don't do that today, for two reasons:

- It needs access to the Google Cloud project, which PathIQ doesn't manage yet.
- A style in code is versioned in git, reviewed in pull requests, and changes with the app.

**The catch:** JSON styles and a Map ID can't be used together. Some features only work on Map ID (vector) maps:

- tilt and rotation, e.g. a **heading-up camera** during navigation;
- Advanced Markers (we don't need them, because `HtmlMarker` does the job);
- smoother zooming and some newer map features.

If PathIQ wants those:

1. In Cloud Console → Google Maps Platform → Map Styles, create a style and recreate the rules from `mapStyle.js`. The editor has the same feature and element names. Make one style for dark and one for light.
2. Create a **JavaScript vector** Map ID and attach the style to it.
3. In `createPathiqMap`, replace `styles` / `backgroundColor` with `mapId: '<your id>'` and `colorScheme: currentTheme() === 'light' ? 'LIGHT' : 'DARK'`.
4. `HtmlMarker` keeps working unchanged.
5. Keep `mapStyle.js` in the repo as the record of the intended look, or delete it once the Cloud style is the source of truth.

---

## 7. Rules to keep

- **Don't hide Google's logo, the "Map data ©" line or the Terms link.** Google's terms require them to stay visible.
- **One place for colours:** if a colour means something in the app (primary, severity), use the same hex on the map as the token in `index.css`.
- **Quiet base, loud data:** if a style change makes streets or labels compete with gems, reports or routes, it's the wrong direction.
