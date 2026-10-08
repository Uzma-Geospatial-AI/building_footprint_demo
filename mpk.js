// ============================================================
// MPK KEMAMAN — SUSPECTED ILLEGAL CONSTRUCTION MODE
// Three study areas from MPK:
//   tk   Teluk Kalong Industrial Area — buildings inside the PBT boundary on no approved
//        lot, or outside the boundary within the buffer
//   bpb  Koridor Bandar Putra – Berenjut } buildings within the road-reserve distance of
//   bbc  Koridor Binjai – Bandar Chukai  } the road centreline
// Data: mpk/*.geojson, built by tools/vectorize_teluk_kalong.py + tools/build_mpk_illegal.py
// ============================================================

// ---------- Pure logic (also exported for tools/test_mpk_logic.js) ----------
// Suspect type of one building under the current settings {buffer, rizab}, or null.
function mpkJenis(p, s) {
  // Inside the Teluk Kalong boundary the cadastral data is complete: no lot = state land / reserve
  if (p.dalam && !p.lot) return 'tiada_kadaster';
  if (p.kategori === 'tiada_lot') return 'tiada_lot';
  if (p.kategori === 'luar' && p.jarak_m <= s.buffer) return 'luar_sempadan';
  if (p.kategori === 'koridor' && p.jarak_jalan_m != null && p.jarak_jalan_m <= s.rizab) return 'rizab';
  return null;
}

const MPK_NO_CADASTRAL = ['all', ['==', ['get', 'dalam'], true], ['!', ['has', 'lot']]];

// MapLibre filter equivalent of mpkJenis(...) !== null
function mpkSuspectFilter(s) {
  return ['any',
    MPK_NO_CADASTRAL,
    ['==', ['get', 'kategori'], 'tiada_lot'],
    ['all', ['==', ['get', 'kategori'], 'luar'], ['<=', ['get', 'jarak_m'], s.buffer]],
    ['all', ['==', ['get', 'kategori'], 'koridor'],
      ['<=', ['to-number', ['coalesce', ['get', 'jarak_jalan_m'], 1e9]], s.rizab]],
  ];
}

function mpkStats(features, s, rates, kawasan) {
  const feats = kawasan === 'all' ? features : features.filter(f => f.properties.kawasan === kawasan);
  const byJenis = { tiada_kadaster: 0, tiada_lot: 0, luar_sempadan: 0, rizab: 0 };
  const suspects = [];
  let lulus = 0;
  for (const f of feats) {
    if (f.properties.kategori === 'lulus') lulus++;
    const j = mpkJenis(f.properties, s);
    if (j) { byJenis[j]++; suspects.push(f); }
  }
  suspects.sort((a, b) => b.properties.area_m2 - a.properties.area_m2);
  const area = suspects.reduce((sum, f) => sum + f.properties.area_m2, 0);
  return { total: feats.length, lulus, count: suspects.length, area, byJenis,
           fee: area * rates.fee, cukai: area * rates.cukai, suspects };
}

// English codes written to the CSV export
const MPK_CSV_AREA = { tk: 'teluk_kalong', bpb: 'bandar_putra_berenjut', bbc: 'binjai_bandar_chukai' };
const MPK_CSV_TYPE = { tiada_kadaster: 'no_cadastral_lot', tiada_lot: 'no_approved_lot',
                       luar_sempadan: 'outside_boundary', rizab: 'road_reserve' };

function mpkCSV(suspects, rates, s) {
  const header = 'id,area,type,plus_code,lng,lat,distance_m,area_m2,confidence,lot,upi,est_processing_fee_rm,est_annual_assessment_tax_rm';
  const rows = suspects.map(f => {
    const p = f.properties, jenis = mpkJenis(p, s);
    const jarak = jenis === 'luar_sempadan' ? p.jarak_m : jenis === 'rizab' ? p.jarak_jalan_m : '';
    return [p.id, MPK_CSV_AREA[p.kawasan], MPK_CSV_TYPE[jenis], p.plus_code, p.lng, p.lat, jarak, p.area_m2, p.confidence, p.lot || '', p.upi || '',
      (p.area_m2 * rates.fee).toFixed(2), (p.area_m2 * rates.cukai).toFixed(2)].join(',');
  });
  return [header, ...rows].join('\n') + '\n';
}

if (typeof module !== 'undefined') module.exports = { mpkJenis, mpkSuspectFilter, mpkStats, mpkCSV };

// ---------- Browser mode ----------
const MPK_AREAS = {
  tk:  { name: 'Teluk Kalong Industrial Area', short: 'Teluk Kalong' },
  bpb: { name: 'Bandar Putra – Berenjut Corridor', short: 'B. Putra – Berenjut' },
  bbc: { name: 'Binjai – Bandar Chukai Corridor', short: 'Binjai – Chukai' },
};
const MPK_JENIS = {
  tiada_kadaster: { label: 'Inside boundary, no cadastral lot', color: '#6D4C41', areas: ['tk'] },
  tiada_lot:     { label: 'Inside boundary, no approved lot', color: '#e53935', areas: ['tk'] },
  luar_sempadan: { label: 'Outside planning boundary (within buffer)', color: '#FB8C00', areas: ['tk'] },
  rizab:         { label: 'Encroaching road reserve', color: '#C2185B', areas: ['bpb', 'bbc'] },
};

// Map layers the viewer can switch on/off from the panel, in display order.
const MPK_LAYER_GROUPS = {
  suspect:   { label: 'Suspected buildings', swatch: [MPK_JENIS.tiada_lot.color],
               layers: ['mpk-suspect-fill', 'mpk-suspect-line', 'mpk-suspect-extrude', 'mpk-highlight-line'],
               legend: [['No cadastral lot', MPK_JENIS.tiada_kadaster.color], ['No approved lot', MPK_JENIS.tiada_lot.color],
                        ['Outside boundary', MPK_JENIS.luar_sempadan.color], ['Road reserve', MPK_JENIS.rizab.color]] },
  reference: { label: 'Reference layers', swatchClass: 'line',
               layers: ['mpk-base-fill', 'mpk-lot-fill', 'mpk-lot-line', 'mpk-kadaster-line', 'mpk-boundary-fill',
                        'mpk-boundary-line', 'mpk-koridor-band', 'mpk-koridor-line'],
               legend: [['On approved lot', '#7CB342'], ['Other building', '#B0BEC5'], ['Approved lot', '.lot'],
                        ['Cadastral lot', '.kadaster'], ['Planning boundary', '.line'], ['Study corridor', '.band']] },
};

const MPK = {
  // Bump with the ?v= on mpk.js / mpk.css in index.html whenever MPK code or data changes,
  // so browsers never mix a cached old file with a new one (GitHub Pages caches 10 min).
  VERSION: '20261008c',
  FILES: {
    buildings: 'mpk/mpk_buildings.geojson',
    boundary: 'mpk/tk_sempadan.geojson',
    lots: 'mpk/tk_lot_lulus.geojson',
    kadaster: 'mpk/lot_kadaster.geojson',
    roads: 'mpk/koridor_jalan.geojson',
  },
  RATES_KEY: 'mpk_rates',
  DEFAULT_RATES: { fee: 2.0, cukai: 6.0 },
  LIST_SIZE: 50,
  LAYERS: ['mpk-lot-fill', 'mpk-lot-line', 'mpk-kadaster-line', 'mpk-boundary-fill', 'mpk-boundary-line', 'mpk-koridor-band',
           'mpk-koridor-line', 'mpk-base-fill', 'mpk-suspect-fill', 'mpk-suspect-line',
           'mpk-suspect-extrude', 'mpk-highlight-line'],
  SOURCES: ['mpk-lots', 'mpk-kadaster', 'mpk-boundary', 'mpk-roads', 'mpk-buildings', 'mpk-highlight'],
  SUSPECT_LAYERS: ['mpk-suspect-fill', 'mpk-suspect-line', 'mpk-suspect-extrude'],
  active: false,
  data: null,
  bounds: null,
  settings: { buffer: 500, rizab: 10 },
  area: 'all',
  layerOn: Object.fromEntries(Object.keys(MPK_LAYER_GROUPS).map(k => [k, true])),
  rates: null,
  boundMap: null,
  prevTitle: null,
  popup: null,
  lastStats: null,
};

function mpkLoadRates() {
  let rates = { ...MPK.DEFAULT_RATES };
  try {
    const saved = JSON.parse(localStorage.getItem(MPK.RATES_KEY) || 'null');
    if (saved && isFinite(saved.fee) && isFinite(saved.cukai)) rates = { fee: +saved.fee, cukai: +saved.cukai };
  } catch (e) {}
  return rates;
}

function mpkSaveRates() {
  try { localStorage.setItem(MPK.RATES_KEY, JSON.stringify(MPK.rates)); } catch (e) {}
}

function mpkBoundsOf(features) {
  let minLng = 180, minLat = 90, maxLng = -180, maxLat = -90;
  const visit = c => {
    if (typeof c[0] === 'number') {
      if (c[0] < minLng) minLng = c[0]; if (c[0] > maxLng) maxLng = c[0];
      if (c[1] < minLat) minLat = c[1]; if (c[1] > maxLat) maxLat = c[1];
    } else c.forEach(visit);
  };
  features.forEach(f => visit(f.geometry.coordinates));
  return [[minLng, minLat], [maxLng, maxLat]];
}

async function mpkEnsureData() {
  if (MPK.data) return;
  const entries = await Promise.all(Object.entries(MPK.FILES).map(async ([key, url]) => {
    const res = await fetch(url + '?v=' + MPK.VERSION);
    if (!res.ok) throw new Error('HTTP ' + res.status + ' · ' + url);
    return [key, await res.json()];
  }));
  const data = Object.fromEntries(entries);
  const b = data.buildings.features;
  MPK.bounds = {
    all: mpkBoundsOf([...b, ...data.boundary.features, ...data.roads.features]),
    tk: mpkBoundsOf(data.boundary.features),
    bpb: mpkBoundsOf(data.roads.features.filter(f => f.properties.kawasan === 'bpb')),
    bbc: mpkBoundsOf(data.roads.features.filter(f => f.properties.kawasan === 'bbc')),
  };
  MPK.data = data;
}

// Returns false when the style was not ready and nothing was added.
function mpkAddLayers() {
  if (!map) return false;
  if (map.getSource('mpk-buildings')) return true;
  const suspect = mpkSuspectFilter(MPK.settings);
  const jenisColor = ['case', MPK_NO_CADASTRAL, MPK_JENIS.tiada_kadaster.color,
    ['match', ['get', 'kategori'],
      'tiada_lot', MPK_JENIS.tiada_lot.color, 'luar', MPK_JENIS.luar_sempadan.color, MPK_JENIS.rizab.color]];
  try {
    map.addSource('mpk-lots', { type: 'geojson', data: MPK.data.lots });
    map.addSource('mpk-kadaster', { type: 'geojson', data: MPK.data.kadaster });
    map.addSource('mpk-boundary', { type: 'geojson', data: MPK.data.boundary });
    map.addSource('mpk-roads', { type: 'geojson', data: MPK.data.roads });
    map.addSource('mpk-buildings', { type: 'geojson', data: MPK.data.buildings });
    map.addSource('mpk-highlight', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });

    map.addLayer({ id: 'mpk-lot-fill', type: 'fill', source: 'mpk-lots',
      paint: { 'fill-color': '#8E24AA', 'fill-opacity': 0.22 } });
    map.addLayer({ id: 'mpk-lot-line', type: 'line', source: 'mpk-lots',
      paint: { 'line-color': '#6A1B9A', 'line-width': 1, 'line-opacity': 0.7 } });
    map.addLayer({ id: 'mpk-kadaster-line', type: 'line', source: 'mpk-kadaster',
      paint: { 'line-color': '#00ACC1', 'line-opacity': 0.85,
               'line-width': ['interpolate', ['linear'], ['zoom'], 13, 0.4, 17, 1.4] } });
    map.addLayer({ id: 'mpk-boundary-fill', type: 'fill', source: 'mpk-boundary',
      paint: { 'fill-color': '#E8772E', 'fill-opacity': 0.04 } });
    map.addLayer({ id: 'mpk-boundary-line', type: 'line', source: 'mpk-boundary',
      paint: { 'line-color': '#E8772E', 'line-width': 2.5, 'line-dasharray': [3, 2] } });
    // 100 m wide study corridor (50 m each side) — width converted from metres at lat 4.2°
    map.addLayer({ id: 'mpk-koridor-band', type: 'line', source: 'mpk-roads',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': '#FDD835', 'line-opacity': 0.16,
               'line-width': ['interpolate', ['exponential', 2], ['zoom'], 10, 0.66, 20, 672] } });
    map.addLayer({ id: 'mpk-koridor-line', type: 'line', source: 'mpk-roads',
      paint: { 'line-color': '#F9A825', 'line-width': 2 } });
    map.addLayer({ id: 'mpk-base-fill', type: 'fill', source: 'mpk-buildings', filter: ['!', suspect],
      paint: { 'fill-color': ['match', ['get', 'kategori'], 'lulus', '#7CB342', '#B0BEC5'], 'fill-opacity': 0.6 } });
    map.addLayer({ id: 'mpk-suspect-fill', type: 'fill', source: 'mpk-buildings', filter: suspect,
      paint: { 'fill-color': jenisColor, 'fill-opacity': 0.8 } });
    map.addLayer({ id: 'mpk-suspect-line', type: 'line', source: 'mpk-buildings', filter: suspect,
      paint: { 'line-color': '#7f0000', 'line-width': ['interpolate', ['linear'], ['zoom'], 13, 0.3, 17, 1.4] } });
    map.addLayer({ id: 'mpk-suspect-extrude', type: 'fill-extrusion', source: 'mpk-buildings', filter: suspect,
      layout: { visibility: 'none' },
      paint: { 'fill-extrusion-color': jenisColor, 'fill-extrusion-height': 8, 'fill-extrusion-base': 0,
               'fill-extrusion-opacity': 0.85 } });
    map.addLayer({ id: 'mpk-highlight-line', type: 'line', source: 'mpk-highlight',
      paint: { 'line-color': '#FDD835', 'line-width': 3 } });
  } catch (e) {
    // Style not ready yet (e.g. mid basemap rebuild) — mpkOnStyleLoad retries.
    mpkRemoveLayers();
    return false;
  }
  mpkApplyLayerVisibility();
  return true;
}

function mpkApplyLayerVisibility() {
  for (const [key, g] of Object.entries(MPK_LAYER_GROUPS)) {
    g.layers.forEach(id => { if (id !== 'mpk-suspect-extrude') mpkSetVis(id, MPK.layerOn[key] ? 'visible' : 'none'); });
  }
  mpkRefresh3D();
}

function mpkToggleLayer(key) {
  MPK.layerOn = { ...MPK.layerOn, [key]: !MPK.layerOn[key] };
  const btn = document.getElementById('mpk-tog-' + key);
  btn.className = 'layer-toggle ' + (MPK.layerOn[key] ? 'on' : 'off');
  btn.setAttribute('aria-checked', String(MPK.layerOn[key]));
  document.getElementById('mpk-group-' + key).classList.toggle('is-off', !MPK.layerOn[key]);
  if (key === 'suspect' && !MPK.layerOn.suspect && MPK.popup) { MPK.popup.remove(); MPK.popup = null; }
  if (map) mpkApplyLayerVisibility();
}

function mpkRemoveLayers() {
  if (!map) return;
  MPK.LAYERS.forEach(id => { try { if (map.getLayer(id)) map.removeLayer(id); } catch (e) {} });
  MPK.SOURCES.forEach(id => { try { if (map.getSource(id)) map.removeSource(id); } catch (e) {} });
}

function mpkSetVis(id, vis) {
  if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', vis);
}

// Called from refresh3DLayers() in index.html
function mpkRefresh3D() {
  if (!map) return;
  mpkSetVis('mpk-suspect-extrude', MPK.active && is3D && MPK.layerOn.suspect ? 'visible' : 'none');
}

// Called from the style.load handler in index.html. Basemap code re-adds the Seremban
// layers in its own style.load handler, so defer until after it has run.
function mpkOnStyleLoad() {
  if (!MPK.active) return;
  let tries = 0;
  const attempt = () => {
    if (!MPK.active) return;
    mpkSetSerembanVisible(false);
    if (!mpkAddLayers() && ++tries < 25) setTimeout(attempt, 200);
  };
  setTimeout(attempt, 0);
}

function mpkSetSerembanVisible(on) {
  for (const ds of Object.values(datasets)) {
    for (const info of Object.values(ds.layerVisibility)) {
      const vis = on && info.visible && geoJsonOverlayVisible ? 'visible' : 'none';
      mpkSetVis(info.fillId, vis);
      mpkSetVis(info.outlineId, vis);
      if (!on && info.extrudeId) mpkSetVis(info.extrudeId, 'none');
    }
  }
  if (on) refresh3DLayers();
  mpkSetVis('lot-highlight-fill', on ? 'visible' : 'none');
  mpkSetVis('lot-highlight-line', on ? 'visible' : 'none');
}

function mpkBindEvents() {
  if (MPK.boundMap === map) return;
  MPK.boundMap = map;
  ['mpk-suspect-fill', 'mpk-base-fill'].forEach(layer => {
    map.on('click', layer, e => {
      if (!MPK.active || !e.features.length) return;
      mpkShowPopup(e.features[0].properties, e.lngLat);
    });
    map.on('mouseenter', layer, () => { if (MPK.active) map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', layer, () => { if (MPK.active) map.getCanvas().style.cursor = 'grab'; });
  });
}

function mpkSetMode(mode) {
  if (mode === 'mpk') mpkEnter(); else mpkExit();
}

async function mpkEnter() {
  if (MPK.active) return;
  if (!MPK.rates) MPK.rates = mpkLoadRates();
  try {
    if (!MPK.data) showLoading('Loading MPK Kemaman data...', 'Buildings, boundary, lots & corridors');
    await mpkEnsureData();
  } catch (err) {
    hideLoading();
    showToast('⚠️ Could not load MPK data: ' + err.message, 5000);
    document.getElementById('area-mode').value = 'seremban';
    return;
  }
  hideLoading();
  MPK.active = true;
  document.body.classList.add('mpk-mode');

  // Leave any Seremban interaction state behind
  try { if (currentPopup) { currentPopup.remove(); currentPopup = null; } } catch (e) {}
  const nav = document.getElementById('mode-navigate');
  if (nav && mapMode !== 'navigate') setMapMode('navigate', nav);
  // UZMA-sat imagery only covers Seremban — use Google Satellite over Kemaman
  if (currentBasemap === 'uzma-sat') {
    const opt = document.querySelector('.basemap-option[onclick*="google-satellite"]');
    switchBasemap('google-satellite', 'Google Satellite', opt);
  }

  mpkSetSerembanVisible(false);
  mpkAddLayers();
  mpkBindEvents();

  const title = document.getElementById('page-title'), sub = document.getElementById('page-sub');
  const panelSub = document.getElementById('panel-sub');
  MPK.prevTitle = { title: title.textContent, sub: sub.textContent, panelSub: panelSub.textContent };
  title.textContent = 'Illegal Construction Monitoring — MPK Kemaman';
  sub.textContent = 'Teluk Kalong · Bandar Putra–Berenjut · Binjai–Bandar Chukai';
  panelSub.textContent = 'MPK Kemaman · Buildings suspected of lacking planning permission';

  const tab = document.getElementById('ptab-mpk');
  tab.style.display = '';
  mpkBuildPanel();
  switchTab(tab, 'mpk');
  mpkSelectArea(MPK.area);
  addActivityLog('MPK Kemaman mode', 'Suspected illegal construction');
}

function mpkExit() {
  if (!MPK.active) return;
  MPK.active = false;
  document.body.classList.remove('mpk-mode');
  if (MPK.popup) { MPK.popup.remove(); MPK.popup = null; }
  mpkRemoveLayers();
  mpkSetSerembanVisible(true);
  map.getCanvas().style.cursor = 'grab';

  const tab = document.getElementById('ptab-mpk');
  tab.style.display = 'none';
  switchTab(document.querySelector('.ptab'), 'overview');
  if (MPK.prevTitle) {
    document.getElementById('page-title').textContent = MPK.prevTitle.title;
    document.getElementById('page-sub').textContent = MPK.prevTitle.sub;
    document.getElementById('panel-sub').textContent = MPK.prevTitle.panelSub;
  }
  flyToData();
  addActivityLog('Seremban mode', 'Back to the Seremban dashboard');
}

// ---------- Panel ----------
const mpkNum = n => Math.round(n).toLocaleString('en-MY');
const mpkRM = n => 'RM ' + Math.round(n).toLocaleString('en-MY');

function mpkBuildPanel() {
  const el = document.getElementById('tab-mpk');
  if (el.dataset.built) return;
  el.dataset.built = '1';
  const chips = [['all', 'All'], ...Object.entries(MPK_AREAS).map(([k, a]) => [k, a.short])]
    .map(([k, label]) => `<button class="mpk-chip" data-area="${k}" onclick="mpkSelectArea('${k}')">${label}</button>`).join('');
  const jenisRows = Object.entries(MPK_JENIS).map(([k, j]) => `
    <div class="mpk-jenis-row" id="mpk-jenis-${k}">
      <i class="sw" style="background:${j.color}"></i><span>${j.label}</span><strong id="mpk-j-${k}">—</strong>
    </div>`).join('');
  const layerRows = Object.entries(MPK_LAYER_GROUPS).map(([k, g]) => {
    const sw = g.swatchClass ? `<i class="sw ${g.swatchClass}"></i>`
      : g.swatch.map(c => `<i class="sw" style="background:${c}"></i>`).join('');
    // legend swatch: a colour, or '.class' for a styled swatch (lot outline, dashed line, band)
    const legend = g.legend.map(([label, v]) => {
      const item = v[0] === '.' ? `<i class="sw ${v.slice(1)}"></i>` : `<i class="sw" style="background:${v}"></i>`;
      return `<span>${item}${label}</span>`;
    }).join('');
    return `<div class="mpk-layer-group${MPK.layerOn[k] ? '' : ' is-off'}" id="mpk-group-${k}">
      <div class="mpk-layer-row">
        <span class="mpk-sw-group">${sw}</span>
        <div class="mpk-layer-main">${g.label}</div>
        <button type="button" class="layer-toggle ${MPK.layerOn[k] ? 'on' : 'off'}" id="mpk-tog-${k}" role="switch"
          aria-checked="${MPK.layerOn[k]}" aria-label="${g.label}" onclick="mpkToggleLayer('${k}')"></button>
      </div>
      <div class="mpk-layer-legend">${legend}</div>
    </div>`;
  }).join('');
  el.innerHTML = `
    <div class="mpk-hero">
      <div class="mpk-eyebrow">MPK Kemaman · Mockup</div>
      <div class="mpk-hero-title">Buildings suspected of lacking planning permission</div>
      <div class="mpk-hero-sub" id="mpk-hero-sub"></div>
    </div>

    <div class="mpk-chips" role="tablist">${chips}</div>

    <div class="mpk-card mpk-layers">
      <div class="mpk-card-title">Map layers</div>
      ${layerRows}
    </div>

    <div class="mpk-card">
      <div id="mpk-ctl-buffer">
        <div class="mpk-row">
          <label for="mpk-buffer" class="mpk-label">Buffer outside the boundary (Teluk Kalong)</label>
          <span class="mpk-slider-val" id="mpk-buffer-val"></span>
        </div>
        <input type="range" id="mpk-buffer" class="mpk-range" min="100" max="1000" step="50"
          value="${MPK.settings.buffer}" oninput="mpkOnSetting('buffer', this.value)">
        <div class="mpk-range-scale"><span>100 m</span><span>1 km</span></div>
      </div>
      <div id="mpk-ctl-rizab">
        <div class="mpk-row">
          <label for="mpk-rizab" class="mpk-label">Road reserve from centreline (corridors)</label>
          <span class="mpk-slider-val" id="mpk-rizab-val"></span>
        </div>
        <input type="range" id="mpk-rizab" class="mpk-range" min="3" max="20" step="1"
          value="${MPK.settings.rizab}" oninput="mpkOnSetting('rizab', this.value)">
        <div class="mpk-range-scale"><span>3 m</span><span>20 m</span></div>
      </div>
    </div>

    <div class="mpk-kpis">
      <div class="mpk-kpi danger"><div class="v" id="mpk-k-count">—</div><div class="l">Suspected buildings</div></div>
      <div class="mpk-kpi"><div class="v" id="mpk-k-area">—</div><div class="l">Suspected footprint (m²)</div></div>
      <div class="mpk-kpi"><div class="v" id="mpk-k-total">—</div><div class="l">Buildings assessed</div></div>
    </div>

    <div class="mpk-card mpk-jenis">${jenisRows}</div>

    <div class="mpk-card">
      <div class="mpk-card-title">Estimated council revenue <span class="mpk-tag">assumption</span></div>
      <div class="mpk-rate-row">
        <label for="mpk-rate-fee">Development application processing fee<small>RM / m²</small></label>
        <input type="number" id="mpk-rate-fee" min="0" step="0.1" value="${MPK.rates.fee}" oninput="mpkOnRate()">
        <div class="mpk-money" id="mpk-r-fee">—</div>
      </div>
      <div class="mpk-rate-row">
        <label for="mpk-rate-cukai">Assessment tax (Cukai Pintu)<small>RM / m² / year</small></label>
        <input type="number" id="mpk-rate-cukai" min="0" step="0.1" value="${MPK.rates.cukai}" oninput="mpkOnRate()">
        <div class="mpk-money" id="mpk-r-cukai">—</div>
      </div>
      <div class="mpk-total"><span>First-year revenue potential</span><strong id="mpk-r-total">—</strong></div>
    </div>

    <div class="mpk-list-head">
      <div class="mpk-card-title">Largest suspected buildings</div>
      <button class="mpk-btn" onclick="mpkExportCSV()">Export CSV</button>
    </div>
    <div class="mpk-list" id="mpk-list"></div>

    <div class="mpk-note">Buildings: Google Open Buildings. Teluk Kalong boundary & approved lots digitised from MPK's map;
      road centrelines from OpenStreetMap; cadastral lots from NDCDB. Road-reserve width and revenue rates are assumptions.
      Every case needs site verification.</div>
  `;
}

function mpkSelectArea(area) {
  MPK.area = area;
  document.querySelectorAll('.mpk-chip').forEach(c => c.classList.toggle('active', c.dataset.area === area));
  const showTk = area === 'all' || area === 'tk';
  const showKoridor = area === 'all' || area === 'bpb' || area === 'bbc';
  document.getElementById('mpk-ctl-buffer').style.display = showTk ? '' : 'none';
  document.getElementById('mpk-ctl-rizab').style.display = showKoridor ? '' : 'none';
  Object.entries(MPK_JENIS).forEach(([k, j]) => {
    document.getElementById('mpk-jenis-' + k).style.display =
      area === 'all' || j.areas.includes(area) ? '' : 'none';
  });
  document.getElementById('mpk-hero-sub').textContent = area === 'all'
    ? 'Three study areas: Teluk Kalong Industrial Area and two road corridors in Bandar Chukai.'
    : MPK_AREAS[area].name;
  if (MPK.bounds) map.fitBounds(MPK.bounds[area], { padding: 50, duration: 1200 });
  mpkRender();
}

function mpkRender() {
  if (!MPK.data) return;
  const s = mpkStats(MPK.data.buildings.features, MPK.settings, MPK.rates, MPK.area);
  MPK.lastStats = s;
  document.getElementById('mpk-buffer-val').textContent = MPK.settings.buffer + ' m';
  document.getElementById('mpk-rizab-val').textContent = MPK.settings.rizab + ' m';
  document.getElementById('mpk-k-count').textContent = mpkNum(s.count);
  document.getElementById('mpk-k-area').textContent = mpkNum(s.area);
  document.getElementById('mpk-k-total').textContent = mpkNum(s.total);
  Object.keys(MPK_JENIS).forEach(k => { document.getElementById('mpk-j-' + k).textContent = mpkNum(s.byJenis[k]); });
  mpkRenderRevenue();

  const list = document.getElementById('mpk-list');
  if (!s.count) {
    list.innerHTML = '<div class="mpk-empty">No suspected buildings with these settings.</div>';
    return;
  }
  list.innerHTML = s.suspects.slice(0, MPK.LIST_SIZE).map((f, i) => {
    const p = f.properties, j = MPK_JENIS[mpkJenis(p, MPK.settings)];
    return `<div class="mpk-item" onclick="mpkZoomTo(${p.id})">
      <span class="mpk-rank">${i + 1}</span>
      <i class="mpk-dot" style="background:${j.color}"></i>
      <div class="mpk-item-main"><div class="mpk-pc">${p.plus_code}</div>
        <div class="mpk-meta">${MPK_AREAS[p.kawasan].short}${p.lot ? ' · Lot ' + p.lot : ''} · ${j.label}</div></div>
      <div class="mpk-area">${mpkNum(p.area_m2)} m²</div>
    </div>`;
  }).join('') + (s.count > MPK.LIST_SIZE
    ? `<div class="mpk-more">+ ${mpkNum(s.count - MPK.LIST_SIZE)} more · see Export CSV</div>` : '');
}

function mpkRenderRevenue() {
  const s = MPK.lastStats;
  if (!s) return;
  const fee = s.area * MPK.rates.fee, cukai = s.area * MPK.rates.cukai;
  document.getElementById('mpk-r-fee').textContent = mpkRM(fee);
  document.getElementById('mpk-r-cukai').textContent = mpkRM(cukai) + '/yr';
  document.getElementById('mpk-r-total').textContent = mpkRM(fee + cukai);
}

function mpkOnSetting(key, v) {
  MPK.settings = { ...MPK.settings, [key]: parseInt(v, 10) };
  const suspect = mpkSuspectFilter(MPK.settings);
  MPK.SUSPECT_LAYERS.forEach(id => { if (map.getLayer(id)) map.setFilter(id, suspect); });
  if (map.getLayer('mpk-base-fill')) map.setFilter('mpk-base-fill', ['!', suspect]);
  mpkRender();
}

function mpkOnRate() {
  const read = id => { const v = parseFloat(document.getElementById(id).value); return isFinite(v) && v >= 0 ? v : 0; };
  MPK.rates = { fee: read('mpk-rate-fee'), cukai: read('mpk-rate-cukai') };
  mpkSaveRates();
  mpkRenderRevenue();
}

// ---------- Map interaction ----------
function mpkStatusText(p, jenis) {
  if (jenis) return 'Suspected · ' + MPK_JENIS[jenis].label;
  if (p.kategori === 'lulus') return 'On an approved lot';
  if (p.kategori === 'luar') return 'Outside boundary, beyond the buffer';
  return 'In corridor · check planning permission / assessment tax';
}

function mpkShowPopup(p, lngLat) {
  const jenis = mpkJenis(p, MPK.settings);
  const row = (k, v) => `<div class="popup-row"><span class="popup-k">${k}</span><span class="popup-v">${v}</span></div>`;
  const html = `
    <div class="popup-header" ${jenis ? `style="background:${MPK_JENIS[jenis].color}"` : ''}>
      <div class="popup-fc">${mpkStatusText(p, jenis)}</div>
      <div class="popup-name">${p.plus_code}</div>
    </div>
    <div class="popup-body">
      ${row('Area', MPK_AREAS[p.kawasan].short)}
      ${p.kategori === 'luar' ? row('Distance from boundary', p.jarak_m + ' m') : ''}
      ${p.kategori === 'koridor' ? row('Distance from road centreline',
        p.jarak_jalan_m == null ? 'no road data' : p.jarak_jalan_m + ' m') : ''}
      ${row('Lot no.', p.lot || 'no cadastral lot')}
      ${p.upi ? row('UPI', p.upi) : ''}
      ${row('Footprint area', mpkNum(p.area_m2) + ' m²')}
      ${row('AI confidence', Math.round(p.confidence * 100) + '%')}
      ${jenis ? row('Est. processing fee', mpkRM(p.area_m2 * MPK.rates.fee)) : ''}
      ${jenis ? row('Est. assessment tax', mpkRM(p.area_m2 * MPK.rates.cukai) + '/yr') : ''}
    </div>`;
  if (MPK.popup) MPK.popup.remove();
  MPK.popup = new maplibregl.Popup({ maxWidth: '290px' }).setLngLat(lngLat).setHTML(html).addTo(map);
}

function mpkZoomTo(id) {
  const f = MPK.data.buildings.features.find(x => x.properties.id === id);
  if (!f) return;
  map.fitBounds(mpkBoundsOf([f]), { padding: 140, maxZoom: 18, duration: 1000 });
  try { map.getSource('mpk-highlight').setData(f); } catch (e) {}
  mpkShowPopup(f.properties, [f.properties.lng, f.properties.lat]);
}

function mpkExportCSV() {
  const s = MPK.lastStats;
  if (!s || !s.count) { showToast('⚠️ No suspected buildings to export'); return; }
  const blob = new Blob(['﻿' + mpkCSV(s.suspects, MPK.rates, MPK.settings)], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'mpk_suspected_buildings_' + (MPK_CSV_AREA[MPK.area] || 'all_areas') + '.csv';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  showToast('📄 ' + mpkNum(s.count) + ' suspected buildings exported');
  addActivityLog('MPK CSV export', mpkNum(s.count) + ' buildings · ' + (MPK_AREAS[MPK.area]?.short || 'All areas'));
}
