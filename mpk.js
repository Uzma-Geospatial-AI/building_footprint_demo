// ============================================================
// MPK KEMAMAN — SUSPECTED ILLEGAL CONSTRUCTION MODE
// Buildings outside the PBT industrial planning boundary, within a user-set buffer,
// are flagged as suspected construction without Kebenaran Merancang.
// Data: mpk/*.geojson, built by tools/build_mpk_illegal.py
// ============================================================

// ---------- Pure logic (also exported for tools/test_mpk_logic.js) ----------
function mpkSuspectFilter(buffer) {
  return ['all', ['==', ['get', 'status'], 'luar'], ['<=', ['get', 'jarak_m'], buffer]];
}

function mpkSuspects(features, buffer) {
  return features.filter(f => f.properties.status === 'luar' && f.properties.jarak_m <= buffer);
}

function mpkStats(features, buffer, rates) {
  const suspects = mpkSuspects(features, buffer).sort((a, b) => b.properties.area_m2 - a.properties.area_m2);
  const area = suspects.reduce((sum, f) => sum + f.properties.area_m2, 0);
  const inPlan = features.filter(f => f.properties.status === 'dalam').length;
  return { count: suspects.length, area, inPlan, fee: area * rates.fee, cukai: area * rates.cukai, suspects };
}

function mpkCSV(suspects, rates) {
  const header = 'id,plus_code,lng,lat,jarak_m,area_m2,confidence,anggaran_fee_rm,anggaran_cukai_tahunan_rm';
  const rows = suspects.map(f => {
    const p = f.properties;
    return [p.id, p.plus_code, p.lng, p.lat, p.jarak_m, p.area_m2, p.confidence,
      (p.area_m2 * rates.fee).toFixed(2), (p.area_m2 * rates.cukai).toFixed(2)].join(',');
  });
  return [header, ...rows].join('\n') + '\n';
}

if (typeof module !== 'undefined') module.exports = { mpkSuspectFilter, mpkSuspects, mpkStats, mpkCSV };

// ---------- Browser mode ----------
const MPK = {
  BUILDINGS_URL: 'mpk/mpk_buildings.geojson',
  BOUNDARY_URL: 'mpk/mpk_sempadan.geojson',
  RATES_KEY: 'mpk_rates',
  DEFAULT_RATES: { fee: 2.0, cukai: 6.0 },
  DEFAULT_BUFFER: 500,
  LIST_SIZE: 50,
  LAYERS: ['mpk-boundary-fill', 'mpk-boundary-line', 'mpk-plan-fill', 'mpk-suspect-fill',
           'mpk-suspect-line', 'mpk-suspect-extrude', 'mpk-highlight-line'],
  SOURCES: ['mpk-buildings', 'mpk-boundary', 'mpk-highlight'],
  active: false,
  buildings: null,
  boundary: null,
  bounds: null,
  buffer: 500,
  rates: null,
  boundMap: null,
  prevTitle: null,
  popup: null,
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

async function mpkEnsureData() {
  if (MPK.buildings) return;
  const [b, s] = await Promise.all([MPK.BUILDINGS_URL, MPK.BOUNDARY_URL].map(async url => {
    const res = await fetch(url);
    if (!res.ok) throw new Error('HTTP ' + res.status + ' · ' + url);
    return res.json();
  }));
  let minLng = 180, minLat = 90, maxLng = -180, maxLat = -90;
  const extend = ([lng, lat]) => {
    if (lng < minLng) minLng = lng; if (lng > maxLng) maxLng = lng;
    if (lat < minLat) minLat = lat; if (lat > maxLat) maxLat = lat;
  };
  b.features.forEach(f => f.geometry.coordinates[0].forEach(extend));
  s.features.forEach(f => f.geometry.coordinates[0].forEach(extend));
  MPK.buildings = b;
  MPK.boundary = s;
  MPK.bounds = [[minLng, minLat], [maxLng, maxLat]];
}

// Returns false when the style was not ready and nothing was added.
function mpkAddLayers() {
  if (!map) return false;
  if (map.getSource('mpk-buildings')) return true;
  try {
    map.addSource('mpk-boundary', { type: 'geojson', data: MPK.boundary });
    map.addSource('mpk-buildings', { type: 'geojson', data: MPK.buildings });
    map.addSource('mpk-highlight', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    const suspect = mpkSuspectFilter(MPK.buffer);
    map.addLayer({ id: 'mpk-boundary-fill', type: 'fill', source: 'mpk-boundary',
      paint: { 'fill-color': '#E8772E', 'fill-opacity': 0.06 } });
    map.addLayer({ id: 'mpk-boundary-line', type: 'line', source: 'mpk-boundary',
      paint: { 'line-color': '#E8772E', 'line-width': 2.5, 'line-dasharray': [3, 2] } });
    map.addLayer({ id: 'mpk-plan-fill', type: 'fill', source: 'mpk-buildings',
      filter: ['==', ['get', 'status'], 'dalam'],
      paint: { 'fill-color': '#90A4AE', 'fill-opacity': 0.45 } });
    map.addLayer({ id: 'mpk-suspect-fill', type: 'fill', source: 'mpk-buildings', filter: suspect,
      paint: { 'fill-color': '#e53935', 'fill-opacity': 0.7 } });
    map.addLayer({ id: 'mpk-suspect-line', type: 'line', source: 'mpk-buildings', filter: suspect,
      paint: { 'line-color': '#b71c1c', 'line-width': ['interpolate', ['linear'], ['zoom'], 13, 0.4, 17, 1.5] } });
    map.addLayer({ id: 'mpk-suspect-extrude', type: 'fill-extrusion', source: 'mpk-buildings', filter: suspect,
      layout: { visibility: 'none' },
      paint: { 'fill-extrusion-color': '#e53935', 'fill-extrusion-height': 8, 'fill-extrusion-base': 0,
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

function mpkSetVis(id, vis) {
  if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', vis);
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
  ['mpk-suspect-fill', 'mpk-plan-fill'].forEach(layer => {
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
    if (!MPK.buildings) showLoading('Memuat data MPK Kemaman...', 'Bangunan & sempadan perancangan');
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

  // UZMA-sat imagery only covers Seremban — use Google Satellite over Kemaman
  if (currentBasemap === 'uzma-sat') {
    const opt = document.querySelector('.basemap-option[onclick*="google-satellite"]');
    switchBasemap('google-satellite', 'Google Satellite', opt);
  }

  mpkSetSerembanVisible(false);
  mpkAddLayers();
  mpkBindEvents();
  map.fitBounds(MPK.bounds, { padding: 50, duration: 1200 });

  const title = document.getElementById('page-title'), sub = document.getElementById('page-sub');
  const panelSub = document.getElementById('panel-sub');
  MPK.prevTitle = { title: title.textContent, sub: sub.textContent, panelSub: panelSub.textContent };
  title.textContent = 'Pemantauan Binaan Haram — MPK Kemaman';
  sub.textContent = 'Kaw. Perindustrian Teluk Kalong & Bandar Chukai';
  panelSub.textContent = 'MPK Kemaman · Binaan disyaki tiada Kebenaran Merancang';

  const tab = document.getElementById('ptab-mpk');
  tab.style.display = '';
  mpkBuildPanel();
  switchTab(tab, 'mpk');
  mpkRender();
  addActivityLog('Mod MPK Kemaman', 'Pemantauan binaan disyaki · buffer ' + MPK.buffer + ' m');
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
  if (tab.classList.contains('active')) switchTab(document.querySelector('.ptab'), 'overview');
  tab.style.display = 'none';
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
  el.innerHTML = `
    <div class="mpk-hero">
      <div class="mpk-eyebrow">MPK Kemaman · Mockup</div>
      <div class="mpk-hero-title">Binaan disyaki tiada Kebenaran Merancang</div>
      <div class="mpk-hero-sub">Bangunan di luar sempadan perancangan perindustrian PBT, dalam zon penampan yang dipilih.</div>
    </div>

    <div class="mpk-card">
      <div class="mpk-row">
        <label for="mpk-buffer" class="mpk-label">Zon penampan dari sempadan</label>
        <span class="mpk-buffer-val" id="mpk-buffer-val"></span>
      </div>
      <input type="range" id="mpk-buffer" class="mpk-range" min="100" max="1000" step="50"
        value="${MPK.buffer}" oninput="mpkOnBuffer(this.value)">
      <div class="mpk-range-scale"><span>100 m</span><span>1 km</span></div>
    </div>

    <div class="mpk-kpis">
      <div class="mpk-kpi danger"><div class="v" id="mpk-k-count">—</div><div class="l">Binaan disyaki</div></div>
      <div class="mpk-kpi"><div class="v" id="mpk-k-area">—</div><div class="l">Keluasan (m²)</div></div>
      <div class="mpk-kpi ok"><div class="v" id="mpk-k-plan">—</div><div class="l">Dalam perancangan</div></div>
    </div>

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
      <span><i class="sw red"></i>Disyaki</span>
      <span><i class="sw grey"></i>Dalam perancangan</span>
      <span><i class="sw line"></i>Sempadan PBT</span>
    </div>

    <div class="mpk-list-head">
      <div class="mpk-card-title">Binaan disyaki terbesar</div>
      <button class="mpk-btn" onclick="mpkExportCSV()">Export CSV</button>
    </div>
    <div class="mpk-list" id="mpk-list"></div>

    <div class="mpk-note">Berdasarkan Google Open Buildings + sempadan perindustrian PBT; perlu pengesahan tapak.</div>
  `;
}

function mpkRender() {
  if (!MPK.buildings) return;
  const s = mpkStats(MPK.buildings.features, MPK.buffer, MPK.rates);
  MPK.lastStats = s;
  document.getElementById('mpk-buffer-val').textContent = MPK.buffer + ' m';
  document.getElementById('mpk-k-count').textContent = mpkNum(s.count);
  document.getElementById('mpk-k-area').textContent = mpkNum(s.area);
  document.getElementById('mpk-k-plan').textContent = mpkNum(s.inPlan);
  mpkRenderRevenue();

  const list = document.getElementById('mpk-list');
  if (!s.count) {
    list.innerHTML = '<div class="mpk-empty">Tiada binaan disyaki dalam zon penampan ini.</div>';
    return;
  }
  list.innerHTML = s.suspects.slice(0, MPK.LIST_SIZE).map((f, i) => {
    const p = f.properties;
    return `<div class="mpk-item" onclick="mpkZoomTo(${p.id})">
      <span class="mpk-rank">${i + 1}</span>
      <div class="mpk-item-main"><div class="mpk-pc">${p.plus_code}</div>
        <div class="mpk-meta">${p.jarak_m} m dari sempadan</div></div>
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

function mpkOnBuffer(v) {
  MPK.buffer = parseInt(v, 10);
  const filter = mpkSuspectFilter(MPK.buffer);
  ['mpk-suspect-fill', 'mpk-suspect-line', 'mpk-suspect-extrude'].forEach(id => {
    try { if (map.getLayer(id)) map.setFilter(id, filter); } catch (e) {}
  });
  mpkRender();
}

function mpkOnRate() {
  const read = id => { const v = parseFloat(document.getElementById(id).value); return isFinite(v) && v >= 0 ? v : 0; };
  MPK.rates = { fee: read('mpk-rate-fee'), cukai: read('mpk-rate-cukai') };
  mpkSaveRates();
  mpkRenderRevenue();
}

// ---------- Map interaction ----------
function mpkShowPopup(p, lngLat) {
  const suspect = p.status === 'luar' && p.jarak_m <= MPK.buffer;
  const statusText = p.status === 'dalam' ? 'Dalam perancangan PBT'
    : suspect ? 'Disyaki tiada Kebenaran Merancang' : 'Luar zon penampan';
  const row = (k, v) => `<div class="popup-row"><span class="popup-k">${k}</span><span class="popup-v">${v}</span></div>`;
  const html = `
    <div class="popup-header ${suspect ? 'mpk-popup-danger' : ''}">
      <div class="popup-fc">${statusText}</div>
      <div class="popup-name">${p.plus_code}</div>
    </div>
    <div class="popup-body">
      ${p.status === 'luar' ? row('Jarak dari sempadan', p.jarak_m + ' m') : ''}
      ${row('Keluasan', mpkNum(p.area_m2) + ' m²')}
      ${row('Keyakinan AI', Math.round(p.confidence * 100) + '%')}
      ${suspect ? row('Anggaran fee proses', mpkRM(p.area_m2 * MPK.rates.fee)) : ''}
      ${suspect ? row('Anggaran Cukai Pintu', mpkRM(p.area_m2 * MPK.rates.cukai) + '/thn') : ''}
    </div>`;
  if (MPK.popup) MPK.popup.remove();
  MPK.popup = new maplibregl.Popup({ maxWidth: '280px' }).setLngLat(lngLat).setHTML(html).addTo(map);
}

function mpkZoomTo(id) {
  const f = MPK.buildings.features.find(x => x.properties.id === id);
  if (!f) return;
  const ring = f.geometry.coordinates[0];
  const lngs = ring.map(c => c[0]), lats = ring.map(c => c[1]);
  map.fitBounds([[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]],
    { padding: 140, maxZoom: 18, duration: 1000 });
  try { map.getSource('mpk-highlight').setData(f); } catch (e) {}
  mpkShowPopup(f.properties, [f.properties.lng, f.properties.lat]);
}

function mpkExportCSV() {
  const s = MPK.lastStats;
  if (!s || !s.count) { showToast('⚠️ Tiada binaan disyaki untuk dieksport'); return; }
  const blob = new Blob(['﻿' + mpkCSV(s.suspects, MPK.rates)], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'mpk_binaan_disyaki_' + MPK.buffer + 'm.csv';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  showToast('📄 ' + mpkNum(s.count) + ' binaan disyaki dieksport');
  addActivityLog('Export CSV MPK', mpkNum(s.count) + ' binaan · buffer ' + MPK.buffer + ' m');
}
