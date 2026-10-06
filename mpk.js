// ============================================================
// MPK KEMAMAN — SUSPECTED ILLEGAL CONSTRUCTION MODE
// Three study areas from MPK:
//   tk   Kawasan Industri Teluk Kalong — buildings inside the PBT boundary on no approved
//        lot, or outside the boundary within the buffer
//   bpb  Koridor Bandar Putra – Berenjut } buildings within the road-reserve distance of
//   bbc  Koridor Binjai – Bandar Chukai  } the road centreline
// Data: mpk/*.geojson, built by tools/vectorize_teluk_kalong.py + tools/build_mpk_illegal.py
// ============================================================

// ---------- Pure logic (also exported for tools/test_mpk_logic.js) ----------
// Suspect type of one building under the current settings {buffer, rizab}, or null.
function mpkJenis(p, s) {
  if (p.kategori === 'tiada_lot') return 'tiada_lot';
  if (p.kategori === 'luar' && p.jarak_m <= s.buffer) return 'luar_sempadan';
  if (p.kategori === 'koridor' && p.jarak_jalan_m != null && p.jarak_jalan_m <= s.rizab) return 'rizab';
  return null;
}

// MapLibre filter equivalent of mpkJenis(...) !== null
function mpkSuspectFilter(s) {
  return ['any',
    ['==', ['get', 'kategori'], 'tiada_lot'],
    ['all', ['==', ['get', 'kategori'], 'luar'], ['<=', ['get', 'jarak_m'], s.buffer]],
    ['all', ['==', ['get', 'kategori'], 'koridor'],
      ['<=', ['to-number', ['coalesce', ['get', 'jarak_jalan_m'], 1e9]], s.rizab]],
  ];
}

function mpkStats(features, s, rates, kawasan) {
  const feats = kawasan === 'all' ? features : features.filter(f => f.properties.kawasan === kawasan);
  const byJenis = { tiada_lot: 0, luar_sempadan: 0, rizab: 0 };
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

function mpkCSV(suspects, rates, s) {
  const header = 'id,kawasan,jenis,plus_code,lng,lat,jarak_m,area_m2,confidence,anggaran_fee_rm,anggaran_cukai_tahunan_rm';
  const rows = suspects.map(f => {
    const p = f.properties, jenis = mpkJenis(p, s);
    const jarak = jenis === 'luar_sempadan' ? p.jarak_m : jenis === 'rizab' ? p.jarak_jalan_m : '';
    return [p.id, p.kawasan, jenis, p.plus_code, p.lng, p.lat, jarak, p.area_m2, p.confidence,
      (p.area_m2 * rates.fee).toFixed(2), (p.area_m2 * rates.cukai).toFixed(2)].join(',');
  });
  return [header, ...rows].join('\n') + '\n';
}

if (typeof module !== 'undefined') module.exports = { mpkJenis, mpkSuspectFilter, mpkStats, mpkCSV };

// ---------- Browser mode ----------
const MPK_AREAS = {
  tk:  { name: 'Kawasan Industri Teluk Kalong', short: 'Teluk Kalong' },
  bpb: { name: 'Koridor Bandar Putra – Berenjut', short: 'B. Putra – Berenjut' },
  bbc: { name: 'Koridor Binjai – Bandar Chukai', short: 'Binjai – Chukai' },
};
const MPK_JENIS = {
  tiada_lot:     { label: 'Dalam sempadan, tiada lot lulus', color: '#e53935', areas: ['tk'] },
  luar_sempadan: { label: 'Luar sempadan PBT (dalam penampan)', color: '#FB8C00', areas: ['tk'] },
  rizab:         { label: 'Menceroboh rizab jalan', color: '#C2185B', areas: ['bpb', 'bbc'] },
};

const MPK = {
  FILES: {
    buildings: 'mpk/mpk_buildings.geojson',
    boundary: 'mpk/tk_sempadan.geojson',
    lots: 'mpk/tk_lot_lulus.geojson',
    roads: 'mpk/koridor_jalan.geojson',
  },
  RATES_KEY: 'mpk_rates',
  DEFAULT_RATES: { fee: 2.0, cukai: 6.0 },
  LIST_SIZE: 50,
  LAYERS: ['mpk-lot-fill', 'mpk-lot-line', 'mpk-boundary-fill', 'mpk-boundary-line', 'mpk-koridor-band',
           'mpk-koridor-line', 'mpk-base-fill', 'mpk-suspect-fill', 'mpk-suspect-line',
           'mpk-suspect-extrude', 'mpk-highlight-line'],
  SOURCES: ['mpk-lots', 'mpk-boundary', 'mpk-roads', 'mpk-buildings', 'mpk-highlight'],
  SUSPECT_LAYERS: ['mpk-suspect-fill', 'mpk-suspect-line', 'mpk-suspect-extrude'],
  active: false,
  data: null,
  bounds: null,
  settings: { buffer: 500, rizab: 10 },
  area: 'all',
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
    const res = await fetch(url);
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
  const jenisColor = ['match', ['get', 'kategori'],
    'tiada_lot', MPK_JENIS.tiada_lot.color, 'luar', MPK_JENIS.luar_sempadan.color, MPK_JENIS.rizab.color];
  try {
    map.addSource('mpk-lots', { type: 'geojson', data: MPK.data.lots });
    map.addSource('mpk-boundary', { type: 'geojson', data: MPK.data.boundary });
    map.addSource('mpk-roads', { type: 'geojson', data: MPK.data.roads });
    map.addSource('mpk-buildings', { type: 'geojson', data: MPK.data.buildings });
    map.addSource('mpk-highlight', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });

    map.addLayer({ id: 'mpk-lot-fill', type: 'fill', source: 'mpk-lots',
      paint: { 'fill-color': '#8E24AA', 'fill-opacity': 0.22 } });
    map.addLayer({ id: 'mpk-lot-line', type: 'line', source: 'mpk-lots',
      paint: { 'line-color': '#6A1B9A', 'line-width': 1, 'line-opacity': 0.7 } });
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
  mpkRefresh3D();
  return true;
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
  mpkSetVis('mpk-suspect-extrude', MPK.active && is3D ? 'visible' : 'none');
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
    if (!MPK.data) showLoading('Memuat data MPK Kemaman...', 'Bangunan, sempadan, lot & koridor');
    await mpkEnsureData();
  } catch (err) {
    hideLoading();
    showToast('⚠️ Gagal memuat data MPK: ' + err.message, 5000);
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
  title.textContent = 'Pemantauan Binaan Haram — MPK Kemaman';
  sub.textContent = 'Teluk Kalong · Bandar Putra–Berenjut · Binjai–Bandar Chukai';
  panelSub.textContent = 'MPK Kemaman · Binaan disyaki tiada Kebenaran Merancang';

  const tab = document.getElementById('ptab-mpk');
  tab.style.display = '';
  mpkBuildPanel();
  switchTab(tab, 'mpk');
  mpkSelectArea(MPK.area);
  addActivityLog('Mod MPK Kemaman', 'Pemantauan binaan disyaki');
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
  addActivityLog('Mod Seremban', 'Kembali ke papan pemuka Seremban');
}

// ---------- Panel ----------
const mpkNum = n => Math.round(n).toLocaleString('en-MY');
const mpkRM = n => 'RM ' + Math.round(n).toLocaleString('en-MY');

function mpkBuildPanel() {
  const el = document.getElementById('tab-mpk');
  if (el.dataset.built) return;
  el.dataset.built = '1';
  const chips = [['all', 'Semua'], ...Object.entries(MPK_AREAS).map(([k, a]) => [k, a.short])]
    .map(([k, label]) => `<button class="mpk-chip" data-area="${k}" onclick="mpkSelectArea('${k}')">${label}</button>`).join('');
  const jenisRows = Object.entries(MPK_JENIS).map(([k, j]) => `
    <div class="mpk-jenis-row" id="mpk-jenis-${k}">
      <i class="sw" style="background:${j.color}"></i><span>${j.label}</span><strong id="mpk-j-${k}">—</strong>
    </div>`).join('');
  el.innerHTML = `
    <div class="mpk-hero">
      <div class="mpk-eyebrow">MPK Kemaman · Mockup</div>
      <div class="mpk-hero-title">Binaan disyaki tiada Kebenaran Merancang</div>
      <div class="mpk-hero-sub" id="mpk-hero-sub"></div>
    </div>

    <div class="mpk-chips" role="tablist">${chips}</div>

    <div class="mpk-card">
      <div id="mpk-ctl-buffer">
        <div class="mpk-row">
          <label for="mpk-buffer" class="mpk-label">Zon penampan luar sempadan (Teluk Kalong)</label>
          <span class="mpk-slider-val" id="mpk-buffer-val"></span>
        </div>
        <input type="range" id="mpk-buffer" class="mpk-range" min="100" max="1000" step="50"
          value="${MPK.settings.buffer}" oninput="mpkOnSetting('buffer', this.value)">
        <div class="mpk-range-scale"><span>100 m</span><span>1 km</span></div>
      </div>
      <div id="mpk-ctl-rizab">
        <div class="mpk-row">
          <label for="mpk-rizab" class="mpk-label">Rizab jalan dari garis tengah (koridor)</label>
          <span class="mpk-slider-val" id="mpk-rizab-val"></span>
        </div>
        <input type="range" id="mpk-rizab" class="mpk-range" min="3" max="20" step="1"
          value="${MPK.settings.rizab}" oninput="mpkOnSetting('rizab', this.value)">
        <div class="mpk-range-scale"><span>3 m</span><span>20 m</span></div>
      </div>
    </div>

    <div class="mpk-kpis">
      <div class="mpk-kpi danger"><div class="v" id="mpk-k-count">—</div><div class="l">Binaan disyaki</div></div>
      <div class="mpk-kpi"><div class="v" id="mpk-k-area">—</div><div class="l">Keluasan disyaki (m²)</div></div>
      <div class="mpk-kpi"><div class="v" id="mpk-k-total">—</div><div class="l">Bangunan dikaji</div></div>
    </div>

    <div class="mpk-card mpk-jenis">${jenisRows}</div>

    <div class="mpk-card">
      <div class="mpk-card-title">Anggaran hasil PBT <span class="mpk-tag">andaian</span></div>
      <div class="mpk-rate-row">
        <label for="mpk-rate-fee">Fee proses Cadangan Pemajuan<small>RM / m²</small></label>
        <input type="number" id="mpk-rate-fee" min="0" step="0.1" value="${MPK.rates.fee}" oninput="mpkOnRate()">
        <div class="mpk-money" id="mpk-r-fee">—</div>
      </div>
      <div class="mpk-rate-row">
        <label for="mpk-rate-cukai">Cukai Pintu<small>RM / m² / tahun</small></label>
        <input type="number" id="mpk-rate-cukai" min="0" step="0.1" value="${MPK.rates.cukai}" oninput="mpkOnRate()">
        <div class="mpk-money" id="mpk-r-cukai">—</div>
      </div>
      <div class="mpk-total"><span>Potensi hasil tahun pertama</span><strong id="mpk-r-total">—</strong></div>
    </div>

    <div class="mpk-legend">
      <span><i class="sw" style="background:${MPK_JENIS.tiada_lot.color}"></i>Tiada lot lulus</span>
      <span><i class="sw" style="background:${MPK_JENIS.luar_sempadan.color}"></i>Luar sempadan</span>
      <span><i class="sw" style="background:${MPK_JENIS.rizab.color}"></i>Ceroboh rizab</span>
      <span><i class="sw" style="background:#7CB342"></i>Atas lot lulus</span>
      <span><i class="sw" style="background:#B0BEC5"></i>Lain-lain</span>
      <span><i class="sw lot"></i>Lot lulus</span>
      <span><i class="sw line"></i>Sempadan PBT</span>
      <span><i class="sw band"></i>Koridor kajian</span>
    </div>

    <div class="mpk-list-head">
      <div class="mpk-card-title">Binaan disyaki terbesar</div>
      <button class="mpk-btn" onclick="mpkExportCSV()">Export CSV</button>
    </div>
    <div class="mpk-list" id="mpk-list"></div>

    <div class="mpk-note">Bangunan: Google Open Buildings. Sempadan & lot lulus Teluk Kalong didigitkan dari peta MPK;
      garis jalan dari OpenStreetMap. Lebar rizab dan kadar hasil ialah andaian. Semua kes perlu pengesahan tapak.</div>
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
    ? 'Tiga kawasan kajian: Kaw. Industri Teluk Kalong dan dua koridor jalan di Bandar Chukai.'
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
    list.innerHTML = '<div class="mpk-empty">Tiada binaan disyaki dengan tetapan ini.</div>';
    return;
  }
  list.innerHTML = s.suspects.slice(0, MPK.LIST_SIZE).map((f, i) => {
    const p = f.properties, j = MPK_JENIS[mpkJenis(p, MPK.settings)];
    return `<div class="mpk-item" onclick="mpkZoomTo(${p.id})">
      <span class="mpk-rank">${i + 1}</span>
      <i class="mpk-dot" style="background:${j.color}"></i>
      <div class="mpk-item-main"><div class="mpk-pc">${p.plus_code}</div>
        <div class="mpk-meta">${MPK_AREAS[p.kawasan].short} · ${j.label}</div></div>
      <div class="mpk-area">${mpkNum(p.area_m2)} m²</div>
    </div>`;
  }).join('') + (s.count > MPK.LIST_SIZE
    ? `<div class="mpk-more">+ ${mpkNum(s.count - MPK.LIST_SIZE)} lagi · lihat Export CSV</div>` : '');
}

function mpkRenderRevenue() {
  const s = MPK.lastStats;
  if (!s) return;
  const fee = s.area * MPK.rates.fee, cukai = s.area * MPK.rates.cukai;
  document.getElementById('mpk-r-fee').textContent = mpkRM(fee);
  document.getElementById('mpk-r-cukai').textContent = mpkRM(cukai) + '/thn';
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
  if (jenis) return 'Disyaki · ' + MPK_JENIS[jenis].label;
  if (p.kategori === 'lulus') return 'Atas lot lulus PBT';
  if (p.kategori === 'luar') return 'Luar sempadan, di luar zon penampan';
  return 'Dalam koridor · perlu semakan KM / Cukai Pintu';
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
      ${row('Kawasan', MPK_AREAS[p.kawasan].short)}
      ${p.kategori === 'luar' ? row('Jarak dari sempadan', p.jarak_m + ' m') : ''}
      ${p.kategori === 'koridor' ? row('Jarak dari garis tengah jalan',
        p.jarak_jalan_m == null ? 'tiada data jalan' : p.jarak_jalan_m + ' m') : ''}
      ${row('Keluasan', mpkNum(p.area_m2) + ' m²')}
      ${row('Keyakinan AI', Math.round(p.confidence * 100) + '%')}
      ${jenis ? row('Anggaran fee proses', mpkRM(p.area_m2 * MPK.rates.fee)) : ''}
      ${jenis ? row('Anggaran Cukai Pintu', mpkRM(p.area_m2 * MPK.rates.cukai) + '/thn') : ''}
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
  if (!s || !s.count) { showToast('⚠️ Tiada binaan disyaki untuk dieksport'); return; }
  const blob = new Blob(['﻿' + mpkCSV(s.suspects, MPK.rates, MPK.settings)], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'mpk_binaan_disyaki_' + MPK.area + '.csv';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  showToast('📄 ' + mpkNum(s.count) + ' binaan disyaki dieksport');
  addActivityLog('Export CSV MPK', mpkNum(s.count) + ' binaan · ' + (MPK_AREAS[MPK.area]?.short || 'Semua kawasan'));
}
