# MPK Kemaman Suspected Illegal Construction — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an "MPK Kemaman" area mode to the dashboard that highlights buildings outside the PBT industrial boundary (within an adjustable buffer) as suspected construction without Kebenaran Merancang, with revenue estimates and CSV export.

**Architecture:** An offline stdlib-Python script builds two static GeoJSON files in `mpk/` from Google Open Buildings + the API boundary. A new self-contained `mpk.js` + `mpk.css` add the mode, layers, panel tab and logic; `index.html` gets only markup slots and three one-line hooks.

**Tech Stack:** Python 3.12 stdlib, MapLibre GL JS 4.7, vanilla JS/CSS, Node (only to run the pure-logic test).

Spec: `docs/superpowers/specs/2026-10-06-mpk-illegal-construction-design.md`

## Global Constraints

- No new runtime libraries; no backend. Seremban mode must behave exactly as before.
- Labels say "Disyaki" (suspected), never a definitive "Haram".
- Buffer slider: 100–1000 m, step 50, default 500.
- Default rates (assumption, editable): fee RM 2.00/m²; Cukai Pintu RM 6.00/m²/year; persisted in `localStorage` key `mpk_rates` inside try/catch.
- Boundary name: "Sempadan Perindustrian Teluk Kalong / Chukai".
- Disclaimer text: "Berdasarkan Google Open Buildings + sempadan perindustrian PBT; perlu pengesahan tapak."
- Script self-checks: inside == 4159, outside ≤500 m == 1337.

## File Structure

- Create `tools/build_mpk_illegal.py` — data pre-process (download/filter/classify/write).
- Create `mpk/mpk_buildings.geojson`, `mpk/mpk_sempadan.geojson` — generated data (committed).
- Create `mpk.js` — pure logic (exported for Node test) + browser mode/layers/panel.
- Create `mpk.css` — panel + switcher styles.
- Create `tools/test_mpk_logic.js` — Node test of pure logic.
- Modify `index.html` — `<link>`/`<script>` tags, topbar switcher, panel tab + tab body, hooks in `initMap` style.load and `refresh3DLayers`.

---

### Task 1: Data pre-process script + generated data

**Files:** Create `tools/build_mpk_illegal.py`, outputs `mpk/mpk_buildings.geojson`, `mpk/mpk_sempadan.geojson`

**Interfaces — Produces:** building Feature properties `id` (int), `status` (`'dalam'|'luar'`), `jarak_m` (int, 0 when inside), `area_m2` (float 1dp), `confidence` (float 2dp), `plus_code` (str), `lng`, `lat` (centroid, 6dp). Boundary: one Polygon Feature with `name`.

- [ ] **Step 1: Write the script** (full code in repo file `tools/build_mpk_illegal.py`): stream S2 cell `31d` CSV (or `--csv` local file), filter bbox 103.36–103.52 E / 4.18–4.34 N, fetch API boundary ring #3, classify by Open Buildings centroid (`latitude`/`longitude` columns) with ray-cast PIP, distance to boundary segments in local metres (`kx = 111320·cos(4.27°)`, `ky = 110574`), keep inside or ≤1000 m, parse WKT `POLYGON((...))` outer ring, round coords to 6 dp, write both files, assert counts.
- [ ] **Step 2: Run** `python tools/build_mpk_illegal.py --csv <scratch>/ob_chukai.csv` → Expected: `inside=4159 outside<=500m=1337` and files written, assertions pass.
- [ ] **Step 3: Commit** `git add tools/build_mpk_illegal.py mpk/ && git commit -m "Add MPK suspected-illegal-construction data pre-process"`

### Task 2: Pure logic + Node test

**Files:** Create `mpk.js` (logic section), `tools/test_mpk_logic.js`

**Interfaces — Produces:**
- `mpkSuspectFilter(buffer) → MapLibre filter expression`
- `mpkSuspects(features, buffer) → Feature[]`
- `mpkStats(features, buffer, rates{fee,cukai}) → {count, area, inPlan, fee, cukai, suspects}` (suspects sorted by area desc)
- `mpkCSV(suspects, rates) → string` header `id,plus_code,lng,lat,jarak_m,area_m2,confidence,anggaran_fee_rm,anggaran_cukai_tahunan_rm`

- [ ] **Step 1: Write failing test** `tools/test_mpk_logic.js`:

```js
const assert = require('assert');
const { mpkSuspectFilter, mpkSuspects, mpkStats, mpkCSV } = require('../mpk.js');
const f = (id, status, jarak_m, area_m2) => ({ properties: { id, status, jarak_m, area_m2, confidence: 0.8, plus_code: 'X'+id, lng: 103.4, lat: 4.2 } });
const feats = [f(1,'dalam',0,100), f(2,'luar',100,50), f(3,'luar',600,200), f(4,'luar',500,30)];
assert.deepStrictEqual(mpkSuspects(feats, 500).map(x => x.properties.id), [2, 4]);
const s = mpkStats(feats, 500, { fee: 2, cukai: 6 });
assert.strictEqual(s.count, 2); assert.strictEqual(s.area, 80); assert.strictEqual(s.inPlan, 1);
assert.strictEqual(s.fee, 160); assert.strictEqual(s.cukai, 480);
assert.deepStrictEqual(s.suspects.map(x => x.properties.id), [2, 4]);
assert.deepStrictEqual(mpkSuspectFilter(250), ['all', ['==', ['get','status'], 'luar'], ['<=', ['get','jarak_m'], 250]]);
const csv = mpkCSV(s.suspects, { fee: 2, cukai: 6 }).trim().split('\n');
assert.strictEqual(csv.length, 3);
assert.strictEqual(csv[1], '2,X2,103.4,4.2,100,50,0.8,100.00,300.00');
console.log('mpk logic: all tests passed');
```

- [ ] **Step 2: Run** `node tools/test_mpk_logic.js` → Expected FAIL (`Cannot find module '../mpk.js'`).
- [ ] **Step 3: Implement** logic section at top of `mpk.js` (see repo), ending with `if (typeof module !== 'undefined') module.exports = {...}`.
- [ ] **Step 4: Run** `node tools/test_mpk_logic.js` → Expected `mpk logic: all tests passed`.
- [ ] **Step 5: Commit** `git commit -m "Add MPK suspected-construction logic with tests"`

### Task 3: Browser mode, layers, panel, hooks

**Files:** Modify `mpk.js` (browser section), create `mpk.css`, modify `index.html`

**Interfaces — Consumes:** globals from `index.html`: `map`, `datasets`, `is3D`, `refresh3DLayers()`, `switchTab(el, id)`, `showToast(msg)`, `addActivityLog(title, sub)`, `flyToData()`, `maplibregl`. **Produces:** `mpkSetMode(mode)`, `mpkOnStyleLoad()`, `mpkRefresh3D()`, `mpkOnBuffer(v)`, `mpkOnRate()`, `mpkZoomTo(id)`, `mpkExportCSV()`.

- [ ] **Step 1: index.html** — add `<link href="mpk.css" rel="stylesheet">` after Inter font link; add before Upload button in topbar:

```html
<select id="area-mode" class="area-mode-select" onchange="mpkSetMode(this.value)" title="Kawasan">
  <option value="seremban">Seremban</option>
  <option value="mpk">MPK Kemaman</option>
</select>
```

  add tab `<div class="ptab" id="ptab-mpk" style="display:none;" onclick="switchTab(this,'mpk')">Binaan Haram</div>` after the Activity tab; add `<div id="tab-mpk" style="display:none;"></div>` inside `.panel-body`; add `<script src="mpk.js"></script>` before `</body>`; in `initMap` change the style.load line to also call `if (typeof mpkOnStyleLoad === 'function') mpkOnStyleLoad();`; at end of `refresh3DLayers()` add `if (typeof mpkRefresh3D === 'function') mpkRefresh3D();`.
- [ ] **Step 2: mpk.js browser section** — state object, data loading, layers (`mpk-boundary-fill`, `mpk-boundary-line`, `mpk-plan-fill`, `mpk-suspect-fill`, `mpk-suspect-line`, `mpk-suspect-extrude`, `mpk-highlight-line`), Seremban hide/restore, enter/exit, style-reload re-add (deferred with `setTimeout(…, 0)` so it runs after basemap code re-adds Seremban layers), panel render, slider/rate handlers, popup, zoom, CSV download.
- [ ] **Step 3: mpk.css** — switcher + panel styles using existing tokens (`--orange`, `--red`, `--charcoal-dark`).
- [ ] **Step 4: Manual browser check** (`python -m http.server 8000`): switch to MPK → map fits Chukai, red buildings, tab visible; slider 250 → count 502; rates edit → revenue updates; list click zooms + popup; CSV downloads 1,337 rows at 500 m; 3D toggle extrudes red buildings; basemap switch keeps MPK layers; switch back → Seremban restored, tab hidden.
- [ ] **Step 5: Commit** `git commit -m "Add MPK Kemaman suspected illegal construction mode"`

### Task 4: README

- [ ] Add an "MPK Kemaman mode" section to `README.md` (purpose, rule, data sources, how to regenerate data). Commit.
