# Land Use & Building Footprint Detection — Demo

An interactive, zero-build **MapLibre GL** dashboard for **Geospatial AI Sdn Bhd**,
an Uzma Group company. The demo visualises AI-extracted building footprints and
land-use classification over **Seremban, Negeri Sembilan**, served entirely as
static files and themed with the Uzma brand palette
(`#E8772E` orange · `#1E2C44` navy · `#F5F5F7` canvas).

Live demo: https://buildvision.uzmadigitalearth.app/login/

Part of the Geospatial AI showcase — https://showcase.uzmadigitalearth.app/

Designed as an **Enterprise GIS / modern SaaS dashboard** with glass surfaces,
3D terrain and buildings, a proprietary **UZMA-sat** satellite basemap, and
one-click PDF/CSV reporting.

---

## Tech stack

- **Vanilla HTML/CSS/JS** — no build step, no bundler, no framework
- **MapLibre GL JS 4.7** — WebGL map engine, 3D terrain & extrusions
- **PMTiles 3.0** — single-file raster tile archive for the UZMA-sat basemap
- **GeoJSON** — parcel geometry + land-use attributes (`serembangeo.geojsonn`)
- **html2canvas + jsPDF** — client-side map snapshot & PDF report export
- **Google / OSM raster tiles** — road, satellite and hybrid basemaps
- **AWS Terrarium DEM** — elevation tiles for 3D terrain

Everything runs in the browser. There is no server, database or API key.

---

## Folder structure

```
building_footprint_demo/
├── index.html               # the entire dashboard (markup + styles + app logic)
├── login/index.html         # gated sign-in page, served at /login/
├── compare/index.html       # before/after swipe page, served at /compare/
├── login.html, compare.html # redirects from the old addresses
├── uzma.js                  # POI / gazetteer + reference datasets
├── mpk.js, mpk.css          # MPK Kemaman mode: data, layers, panel, Statistics page
├── mpk-change.js            # MPK change detection (before / after imagery)
├── mpk-report.js            # MPK PDF report (English / Bahasa Melayu)
├── mpk-features.js          # MPK Features page: tools 1–10
├── mpk-gesture.js           # MPK Features: tool 11, gesture control (camera + voice)
├── mpk-features2.js         # MPK Features: tools 12–15
├── mpk/                     # MPK data (buildings, lots, boundary, corridors, imagery indexes)
├── tools/                   # data builders (Python) and logic tests (Node)
├── uzma-dashboard.css       # legacy standalone stylesheet
├── GeoAILogo.png            # brand mark
├── serembangeo.geojsonn     # Seremban parcels — geometry + land-use classes
├── seremban_final/          # XYZ raster tile pyramid (z0–z14) fallback
│   └── {z}/{x}/{y}.png
└── 0/                       # blank-tile placeholder
```

> `.gitattributes` routes `*.pmtiles` through Git LFS. The production UZMA-sat
> archive is **not** committed — it is fetched from S3 at runtime (see below).

---

## Local development

No install, no build — just serve the folder over HTTP so `fetch()` and WebGL
can load the local GeoJSON and tiles.

```bash
# Python (any 3.x)
python -m http.server 8000

# or Node
npx serve .
```

Then open http://localhost:8000/login/

> Opening `index.html` directly via `file://` will fail — browsers block
> `fetch()` on the local GeoJSON under the file protocol.

### Sign in

The demo is gated by a single account. The email is
`geospatial.ai@uzmagroup.com`; the password is **not** published here — ask one
of the contacts in the sign-in page's support modal.

`login/index.html` stores a salted SHA-256 digest of the password rather than the
plaintext, so neither the page source nor this repository contains it.

> **This is obfuscation, not security.** The check runs in the browser, so it is
> bypassable no matter how the password is stored — setting the session flag by
> hand in the console is enough to reach the dashboard. It keeps the demo tidy
> for a public showcase; it is **not** an access-control boundary. Nothing
> confidential should sit behind it. Real gating needs a server-side session or
> an edge policy (Cloudflare Access, Netlify/Vercel password protection).

**Rotating the password.** Either recompute the digest and commit it:

```bash
printf '%s' 'uzma-geoai::NEW_PASSWORD' | sha256sum
# paste the hex into PASS_HASH in login/index.html
```

…or set a `DEMO_PASSWORD` repository secret;
`.github/workflows/deploy.yml` injects the digest at deploy time so the
plaintext never enters the repo (see *Deployment*).

---

## Features

| # | Feature            | Entry point           | What it does                                             |
|---|--------------------|-----------------------|----------------------------------------------------------|
| 1 | Parcel map         | `initMap()`           | Click any lot for attributes, area and land-use class     |
| 2 | Stat cards         | `#stats-row`          | Live totals — lots, housing, village, commercial, markers |
| 3 | Layer catalogue    | `toggleGeoCat()`      | Buildings, land use, transport, admin, utilities, places  |
| 4 | Basemap switcher   | `BASEMAPS`            | Google road / satellite / hybrid, OSM, **UZMA-sat**       |
| 5 | 3D view            | `applyTerrain()`      | Terrain exaggeration + OSM building extrusions            |
| 6 | Search             | `#search-input`       | Address, sub-district and lot number lookup               |
| 7 | Select by area     | `openAreaModal()`     | Draw a box / polygon to batch-select parcels              |
| 8 | Upload GeoJSON     | `openUploadModal()`   | Drop in your own parcel layer                             |
| 9 | Export             | `openExportModal()`   | PDF report with map snapshot, or CSV attribute dump       |
| 10| Lot list & history | `openLotListModal()`  | Tabular parcel browser + activity log                     |

---

## MPK Kemaman mode — suspected illegal construction

A mockup for Majlis Perbandaran Kemaman. Pick **MPK Kemaman** in the topbar area
switcher: every Seremban control is hidden and only MPK content is shown.

Three study areas from MPK, selectable as chips in the **Illegal Construction** panel tab:

| Area | Flagged as suspected |
|---|---|
| Kawasan Industri Teluk Kalong | the buildings flagged `is_mockup` in the [building API](https://digitalearthgeojson.s3.ap-southeast-5.amazonaws.com/kemaman_buildings_industri_filled.geojson) (49 buildings) — the MPK mockup list |
| Koridor Bandar Putra – Berenjut | buildings within the road-reserve slider (3–20 m) of the road centreline |
| Koridor Binjai – Bandar Chukai | same as above |

The panel shows counts per type, suspected area, a revenue estimate (processing fee +
Cukai Pintu, editable assumption rates saved in the browser), the 50 largest suspected
buildings (click to zoom) and a CSV export. Labels always say "Suspected" — results need
site verification. "No cadastral lot" is only judged inside the boundary, where the lot
data is meant to be complete; a gap in the NDCDB extract will show up as a false flag.

**Historical imagery**: in MPK mode the basemap menu (next to Google Maps / Satellite /
Hybrid) lists Esri Wayback, Sentinel-2 and Landsat, each on its own — images from different
satellites are never mixed. The basemap button shows the satellite and image date, and the
controls under the list offer what that archive supports:

| Basemap | Views | Resolution | Since |
|---|---|---|---|
| Esri (World Imagery Wayback) | By image — each distinct capture | ~30 cm, buildings visible | 2007 (TK) / 2011 |
| Sentinel-2 | By year · By month (pick a year) | 10 m | 2016 |
| Landsat 5/7/8/9 | By year · By month (pick a year) | 30 m | 2000 |

For Sentinel-2 and Landsat each month (and each year) shows the least-cloudy scene, with
cloud measured over the study area itself (Sentinel-2 SCL, Landsat QA_PIXEL), not the
whole satellite tile. Striped Landsat 7 images (after May 2003) are used only when no
other Landsat scene is reasonably clear. No other free imagery source can be shown in
the browser; Planet NICFI monthly mosaics would need an API key.

**Change detection** (panel card): pick one satellite, a *Before* and an *After* date, and
tick one or more things to detect (each becomes its own coloured layer with a show/hide
checkbox, and the same layers appear on the Compare page) — *New buildings* (footprints on land that was green before and is built
now, judged per footprint), *New built-up* (vegetation → hard surface), *Land cleared*
(vegetation → bare) or *Vegetation gain* — then **Generate**. *Land cleared* and *Vegetation gain* are drawn as a
smooth heatmap of the NDVI change (darker = stronger change), not as solid pixels.
For Sentinel-2 and Landsat the Before / After image can be shown as a classed **NDVI map of
the whole area** (blue water or metal roof, red built-up / bare, orange-yellow grass, greens
for vegetation up to forest) with its legend; it switches on by itself for vegetation analyses,
and the Compare page has the same switch plus a legend over the map. Esri photos have no
near-infrared band, so NDVI is not offered for them. A switch hides the result to
show the regular basemap, and **Compare ↗** opens `/compare/` in a new tab: a swipe
slider with Before on the left and After on the right (Google Satellite underneath). Index maps (NDVI, NDBI) for the area are
fetched from Planetary Computer at native resolution, clouds masked (Sentinel-2 SCL +
bright-blue test, Landsat bright-blue test), compared pixel by pixel in the browser and drawn
on the map, with the changed area in hectares and the building footprints standing on
changed pixels (suspected ones flagged). Esri photos have no infrared band, so for Esri
*New buildings* only catches buildings on formerly green land and *New built-up* is not offered.
Esri comparisons use an excess-green index made comparable across years: each Esri image is a
mosaic of several capture dates, so pixels are grouped by their before/after capture-date pair
(from the release's metadata service); each group is colour-matched (histogram matching) and
thresholded (Otsu) on its own, areas showing the same capture in both are skipped, and
clouds (+30 m margin), water and specks under ~5 m are left out. At 10–30 m "new built-up" means new hard surface,
not individual houses. Logic in `mpk-change.js`, tests in `tools/test_mpk_change.js`.

**Search** (topbar, MPK mode): study areas, cadastral lot no. / UPI, building Plus Codes,
place names in Kemaman via OpenStreetMap Nominatim, and coordinates — decimal degrees in
either order (`4.2681, 103.452`) or degrees-minutes(-seconds) with N/S/E/W
(`4°16'05"N 103°27'07"E`); a pin marks the point.

**Layout (MPK mode)** — kept deliberately simple:
- *Dashboard* (sidebar): the map plus a panel with two tabs. **Overview** has the area chips,
  three headline numbers (buildings, % legal, % suspected illegal), one row per status with its
  count, share, footprint and a show/hide switch, a switch for the **m² label on every
  building** (from zoom 16.5), and the largest suspected buildings. **Analysis** holds land use,
  reference layers, the road-reserve slider, change detection and the revenue estimate.
- *Statistics* (sidebar, under Dashboard): a full page with headline cards, a legal-vs-illegal
  donut with counts / shares / m², building-size classes split by status, a per-area table,
  the largest buildings (each with *View* on the map) and an *Export CSV* of every building
  with its status and size.
- *Export PDF* (top bar in MPK mode, or *Export PDF report* on Statistics): asks for the language
  (**English** or **Bahasa Melayu**, last choice remembered), then builds an A4 council-style
  report for the selected area: particulars, summary, location map, breakdown by area and size,
  the list of suspected buildings, notes and blank Prepared / Checked / Approved blocks. It is
  marked **DRAFT · FOR REVIEW** with a system ID (`BV-YYYYMMDD-HHMM`) and carries no MPK logo,
  seal or official reference number (`mpk-report.js`, tests in `tools/test_mpk_report.js`).
- *Features* (sidebar, under Statistics): fifteen live tools on the MPK data, each opening a
  floating panel on the map. See [MPK Features](#mpk-features--the-15-tools) below.
- Only the **marked areas** are loaded: Teluk Kalong buildings inside the planning boundary and
  buildings within the two road corridors (6,225 buildings). Status colours (red / teal / light
  grey) were checked for colour-blind separation.

**Building status** — every building is shown in one of three statuses, each with its own
map layer, switch and count (with a share bar) in the panel:
*Suspected illegal* (red: the API suspect list in Teluk Kalong, road-reserve encroachment in
the corridors), *Legal · on approved lot* (green: stands on an MPK-approved lot) and
*Not verified* (grey: no approval record to confirm either way). Popups are coloured and
worded by status.

**Land use** (Map layers → *Land use · Kemaman (OSM)*): OpenStreetMap `landuse=*` polygons
for the whole Kemaman district (367 zones: industrial, residential, commercial, institutional,
recreation, agriculture, forest, water, under development) plus the district boundary. Click a
zone for its class and name; building popups show the zone they stand in. This is
community-mapped and incomplete — not the official RTD zoning (PLANMalaysia i-Plan
`gunatanah_zoning_terengganu`), which should replace `mpk/landuse.geojson` when MPK provides it.
No open dataset of actual illegal-construction cases exists for Terengganu; those records sit
with each council.

**Data** (`mpk/`, code in `mpk.js` / `mpk.css`):

- `tk_sempadan.geojson`, `tk_lot_lulus.geojson` — Teluk Kalong boundary and approved lots,
  digitised from MPK's map by `tools/vectorize_teluk_kalong.py` (georeferenced from the
  coordinates printed on the map; ~6 px ≈ 60 m mean residual)
- `koridor_jalan.geojson` — MPK's corridor points snapped to OpenStreetMap centrelines
- `lot_kadaster.geojson` — NDCDB cadastral lots ([source](https://digitalearthgeojson.s3.ap-southeast-5.amazonaws.com/building/lots_sempadan_industri_kemaman.geojson)); each building carries the `lot` / `upi` it stands on
- `mpk_buildings.geojson` — Google Open Buildings v3, classified per area, plus the API's `is_mockup` buildings (kategori `mockup`) for Teluk Kalong
- `landuse.geojson` — OSM land-use zones + district boundary for Kemaman, built by `tools/build_landuse.py`
- `wayback.json` — distinct Esri Wayback images per area, built by `tools/build_wayback.py`
- `sentinel.json` — least-cloudy Sentinel-2 scene per area and month, built by `tools/build_sentinel.py`
- `landsat.json` — least-cloudy Landsat scene per area and month, built by `tools/build_landsat.py`

**Regenerate:**

```bash
python tools/vectorize_teluk_kalong.py path/to/teluk_kalong_map.png   # numpy, scipy, scikit-image, Pillow
python tools/build_mpk_illegal.py                                      # stdlib; streams ~980 MB + Overpass
python tools/build_landuse.py                                          # stdlib; OSM land use for Kemaman (Overpass)
python tools/build_wayback.py                                          # stdlib; queries ~200 Esri releases (~10 min)
python tools/build_sentinel.py                                         # stdlib; cloud check on ~2,300 scenes (~20 min)
python tools/build_landsat.py                                          # stdlib; cloud check on ~3,000 Landsat scenes
node tools/test_mpk_logic.js                                           # pure-logic tests
node tools/test_mpk_change.js && node tools/test_mpk_report.js         # change detection, PDF report
node tools/test_mpk_features.js && node tools/test_mpk_gesture.js      # Features tools, gesture control
node tools/test_mpk_features2.js                                       # Features tools 12–15
```

The MPK source map image is client material and is not committed.

---

## MPK Features — the 15 tools

Open **MPK Kemaman** mode, then **Features** in the sidebar (under Statistics). Each card has a
**Launch** button; the tool runs on the map with a floating panel and its own layers, and
closing the panel (✕, or opening another tool or page) removes everything it added. All tools
work on the area chosen with the chips (All / Teluk Kalong / corridors) and on the real
buildings, lots and imagery, nothing is pre-recorded. **Start booth mode** (top of the page)
runs the Drone Tour on a loop for an exhibition screen.

Shared definitions used by several tools:
- *Suspected building*: on MPK's suspect list (Teluk Kalong) or inside the road reserve
  (corridors), as on the dashboard.
- *Hotspot*: a cluster of at least 4 suspected buildings, each within 150 m of another
  (DBSCAN on building centres).
- *Priority score* (0–100): size 45% (log scale, 10 m² → 0, 5,000 m² → full) + evidence 25%
  (on MPK's list = full; road reserve = 40% at the reserve edge up to full on the centreline)
  + AI confidence 15% + inside a hotspot 15%.

| # | Tool | What it does | How to use it | How it works |
|---|---|---|---|---|
| 1 | **Drone Tour** | Raises every building into 3D (red suspected, teal legal, grey not verified) and flies the camera to the 8 highest-priority cases, orbiting each with its Plus Code, size, lot and reason on screen. | Launch, then watch. *Fly again* or *Loop for booth* at the end. Touching the map stops it. | Extrusion heights animate from 0; MapLibre `flyTo` / `easeTo` with pitch and bearing; the stops come from the priority score. |
| 2 | **Radar Sweep** | Darkens the map, draws radar rings and sweeps a beam round the area; each suspected building lights up as the beam passes, with a live counter of buildings and m². | Launch; *Scan again* after one turn (9 s). | Each building's compass bearing from the area centre; the beam is redrawn every frame and a filter shows buildings whose bearing the beam has passed. |
| 3 | **Hotspot Finder** | Finds clusters of suspected buildings, draws a zone round each (H1, H2, …) and lists them by size with area, count and m². | Launch; click a hotspot in the list to zoom to it. | DBSCAN (150 m, 4 buildings) on building centres; convex hull pushed out 30 m. |
| 4 | **Priority Score** | Recolours suspected buildings from yellow (low) to dark red (urgent) and lists the top 10 with a bar showing what makes up each score. | Launch; click a building in the list to zoom and open its popup. | The score above; the bar splits it into size / evidence / confidence / hotspot. |
| 5 | **Smart Inspection Route** | Plans a field-visit route through the 8 highest-priority cases on real roads, with numbered stops, total km and drive time. | Launch; *Open in Google Maps* sends the route (stops in order) to a phone or laptop. | OSRM public router (`router.project-osrm.org`, OpenStreetMap roads) solves the visiting order and the road geometry. If it is unreachable, a nearest-neighbour + 2-opt order on straight lines is used (distance × 1.3, 30 km/h) and the panel says so. |
| 6 | **Ask the Map** | Answers questions about the buildings in English or Malay, highlights the matching buildings and can read the answer aloud. Can also open any other tool. | Type or press 🎙️ and speak, e.g. "How many illegal buildings in Binjai?", "Tunjuk bangunan haram lebih 1000 m²", "Largest legal building in Teluk Kalong", "lot 3020", "start the drone tour". Tick off *Speak the answer* for silence. | A small parser picks the intent (count / show / largest / lot / open a tool), area, status, size limits and lot no.; the browser's Web Speech API does the listening and speaking (Chrome / Edge). |
| 7 | **Building Passport** | A case file for one building: satellite close-up with the footprint outlined, status, Plus Code, lot / UPI, footprint, AI confidence, why it is flagged, hotspot, land use and a QR code. | Launch (opens the top case), then click any building. Scan the QR with a phone to open the spot in Google Maps. | Esri World Imagery tiles assembled round the building; QR code made in the browser (qrcodejs). |
| 8 | **Lot Coverage X-ray** | Shades each cadastral lot by how much of it is covered by buildings and lists the most densely built lots, with the median and the number of lots ≥ 60% built. | Launch; click a lot in the list to zoom to it. | Building footprint ÷ lot area (lot area computed from its polygon), buildings joined to lots on UPI. A building counts on the lot under its centre, so a building spanning several lots can exceed 100%; those lots are left out of the list. A screening aid, not an official plot-ratio check. |
| 9 | **Time Machine** | Flies to the top case and plays every historical Esri photo of it as a cross-faded time-lapse (TK: 2007, 2013, 2017, 2019, 2020, 2024, 2025) with the capture year shown large. | Launch and watch; *Replay* at the end. | Esri World Imagery Wayback releases (one per distinct capture date, from `mpk/wayback.json`), two raster layers alternating with an opacity fade. Releases before 2024 only serve tiles to z17 over Kemaman (z18 from 2024), so that level is stretched when zoomed in further. |
| 10 | **Policy Simulator** | What-if for the corridor road reserve: drag 3–20 m and the map, counts, m² and estimated processing fee update live, with a curve of suspected buildings against reserve width. | Drag the slider. *Keep this setting* keeps the new width; closing or *Reset* puts the old one back. | Recounts the road-reserve rule for each width; the dashboard's own filters are updated, so the change is real while the panel is open. |
| 11 | **Gesture Control** | Hands-free before / after comparison. The camera tracks your hand: **hold up an open hand** to open a swipe of two Esri photos, **say** the before and after years, then control it by hand. The panel shows the six steps and highlights the current one. | Follow the steps on screen: **1** allow the camera (and microphone); **2** hold an open hand 🖐 (fingers spread, palm to the camera) still for 1 second until the ring fills; **3** say the BEFORE year ("2013", "twenty thirteen", "dua ribu tiga belas") or tap a year button; **4** the same for AFTER; **5** control the swipe with one hand: **☝️ point** = move the divider, **🤏 pinch and move** = pan, **✌️ hold** = zoom in, **✊ hold** = zoom out; **6** hold an open hand for 1 second again to close (and again to compare other years). Voice during the swipe: "zoom in", "zoom out", "before 2017", "after 2024", "swap", "close" (Malay too: "zoom keluar", "sebelum 2017", "tutup"). The divider can also be dragged with the mouse or arrow keys, and *Skip: open with the mouse* bypasses the hand step. | MediaPipe Hand Landmarker (21 points per hand) runs in the browser on the camera feed; poses come from which fingers are straight (open hand = 3 or more). The open-hand trigger fires after 1 s and ignores dropped frames under 0.3 s; it re-arms when the hand is lowered. A year that has no photo uses the closest capture (the toast says which). Video never leaves the browser. A small mirrored preview shows the tracked hand and the current gesture. |
| 12 | **3D Hex Density** | Bins every building into 150 m hexagons and raises them as 3D columns that grow out of the map: height = suspected floor area in the hexagon, colour = share of its buildings that are suspected (teal 0% → dark red 100%). Lists the five tallest columns. | Launch; hover a column for its buildings, suspected count, share and m²; click a list row to fly to that column. Right-drag tilts the view. | Hexagonal binning (pointy-top, 150 m centre-to-corner) in a local metric grid with cube rounding; `fill-extrusion` heights animate from 0. |
| 13 | **Impact Radius** | A circle follows the mouse and counts, live, what lies inside: buildings, suspected buildings and their m², estimated processing fee, a status bar (red / teal / grey), the nearest suspected building and its distance. Buildings inside are outlined in yellow. | Move the mouse over the map; set the radius (100 m–1.5 km) with the slider; click to pin the circle, click again to free it. | Distance from the centre to every building's centre (local metres), recomputed each animation frame; the fee uses the rate set in Analysis. |
| 14 | **Time Lens** | Shows the latest Esri photo on the map and an older photo of the same spot inside a round lens that follows the mouse, with today's suspected buildings outlined in red, so new construction stands out at a glance. | Move the mouse; pick the lens year (2007–2024 for Teluk Kalong) and the lens size (140–520 px). | A second, non-interactive map with the old Wayback release, kept in sync with the main map and clipped to a circle at the cursor (`clip-path`). |
| 15 | **Inspection Planner** | Turns the suspected cases of the selected area into a day-by-day site-visit plan for the enforcement teams: which cases each team visits on which date, in route order, with km and estimated hours per day, and the finish date. Most urgent cases (priority score) come first; each day groups cases that lie close together. Downloads the plan as CSV (one row per visit: day, date, team, stop, Plus Code, area, lot, UPI, m², score, reason, coordinates, Google Maps link) and prints A4 checklists (one page per team-day: Visited / Building found / Notes columns and an inspector sign-off line). | Set the number of teams (1–6), visits per team per day (4–30) and the start date; the plan updates at once. Click a day to see its route on the map (numbered stops). *Print checklists* prints the picked day, or every day when none is picked. | Each day is seeded with the most urgent case left, filled with the case nearest to any already in it until full, then ordered nearest-neighbour + 2-opt. Days are handed to teams in turn. Working days skip Friday–Saturday (the Terengganu weekend); public holidays are not skipped. Time = 15 min per visit + driving at 30 km/h on straight-line distance × 1.3. |

Requirements and limits:
- Voice (tools 6 and 11) needs Chrome or Edge, microphone permission and an internet connection
  (the browser's speech service). Typing and buttons always work.
- Gesture Control needs a webcam and camera permission over HTTPS (the live site) or
  `localhost`; MediaPipe (~8 MB model) loads from jsDelivr / Google Storage the first time.
  Good, even lighting, about 1 m from the camera and one hand in view at a time work best.
- Drone Tour, Radar Sweep, Time Machine, Time Lens, Passport and Gesture Control load map imagery, so the
  booth machine needs a steady connection. Route uses the free OSRM demo server, which can be
  slow or rate-limited; the straight-line fallback keeps the tool working.

Code: `mpk-features.js` (tools 1–10), `mpk-gesture.js` (tool 11) and `mpk-features2.js` (tools 12–15), styles in `mpk.css`.
Pure logic (geometry, DBSCAN, priority score, route order, lot coverage, policy curve, time-lapse
frames, the question parser, hand poses, the open-hand hold trigger, spoken-year parsing, voice commands, hexagon
binning, radius counts, the inspection schedule) is exported and tested by `tools/test_mpk_features.js`,
`tools/test_mpk_gesture.js` and `tools/test_mpk_features2.js`.

---

## UZMA-sat basemap

`UZMA-sat` is a proprietary UZMA Berhad satellite mosaic published as a single
PMTiles archive and streamed directly from S3:

```
https://digitalearthbasemap.s3.ap-southeast-1.amazonaws.com/seremban.pmtiles
```

| Property   | Value                                               |
|------------|-----------------------------------------------------|
| Format     | PMTiles v3, raster (PNG), 256 px                     |
| Zoom range | 8 – 17 (capped to avoid upscaled blur)               |
| Bounds     | `101.8777, 2.6743 → 101.9857, 2.7830` (Seremban)     |
| Backdrop   | White background layer outside the mosaic footprint  |

Selecting it rebuilds the map style with the `pmtiles://` protocol registered,
so data layers are re-added rather than dropped.

---

## Theming

The dashboard and login page share one palette, declared as CSS custom
properties at the top of each file.

| Token             | Value     | Role                                         |
|-------------------|-----------|----------------------------------------------|
| `--orange`        | `#E8772E` | Primary accent — CTAs, active layers, brand   |
| `--orange-dark`   | `#C75F1C` | Pressed / gradient depth                      |
| `--charcoal-dark` | `#1E2C44` | Deep navy — sidebar, dark surfaces, headings  |
| `--charcoal`      | `#34465F` | Body text — navy slate                        |
| `--cream`         | `#F5F5F7` | App canvas — Apple-style light gray           |

Surfaces use translucent white with `backdrop-filter: blur(22px) saturate(180%)`
and 12–16 px radii. Type is the system stack
(`-apple-system` → `SF Pro` → `Inter`).

---

## Deployment

### Production server (current)

The site runs at **https://buildvision.uzmadigitalearth.app/** (sign in at **https://buildvision.uzmadigitalearth.app/login/**) on the shared UZMA EC2 host, served as
static files by the host nginx (Cloudflare TLS) from `/var/www/buildvision` — no build step, no
container. `.geojson` / `.geojsonn` are served as `application/json` so nginx gzips them.

[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) runs on every push to `main` (or
manually: *Actions → Deploy to EC2 → Run workflow*):

1. optionally inject the `DEMO_PASSWORD` digest into `login/index.html` (see *Sign in*)
2. rsync the repository to `/var/www/buildvision/`, excluding `.git`, `.github`, `docs/` and `tools/`
3. check that `/`, `/login/`, `/compare/` and the old `/login.html` redirect answer 200

```bash
git push origin main
```

The workflow needs the repository secrets `SSH_PRIVATE_KEY`, `SSH_HOST` and `SSH_USER`.
To land visitors on the sign-in page first, link to `/login/` directly. Pages live in
folders (`/login/`, `/compare/`) so addresses carry no file names; nginx serves each
folder's `index.html` without any server change.

### Static hosts (S3, Netlify, Cloudflare Pages, Vercel)

```bash
# upload the repository root as-is — there is no ./dist
```

Serve `.geojsonn` with a sane `Content-Type` (`application/json` or
`application/octet-stream`), and make sure the S3 bucket hosting
`seremban.pmtiles` allows CORS **and HTTP range requests** — PMTiles reads byte
ranges, not whole files.

---

## Notes & limits

- **Client-side auth only.** The password is stored as a digest, but the check
  still runs in the browser and can be bypassed. Fine for a public showcase,
  unsuitable for anything real.
- **`crypto.subtle` needs a secure context.** Sign-in works over `https://` and
  `http://localhost`, but not over a plain-HTTP LAN address — the page reports
  this rather than failing silently.
- **`preserveDrawingBuffer` is off** to save GPU memory (it was causing WebGL
  context loss → white map). PDF export snapshots the canvas on demand instead,
  and a `webglcontextlost` handler rebuilds the map as a fallback.
- **Large payloads.** `serembangeo.geojsonn` is ~14 MB and `uzma.js` ~2.7 MB, so
  the first load is heavy on slow connections.
- **Google tiles** are used for convenience in this demo and are not licensed
  for production use.

---

## Credits

- Map engine — [MapLibre GL JS](https://maplibre.org/)
- Tile archive format — [PMTiles](https://docs.protomaps.com/pmtiles/) by Protomaps
- Base tiles — [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors
- Elevation — [Terrarium DEM](https://registry.opendata.aws/terrain-tiles/) via AWS Open Data
- Satellite imagery — **UZMA-sat**, © UZMA Berhad
- PDF export — [jsPDF](https://github.com/parallax/jsPDF) + [html2canvas](https://html2canvas.hertzen.com/)
