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
├── mpk-features.js          # MPK Features page and grid; tools 1, 4, 6, 7, 9
├── mpk-gesture.js           # MPK Features: tool 11, gesture control (camera + voice)
├── mpk-features2.js         # MPK Features: tools 12–15
├── mpk-features3.js         # MPK Features: Site Check, Developer Portfolio, Notice Drafter, Approval Timeline, Revenue Map
├── mpk-daftar.js            # MPK building plan registration form, Registrations tab, Tr. P.U. 9/2026 guideline
├── mpk-edit.js              # building popup: pencil edit of the details, status dropdown with its required form
├── mpk-strata.js            # Strata mode: map → parcels & 3D → share units → strata title → tax & charges; cemeteries
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

Two study areas, selectable as chips in the **Illegal Construction** panel tab (MPK's third, the Bandar Putra – Berenjut
corridor, lies outside the 2026 hand-drawn footprints and was removed):

| Area | Flagged as suspected |
|---|---|
| Kawasan Industri Teluk Kalong | the buildings flagged `is_mockup` in the [building API](https://digitalearthgeojson.s3.ap-southeast-5.amazonaws.com/kemaman_buildings_industri_filled.geojson) (49 buildings, 45 inside the boundary) — the MPK mockup list — **minus those an MPK-approved building plan covers** (19), leaving 26 |
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

**Aerial imagery basemaps** (MPK mode, basemap menu → *Aerial imagery · MPK Kemaman*): two sharp Esri captures
of Teluk Kalong to Chukai served as PMTiles (PNG, zoom 11–18, ~2 GB each) from
`https://digitalearthbasemap.s3.ap-southeast-1.amazonaws.com/terengganu/`:
*MPK aerial · 24 Sep 2026* (`aoi_mpk_esri_2026-09-24_z18.pmtiles`) and *MPK aerial · 1 Nov 2023*
(`aoi_mpk_esri_2023-11-01_z18.pmtiles`), extent 103.394–103.494 °E, 4.212–4.315 °N. Google Maps (road map) fills the
map outside that extent, the map can zoom one level past 18, and the options leave with MPK mode. Switching
between the two shows what was built between Nov 2023 and Sep 2026.
**The bucket must allow this site (CORS) for range requests**, otherwise the browser blocks the files and a
warning appears; the same applies to the Seremban UZMA-sat archive in that bucket. S3 → bucket → Permissions →
CORS:

```json
[{ "AllowedOrigins": ["https://buildvision.uzmadigitalearth.app", "http://localhost:8000"],
   "AllowedMethods": ["GET", "HEAD"], "AllowedHeaders": ["Range", "If-Match", "If-None-Match"],
   "ExposeHeaders": ["ETag", "Content-Range", "Content-Length", "Accept-Ranges"], "MaxAgeSeconds": 3000 }]
```

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
slider with Before on the left and After on the right (Google Satellite underneath where an image has no data). The
BEFORE and AFTER labels are dropdowns listing every image that satellite has for the area (Esri: each capture; Sentinel-2
and Landsat: each month, with its cloud cover); picking one reopens the comparison on the new pair, and the change layers
stay only if they were made for that pair. Index maps (NDVI, NDBI) for the area are
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
  reference layers, the road-reserve slider, change detection and the revenue estimate. Every entry under *Map layers* has its own
  tick box (each land-use class, the district boundary, the two kinds of approved plan, cadastral lots, planning
  boundary, study corridor); the group switch still turns a whole group on or off, and ticking an entry turns its
  group on. The two study-area outlines (*Study area · Teluk Kalong*, the planning boundary, and *Study area ·
  Binjai – Chukai*, the corridor band and road) start on and follow the area chips: each shows only when it is ticked
  and its own chip (or *All*) is selected. The area chips also filter the buildings on the map: *Teluk Kalong* or *Binjai – Chukai* draws that area's buildings
  only (statuses and m² labels), *All* draws both. The Overview panel has the same switch (*Study area · …*, named after the selected chip), kept in step with the
  tick boxes. The PDF report's map always outlines the area it reports on.
- *Statistics* (sidebar, under Dashboard): a full page with headline cards, a legal-vs-illegal
  donut with counts / shares / m², building-size classes split by status, a per-area table,
  the largest buildings (each with *View* on the map) and an *Export CSV* of every building
  with its status and size. **Revenue potential** (estimate): if the suspected buildings of the selected area are
  regularised, the one-off processing fees (m² × fee rate), the assessment tax every year (Cukai Pintu, m² × tax rate),
  the first-year total and the 5-year total, split by area and by reason, plus the upper bound if the not-verified
  buildings also lacked approval. The two rates are editable there (and in the panel's revenue card; they stay in
  sync and are remembered in the browser); they are assumptions to be set to MPK's schedule.
- *Export PDF* (top bar in MPK mode, or *Export PDF report* on Statistics): asks for the language
  (**English** or **Bahasa Melayu**, last choice remembered), then builds an A4 council-style
  report for the selected area: particulars, summary, location map, breakdown by area and size,
  the list of suspected buildings, notes and blank Prepared / Checked / Approved blocks. It is
  marked **DRAFT · FOR REVIEW** with a system ID (`BV-YYYYMMDD-HHMM`) and carries no MPK logo,
  seal or official reference number (`mpk-report.js`, tests in `tools/test_mpk_report.js`).
- *Features* (sidebar, under Statistics): fifteen live tools on the MPK data, each opening a
  floating panel on the map. See [MPK Features](#mpk-features--the-15-tools) below.
- Only the **marked areas** are loaded: Teluk Kalong buildings inside the planning boundary and
  buildings within the Binjai – Bandar Chukai corridor (1,969 buildings, all hand-drawn from the 2026 imagery). Status colours are bright so they read on the road map and on imagery:
  suspected `#FF1744` red, legal `#00C853` green, not verified `#2962FF` blue, outside the study areas `#FF9100` orange, each
  with a darker outline of its own hue (checked with a colour-blind palette validator; red / green rely on the outline and
  the legend labels too).

**Building status** — every building is shown in one of three statuses, each with its own
map layer, switch and count (with a share bar) in the panel:
*Illegal buildings* (red: the API suspect list in Teluk Kalong without an approved plan, road-reserve
encroachment in the corridors), *Approved buildings* (green: covered by a plan in MPK's
register of approved building plans) and *Pending buildings* (blue: no approved plan found, which may be a
gap in the register rather than an offence). Teluk Kalong inside the boundary (footprints of 14 Oct 2026): 360 legal, 25 suspected,
1,176 not verified. Popups are coloured and worded by status; a legal building's popup gives its plan
file no., approval date and status and the approved building type.

**Shop building plans** (all 4,547 records — Lulus 362, Lulus Bersyarat 46, Tolak 2, Tidak dinyatakan 4, no decision 4,133 — are listed in Analysis → *Shop building plan register*, with status and on-map filters and a click-to-zoom for the 1,206 drawn on the map; MPK's *Pelan Bangunan Kedai* register, Chukai and Binjai, 4,547 records,
[source](https://digitalearthgeojson.s3.ap-southeast-5.amazonaws.com/building/Pelan_Bangunan_Kedai.geojson)): the register is
uneven. Every record with a geometry inside Kemaman is drawn (1,206): 340 approved (LULUS, LULUS BERSYARAT / DGN SYARAT,
and the misspellings LUUS / ULUS), 2 rejected (TOLAK) and 864 with no decision (blank, -9999, TAMBAHAN, place names, dates),
shown grey as *Plan drawing, no decision recorded* and not used for status. Cannot be placed: 1,112 without geometry and
2,229 whose coordinates fall outside Kemaman (mis-placed, e.g. the "TK" records at 102.42° E). In the Binjai – Chukai corridor
an approved plan makes a building **legal** (40) and a building covered only by a rejected plan is **suspected · building
plan rejected by MPK (TOLAK)** (1); 101 buildings outside the study areas show their plan in the popup. Map layers →
*Approved building plans · MPK* has a third entry, *Rejected plan (TOLAK)* (red), and a fourth, *Plan drawing, no decision recorded* (grey). Both registers are applied by
`tools/apply_pelan_lulus.py`.

**Approved building plans** (MPK's *Pelan Bangunan Lulus* register for Teluk Kalong, 966 records,
[source](https://digitalearthgeojson.s3.ap-southeast-5.amazonaws.com/Pelan_Bangunan_Teluk_Kalong_Lulus.geojson)):
`tools/apply_pelan_lulus.py` matches them to the buildings. A plan covers a building when a plan polygon
holds the building's centre, the building holds a plan polygon's centre, or at least two vertices of the
plan's CAD outline lie on or within 2 m of the footprint (most records are open CAD lines, not polygons).
658 plans cover 345 buildings (one hand-drawn footprint often holds several approved plans); the other plans
are site boundaries, fences and lot lines, or buildings not in the footprint data. This replaces the earlier rule ("on an approved lot" digitised from MPK's map).
Map layers → *Approved building plans · MPK* (off at start) draws the plans: dark teal where a building
stands on the plan, purple where none was found; click one for its file no., lot, date, status and
building type. Applicant names are copied into the app (Developer Portfolio, register records); architect names are not.

**Register records on the buildings** (all 23,214 records of the Teluk Kalong register, `mpk/rekod_semua.geojson`;
only each record's centre is known): `tools/apply_pelan_lulus.py` gives each record to the building whose footprint holds
its centre. 2,091 records fall on 402 buildings; each gets `rekod_n`, `rekod_sah` and its most telling record (file,
applicant, building type, status, date), shown in the popup as *Register records here*. Where no plan drawing covers a
building, an approved record on it makes it legal and a TOLAK record makes it rejected (SOKONG and SEDIA ADA are not
decisions). In Teluk Kalong this moves two buildings to legal: 6PP57F57+9XQ (file 2990, status written *LUUS*, missing
from the approved GeoJSON) and 6PP57F33+JG5 (TK/3020KLT34KMTT, approved 2 Mar 2025, before on the API suspect list).

**Search anything** (topbar, `mpkSearchAttrs`): besides areas, lots, Plus Codes, places and coordinates, every detail of the study-area buildings, the outside buildings, the building plans and the Teluk Kalong register (loaded on the first search) is searched: file no., applicant, building type, status, register, note, registration no., height and so on. Every word typed must match some detail; whole matches rank first; each group shows the first 8 with the number found and the matched word marked.

**Editing a building and its status** (`mpk-edit.js`): in a building's popup the ✏️ pencil edits its details (lot, UPI, area, height, floors, plan on record, note; the officer's name is required), and the status dropdown (Approved / Illegal / Pending) opens MPK's building plan form (JKB:(KP)1-03) with a required status-change section on top (reason, date, officer; reference and note optional). Submitting saves the form as the building's registration, decided as the new status (Approved = lulus, Illegal = tolak, Pending = menunggu), and only then changes the status. An officer's *Illegal* is the suspect type `manual` (kategori `manual_haram`), *Pending* is `manual_pending`, *Approved* is `lulus`; *Restore* returns the status from the records. Kept in this browser (`mpk_edit_v1`), applied over the data and the registrations at every load, with a change history in the popup.

**Building plan registration** (`mpk-daftar.js`): click an *illegal* or *pending* building, then *Register building plan*.
It opens MPK's *Borang Perkiraan Daftar Pelan Bangunan* (Jabatan Kawalan Bangunan, JKB:(KP)1-03, UUKBS 1984 First Schedule)
laid out as the paper form, ready to fill in: Projek, file no., building type, units and title (pre-filled from the building:
its footprint as the ground floor, lot, UPI and any plan on record), then every section of the form (new building para 1 and
the row-of-buildings discount of para 9, temporary, addition, alteration, special plans incl. telecom structures and retaining
walls, amendments 10-1 and 10-2) with each fee and the summary worked out as you type. KADAR = floor area ÷ 9 m², rounded up;
JUMLAH = KADAR × rate, at least the floor's minimum (confirm this reading with MPK). *Submit for approval* gives it a number
(DPB/2026/0001, …) and lists it on the **Registrations** page (sidebar, under Features, with a badge counting pending ones;
pending / approved / rejected, with counts and filters); open one to edit it, approve or reject it with a note, reopen or delete it, or print the form. An approved
registration makes its building legal on the map and in every count (its own class is kept in `daftar_asal` and comes back
if the registration is reopened or deleted). Registrations live in this browser's localStorage (`mpk_daftar_v1`); Export
CSV / JSON and Import JSON move them between computers. *Guideline · Tr. P.U. 9/2026* shows the Planning Control (General)
(Terengganu) (Amendment) Rules 2026 (gazette of 10 Sep 2026): the main amendments and the Third Schedule fees (Parts A to D,
incl. 5 to 20 times the Part B fee for development without permission) and the Sixth Schedule parking contribution.
The MPK logo (`mpk/mpk_logo.png`) is taken from the form.

**Footprints are live at every load** (`mpk-live.js`): the S3 bucket allows GET from any origin, so each time the dashboard
loads it asks S3 for the footprints' Last-Modified (the download stops as soon as the headers arrive). If it matches
`mpk/sumber.json`, the built data is used. If S3 is newer, the browser reads the footprints from S3 (~9 MB) and merges them into
the built data: a footprint within 2 m of a built building with an area within 0.8 – 1.25 is that building (id, status, plans,
register records, lot, height kept, outline and area new); any other footprint is classified in the browser (Teluk Kalong boundary,
Binjai – Chukai corridor within 50 m of the road, or outside; cadastral lot; Plus Code; an approved or rejected plan under it; the
height of the nearest built building within 120 m); built buildings without a footprint any more are dropped. The source line under
the area chips says whether the data is live and how many footprints are new or gone; while open the app checks every 10 minutes and
offers a refresh. The hourly rebuild below then does the full job (API suspect list, register records, GHSL heights).

**Full rebuild every hour** (`tools/update_footprints.py`, `.github/workflows/update-footprints.yml`): the hand-digitised
footprints (`building/aoi_mpk_esri_2026-09-24_z18.geojson` on S3) are edited in place. Every hour the workflow compares the file's
ETag with `mpk/sumber.json`; when it changed it rebuilds the buildings (`build_mpk_manual.py`), the approved-plan and register
matching (`apply_pelan_lulus.py`) and the heights (`build_heights.py`), commits and deploys. Ids stay put: a footprint keeps the id
of the old one within 2 m with an area within 0.8 – 1.25 (14 Oct 2026: 11,968 of 12,545 kept, 577 new), so registrations and strata
schemes saved in browsers keep their building. The app reads `mpk/sumber.json` uncached, puts its version in every data URL, shows
the source date under the area chips and, while open, checks every 10 minutes and offers a reload when new footprints arrive.
14 Oct 2026: 12,864 records, 12,545 with a geometry; Teluk Kalong 1,561, Binjai – Chukai 410, outside the study areas 10,574.
Run by hand: `python tools/update_footprints.py [--force]` (needs rasterio; the GHSL tile is cached in `.cache/`).

**Strata mode** (`mpk-strata.js`, Area dropdown → *Strata*): the strata title process as it runs in Malaysia, on the MPK
buildings (the study areas and every hand-drawn footprint outside them), from the map to the register. MPK's illegal-construction
layers, sidebar pages and floating card give way to a *Strata* panel; click a building → *Start strata scheme* (STR/2026/0001, …).
1. *Building & conditions*: proprietor, master title, mukim, tenure and lease years left, type of application (building / building
   and land / land); the JKPTG conditions (final title, no charge or lien, land-use category, ≥ 21 years of lease, building within
   the lot, CCC / CFO).
2. *Parcels & 3D*: floors and height (pre-filled from the building heights), BIM level of development (LOD 100 – 500); parcels
   created as floors × parcels a floor (85 % of a floor, the rest common property; a shop-house scheme gets ground-floor and
   upper-floor parcels) or one by one, each with its parcel type (WF1), whole-floor parcel (WF2), owner and an accessory parcel
   with its area and place (WF3); a floor stack drawing and a floor X-ray on the map.
3. *Share units*: allocated share units = (area × WF1 × WF2) + (accessory area × WF3), rounded to the nearest whole number,
   with the weightages of the Strata Management Act 2013 (Act 757) First Schedule (Table 1 by parcel type, air-conditioned common
   areas and a common lift; Table 2 whole floors 0.85 / 0.80; Table 3 accessory parcels 0.25 outside / 0.5 within the building);
   SiFUS (PTG) and the schedule of parcels filed with the Commissioner of Buildings (s.6); a what-if of air-con, lifts and whole floors.
4. *Strata title*: SiFUS & schedule → CPSP (JUPEM) → application to subdivide (PTG) → strata titles registered (Act 318), with the
   JKPTG time limits (CPSP within 3 months of completion, subdivision within 1 month of the CPSP, each + 1 month) and a document list.
5. *Management & tax*: developer → JMB (first AGM within 12 months of vacant possession, Act 757 s.17 – 18) → MC (when the strata
   register opens); Charges by share units and the 10 % sinking fund (s.25); assessment tax per parcel with yearly bills paid in
   two halves.
6. *PDF report* (Bahasa Melayu, A4, MPK logo): particulars, conditions, floor stack, schedule of parcels with share units, filings,
   stages and deadlines, management, Charges, sinking fund and assessment tax per parcel, notes and signature blocks.
Ten tools in the panel: strata potential (a 0 – 100 score for every study-area building on the map, with the best candidates),
building heights in 3D, floor X-ray, share-unit what-if, AGM vote by share units (ordinary / special ¾ / unanimous), deadline radar
across schemes, 10-year sinking fund forecast against capital works, parcel passports with a QR code (PDF), owner statements (PDF,
one page per parcel), and the strata pipeline with a timeline. Cemetery sites (type, status, area, grave capacity ≈ area ÷ 2.5 m²,
lots in use; Tr. P.U. 9/2026 fee RM 500) live here too. Assessment rates (6 / 9 / 9 / 6 %), rents (RM 4 / 12 / 6 / 4 per m² a
month), RM 0.30 a share unit and the first capital works are assumptions. Kept in this browser's localStorage (`mpk_strata_v2`;
earlier `mpk_strata_v1` / `mpk_harta_v1` data carries over), with CSV / JSON export and JSON import.

**Building heights** (study areas, `tinggi_m`, `tingkat_est`, `tinggi_src` in `mpk_buildings.geojson`, `tools/build_heights.py`):
no survey of heights exists for Kemaman, so each building takes OpenStreetMap's mapped height or levels (× 3.5 m) where a mapped
building's centre lies in it (3), else the JRC GHSL Built-H 2018 average net building height of its ~90 m cell (1,924), else one
floor (42). Floors = height ÷ 3.5 m, rounded: 753 one-floor, 729 two, 409 three, 78 four or more. Overture Maps carries no height
here. Estimates to confirm on site.

**Land use** (Map layers → *Land use · Kemaman (OSM)*): OpenStreetMap `landuse=*` polygons
for the whole Kemaman district (367 zones: industrial, residential, commercial, institutional,
recreation, agriculture, forest, water, under development) plus the district boundary. Click a
zone for its class and name; building popups show the zone they stand in. This is
community-mapped and incomplete — not the official RTD zoning (PLANMalaysia i-Plan
`gunatanah_zoning_terengganu`), which should replace `mpk/landuse.geojson` when MPK provides it.
No open dataset of actual illegal-construction cases exists for Terengganu; those records sit
with each council.

**Data** (`mpk/`, code in `mpk.js` / `mpk.css`):

- `tk_sempadan.geojson`, `tk_lot_lulus.geojson` — Teluk Kalong boundary and (superseded by the approved
  building plans, kept as the builder's first-pass input) approved lots, digitised from MPK's map by `tools/vectorize_teluk_kalong.py` (georeferenced from the
  coordinates printed on the map; ~6 px ≈ 60 m mean residual)
- `koridor_jalan.geojson` — MPK's corridor points snapped to OpenStreetMap centrelines
- `lot_kadaster.geojson` — NDCDB cadastral lots ([source](https://digitalearthgeojson.s3.ap-southeast-5.amazonaws.com/building/lots_sempadan_industri_kemaman.geojson)); each building carries the `lot` / `upi` it stands on
- `mpk_buildings.geojson` — building footprints, classified per area. **Teluk Kalong and Binjai–Bandar Chukai: digitised by hand
  from Esri imagery of 24 Sep 2026** ([source](https://digitalearthgeojson.s3.ap-southeast-5.amazonaws.com/building/aoi_mpk_esri_2026-09-24_z18.geojson),
  12,734 footprints over the extent of the MPK aerial basemap; labelled EPSG:32647 but in Web Mercator, converted and re-measured by
  `tools/build_mpk_manual.py`, `sumber` = `manual_esri_20260924`, confidence 1). **Only these footprints are used**: Google Open Buildings and the Bandar
  Putra – Berenjut corridor (outside their extent) were removed. In scope: Teluk
  Kalong 1,554 inside the boundary and Binjai – Chukai 415 (1,969; the hand-drawn footprints are whole buildings, where Open
  Buildings split them into many pieces, so counts are lower for the same floor area). The file holds 12,734 records, of which 261 have no geometry; the
  other **10,504 footprints, outside the study areas,** are in `mpk_buildings_luar.geojson` and drawn on the map as
  *Outside the study areas* (orange, switch in the Overview panel, click for Plus Code, lot / UPI, area and land use)
  with no status, since no approval rule covers them; they are not counted in the statistics or the report. All 12,473 are shown. The API's `is_mockup` suspects are matched to the 2026 footprints by overlap (41 of 49 found);
  Teluk Kalong classes from the approved plans: `lulus` (with `pelan_fail`, `pelan_tarikh`, `pelan_status`, `pelan_jenis`,
  `pelan_n`), `mockup`, `tiada_pelan` (`asal` keeps the first-pass class)
- `pelan_lulus.geojson` — MPK's approved building plans for the map (one feature per record and shape kind, `bangunan` =
  covers a building), built by `tools/apply_pelan_lulus.py`
- `rekod_semua.geojson` — every record of the Teluk Kalong plan register (23,214; 22,086 with usable coordinates) as a point at its
  centre, grouped by status (Lulus / Diluluskan 570, Lulus Bersyarat 400, Sokong / Sedia Ada / Tolak 7, no valid status 22,237).
  Analysis → *All plan records* (off at start; the 3.6 MB file loads the first time it is switched on, click a point for the record).
  Built by `tools/build_rekod_semua.py` from `rekod_semua.csv` (cleaned export of `Pelan_Bangunan_Teluk_Kalong.xlsx`)
- `landuse.geojson` — OSM land-use zones + district boundary for Kemaman, built by `tools/build_landuse.py`
- `wayback.json` — distinct Esri Wayback images per area, built by `tools/build_wayback.py`
- `sentinel.json` — least-cloudy Sentinel-2 scene per area and month, built by `tools/build_sentinel.py`
- `landsat.json` — least-cloudy Landsat scene per area and month, built by `tools/build_landsat.py`

**Regenerate:**

```bash
python tools/vectorize_teluk_kalong.py path/to/teluk_kalong_map.png   # numpy, scipy, scikit-image, Pillow
python tools/build_mpk_illegal.py                                      # stdlib; streams ~980 MB + Overpass
python tools/update_footprints.py [--force]                            # the three steps below when the S3 footprints changed (also hourly in CI)
python tools/build_mpk_manual.py                                       # stdlib; 2026 hand-drawn footprints for Teluk Kalong + Binjai–Chukai
python tools/apply_pelan_lulus.py                                      # stdlib; Teluk Kalong + shop building plans (run after the lines above)
python tools/build_heights.py PATH/TO/GHS_BUILT_H_..._R9_C29.tif         # rasterio; building heights for the study areas (run after build_mpk_manual)
python tools/build_rekod_semua.py path/to/rekod_semua.csv                 # stdlib; all 23,214 Teluk Kalong register records as points
python tools/build_landuse.py                                          # stdlib; OSM land use for Kemaman (Overpass)
python tools/build_wayback.py                                          # stdlib; queries ~200 Esri releases (~10 min)
python tools/build_sentinel.py                                         # stdlib; cloud check on ~2,300 scenes (~20 min)
python tools/build_landsat.py                                          # stdlib; cloud check on ~3,000 Landsat scenes
node tools/test_mpk_logic.js                                           # pure-logic tests
node tools/test_mpk_change.js && node tools/test_mpk_report.js         # change detection, PDF report
node tools/test_mpk_features.js && node tools/test_mpk_gesture.js      # Features tools, gesture control
node tools/test_mpk_features2.js                                       # Features tools 12–15
node tools/test_mpk_features3.js                                       # Features tools 2, 3, 5, 8, 10
node tools/test_mpk_daftar.js                                          # registration form fees
node tools/test_mpk_strata.js                                          # strata share units (Act 757), deadlines, votes, sinking fund
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
  (DBSCAN on building centres); used by the priority score.
- *Priority score* (0–100): size 45% (log scale, 10 m² → 0, 5,000 m² → full) + evidence 25%
  (on MPK's list = full; road reserve = 40% at the reserve edge up to full on the centreline)
  + AI confidence 15% + inside a hotspot 15%.

| # | Tool | What it does | How to use it | How it works |
|---|---|---|---|---|
| 1 | **Drone Tour** | Raises every building into 3D (red suspected, teal legal, grey not verified) and flies the camera to the 8 highest-priority cases, orbiting each with its Plus Code, size, lot and reason on screen. | Launch, then watch. *Fly again* or *Loop for booth* at the end. Touching the map stops it. | Extrusion heights animate from 0; MapLibre `flyTo` / `easeTo` with pitch and bearing; the stops come from the priority score. |
| 2 | **Site Check** | "Can I build here?" for any spot: the cadastral lot (number, UPI, size), the study area, distance to the corridor road's centreline against the reserve, the approved plans and the buildings on that lot (with how many are illegal), land use, and the approvals any new building needs (planning permission, TCPA 1976 s.19, and building plan approval, Act 133 s.70, at MPK's One Stop Centre). Each finding is a green / amber / red / blue line. | Launch, then click anywhere on the map; click again for another spot. | Point-in-polygon on the cadastral lots (`mpk/lot_kadaster.geojson`, Teluk Kalong only); where no lot covers the spot the check uses everything within 40 m and says so. Buildings and plan drawings count by their centre. Distance to the corridor centreline in local metres; land use from the OSM zones. A screening aid, not a planning decision. |
| 3 | **Developer Portfolio** | Every plan one applicant holds in MPK's two registers (Teluk Kalong and shop plans): the plans light up on the map (rejected ones in red), with plan count, approved, rejected, how many have a building on them, the years of approval and the list of files with lot and date. | Launch: the applicants are listed largest first (305); type to search, click one. Click a file to zoom to it; *Back to the list* for another. | Applicant names are matched whatever the spelling ("Rayhar Properties Sdn. Bhd." = "RAYHAR PROPERTIES"; placeholders such as -999 are skipped). One count per plan record; shop records with no drawing are counted separately. Needs `pemohon` on the plan shapes (written by `tools/apply_pelan_lulus.py`). |
| 4 | **Priority Score** | Recolours suspected buildings from yellow (low) to dark red (urgent) and lists the top 10 with a bar showing what makes up each score. | Launch; click a building in the list to zoom and open its popup. | The score above; the bar splits it into size / evidence / confidence / hotspot. |
| 5 | **Notice Drafter** | A draft enforcement notice for an illegal building, as an A4 PDF in Malay or English: council heading, reference (MPK/KB/year/Plus Code), date, Act 133 s.70, the location table (Plus Code, coordinates, lot, UPI, area, footprint, finding in the notice's language), a map snapshot, what the owner must do within the set number of days, and a signature block. A red **DRAFT** banner and a footer say it needs site verification and the legal unit's review. | Pick the language and days to comply (7–90, default 30), then click a red building on the map or one in the list (highest priority first). *All N in one PDF* writes one notice per page for the whole area (without map snapshots). | jsPDF in the browser; the snapshot is the map canvas at zoom 18.6 over the building. The finding: rejected plan (TOLAK), on MPK's suspect list, or inside the road reserve with its distance. |
| 6 | **Ask the Map** | Answers questions about the buildings in English or Malay, highlights the matching buildings, outlines the place asked about and can read the answer aloud. It **does not guess**: a place outside the monitored areas gets "No data for Kerteh: it is outside the areas we monitor", a place it cannot find gets "I could not find “…” in Kemaman, so I have no data for it", and a question it does not follow gets "Sorry, I did not understand…". With no status asked it gives the split (suspected / legal / not verified). Can also open any other tool. | Type or press 🎙️ and speak, e.g. "How many illegal buildings in Binjai?", "Berapa bangunan haram di Cukai?", "Illegal buildings in Taman Chukai Utama", "Tunjuk bangunan haram lebih 1000 m²", "Largest legal building in Teluk Kalong", "lot 3020", "start the drone tour". Untick *Speak the answer* for silence. | A small parser picks the intent (count / show / largest / lot / open a tool), study area (Teluk Kalong, Bandar Putra–Berenjut, Binjai / Chukai / Cukai), status, size limits and lot no.; the words it does not know are taken as a place name. Places are found first among the named OSM land-use zones (full names win over the study-area words, so "Taman Chukai Utama" is the estate, not the corridor), then with OpenStreetMap search (Nominatim) inside the Kemaman district, keeping only hits named after the words asked (towns and villages first). A zone counts the buildings inside its outline, a town its extent, a single spot 1 km around it. Listening and speaking use the browser's Web Speech API (Chrome / Edge). |
| 7 | **Building Passport** | A case file for one building: satellite close-up with the footprint outlined, status, Plus Code, lot / UPI, footprint, AI confidence, why it is flagged, hotspot, land use and a QR code. | Launch (opens the top case), then click any building. Scan the QR with a phone to open the spot in Google Maps. | Esri World Imagery tiles assembled round the building; QR code made in the browser (qrcodejs). |
| 8 | **Approval Timeline** | Plays MPK's building plan approvals year by year (2006–2026): each year's plans appear on the map with large teal marks (rejections red) while a bar chart fills up, with the approvals that year and the running total. | Launch and watch; *Pause* / *Play*, or drag the slider to any year. | One mark per plan record of both registers, at the centre of its drawing, on its approval date (records with no date or no decision are left out); a map filter shows the plans up to the year shown. |
| 9 | **Time Machine** | Flies to the top case and plays every historical Esri photo of it as a cross-faded time-lapse (TK: 2007, 2013, 2017, 2019, 2020, 2024, 2025) with the capture year shown large. | Launch and watch; *Replay* at the end. | Esri World Imagery Wayback releases (one per distinct capture date, from `mpk/wayback.json`), two raster layers alternating with an opacity fade. Releases before 2024 only serve tiles to z17 over Kemaman (z18 from 2024), so that level is stretched when zoomed in further. |
| 10 | **Revenue Map** | Raises every illegal building as a gold column and every pending building as a grey one, the height showing what the council could recover from it. Totals for the illegal buildings and for the pending ones (if they turn out to lack approval) and the ten largest single amounts. | Drag *Years of assessment tax* (1–10, default 3); click a building in the list to fly to it in 3D. | Per building: footprint × processing fee rate + footprint × assessment tax rate × years, with the rates set in Analysis → *Estimated council revenue* (assumptions). Column height ∝ √amount. |
| 11 | **Gesture Control** | Hands-free before / after comparison. The camera tracks your hand: **hold up an open hand** to open a swipe of two Esri photos, **say** the before and after years, then control it by hand. The panel shows the six steps and highlights the current one. | Follow the steps on screen: **1** allow the camera (and microphone); **2** hold an open hand 🖐 (fingers spread, palm to the camera) still for 1 second until the ring fills; **3** say the BEFORE year ("2013", "twenty thirteen", "dua ribu tiga belas") or tap a year button; **4** the same for AFTER; **5** control the swipe with one hand: **☝️ point** = move the divider, **🤏 pinch and move** = pan, **✌️ hold** = zoom in, **✊ hold** = zoom out; **6** hold an open hand for 1 second again to close (and again to compare other years). Voice during the swipe: "zoom in", "zoom out", "before 2017", "after 2024", "swap", "close" (Malay too: "zoom keluar", "sebelum 2017", "tutup"). The divider can also be dragged with the mouse or arrow keys, and *Skip: open with the mouse* bypasses the hand step. | MediaPipe Hand Landmarker (21 points per hand) runs in the browser on the camera feed; poses come from which fingers are straight (open hand = 3 or more). The open-hand trigger fires after 1 s and ignores dropped frames under 0.3 s; it re-arms when the hand is lowered. A year that has no photo uses the closest capture (the toast says which). Video never leaves the browser. A small mirrored preview shows the tracked hand and the current gesture. |
| 12 | **3D Hex Density** | Bins every building into 150 m hexagons and raises them as 3D columns that grow out of the map: height = suspected floor area in the hexagon, colour = share of its buildings that are suspected (teal 0% → dark red 100%). Lists the five tallest columns. | Launch; hover a column for its buildings, suspected count, share and m²; click a list row to fly to that column. Right-drag tilts the view. | Hexagonal binning (pointy-top, 150 m centre-to-corner) in a local metric grid with cube rounding; `fill-extrusion` heights animate from 0. |
| 13 | **Impact Radius** | A circle follows the mouse and counts, live, what lies inside: buildings, suspected buildings and their m², estimated processing fee, a status bar (red / teal / grey), the nearest suspected building and its distance. Buildings inside are outlined in yellow. | Move the mouse over the map; set the radius (100 m–1.5 km) with the slider; click to pin the circle, click again to free it. | Distance from the centre to every building's centre (local metres), recomputed each animation frame; the fee uses the rate set in Analysis. |
| 14 | **Time Lens** | Shows the latest Esri photo on the map and an older photo of the same spot inside a round lens that follows the mouse, with today's suspected buildings outlined in red, so new construction stands out at a glance. | Move the mouse; pick the lens year (2007–2024 for Teluk Kalong) and the lens size (140–520 px). | A second, non-interactive map with the old Wayback release, kept in sync with the main map and clipped to a circle at the cursor (`clip-path`). |
| 15 | **Inspection Planner** | Turns the cases of the selected area into a day-by-day site-visit plan for the enforcement teams: which cases each team visits on which date, in route order, with km and estimated hours per day, and the finish date. Starts from the suspected buildings (priority score) and lets officers **add and edit cases**: new cases dropped on the map (title / reference, priority, footprint, note; they get a Plus Code), other buildings added to the plan (e.g. a *not verified* one after a complaint), and for any case a different priority, a note, or *leave out of the plan* (e.g. already checked). Downloads the plan as CSV (one row per visit: day, date, team, stop, Plus Code, area, lot, UPI, m², priority, source = auto / edited / included / added, reason with note, coordinates, Google Maps link) and prints A4 checklists (one page per team-day: Visited / Building found / Notes columns and an inspector sign-off line). | Set the teams (1–6), visits per team per day (4–30) and the start date; the plan updates at once. **＋ Add case**, then click the map where it is, fill in the form and *Add to plan*. Click any stop or building on the map (or a stop in an opened day, or a row under *Your cases & edits*) to edit it; *Delete* removes a new case, *Undo my edits* returns a building to the automatic plan. Click a day to see its route (numbered stops); your cases have an orange ring. *Print checklists* prints the picked day, or every day when none is picked. | Each day is seeded with the most urgent case left, filled with the case nearest to any already in it until full, then ordered nearest-neighbour + 2-opt; days are handed to teams in turn. Working days skip Friday–Saturday (the Terengganu weekend); public holidays are not skipped. Time = 15 min per visit + driving at 30 km/h on straight-line distance × 1.3. Officer cases and edits are saved in the browser (`localStorage`, key `mpk_plan_cases_v1`); there is no server, so **Export** writes them to a JSON file and **Import** merges such a file on another computer (entries are validated; same ids are replaced). New cases are assigned to the study area whose extent they fall in, and show under that area's chip or *All*. |

Requirements and limits:
- Voice (tools 6 and 11) needs Chrome or Edge, microphone permission and an internet connection
  (the browser's speech service). Typing and buttons always work.
- Gesture Control needs a webcam and camera permission over HTTPS (the live site) or
  `localhost`; MediaPipe (~8 MB model) loads from jsDelivr / Google Storage the first time.
  Good, even lighting, about 1 m from the camera and one hand in view at a time work best.
- Drone Tour, Time Machine, Time Lens, Passport, Notice Drafter and Gesture Control load map imagery, so the
  booth machine needs a steady connection.
- The 3D tools (Drone Tour, 3D Hex Density, Revenue Map) need WebGL with a working GPU.

Code: `mpk-features.js` (tools 1, 4, 6, 7, 9 and the grid), `mpk-features3.js` (tools 2, 3, 5, 8, 10), `mpk-gesture.js` (tool 11)
and `mpk-features2.js` (tools 12–15), styles in `mpk.css`.
Pure logic (geometry, DBSCAN, priority score, route order, site checks, notice text, applicant matching,
approvals per year, recoverable revenue, time-lapse
frames, the question parser, hand poses, the open-hand hold trigger, spoken-year parsing, voice commands, hexagon
binning, radius counts, the inspection schedule, Plus Codes, officer cases and edits) is exported and tested by `tools/test_mpk_features.js`,
`tools/test_mpk_gesture.js`, `tools/test_mpk_features2.js` and `tools/test_mpk_features3.js`.

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
