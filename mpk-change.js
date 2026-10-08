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
// NDVI change thresholds; Esri photos use excess-green with its own scale
const MPK_NDVI_TH = { veg: 0.4, bare: 0.25, delta: 0.25 };
const MPK_EXG_TH = { veg: 0.08, bare: 0.02, delta: 0.06 };

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

function mpkMaskHectares(mask, pixelMetres) {
  let n = 0;
  for (const v of mask) n += v;
  return Math.round(n * pixelMetres * pixelMetres / 100) / 100;
}

if (typeof module !== 'undefined') {
  module.exports = { mpkFlag, mpkClassifyChange, mpkS2Expressions, mpkLandsatExpressions, mpkPixelOf,
                     mpkBuildingsInMask, mpkExg, mpkMaskHectares };
}

// ---------- Browser ----------
const MPK_CHANGE_TYPES = {
  built:   { label: 'New built-up', rgb: [41, 98, 255], hint: 'Bare land or vegetation → hard surface (buildings, concrete, roads)' },
  cleared: { label: 'Land cleared', rgb: [255, 145, 0], hint: 'Vegetation → bare land' },
  gain:    { label: 'Vegetation gain', rgb: [0, 200, 83], hint: 'Bare land → grass or vegetation' },
};
const MPK_CHANGE_SATS = {
  s2:      { label: 'Sentinel-2 (10 m)', res: 10, types: ['built', 'cleared', 'gain'] },
  landsat: { label: 'Landsat (30 m)', res: 30, types: ['built', 'cleared', 'gain'] },
  esri:    { label: 'Esri Wayback (high-res)', res: null, types: ['cleared', 'gain'] },
};
const MPK_PC_BBOX = 'https://planetarycomputer.microsoft.com/api/data/v1/item/bbox/';
const MPK_S2_CLOUD = new Set([0, 3, 8, 9, 10]);         // no data, shadow, cloud, cirrus
const MPK_CHANGE_MAX_CLOUD = 30;                         // % — cloudier images are not offered

const MPK_CHANGE = { sat: 's2', type: 'built', result: null, view: 'after', busy: false };

function mpkChangeCardHTML() {
  const sats = Object.entries(MPK_CHANGE_SATS)
    .map(([k, s]) => `<option value="${k}">${s.label}</option>`).join('');
  const types = Object.entries(MPK_CHANGE_TYPES).map(([k, t]) =>
    `<button type="button" class="mpk-cd-type" data-type="${k}" onclick="mpkChangeType('${k}')" title="${t.hint}">
       <i class="sw" style="background:rgb(${t.rgb})"></i>${t.label}</button>`).join('');
  return `
    <div class="mpk-card mpk-change">
      <div class="mpk-card-title">Change detection</div>
      <div class="mpk-cd-sub">Compare two dates from one satellite and detect what changed.</div>
      <div class="mpk-wb-row"><label for="mpk-cd-sat">Satellite</label>
        <select id="mpk-cd-sat" onchange="mpkChangeSat(this.value)">${sats}</select></div>
      <div class="mpk-wb-row"><label for="mpk-cd-before">Before</label><select id="mpk-cd-before"></select></div>
      <div class="mpk-wb-row"><label for="mpk-cd-after">After</label><select id="mpk-cd-after"></select></div>
      <div class="mpk-cd-label">Detect</div>
      <div class="mpk-cd-types">${types}</div>
      <button type="button" class="mpk-btn mpk-cd-go" id="mpk-cd-go" onclick="mpkChangeGenerate()">Generate</button>
      <div class="mpk-cd-status" id="mpk-cd-status" role="status"></div>
      <div id="mpk-cd-result" hidden>
        <div class="mpk-cd-views" role="tablist">
          <button type="button" data-view="before" onclick="mpkChangeView('before')">Before</button>
          <button type="button" data-view="after" onclick="mpkChangeView('after')">After</button>
          <button type="button" data-view="map" onclick="mpkChangeView('map')">Basemap</button>
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
  mpkChangeType(types.includes(MPK_CHANGE.type) ? MPK_CHANGE.type : types[0]);
  mpkChangeStatus('');
}

function mpkChangeType(type) {
  MPK_CHANGE.type = type;
  document.querySelectorAll('.mpk-cd-type').forEach(b => b.classList.toggle('active', b.dataset.type === type));
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
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Planetary Computer HTTP ${res.status}`);
  return mpkDecodePng(await res.blob(), grid.w, grid.h);
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

async function mpkEsriExg(entry, grid) {
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
  const d = ctx.getImageData(0, 0, grid.w, grid.h).data, n = grid.w * grid.h;
  const ndvi = new Float32Array(n), valid = new Uint8Array(n);
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    ndvi[i] = mpkExg(d[p], d[p + 1], d[p + 2]);
    valid[i] = d[p + 3] > 0 && d[p] + d[p + 1] + d[p + 2] > 30 ? 1 : 0;
  }
  return { ndvi, valid };
}

async function mpkChangeGenerate() {
  if (MPK_CHANGE.busy) return;
  const sat = MPK_CHANGE.sat, opts = mpkChangeOptions(sat);
  const before = opts[+document.getElementById('mpk-cd-before').value];
  const after = opts[+document.getElementById('mpk-cd-after').value];
  if (!before || !after || before.date >= after.date) {
    mpkChangeStatus('Pick a "Before" date earlier than the "After" date.', true);
    return;
  }
  MPK_CHANGE.busy = true;
  document.getElementById('mpk-cd-go').disabled = true;
  mpkChangeStatus(`Fetching ${MPK_CHANGE_SATS[sat].label} data for both dates…`);
  try {
    let grid, b, a, th = MPK_NDVI_TH, pixelMetres;
    if (sat === 'esri') {
      grid = await mpkEsriGrid();
      [b, a] = await Promise.all([mpkEsriExg(before, grid), mpkEsriExg(after, grid)]);
      th = MPK_EXG_TH;
      pixelMetres = grid.metres;
    } else {
      pixelMetres = MPK_CHANGE_SATS[sat].res;
      grid = mpkChangeGrid(pixelMetres);
      [b, a] = await Promise.all([mpkSpectral(before, grid), mpkSpectral(after, grid)]);
    }
    mpkChangeStatus('Analysing…');
    const mask = mpkClassifyChange(MPK_CHANGE.type, b, a, th);
    let usable = 0;
    for (let i = 0; i < mask.length; i++) usable += b.valid[i] && a.valid[i];
    const area = mpkChangeArea();
    const feats = MPK.data.buildings.features.filter(f => f.properties.kawasan === area);
    // a neighbouring pixel only on fine grids — on 30 m Landsat it would reach ~90 m away
    const buildings = MPK_CHANGE.type === 'gain' ? [] : mpkBuildingsInMask(feats, mask, grid, pixelMetres >= 20 ? 0 : 1)
      .sort((x, y) => y.properties.area_m2 - x.properties.area_m2);
    MPK_CHANGE.result = { sat, type: MPK_CHANGE.type, before, after, grid, mask, buildings,
                          hectares: mpkMaskHectares(mask, pixelMetres), usable: usable / mask.length, area };
    if (MPK.wayback && MPK.wayback.on) mpkHistoricOff();     // one imagery layer at a time
    mpkChangeDraw();
    mpkChangeView('after');
    mpkChangeRender();
    mpkChangeStatus('');
    addActivityLog('Change detection', `${MPK_CHANGE_TYPES[MPK_CHANGE.type].label} · ${before.date} → ${after.date}`);
  } catch (err) {
    mpkChangeStatus('Could not run the analysis: ' + err.message, true);
  } finally {
    MPK_CHANGE.busy = false;
    document.getElementById('mpk-cd-go').disabled = false;
  }
}

// Changed pixels as a coloured overlay on the map
function mpkChangeDraw() {
  const r = MPK_CHANGE.result;
  if (!r || !map) return;
  const { grid, mask } = r, rgb = MPK_CHANGE_TYPES[r.type].rgb;
  const c = document.createElement('canvas');
  c.width = grid.w; c.height = grid.h;
  const ctx = c.getContext('2d'), img = ctx.createImageData(grid.w, grid.h);
  for (let i = 0, p = 0; i < mask.length; i++, p += 4) {
    if (!mask[i]) continue;
    img.data[p] = rgb[0]; img.data[p + 1] = rgb[1]; img.data[p + 2] = rgb[2]; img.data[p + 3] = 190;
  }
  ctx.putImageData(img, 0, 0);
  const coordinates = [[grid.west, grid.north], [grid.east, grid.north], [grid.east, grid.south], [grid.west, grid.south]];
  mpkChangeRemoveLayer('mpk-change-mask', 'mpk-change-mask-layer');
  map.addSource('mpk-change-mask', { type: 'image', url: c.toDataURL(), coordinates });
  map.addLayer({ id: 'mpk-change-mask-layer', type: 'raster', source: 'mpk-change-mask',
                 paint: { 'raster-resampling': 'nearest', 'raster-opacity': 0.85 } },
               map.getLayer('mpk-suspect-line') ? 'mpk-suspect-line' : undefined);   // over the building fills
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
  map.addLayer({ id: 'mpk-change-img-layer', type: 'raster', source: 'mpk-change-img' },
               map.getLayer('mpk-lot-fill') ? 'mpk-lot-fill' : undefined);
  mpkImageryZoomCap(src.maxView);
}

function mpkChangeRender() {
  const r = MPK_CHANGE.result;
  document.getElementById('mpk-cd-result').hidden = !r;
  if (!r) return;
  const t = MPK_CHANGE_TYPES[r.type];
  const suspected = r.buildings.filter(f => mpkJenis(f.properties, MPK.settings)).length;
  const label = e => (e.source === 'esri' ? mpkMonthLabel(e.date) : mpkDayLabel(e.date));
  document.getElementById('mpk-cd-stats').innerHTML = `
    <div class="mpk-cd-headline"><i class="sw" style="background:rgb(${t.rgb})"></i>${t.label}:
      <strong>${r.hectares.toLocaleString('en-MY')} ha</strong></div>
    <div class="mpk-cd-meta">${label(r.before)} → ${label(r.after)} · ${MPK_AREAS[r.area].short} ·
      ${Math.round(r.usable * 100)}% of the area cloud-free in both images</div>
    ${r.type === 'gain' ? '' : `<div class="mpk-cd-meta"><strong>${mpkNum(r.buildings.length)}</strong> buildings on
      ${r.type === 'built' ? 'new built-up' : 'cleared'} land · <strong class="danger">${mpkNum(suspected)}</strong> of them suspected</div>`}`;
  const list = document.getElementById('mpk-cd-list');
  list.hidden = r.type === 'gain';
  list.innerHTML = r.buildings.length
    ? r.buildings.slice(0, 30).map(f => {
        const p = f.properties, sus = mpkJenis(p, MPK.settings);
        return `<div class="mpk-item" onclick="mpkZoomTo(${p.id})">
          <i class="mpk-dot" style="background:${sus ? MPK_SUSPECT_COLOR : '#B0BEC5'}"></i>
          <div class="mpk-item-main"><div class="mpk-pc">${p.plus_code}</div>
            <div class="mpk-meta">${sus ? 'Suspected' : 'Not flagged'}${p.lot ? ' · Lot ' + p.lot : ''}</div></div>
          <div class="mpk-area">${mpkNum(p.area_m2)} m²</div></div>`;
      }).join('')
    : '<div class="mpk-empty">No building footprints on the changed pixels.</div>';
}

function mpkChangeClear() {
  MPK_CHANGE.result = null;
  mpkChangeRemoveLayer('mpk-change-mask', 'mpk-change-mask-layer');
  mpkChangeRemoveLayer('mpk-change-img', 'mpk-change-img-layer');
  if (!(MPK.wayback && MPK.wayback.on)) mpkImageryZoomCap(null);
  if (document.getElementById('mpk-cd-result')) mpkChangeRender();
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
