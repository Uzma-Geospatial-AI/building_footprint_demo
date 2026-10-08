# Land Use & Building Footprint Detection — Demo

An interactive, zero-build **MapLibre GL** dashboard for **Geospatial AI Sdn Bhd**,
an Uzma Group company. The demo visualises AI-extracted building footprints and
land-use classification over **Seremban, Negeri Sembilan**, served entirely as
static files and themed with the Uzma brand palette
(`#E8772E` orange · `#1E2C44` navy · `#F5F5F7` canvas).

Live demo: https://uzma-geospatial-ai.github.io/building_footprint_demo/

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
├── login.html               # gated sign-in page
├── uzma.js                  # POI / gazetteer + reference datasets
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

Then open http://localhost:8000/login.html

> Opening `index.html` directly via `file://` will fail — browsers block
> `fetch()` on the local GeoJSON under the file protocol.

### Sign in

The demo is gated by a single account. The email is
`geospatial.ai@uzmagroup.com`; the password is **not** published here — ask one
of the contacts in the sign-in page's support modal.

`login.html` stores a salted SHA-256 digest of the password rather than the
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
# paste the hex into PASS_HASH in login.html
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
| Kawasan Industri Teluk Kalong | inside the PBT boundary on no NDCDB cadastral lot (state land / reserve); inside the boundary on no approved lot; or outside the boundary within the buffer slider (100–1000 m) |
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
(vegetation → bare) or *Vegetation gain* — then **Generate**. A switch hides the result to
show the regular basemap, and **Compare ↗** opens `compare.html` in a new tab: a swipe
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

**Search** (topbar, MPK mode): study areas, cadastral lot no. / UPI, building Plus Codes, and
place names in Kemaman via OpenStreetMap Nominatim.

**Data** (`mpk/`, code in `mpk.js` / `mpk.css`):

- `tk_sempadan.geojson`, `tk_lot_lulus.geojson` — Teluk Kalong boundary and approved lots,
  digitised from MPK's map by `tools/vectorize_teluk_kalong.py` (georeferenced from the
  coordinates printed on the map; ~6 px ≈ 60 m mean residual)
- `koridor_jalan.geojson` — MPK's corridor points snapped to OpenStreetMap centrelines
- `lot_kadaster.geojson` — NDCDB cadastral lots ([source](https://digitalearthgeojson.s3.ap-southeast-5.amazonaws.com/building/lots_sempadan_industri_kemaman.geojson)); each building carries the `lot` / `upi` it stands on
- `mpk_buildings.geojson` — Google Open Buildings v3, classified per area
- `wayback.json` — distinct Esri Wayback images per area, built by `tools/build_wayback.py`
- `sentinel.json` — least-cloudy Sentinel-2 scene per area and month, built by `tools/build_sentinel.py`
- `landsat.json` — least-cloudy Landsat scene per area and month, built by `tools/build_landsat.py`

**Regenerate:**

```bash
python tools/vectorize_teluk_kalong.py path/to/teluk_kalong_map.png   # numpy, scipy, scikit-image, Pillow
python tools/build_mpk_illegal.py                                      # stdlib; streams ~980 MB + Overpass
python tools/build_wayback.py                                          # stdlib; queries ~200 Esri releases (~10 min)
python tools/build_sentinel.py                                         # stdlib; cloud check on ~2,300 scenes (~20 min)
python tools/build_landsat.py                                          # stdlib; cloud check on ~3,000 Landsat scenes
node tools/test_mpk_logic.js                                           # pure-logic tests
```

The MPK source map image is client material and is not committed.

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

The site runs at **https://buildvision.uzmadigitalearth.app/** on the shared UZMA EC2 host, served as
static files by the host nginx (Cloudflare TLS) from `/var/www/buildvision` — no build step, no
container. `.geojson` / `.geojsonn` are served as `application/json` so nginx gzips them.

[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) runs on every push to `main` (or
manually: *Actions → Deploy to EC2 → Run workflow*):

1. optionally inject the `DEMO_PASSWORD` digest into `login.html` (see *Sign in*)
2. rsync the repository to `/var/www/buildvision/`, excluding `.git`, `.github`, `docs/` and `tools/`
3. check that `login.html` and `index.html` answer 200

```bash
git push origin main
```

The workflow needs the repository secrets `SSH_PRIVATE_KEY`, `SSH_HOST` and `SSH_USER`.
To land visitors on the sign-in page first, link to `login.html` directly.

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
