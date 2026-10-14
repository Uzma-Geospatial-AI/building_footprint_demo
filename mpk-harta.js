// ============================================================
// MPK KEMAMAN — PROPERTY & TAX (Registrations page, second tab)
//   Strata units  register the units (petak) of a building: floor, area, use, owner, annual value
//   Assessment tax  cukai taksiran per unit = annual value × the rate for its use (Local Government
//                 Act 1976 s.127); yearly bills in two halves, paid / outstanding, arrears
//   BIM LOD       a level of development (LOD 100 – 500) per building, with floors and height;
//                 the modelled buildings rise in 3D on the map, coloured by level
//   Cemeteries    cemetery sites placed on the map: type, area, grave capacity and lots in use
// Rates and rents are assumptions to set to MPK's own. Kept in this browser (localStorage), like
// the building plan registrations; Export / Import moves them.
// ============================================================

// ---------- Pure logic (exported for tools/test_mpk_harta.js) ----------
const MPK_HARTA_USES = ['Kediaman', 'Komersial', 'Industri', 'Lain-lain'];
// Assumptions: assessment rate (% of annual value) and market rent (RM / m² / month) per use
const MPK_HARTA_DEFAULT_RATES = {
  kadar: { Kediaman: 6, Komersial: 9, Industri: 9, 'Lain-lain': 6 },
  sewa: { Kediaman: 4, Komersial: 12, Industri: 6, 'Lain-lain': 4 },
};
// LOD 100 – 500 (BIM Forum level of development), as used for a building's model
const MPK_LOD = [
  { v: 100, label: 'LOD 100', name: 'Conceptual', text: 'Footprint only: a 2D outline, no height.', color: '#B0BEC5' },
  { v: 200, label: 'LOD 200', name: 'Approximate geometry', text: 'Massing from the footprint with the number of floors / height.', color: '#64B5F6' },
  { v: 300, label: 'LOD 300', name: 'Precise geometry', text: 'Geometry from the approved building plan: floors, areas and openings as drawn.', color: '#1E88E5' },
  { v: 400, label: 'LOD 400', name: 'Fabrication', text: 'Detailed model with structure and services, ready for construction.', color: '#3949AB' },
  { v: 500, label: 'LOD 500', name: 'As-built', text: 'Verified on site: the model matches the building as built.', color: '#1A237E' },
];
const MPK_KUBUR_TYPES = ['Islam', 'Bukan Islam', 'Swasta', 'Krematorium'];

const mpkHartaNum = v => { const n = parseFloat(String(v == null ? '' : v).replace(/,/g, '')); return isFinite(n) && n > 0 ? n : 0; };
// Annual value from area and monthly rent (RM / m² / month × 12)
const mpkHartaAnnualValue = (luas, sewa) => Math.round(mpkHartaNum(luas) * mpkHartaNum(sewa) * 12);
// Yearly assessment tax of one unit: its annual value (or the estimate) × the rate of its use
function mpkHartaTax(u, rates) {
  const nilai = mpkHartaNum(u.nilai) || mpkHartaAnnualValue(u.luas, rates.sewa[u.kegunaan] || 0);
  return Math.round(nilai * (rates.kadar[u.kegunaan] || 0)) / 100;
}
// Units for a building: floors × units per floor, the floor area shared equally (petak M<floor>-<nn>)
function mpkHartaGenUnits(floors, perFloor, floorArea, kegunaan) {
  const F = Math.max(1, Math.floor(mpkHartaNum(floors) || 1)), U = Math.max(1, Math.floor(mpkHartaNum(perFloor) || 1));
  const luas = Math.round(mpkHartaNum(floorArea) / U * 100) / 100;
  const out = [];
  for (let f = 1; f <= F; f++) {
    for (let u = 1; u <= U; u++) out.push({ petak: `M${f}-${String(u).padStart(2, '0')}`, tingkat: String(f), luas: String(luas), kegunaan, pemilik: '', nilai: '' });
  }
  return out;
}
// Suggested LOD of a building from what is on record
function mpkHartaLodSuggest(p, rec) {
  const floors = rec && mpkHartaNum(rec.tingkat);
  if (rec && rec.disahkan) return 500;
  if (floors && p && (p.pelan_fail || p.daftar_status === 'lulus')) return 300;
  if (floors || (rec && mpkHartaNum(rec.tinggi))) return 200;
  return 100;
}
// Height in metres for the 3D view: as entered, else 4 m a floor
const mpkHartaHeight = rec => mpkHartaNum(rec.tinggi) || (mpkHartaNum(rec.tingkat) || 1) * 4;
// Billed, collected and outstanding of one year, and the arrears of the years before it.
// bills: { year: { unitKey: { amount, p1, p2 } } } (p1 / p2: payment date of each half, or null)
function mpkHartaCollection(bills, year) {
  const sum = (y, f) => Object.values(bills[y] || {}).reduce((s, b) => s + f(b), 0);
  const paid = b => (b.p1 ? b.amount / 2 : 0) + (b.p2 ? b.amount / 2 : 0);
  const billed = sum(year, b => b.amount), collected = sum(year, paid);
  const arrears = Object.keys(bills).filter(y => +y < +year).reduce((s, y) => s + sum(y, b => b.amount - paid(b)), 0);
  const n = Object.keys(bills[year] || {}).length;
  const unpaid = Object.values(bills[year] || {}).filter(b => !(b.p1 && b.p2)).length;
  return { billed, collected, outstanding: billed - collected, arrears, rate: billed ? collected / billed : 0, n, unpaid };
}

// ---------- Storage ----------
const MPK_HARTA = { KEY: 'mpk_harta_v1', s: null, year: new Date().getFullYear(), bimOn: false, billFilter: 'unpaid', open: null, picking: false };
function mpkHartaBlankStore() {
  return { strata: {}, lod: {}, bills: {}, kubur: [], rates: JSON.parse(JSON.stringify(MPK_HARTA_DEFAULT_RATES)) };
}
function mpkHartaLoad() {
  let s = null;
  try { s = JSON.parse(localStorage.getItem(MPK_HARTA.KEY) || 'null'); } catch (e) {}
  MPK_HARTA.s = Object.assign(mpkHartaBlankStore(), s || {});
}
function mpkHartaSave() {
  try { localStorage.setItem(MPK_HARTA.KEY, JSON.stringify(MPK_HARTA.s)); return true; }
  catch (e) { showToast('⚠️ Could not save in this browser: ' + e.message, 5000); return false; }
}
const mpkHartaBld = bid => MPK.data && MPK.data.buildings.features.find(f => String(f.properties.id) === String(bid));
const mpkHartaRM = v => 'RM ' + (v || 0).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const mpkHartaEsc = v => mpkEscHtml(v == null ? '' : v);

function mpkHartaInit() {
  mpkHartaLoad();
}

// ---------- Building popup ----------
function mpkHartaPopupHTML(p) {
  const s = MPK_HARTA.s;
  if (!s) return '';
  const st = s.strata[p.id], lod = s.lod[p.id];
  const facts = [st && st.units.length ? `${st.units.length} strata unit${st.units.length === 1 ? '' : 's'}` : '',
    lod ? 'LOD ' + lod.level : ''].filter(Boolean).join(' · ');
  return `<div class="mpk-dpb-pop">${facts ? `<span class="mpk-dpb-pop-no">${facts}</span>` : ''}
    <button type="button" class="mpk-btn ghost${facts ? '' : ' mpk-dpb-pop-btn'}" onclick='mpkHartaOpen(${JSON.stringify(String(p.id))})'>Strata · tax · BIM</button></div>`;
}

// ---------- Building modal: BIM LOD + strata units ----------
function mpkHartaOpen(bid) {
  const f = mpkHartaBld(bid);
  if (!f) { showToast('⚠️ Building not found'); return; }
  const p = f.properties, s = MPK_HARTA.s;
  const st = s.strata[bid] || { units: [] };
  const lod = s.lod[bid] || { level: null, tingkat: '', tinggi: '', disahkan: false, nota: '' };
  MPK_HARTA.open = { bid: String(bid), units: JSON.parse(JSON.stringify(st.units)), lod: { ...lod } };
  if (MPK.popup) { MPK.popup.remove(); MPK.popup = null; }
  let el = document.getElementById('mpk-harta');
  if (!el) {
    el = document.createElement('div');
    el.id = 'mpk-harta';
    el.className = 'mpk-dpb-overlay';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-labelledby', 'mpk-harta-title');
    el.addEventListener('keydown', e => { if (e.key === 'Escape') mpkHartaClose(); });
    document.body.appendChild(el);
  }
  const facts = [p.plus_code, (MPK_AREAS[p.kawasan] || {}).short, p.lot ? 'Lot ' + p.lot : 'no cadastral lot',
    mpkNum(p.area_m2) + ' m² footprint', MPK_STATUS[mpkStatus(p, MPK.settings)].label].map(mpkHartaEsc).join(' · ');
  el.innerHTML = `<div class="mpk-dpb-shell">
    <div class="mpk-dpb-bar">
      <div class="mpk-dpb-bar-t"><div id="mpk-harta-title">Strata, assessment tax and BIM</div><small>${facts}</small></div>
      <button type="button" class="mpk-dpb-x" onclick="mpkHartaClose()" aria-label="Close">×</button>
    </div>
    <div class="mpk-dpb-scroll">
      <section class="mpk-h-card">
        <h4>BIM level of development</h4>
        <div class="mpk-h-row">
          <label>Floors<input type="number" min="1" step="1" id="mpk-h-tingkat" value="${mpkHartaEsc(lod.tingkat)}" oninput="mpkHartaLodInput()"></label>
          <label>Height (m)<input type="number" min="0" step="0.1" id="mpk-h-tinggi" value="${mpkHartaEsc(lod.tinggi)}" placeholder="4 m a floor" oninput="mpkHartaLodInput()"></label>
          <label class="mpk-h-check"><input type="checkbox" id="mpk-h-sah" ${lod.disahkan ? 'checked' : ''} onchange="mpkHartaLodInput()">Verified on site (as-built)</label>
        </div>
        <div class="mpk-h-lods" role="radiogroup" aria-label="Level of development">
          ${MPK_LOD.map(l => `<button type="button" role="radio" class="mpk-h-lod" data-v="${l.v}" onclick="mpkHartaLodPick(${l.v})" style="--c:${l.color}">
            <b>${l.label}</b><span>${l.name}</span><small>${l.text}</small></button>`).join('')}
        </div>
        <div class="mpk-h-hint" id="mpk-h-lodhint"></div>
      </section>
      <section class="mpk-h-card">
        <h4>Strata units <small>(petak) · assessment tax per unit</small></h4>
        <div class="mpk-h-row gen">
          <span>Create units:</span>
          <label>Floors<input type="number" min="1" step="1" id="mpk-h-gf" value="${mpkHartaEsc(lod.tingkat || 1)}"></label>
          <label>Units / floor<input type="number" min="1" step="1" id="mpk-h-gu" value="1"></label>
          <label>Use<select id="mpk-h-gk">${MPK_HARTA_USES.map(u => `<option${u === 'Industri' && p.kawasan === 'tk' ? ' selected' : ''}>${u}</option>`).join('')}</select></label>
          <button type="button" class="mpk-btn" onclick="mpkHartaGen()">Create</button>
          <button type="button" class="mpk-btn ghost" onclick="mpkHartaAddUnit()">+ One unit</button>
        </div>
        <div class="mpk-h-tablewrap"><table class="mpk-h-t">
          <thead><tr><th>Petak</th><th>Floor</th><th>Area m²</th><th>Use</th><th>Owner</th><th>Annual value RM</th><th>Tax / year</th><th></th></tr></thead>
          <tbody id="mpk-h-units"></tbody>
          <tfoot><tr><td colspan="2">Total</td><td id="mpk-h-tl"></td><td colspan="3"></td><td id="mpk-h-tt"></td><td></td></tr></tfoot>
        </table></div>
        <div class="mpk-h-hint">An empty annual value is estimated from the area × the rent of its use × 12 (rates and rents under Assessment tax on the Registrations page).
          Tax = annual value × the rate of its use. Area of each unit starts as the footprint shared across the units of a floor.</div>
      </section>
    </div>
    <div class="mpk-dpb-foot">
      <div class="mpk-dpb-total">Assessment tax / year <b id="mpk-h-total">RM 0.00</b></div>
      <button type="button" class="mpk-dpb-b ghost" onclick="mpkHartaClose()">Cancel</button>
      <button type="button" class="mpk-dpb-b primary" onclick="mpkHartaSaveBuilding()">Save</button>
    </div>
  </div>`;
  el.hidden = false;
  mpkHartaRenderUnits();
  mpkHartaLodInput(true);
  document.getElementById('mpk-h-tingkat').focus();
}
function mpkHartaClose() {
  const el = document.getElementById('mpk-harta');
  if (el) { el.hidden = true; el.innerHTML = ''; }
  MPK_HARTA.open = null;
}
function mpkHartaLodInput(first) {
  const o = MPK_HARTA.open;
  o.lod.tingkat = document.getElementById('mpk-h-tingkat').value;
  o.lod.tinggi = document.getElementById('mpk-h-tinggi').value;
  o.lod.disahkan = document.getElementById('mpk-h-sah').checked;
  const sug = mpkHartaLodSuggest(mpkHartaBld(o.bid).properties, o.lod);
  // a saved or clicked level stays; otherwise the level follows the suggestion
  if (first) o.lod.picked = !!o.lod.level;
  if (!o.lod.picked) o.lod.level = sug;
  mpkHartaLodShow(sug);
}
function mpkHartaLodPick(v) {
  const o = MPK_HARTA.open;
  o.lod.level = v; o.lod.picked = true;
  mpkHartaLodShow(mpkHartaLodSuggest(mpkHartaBld(o.bid).properties, o.lod));
}
function mpkHartaLodShow(sug) {
  const o = MPK_HARTA.open;
  document.querySelectorAll('.mpk-h-lod').forEach(b => {
    const on = +b.dataset.v === o.lod.level;
    b.classList.toggle('on', on); b.setAttribute('aria-checked', String(on));
  });
  const h = mpkHartaHeight(o.lod);
  document.getElementById('mpk-h-lodhint').innerHTML = `Suggested from the record: <b>LOD ${sug}</b>`
    + (sug < 300 ? ' (LOD 300 needs the floors and an approved building plan; LOD 500 a site check).' : '.')
    + ` 3D height on the map: <b>${Math.round(h * 10) / 10} m</b>.`;
}
function mpkHartaRenderUnits() {
  const o = MPK_HARTA.open, r = MPK_HARTA.s.rates;
  const opt = sel => MPK_HARTA_USES.map(u => `<option${u === sel ? ' selected' : ''}>${u}</option>`).join('');
  const cell = (i, k, v, type = 'text') => `<input type="${type}" data-i="${i}" data-k="${k}" value="${mpkHartaEsc(v)}" oninput="mpkHartaUnitInput(this)">`;
  document.getElementById('mpk-h-units').innerHTML = o.units.length ? o.units.map((u, i) => {
    const est = mpkHartaAnnualValue(u.luas, r.sewa[u.kegunaan]);
    return `<tr>
      <td>${cell(i, 'petak', u.petak)}</td><td class="n">${cell(i, 'tingkat', u.tingkat)}</td><td class="n">${cell(i, 'luas', u.luas)}</td>
      <td><select data-i="${i}" data-k="kegunaan" onchange="mpkHartaUnitInput(this)">${opt(u.kegunaan)}</select></td>
      <td>${cell(i, 'pemilik', u.pemilik)}</td>
      <td class="n"><input type="text" data-i="${i}" data-k="nilai" value="${mpkHartaEsc(u.nilai)}" placeholder="${est ? est.toLocaleString('en-MY') : ''}" oninput="mpkHartaUnitInput(this)"></td>
      <td class="r" id="mpk-h-tax-${i}"></td>
      <td><button type="button" class="mpk-h-del" onclick="mpkHartaDelUnit(${i})" aria-label="Remove unit">×</button></td></tr>`;
  }).join('') : '<tr><td colspan="8" class="mpk-h-empty">No units yet: create them above, one per petak.</td></tr>';
  mpkHartaUnitTotals();
}
function mpkHartaUnitInput(el) {
  const o = MPK_HARTA.open, u = o.units[+el.dataset.i];
  u[el.dataset.k] = el.value;
  if (el.dataset.k === 'kegunaan' || el.dataset.k === 'luas') {
    const est = mpkHartaAnnualValue(u.luas, MPK_HARTA.s.rates.sewa[u.kegunaan]);
    const nv = document.querySelector(`#mpk-h-units input[data-i="${el.dataset.i}"][data-k="nilai"]`);
    if (nv) nv.placeholder = est ? est.toLocaleString('en-MY') : '';
  }
  mpkHartaUnitTotals();
}
function mpkHartaUnitTotals() {
  const o = MPK_HARTA.open, r = MPK_HARTA.s.rates;
  let tax = 0, luas = 0;
  o.units.forEach((u, i) => {
    const t = mpkHartaTax(u, r);
    tax += t; luas += mpkHartaNum(u.luas);
    const c = document.getElementById('mpk-h-tax-' + i);
    if (c) c.textContent = t ? mpkHartaRM(t).slice(3) : '';
  });
  document.getElementById('mpk-h-tl').textContent = luas ? mpkNum(luas) : '';
  document.getElementById('mpk-h-tt').textContent = tax ? mpkHartaRM(tax).slice(3) : '';
  document.getElementById('mpk-h-total').textContent = mpkHartaRM(tax);
}
function mpkHartaGen() {
  const o = MPK_HARTA.open, p = mpkHartaBld(o.bid).properties;
  const units = mpkHartaGenUnits(document.getElementById('mpk-h-gf').value, document.getElementById('mpk-h-gu').value,
    p.area_m2, document.getElementById('mpk-h-gk').value);
  if (o.units.length && !confirm(`Replace the ${o.units.length} unit${o.units.length === 1 ? '' : 's'} in the table with ${units.length} new ones?`)) return;
  o.units = units;
  mpkHartaRenderUnits();
}
function mpkHartaAddUnit() {
  const o = MPK_HARTA.open;
  o.units.push({ petak: 'M1-' + String(o.units.length + 1).padStart(2, '0'), tingkat: '1', luas: '', kegunaan: document.getElementById('mpk-h-gk').value, pemilik: '', nilai: '' });
  mpkHartaRenderUnits();
}
function mpkHartaDelUnit(i) {
  MPK_HARTA.open.units.splice(i, 1);
  mpkHartaRenderUnits();
}
function mpkHartaSaveBuilding() {
  const o = MPK_HARTA.open, s = MPK_HARTA.s, f = mpkHartaBld(o.bid);
  const p = f.properties;
  const units = o.units.filter(u => u.petak || mpkHartaNum(u.luas));
  const petak = units.map(u => u.petak.trim());
  if (petak.some(x => !x) || new Set(petak).size !== petak.length) { showToast('⚠️ Every unit needs its own petak number'); return; }
  units.forEach((u, i) => { u.id = u.id || (o.bid + '-' + Date.now().toString(36) + i); });
  if (units.length) s.strata[o.bid] = { units, plus_code: p.plus_code, kawasan: p.kawasan, lot: p.lot || '', lng: p.lng, lat: p.lat, updated: new Date().toISOString() };
  else delete s.strata[o.bid];
  const { picked, ...lod } = o.lod;
  s.lod[o.bid] = { ...lod, plus_code: p.plus_code, kawasan: p.kawasan, area_m2: p.area_m2, updated: new Date().toISOString() };
  if (!mpkHartaSave()) return;
  showToast(`💾 ${p.plus_code} · LOD ${lod.level}${units.length ? ' · ' + units.length + ' unit' + (units.length === 1 ? '' : 's') : ''}`);
  addActivityLog('Strata / BIM saved', p.plus_code);
  mpkHartaClose();
  mpkHartaRefresh();
}

// ---------- Map: BIM 3D and cemetery sites ----------
function mpkHartaBimData() {
  const s = MPK_HARTA.s;
  return { type: 'FeatureCollection', features: Object.entries(s.lod).map(([bid, rec]) => {
    const f = mpkHartaBld(bid);
    return f && { type: 'Feature', geometry: f.geometry, properties: { lod: rec.level, h: mpkHartaHeight(rec) } };
  }).filter(Boolean) };
}
function mpkHartaKuburData() {
  return { type: 'FeatureCollection', features: MPK_HARTA.s.kubur.map(k => ({ type: 'Feature',
    geometry: { type: 'Point', coordinates: [k.lng, k.lat] }, properties: { id: k.id, nama: k.nama || k.id, jenis: k.jenis } })) };
}
// Called from mpkAddLayers (mpk.js), also after every change here
function mpkHartaLayers() {
  if (!map || !MPK_HARTA.s || !map.getSource('mpk-buildings')) return;
  try {
    if (!map.getSource('mpk-bim')) {
      map.addSource('mpk-bim', { type: 'geojson', data: mpkHartaBimData() });
      map.addLayer({ id: 'mpk-bim-3d', type: 'fill-extrusion', source: 'mpk-bim', layout: { visibility: 'none' },
        paint: { 'fill-extrusion-color': ['match', ['get', 'lod'], ...MPK_LOD.flatMap(l => [l.v, l.color]), '#B0BEC5'],
                 'fill-extrusion-height': ['get', 'h'], 'fill-extrusion-base': 0, 'fill-extrusion-opacity': 0.88 } });
    } else map.getSource('mpk-bim').setData(mpkHartaBimData());
    if (!map.getSource('mpk-kubur')) {
      map.addSource('mpk-kubur', { type: 'geojson', data: mpkHartaKuburData() });
      map.addLayer({ id: 'mpk-kubur-pt', type: 'circle', source: 'mpk-kubur',
        paint: { 'circle-color': '#6D4C41', 'circle-radius': ['interpolate', ['linear'], ['zoom'], 11, 5, 18, 11],
                 'circle-stroke-color': '#fff', 'circle-stroke-width': 2 } });
      map.addLayer({ id: 'mpk-kubur-label', type: 'symbol', source: 'mpk-kubur', minzoom: 13,
        layout: { 'text-field': ['get', 'nama'], 'text-font': ['Noto Sans Regular'], 'text-size': 11.5, 'text-offset': [0, 1.3], 'text-anchor': 'top' },
        paint: { 'text-color': '#4E342E', 'text-halo-color': '#fff', 'text-halo-width': 1.5 } });
      if (!MPK_HARTA.bound) {
        MPK_HARTA.bound = true;
        map.on('click', 'mpk-kubur-pt', e => {
          if (!MPK.active || MPK_HARTA.picking || !e.features.length) return;
          setTimeout(() => mpkHartaKuburOpen(e.features[0].properties.id), 0);    // after any building popup
        });
        map.on('mouseenter', 'mpk-kubur-pt', () => { if (MPK.active) map.getCanvas().style.cursor = 'pointer'; });
        map.on('mouseleave', 'mpk-kubur-pt', () => { if (MPK.active) map.getCanvas().style.cursor = 'grab'; });
      }
    } else map.getSource('mpk-kubur').setData(mpkHartaKuburData());
    map.setLayoutProperty('mpk-bim-3d', 'visibility', MPK_HARTA.bimOn ? 'visible' : 'none');
  } catch (e) { /* style not ready: mpkAddLayers calls again */ }
}
function mpkHartaRemoveLayers() {
  if (!map) return;
  ['mpk-kubur-label', 'mpk-kubur-pt', 'mpk-bim-3d'].forEach(id => { try { if (map.getLayer(id)) map.removeLayer(id); } catch (e) {} });
  ['mpk-kubur', 'mpk-bim'].forEach(id => { try { if (map.getSource(id)) map.removeSource(id); } catch (e) {} });
}
function mpkHartaToggleBim() {
  MPK_HARTA.bimOn = !MPK_HARTA.bimOn;
  mpkHartaLayers();
  if (MPK_HARTA.bimOn) {
    if (!Object.keys(MPK_HARTA.s.lod).length) showToast('No building has a LOD yet: click a building, then Strata · tax · BIM');
    mpkShowPage('dashboard');
    if (map.getPitch() < 30) map.easeTo({ pitch: 55, duration: 900 });
  }
  mpkHartaRender();
}

// ---------- Cemeteries ----------
function mpkHartaPickSite() {
  mpkShowPage('dashboard');
  MPK_HARTA.picking = true;
  const prevCapture = typeof MPK_FEAT !== 'undefined' ? MPK_FEAT.capture : null;
  if (prevCapture !== null) MPK_FEAT.capture = true;            // building popups stay closed
  map.getCanvas().style.cursor = 'crosshair';
  showToast('📍 Click the map where the cemetery is', 4000);
  map.once('click', e => {
    MPK_HARTA.picking = false;
    if (prevCapture !== null) MPK_FEAT.capture = prevCapture;
    map.getCanvas().style.cursor = 'grab';
    mpkHartaKuburOpen(null, [Math.round(e.lngLat.lng * 1e6) / 1e6, Math.round(e.lngLat.lat * 1e6) / 1e6]);
  });
}
function mpkHartaNextKubur() {
  const y = new Date().getFullYear();
  const seq = MPK_HARTA.s.kubur.map(k => /^KBR\/(\d{4})\/(\d+)$/.exec(k.id)).filter(m => m && +m[1] === y).map(m => +m[2]);
  return 'KBR/' + y + '/' + String((seq.length ? Math.max(...seq) : 0) + 1).padStart(4, '0');
}
function mpkHartaKuburOpen(id, at) {
  const k = id ? MPK_HARTA.s.kubur.find(x => x.id === id) : { id: null, nama: '', jenis: 'Islam', status: 'Sedia ada', luas: '', kapasiti: '', terisi: '', pengurus: '', catatan: '', lng: at[0], lat: at[1] };
  if (!k) return;
  if (MPK.popup) { MPK.popup.remove(); MPK.popup = null; }
  let el = document.getElementById('mpk-kubur-modal');
  if (!el) {
    el = document.createElement('div');
    el.id = 'mpk-kubur-modal';
    el.className = 'mpk-dpb-overlay';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-labelledby', 'mpk-kubur-title');
    el.addEventListener('keydown', e => { if (e.key === 'Escape') el.hidden = true; });
    document.body.appendChild(el);
  }
  MPK_HARTA.kubur = k;
  const v = key => mpkHartaEsc(k[key]);
  el.innerHTML = `<div class="mpk-dpb-shell small">
    <div class="mpk-dpb-bar">
      <div class="mpk-dpb-bar-t"><div id="mpk-kubur-title">${k.id ? 'Cemetery site · ' + mpkHartaEsc(k.id) : 'New cemetery site'}</div>
        <small>${k.lat.toFixed(6)}, ${k.lng.toFixed(6)}</small></div>
      <button type="button" class="mpk-dpb-x" onclick="document.getElementById('mpk-kubur-modal').hidden = true" aria-label="Close">×</button>
    </div>
    <div class="mpk-dpb-scroll"><form class="mpk-h-form" onsubmit="return false" oninput="mpkHartaKuburCalc()">
      <label class="wide">Site name<input id="kb-nama" value="${v('nama')}" placeholder="e.g. Tanah Perkuburan Islam Kg. Teluk Kalong"></label>
      <label>Type<select id="kb-jenis">${MPK_KUBUR_TYPES.map(t => `<option${t === k.jenis ? ' selected' : ''}>${t}</option>`).join('')}</select></label>
      <label>Status<select id="kb-status">${['Sedia ada', 'Cadangan', 'Penuh / ditutup'].map(t => `<option${t === k.status ? ' selected' : ''}>${t}</option>`).join('')}</select></label>
      <label>Area (m²)<input id="kb-luas" inputmode="decimal" value="${v('luas')}"></label>
      <label>Grave lots (capacity)<input id="kb-kapasiti" inputmode="numeric" value="${v('kapasiti')}" placeholder="≈ area ÷ 2.5 m²"></label>
      <label>Lots in use<input id="kb-terisi" inputmode="numeric" value="${v('terisi')}"></label>
      <label>Managed by<input id="kb-pengurus" value="${v('pengurus')}" placeholder="e.g. Majlis Agama Islam, waris, syarikat"></label>
      <label class="wide">Note<textarea id="kb-catatan" rows="2">${v('catatan')}</textarea></label>
    </form>
    <div class="mpk-h-hint" id="kb-calc"></div></div>
    <div class="mpk-dpb-foot">
      ${k.id ? `<button type="button" class="mpk-dpb-b danger-ghost" onclick="mpkHartaKuburDelete()">Delete</button>` : ''}
      <span class="mpk-dpb-spacer"></span>
      <button type="button" class="mpk-dpb-b ghost" onclick="document.getElementById('mpk-kubur-modal').hidden = true">Cancel</button>
      <button type="button" class="mpk-dpb-b primary" onclick="mpkHartaKuburSave()">Save site</button>
    </div>
  </div>`;
  el.hidden = false;
  mpkHartaKuburCalc();
  document.getElementById('kb-nama').focus();
}
function mpkHartaKuburCalc() {
  const luas = mpkHartaNum(document.getElementById('kb-luas').value);
  const kap = mpkHartaNum(document.getElementById('kb-kapasiti').value) || Math.floor(luas / 2.5);
  const used = mpkHartaNum(document.getElementById('kb-terisi').value);
  const jenis = document.getElementById('kb-jenis').value;
  document.getElementById('kb-calc').innerHTML = (kap ? `Capacity <b>${mpkNum(kap)}</b> lots${mpkHartaNum(document.getElementById('kb-kapasiti').value) ? '' : ' (estimated, 2.5 m² a grave)'}`
    + (used ? ` · <b>${mpkNum(Math.max(kap - used, 0))}</b> free (${Math.min(100, Math.round(used / kap * 100))}% in use)` : '') + '.<br>' : '')
    + `Planning permission fee (Tr. P.U. 9/2026, Third Schedule Part B 2.B.viii): <b>RM 500.00</b> per application for a cemetery / crematorium / memorial centre`
    + (jenis === 'Swasta' ? '; a private cemetery layout (Part B 1.C.xv) adds <b>RM 100.00</b> per plot.' : '.');
}
function mpkHartaKuburSave() {
  const k = MPK_HARTA.kubur, s = MPK_HARTA.s;
  const g = id => document.getElementById(id).value.trim();
  Object.assign(k, { nama: g('kb-nama'), jenis: g('kb-jenis'), status: g('kb-status'), luas: g('kb-luas'), kapasiti: g('kb-kapasiti'),
    terisi: g('kb-terisi'), pengurus: g('kb-pengurus'), catatan: g('kb-catatan'), updated: new Date().toISOString() });
  if (!k.nama) { showToast('⚠️ Give the site a name'); return; }
  if (!k.id) { k.id = mpkHartaNextKubur(); k.created = k.updated; s.kubur.push(k); }
  if (!mpkHartaSave()) return;
  document.getElementById('mpk-kubur-modal').hidden = true;
  showToast('🪦 ' + k.id + ' saved');
  mpkHartaRefresh();
}
function mpkHartaKuburDelete() {
  const k = MPK_HARTA.kubur;
  if (!confirm(`Delete cemetery site ${k.id}?`)) return;
  MPK_HARTA.s.kubur = MPK_HARTA.s.kubur.filter(x => x !== k);
  if (!mpkHartaSave()) return;
  document.getElementById('mpk-kubur-modal').hidden = true;
  mpkHartaRefresh();
}
function mpkHartaKuburGo(id) {
  const k = MPK_HARTA.s.kubur.find(x => x.id === id);
  if (!k) return;
  mpkShowPage('dashboard');
  map.flyTo({ center: [k.lng, k.lat], zoom: 17 });
  mpkHartaKuburOpen(id);
}

// ---------- Assessment tax: bills and payments ----------
function mpkHartaUnitsAll() {
  const out = [];
  for (const [bid, st] of Object.entries(MPK_HARTA.s.strata)) st.units.forEach(u => out.push({ bid, st, u, key: bid + '|' + u.id }));
  return out;
}
// Bills for a year: every registered unit gets this year's tax; payments already made are kept
function mpkHartaGenBills() {
  const s = MPK_HARTA.s, y = MPK_HARTA.year, units = mpkHartaUnitsAll();
  if (!units.length) { showToast('⚠️ No strata units registered yet'); return; }
  const bills = s.bills[y] = s.bills[y] || {};
  let made = 0;
  for (const { key, u } of units) {
    const amount = mpkHartaTax(u, s.rates);
    if (!bills[key]) { bills[key] = { amount, p1: null, p2: null }; made++; }
    else if (!bills[key].p1 && !bills[key].p2) bills[key].amount = amount;   // unpaid bills follow the latest rates
  }
  if (!mpkHartaSave()) return;
  showToast(`🧾 ${y}: ${made} new bill${made === 1 ? '' : 's'}, ${units.length} in all`);
  mpkHartaRender();
}
function mpkHartaPay(key, half) {
  const b = (MPK_HARTA.s.bills[MPK_HARTA.year] || {})[key];
  if (!b) return;
  b[half] = b[half] ? null : new Date().toISOString().slice(0, 10);
  if (mpkHartaSave()) mpkHartaRender();
}
function mpkHartaRate(kind, use, el) {
  MPK_HARTA.s.rates[kind][use] = mpkHartaNum(el.value);
  mpkHartaSave();
}

// ---------- The tab ----------
function mpkHartaTabHTML() {
  return `<div class="mpk-h-tab" id="mpk-h-tab"></div>`;
}
function mpkHartaRefresh() {
  mpkHartaLayers();
  mpkHartaRender();
}
function mpkHartaRender() {
  const el = document.getElementById('mpk-h-tab');
  if (!el || !MPK_HARTA.s) return;
  const s = MPK_HARTA.s, y = MPK_HARTA.year;
  const strata = Object.entries(s.strata);
  const nUnits = strata.reduce((n, [, st]) => n + st.units.length, 0);
  const luas = strata.reduce((n, [, st]) => n + st.units.reduce((a, u) => a + mpkHartaNum(u.luas), 0), 0);
  const yearTax = mpkHartaUnitsAll().reduce((a, { u }) => a + mpkHartaTax(u, s.rates), 0);
  const c = mpkHartaCollection(s.bills, y);
  const years = [...new Set([...Object.keys(s.bills).map(Number), new Date().getFullYear()])].sort((a, b) => b - a);
  const study = MPK.data ? MPK.data.buildings.features : [];
  const lodN = MPK_LOD.map(l => Object.entries(s.lod).filter(([bid, r]) => r.level === l.v && mpkHartaBld(bid)).length);
  const modelled = lodN.reduce((a, b) => a + b, 0);
  const billRows = mpkHartaUnitsAll().map(x => ({ ...x, b: (s.bills[y] || {})[x.key] })).filter(x => x.b)
    .filter(x => MPK_HARTA.billFilter !== 'unpaid' || !(x.b.p1 && x.b.p2)).slice(0, 300);
  const kpi = (v, l, cls = '') => `<div class="mpk-h-kpi ${cls}"><b>${v}</b><span>${l}</span></div>`;
  el.innerHTML = `
    <section class="mpk-h-sec">
      <div class="mpk-h-sec-head"><h3>Strata units</h3>
        <span class="mpk-h-sub">Click a building on the Dashboard map → <i>Strata · tax · BIM</i> to register its units.</span></div>
      <div class="mpk-h-kpis">${kpi(mpkNum(strata.length), 'buildings with units')}${kpi(mpkNum(nUnits), 'strata units (petak)')}
        ${kpi(mpkNum(luas) + ' m²', 'floor area')}${kpi(mpkHartaRM(yearTax), 'assessment tax / year')}</div>
      ${strata.length ? `<div class="mpk-h-list">${strata.sort((a, b) => b[1].updated.localeCompare(a[1].updated)).map(([bid, st]) => `
        <button type="button" class="mpk-dpb-row" onclick='mpkHartaGoBuilding(${JSON.stringify(bid)})'>
          <div class="mpk-dpb-row-t"><b>${mpkHartaEsc(st.plus_code)}</b><span class="mpk-h-pill">${st.units.length} unit${st.units.length === 1 ? '' : 's'}</span>
            ${s.lod[bid] ? `<span class="mpk-h-pill lod" style="--c:${(MPK_LOD.find(l => l.v === s.lod[bid].level) || MPK_LOD[0]).color}">LOD ${s.lod[bid].level}</span>` : ''}</div>
          <div class="mpk-dpb-row-m">${[(MPK_AREAS[st.kawasan] || {}).short, st.lot ? 'Lot ' + st.lot : '', [...new Set(st.units.map(u => u.kegunaan))].join(', '),
            mpkHartaRM(st.units.reduce((a, u) => a + mpkHartaTax(u, s.rates), 0)) + ' / year'].filter(Boolean).map(mpkHartaEsc).join(' · ')}</div>
        </button>`).join('')}</div>` : '<div class="mpk-reg-empty">No strata units registered yet.</div>'}
    </section>

    <section class="mpk-h-sec">
      <div class="mpk-h-sec-head"><h3>Assessment tax collection <small>(cukai taksiran)</small></h3>
        <label class="mpk-h-year">Year <select onchange="MPK_HARTA.year = +this.value; mpkHartaRender()">${years.map(v => `<option${v === y ? ' selected' : ''}>${v}</option>`).join('')}</select></label>
        <button type="button" class="mpk-btn" onclick="mpkHartaGenBills()">Generate ${y} bills</button></div>
      <div class="mpk-h-kpis">${kpi(mpkHartaRM(c.billed), `billed · ${mpkNum(c.n)} bills`)}${kpi(mpkHartaRM(c.collected), 'collected', 'ok')}
        ${kpi(mpkHartaRM(c.outstanding), `outstanding · ${mpkNum(c.unpaid)} not fully paid`, 'bad')}${kpi(mpkHartaRM(c.arrears), 'arrears from earlier years', c.arrears ? 'bad' : '')}</div>
      <div class="mpk-h-bar" role="img" aria-label="${Math.round(c.rate * 100)}% collected"><i style="width:${(c.rate * 100).toFixed(1)}%"></i></div>
      <div class="mpk-h-barl"><span><b>${(c.rate * 100).toFixed(1)}%</b> collected</span><span>Two halves a year: penggal 1 (by end Feb) and penggal 2 (by end Aug)</span></div>
      <details class="mpk-h-rates"><summary>Rates and rents <span class="mpk-tag">assumption</span></summary>
        <table class="mpk-h-t rates"><thead><tr><th>Use</th><th>Rate (% of annual value)</th><th>Rent for the estimate (RM / m² / month)</th></tr></thead>
          <tbody>${MPK_HARTA_USES.map(u => `<tr><td>${u}</td>
            <td><input type="number" min="0" step="0.5" value="${s.rates.kadar[u]}" onchange="mpkHartaRate('kadar', '${u}', this); mpkHartaRender()"></td>
            <td><input type="number" min="0" step="0.5" value="${s.rates.sewa[u]}" onchange="mpkHartaRate('sewa', '${u}', this); mpkHartaRender()"></td></tr>`).join('')}</tbody></table>
        <div class="mpk-h-hint">Set these to MPK's rates. Unpaid bills follow new rates when the year's bills are generated again; paid ones keep their amount.</div>
      </details>
      <div class="mpk-dpb-filters">${[['unpaid', 'Not fully paid'], ['all', 'All bills']].map(([k, l]) =>
        `<button type="button" class="mpk-chip${MPK_HARTA.billFilter === k ? ' active' : ''}" onclick="MPK_HARTA.billFilter = '${k}'; mpkHartaRender()">${l}</button>`).join('')}
        <button type="button" class="mpk-btn ghost" onclick="mpkHartaExport('bills')">Export ${y} bills CSV</button></div>
      ${billRows.length ? `<div class="mpk-h-tablewrap"><table class="mpk-h-t bills"><thead><tr><th>Building · petak</th><th>Owner</th><th>Use</th><th class="r">Tax ${y}</th><th>Penggal 1</th><th>Penggal 2</th></tr></thead>
        <tbody>${billRows.map(({ st, u, key, b }) => `<tr><td><b>${mpkHartaEsc(st.plus_code)}</b> · ${mpkHartaEsc(u.petak)}</td><td>${mpkHartaEsc(u.pemilik) || '—'}</td>
          <td>${mpkHartaEsc(u.kegunaan)}</td><td class="r">${mpkHartaRM(b.amount).slice(3)}</td>
          ${['p1', 'p2'].map(h => `<td><button type="button" class="mpk-h-pay${b[h] ? ' paid' : ''}" onclick='mpkHartaPay(${JSON.stringify(key)}, "${h}")'>${b[h] ? '✓ Paid ' + mpkPlanDateLabel(b[h]) : 'Unpaid · mark paid'}</button></td>`).join('')}</tr>`).join('')}</tbody></table></div>`
        : `<div class="mpk-reg-empty">${c.n ? 'Every bill of ' + y + ' is paid.' : 'No bills for ' + y + ' yet: register strata units, then Generate bills.'}</div>`}
    </section>

    <section class="mpk-h-sec">
      <div class="mpk-h-sec-head"><h3>BIM level of development</h3>
        <button type="button" class="mpk-btn${MPK_HARTA.bimOn ? '' : ' ghost'}" onclick="mpkHartaToggleBim()">${MPK_HARTA.bimOn ? 'Hide' : 'Show'} BIM 3D on the map</button></div>
      <div class="mpk-h-kpis">${kpi(mpkNum(modelled), `of ${mpkNum(study.length)} study buildings have a LOD`)}
        ${kpi((study.length ? (modelled / study.length * 100).toFixed(1) : '0.0') + '%', 'model coverage')}</div>
      <div class="mpk-h-lodbars">${MPK_LOD.map((l, i) => `<div class="mpk-h-lodbar" title="${mpkHartaEsc(l.text)}">
        <span><i style="background:${l.color}"></i><b>${l.label}</b> ${l.name}</span>
        <div><i style="width:${modelled ? lodN[i] / Math.max(...lodN, 1) * 100 : 0}%;background:${l.color}"></i></div><em>${mpkNum(lodN[i])}</em></div>`).join('')}</div>
      <div class="mpk-h-hint">Every building starts at LOD 100 (its footprint). Entering floors makes it LOD 200; with an approved building plan, LOD 300;
        a site check of the model, LOD 500. In 3D each modelled building rises to its height, coloured by level.</div>
    </section>

    <section class="mpk-h-sec">
      <div class="mpk-h-sec-head"><h3>Cemeteries <small>(tanah perkuburan)</small></h3>
        <button type="button" class="mpk-btn" onclick="mpkHartaPickSite()">+ Add a site on the map</button></div>
      ${s.kubur.length ? `<div class="mpk-h-kpis">${kpi(mpkNum(s.kubur.length), 'sites')}
        ${kpi(mpkNum(s.kubur.reduce((a, k) => a + (mpkHartaNum(k.kapasiti) || Math.floor(mpkHartaNum(k.luas) / 2.5)), 0)), 'grave lots (capacity)')}
        ${kpi(mpkNum(s.kubur.reduce((a, k) => a + mpkHartaNum(k.terisi), 0)), 'lots in use')}</div>
      <div class="mpk-h-list">${s.kubur.map(k => { const kap = mpkHartaNum(k.kapasiti) || Math.floor(mpkHartaNum(k.luas) / 2.5), used = mpkHartaNum(k.terisi);
        const pct = kap ? Math.min(100, used / kap * 100) : 0;
        return `<button type="button" class="mpk-dpb-row" onclick='mpkHartaKuburGo(${JSON.stringify(k.id)})'>
          <div class="mpk-dpb-row-t"><b>${mpkHartaEsc(k.nama)}</b><span class="mpk-h-pill">${mpkHartaEsc(k.jenis)}</span><span class="mpk-h-pill">${mpkHartaEsc(k.status)}</span></div>
          <div class="mpk-dpb-row-m">${[k.id, k.luas ? mpkNum(mpkHartaNum(k.luas)) + ' m²' : '', kap ? `${mpkNum(used)} of ${mpkNum(kap)} lots in use` : '', k.pengurus].filter(Boolean).map(mpkHartaEsc).join(' · ')}</div>
          ${kap ? `<div class="mpk-h-cap${pct >= 90 ? ' full' : ''}"><i style="width:${pct.toFixed(1)}%"></i></div>` : ''}
        </button>`; }).join('')}</div>`
      : '<div class="mpk-reg-empty">No cemetery sites yet: add one, then click the map where it is.</div>'}
      <div class="mpk-h-hint">Planning permission for a cemetery, crematorium or memorial centre: RM 500.00 per application (Tr. P.U. 9/2026, Third Schedule Part B 2.B.viii).</div>
    </section>

    <div class="mpk-dpb-actions left">
      <button type="button" class="mpk-btn ghost" onclick="mpkHartaExport('units')">Export units CSV</button>
      <button type="button" class="mpk-btn ghost" onclick="mpkHartaExport('kubur')">Export cemeteries CSV</button>
      <button type="button" class="mpk-btn ghost" onclick="mpkHartaExport('json')">Export all JSON</button>
      <label class="mpk-btn ghost mpk-dpb-import">Import JSON<input type="file" accept=".json,application/json" onchange="mpkHartaImport(this)"></label>
    </div>
    <div class="mpk-note">Saved in this browser only: use Export / Import to move the data to another computer. Rates, rents and the 2.5 m² a grave are assumptions.</div>`;
}
function mpkHartaGoBuilding(bid) {
  const f = mpkHartaBld(bid);
  if (!f) return;
  mpkShowPage('dashboard');
  map.flyTo({ center: [f.properties.lng, f.properties.lat], zoom: 18 });
  mpkHartaOpen(bid);
}

function mpkHartaExport(kind) {
  const s = MPK_HARTA.s, day = new Date().toISOString().slice(0, 10);
  const q = v => { const t = String(v == null ? '' : v); return /[",\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t; };
  const csv = (head, rows) => new Blob(['﻿' + [head, ...rows].map(r => r.map(q).join(',')).join('\n') + '\n'], { type: 'text/csv;charset=utf-8' });
  let blob, name;
  if (kind === 'json') {
    blob = new Blob([JSON.stringify(s, null, 1)], { type: 'application/json' }); name = `mpk_property_${day}.json`;
  } else if (kind === 'units') {
    blob = csv(['plus_code', 'area', 'lot', 'petak', 'floor', 'area_m2', 'use', 'owner', 'annual_value_rm', 'tax_per_year_rm', 'lod'],
      mpkHartaUnitsAll().map(({ bid, st, u }) => [st.plus_code, (MPK_AREAS[st.kawasan] || {}).short, st.lot, u.petak, u.tingkat, u.luas, u.kegunaan, u.pemilik,
        mpkHartaNum(u.nilai) || mpkHartaAnnualValue(u.luas, s.rates.sewa[u.kegunaan]), mpkHartaTax(u, s.rates).toFixed(2), s.lod[bid] ? s.lod[bid].level : '']));
    name = `mpk_strata_units_${day}.csv`;
  } else if (kind === 'bills') {
    const y = MPK_HARTA.year;
    blob = csv(['year', 'plus_code', 'petak', 'owner', 'use', 'tax_rm', 'penggal_1_paid', 'penggal_2_paid'],
      mpkHartaUnitsAll().filter(x => (s.bills[y] || {})[x.key]).map(({ st, u, key }) => { const b = s.bills[y][key];
        return [y, st.plus_code, u.petak, u.pemilik, u.kegunaan, b.amount.toFixed(2), b.p1 || '', b.p2 || '']; }));
    name = `mpk_assessment_bills_${y}.csv`;
  } else {
    blob = csv(['id', 'name', 'type', 'status', 'lat', 'lng', 'area_m2', 'capacity', 'in_use', 'managed_by', 'note'],
      s.kubur.map(k => [k.id, k.nama, k.jenis, k.status, k.lat, k.lng, k.luas, k.kapasiti, k.terisi, k.pengurus, k.catatan]));
    name = `mpk_cemeteries_${day}.csv`;
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
function mpkHartaImport(input) {
  const file = input.files && input.files[0];
  input.value = '';
  if (!file) return;
  file.text().then(t => {
    const v = JSON.parse(t);
    if (!v || typeof v.strata !== 'object' || !Array.isArray(v.kubur)) throw new Error('not a property file');
    if (!confirm('Replace the strata units, LOD, bills and cemeteries in this browser with the file?')) return;
    MPK_HARTA.s = Object.assign(mpkHartaBlankStore(), v);
    if (!mpkHartaSave()) return;
    mpkHartaRefresh();
    showToast('📥 Property data imported');
  }).catch(e => showToast('⚠️ Could not import: ' + e.message, 5000));
}

if (typeof module !== 'undefined') {
  module.exports = { mpkHartaAnnualValue, mpkHartaTax, mpkHartaGenUnits, mpkHartaLodSuggest, mpkHartaHeight, mpkHartaCollection,
    MPK_HARTA_DEFAULT_RATES, MPK_LOD };
}
