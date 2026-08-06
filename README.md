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

The demo is gated by a single hardcoded credential (client-side only):

| Field    | Value                          |
|----------|--------------------------------|
| Email    | `geospatial.ai@uzmagroup.com`  |
| Password | `Geoai123!`                    |

`login.html` sets a `sessionStorage` flag that `index.html` checks on load and
redirects on if absent. This is presentation-layer gating for a public demo —
**not** a security boundary. Anything requiring real access control needs a
server-side session.

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

### GitHub Pages (current)

Pages serves the repository root from `main` — pushing to `main` triggers the
`pages-build-deployment` workflow, no build step required.

```bash
git push origin main
```

To land visitors on the sign-in page first, either link to `login.html`
directly or swap it in as the entry point.

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

- **Client-side auth only.** The credential above ships in the page source. Fine
  for a public showcase, unsuitable for anything real.
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
