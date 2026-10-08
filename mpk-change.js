// ============================================================
// MPK KEMAMAN — CHANGE DETECTION
// Compare a "before" and an "after" image from ONE satellite and flag the pixels that
// changed: new built-up (hard surface), land cleared, or vegetation gain.
//   Sentinel-2 / Landsat: NDVI + NDBI index maps for the study area are fetched from
//     Microsoft Planetary Computer at native resolution; clouds are masked (Sentinel-2
//     SCL plus a bright-blue test, Landsat bright-blue test).
//   Esri Wayback: plain RGB photos, so only vegetation change (excess-green index).
// The result is drawn over the map and joined to the building footprints, so MPK sees
// which buildings stand on newly built-up or cleared land.
// Loaded after mpk.js; uses its MPK state, helpers and data.
// ============================================================

// ---------- Pure logic (also exported for tools/test_mpk_change.js) ----------
// NDVI change thresholds (NDVI is physically calibrated, so fixed values work across dates)
const MPK_NDVI_TH = { veg: 0.4, bare: 0.25, delta: 0.25 };
// Esri photos: excess-green after colour-matching the Before photo to the After photo and
// centring both on the After photo's green threshold (mpkEsriIndices)
const MPK_EXG_TH = { veg: 0.02, bare: -0.02, delta: 0.08 };

// Otsu threshold: best split of the valid pixels into two classes, placed midway
// between the two class means
function mpkOtsu(values, valid, lo = -0.3, hi = 0.8, bins = 220) {
  const hist = new Array(bins).fill(0);
  let n = 0;
  for (let i = 0; i < values.length; i++) {
    if (!valid[i]) continue;
    const b = Math.min(bins - 1, Math.max(0, Math.floor((values[i] - lo) / (hi - lo) * bins)));
    hist[b]++; n++;
  }
  if (!n) return 0;
  let total = 0;
  for (let b = 0; b < bins; b++) total += b * hist[b];
  let wB = 0, sumB = 0, best = -1, split = 0;
  for (let b = 0; b < bins; b++) {
    wB += hist[b];
    sumB += b * hist[b];
    const wF = n - wB;
    if (!wB || !wF) continue;
    const mB = sumB / wB, mF = (total - sumB) / wF, between = wB * wF * (mB - mF) ** 2;
    if (between > best) { best = between; split = (mB + mF) / 2; }
  }
  // midway between the two class means (bin centres), not the edge of the lower class
  return lo + (split + 0.5) / bins * (hi - lo);
}

// Map each channel of `src` onto the value distribution of `ref` (histogram matching)
function mpkMatchChannel(src, ref, valid, ch) {
  const cdf = data => {
    const h = new Float64Array(256);
    let n = 0;
    for (let i = 0; i < valid.length; i++) if (valid[i]) { h[data[i * 4 + ch]]++; n++; }
    for (let v = 1; v < 256; v++) h[v] += h[v - 1];
    return h.map(c => c / (n || 1));
  };
  const cs = cdf(src), cr = cdf(ref), lut = new Uint8Array(256);
  for (let v = 0, r = 0; v < 256; v++) {
    while (r < 255 && cr[r] < cs[v] - 1e-9) r++;
    lut[v] = r;
  }
  return lut;
}

// Excess-green for two Esri photos, made comparable. Water and dark pixels are dropped. Esri
// images are mosaics of captures from different dates, so `groups` gives each pixel its
// capture-date pair (-1 = same capture in both images, nothing to compare); within each group
// the Before colours are matched to the After photo and both are centred on one green
// threshold (Otsu on the After photo): > 0 green, < 0 not. groups = null: one group.
// opts.width + opts.cloudMargin: drop clouds (bright, colourless) in either photo plus a
// margin of that many pixels around them (hazy cloud edges).
function mpkEsriIndices(rgbaBefore, rgbaAfter, groups = null, opts = {}) {
  const n = rgbaBefore.length / 4, valid = new Uint8Array(n);
  const group = i => (groups ? groups[i] : 0);
  const usable = (d, p) => d[p + 3] > 0 && d[p] + d[p + 1] + d[p + 2] > 60 &&
    !(d[p + 2] > d[p + 1] && d[p + 2] > d[p]);                  // blue-dominant = water
  const cloudy = (d, p) => Math.min(d[p], d[p + 1], d[p + 2]) > 175 &&
    Math.max(d[p], d[p + 1], d[p + 2]) - Math.min(d[p], d[p + 1], d[p + 2]) < 40;
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    valid[i] = group(i) >= 0 && usable(rgbaBefore, p) && usable(rgbaAfter, p) ? 1 : 0;
  }
  if (opts.width) {
    const w = opts.width, h = n / w, r = opts.cloudMargin || 0, cloud = new Uint8Array(n);
    for (let i = 0, p = 0; i < n; i++, p += 4) cloud[i] = cloudy(rgbaBefore, p) || cloudy(rgbaAfter, p) ? 1 : 0;
    // dilate: separable max filter, rows then columns
    const rows = new Uint8Array(n);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let c = 0;
        for (let k = Math.max(0, x - r); k <= Math.min(w - 1, x + r) && !c; k++) c = cloud[y * w + k];
        rows[y * w + x] = c;
      }
    }
    for (let x = 0; x < w; x++) {
      for (let y = 0; y < h; y++) {
        let c = 0;
        for (let k = Math.max(0, y - r); k <= Math.min(h - 1, y + r) && !c; k++) c = rows[k * w + x];
        if (c) valid[y * w + x] = 0;
      }
    }
  }
  const exgB = new Float32Array(n), exgA = new Float32Array(n);
  const ids = new Set();
  for (let i = 0; i < n; i++) if (valid[i]) ids.add(group(i));
  for (const g of ids) {
    const inGroup = Uint8Array.from(valid, (v, i) => (v && group(i) === g ? 1 : 0));
    const luts = [0, 1, 2].map(ch => mpkMatchChannel(rgbaBefore, rgbaAfter, inGroup, ch));
    for (let i = 0, p = 0; i < n; i++, p += 4) {
      if (!inGroup[i]) continue;
      exgB[i] = mpkExg(luts[0][rgbaBefore[p]], luts[1][rgbaBefore[p + 1]], luts[2][rgbaBefore[p + 2]]);
      exgA[i] = mpkExg(rgbaAfter[p], rgbaAfter[p + 1], rgbaAfter[p + 2]);
    }
    const t = mpkOtsu(exgA, inGroup);
    for (let i = 0; i < n; i++) if (inGroup[i]) { exgB[i] -= t; exgA[i] -= t; }
  }
  return { before: { ndvi: exgB, valid }, after: { ndvi: exgA, valid } };
}

// Sentinel-2 index expressions; processing baseline 04.00 (25 Jan 2022) adds 1000 to bands
// plus a bright-blue cloud test, because the scene classification misses small clouds
function mpkS2Expressions(date) {
  const newBaseline = date >= '2022-01-25', off = newBaseline ? '-2000' : '';
  return { ndvi: `(B08-B04)/(B08+B04${off})`, ndbi: `(B11-B08)/(B11+B08${off})`,
           cloud: `(B02${newBaseline ? '-1000' : ''})>2200` };
}

// Landsat Collection 2 surface reflectance = DN * 0.0000275 - 0.2
function mpkLandsatExpressions() {
  const r = b => `(${b}*0.0000275-0.2)`;
  return {
    ndvi: `(${r('nir08')}-${r('red')})/(${r('nir08')}+${r('red')})`,
    ndbi: `(${r('swir16')}-${r('nir08')})/(${r('swir16')}+${r('nir08')})`,
    cloud: `${r('blue')}>0.25`,
  };
}

// before/after: { ndvi: number[], ndbi?: number[], valid: 0/1[] }. Returns 0/1 per pixel.
function mpkClassifyChange(type, before, after, th = MPK_NDVI_TH) {
  const n = before.ndvi.length, out = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    if (!before.valid[i] || !after.valid[i]) continue;
    const vB = before.ndvi[i], vA = after.ndvi[i];
    if (type === 'cleared') out[i] = vB >= th.veg && vA <= th.bare && vB - vA >= th.delta ? 1 : 0;
    else if (type === 'gain') out[i] = vB <= th.bare && vA >= th.veg && vA - vB >= th.delta ? 1 : 0;
    else if (type === 'built') {
      // was clearly vegetated, is not now, and the built-up index rose well past seasonal
      // swings (an existing town drifts ~0.1 between dry and wet months)
      const bB = before.ndbi[i], bA = after.ndbi[i];
      out[i] = vB >= 0.35 && vA <= 0.2 && bA - bB >= 0.15 && bA > -0.05 ? 1 : 0;
    }
  }
  return out;
}

// Excess-green index from RGB 0-255: vegetation > ~0.08, bare / built < ~0.02
function mpkExg(r, g, b) {
  const sum = r + g + b;
  return sum ? (2 * g - r - b) / sum : 0;
}

// A pixel from a boolean Planetary Computer expression is set when non-zero (raw 0/1)
function mpkFlag(value) {
  return value > 0;
}

const mpkMercY = lat => Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360));

// [col, row] of a lng/lat on a grid (row 0 = north), or null outside it.
// grid.proj 'geo' = equal-angle rows (Planetary Computer bbox), 'merc' = Web Mercator tiles
function mpkPixelOf(lng, lat, grid) {
  if (lng < grid.west || lng > grid.east || lat < grid.south || lat > grid.north) return null;
  const fx = (lng - grid.west) / (grid.east - grid.west);
  const fy = grid.proj === 'merc'
    ? (mpkMercY(grid.north) - mpkMercY(lat)) / (mpkMercY(grid.north) - mpkMercY(grid.south))
    : (grid.north - lat) / (grid.north - grid.south);
  return [Math.min(grid.w - 1, Math.floor(fx * grid.w)), Math.min(grid.h - 1, Math.floor(fy * grid.h))];
}

// Buildings whose centroid pixel changed, or (radius 1, fine pixels) a pixel next to it
function mpkBuildingsInMask(features, mask, grid, radius = 1) {
  return features.filter(f => {
    const px = mpkPixelOf(f.properties.lng, f.properties.lat, grid);
    if (!px) return false;
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const x = px[0] + dx, y = px[1] + dy;
        if (x >= 0 && y >= 0 && x < grid.w && y < grid.h && mask[y * grid.w + x]) return true;
      }
    }
    return false;
  });
}

// lng/lat of a pixel centre
function mpkPixelCenter(c, r, grid) {
  const lng = grid.west + (c + 0.5) / grid.w * (grid.east - grid.west);
  if (grid.proj !== 'merc') return [lng, grid.north - (r + 0.5) / grid.h * (grid.north - grid.south)];
  const y = mpkMercY(grid.north) - (r + 0.5) / grid.h * (mpkMercY(grid.north) - mpkMercY(grid.south));
  return [lng, Math.atan(Math.sinh(y)) * 180 / Math.PI];
}

function mpkInRing(x, y, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// Valid pixels whose centre lies inside a footprint (the centroid pixel when none does)
function mpkFootprintPixels(f, grid, valid) {
  const ring = f.geometry.coordinates[0];
  const lngs = ring.map(p => p[0]), lats = ring.map(p => p[1]);
  const a = mpkPixelOf(Math.min(...lngs), Math.max(...lats), grid), b = mpkPixelOf(Math.max(...lngs), Math.min(...lats), grid);
  const out = [];
  if (a && b) {
    for (let r = a[1]; r <= b[1]; r++) {
      for (let c = a[0]; c <= b[0]; c++) {
        const [x, y] = mpkPixelCenter(c, r, grid);
        if (mpkInRing(x, y, ring) && valid[r * grid.w + c]) out.push(r * grid.w + c);
      }
    }
  }
  if (!out.length) {
    const px = mpkPixelOf(f.properties.lng, f.properties.lat, grid);
    if (px && valid[px[1] * grid.w + px[0]]) out.push(px[1] * grid.w + px[0]);
  }
  return out;
}

// Buildings that are new between the two images, judged on the mean of their footprint
// pixels. 'spectral' (Sentinel-2/Landsat): green before, not green after, built-up index up.
// 'exg' (Esri photos, Otsu-centred excess-green): green before, not green after
// (bare soil → roof is not detectable in plain photos).
function mpkNewBuildings(features, grid, before, after, kind) {
  const valid = before.valid.map((v, i) => v && after.valid[i]);
  const mean = (arr, px) => px.reduce((s, i) => s + arr[i], 0) / px.length;
  return features.filter(f => {
    const px = mpkFootprintPixels(f, grid, valid);
    if (!px.length) return false;
    const vB = mean(before.ndvi, px), vA = mean(after.ndvi, px);
    if (kind === 'exg') return vB >= MPK_EXG_TH.veg && vA <= MPK_EXG_TH.bare;   // centred values
    return vB >= 0.35 && vA <= 0.25 && mean(after.ndbi, px) - mean(before.ndbi, px) >= 0.1;
  });
}

// Morphological opening (erode then dilate, square of radius r): removes specks smaller than
// the square and keeps larger patches at their size
function mpkOpenMask(mask, w, r) {
  const h = mask.length / w;
  const pass = (src, keep) => {               // keep = 'all' (erode) or 'any' (dilate)
    const rows = new Uint8Array(src.length), out = new Uint8Array(src.length);
    const test = keep === 'all' ? (acc, v) => acc && v : (acc, v) => acc || v;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let acc = keep === 'all' ? 1 : 0;
        for (let k = x - r; k <= x + r; k++) acc = test(acc, k >= 0 && k < w ? src[y * w + k] : 0);
        rows[y * w + x] = acc ? 1 : 0;
      }
    }
    for (let x = 0; x < w; x++) {
      for (let y = 0; y < h; y++) {
        let acc = keep === 'all' ? 1 : 0;
        for (let k = y - r; k <= y + r; k++) acc = test(acc, k >= 0 && k < h ? rows[k * w + x] : 0);
        out[y * w + x] = acc ? 1 : 0;
      }
    }
    return out;
  };
  return pass(pass(mask, 'all'), 'any');
}

function mpkMaskHectares(mask, pixelMetres) {
  let n = 0;
  for (const v of mask) n += v;
  return Math.round(n * pixelMetres * pixelMetres / 100) / 100;
}

// Vegetation heatmap: per-pixel intensity 0..1 of the NDVI change in one direction ('gain' up,
// 'cleared' down). Below half the detection threshold it is noise (0); it saturates at 2.5x.
function mpkHeatValues(type, before, after, th) {
  const n = before.ndvi.length, out = new Float32Array(n), start = th.delta * 0.5, span = th.delta * 2;
  for (let i = 0; i < n; i++) {
    if (!before.valid[i] || !after.valid[i]) continue;
    const d = (after.ndvi[i] - before.ndvi[i]) * (type === 'gain' ? 1 : -1);
    if (d > start) out[i] = Math.min(1, (d - start) / span);
  }
  return out;
}

// Heatmap colour [r, g, b, a] for an intensity 0..1: transparent → light → dark
const MPK_HEAT_RAMPS = {
  gain:    [[198, 239, 156], [102, 189, 99], [26, 152, 80], [0, 90, 50]],     // light → deep green
  cleared: [[255, 237, 160], [254, 178, 76], [240, 59, 32], [140, 20, 20]],   // yellow → dark red
};
function mpkHeatColor(type, t) {
  if (t <= 0) return [0, 0, 0, 0];
  const ramp = MPK_HEAT_RAMPS[type], x = Math.min(1, t) * (ramp.length - 1), i = Math.min(ramp.length - 2, Math.floor(x));
  const f = x - i, c = ramp[i].map((v, k) => Math.round(v + (ramp[i + 1][k] - v) * f));
  return [...c, Math.round(70 + 185 * Math.min(1, t))];
}

// Heatmap as a transparent PNG (data URL) over the grid
function mpkHeatImage(values, grid, type) {
  const c = document.createElement('canvas');
  c.width = grid.w; c.height = grid.h;
  const ctx = c.getContext('2d'), img = ctx.createImageData(grid.w, grid.h);
  for (let i = 0, p = 0; i < values.length; i++, p += 4) {
    if (!values[i]) continue;
    const col = mpkHeatColor(type, values[i]);
    img.data[p] = col[0]; img.data[p + 1] = col[1]; img.data[p + 2] = col[2]; img.data[p + 3] = col[3];
  }
  ctx.putImageData(img, 0, 0);
  return c.toDataURL();
}

// One building list from several detect types: each building once, tagged with every type
// that found it, largest first. layers = { type: { buildings } }
function mpkMergeBuildings(layers) {
  const byId = new Map();
  for (const [type, layer] of Object.entries(layers)) {
    for (const f of layer.buildings) {
      const id = f.properties.id;
      if (!byId.has(id)) byId.set(id, { feature: f, types: [] });
      byId.get(id).types.push(type);
    }
  }
  return [...byId.values()].sort((x, y) => y.feature.properties.area_m2 - x.feature.properties.area_m2);
}

// Is a dashboard result for the same area and the same two images as a compare-page state?
function mpkResultMatches(result, state) {
  if (!result || !state) return false;
  const same = (x, y) => x && y && x.source === y.source && (x.source === 'esri' ? x.release === y.release : x.item === y.item);
  return result.area === state.area && !!same(result.before, state.before) && !!same(result.after, state.after);
}

// Link to the before/after swipe page (/compare/) carrying the whole comparison
function mpkCompareUrl(state) {
  return '/compare/?d=' + encodeURIComponent(JSON.stringify(state));
}

function mpkCompareParse(search) {
  try {
    const d = new URLSearchParams(search).get('d');
    return d ? JSON.parse(d) : null;
  } catch (e) {
    return null;
  }
}

if (typeof module !== 'undefined') {
  module.exports = { mpkHeatValues, mpkHeatColor, mpkMergeBuildings, mpkResultMatches, mpkOpenMask, MPK_EXG_TH, mpkOtsu, mpkEsriIndices, mpkNewBuildings, mpkCompareUrl, mpkCompareParse, mpkFlag, mpkClassifyChange, mpkS2Expressions, mpkLandsatExpressions, mpkPixelOf,
                     mpkBuildingsInMask, mpkExg, mpkMaskHectares };
}

// ---------- Browser ----------
const MPK_CHANGE_TYPES = {
  newbld:  { label: 'New buildings', rgb: [170, 0, 255], hint: 'Building footprints on land that was green in the Before image and is built now' },
  built:   { label: 'New built-up', rgb: [41, 98, 255], hint: 'Bare land or vegetation → hard surface (buildings, concrete, roads)' },
  cleared: { label: 'Land cleared', rgb: [255, 145, 0], hint: 'Vegetation → bare land' },
  gain:    { label: 'Vegetation gain', rgb: [0, 200, 83], hint: 'Bare land → grass or vegetation' },
};
const MPK_CHANGE_SATS = {
  s2:      { label: 'Sentinel-2 (10 m)', res: 10, types: ['newbld', 'built', 'cleared', 'gain'] },
  landsat: { label: 'Landsat (30 m)', res: 30, types: ['newbld', 'built', 'cleared', 'gain'] },
  esri:    { label: 'Esri Wayback (high-res)', res: null, types: ['newbld', 'cleared', 'gain'] },
};
const MPK_PC_BBOX = 'https://planetarycomputer.microsoft.com/api/data/v1/item/bbox/';
const MPK_S2_CLOUD = new Set([0, 3, 8, 9, 10]);         // no data, shadow, cloud, cirrus
const MPK_CHANGE_MAX_CLOUD = 30;                         // % — cloudier images are not offered

const MPK_CHANGE = { sat: 's2', types: new Set(['newbld']), result: null, view: 'after', overlayOn: true,
                     shown: {}, busy: false };   // shown: per-type map visibility of the result

function mpkChangeCardHTML() {
  const sats = Object.entries(MPK_CHANGE_SATS)
    .map(([k, s]) => `<option value="${k}">${s.label}</option>`).join('');
  const types = Object.entries(MPK_CHANGE_TYPES).map(([k, t]) =>
    `<button type="button" class="mpk-cd-type" data-type="${k}" role="checkbox" aria-checked="false"
       onclick="mpkChangeType('${k}')" title="${t.hint}"><i class="sw" style="background:rgb(${t.rgb})"></i>${t.label}</button>`).join('');
  return `
    <div class="mpk-card mpk-change">
      <div class="mpk-card-title">Change detection</div>
      <div class="mpk-cd-sub">Compare two dates from one satellite and detect what changed.</div>
      <div class="mpk-wb-row"><label for="mpk-cd-sat">Satellite</label>
        <select id="mpk-cd-sat" onchange="mpkChangeSat(this.value)">${sats}</select></div>
      <div class="mpk-wb-row"><label for="mpk-cd-before">Before</label><select id="mpk-cd-before"></select></div>
      <div class="mpk-wb-row"><label for="mpk-cd-after">After</label><select id="mpk-cd-after"></select></div>
      <div class="mpk-cd-label">Detect <span class="mpk-cd-hint">— tick one or more</span></div>
      <div class="mpk-cd-types">${types}</div>
      <div class="mpk-cd-actions">
        <button type="button" class="mpk-btn mpk-cd-go" id="mpk-cd-go" onclick="mpkChangeGenerate()">Generate</button>
        <button type="button" class="mpk-wb-btn mpk-cd-compare" onclick="mpkChangeCompare()"
          title="Open a new tab with a swipe slider: Before on the left, After on the right">Compare ↗</button>
      </div>
      <div class="mpk-cd-status" id="mpk-cd-status" role="status"></div>
      <div id="mpk-cd-result" hidden>
        <div class="mpk-cd-views" role="tablist">
          <button type="button" data-view="before" onclick="mpkChangeView('before')">Before</button>
          <button type="button" data-view="after" onclick="mpkChangeView('after')">After</button>
          <button type="button" data-view="map" onclick="mpkChangeView('map')">Basemap</button>
        </div>
        <div class="mpk-layer-row mpk-cd-overlay">
          <div class="mpk-layer-main">Show change result on the map</div>
          <button type="button" class="layer-toggle on" id="mpk-cd-tog" role="switch" aria-checked="true"
            aria-label="Show change result on the map" onclick="mpkChangeToggleOverlay()"></button>
        </div>
        <div class="mpk-cd-stats" id="mpk-cd-stats"></div>
        <div class="mpk-list mpk-cd-list" id="mpk-cd-list"></div>
        <button type="button" class="mpk-wb-btn mpk-cd-clear" onclick="mpkChangeClear()">Clear result</button>
      </div>
    </div>`;
}

// Area analysed: the selected chip, or Teluk Kalong for 'All'
function mpkChangeArea() {
  return MPK.area === 'all' ? 'tk' : MPK.area;
}

// Dates on offer for a satellite over the area (cloudy images left out), oldest first
function mpkChangeOptions(sat) {
  const area = mpkChangeArea();
  if (sat === 'esri') return MPK.data.wayback ? mpkEsriImages(MPK.data.wayback.history, area) : [];
  const file = MPK.data[sat === 's2' ? 'sentinel' : 'landsat'];
  const years = (file && file.areas[area]) || {};
  return Object.keys(years).sort().flatMap(y => years[y].filter(e => e && e.cloud <= MPK_CHANGE_MAX_CLOUD)
    .map(e => ({ source: sat, ...e })));
}

function mpkChangeInit() {
  const sel = document.getElementById('mpk-cd-sat');
  if (!sel) return;
  [...sel.options].forEach(o => {
    o.disabled = !mpkChangeOptions(o.value).length;
  });
  mpkChangeSat(MPK_CHANGE.sat);
}

function mpkChangeSat(sat) {
  MPK_CHANGE.sat = sat;
  document.getElementById('mpk-cd-sat').value = sat;
  const opts = mpkChangeOptions(sat);
  const label = e => (e.source === 'esri' ? mpkMonthLabel(e.date) + ' · high-res'
    : `${mpkDayLabel(e.date)} · ${Math.round(e.cloud)}% cloud`);
  const html = opts.map((e, i) => `<option value="${i}">${label(e)}</option>`).join('');
  const before = document.getElementById('mpk-cd-before'), after = document.getElementById('mpk-cd-after');
  before.innerHTML = html;
  after.innerHTML = html;
  before.value = 0;
  after.value = Math.max(0, opts.length - 1);
  const types = MPK_CHANGE_SATS[sat].types;
  document.querySelectorAll('.mpk-cd-type').forEach(b => { b.hidden = !types.includes(b.dataset.type); });
  for (const t of [...MPK_CHANGE.types]) if (!types.includes(t)) MPK_CHANGE.types.delete(t);   // not offered here
  if (!MPK_CHANGE.types.size) MPK_CHANGE.types.add(types[0]);
  mpkChangeTypeButtons();
  mpkChangeStatus('');
}

// Tick / untick a detect type (at least one stays ticked)
function mpkChangeType(type) {
  const t = MPK_CHANGE.types;
  if (t.has(type)) { if (t.size > 1) t.delete(type); } else t.add(type);
  mpkChangeTypeButtons();
}

function mpkChangeTypeButtons() {
  document.querySelectorAll('.mpk-cd-type').forEach(b => {
    const on = MPK_CHANGE.types.has(b.dataset.type);
    b.classList.toggle('active', on);
    b.setAttribute('aria-checked', String(on));
  });
}

function mpkChangeStatus(text, isError) {
  const el = document.getElementById('mpk-cd-status');
  if (!el) return;
  el.textContent = text;
  el.classList.toggle('error', !!isError);
}

// Grid of the area at the satellite's native resolution (lng/lat rows)
function mpkChangeGrid(res) {
  const [[w, s], [e, n]] = MPK.bounds[mpkChangeArea()];
  const pad = 0.001, west = w - pad, east = e + pad, south = s - pad, north = n + pad;
  const kx = 111320 * Math.cos((north + south) / 2 * Math.PI / 180);
  return { west, east, south, north, proj: 'geo',
           w: Math.min(1500, Math.round((east - west) * kx / res)), h: Math.min(1500, Math.round((north - south) * 110574 / res)) };
}

async function mpkDecodePng(blob, w, h) {
  const bmp = await createImageBitmap(blob);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bmp, 0, 0, w, h);
  return ctx.getImageData(0, 0, w, h).data;
}

async function mpkFetchBbox(collection, item, params, grid) {
  const q = new URLSearchParams({ collection, item, ...params });
  const url = `${MPK_PC_BBOX}${grid.west},${grid.south},${grid.east},${grid.north}/${grid.w}x${grid.h}.png?${q}`;
  for (let attempt = 1; ; attempt++) {             // the tiler sometimes drops a request: retry
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Planetary Computer HTTP ${res.status}`);
      return await mpkDecodePng(await res.blob(), grid.w, grid.h);
    } catch (err) {
      if (attempt >= 3) throw err;
      await new Promise(r => setTimeout(r, 1000 * attempt));
    }
  }
}

// NDVI / NDBI / validity for one Sentinel-2 or Landsat image
async function mpkSpectral(entry, grid) {
  const n = grid.w * grid.h, ndvi = new Float32Array(n), ndbi = new Float32Array(n), valid = new Uint8Array(n);
  const index = { rescale: '-1,1', asset_as_band: 'true' };
  let exprs, collection, maskPromise;
  if (entry.source === 's2') {
    collection = 'sentinel-2-l2a';
    exprs = mpkS2Expressions(entry.date);
    maskPromise = Promise.all([
      mpkFetchBbox(collection, entry.item, { assets: 'SCL', resampling: 'nearest' }, grid),
      mpkFetchBbox(collection, entry.item, { expression: exprs.cloud, rescale: '0,1', asset_as_band: 'true' }, grid),
    ]);
  } else {
    collection = 'landsat-c2-l2';
    exprs = mpkLandsatExpressions();
    maskPromise = mpkFetchBbox(collection, entry.item, { expression: exprs.cloud, rescale: '0,1', asset_as_band: 'true' }, grid);
  }
  const [v, b, m] = await Promise.all([
    mpkFetchBbox(collection, entry.item, { expression: exprs.ndvi, ...index }, grid),
    mpkFetchBbox(collection, entry.item, { expression: exprs.ndbi, ...index }, grid),
    maskPromise,
  ]);
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    ndvi[i] = v[p] / 255 * 2 - 1;
    ndbi[i] = b[p] / 255 * 2 - 1;
    // boolean expressions come back as raw 0/1, not rescaled to 0-255
    const clear = entry.source === 's2' ? !MPK_S2_CLOUD.has(m[0][p]) && !mpkFlag(m[1][p]) : !mpkFlag(m[p]);
    const hasData = entry.source === 's2' ? m[0][p + 3] > 0 : m[p + 3] > 0;
    valid[i] = v[p + 3] > 0 && b[p + 3] > 0 && hasData && clear ? 1 : 0;
  }
  return { ndvi, ndbi, valid };
}

// Esri photo tiles covering the area, stitched; zoom chosen so ~64 tiles at most
async function mpkEsriGrid() {
  const [[w, s], [e, n]] = MPK.bounds[mpkChangeArea()];
  const tx = (lng, z) => Math.floor((lng + 180) / 360 * 2 ** z);
  const ty = (lat, z) => Math.floor((1 - mpkMercY(lat) / Math.PI) / 2 * 2 ** z);
  let z = 17;
  while (z > 13 && (tx(e, z) - tx(w, z) + 1) * (ty(s, z) - ty(n, z) + 1) > 64) z--;
  const x0 = tx(w, z), x1 = tx(e, z), y0 = ty(n, z), y1 = ty(s, z);
  const lngOf = x => x / 2 ** z * 360 - 180;
  const latOf = y => Math.atan(Math.sinh(Math.PI * (1 - 2 * y / 2 ** z))) * 180 / Math.PI;
  return { z, x0, x1, y0, y1, proj: 'merc', west: lngOf(x0), east: lngOf(x1 + 1), north: latOf(y0), south: latOf(y1 + 1),
           w: (x1 - x0 + 1) * 256, h: (y1 - y0 + 1) * 256, metres: 40075016 * Math.cos(4.25 * Math.PI / 180) / 2 ** z / 256 };
}

// Esri photo tiles over the grid, stitched: raw RGBA pixels
async function mpkEsriPixels(entry, grid) {
  const c = document.createElement('canvas');
  c.width = grid.w; c.height = grid.h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  const loads = [];
  for (let x = grid.x0; x <= grid.x1; x++) {
    for (let y = grid.y0; y <= grid.y1; y++) {
      const url = mpkWaybackTileUrl(entry.release).replace('{z}', grid.z).replace('{y}', y).replace('{x}', x);
      loads.push(new Promise(resolve => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => { ctx.drawImage(img, (x - grid.x0) * 256, (y - grid.y0) * 256); resolve(); };
        img.onerror = () => resolve();           // missing tile = no data there
        img.src = url;
      }));
    }
  }
  await Promise.all(loads);
  return ctx.getImageData(0, 0, grid.w, grid.h).data;
}

// Selected Before / After entries, or an error message
function mpkChangePicked() {
  const opts = mpkChangeOptions(MPK_CHANGE.sat);
  const before = opts[+document.getElementById('mpk-cd-before').value];
  const after = opts[+document.getElementById('mpk-cd-after').value];
  if (!before || !after || before.date >= after.date) return { error: 'Pick a "Before" date earlier than the "After" date.' };
  return { before, after };
}

// Before/after swipe view in a new tab, at the current map position
function mpkChangeCompare() {
  const pick = mpkChangePicked();
  if (pick.error) { mpkChangeStatus(pick.error, true); return; }
  mpkChangeStatus('');
  const c = map.getCenter();
  window.open(mpkCompareUrl({ area: mpkChangeArea(), before: pick.before, after: pick.after,
    center: [+c.lng.toFixed(5), +c.lat.toFixed(5)], zoom: +map.getZoom().toFixed(2) }), '_blank');
}

// Capture-date polygons of an Esri image (its metadata service), drawn onto the grid: the
// capture index of every pixel (-1 where unknown) and the list of capture dates
async function mpkEsriCaptures(entry, grid) {
  if (!entry.metadata) return null;
  const env = JSON.stringify({ xmin: grid.west, ymin: grid.south, xmax: grid.east, ymax: grid.north, spatialReference: { wkid: 4326 } });
  let feats = [];
  for (const layer of [5, 6, 7]) {                 // 60 cm, 1.2 m, 2.4 m footprints: first that answers
    const q = new URLSearchParams({ geometry: env, geometryType: 'esriGeometryEnvelope', inSR: 4326, outSR: 4326,
      spatialRel: 'esriSpatialRelIntersects', outFields: 'SRC_DATE2', returnGeometry: 'true', f: 'json' });
    const res = await fetch(`${entry.metadata}/${layer}/query?${q}`);
    feats = res.ok ? ((await res.json()).features || []).filter(f => f.attributes.SRC_DATE2 && f.geometry) : [];
    if (feats.length) break;
  }
  if (!feats.length) return null;
  const dates = feats.map(f => new Date(f.attributes.SRC_DATE2).toISOString().slice(0, 10));
  const c = document.createElement('canvas');
  c.width = grid.w; c.height = grid.h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  const yOf = lat => (mpkMercY(grid.north) - mpkMercY(lat)) / (mpkMercY(grid.north) - mpkMercY(grid.south)) * grid.h;
  feats.forEach((f, k) => {                        // index k encoded as red = (k + 1) * 8
    ctx.fillStyle = `rgb(${(k + 1) * 8},0,0)`;
    ctx.beginPath();
    for (const ring of f.geometry.rings) {
      ring.forEach(([lng, lat], j) => {
        const x = (lng - grid.west) / (grid.east - grid.west) * grid.w, y = yOf(lat);
        if (j) ctx.lineTo(x, y); else ctx.moveTo(x, y);
      });
      ctx.closePath();
    }
    ctx.fill('evenodd');
  });
  const d = ctx.getImageData(0, 0, grid.w, grid.h).data, ids = new Int16Array(grid.w * grid.h);
  for (let i = 0, p = 0; i < ids.length; i++, p += 4) {
    // anti-aliased polygon edges blend colours: keep exact codes only
    ids[i] = d[p + 3] === 255 && d[p] % 8 === 0 && d[p] / 8 - 1 < dates.length ? d[p] / 8 - 1 : -1;
  }
  return { ids, dates };
}

// Group each pixel by its Before/After capture-date pair; -1 where both images show the same
// (or an older-after-newer) capture. Returns the groups and each pair's share of the area.
function mpkEsriGroups(capB, capA) {
  const n = capB.ids.length, groups = new Int32Array(n).fill(-1), keys = new Map(), count = new Map();
  let same = 0;
  for (let i = 0; i < n; i++) {
    const kb = capB.ids[i], ka = capA.ids[i];
    if (kb < 0 || ka < 0) continue;
    const dB = capB.dates[kb], dA = capA.dates[ka];
    if (dB >= dA) { same++; continue; }
    const key = dB.slice(0, 7) + ' → ' + dA.slice(0, 7);
    if (!keys.has(key)) keys.set(key, keys.size);
    groups[i] = keys.get(key);
    count.set(key, (count.get(key) || 0) + 1);
  }
  const pairs = [...count.entries()].sort((x, y) => y[1] - x[1]).map(([key, c]) => ({ key, share: c / n }));
  return { groups, pairs, same: same / n };
}

async function mpkChangeGenerate() {
  if (MPK_CHANGE.busy) return;
  const sat = MPK_CHANGE.sat, pick = mpkChangePicked();
  if (pick.error) { mpkChangeStatus(pick.error, true); return; }
  const { before, after } = pick;
  MPK_CHANGE.busy = true;
  document.getElementById('mpk-cd-go').disabled = true;
  mpkChangeStatus(`Fetching ${MPK_CHANGE_SATS[sat].label} data for both dates…`);
  try {
    let grid, b, a, th = MPK_NDVI_TH, pixelMetres, esriDates = null;
    if (sat === 'esri') {
      grid = await mpkEsriGrid();
      const [pxB, pxA, capB, capA] = await Promise.all([mpkEsriPixels(before, grid), mpkEsriPixels(after, grid),
        mpkEsriCaptures(before, grid).catch(() => null), mpkEsriCaptures(after, grid).catch(() => null)]);
      // Esri images are mosaics of several capture dates: compare only areas imaged on different
      // dates, each date pair on its own (falls back to one group if the metadata is missing)
      esriDates = capB && capA ? mpkEsriGroups(capB, capA) : null;
      ({ before: b, after: a } = mpkEsriIndices(pxB, pxA, esriDates ? esriDates.groups : null,
        { width: grid.w, cloudMargin: Math.round(30 / grid.metres) }));       // ~30 m around clouds
      th = MPK_EXG_TH;
      pixelMetres = grid.metres;
    } else {
      pixelMetres = MPK_CHANGE_SATS[sat].res;
      grid = mpkChangeGrid(pixelMetres);
      [b, a] = await Promise.all([mpkSpectral(before, grid), mpkSpectral(after, grid)]);
    }
    mpkChangeStatus('Analysing…');
    const area = mpkChangeArea();
    let usable = 0;
    for (let i = 0; i < b.valid.length; i++) usable += b.valid[i] && a.valid[i];
    const feats = MPK.data.buildings.features.filter(f => f.properties.kawasan === area);
    // every ticked type from the same two images, in the order of MPK_CHANGE_TYPES
    const layers = {};
    for (const type of Object.keys(MPK_CHANGE_TYPES).filter(t => MPK_CHANGE.types.has(t))) {
      let buildings, hectares, dataUrl = null;
      if (type === 'newbld') {
        // judged per footprint, drawn as footprints
        buildings = mpkNewBuildings(feats, grid, b, a, sat === 'esri' ? 'exg' : 'spectral');
        hectares = Math.round(buildings.reduce((sum, f) => sum + f.properties.area_m2, 0) / 100) / 100;
      } else {
        let mask = mpkClassifyChange(type, b, a, th);
        // high-res photos: drop specks under ~5 m (shadows, single trees, colour noise)
        if (sat === 'esri') mask = mpkOpenMask(mask, grid.w, Math.max(1, Math.round(2.5 / grid.metres)));
        // a neighbouring pixel only on fine grids — on 30 m Landsat it would reach ~90 m away
        buildings = type === 'gain' ? [] : mpkBuildingsInMask(feats, mask, grid, pixelMetres >= 20 ? 0 : 1);
        hectares = mpkMaskHectares(mask, pixelMetres);
        // vegetation change as a smooth heatmap of its strength; built-up as solid pixels
        dataUrl = type === 'gain' || type === 'cleared'
          ? mpkHeatImage(mpkHeatValues(type, b, a, th), grid, type)
          : mpkMaskImage(mask, grid, MPK_CHANGE_TYPES[type].rgb);
      }
      buildings.sort((x, y) => y.properties.area_m2 - x.properties.area_m2);
      layers[type] = { buildings, hectares, dataUrl, heat: type === 'gain' || type === 'cleared' };
    }
    MPK_CHANGE.shown = Object.fromEntries(Object.keys(layers).map(t => [t, true]));
    MPK_CHANGE.result = { sat, before, after, area, esriDates, usable: usable / b.valid.length, layers,
                          coordinates: [[grid.west, grid.north], [grid.east, grid.north],
                                        [grid.east, grid.south], [grid.west, grid.south]] };
    if (MPK.wayback && MPK.wayback.on) mpkHistoricOff();     // one imagery layer at a time
    mpkChangeDraw();
    mpkChangeView('after');
    mpkChangeRender();
    mpkChangeStatus('');
    addActivityLog('Change detection', `${Object.keys(MPK_CHANGE.result.layers).map(t => MPK_CHANGE_TYPES[t].label).join(', ')}`
      + ` · ${before.date} → ${after.date}`);
  } catch (err) {
    mpkChangeStatus('Could not run the analysis: ' + err.message, true);
  } finally {
    MPK_CHANGE.busy = false;
    document.getElementById('mpk-cd-go').disabled = false;
  }
}

// Changed pixels of one type as a transparent PNG (data URL) over the grid
function mpkMaskImage(mask, grid, rgb) {
  const c = document.createElement('canvas');
  c.width = grid.w; c.height = grid.h;
  const ctx = c.getContext('2d'), img = ctx.createImageData(grid.w, grid.h);
  for (let i = 0, p = 0; i < mask.length; i++, p += 4) {
    if (!mask[i]) continue;
    img.data[p] = rgb[0]; img.data[p + 1] = rgb[1]; img.data[p + 2] = rgb[2]; img.data[p + 3] = 190;
  }
  ctx.putImageData(img, 0, 0);
  return c.toDataURL();
}

// Layer ids of one detect type
function mpkChangeLayerIds(type) {
  return { src: 'mpk-change-' + type, layers: ['mpk-change-' + type + '-img', 'mpk-change-' + type + '-fill',
                                              'mpk-change-' + type + '-line'] };
}

// Draw every layer of a result on a map (dashboard or compare page); pixel masks first, the
// new-building footprints on top. shown = { type: bool }, beforeId = layer to insert under.
function mpkAddChangeLayers(m, result, shown, beforeId) {
  const order = Object.keys(result.layers).sort((x, y) => (x === 'newbld') - (y === 'newbld'));
  for (const type of order) {
    const layer = result.layers[type], ids = mpkChangeLayerIds(type), rgb = MPK_CHANGE_TYPES[type].rgb;
    const layout = { visibility: shown[type] === false ? 'none' : 'visible' };
    if (layer.dataUrl) {
      m.addSource(ids.src, { type: 'image', url: layer.dataUrl, coordinates: result.coordinates });
      m.addLayer({ id: ids.layers[0], type: 'raster', source: ids.src, layout,
                   // heatmaps are smoothed (linear) so they read as a continuous surface
                   paint: { 'raster-resampling': layer.heat ? 'linear' : 'nearest', 'raster-opacity': layer.heat ? 0.9 : 0.85 } }, beforeId);
    } else {
      m.addSource(ids.src, { type: 'geojson', data: { type: 'FeatureCollection', features: layer.buildings } });
      m.addLayer({ id: ids.layers[1], type: 'fill', source: ids.src, layout,
                   paint: { 'fill-color': `rgb(${rgb})`, 'fill-opacity': 0.55 } }, beforeId);
      m.addLayer({ id: ids.layers[2], type: 'line', source: ids.src, layout,
                   paint: { 'line-color': '#4A0072', 'line-width': ['interpolate', ['linear'], ['zoom'], 13, 0.8, 17, 2.2] } }, beforeId);
    }
  }
}

function mpkSetChangeTypeVisible(m, type, on) {
  mpkChangeLayerIds(type).layers.forEach(id => { if (m.getLayer(id)) m.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none'); });
}

function mpkChangeRemoveResult() {
  if (!map) return;
  for (const type of Object.keys(MPK_CHANGE_TYPES)) {
    const ids = mpkChangeLayerIds(type);
    ids.layers.forEach(id => { if (map.getLayer(id)) map.removeLayer(id); });
    if (map.getSource(ids.src)) map.removeSource(ids.src);
  }
}

function mpkChangeDraw() {
  const r = MPK_CHANGE.result;
  if (!r || !map) return;
  mpkChangeRemoveResult();
  mpkAddChangeLayers(map, r, MPK_CHANGE.shown, map.getLayer('mpk-suspect-line') ? 'mpk-suspect-line' : undefined);
  mpkChangeOverlayVisibility();
}

// The result switch hides the detected pixels / footprints and the Before-After image, so
// the regular basemap (Google etc.) shows; switching it on brings both back
function mpkChangeOverlayVisibility() {
  const r = MPK_CHANGE.result;
  if (r) {
    for (const type of Object.keys(r.layers)) mpkSetChangeTypeVisible(map, type, MPK_CHANGE.overlayOn && MPK_CHANGE.shown[type]);
  }
  if (map.getLayer('mpk-change-img-layer')) map.setLayoutProperty('mpk-change-img-layer', 'visibility', MPK_CHANGE.overlayOn ? 'visible' : 'none');
}

// Show / hide one detected type on the map (checkbox in the result list)
function mpkChangeShowType(type, on) {
  MPK_CHANGE.shown[type] = on;
  mpkChangeOverlayVisibility();
}

function mpkChangeToggleOverlay() {
  MPK_CHANGE.overlayOn = !MPK_CHANGE.overlayOn;
  const btn = document.getElementById('mpk-cd-tog');
  btn.className = 'layer-toggle ' + (MPK_CHANGE.overlayOn ? 'on' : 'off');
  btn.setAttribute('aria-checked', String(MPK_CHANGE.overlayOn));
  mpkChangeOverlayVisibility();
  const r = MPK_CHANGE.result;
  if (r && MPK_CHANGE.view !== 'map') {
    mpkImageryZoomCap(MPK_CHANGE.overlayOn ? mpkImagerySource(MPK_CHANGE.view === 'before' ? r.before : r.after).maxView : null);
  }
}

function mpkChangeRemoveLayer(source, layer) {
  if (!map) return;
  if (map.getLayer(layer)) map.removeLayer(layer);
  if (map.getSource(source)) map.removeSource(source);
}

// Show the before or after image under the overlay (or neither: the normal basemap)
function mpkChangeView(view) {
  const r = MPK_CHANGE.result;
  MPK_CHANGE.view = view;
  document.querySelectorAll('.mpk-cd-views button').forEach(b => b.classList.toggle('active', b.dataset.view === view));
  mpkChangeRemoveLayer('mpk-change-img', 'mpk-change-img-layer');
  if (!r || view === 'map') { mpkImageryZoomCap(null); return; }
  const src = mpkImagerySource(view === 'before' ? r.before : r.after);
  map.addSource('mpk-change-img', { type: 'raster', tiles: src.tiles, tileSize: 256, maxzoom: src.maxzoom,
                                    attribution: src.attribution });
  map.addLayer({ id: 'mpk-change-img-layer', type: 'raster', source: 'mpk-change-img',
                 layout: { visibility: MPK_CHANGE.overlayOn ? 'visible' : 'none' } },
               mpkBottomLayer());
  mpkImageryZoomCap(MPK_CHANGE.overlayOn ? src.maxView : null);
}

function mpkChangeRender() {
  const r = MPK_CHANGE.result;
  document.getElementById('mpk-cd-result').hidden = !r;
  if (!r) return;
  const label = e => (e.source === 'esri' ? mpkMonthLabel(e.date) : mpkDayLabel(e.date));
  const rows = Object.entries(r.layers).map(([type, l]) => {
    const t = MPK_CHANGE_TYPES[type];
    const amount = type === 'newbld' ? `${mpkNum(l.buildings.length)} · ${l.hectares.toLocaleString('en-MY')} ha`
      : `${l.hectares.toLocaleString('en-MY')} ha`;
    const sub = l.heat ? `heatmap: darker = stronger ${type === 'gain' ? 'greening' : 'loss of vegetation'}`
      : type === 'newbld' ? 'green land before, built now'
      : `${mpkNum(l.buildings.length)} buildings on ${type === 'built' ? 'new built-up' : 'cleared'} land`;
    const swatch = l.heat
      ? `<i class="sw heat" style="background:linear-gradient(90deg,${MPK_HEAT_RAMPS[type].map(c => `rgb(${c})`).join(',')})"></i>`
      : `<i class="sw" style="background:rgb(${t.rgb})"></i>`;
    return `<label class="mpk-cd-row">
      <input type="checkbox" ${MPK_CHANGE.shown[type] ? 'checked' : ''} onchange="mpkChangeShowType('${type}', this.checked)">
      ${swatch}
      <span class="mpk-cd-row-main">${t.label}${sub ? `<small>${sub}</small>` : ''}</span>
      <strong>${amount}</strong></label>`;
  }).join('');
  const merged = mpkMergeBuildings(r.layers);
  const suspected = merged.filter(m => mpkJenis(m.feature.properties, MPK.settings)).length;
  document.getElementById('mpk-cd-stats').innerHTML = `
    <div class="mpk-cd-rows">${rows}</div>
    <div class="mpk-cd-meta">${label(r.before)} → ${label(r.after)} · ${MPK_AREAS[r.area].short} ·
      ${r.esriDates ? `${Math.round(r.usable * 100)}% of the area compared (clouds, water and unchanged images left out)`
        : `${Math.round(r.usable * 100)}% of the area cloud-free in both images`}</div>
    ${r.esriDates ? `<div class="mpk-cd-meta">Esri images are mosaics; actual capture dates compared:
      ${r.esriDates.pairs.filter(x => x.share >= 0.01).map(x => `${x.key} (${Math.round(x.share * 100)}%)`).join(', ') || 'none'}
      ${r.esriDates.same >= 0.01 ? ` · ${Math.round(r.esriDates.same * 100)}% shows the same image in both, not compared` : ''}</div>` : ''}
    ${merged.length ? `<div class="mpk-cd-meta"><strong>${mpkNum(merged.length)}</strong> buildings affected ·
      <strong class="danger">${mpkNum(suspected)}</strong> of them suspected</div>` : ''}`;
  const list = document.getElementById('mpk-cd-list');
  const onlyGain = Object.keys(r.layers).every(t => t === 'gain');
  list.hidden = onlyGain;
  list.innerHTML = merged.length
    ? merged.slice(0, 30).map(({ feature, types }) => {
        const p = feature.properties, sus = mpkJenis(p, MPK.settings);
        const dots = types.map(t => `<i class="mpk-dot" title="${MPK_CHANGE_TYPES[t].label}" style="background:rgb(${MPK_CHANGE_TYPES[t].rgb})"></i>`).join('');
        return `<div class="mpk-item" onclick="mpkZoomTo(${p.id})">
          <span class="mpk-cd-dots">${dots}</span>
          <div class="mpk-item-main"><div class="mpk-pc">${p.plus_code}</div>
            <div class="mpk-meta">${sus ? '<span class="danger">Suspected</span>' : 'Not flagged'}${p.lot ? ' · Lot ' + p.lot : ''}</div></div>
          <div class="mpk-area">${mpkNum(p.area_m2)} m²</div></div>`;
      }).join('')
    : '<div class="mpk-empty">No buildings affected between these dates.</div>';
}

function mpkChangeClear() {
  MPK_CHANGE.result = null;
  mpkChangeRemoveResult();
  mpkChangeRemoveLayer('mpk-change-img', 'mpk-change-img-layer');
  if (!(MPK.wayback && MPK.wayback.on)) mpkImageryZoomCap(null);
  if (document.getElementById('mpk-cd-result')) mpkChangeRender();
}

// For the /compare/ page (opened from this tab): the current result as plain data, or null.
// Top-level consts are not window properties, so the compare page calls this function.
function mpkChangeExport() {
  return MPK_CHANGE.result ? JSON.stringify({ result: MPK_CHANGE.result, shown: MPK_CHANGE.shown }) : null;
}

// Hooks called from mpk.js
function mpkChangeRestore() {                 // after a basemap style reload
  if (!MPK_CHANGE.result) return;
  mpkChangeDraw();
  mpkChangeView(MPK_CHANGE.view);
}

function mpkChangeAreaChanged() {             // a result belongs to one area
  if (MPK_CHANGE.result) mpkChangeClear();
  if (document.getElementById('mpk-cd-sat')) mpkChangeInit();
}
