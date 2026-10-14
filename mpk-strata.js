// ============================================================
// STRATA TITLE CONCEPT — MPK KEMAMAN (Area dropdown → Strata)
// From the map to the strata register, on the MPK buildings (the study areas and the hand-drawn
// footprints of Chukai and beyond):
//   1 Map          click a building → start a strata scheme for it
//   2 Parcels & 3D the parcels (petak) of each floor, accessory parcels (parking) and common
//                  property; a floor stack and the building's BIM level of development (LOD 100–500)
//   3 Share units  unit syer per parcel: floor area × the weightage of its use + accessory area ×
//                  the accessory weightage (Strata Titles Act 1985, Act 318)
//   4 Strata title Draft → proposed strata plan certified by JUPEM (CPSP) → Form 1 application to
//                  the Land Office (PTG) → strata titles registered; the managing body (developer,
//                  JMB, MC, Strata Management Act 2013, Act 757) and the documents
//   5 Tax & charges assessment tax per parcel (cukai taksiran, Act 171 s.127) with yearly bills paid
//                  in two halves, maintenance charge per share unit and the 10 % sinking fund
// Plus the cemetery sites of the district. Weightages, rates and rents are assumptions to set to
// MPK's / the State's own. Kept in this browser (localStorage); Export / Import moves it.
// ============================================================

// ---------- Pure logic (exported for tools/test_mpk_strata.js) ----------
const STRATA_USES = ['Kediaman', 'Komersial', 'Industri', 'Lain-lain'];
const STRATA_USE_COLOR = { Kediaman: '#42A5F5', Komersial: '#FFA726', Industri: '#8D6E63', 'Lain-lain': '#AB47BC' };
const STRATA_DEFAULTS = {
  kadar: { Kediaman: 6, Komersial: 9, Industri: 9, 'Lain-lain': 6 },        // assessment rate, % of annual value
  sewa: { Kediaman: 4, Komersial: 12, Industri: 6, 'Lain-lain': 4 },        // rent for the estimate, RM / m² / month
  faktor: { Kediaman: 1, Komersial: 1.3, Industri: 1, 'Lain-lain': 1, aksesori: 0.25 },   // share-unit weightage
};
const STRATA_NET = 0.85;              // share of a floor sold as parcels when parcels are created (the rest is common property)
const STRATA_STAGES = [
  { k: 'draf', label: 'Draft', ms: 'Draf: jadual petak disediakan', color: '#FFB300' },
  { k: 'cpsp', label: 'CPSP certified', ms: 'Pelan strata cadangan diperakui JUPEM (CPSP)', color: '#1E88E5' },
  { k: 'borang1', label: 'Applied to PTG', ms: 'Permohonan pecah bahagi bangunan (Borang 1) di PTG', color: '#7E57C2' },
  { k: 'hakmilik', label: 'Titles issued', ms: 'Hakmilik strata didaftarkan', color: '#2E7D32' },
];
const STRATA_LOD = [
  { v: 100, name: 'Conceptual', text: 'Footprint only: a 2D outline.', color: '#B0BEC5' },
  { v: 200, name: 'Approximate geometry', text: 'Massing from the footprint and the number of floors.', color: '#64B5F6' },
  { v: 300, name: 'Precise geometry', text: 'Floors and parcels as in the approved building / strata plan.', color: '#1E88E5' },
  { v: 400, name: 'Fabrication', text: 'Structure and services modelled, ready for construction.', color: '#3949AB' },
  { v: 500, name: 'As-built', text: 'Verified on site against the building as built.', color: '#1A237E' },
];
const STRATA_DOCS = [
  ['cpsp', 'Pelan strata cadangan diperakui (CPSP, JUPEM)'], ['ccc', 'Perakuan Siap dan Pematuhan (CCC)'],
  ['jadual', 'Jadual petak dengan unit syer'], ['induk', 'Hakmilik induk / carian rasmi'],
  ['pelan', 'Pelan bangunan diluluskan'], ['fi', 'Fi permohonan dibayar'],
];
const STRATA_KUBUR_TYPES = ['Islam', 'Bukan Islam', 'Swasta', 'Krematorium'];

const strataNum = v => { const n = parseFloat(String(v == null ? '' : v).replace(/,/g, '')); return isFinite(n) && n > 0 ? n : 0; };
// Parcels of a building: floors × parcels per floor, each an equal share of the floor's saleable area
function strataGenParcels(floors, perFloor, footprint, kegunaan) {
  const F = Math.max(1, Math.floor(strataNum(floors) || 1)), U = Math.max(1, Math.floor(strataNum(perFloor) || 1));
  const luas = Math.round(strataNum(footprint) * STRATA_NET / U * 100) / 100;
  const out = [];
  for (let f = 1; f <= F; f++) {
    for (let u = 1; u <= U; u++) out.push({ petak: `M${f}-${String(u).padStart(2, '0')}`, tingkat: String(f), luas: String(luas), kegunaan, pemilik: '', nilai: '', aks_no: '', aks_luas: '' });
  }
  return out;
}
// Common property: the building's floor area (footprint × floors) less the parcels, unless entered
function strataCommon(sc) {
  if (strataNum(sc.common)) return strataNum(sc.common);
  const gross = strataNum(sc.bld && sc.bld.area_m2) * (strataNum(sc.bim && sc.bim.tingkat) || 1);
  return Math.max(0, Math.round((gross - sc.parcels.reduce((a, p) => a + strataNum(p.luas), 0)) * 100) / 100);
}
// Share units: round(area × weightage of the use + accessory area × accessory weightage); share of the total
function strataShareUnits(parcels, faktor) {
  const su = parcels.map(p => Math.round(strataNum(p.luas) * (faktor[p.kegunaan] || 1) + strataNum(p.aks_luas) * (faktor.aksesori || 0)));
  const total = su.reduce((a, b) => a + b, 0);
  return { su, total, pct: su.map(v => total ? v / total * 100 : 0) };
}
const strataAnnualValue = (luas, sewa) => Math.round(strataNum(luas) * strataNum(sewa) * 12);
// Yearly assessment tax of a parcel: annual value (or the estimate) × the rate of its use
function strataTax(p, rates) {
  const nilai = strataNum(p.nilai) || strataAnnualValue(p.luas, rates.sewa[p.kegunaan] || 0);
  return Math.round(nilai * (rates.kadar[p.kegunaan] || 0)) / 100;
}
// Monthly maintenance charge (share units × RM a share unit) and sinking fund (10 % of the charge, Act 757)
function strataCharges(su, kadar) {
  const caj = Math.round(strataNum(su) * strataNum(kadar) * 100) / 100;
  return { caj, sinking: Math.round(caj * 10) / 100 };
}
function strataLodSuggest(p, bim) {
  const floors = bim && strataNum(bim.tingkat);
  if (bim && bim.disahkan) return 500;
  if (floors && p && (p.pelan_fail || p.daftar_status === 'lulus')) return 300;
  if (floors || (bim && strataNum(bim.tinggi))) return 200;
  return 100;
}
const strataHeight = bim => strataNum(bim && bim.tinggi) || (strataNum(bim && bim.tingkat) || 1) * 4;
// Billed, collected, outstanding of one year and arrears of earlier years; bills: { year: { key: { amount, p1, p2 } } }
function strataCollection(bills, year) {
  const paid = b => (b.p1 ? b.amount / 2 : 0) + (b.p2 ? b.amount / 2 : 0);
  const sum = (y, f) => Object.values(bills[y] || {}).reduce((s, b) => s + f(b), 0);
  const billed = sum(year, b => b.amount), collected = sum(year, paid);
  const arrears = Object.keys(bills).filter(y => +y < +year).reduce((s, y) => s + sum(y, b => b.amount - paid(b)), 0);
  const all = Object.values(bills[year] || {});
  return { billed, collected, outstanding: billed - collected, arrears, rate: billed ? collected / billed : 0, n: all.length, unpaid: all.filter(b => !(b.p1 && b.p2)).length };
}
function strataNextNo(ids, prefix, year) {
  const seq = ids.map(id => new RegExp('^' + prefix + '/(\\d{4})/(\\d+)$').exec(id || '')).filter(m => m && +m[1] === year).map(m => +m[2]);
  return prefix + '/' + year + '/' + String((seq.length ? Math.max(...seq) : 0) + 1).padStart(4, '0');
}

// ---------- Store ----------
const STRATA = { KEY: 'mpk_strata_v1', s: null, active: false, cur: null, step: 1, year: new Date().getFullYear(), bound: false, picking: false, kubur: null };
function strataBlank() { return { schemes: {}, kubur: [], ...JSON.parse(JSON.stringify(STRATA_DEFAULTS)) }; }
function strataLoad() {
  let s = null;
  try { s = JSON.parse(localStorage.getItem(STRATA.KEY) || 'null'); } catch (e) {}
  if (!s) s = strataMigrate();
  STRATA.s = Object.assign(strataBlank(), s || {});
}
// The earlier Property & Tax tab (mpk_harta_v1): its units, LOD, bills and cemeteries become schemes here
function strataMigrate() {
  let h = null;
  try { h = JSON.parse(localStorage.getItem('mpk_harta_v1') || 'null'); } catch (e) {}
  if (!h) return null;
  const s = strataBlank();
  if (h.rates) { s.kadar = h.rates.kadar || s.kadar; s.sewa = h.rates.sewa || s.sewa; }
  const now = new Date().toISOString(), y = new Date().getFullYear();
  for (const [bid, st] of Object.entries(h.strata || {})) {
    const lod = (h.lod || {})[bid] || {};
    const bills = {};
    for (const [yr, bs] of Object.entries(h.bills || {})) {
      for (const [key, b] of Object.entries(bs)) if (key.startsWith(bid + '|')) (bills[yr] = bills[yr] || {})[key.slice(bid.length + 1)] = b;
    }
    s.schemes[bid] = { bid, no: strataNextNo(Object.values(s.schemes).map(x => x.no), 'STR', y), nama: 'Skim strata ' + (st.plus_code || bid),
      pemaju: '', hakmilik_induk: '', alamat: '', created: st.updated || now, updated: now,
      bld: { plus_code: st.plus_code, kawasan: st.kawasan, lot: st.lot, lng: st.lng, lat: st.lat, area_m2: lod.area_m2 },
      bim: { tingkat: lod.tingkat || '', tinggi: lod.tinggi || '', lod: lod.level || 100, disahkan: !!lod.disahkan },
      parcels: st.units.map(u => ({ ...u, aks_no: '', aks_luas: '' })), common: '',
      app: { stage: 'draf', docs: {} }, urus: { jenis: 'Pemaju', nama: '', tarikh: '' }, caj: { kadar: '0.30' }, bills };
  }
  s.kubur = h.kubur || [];
  return s;
}
function strataSave() {
  try { localStorage.setItem(STRATA.KEY, JSON.stringify(STRATA.s)); return true; }
  catch (e) { showToast('⚠️ Could not save in this browser: ' + e.message, 5000); return false; }
}
const strataEsc = v => mpkEscHtml(v == null ? '' : v);
const strataRM = v => 'RM ' + (v || 0).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const strataStage = sc => STRATA_STAGES.findIndex(st => st.k === (sc.app && sc.app.stage));
function strataBuilding(bid) {
  if (!MPK.data) return null;
  return MPK.data.buildings.features.find(f => String(f.properties.id) === String(bid))
    || (MPK.data.others && MPK.data.others.features.find(f => String(f.properties.id) === String(bid))) || null;
}

// ---------- Mode on / off (mpkSetMode in mpk.js) ----------
function strataSet(on) {
  if (on && !STRATA.active) strataEnter();
  else if (!on && STRATA.active) strataLeave();
}
function strataEnter() {
  if (!STRATA.s) strataLoad();
  STRATA.active = true;
  document.body.classList.add('strata-mode');
  if (MPK.popup) { MPK.popup.remove(); MPK.popup = null; }
  if (MPK.page !== 'dashboard') mpkShowPage('dashboard');
  strataBuildPanel();
  const title = document.getElementById('page-title'), sub = document.getElementById('page-sub'), panelSub = document.getElementById('panel-sub');
  STRATA.prevTitle = { title: title.textContent, sub: sub.textContent, panelSub: panelSub.textContent };
  title.textContent = 'Strata Title Concept — MPK Kemaman';
  sub.textContent = 'From the map to the strata register';
  panelSub.textContent = 'Strata schemes, share units, titles, assessment tax and cemeteries';
  switchTab(document.getElementById('ptab-strata'), 'strata');
  strataLayers();
  strataHideMpk();
  strataRenderPanel();
  addActivityLog('Strata mode', 'Strata title concept');
}
function strataLeave() {
  STRATA.active = false;
  document.body.classList.remove('strata-mode');
  strataCloseWs();
  if (MPK.popup) { MPK.popup.remove(); MPK.popup = null; }
  strataRemoveLayers();
  if (STRATA.prevTitle) {
    document.getElementById('page-title').textContent = STRATA.prevTitle.title;
    document.getElementById('page-sub').textContent = STRATA.prevTitle.sub;
    document.getElementById('panel-sub').textContent = STRATA.prevTitle.panelSub;
  }
  if (MPK.active) {
    if (map && map.getSource('mpk-buildings')) mpkApplyLayerVisibility();
    switchTab(document.getElementById('ptab-mpk'), 'mpk');
  }
}
// MPK's own layers give way to the strata ones (called after every MPK visibility change)
const STRATA_KEEP = ['mpk-wayback-layer', 'mpk-kadaster-line', 'mpk-boundary-fill', 'mpk-boundary-line', 'mpk-koridor-band', 'mpk-koridor-line',
  'mpk-landuse-fill', 'mpk-landuse-line', 'mpk-district-line'];
function strataHideMpk() {
  if (!STRATA.active || !map) return;
  MPK.LAYERS.filter(id => !STRATA_KEEP.includes(id)).forEach(id => { try { if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', 'none'); } catch (e) {} });
}

// ---------- Map ----------
function strataBldData() {
  const s = STRATA.s, feats = [...MPK.data.buildings.features, ...(MPK.data.others ? MPK.data.others.features : [])];
  return { type: 'FeatureCollection', features: feats.map(f => {
    const sc = s.schemes[f.properties.id];
    return { type: 'Feature', geometry: f.geometry, properties: { id: f.properties.id, st: sc ? strataStage(sc) + 1 : 0, h: sc ? strataHeight(sc.bim) : 0 } };
  }) };
}
function strataKuburData() {
  return { type: 'FeatureCollection', features: STRATA.s.kubur.map(k => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [k.lng, k.lat] },
    properties: { id: k.id, nama: k.nama || k.id } })) };
}
const STRATA_LAYERS = ['strata-kubur-label', 'strata-kubur-pt', 'strata-3d', 'strata-line', 'strata-fill'];
// Called from mpkAddLayers (mpk.js) and after every change here
function strataLayers() {
  if (!STRATA.active || !map || !MPK.data || !map.getSource('mpk-buildings')) return;
  const stageColor = ['match', ['get', 'st'], ...STRATA_STAGES.flatMap((st, i) => [i + 1, st.color]), '#90A4AE'];
  try {
    if (!map.getSource('strata-bld')) {
      map.addSource('strata-bld', { type: 'geojson', data: strataBldData() });
      map.addLayer({ id: 'strata-fill', type: 'fill', source: 'strata-bld',
        paint: { 'fill-color': stageColor, 'fill-opacity': ['case', ['>', ['get', 'st'], 0], 0.8, 0.35] } });
      map.addLayer({ id: 'strata-line', type: 'line', source: 'strata-bld',
        paint: { 'line-color': ['case', ['>', ['get', 'st'], 0], '#1E2C44', '#607D8B'], 'line-width': ['interpolate', ['linear'], ['zoom'], 13, 0.4, 17, 1.2] } });
      map.addLayer({ id: 'strata-3d', type: 'fill-extrusion', source: 'strata-bld', filter: ['>', ['get', 'st'], 0],
        paint: { 'fill-extrusion-color': stageColor, 'fill-extrusion-height': ['get', 'h'], 'fill-extrusion-base': 0, 'fill-extrusion-opacity': 0.9 } });
    } else map.getSource('strata-bld').setData(strataBldData());
    if (!map.getSource('strata-kubur')) {
      map.addSource('strata-kubur', { type: 'geojson', data: strataKuburData() });
      map.addLayer({ id: 'strata-kubur-pt', type: 'circle', source: 'strata-kubur',
        paint: { 'circle-color': '#6D4C41', 'circle-radius': ['interpolate', ['linear'], ['zoom'], 11, 5, 18, 11], 'circle-stroke-color': '#fff', 'circle-stroke-width': 2 } });
      map.addLayer({ id: 'strata-kubur-label', type: 'symbol', source: 'strata-kubur', minzoom: 13,
        layout: { 'text-field': ['get', 'nama'], 'text-font': ['Noto Sans Regular'], 'text-size': 11.5, 'text-offset': [0, 1.3], 'text-anchor': 'top' },
        paint: { 'text-color': '#4E342E', 'text-halo-color': '#fff', 'text-halo-width': 1.5 } });
    } else map.getSource('strata-kubur').setData(strataKuburData());
  } catch (e) { return; }
  if (!STRATA.bound) {
    STRATA.bound = true;
    map.on('click', 'strata-fill', e => {
      if (!STRATA.active || STRATA.picking || !e.features.length) return;
      if (map.queryRenderedFeatures(e.point, { layers: ['strata-kubur-pt'] }).length) return;
      strataPopup(e.features[0].properties.id, e.lngLat);
    });
    map.on('click', 'strata-kubur-pt', e => {
      if (!STRATA.active || STRATA.picking || !e.features.length) return;
      strataKuburOpen(e.features[0].properties.id);
    });
    for (const id of ['strata-fill', 'strata-kubur-pt']) {
      map.on('mouseenter', id, () => { if (STRATA.active) map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', id, () => { if (STRATA.active) map.getCanvas().style.cursor = 'grab'; });
    }
  }
}
function strataRemoveLayers() {
  if (!map) return;
  STRATA_LAYERS.forEach(id => { try { if (map.getLayer(id)) map.removeLayer(id); } catch (e) {} });
  ['strata-kubur', 'strata-bld'].forEach(id => { try { if (map.getSource(id)) map.removeSource(id); } catch (e) {} });
}
function strataTilt() {
  const flat = map.getPitch() < 20;
  map.easeTo({ pitch: flat ? 58 : 0, bearing: flat ? -20 : 0, duration: 900 });
}

function strataPopup(bid, lngLat) {
  const f = strataBuilding(bid);
  if (!f) return;
  const p = f.properties, sc = STRATA.s.schemes[bid];
  const row = (k, v) => v ? `<div class="popup-row"><span class="popup-k">${k}</span><span class="popup-v">${v}</span></div>` : '';
  const st = sc ? STRATA_STAGES[strataStage(sc)] : null;
  const html = `
    <div class="popup-header" style="background:${st ? st.color : '#546E7A'}">
      <div class="popup-fc">${sc ? 'Strata scheme · ' + strataEsc(st.label) : 'Building · no strata scheme yet'}</div>
      <div class="popup-name">${strataEsc(sc ? sc.nama : p.plus_code)}</div>
    </div>
    <div class="popup-body">
      ${row('Plus Code', strataEsc(p.plus_code))}
      ${row('Area', strataEsc((MPK_AREAS[p.kawasan] || {}).short || 'Outside the study areas'))}
      ${row('Lot no.', strataEsc(p.lot || 'no cadastral lot'))}
      ${row('Footprint', mpkNum(p.area_m2) + ' m²')}
      ${sc ? row('Scheme', strataEsc(sc.no)) + row('Parcels', mpkNum(sc.parcels.length) + ' · ' + mpkNum(strataShareUnits(sc.parcels, STRATA.s.faktor).total) + ' share units')
        + row('Floors', strataEsc(sc.bim.tingkat || '—') + ' · LOD ' + sc.bim.lod) : ''}
      <div class="mpk-dpb-pop"><button type="button" class="mpk-btn mpk-dpb-pop-btn" onclick='strataOpen(${JSON.stringify(String(bid))})'>${sc ? 'Open strata scheme' : 'Start strata scheme'}</button></div>
    </div>`;
  if (MPK.popup) MPK.popup.remove();
  MPK.popup = new maplibregl.Popup({ maxWidth: '290px', focusAfterOpen: false }).setLngLat(lngLat).setHTML(html).addTo(map);
}

// ---------- Panel ----------
function strataBuildPanel() {
  if (!document.getElementById('ptab-strata')) {
    const t = document.createElement('div');
    t.className = 'ptab';
    t.id = 'ptab-strata';
    t.textContent = 'Strata';
    t.onclick = () => switchTab(t, 'strata');
    document.getElementById('ptab-mpk').after(t);
    const body = document.createElement('div');
    body.id = 'tab-strata';
    body.style.display = 'none';
    document.getElementById('tab-mpk').after(body);
  }
}
function strataTotals() {
  const s = STRATA.s, sc = Object.values(s.schemes);
  let parcels = 0, su = 0, tax = 0;
  const all = {};
  for (const x of sc) {
    parcels += x.parcels.length;
    su += strataShareUnits(x.parcels, s.faktor).total;
    tax += x.parcels.reduce((a, p) => a + strataTax(p, s), 0);
    for (const [y, bs] of Object.entries(x.bills || {})) for (const [k, b] of Object.entries(bs)) (all[y] = all[y] || {})[x.bid + '|' + k] = b;
  }
  return { n: sc.length, parcels, su, tax, titles: sc.filter(x => x.app.stage === 'hakmilik').length, c: strataCollection(all, STRATA.year) };
}
function strataRenderPanel() {
  const el = document.getElementById('tab-strata');
  if (!el || !STRATA.s) return;
  const s = STRATA.s, t = strataTotals();
  const steps = [['Map', 'click a building'], ['Parcels & 3D', 'petak, floors, LOD'], ['Share units', 'unit syer'], ['Strata title', 'CPSP → PTG → titles'], ['Tax & charges', 'cukai, maintenance']];
  const schemes = Object.values(s.schemes).sort((a, b) => b.updated.localeCompare(a.updated));
  const kpi = (v, l) => `<div class="strata-kpi"><b>${v}</b><span>${l}</span></div>`;
  el.innerHTML = `
    <div class="mpk-card strata-intro">
      <div class="mpk-card-title">From the map to the strata register</div>
      <ol class="strata-flow">${steps.map(([a, b], i) => `<li><i>${i + 1}</i><span><b>${a}</b><small>${b}</small></span></li>`).join('')}</ol>
      <div class="strata-hint">Click any building on the map, then <i>Start strata scheme</i>.</div>
    </div>
    <div class="strata-kpis">${kpi(mpkNum(t.n), 'schemes')}${kpi(mpkNum(t.parcels), 'parcels')}${kpi(mpkNum(t.su), 'share units')}
      ${kpi(mpkNum(t.titles), 'with strata titles')}${kpi(strataRM(t.tax), 'assessment tax / year')}${kpi((t.c.rate * 100).toFixed(1) + '%', `of ${STRATA.year} bills collected`)}</div>
    <div class="mpk-card">
      <div class="mpk-card-title">On the map</div>
      <div class="strata-legend">${STRATA_STAGES.map(st => `<span><i style="background:${st.color}"></i>${st.label}</span>`).join('')}<span><i style="background:#90A4AE"></i>No scheme</span></div>
      <button type="button" class="mpk-btn ghost strata-wide" onclick="strataTilt()">Tilt the map for 3D (schemes rise to their height)</button>
    </div>
    <div class="mpk-card">
      <div class="mpk-card-title">Strata schemes</div>
      ${schemes.length ? `<div class="mpk-dpb-list">${schemes.map(x => { const st = STRATA_STAGES[strataStage(x)];
        return `<button type="button" class="mpk-dpb-row" onclick='strataGo(${JSON.stringify(String(x.bid))})'>
          <div class="mpk-dpb-row-t"><b>${strataEsc(x.no)}</b><span class="strata-badge" style="--c:${st.color}">${st.label}</span></div>
          <div class="mpk-dpb-row-l">${strataEsc(x.nama)}</div>
          <div class="mpk-dpb-row-m">${[x.bld.plus_code, mpkNum(x.parcels.length) + ' parcels', mpkNum(strataShareUnits(x.parcels, s.faktor).total) + ' share units', 'LOD ' + x.bim.lod].map(strataEsc).join(' · ')}</div>
        </button>`; }).join('')}</div>` : '<div class="mpk-reg-empty">No strata schemes yet.</div>'}
    </div>
    <div class="mpk-card">
      <div class="mpk-row"><div class="mpk-card-title">Cemeteries</div><button type="button" class="mpk-btn" onclick="strataPickSite()">+ Add a site</button></div>
      ${s.kubur.length ? `<div class="mpk-dpb-list">${s.kubur.map(k => { const kap = strataNum(k.kapasiti) || Math.floor(strataNum(k.luas) / 2.5), used = strataNum(k.terisi);
        const pct = kap ? Math.min(100, used / kap * 100) : 0;
        return `<button type="button" class="mpk-dpb-row" onclick='strataKuburGo(${JSON.stringify(k.id)})'>
          <div class="mpk-dpb-row-t"><b>${strataEsc(k.nama)}</b><span class="mpk-h-pill">${strataEsc(k.jenis)}</span></div>
          <div class="mpk-dpb-row-m">${[k.id, k.status, kap ? `${mpkNum(used)} of ${mpkNum(kap)} lots in use` : ''].filter(Boolean).map(strataEsc).join(' · ')}</div>
          ${kap ? `<div class="mpk-h-cap${pct >= 90 ? ' full' : ''}"><i style="width:${pct.toFixed(1)}%"></i></div>` : ''}</button>`; }).join('')}</div>`
        : '<div class="mpk-reg-empty">No cemetery sites yet: add one, then click the map where it is.</div>'}
    </div>
    <div class="mpk-dpb-actions left">
      <button type="button" class="mpk-btn ghost" onclick="strataExport('parcels')">Export parcels CSV</button>
      <button type="button" class="mpk-btn ghost" onclick="strataExport('kubur')">Export cemeteries CSV</button>
      <button type="button" class="mpk-btn ghost" onclick="strataExport('json')">Export all JSON</button>
      <label class="mpk-btn ghost mpk-dpb-import">Import JSON<input type="file" accept=".json,application/json" onchange="strataImport(this)"></label>
    </div>
    <div class="mpk-note">A concept: saved in this browser only (Export / Import moves it). Share-unit weightages, assessment rates, rents
      and the maintenance rate are assumptions to set to the State's and MPK's own.</div>`;
}

// ---------- Workspace: steps 1 – 5 ----------
function strataOpen(bid) {
  const f = strataBuilding(bid);
  const s = STRATA.s;
  if (!s.schemes[bid]) {
    if (!f) { showToast('⚠️ Building not found'); return; }
    const p = f.properties, now = new Date().toISOString();
    s.schemes[bid] = { bid: String(bid), no: strataNextNo(Object.values(s.schemes).map(x => x.no), 'STR', new Date().getFullYear()),
      nama: 'Skim strata ' + p.plus_code, pemaju: '', hakmilik_induk: '', alamat: '', created: now, updated: now,
      bld: { plus_code: p.plus_code, kawasan: p.kawasan || '', lot: p.lot || '', upi: p.upi || '', area_m2: p.area_m2, lng: p.lng, lat: p.lat },
      bim: { tingkat: '', tinggi: '', lod: 100, disahkan: false }, parcels: [], common: '',
      app: { stage: 'draf', docs: {} }, urus: { jenis: 'Pemaju', nama: '', tarikh: '' }, caj: { kadar: '0.30' }, bills: {} };
    strataSave();
    showToast('🏢 ' + s.schemes[bid].no + ' started');
    addActivityLog('Strata scheme started', s.schemes[bid].no + ' · ' + p.plus_code);
    strataChanged();
  }
  STRATA.cur = String(bid);
  STRATA.step = Math.max(2, Math.min(5, STRATA.step || 2));
  if (MPK.popup) { MPK.popup.remove(); MPK.popup = null; }
  let ws = document.getElementById('strata-ws');
  if (!ws) {
    ws = document.createElement('section');
    ws.id = 'strata-ws';
    ws.className = 'mpk-stats-page strata-ws';
    ws.setAttribute('aria-label', 'Strata scheme');
    document.getElementById('mapWrapper').appendChild(ws);
  }
  ws.hidden = false;
  strataRenderWs();
}
function strataGo(bid) {
  const sc = STRATA.s.schemes[bid];
  if (sc && map && sc.bld.lng != null) map.jumpTo({ center: [sc.bld.lng, sc.bld.lat], zoom: 18 });
  strataOpen(bid);
}
function strataCloseWs() {
  const ws = document.getElementById('strata-ws');
  if (ws) ws.hidden = true;
  STRATA.cur = null;
}
function strataBackToMap() {
  const sc = STRATA.s.schemes[STRATA.cur];
  strataCloseWs();
  if (sc && sc.bld.lng != null) map.flyTo({ center: [sc.bld.lng, sc.bld.lat], zoom: 18.3, pitch: 58, bearing: -20, duration: 1200 });
}
function strataStep(n) { STRATA.step = n; strataRenderWs(); document.getElementById('strata-ws').scrollTop = 0; }
const strataSc = () => STRATA.s.schemes[STRATA.cur];
// Saves the scheme, redraws map and panel, and the step after the current input has handed focus on
function strataChanged(rerender) {
  const sc = strataSc();
  if (sc) sc.updated = new Date().toISOString();
  strataSave();
  strataLayers();
  strataRenderPanel();
  if (rerender) setTimeout(() => {
    const key = document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.key : null;
    strataRenderWs();
    const el = key && document.querySelector(`#strata-ws [data-key="${CSS.escape(key)}"]`);
    if (el) el.focus();
  }, 0);
}
// generic setters used by the inputs (path like 'bim.tingkat' or 'nama')
function strataF(path, v) {
  const sc = strataSc(), [a, b] = path.split('.');
  if (b) sc[a][b] = v; else sc[a] = v;
  if (path === 'bim.tingkat' || path === 'bim.tinggi' || path === 'bim.disahkan') {
    const sug = strataLodSuggest(strataBuilding(sc.bid) ? strataBuilding(sc.bid).properties : {}, sc.bim);
    if (!sc.bim.lodPicked || sc.bim.lod < sug) sc.bim.lod = sug;
  }
  strataChanged(true);
}
function strataP(i, k, v) { strataSc().parcels[i][k] = v; strataChanged(true); }
function strataG(path, v) {          // global settings: kadar.Kediaman, sewa.Industri, faktor.aksesori
  const [a, b] = path.split('.');
  STRATA.s[a][b] = strataNum(v);
  strataChanged(true);
}

function strataRenderWs() {
  const ws = document.getElementById('strata-ws'), sc = strataSc();
  if (!ws || !sc) return;
  const st = STRATA_STAGES[strataStage(sc)];
  const names = ['Map & building', 'Parcels & 3D', 'Share units', 'Strata title', 'Tax & charges'];
  const done = [true, sc.parcels.length > 0, sc.parcels.length > 0, sc.app.stage === 'hakmilik', Object.keys(sc.bills || {}).length > 0];
  const body = [strataStep1, strataStep2, strataStep3, strataStep4, strataStep5][STRATA.step - 1](sc);
  ws.innerHTML = `<div class="mpk-stats-inner strata-inner">
    <div class="strata-ws-head">
      <button type="button" class="mpk-btn ghost" onclick="strataBackToMap()">← Map</button>
      <div class="strata-ws-t"><h2>${strataEsc(sc.no)} · ${strataEsc(sc.nama)}</h2>
        <p>${[sc.bld.plus_code, (MPK_AREAS[sc.bld.kawasan] || {}).short || 'Outside the study areas', sc.bld.lot ? 'Lot ' + sc.bld.lot : '', mpkNum(sc.bld.area_m2) + ' m² footprint'].filter(Boolean).map(strataEsc).join(' · ')}</p></div>
      <span class="strata-badge big" style="--c:${st.color}">${st.label}</span>
    </div>
    <nav class="strata-steps" aria-label="Steps">${names.map((n, i) => `<button type="button" class="${STRATA.step === i + 1 ? 'on' : ''}${done[i] ? ' done' : ''}"
      ${STRATA.step === i + 1 ? 'aria-current="step"' : ''} onclick="strataStep(${i + 1})"><i>${done[i] && STRATA.step !== i + 1 ? '✓' : i + 1}</i>${n}</button>`).join('')}</nav>
    <div class="strata-body">${body}</div>
    <div class="strata-ws-foot">
      ${STRATA.step > 1 ? `<button type="button" class="mpk-dpb-b ghost" onclick="strataStep(${STRATA.step - 1})">← ${names[STRATA.step - 2]}</button>` : ''}
      <span class="mpk-dpb-spacer"></span><span class="strata-saved">Saved automatically</span>
      ${STRATA.step < 5 ? `<button type="button" class="mpk-dpb-b primary" onclick="strataStep(${STRATA.step + 1})">${names[STRATA.step]} →</button>` : ''}
    </div>
  </div>`;
}

const sIn = (key, val, attrs = '') => `<input data-key="${key}" value="${strataEsc(val)}" ${attrs} onchange="strataF('${key}', this.value)">`;

function strataStep1(sc) {
  const f = strataBuilding(sc.bid), p = f ? f.properties : {};
  const row = (k, v) => `<tr><th>${k}</th><td>${v}</td></tr>`;
  return `<div class="strata-grid2">
    <section class="mpk-h-card"><h4>Scheme</h4>
      <div class="mpk-h-form flat">
        <label class="wide">Scheme name${sIn('nama', sc.nama)}</label>
        <label class="wide">Developer / proprietor (pemaju / tuan punya)${sIn('pemaju', sc.pemaju, 'placeholder="e.g. Syarikat Pemaju Sdn Bhd"')}</label>
        <label>Master title (hakmilik induk)${sIn('hakmilik_induk', sc.hakmilik_induk, 'placeholder="e.g. GRN 12345"')}</label>
        <label>Address${sIn('alamat', sc.alamat, 'placeholder="No., jalan, Chukai"')}</label>
      </div>
      <div class="strata-row-btns">
        <button type="button" class="mpk-btn ghost" onclick="strataBackToMap()">Show the building on the map</button>
        <button type="button" class="mpk-dpb-b danger-ghost" onclick="strataDelete()">Delete scheme</button>
      </div>
    </section>
    <section class="mpk-h-card"><h4>The building on the map</h4>
      <table class="strata-facts">${row('Plus Code', strataEsc(sc.bld.plus_code))}${row('Area', strataEsc((MPK_AREAS[sc.bld.kawasan] || {}).short || 'Outside the study areas'))}
        ${row('Cadastral lot', strataEsc(sc.bld.lot || 'none') + (sc.bld.upi ? ' · UPI ' + strataEsc(sc.bld.upi) : ''))}${row('Footprint', mpkNum(sc.bld.area_m2) + ' m²')}
        ${p.kawasan ? row('Map status (MPK)', MPK_STATUS[mpkStatus(p, MPK.settings)].label) : ''}
        ${p.pelan_fail ? row('Approved building plan', strataEsc(p.pelan_fail) + (p.pelan_tarikh ? ' · ' + mpkPlanDateLabel(p.pelan_tarikh) : '')) : ''}
        ${row('Started', mpkPlanDateLabel(sc.created.slice(0, 10)))}</table>
      ${p.kawasan && mpkStatus(p, MPK.settings) === 'suspected' ? `<div class="strata-warn">This building is on MPK's illegal list: strata titles need the building approved first (Certificate of Completion and Compliance).</div>` : ''}
    </section></div>`;
}

function strataStep2(sc) {
  const f = strataBuilding(sc.bid), p = f ? f.properties : {};
  const sug = strataLodSuggest(p, sc.bim);
  const floors = Math.max(1, Math.floor(strataNum(sc.bim.tingkat) || Math.max(1, ...sc.parcels.map(x => strataNum(x.tingkat)))));
  const common = strataCommon(sc);
  const opt = sel => STRATA_USES.map(u => `<option${u === sel ? ' selected' : ''}>${u}</option>`).join('');
  const pIn = (i, k, v, cls = '') => `<input data-key="p${i}.${k}" class="${cls}" value="${strataEsc(v)}" onchange="strataP(${i}, '${k}', this.value)">`;
  // the floor stack, top floor first: parcels as cells sized by area, the rest of the floor as common property
  const stack = [];
  for (let fl = floors; fl >= 1; fl--) {
    const on = sc.parcels.map((x, i) => ({ x, i })).filter(({ x }) => Math.floor(strataNum(x.tingkat)) === fl);
    const used = on.reduce((a, { x }) => a + strataNum(x.luas), 0), rest = Math.max(0, strataNum(sc.bld.area_m2) - used);
    stack.push(`<div class="strata-floor"><span class="strata-fl">Floor ${fl}</span><div class="strata-cells">
      ${on.map(({ x }) => `<span class="strata-cell" style="flex:${Math.max(strataNum(x.luas), 1)};background:${STRATA_USE_COLOR[x.kegunaan] || '#90A4AE'}" title="${strataEsc(x.petak)} · ${strataEsc(x.luas)} m² · ${strataEsc(x.kegunaan)}">${strataEsc(x.petak)}</span>`).join('')}
      ${rest > 0.5 ? `<span class="strata-cell common" style="flex:${rest}" title="Common property ${mpkNum(rest)} m²"></span>` : ''}</div></div>`);
  }
  const acc = sc.parcels.filter(x => x.aks_no);
  return `<section class="mpk-h-card"><h4>Building model <small>· BIM level of development</small></h4>
      <div class="mpk-h-row">
        <label>Floors<input type="number" min="1" step="1" data-key="bim.tingkat" value="${strataEsc(sc.bim.tingkat)}" onchange="strataF('bim.tingkat', this.value)"></label>
        <label>Height (m)<input type="number" min="0" step="0.1" data-key="bim.tinggi" value="${strataEsc(sc.bim.tinggi)}" placeholder="4 m a floor" onchange="strataF('bim.tinggi', this.value)"></label>
        <label class="mpk-h-check"><input type="checkbox" data-key="bim.disahkan" ${sc.bim.disahkan ? 'checked' : ''} onchange="strataF('bim.disahkan', this.checked)">Verified on site (as-built)</label>
        <button type="button" class="mpk-btn ghost" onclick="strataBackToMap()">See it in 3D on the map</button>
      </div>
      <div class="mpk-h-lods">${STRATA_LOD.map(l => `<button type="button" class="mpk-h-lod${sc.bim.lod === l.v ? ' on' : ''}" style="--c:${l.color}" aria-pressed="${sc.bim.lod === l.v}" onclick="strataLod(${l.v})">
        <b>LOD ${l.v}</b><span>${l.name}</span><small>${l.text}</small></button>`).join('')}</div>
      <div class="mpk-h-hint">Suggested from the record: <b>LOD ${sug}</b>. Height on the map: <b>${Math.round(strataHeight(sc.bim) * 10) / 10} m</b>.</div>
    </section>
    <div class="strata-grid2 wide-left">
      <section class="mpk-h-card"><h4>Parcels <small>(petak) and accessory parcels</small></h4>
        <div class="mpk-h-row gen">
          <span>Create:</span>
          <label>Floors<input type="number" min="1" id="strata-gf" value="${strataEsc(sc.bim.tingkat || 1)}"></label>
          <label>Parcels / floor<input type="number" min="1" id="strata-gu" value="${sc.parcels.length ? Math.max(1, Math.round(sc.parcels.length / floors)) : 2}"></label>
          <label>Use<select id="strata-gk">${opt(sc.bld.kawasan === 'tk' ? 'Industri' : 'Komersial')}</select></label>
          <button type="button" class="mpk-btn" onclick="strataGen()">Create</button>
          <button type="button" class="mpk-btn ghost" onclick="strataAdd()">+ One parcel</button>
        </div>
        <div class="mpk-h-tablewrap"><table class="mpk-h-t">
          <thead><tr><th>Petak</th><th>Floor</th><th>Area m²</th><th>Use</th><th>Owner</th><th>Accessory (parking)</th><th>Acc. m²</th><th></th></tr></thead>
          <tbody>${sc.parcels.length ? sc.parcels.map((x, i) => `<tr>
            <td>${pIn(i, 'petak', x.petak)}</td><td class="n">${pIn(i, 'tingkat', x.tingkat)}</td><td class="n">${pIn(i, 'luas', x.luas)}</td>
            <td><select data-key="p${i}.kegunaan" onchange="strataP(${i}, 'kegunaan', this.value)">${opt(x.kegunaan)}</select></td>
            <td>${pIn(i, 'pemilik', x.pemilik)}</td><td>${pIn(i, 'aks_no', x.aks_no)}</td><td class="n">${pIn(i, 'aks_luas', x.aks_luas)}</td>
            <td><button type="button" class="mpk-h-del" onclick="strataDel(${i})" aria-label="Remove parcel">×</button></td></tr>`).join('')
            : '<tr><td colspan="8" class="mpk-h-empty">No parcels yet: create them above.</td></tr>'}</tbody>
        </table></div>
        <div class="mpk-h-row" style="margin-top:10px">
          <label>Common property m² (harta bersama)<input type="number" min="0" data-key="common" value="${strataEsc(sc.common)}" placeholder="${mpkNum(common)}" onchange="strataF('common', this.value)"></label>
          <span class="mpk-h-hint" style="margin:0">Empty: the floor area (footprint × floors) less the parcels. New parcels take ${Math.round(STRATA_NET * 100)}% of each floor.</span>
        </div>
      </section>
      <section class="mpk-h-card"><h4>Floor stack</h4>
        <div class="strata-stack">${stack.join('')}<div class="strata-ground"></div></div>
        <div class="strata-legend small">${STRATA_USES.map(u => `<span><i style="background:${STRATA_USE_COLOR[u]}"></i>${u}</span>`).join('')}<span><i class="common"></i>Common property</span></div>
        ${acc.length ? `<div class="mpk-h-hint">Accessory parcels: ${acc.map(x => strataEsc(x.aks_no) + ' → ' + strataEsc(x.petak)).join(', ')}</div>` : ''}
      </section>
    </div>`;
}
function strataLod(v) { const sc = strataSc(); sc.bim.lod = v; sc.bim.lodPicked = true; strataChanged(true); }
function strataGen() {
  const sc = strataSc();
  const ps = strataGenParcels(document.getElementById('strata-gf').value, document.getElementById('strata-gu').value, sc.bld.area_m2, document.getElementById('strata-gk').value);
  if (sc.parcels.length && !confirm(`Replace the ${sc.parcels.length} parcels with ${ps.length} new ones?`)) return;
  sc.parcels = ps.map((x, i) => ({ ...x, id: Date.now().toString(36) + i }));
  if (!strataNum(sc.bim.tingkat)) sc.bim.tingkat = document.getElementById('strata-gf').value;
  strataF('bim.tingkat', sc.bim.tingkat);
}
function strataAdd() {
  const sc = strataSc();
  sc.parcels.push({ id: Date.now().toString(36), petak: 'M1-' + String(sc.parcels.length + 1).padStart(2, '0'), tingkat: '1', luas: '',
    kegunaan: document.getElementById('strata-gk').value, pemilik: '', nilai: '', aks_no: '', aks_luas: '' });
  strataChanged(true);
}
function strataDel(i) { strataSc().parcels.splice(i, 1); strataChanged(true); }

function strataStep3(sc) {
  const s = STRATA.s, r = strataShareUnits(sc.parcels, s.faktor);
  const fIn = k => `<input type="number" min="0" step="0.05" data-key="f.${k}" value="${s.faktor[k]}" onchange="strataG('faktor.${k}', this.value)">`;
  return `<div class="strata-grid2 wide-right">
    <section class="mpk-h-card"><h4>Weightage <span class="mpk-tag">assumption</span></h4>
      <table class="mpk-h-t rates"><tbody>${STRATA_USES.map(u => `<tr><td>${u}</td><td>${fIn(u)}</td></tr>`).join('')}
        <tr><td>Accessory parcel</td><td>${fIn('aksesori')}</td></tr></tbody></table>
      <div class="mpk-h-hint">Share unit of a parcel = floor area × weightage of its use + accessory area × accessory weightage, rounded.
        Set the weightages to those of the State's strata rules; they apply to every scheme.</div>
    </section>
    <section class="mpk-h-card"><h4>Schedule of parcels <small>· share units (unit syer)</small></h4>
      ${sc.parcels.length ? `<div class="mpk-h-tablewrap"><table class="mpk-h-t">
        <thead><tr><th>Petak</th><th>Floor</th><th>Use</th><th class="r">Area m²</th><th class="r">Acc. m²</th><th class="r">Share units</th><th class="r">Share %</th><th>Share</th></tr></thead>
        <tbody>${sc.parcels.map((x, i) => `<tr><td><b>${strataEsc(x.petak)}</b></td><td>${strataEsc(x.tingkat)}</td><td>${strataEsc(x.kegunaan)}</td>
          <td class="r">${strataEsc(x.luas)}</td><td class="r">${strataEsc(x.aks_luas) || '—'}</td><td class="r"><b>${mpkNum(r.su[i])}</b></td>
          <td class="r">${r.pct[i].toFixed(2)}</td><td><div class="strata-sharebar"><i style="width:${r.pct[i] * (100 / Math.max(...r.pct, 1))}%;background:${STRATA_USE_COLOR[x.kegunaan]}"></i></div></td></tr>`).join('')}</tbody>
        <tfoot><tr><td colspan="5">Total</td><td>${mpkNum(r.total)}</td><td>100.00</td><td></td></tr></tfoot></table></div>
        <div class="mpk-h-hint">Common property (${mpkNum(strataCommon(sc))} m²) carries no share units: it belongs to every parcel owner in proportion to their share units.</div>`
        : '<div class="mpk-reg-empty">Create the parcels in step 2 first.</div>'}
    </section></div>`;
}

function strataStep4(sc) {
  const idx = strataStage(sc);
  const dates = { cpsp: 'd_cpsp', borang1: 'd_borang1', hakmilik: 'd_hakmilik' };
  const docs = sc.app.docs || {};
  return `<div class="strata-grid2 wide-left">
    <section class="mpk-h-card"><h4>Application for strata titles</h4>
      <ol class="strata-timeline">${STRATA_STAGES.map((st, i) => `<li class="${i < idx ? 'done' : i === idx ? 'now' : ''}" style="--c:${st.color}">
        <i>${i < idx ? '✓' : i + 1}</i><div><b>${st.label}</b><span>${st.ms}</span>
        ${dates[st.k] ? `<label>Date<input type="date" data-key="app.${dates[st.k]}" value="${strataEsc(sc.app[dates[st.k]])}" onchange="strataF('app.${dates[st.k]}', this.value)"></label>` : ''}
        ${st.k === 'borang1' ? `<label>PTG file no.<input data-key="app.fail_ptg" value="${strataEsc(sc.app.fail_ptg)}" onchange="strataF('app.fail_ptg', this.value)"></label>` : ''}
        ${st.k === 'hakmilik' ? `<label>Strata titles issued<input type="number" min="0" data-key="app.n_hakmilik" value="${strataEsc(sc.app.n_hakmilik)}" placeholder="${sc.parcels.length}" onchange="strataF('app.n_hakmilik', this.value)"></label>` : ''}
        </div></li>`).join('')}</ol>
      <div class="strata-row-btns">
        ${idx > 0 ? `<button type="button" class="mpk-dpb-b ghost" onclick="strataAdvance(-1)">← Back to ${STRATA_STAGES[idx - 1].label}</button>` : ''}
        ${idx < STRATA_STAGES.length - 1 ? `<button type="button" class="mpk-dpb-b primary" onclick="strataAdvance(1)">Mark: ${STRATA_STAGES[idx + 1].label}</button>`
          : '<span class="strata-ok">✓ Strata titles registered</span>'}
      </div>
      <div class="mpk-h-hint">Concept of the Strata Titles Act 1985 (Act 318): the proposed strata plan is certified by JUPEM (CPSP), the
        proprietor applies to the Land Office with Form 1, and the Land Administrator registers a strata title for each parcel.</div>
    </section>
    <div>
      <section class="mpk-h-card"><h4>Documents</h4>
        ${STRATA_DOCS.map(([k, l]) => `<label class="strata-doc"><input type="checkbox" ${docs[k] ? 'checked' : ''} onchange="strataDoc('${k}', this.checked)">${l}</label>`).join('')}
        <div class="mpk-h-hint">${STRATA_DOCS.filter(([k]) => docs[k]).length} of ${STRATA_DOCS.length} ready</div>
      </section>
      <section class="mpk-h-card"><h4>Managing body <small>(Act 757)</small></h4>
        <div class="mpk-h-form flat">
          <label>Body<select data-key="urus.jenis" onchange="strataF('urus.jenis', this.value)">${[['Pemaju', 'Developer (pemaju)'], ['JMB', 'Joint Management Body (JMB)'], ['MC', 'Management Corporation (MC)']]
            .map(([v, l]) => `<option value="${v}"${sc.urus.jenis === v ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
          <label>Formed on<input type="date" data-key="urus.tarikh" value="${strataEsc(sc.urus.tarikh)}" onchange="strataF('urus.tarikh', this.value)"></label>
          <label class="wide">Name${sIn('urus.nama', sc.urus.nama, 'placeholder="e.g. Perbadanan Pengurusan ..."')}</label>
        </div>
        <div class="mpk-h-hint">Developer's management period → JMB → MC once the strata titles are issued and the first AGM is held.</div>
      </section>
    </div></div>`;
}
function strataAdvance(d) {
  const sc = strataSc(), i = Math.max(0, Math.min(STRATA_STAGES.length - 1, strataStage(sc) + d));
  sc.app.stage = STRATA_STAGES[i].k;
  const key = { cpsp: 'd_cpsp', borang1: 'd_borang1', hakmilik: 'd_hakmilik' }[sc.app.stage];
  if (d > 0 && key && !sc.app[key]) sc.app[key] = new Date().toISOString().slice(0, 10);
  if (sc.app.stage === 'hakmilik' && sc.urus.jenis === 'Pemaju') sc.urus.jenis = 'JMB';
  showToast(`${sc.no}: ${STRATA_STAGES[i].label}`);
  strataChanged(true);
}
function strataDoc(k, on) { const sc = strataSc(); sc.app.docs = sc.app.docs || {}; sc.app.docs[k] = on; strataChanged(false); }

function strataStep5(sc) {
  const s = STRATA.s, y = STRATA.year, r = strataShareUnits(sc.parcels, s.faktor);
  const bills = sc.bills[y] || {};
  const c = strataCollection(sc.bills, y);
  let tTax = 0, tCaj = 0, tSink = 0;
  const rows = sc.parcels.map((x, i) => {
    const tax = strataTax(x, s), ch = strataCharges(r.su[i], sc.caj.kadar), b = bills[x.id];
    tTax += tax; tCaj += ch.caj; tSink += ch.sinking;
    const est = strataAnnualValue(x.luas, s.sewa[x.kegunaan]);
    return `<tr><td><b>${strataEsc(x.petak)}</b></td><td>${strataEsc(x.pemilik) || '—'}</td><td class="r">${mpkNum(r.su[i])}</td>
      <td class="n"><input data-key="p${i}.nilai" value="${strataEsc(x.nilai)}" placeholder="${est ? est.toLocaleString('en-MY') : ''}" onchange="strataP(${i}, 'nilai', this.value)"></td>
      <td class="r">${strataRM(tax).slice(3)}</td><td class="r">${strataRM(ch.caj).slice(3)}</td><td class="r">${strataRM(ch.sinking).slice(3)}</td>
      ${b ? ['p1', 'p2'].map(h => `<td><button type="button" class="mpk-h-pay${b[h] ? ' paid' : ''}" onclick='strataPay(${JSON.stringify(x.id)}, "${h}")'>${b[h] ? '✓ ' + mpkPlanDateLabel(b[h]) : 'Unpaid'}</button></td>`).join('') : '<td colspan="2" class="mpk-h-empty">no bill</td>'}</tr>`;
  }).join('');
  const kIn = (path, v) => `<input type="number" min="0" step="0.5" data-key="${path}" value="${v}" onchange="strataG('${path}', this.value)">`;
  return `<section class="mpk-h-card"><h4>Per parcel: assessment tax, maintenance and sinking fund</h4>
      <div class="mpk-h-row">
        <label>Maintenance charge (RM per share unit / month)<input type="number" min="0" step="0.01" data-key="caj.kadar" value="${strataEsc(sc.caj.kadar)}" onchange="strataF('caj.kadar', this.value)"></label>
        <label>Year<select onchange="STRATA.year = +this.value; strataRenderWs()">${[...new Set([...Object.keys(sc.bills).map(Number), new Date().getFullYear()])].sort((a, b) => b - a)
          .map(v => `<option${v === y ? ' selected' : ''}>${v}</option>`).join('')}</select></label>
        <button type="button" class="mpk-btn" onclick="strataBills()">Generate ${y} assessment bills</button>
      </div>
      ${sc.parcels.length ? `<div class="mpk-h-tablewrap"><table class="mpk-h-t bills">
        <thead><tr><th>Petak</th><th>Owner</th><th class="r">Share units</th><th>Annual value RM</th><th class="r">Tax / year</th><th class="r">Maint. / month</th><th class="r">Sinking / month</th><th>Penggal 1</th><th>Penggal 2</th></tr></thead>
        <tbody>${rows}</tbody>
        <tfoot><tr><td colspan="4">Total</td><td>${strataRM(tTax).slice(3)}</td><td>${strataRM(tCaj).slice(3)}</td><td>${strataRM(tSink).slice(3)}</td><td colspan="2"></td></tr></tfoot></table></div>`
        : '<div class="mpk-reg-empty">Create the parcels in step 2 first.</div>'}
      <div class="mpk-h-kpis" style="margin-top:12px">
        <div class="mpk-h-kpi"><b>${strataRM(c.billed)}</b><span>${y} assessment billed</span></div>
        <div class="mpk-h-kpi ok"><b>${strataRM(c.collected)}</b><span>collected · ${(c.rate * 100).toFixed(1)}%</span></div>
        <div class="mpk-h-kpi bad"><b>${strataRM(c.outstanding)}</b><span>outstanding</span></div>
        <div class="mpk-h-kpi"><b>${strataRM(tCaj * 12)}</b><span>maintenance / year (+ ${strataRM(tSink * 12)} sinking fund)</span></div>
      </div>
      <div class="mpk-h-hint">Assessment tax (to MPK) = annual value × the rate of the use; an empty annual value is estimated from area × rent × 12.
        Paid in two halves (penggal 1 by end February, penggal 2 by end August). Maintenance charge and sinking fund (10% of the charge, Act 757)
        go to the managing body, by share units.</div>
    </section>
    <details class="mpk-h-card strata-rates"><summary>Assessment rates and rents <span class="mpk-tag">assumption</span> · all schemes</summary>
      <table class="mpk-h-t rates"><thead><tr><th>Use</th><th>Rate (% of annual value)</th><th>Rent for the estimate (RM / m² / month)</th></tr></thead>
        <tbody>${STRATA_USES.map(u => `<tr><td>${u}</td><td>${kIn('kadar.' + u, s.kadar[u])}</td><td>${kIn('sewa.' + u, s.sewa[u])}</td></tr>`).join('')}</tbody></table>
    </details>`;
}
function strataBills() {
  const sc = strataSc(), s = STRATA.s, y = STRATA.year;
  if (!sc.parcels.length) { showToast('⚠️ No parcels yet'); return; }
  const b = sc.bills[y] = sc.bills[y] || {};
  let made = 0;
  for (const x of sc.parcels) {
    x.id = x.id || Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const amount = strataTax(x, s);
    if (!b[x.id]) { b[x.id] = { amount, p1: null, p2: null }; made++; }
    else if (!b[x.id].p1 && !b[x.id].p2) b[x.id].amount = amount;
  }
  showToast(`🧾 ${y}: ${made} new bill${made === 1 ? '' : 's'}`);
  strataChanged(true);
}
function strataPay(pid, half) {
  const b = (strataSc().bills[STRATA.year] || {})[pid];
  if (!b) return;
  b[half] = b[half] ? null : new Date().toISOString().slice(0, 10);
  strataChanged(true);
}
function strataDelete() {
  const sc = strataSc();
  if (!confirm(`Delete strata scheme ${sc.no} with its ${sc.parcels.length} parcels and bills?`)) return;
  delete STRATA.s.schemes[sc.bid];
  strataCloseWs();
  strataChanged(false);
  showToast('🗑️ ' + sc.no + ' deleted');
}

// ---------- Cemeteries ----------
function strataPickSite() {
  strataCloseWs();
  STRATA.picking = true;
  map.getCanvas().style.cursor = 'crosshair';
  showToast('📍 Click the map where the cemetery is', 4000);
  map.once('click', e => {
    setTimeout(() => { STRATA.picking = false; }, 0);
    map.getCanvas().style.cursor = 'grab';
    strataKuburOpen(null, [Math.round(e.lngLat.lng * 1e6) / 1e6, Math.round(e.lngLat.lat * 1e6) / 1e6]);
  });
}
function strataKuburOpen(id, at) {
  const k = id ? STRATA.s.kubur.find(x => x.id === id)
    : { id: null, nama: '', jenis: 'Islam', status: 'Sedia ada', luas: '', kapasiti: '', terisi: '', pengurus: '', catatan: '', lng: at[0], lat: at[1] };
  if (!k) return;
  if (MPK.popup) { MPK.popup.remove(); MPK.popup = null; }
  let el = document.getElementById('strata-kubur');
  if (!el) {
    el = document.createElement('div');
    el.id = 'strata-kubur';
    el.className = 'mpk-dpb-overlay';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-labelledby', 'strata-kubur-t');
    el.addEventListener('keydown', e => { if (e.key === 'Escape') el.hidden = true; });
    document.body.appendChild(el);
  }
  STRATA.kubur = k;
  const v = key => strataEsc(k[key]);
  el.innerHTML = `<div class="mpk-dpb-shell small">
    <div class="mpk-dpb-bar"><div class="mpk-dpb-bar-t"><div id="strata-kubur-t">${k.id ? 'Cemetery site · ' + strataEsc(k.id) : 'New cemetery site'}</div>
      <small>${k.lat.toFixed(6)}, ${k.lng.toFixed(6)}</small></div>
      <button type="button" class="mpk-dpb-x" onclick="document.getElementById('strata-kubur').hidden = true" aria-label="Close">×</button></div>
    <div class="mpk-dpb-scroll"><form class="mpk-h-form" onsubmit="return false" oninput="strataKuburCalc()">
      <label class="wide">Site name<input id="kb-nama" value="${v('nama')}" placeholder="e.g. Tanah Perkuburan Islam Kg. Teluk Kalong"></label>
      <label>Type<select id="kb-jenis">${STRATA_KUBUR_TYPES.map(t => `<option${t === k.jenis ? ' selected' : ''}>${t}</option>`).join('')}</select></label>
      <label>Status<select id="kb-status">${['Sedia ada', 'Cadangan', 'Penuh / ditutup'].map(t => `<option${t === k.status ? ' selected' : ''}>${t}</option>`).join('')}</select></label>
      <label>Area (m²)<input id="kb-luas" inputmode="decimal" value="${v('luas')}"></label>
      <label>Grave lots (capacity)<input id="kb-kapasiti" inputmode="numeric" value="${v('kapasiti')}" placeholder="≈ area ÷ 2.5 m²"></label>
      <label>Lots in use<input id="kb-terisi" inputmode="numeric" value="${v('terisi')}"></label>
      <label>Managed by<input id="kb-pengurus" value="${v('pengurus')}" placeholder="e.g. Majlis Agama Islam, waris, syarikat"></label>
      <label class="wide">Note<textarea id="kb-catatan" rows="2">${v('catatan')}</textarea></label>
    </form><div class="mpk-h-hint" id="kb-calc"></div></div>
    <div class="mpk-dpb-foot">
      ${k.id ? `<button type="button" class="mpk-dpb-b danger-ghost" onclick="strataKuburDelete()">Delete</button>` : ''}
      <span class="mpk-dpb-spacer"></span>
      <button type="button" class="mpk-dpb-b ghost" onclick="document.getElementById('strata-kubur').hidden = true">Cancel</button>
      <button type="button" class="mpk-dpb-b primary" onclick="strataKuburSave()">Save site</button>
    </div></div>`;
  el.hidden = false;
  strataKuburCalc();
  document.getElementById('kb-nama').focus();
}
function strataKuburCalc() {
  const g = id => strataNum(document.getElementById(id).value);
  const kap = g('kb-kapasiti') || Math.floor(g('kb-luas') / 2.5), used = g('kb-terisi');
  document.getElementById('kb-calc').innerHTML = (kap ? `Capacity <b>${mpkNum(kap)}</b> lots${g('kb-kapasiti') ? '' : ' (estimated, 2.5 m² a grave)'}`
    + (used ? ` · <b>${mpkNum(Math.max(kap - used, 0))}</b> free (${Math.min(100, Math.round(used / kap * 100))}% in use)` : '') + '.<br>' : '')
    + 'Planning permission fee (Tr. P.U. 9/2026, Third Schedule Part B 2.B.viii): <b>RM 500.00</b> per application'
    + (document.getElementById('kb-jenis').value === 'Swasta' ? '; a private cemetery layout (Part B 1.C.xv) adds <b>RM 100.00</b> per plot.' : '.');
}
function strataKuburSave() {
  const k = STRATA.kubur, g = id => document.getElementById(id).value.trim();
  Object.assign(k, { nama: g('kb-nama'), jenis: g('kb-jenis'), status: g('kb-status'), luas: g('kb-luas'), kapasiti: g('kb-kapasiti'),
    terisi: g('kb-terisi'), pengurus: g('kb-pengurus'), catatan: g('kb-catatan'), updated: new Date().toISOString() });
  if (!k.nama) { showToast('⚠️ Give the site a name'); return; }
  if (!k.id) { k.id = strataNextNo(STRATA.s.kubur.map(x => x.id), 'KBR', new Date().getFullYear()); k.created = k.updated; STRATA.s.kubur.push(k); }
  document.getElementById('strata-kubur').hidden = true;
  showToast('🪦 ' + k.id + ' saved');
  strataChanged(false);
}
function strataKuburDelete() {
  const k = STRATA.kubur;
  if (!confirm(`Delete cemetery site ${k.id}?`)) return;
  STRATA.s.kubur = STRATA.s.kubur.filter(x => x !== k);
  document.getElementById('strata-kubur').hidden = true;
  strataChanged(false);
}
function strataKuburGo(id) {
  const k = STRATA.s.kubur.find(x => x.id === id);
  if (!k) return;
  strataCloseWs();
  map.flyTo({ center: [k.lng, k.lat], zoom: 17 });
  strataKuburOpen(id);
}

// ---------- Export / import ----------
function strataExport(kind) {
  const s = STRATA.s, day = new Date().toISOString().slice(0, 10);
  const q = v => { const t = String(v == null ? '' : v); return /[",\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t; };
  const csv = rows => new Blob(['﻿' + rows.map(r => r.map(q).join(',')).join('\n') + '\n'], { type: 'text/csv;charset=utf-8' });
  let blob, name;
  if (kind === 'json') { blob = new Blob([JSON.stringify(s, null, 1)], { type: 'application/json' }); name = `mpk_strata_${day}.json`; }
  else if (kind === 'parcels') {
    const rows = [['scheme', 'scheme_name', 'stage', 'plus_code', 'lot', 'petak', 'floor', 'area_m2', 'use', 'owner', 'accessory', 'accessory_m2', 'share_units', 'tax_per_year_rm']];
    for (const sc of Object.values(s.schemes)) {
      const r = strataShareUnits(sc.parcels, s.faktor);
      sc.parcels.forEach((x, i) => rows.push([sc.no, sc.nama, STRATA_STAGES[strataStage(sc)].label, sc.bld.plus_code, sc.bld.lot, x.petak, x.tingkat, x.luas, x.kegunaan,
        x.pemilik, x.aks_no, x.aks_luas, r.su[i], strataTax(x, s).toFixed(2)]));
    }
    blob = csv(rows); name = `mpk_strata_parcels_${day}.csv`;
  } else {
    blob = csv([['id', 'name', 'type', 'status', 'lat', 'lng', 'area_m2', 'capacity', 'in_use', 'managed_by', 'note'],
      ...s.kubur.map(k => [k.id, k.nama, k.jenis, k.status, k.lat, k.lng, k.luas, k.kapasiti, k.terisi, k.pengurus, k.catatan])]);
    name = `mpk_cemeteries_${day}.csv`;
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
function strataImport(input) {
  const file = input.files && input.files[0];
  input.value = '';
  if (!file) return;
  file.text().then(t => {
    const v = JSON.parse(t);
    if (!v || typeof v.schemes !== 'object' || !Array.isArray(v.kubur)) throw new Error('not a strata file');
    if (!confirm('Replace the strata schemes and cemeteries in this browser with the file?')) return;
    STRATA.s = Object.assign(strataBlank(), v);
    strataCloseWs();
    strataChanged(false);
    showToast('📥 Strata data imported');
  }).catch(e => showToast('⚠️ Could not import: ' + e.message, 5000));
}

if (typeof module !== 'undefined') {
  module.exports = { strataGenParcels, strataCommon, strataShareUnits, strataAnnualValue, strataTax, strataCharges, strataLodSuggest,
    strataHeight, strataCollection, strataNextNo, STRATA_DEFAULTS, STRATA_NET };
}
