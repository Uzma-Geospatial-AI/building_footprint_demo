# MPK Kemaman — Suspected Illegal Construction Mode

**Date:** 2026-10-06
**Status:** Approved design
**Client context:** Mockup in collaboration with Majlis Perbandaran Kemaman (MPK) for
Kawasan Perindustrian Teluk Kalong and Bandar Chukai.

## Goal

Show buildings near the PBT industrial planning boundary that sit **outside** it, as
"suspected construction without Kebenaran Merancang (KM)", and estimate the revenue MPK
could recover (development-application processing fee + Cukai Pintu).

MPK justification addressed:
1. Identify on-site buildings without KM approval
2. Support development coordination
3. Increase PBT revenue via Cadangan Pemajuan processing fees
4. Increase revenue via Cukai Pintu

## Data findings (verified 2026-10-06)

- `buildings_industri.geojson` (API) is Google Open Buildings already **clipped** to the
  industrial boundaries: 7,089 buildings, 99.6% inside a boundary. On its own it cannot
  reveal buildings outside planning.
- `sempadan industri.geojson` (API): 4 closed `MultiLineString` rings. Only ring #3
  (bbox 103.435–103.472 E, 4.239–4.305 N) covers Chukai / Teluk Kalong; it is unnamed.
  Rings #0–#2 are Bukit Labohan / Kerteh — out of scope.
- Google Open Buildings v3, S2 cell `31d`, bbox 103.36–103.52 E, 4.18–4.34 N:
  61,508 buildings. 4,159 fall inside ring #3 — exactly matches API `zone_3`.
- Outside ring #3, by distance (centroid to boundary): ≤250 m: 502 · ≤500 m: 1,337 ·
  ≤1 km: 4,878 buildings.

## Detection rule

```
suspected = status == 'luar' && jarak_m <= buffer
```

`buffer` is a user slider, 100–1000 m, default 500 m. Buildings far from the industrial
area (e.g. town residential) are excluded by the buffer so legitimate housing is not
flagged. Open Buildings has no construction date, so every label says **"Disyaki"**
(suspected), never a definitive "Haram".

## Architecture (Approach A — offline pre-process, client-side filter)

### 1. Pre-process script — `tools/build_mpk_illegal.py`
- Pure Python 3 stdlib (no shapely/duckdb; DuckDB extensions are blocked on this machine
  by Windows Application Control).
- Streams `https://storage.googleapis.com/open-buildings-data/v3/polygons_s2_level_4_gzip/31d_buildings.csv.gz`
  (~980 MB) and keeps rows inside the bbox. Optional `--csv` flag reuses a local
  pre-filtered CSV.
- Fetches the boundary from the API URL, takes ring #3, converts it to a Polygon.
- Per building: centroid point-in-polygon → `status` (`dalam`/`luar`); distance from
  centroid to boundary in metres (local equirectangular projection at lat 4.27) → `jarak_m`.
- Keeps buildings with `status == 'dalam'` or `jarak_m <= 1000`.
- Writes:
  - `mpk/mpk_buildings.geojson` — properties `id`, `status`, `jarak_m` (int),
    `area_m2` (1 dp), `confidence` (2 dp), `plus_code`; coordinates rounded to 6 dp.
  - `mpk/mpk_sempadan.geojson` — ring #3 as a Polygon, `name: "Sempadan Perindustrian
    Teluk Kalong / Chukai"`.
- Self-checks (assert): inside count == 4,159; outside ≤500 m count == 1,337.

### 2. UI — area mode "MPK Kemaman" in `index.html`
- **Area switcher** in the topbar: `Seremban` (default, unchanged) / `MPK Kemaman`.
- Entering MPK mode:
  - hides Seremban dataset layers
  - lazily fetches the two `mpk/` files once
  - adds layers: boundary (orange dashed line), in-plan buildings (muted fill),
    suspected buildings (red fill + outline), and a fill-extrusion for suspected
    buildings that follows the existing 3D toggle
  - `fitBounds` to the MPK data extent
  - updates topbar title/subtitle and shows the new panel tab
- Leaving MPK mode reverses all of the above and restores Seremban.
- **New panel tab "Binaan Haram"** (visible only in MPK mode):
  - buffer slider (100–1000 m, step 50, default 500)
  - KPIs: suspected count, suspected total area (m²), in-plan count
  - revenue estimate: editable rates — processing fee RM/m² (default 2.00) and Cukai
    Pintu RM/m²/year (default 6.00), labelled "andaian" (assumption); rates persisted in
    `localStorage` (wrapped in try/catch)
  - top 50 suspected buildings by area; click → zoom + highlight
  - "Export CSV" of all suspected buildings at the current buffer
  - disclaimer: "Berdasarkan Google Open Buildings + sempadan perindustrian PBT; perlu
    pengesahan tapak."
- **Popup** on building click: status, distance to boundary, area, Plus Code, confidence,
  estimated fee and annual Cukai Pintu.

### 3. Data flow
Slider change → recompute filter expression `['all', ['==',['get','status'],'luar'],
['<=',['get','jarak_m'], buffer]]` → `setFilter` on suspected layers → recompute KPIs and
list from the in-memory feature array. Rate change → recompute revenue only.

### 4. Error handling
- Fetch failure for `mpk/` files → toast + message inside the tab; app stays in Seremban
  mode and remains usable.
- Basemap style reloads (existing code re-adds dataset layers) must also re-add MPK layers
  when MPK mode is active.

## Testing
- Script asserts (above) on every run.
- Manual browser checks: switch modes both ways; slider updates map + KPIs; rate edits
  update revenue; list click zooms; CSV export opens with correct row count; 3D toggle;
  basemap switch while in MPK mode keeps MPK layers; Seremban mode unchanged.

## Out of scope
Bukit Labohan / Kerteh boundaries, date-based change detection, real MPK KM approval
data (would later replace the buffer rule), Bandar Chukai planning boundary (none
provided).
