// ============================================================
// STRATA — MPK KEMAMAN (Area dropdown → Strata)
// The strata title process as it runs in Malaysia, from the map to the register:
//   1 Building & conditions  the building on the map, its lot and master title, and the conditions of
//                            JKPTG for strata titles (final title, no charge or lien, land-use category,
//                            ≥ 21 years of lease left, building within the lot, CCC / CFO)
//   2 Parcels & 3D           parcels (petak) per floor with their type, whole-floor parcels, accessory
//                            parcels (outside / within the building), common property, the floor stack,
//                            BIM level of development; floors and height start from the building heights
//   3 Share units            allocated share units, Strata Management Act 2013 (Act 757) First Schedule:
//                            (area × WF1 × WF2) + (accessory area × WF3), rounded to a whole number; the
//                            schedule of parcels filed with the Commissioner of Buildings (s.6) and SiFUS
//   4 Strata title           SiFUS (PTG) and schedule of parcels (COB) → CPSP (JUPEM, apply within 3 months
//                            of completion) → application to subdivide (PTG, within 1 month of the CPSP) →
//                            strata titles registered (Strata Titles Act 1985, Act 318); the strata register
//                            opens and the management corporation comes into existence
//   5 Management & tax       JMB (first AGM within 12 months of vacant possession, Act 757 s.17–18), MC,
//                            Charges by share units and the sinking fund of 10 % (s.25), assessment tax per
//                            parcel (Act 171 s.127) with yearly bills paid in two halves
//   6 PDF report             the whole scheme as an A4 report to download
// and ten tools (strata potential, building heights in 3D, floor X-ray, share-unit what-if, AGM vote,
// deadline radar, sinking fund forecast, parcel passports with QR, owner statements, pipeline).
// Assessment rates, rents, the maintenance rate and the capital works plan are assumptions.
// Kept in this browser (localStorage); Export / Import moves it.
// ============================================================

// ---------- Act 757 First Schedule (pure, exported for tools/test_mpk_strata.js) ----------
// Table 1, WF1 by type of parcel: [no air-con, lift] [no air-con, no lift] [air-con, lift] [air-con, no lift]
const STRATA_WF1 = {
  pangsapuri: ['Pangsapuri / SOHO', [1.00, 0.85, 1.30, 1.15]],
  pejabat: ['Pejabat / institusi (kolej)', [1.00, 0.85, 1.30, 1.15]],
  runcit: ['Kompleks runcit', [2.00, 1.70, 3.20, 2.90]],
  hotel: ['Hotel / pusat perubatan', [2.20, 1.90, 2.80, 2.45]],
  industri: ['Kompleks industri', [1.00, 0.85, 1.45, 1.30]],
  parkir: ['Tempat letak kereta (petak satu tingkat penuh)', [0.75, 0.65, 0.85, 0.75]],
  kedai_atas: ['Rumah kedai: petak tingkat atas', [1.00, 0.85, 1.30, 1.15]],
  kedai_bawah: ['Rumah kedai: petak tingkat bawah', [0.85, 0.85, 1.15, 1.15]],
};
// Table 2, WF2 for a whole floor parcel; Table 3, WF3 for an accessory parcel
const STRATA_WF2 = { tidak: ['Bukan petak satu tingkat penuh', 1], tanpa: ['Satu tingkat penuh, tanpa teras lif / eskalator', 0.85],
  dengan: ['Satu tingkat penuh, termasuk teras lif / eskalator', 0.80] };
const STRATA_WF3 = { luar: ['Di luar bangunan', 0.25], dalam: ['Di dalam bangunan', 0.5] };
// The scheme type picks the parcels' type when they are created
const STRATA_SCHEME_TYPES = { kedai: 'Rumah kedai / pejabat kedai', pangsapuri: 'Pangsapuri / SOHO', pejabat: 'Kompleks pejabat',
  runcit: 'Kompleks runcit', hotel: 'Hotel / pusat perubatan', industri: 'Kompleks industri' };
// Parcel type → use for assessment tax
const STRATA_TAX_USE = { pangsapuri: 'Kediaman', pejabat: 'Komersial', runcit: 'Komersial', hotel: 'Komersial', industri: 'Industri',
  parkir: 'Lain-lain', kedai_atas: 'Komersial', kedai_bawah: 'Komersial' };
const STRATA_TYPE_COLOR = { pangsapuri: '#42A5F5', pejabat: '#26A69A', runcit: '#FFA726', hotel: '#EC407A', industri: '#8D6E63',
  parkir: '#78909C', kedai_atas: '#FFB74D', kedai_bawah: '#F57C00' };
const STRATA_DEFAULTS = {
  kadar: { Kediaman: 6, Komersial: 9, Industri: 9, 'Lain-lain': 6 },        // assessment rate, % of annual value (assumption)
  sewa: { Kediaman: 4, Komersial: 12, Industri: 6, 'Lain-lain': 4 },        // rent for the estimate, RM / m² / month (assumption)
};
const STRATA_NET = 0.85;              // share of a floor sold as parcels when they are created; the rest is common property
const STRATA_FLOOR_M = 3.5;           // metres a floor, to turn a building height into floors
const STRATA_STAGES = [
  { k: 'draf', label: 'Preparation', ms: 'Penyediaan: syarat, petak dan unit syer', color: '#FFB300' },
  { k: 'sifus', label: 'SiFUS & schedule filed', ms: 'Sijil Formula Unit Syer (PTG) diluluskan; Jadual Petak difailkan dengan Pesuruhjaya Bangunan', color: '#00ACC1' },
  { k: 'cpsp', label: 'CPSP approved', ms: 'Pelan Strata Cadangan diperakui JUPEM (CPSP)', color: '#1E88E5' },
  { k: 'pecah', label: 'Applied to subdivide', ms: 'Permohonan pecah bahagi dikemukakan ke PTG', color: '#7E57C2' },
  { k: 'hakmilik', label: 'Strata titles issued', ms: 'Hakmilik strata didaftarkan; buku daftar strata dibuka', color: '#2E7D32' },
];
const STRATA_SYARAT = [
  ['tetap', 'Hakmilik tetap (bukan hakmilik sementara)'], ['gadaian', 'Tiada gadaian atau lien di atas tanah'],
  ['kategori', 'Selaras dengan kategori kegunaan tanah dan syarat nyata'], ['pajakan', 'Tanah pegangan kekal, atau baki pajakan sekurang-kurangnya 21 tahun'],
  ['sempadan', 'Bangunan di dalam sempadan lot'], ['ccc', 'Perakuan Siap dan Pematuhan (CCC) / Perakuan Kelayakan Menduduki (CFO)'],
];
const STRATA_PECAH = { bangunan: 'Pecah bahagi bangunan', bangunan_tanah: 'Pecah bahagi bangunan dan tanah', tanah: 'Pecah bahagi tanah (petak tanah)' };
const STRATA_DOCS = [
  ['cpsp', 'Pelan Strata Cadangan diperakui (CPSP)'], ['sifus', 'Sijil Formula Unit Syer (SiFUS)'], ['jadual', 'Jadual Petak difailkan dengan COB'],
  ['ccc', 'CCC / CFO'], ['carian', 'Salinan hakmilik induk dan carian rasmi'], ['pelan', 'Pelan bangunan diluluskan'], ['fi', 'Fi permohonan dibayar'],
];
const STRATA_LOD = [
  { v: 100, name: 'Conceptual', text: 'Footprint only: a 2D outline.', color: '#B0BEC5' },
  { v: 200, name: 'Approximate geometry', text: 'Massing from the footprint and the number of floors.', color: '#64B5F6' },
  { v: 300, name: 'Precise geometry', text: 'Floors and parcels as in the approved building / strata plan.', color: '#1E88E5' },
  { v: 400, name: 'Fabrication', text: 'Structure and services modelled, ready for construction.', color: '#3949AB' },
  { v: 500, name: 'As-built', text: 'Verified on site against the building as built.', color: '#1A237E' },
];
const STRATA_KUBUR_TYPES = ['Islam', 'Bukan Islam', 'Swasta', 'Krematorium'];

const strataNum = v => { const n = parseFloat(String(v == null ? '' : v).replace(/,/g, '')); return isFinite(n) && n > 0 ? n : 0; };
const strataWF1 = (jenis, aircond, lif) => { const t = STRATA_WF1[jenis] || STRATA_WF1.pejabat; return t[1][(aircond ? 2 : 0) + (lif ? 0 : 1)]; };
// Allocated share units of every parcel: (area × WF1 × WF2) + (accessory area × WF3), rounded to the nearest whole number
function strataShareUnits(parcels, kompleks) {
  const k = kompleks || {};
  const rows = parcels.map(p => {
    const wf1 = strataWF1(p.jenis, k.aircond, k.lif), wf2 = (STRATA_WF2[p.wf2] || STRATA_WF2.tidak)[1];
    const wf3 = strataNum(p.aks_luas) ? (STRATA_WF3[p.aks_lokasi] || STRATA_WF3.luar)[1] : 0;
    return { wf1, wf2, wf3, su: Math.round(strataNum(p.luas) * wf1 * wf2 + strataNum(p.aks_luas) * wf3) };
  });
  const su = rows.map(r => r.su), total = su.reduce((a, b) => a + b, 0);
  return { rows, su, total, pct: su.map(v => total ? v / total * 100 : 0) };
}
// Parcels: floors × parcels a floor, each an equal share of the floor's saleable area; a shop-house scheme
// has ground-floor and upper-floor parcels
function strataGenParcels(floors, perFloor, footprint, schemeType) {
  const F = Math.max(1, Math.floor(strataNum(floors) || 1)), U = Math.max(1, Math.floor(strataNum(perFloor) || 1));
  const luas = Math.round(strataNum(footprint) * STRATA_NET / U * 100) / 100;
  const out = [];
  for (let f = 1; f <= F; f++) {
    const jenis = schemeType === 'kedai' ? (f === 1 ? 'kedai_bawah' : 'kedai_atas') : (STRATA_WF1[schemeType] ? schemeType : 'pejabat');
    for (let u = 1; u <= U; u++) out.push({ petak: `M${f}-${String(u).padStart(2, '0')}`, tingkat: String(f), luas: String(luas), jenis, wf2: 'tidak',
      pemilik: '', nilai: '', aks_no: '', aks_luas: '', aks_lokasi: 'luar' });
  }
  return out;
}
function strataCommon(sc) {
  if (strataNum(sc.common)) return strataNum(sc.common);
  const gross = strataNum(sc.bld && sc.bld.area_m2) * (strataNum(sc.bim && sc.bim.tingkat) || 1);
  return Math.max(0, Math.round((gross - sc.parcels.reduce((a, p) => a + strataNum(p.luas), 0)) * 100) / 100);
}
const strataAnnualValue = (luas, sewa) => Math.round(strataNum(luas) * strataNum(sewa) * 12);
const strataUse = p => STRATA_TAX_USE[p.jenis] || 'Lain-lain';
// Yearly assessment tax of a parcel: its annual value (or the estimate) × the rate of its use
function strataTax(p, rates) {
  const use = strataUse(p);
  const nilai = strataNum(p.nilai) || strataAnnualValue(p.luas, rates.sewa[use] || 0);
  return Math.round(nilai * (rates.kadar[use] || 0)) / 100;
}
// Monthly Charges (share units × RM a share unit) and sinking fund (10 % of the Charges, Act 757 s.25(4))
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
const strataFloorsFromHeight = h => Math.max(1, Math.round(strataNum(h) / STRATA_FLOOR_M));
const strataHeight = bim => strataNum(bim && bim.tinggi) || (strataNum(bim && bim.tingkat) || 1) * STRATA_FLOOR_M;
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
// 'YYYY-MM-DD' + n months (the last day of a shorter month when the day does not exist)
function strataAddMonths(d, n) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d || '');
  if (!m) return '';
  const y = +m[1], mo = +m[2] - 1 + n, day = +m[3];
  const last = new Date(Date.UTC(y, mo + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, mo, Math.min(day, last))).toISOString().slice(0, 10);
}
const strataDays = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
// Statutory deadlines of a scheme: CPSP within 3 months of completion (+1 month extension), subdivision within
// 1 month of the CPSP (+1), first AGM of the JMB within 12 months of vacant possession
function strataDeadlines(sc, today) {
  const a = sc.app || {}, u = sc.urus || {};
  const one = (k, label, from, months, ext, done) => {
    if (!from) return { k, label, due: '', status: 'na', note: 'start date not entered' };
    const due = strataAddMonths(from, months), dueExt = strataAddMonths(from, months + ext);
    if (done) {
      const late = done > dueExt, inExt = !late && done > due;
      return { k, label, due, dueExt, done, status: late ? 'late' : 'ok', note: late ? `${strataDays(dueExt, done)} days late` : inExt ? 'within the extension' : 'on time' };
    }
    const left = strataDays(today, due);
    return { k, label, due, dueExt, status: left < 0 ? (strataDays(today, dueExt) < 0 ? 'overdue' : 'ext') : 'open',
      note: left < 0 ? (strataDays(today, dueExt) < 0 ? `${-strataDays(today, dueExt)} days overdue` : 'in the 1-month extension') : `${left} days left` };
  };
  return [
    one('cpsp', 'Apply for CPSP (JUPEM)', a.d_siap, 3, 1, a.d_cpsp_mohon),
    one('pecah', 'Apply to subdivide (PTG)', a.d_cpsp, 1, 1, a.d_pecah),
    one('jmb', 'First AGM of the JMB', u.d_vp, 12, 0, u.d_jmb),
  ];
}
// A vote by share units: ordinary resolution = more for than against among those voting; special = at least 3/4
// of those voting; unanimous = every share unit in favour
function strataVote(su, votes) {
  let yes = 0, no = 0, abstain = 0;
  su.forEach((v, i) => { if (votes[i] === 'ya') yes += v; else if (votes[i] === 'tidak') no += v; else abstain += v; });
  const cast = yes + no, total = yes + no + abstain;
  return { yes, no, abstain, total, cast, ordinary: yes > no, special: cast > 0 && yes >= 0.75 * cast, unanimous: total > 0 && yes === total };
}
// Sinking fund balance at the end of each year: opening + 12 × monthly contribution − the year's capital works
function strataSinking(monthly, opening, capex, years) {
  const out = [];
  let bal = strataNum(opening);
  for (let y = 1; y <= years; y++) {
    const spend = capex.filter(c => +c.tahun === y).reduce((a, c) => a + strataNum(c.kos), 0);
    bal = bal + 12 * monthly - spend;
    out.push({ y, in: 12 * monthly, spend, bal });
  }
  return out;
}
// Strata potential of a building, 0 – 100: storeys, size, an approved plan, a cadastral lot; illegal buildings lose
function strataPotential(p, status) {
  const floors = strataNum(p.tingkat_est) || 1;
  let s = floors >= 2 ? 30 + Math.min(floors - 2, 4) * 5 : 0;
  s += strataNum(p.area_m2) >= 400 ? 20 : strataNum(p.area_m2) >= 150 ? 10 : 0;
  if (status === 'legal') s += 25;
  if (status === 'suspected') s -= 40;
  if (p.lot) s += 10;
  return Math.max(0, Math.min(100, s));
}

// ---------- Store ----------
const STRATA = { KEY: 'mpk_strata_v2', s: null, active: false, cur: null, step: 1, year: new Date().getFullYear(), bound: false, picking: false,
  kubur: null, view: 'skim', xray: false, whatif: null };
function strataBlank() { return { schemes: {}, kubur: [], ...JSON.parse(JSON.stringify(STRATA_DEFAULTS)) }; }
function strataLoad() {
  let s = null;
  try { s = JSON.parse(localStorage.getItem(STRATA.KEY) || 'null'); } catch (e) {}
  if (!s) s = strataMigrate();
  STRATA.s = Object.assign(strataBlank(), s || {});
  Object.values(STRATA.s.schemes).forEach(strataNormalise);
}
// Earlier versions (mpk_strata_v1, and the Property & Tax tab mpk_harta_v1) carry over
function strataMigrate() {
  let v1 = null, h = null;
  try { v1 = JSON.parse(localStorage.getItem('mpk_strata_v1') || 'null'); h = JSON.parse(localStorage.getItem('mpk_harta_v1') || 'null'); } catch (e) {}
  const s = strataBlank();
  if (v1) {
    s.kadar = v1.kadar || s.kadar; s.sewa = v1.sewa || s.sewa; s.kubur = v1.kubur || [];
    for (const [bid, sc] of Object.entries(v1.schemes || {})) {
      s.schemes[bid] = { ...sc, app: { ...sc.app, stage: { borang1: 'pecah' }[sc.app && sc.app.stage] || (sc.app && sc.app.stage) || 'draf' } };
    }
    return s;
  }
  if (h) {
    s.kubur = h.kubur || [];
    if (h.rates) { s.kadar = h.rates.kadar || s.kadar; s.sewa = h.rates.sewa || s.sewa; }
    const y = new Date().getFullYear(), now = new Date().toISOString();
    for (const [bid, st] of Object.entries(h.strata || {})) {
      const lod = (h.lod || {})[bid] || {};
      s.schemes[bid] = { bid, no: strataNextNo(Object.values(s.schemes).map(x => x.no), 'STR', y), nama: 'Skim strata ' + (st.plus_code || bid),
        created: st.updated || now, updated: now, bld: { plus_code: st.plus_code, kawasan: st.kawasan, lot: st.lot, lng: st.lng, lat: st.lat, area_m2: lod.area_m2 },
        bim: { tingkat: lod.tingkat || '', tinggi: lod.tinggi || '', lod: lod.level || 100, disahkan: !!lod.disahkan }, parcels: st.units, bills: {} };
    }
    return s;
  }
  return null;
}
// Fills what an older or imported scheme lacks
function strataNormalise(sc) {
  sc.kompleks = sc.kompleks || { jenis: sc.bld && sc.bld.kawasan === 'tk' ? 'industri' : 'kedai', aircond: false, lif: false };
  sc.syarat = sc.syarat || {};
  sc.jenis_pecah = sc.jenis_pecah || 'bangunan';
  sc.app = Object.assign({ stage: 'draf', docs: {} }, sc.app || {});
  if (!STRATA_STAGES.some(st => st.k === sc.app.stage)) sc.app.stage = 'draf';
  sc.urus = Object.assign({}, sc.urus || {});
  sc.caj = Object.assign({ kadar: '0.30' }, sc.caj || {});
  sc.sf = sc.sf || { baki: '', capex: [] };
  sc.votes = sc.votes || {};
  sc.bills = sc.bills || {};
  sc.bim = Object.assign({ tingkat: '', tinggi: '', lod: 100, disahkan: false }, sc.bim || {});
  const useToType = { Kediaman: 'pangsapuri', Komersial: null, Industri: 'industri', 'Lain-lain': 'pejabat' };
  sc.parcels = (sc.parcels || []).map((p, i) => ({ wf2: 'tidak', aks_lokasi: 'luar', aks_no: '', aks_luas: '', pemilik: '', nilai: '',
    ...p, id: p.id || Date.now().toString(36) + i,
    jenis: p.jenis || useToType[p.kegunaan] || (strataNum(p.tingkat) <= 1 ? 'kedai_bawah' : 'kedai_atas') }));
  return sc;
}
function strataSave() {
  try { localStorage.setItem(STRATA.KEY, JSON.stringify(STRATA.s)); return true; }
  catch (e) { showToast('⚠️ Could not save in this browser: ' + e.message, 5000); return false; }
}
const strataEsc = v => mpkEscHtml(v == null ? '' : v);
const strataRM = v => 'RM ' + (v || 0).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const strataRM0 = v => (v || 0).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const strataStageIdx = sc => Math.max(0, STRATA_STAGES.findIndex(st => st.k === (sc.app && sc.app.stage)));
const strataToday = () => new Date().toISOString().slice(0, 10);
const strataDate = d => d ? mpkPlanDateLabel(d) : '—';
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
  title.textContent = 'Strata Titles — MPK Kemaman';
  sub.textContent = 'From the map to the strata register · Act 318 · Act 757';
  panelSub.textContent = 'Strata schemes, share units, titles, management, assessment tax and cemeteries';
  switchTab(document.getElementById('ptab-strata'), 'strata');
  strataLayers();
  strataHideMpk();
  strataRenderPanel();
  addActivityLog('Strata mode', 'Strata titles');
}
function strataLeave() {
  STRATA.active = false;
  document.body.classList.remove('strata-mode');
  strataCloseWs();
  strataCloseTool();
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
const STRATA_KEEP = ['mpk-wayback-layer', 'mpk-kadaster-line', 'mpk-boundary-fill', 'mpk-boundary-line', 'mpk-koridor-band', 'mpk-koridor-line',
  'mpk-landuse-fill', 'mpk-landuse-line', 'mpk-district-line'];
function strataHideMpk() {
  if (!STRATA.active || !map) return;
  MPK.LAYERS.filter(id => !STRATA_KEEP.includes(id)).forEach(id => { try { if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', 'none'); } catch (e) {} });
}

// ---------- Map ----------
function strataBldData() {
  const s = STRATA.s, study = MPK.data.buildings.features, others = MPK.data.others ? MPK.data.others.features : [];
  const one = (f, inStudy) => {
    const p = f.properties, sc = s.schemes[p.id];
    return { type: 'Feature', geometry: f.geometry, properties: { id: p.id, st: sc ? strataStageIdx(sc) + 1 : 0, h: sc ? strataHeight(sc.bim) : 0,
      study: inStudy ? 1 : 0, ht: inStudy ? (strataNum(p.tinggi_m) || STRATA_FLOOR_M) : 0, fl: inStudy ? (strataNum(p.tingkat_est) || 1) : 0,
      pot: inStudy ? strataPotential(p, mpkStatus(p, MPK.settings)) : 0 } };
  };
  return { type: 'FeatureCollection', features: [...study.map(f => one(f, true)), ...others.map(f => one(f, false))] };
}
function strataKuburData() {
  return { type: 'FeatureCollection', features: STRATA.s.kubur.map(k => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [k.lng, k.lat] },
    properties: { id: k.id, nama: k.nama || k.id } })) };
}
// Floor slabs of the open scheme (X-ray): one slab a floor with a gap, coloured by the floor's main parcel type
function strataXrayData() {
  const sc = STRATA.cur && STRATA.s.schemes[STRATA.cur], f = sc && strataBuilding(sc.bid);
  if (!sc || !f || !STRATA.xray) return { type: 'FeatureCollection', features: [] };
  const floors = Math.max(1, Math.floor(strataNum(sc.bim.tingkat) || 1)), fh = strataHeight(sc.bim) / floors;
  return { type: 'FeatureCollection', features: Array.from({ length: floors }, (_, i) => {
    const on = sc.parcels.filter(p => Math.floor(strataNum(p.tingkat)) === i + 1);
    const main = on.length ? on.reduce((a, p) => (a[p.jenis] = (a[p.jenis] || 0) + strataNum(p.luas), a), {}) : null;
    const jenis = main ? Object.entries(main).sort((a, b) => b[1] - a[1])[0][0] : null;
    return { type: 'Feature', geometry: f.geometry, properties: { b: i * fh, t: i * fh + fh * 0.8, c: jenis ? STRATA_TYPE_COLOR[jenis] : '#CFD8DC' } };
  }) };
}
const STRATA_LAYERS = ['strata-kubur-label', 'strata-kubur-pt', 'strata-xray', 'strata-3d', 'strata-line', 'strata-fill'];
const STRATA_POT_COLOR = ['interpolate', ['linear'], ['get', 'pot'], 0, '#EDE7F6', 40, '#B39DDB', 70, '#7E57C2', 100, '#4527A0'];
const STRATA_HT_COLOR = ['interpolate', ['linear'], ['get', 'fl'], 1, '#E3F2FD', 2, '#90CAF9', 3, '#42A5F5', 5, '#1565C0', 8, '#0D47A1'];
function strataStageColor() { return ['match', ['get', 'st'], ...STRATA_STAGES.flatMap((st, i) => [i + 1, st.color]), '#90A4AE']; }
// Called from mpkAddLayers (mpk.js) and after every change here
function strataLayers() {
  if (!STRATA.active || !map || !MPK.data || !map.getSource('mpk-buildings')) return;
  try {
    if (!map.getSource('strata-bld')) {
      map.addSource('strata-bld', { type: 'geojson', data: strataBldData() });
      map.addLayer({ id: 'strata-fill', type: 'fill', source: 'strata-bld', paint: { 'fill-color': '#90A4AE', 'fill-opacity': 0.4 } });
      map.addLayer({ id: 'strata-line', type: 'line', source: 'strata-bld',
        paint: { 'line-color': ['case', ['>', ['get', 'st'], 0], '#1E2C44', '#607D8B'], 'line-width': ['interpolate', ['linear'], ['zoom'], 13, 0.4, 17, 1.2] } });
      map.addLayer({ id: 'strata-3d', type: 'fill-extrusion', source: 'strata-bld', paint: { 'fill-extrusion-base': 0, 'fill-extrusion-opacity': 0.9 } });
      map.addSource('strata-xray', { type: 'geojson', data: strataXrayData() });
      map.addLayer({ id: 'strata-xray', type: 'fill-extrusion', source: 'strata-xray',
        paint: { 'fill-extrusion-color': ['get', 'c'], 'fill-extrusion-base': ['get', 'b'], 'fill-extrusion-height': ['get', 't'], 'fill-extrusion-opacity': 0.92 } });
    } else {
      map.getSource('strata-bld').setData(strataBldData());
      map.getSource('strata-xray').setData(strataXrayData());
    }
    if (!map.getSource('strata-kubur')) {
      map.addSource('strata-kubur', { type: 'geojson', data: strataKuburData() });
      map.addLayer({ id: 'strata-kubur-pt', type: 'circle', source: 'strata-kubur',
        paint: { 'circle-color': '#6D4C41', 'circle-radius': ['interpolate', ['linear'], ['zoom'], 11, 5, 18, 11], 'circle-stroke-color': '#fff', 'circle-stroke-width': 2 } });
      map.addLayer({ id: 'strata-kubur-label', type: 'symbol', source: 'strata-kubur', minzoom: 13,
        layout: { 'text-field': ['get', 'nama'], 'text-font': ['Noto Sans Regular'], 'text-size': 11.5, 'text-offset': [0, 1.3], 'text-anchor': 'top' },
        paint: { 'text-color': '#4E342E', 'text-halo-color': '#fff', 'text-halo-width': 1.5 } });
    } else map.getSource('strata-kubur').setData(strataKuburData());
    strataApplyView();
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
// Map views: schemes by stage, strata potential (tool 1), building heights in 3D (tool 2)
function strataApplyView() {
  if (!map.getLayer('strata-fill')) return;
  const v = STRATA.view;
  const fill = v === 'potensi' ? ['case', ['==', ['get', 'study'], 1], STRATA_POT_COLOR, '#ECEFF1']
    : v === 'tinggi' ? ['case', ['==', ['get', 'study'], 1], STRATA_HT_COLOR, '#ECEFF1'] : strataStageColor();
  map.setPaintProperty('strata-fill', 'fill-color', fill);
  map.setPaintProperty('strata-fill', 'fill-opacity', v === 'skim' ? ['case', ['>', ['get', 'st'], 0], 0.8, 0.35] : ['case', ['==', ['get', 'study'], 1], 0.85, 0.25]);
  map.setFilter('strata-3d', v === 'tinggi' ? ['==', ['get', 'study'], 1] : ['all', ['>', ['get', 'st'], 0], ['!', STRATA.xray]]);
  map.setPaintProperty('strata-3d', 'fill-extrusion-color', v === 'tinggi' ? STRATA_HT_COLOR : strataStageColor());
  map.setPaintProperty('strata-3d', 'fill-extrusion-height', v === 'tinggi' ? ['get', 'ht'] : ['get', 'h']);
  map.setLayoutProperty('strata-3d', 'visibility', v === 'potensi' ? 'none' : 'visible');
}
function strataSetView(v) {
  STRATA.view = v;
  strataApplyView();
  if (v === 'tinggi' && map.getPitch() < 20) map.easeTo({ pitch: 58, bearing: -20, duration: 900 });
  strataRenderPanel();
}
function strataRemoveLayers() {
  if (!map) return;
  STRATA_LAYERS.forEach(id => { try { if (map.getLayer(id)) map.removeLayer(id); } catch (e) {} });
  ['strata-kubur', 'strata-xray', 'strata-bld'].forEach(id => { try { if (map.getSource(id)) map.removeSource(id); } catch (e) {} });
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
  const st = sc ? STRATA_STAGES[strataStageIdx(sc)] : null;
  const study = !!p.kawasan;
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
      ${study && p.tinggi_m ? row('Height', `${p.tinggi_m} m · ${p.tingkat_est} floor${p.tingkat_est > 1 ? 's' : ''} <small>(${strataEsc(p.tinggi_src)})</small>`) : ''}
      ${study ? row('Strata potential', strataPotential(p, mpkStatus(p, MPK.settings)) + ' / 100') : ''}
      ${sc ? row('Scheme', strataEsc(sc.no)) + row('Parcels', mpkNum(sc.parcels.length) + ' · ' + mpkNum(strataShareUnits(sc.parcels, sc.kompleks).total) + ' share units') : ''}
      <div class="mpk-dpb-pop"><button type="button" class="mpk-btn mpk-dpb-pop-btn" onclick='strataOpen(${JSON.stringify(String(bid))})'>${sc ? 'Open strata scheme' : 'Start strata scheme'}</button></div>
    </div>`;
  if (MPK.popup) MPK.popup.remove();
  MPK.popup = new maplibregl.Popup({ maxWidth: '300px', focusAfterOpen: false }).setLngLat(lngLat).setHTML(html).addTo(map);
}

// ---------- Panel ----------
const STRATA_TOOLS = [
  ['potensi', '◎', 'Strata potential', 'Scores every building in the study areas for strata: storeys, size, approval, lot.'],
  ['tinggi', '▥', 'Building heights 3D', 'Heights gathered for the study areas (OSM, GHSL) raised in 3D, by floors.'],
  ['xray', '☰', 'Floor X-ray', 'Splits the open scheme into floating floors on the map, coloured by parcel type.'],
  ['whatif', '⇄', 'Share-unit what-if', 'Change air-con, lifts or whole floors and see every owner\'s Charges move.'],
  ['undi', '✋', 'AGM vote by share units', 'Ordinary, special (¾) and unanimous resolutions, counted by share units.'],
  ['radar', '⏱', 'Deadline radar', 'CPSP in 3 months, subdivision in 1, JMB AGM in 12: every scheme, overdue first.'],
  ['sinking', '📈', 'Sinking fund forecast', 'Ten years of the 10 % fund against repainting, lifts and roof works.'],
  ['pasport', '▦', 'Parcel passports (QR)', 'A card for each parcel with its share units and a QR to the building.'],
  ['penyata', '🧾', 'Owner statements', 'One page per owner: assessment tax to MPK, Charges and sinking fund.'],
  ['saluran', '⟿', 'Strata pipeline', 'Every scheme by stage, with a timeline from preparation to titles.'],
];
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
    su += strataShareUnits(x.parcels, x.kompleks).total;
    tax += x.parcels.reduce((a, p) => a + strataTax(p, s), 0);
    for (const [y, bs] of Object.entries(x.bills || {})) for (const [k, b] of Object.entries(bs)) (all[y] = all[y] || {})[x.bid + '|' + k] = b;
  }
  const late = sc.reduce((n, x) => n + strataDeadlines(x, strataToday()).filter(d => d.status === 'overdue' || d.status === 'late').length, 0);
  return { n: sc.length, parcels, su, tax, titles: sc.filter(x => x.app.stage === 'hakmilik').length, late, c: strataCollection(all, STRATA.year) };
}
function strataRenderPanel() {
  const el = document.getElementById('tab-strata');
  if (!el || !STRATA.s) return;
  const s = STRATA.s, t = strataTotals();
  const steps = [['Building & conditions', 'syarat JKPTG'], ['Parcels & 3D', 'petak, aksesori, LOD'], ['Share units', 'Act 757 formula · COB'],
    ['Strata title', 'SiFUS → CPSP → PTG'], ['Management & tax', 'JMB, MC, caj, cukai'], ['PDF report', 'download']];
  const schemes = Object.values(s.schemes).sort((a, b) => b.updated.localeCompare(a.updated));
  const kpi = (v, l, cls = '') => `<div class="strata-kpi ${cls}"><b>${v}</b><span>${l}</span></div>`;
  const legend = STRATA.view === 'potensi' ? `<div class="strata-ramp pot"></div><div class="strata-ramp-l"><span>0 low</span><span>strata potential</span><span>100 high</span></div>`
    : STRATA.view === 'tinggi' ? `<div class="strata-ramp ht"></div><div class="strata-ramp-l"><span>1 floor</span><span>estimated floors</span><span>8+</span></div>`
    : `<div class="strata-legend">${STRATA_STAGES.map(st => `<span><i style="background:${st.color}"></i>${st.label}</span>`).join('')}<span><i style="background:#90A4AE"></i>No scheme</span></div>`;
  el.innerHTML = `
    <div class="mpk-card strata-intro">
      <div class="mpk-card-title">From the map to the strata register</div>
      <ol class="strata-flow">${steps.map(([a, b], i) => `<li><i>${i + 1}</i><span><b>${a}</b><small>${b}</small></span></li>`).join('')}</ol>
      <div class="strata-hint">Click any building on the map, then <i>Start strata scheme</i>.</div>
    </div>
    <div class="strata-kpis">${kpi(mpkNum(t.n), 'schemes')}${kpi(mpkNum(t.parcels), 'parcels')}${kpi(mpkNum(t.su), 'share units')}
      ${kpi(mpkNum(t.titles), 'with strata titles')}${kpi(strataRM(t.tax), 'assessment tax / year')}${kpi(mpkNum(t.late), 'deadlines missed', t.late ? 'bad' : '')}</div>
    <div class="mpk-card">
      <div class="mpk-card-title">Map view</div>
      <div class="strata-seg" role="radiogroup">${[['skim', 'Schemes'], ['potensi', 'Potential'], ['tinggi', 'Heights 3D']].map(([k, l]) =>
        `<button type="button" role="radio" aria-checked="${STRATA.view === k}" class="${STRATA.view === k ? 'on' : ''}" onclick="strataSetView('${k}')">${l}</button>`).join('')}</div>
      ${legend}
      <button type="button" class="mpk-btn ghost strata-wide" onclick="strataTilt()">Tilt the map for 3D</button>
    </div>
    <div class="mpk-card">
      <div class="mpk-card-title">Strata tools</div>
      <div class="strata-tools">${STRATA_TOOLS.map(([k, ic, n, d], i) => `<button type="button" class="strata-tool" onclick="strataTool('${k}')" title="${strataEsc(d)}">
        <span class="ic" aria-hidden="true">${ic}</span><b>${i + 1}. ${n}</b><small>${d}</small></button>`).join('')}</div>
    </div>
    <div class="mpk-card">
      <div class="mpk-card-title">Strata schemes</div>
      ${schemes.length ? `<div class="mpk-dpb-list">${schemes.map(x => { const st = STRATA_STAGES[strataStageIdx(x)];
        return `<button type="button" class="mpk-dpb-row" onclick='strataGo(${JSON.stringify(String(x.bid))})'>
          <div class="mpk-dpb-row-t"><b>${strataEsc(x.no)}</b><span class="strata-badge" style="--c:${st.color}">${st.label}</span></div>
          <div class="mpk-dpb-row-l">${strataEsc(x.nama)}</div>
          <div class="mpk-dpb-row-m">${[x.bld.plus_code, mpkNum(x.parcels.length) + ' parcels', mpkNum(strataShareUnits(x.parcels, x.kompleks).total) + ' share units'].map(strataEsc).join(' · ')}</div>
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
    <div class="mpk-note">Steps follow the Strata Titles Act 1985 (Act 318), the Strata Management Act 2013 (Act 757) and JKPTG's guidance; the share-unit
      weightages are those of Act 757's First Schedule. Assessment rates, rents, the maintenance rate and capital works are assumptions.
      Saved in this browser only (Export / Import moves it).</div>`;
}

// ---------- Workspace ----------
function strataNewScheme(bid) {
  const f = strataBuilding(bid);
  if (!f) return null;
  const p = f.properties, now = new Date().toISOString();
  const floors = strataNum(p.tingkat_est) || '', h = strataNum(p.tinggi_m) || '';
  return strataNormalise({ bid: String(bid), no: strataNextNo(Object.values(STRATA.s.schemes).map(x => x.no), 'STR', new Date().getFullYear()),
    nama: 'Skim strata ' + p.plus_code, pemaju: '', hakmilik_induk: '', alamat: '', mukim: 'Mukim Kemaman', created: now, updated: now,
    bld: { plus_code: p.plus_code, kawasan: p.kawasan || '', lot: p.lot || '', upi: p.upi || '', area_m2: p.area_m2, lng: p.lng, lat: p.lat },
    bim: { tingkat: floors ? String(floors) : '', tinggi: h ? String(h) : '', lod: floors ? 200 : 100, disahkan: false, src: p.tinggi_src || '' },
    syarat: { sempadan: !!p.lot }, parcels: [], common: '', app: { stage: 'draf', docs: {} }, urus: {}, caj: { kadar: '0.30' }, bills: {} });
}
function strataOpen(bid) {
  const s = STRATA.s;
  if (!s.schemes[bid]) {
    const sc = strataNewScheme(bid);
    if (!sc) { showToast('⚠️ Building not found'); return; }
    s.schemes[bid] = sc;
    strataSave();
    showToast('🏢 ' + sc.no + ' started' + (sc.bim.tingkat ? ` · ${sc.bim.tingkat} floors from the building heights` : ''));
    addActivityLog('Strata scheme started', sc.no + ' · ' + sc.bld.plus_code);
    STRATA.step = 1;
  }
  STRATA.cur = String(bid);
  STRATA.whatif = null;
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
  strataChanged(false);
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
}
function strataBackToMap() {
  const sc = STRATA.s.schemes[STRATA.cur];
  strataCloseWs();
  if (sc && sc.bld.lng != null) map.flyTo({ center: [sc.bld.lng, sc.bld.lat], zoom: 18.3, pitch: 58, bearing: -20, duration: 1200 });
}
function strataStep(n) { STRATA.step = n; strataRenderWs(); const ws = document.getElementById('strata-ws'); if (ws) ws.scrollTop = 0; }
const strataSc = () => STRATA.s.schemes[STRATA.cur];
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
function strataF(path, v) {
  const sc = strataSc(), keys = path.split('.');
  let o = sc;
  keys.slice(0, -1).forEach(k => { o = o[k] = o[k] || {}; });
  o[keys[keys.length - 1]] = v;
  if (path.startsWith('bim.') && path !== 'bim.lod') {
    const f = strataBuilding(sc.bid), sug = strataLodSuggest(f ? f.properties : {}, sc.bim);
    if (!sc.bim.lodPicked || sc.bim.lod < sug) sc.bim.lod = sug;
  }
  strataChanged(true);
}
function strataP(i, k, v) { strataSc().parcels[i][k] = v; strataChanged(true); }
function strataG(path, v) { const [a, b] = path.split('.'); STRATA.s[a][b] = strataNum(v); strataChanged(true); }

const STRATA_STEP_NAMES = ['Building & conditions', 'Parcels & 3D', 'Share units', 'Strata title', 'Management & tax', 'PDF report'];
function strataRenderWs() {
  const ws = document.getElementById('strata-ws'), sc = strataSc();
  if (!ws || !sc || ws.hidden) return;
  const st = STRATA_STAGES[strataStageIdx(sc)];
  const syaratOk = STRATA_SYARAT.every(([k]) => sc.syarat[k]);
  const done = [syaratOk, sc.parcels.length > 0, !!(sc.app.d_cob && sc.app.d_sifus), sc.app.stage === 'hakmilik', !!sc.urus.d_jmb || Object.keys(sc.bills).length > 0, false];
  const body = [strataStep1, strataStep2, strataStep3, strataStep4, strataStep5, strataStep6][STRATA.step - 1](sc);
  ws.innerHTML = `<div class="mpk-stats-inner strata-inner">
    <div class="strata-ws-head">
      <button type="button" class="mpk-btn ghost" onclick="strataBackToMap()">← Map</button>
      <div class="strata-ws-t"><h2>${strataEsc(sc.no)} · ${strataEsc(sc.nama)}</h2>
        <p>${[sc.bld.plus_code, (MPK_AREAS[sc.bld.kawasan] || {}).short || 'Outside the study areas', sc.bld.lot ? 'Lot ' + sc.bld.lot : '', mpkNum(sc.bld.area_m2) + ' m² footprint',
          sc.bim.tingkat ? sc.bim.tingkat + ' floors' : ''].filter(Boolean).map(strataEsc).join(' · ')}</p></div>
      <button type="button" class="mpk-btn" onclick="strataPdf()">⬇ PDF</button>
      <span class="strata-badge big" style="--c:${st.color}">${st.label}</span>
    </div>
    <nav class="strata-steps" aria-label="Steps">${STRATA_STEP_NAMES.map((n, i) => `<button type="button" class="${STRATA.step === i + 1 ? 'on' : ''}${done[i] ? ' done' : ''}"
      ${STRATA.step === i + 1 ? 'aria-current="step"' : ''} onclick="strataStep(${i + 1})"><i>${done[i] && STRATA.step !== i + 1 ? '✓' : i + 1}</i>${n}</button>`).join('')}</nav>
    <div class="strata-body">${body}</div>
    <div class="strata-ws-foot">
      ${STRATA.step > 1 ? `<button type="button" class="mpk-dpb-b ghost" onclick="strataStep(${STRATA.step - 1})">← ${STRATA_STEP_NAMES[STRATA.step - 2]}</button>` : ''}
      <span class="mpk-dpb-spacer"></span><span class="strata-saved">Saved automatically</span>
      ${STRATA.step < 6 ? `<button type="button" class="mpk-dpb-b primary" onclick="strataStep(${STRATA.step + 1})">${STRATA_STEP_NAMES[STRATA.step]} →</button>` : ''}
    </div>
  </div>`;
}
const sIn = (key, val, attrs = '') => `<input data-key="${key}" value="${strataEsc(val)}" ${attrs} onchange="strataF('${key}', this.value)">`;
const sDate = (key, val) => `<input type="date" data-key="${key}" value="${strataEsc(val)}" onchange="strataF('${key}', this.value)">`;
const sSel = (key, val, opts) => `<select data-key="${key}" onchange="strataF('${key}', this.value)">${Object.entries(opts).map(([k, l]) =>
  `<option value="${k}"${k === val ? ' selected' : ''}>${strataEsc(Array.isArray(l) ? l[0] : l)}</option>`).join('')}</select>`;

// 1 · building and the JKPTG conditions
function strataStep1(sc) {
  const f = strataBuilding(sc.bid), p = f ? f.properties : {};
  const row = (k, v) => `<tr><th>${k}</th><td>${v}</td></tr>`;
  const ok = STRATA_SYARAT.filter(([k]) => sc.syarat[k]).length;
  return `<div class="strata-grid2">
    <div>
    <section class="mpk-h-card"><h4>Scheme and master title</h4>
      <div class="mpk-h-form flat">
        <label class="wide">Scheme name${sIn('nama', sc.nama)}</label>
        <label class="wide">Proprietor / developer (tuan punya / pemaju)${sIn('pemaju', sc.pemaju, 'placeholder="e.g. Syarikat Pemaju Sdn Bhd"')}</label>
        <label>Master title (hakmilik induk)${sIn('hakmilik_induk', sc.hakmilik_induk, 'placeholder="e.g. GRN 12345"')}</label>
        <label>Mukim${sIn('mukim', sc.mukim)}</label>
        <label class="wide">Address${sIn('alamat', sc.alamat, 'placeholder="No., jalan, Chukai, Kemaman"')}</label>
        <label>Tenure${sSel('tempoh', sc.tempoh || 'Kekal', { Kekal: 'Pegangan kekal (freehold)', Pajakan: 'Pajakan (leasehold)' })}</label>
        <label>Lease years left${sIn('baki_pajakan', sc.baki_pajakan, 'type="number" min="0" placeholder="leasehold only"')}</label>
        <label class="wide">Type of application${sSel('jenis_pecah', sc.jenis_pecah, STRATA_PECAH)}</label>
      </div>
      <div class="strata-row-btns">
        <button type="button" class="mpk-btn ghost" onclick="strataBackToMap()">Show the building on the map</button>
        <button type="button" class="mpk-dpb-b danger-ghost" onclick="strataDelete()">Delete scheme</button>
      </div>
    </section>
    </div>
    <div>
    <section class="mpk-h-card"><h4>Conditions for strata titles <small>(JKPTG)</small></h4>
      ${STRATA_SYARAT.map(([k, l]) => `<label class="strata-doc"><input type="checkbox" ${sc.syarat[k] ? 'checked' : ''} onchange="strataF('syarat.${k}', this.checked)">${l}</label>`).join('')}
      <div class="strata-meter"><i style="width:${ok / STRATA_SYARAT.length * 100}%"></i></div>
      <div class="mpk-h-hint">${ok} of ${STRATA_SYARAT.length} met${ok === STRATA_SYARAT.length ? ': ready to prepare the parcels and share units.' : '. Settle the rest first (e.g. discharge a charge, convert a qualified title).'}
        ${sc.tempoh === 'Pajakan' && strataNum(sc.baki_pajakan) && strataNum(sc.baki_pajakan) < 21 ? '<br><b class="strata-bad">Less than 21 years of lease left.</b>' : ''}</div>
    </section>
    <section class="mpk-h-card"><h4>The building on the map</h4>
      <table class="strata-facts">${row('Plus Code', strataEsc(sc.bld.plus_code))}${row('Area', strataEsc((MPK_AREAS[sc.bld.kawasan] || {}).short || 'Outside the study areas'))}
        ${row('Cadastral lot', strataEsc(sc.bld.lot || 'none on the lot map') + (sc.bld.upi ? ' · UPI ' + strataEsc(sc.bld.upi) : ''))}${row('Footprint', mpkNum(sc.bld.area_m2) + ' m²')}
        ${p.tinggi_m ? row('Height', `${p.tinggi_m} m · ${p.tingkat_est} floors (${strataEsc(p.tinggi_src)})`) : ''}
        ${p.kawasan ? row('MPK status', MPK_STATUS[mpkStatus(p, MPK.settings)].label) : ''}
        ${p.pelan_fail ? row('Approved building plan', strataEsc(p.pelan_fail) + (p.pelan_tarikh ? ' · ' + mpkPlanDateLabel(p.pelan_tarikh) : '')) : ''}
        ${row('Scheme started', mpkPlanDateLabel(sc.created.slice(0, 10)))}</table>
      ${p.kawasan && mpkStatus(p, MPK.settings) === 'suspected' ? `<div class="strata-warn">On MPK's illegal list: without an approved building and its CCC the building cannot be subdivided.</div>` : ''}
    </section>
    </div></div>`;
}

// 2 · parcels, accessory parcels, common property, floor stack and BIM
function strataStep2(sc) {
  const f = strataBuilding(sc.bid), p = f ? f.properties : {};
  const sug = strataLodSuggest(p, sc.bim);
  const floors = Math.max(1, Math.floor(strataNum(sc.bim.tingkat) || Math.max(1, ...sc.parcels.map(x => strataNum(x.tingkat)))));
  const common = strataCommon(sc);
  const pIn = (i, k, v) => `<input data-key="p${i}.${k}" value="${strataEsc(v)}" onchange="strataP(${i}, '${k}', this.value)">`;
  const pSel = (i, k, v, opts) => `<select data-key="p${i}.${k}" onchange="strataP(${i}, '${k}', this.value)">${Object.entries(opts).map(([o, l]) =>
    `<option value="${o}"${o === v ? ' selected' : ''}>${strataEsc(l[0])}</option>`).join('')}</select>`;
  const stack = [];
  for (let fl = floors; fl >= 1; fl--) {
    const on = sc.parcels.filter(x => Math.floor(strataNum(x.tingkat)) === fl);
    const used = on.reduce((a, x) => a + strataNum(x.luas), 0), rest = Math.max(0, strataNum(sc.bld.area_m2) - used);
    stack.push(`<div class="strata-floor"><span class="strata-fl">Floor ${fl}</span><div class="strata-cells">
      ${on.map(x => `<span class="strata-cell" style="flex:${Math.max(strataNum(x.luas), 1)};background:${STRATA_TYPE_COLOR[x.jenis] || '#90A4AE'}" title="${strataEsc(x.petak)} · ${strataEsc(x.luas)} m² · ${strataEsc((STRATA_WF1[x.jenis] || [''])[0])}">${strataEsc(x.petak)}</span>`).join('')}
      ${rest > 0.5 ? `<span class="strata-cell common" style="flex:${rest}" title="Common property ${mpkNum(rest)} m²"></span>` : ''}</div></div>`);
  }
  const acc = sc.parcels.filter(x => x.aks_no);
  const types = [...new Set(sc.parcels.map(x => x.jenis))];
  return `<section class="mpk-h-card"><h4>Building model <small>· BIM level of development</small></h4>
      <div class="mpk-h-row">
        <label>Floors<input type="number" min="1" step="1" data-key="bim.tingkat" value="${strataEsc(sc.bim.tingkat)}" onchange="strataF('bim.tingkat', this.value)"></label>
        <label>Height (m)<input type="number" min="0" step="0.1" data-key="bim.tinggi" value="${strataEsc(sc.bim.tinggi)}" placeholder="${STRATA_FLOOR_M} m a floor" onchange="strataF('bim.tinggi', this.value)"></label>
        <label class="mpk-h-check"><input type="checkbox" data-key="bim.disahkan" ${sc.bim.disahkan ? 'checked' : ''} onchange="strataF('bim.disahkan', this.checked)">Verified on site (as-built)</label>
        <button type="button" class="mpk-btn${STRATA.xray ? '' : ' ghost'}" onclick="strataXray()">${STRATA.xray ? 'Hide' : 'Show'} floor X-ray on the map</button>
      </div>
      ${p.tinggi_m ? `<div class="mpk-h-hint" style="margin:-4px 0 8px">Auto from the building heights: <b>${p.tinggi_m} m · ${p.tingkat_est} floors</b> (${strataEsc(p.tinggi_src)}). Change it if the site shows otherwise.</div>` : ''}
      <div class="mpk-h-lods">${STRATA_LOD.map(l => `<button type="button" class="mpk-h-lod${sc.bim.lod === l.v ? ' on' : ''}" style="--c:${l.color}" aria-pressed="${sc.bim.lod === l.v}" onclick="strataLod(${l.v})">
        <b>LOD ${l.v}</b><span>${l.name}</span><small>${l.text}</small></button>`).join('')}</div>
      <div class="mpk-h-hint">Suggested from the record: <b>LOD ${sug}</b>. Height on the map: <b>${Math.round(strataHeight(sc.bim) * 10) / 10} m</b>.</div>
    </section>
    <div class="strata-col">
      <section class="mpk-h-card"><h4>Parcels <small>(petak), accessory parcels and common property</small></h4>
        <div class="mpk-h-row gen">
          <span>Create:</span>
          <label>Scheme type${sSel('kompleks.jenis', sc.kompleks.jenis, STRATA_SCHEME_TYPES)}</label>
          <label>Floors<input type="number" min="1" id="strata-gf" value="${strataEsc(sc.bim.tingkat || 1)}"></label>
          <label>Parcels / floor<input type="number" min="1" id="strata-gu" value="${sc.parcels.length ? Math.max(1, Math.round(sc.parcels.length / floors)) : 2}"></label>
          <button type="button" class="mpk-btn" onclick="strataGen()">Create</button>
          <button type="button" class="mpk-btn ghost" onclick="strataAdd()">+ One parcel</button>
        </div>
        <div class="mpk-h-tablewrap"><table class="mpk-h-t">
          <thead><tr><th>Petak</th><th>Floor</th><th>Area m²</th><th>Type (WF1)</th><th>Whole floor (WF2)</th><th>Owner</th><th>Accessory</th><th>Acc. m²</th><th>Acc. where (WF3)</th><th></th></tr></thead>
          <tbody>${sc.parcels.length ? sc.parcels.map((x, i) => `<tr>
            <td>${pIn(i, 'petak', x.petak)}</td><td class="n">${pIn(i, 'tingkat', x.tingkat)}</td><td class="n">${pIn(i, 'luas', x.luas)}</td>
            <td>${pSel(i, 'jenis', x.jenis, STRATA_WF1)}</td><td>${pSel(i, 'wf2', x.wf2, STRATA_WF2)}</td>
            <td>${pIn(i, 'pemilik', x.pemilik)}</td><td>${pIn(i, 'aks_no', x.aks_no)}</td><td class="n">${pIn(i, 'aks_luas', x.aks_luas)}</td>
            <td>${pSel(i, 'aks_lokasi', x.aks_lokasi, STRATA_WF3)}</td>
            <td><button type="button" class="mpk-h-del" onclick="strataDel(${i})" aria-label="Remove parcel">×</button></td></tr>`).join('')
            : '<tr><td colspan="10" class="mpk-h-empty">No parcels yet: pick the scheme type and create them above.</td></tr>'}</tbody>
        </table></div>
        <div class="mpk-h-row" style="margin-top:10px">
          <label>Common property m² (harta bersama)<input type="number" min="0" data-key="common" value="${strataEsc(sc.common)}" placeholder="${mpkNum(common)}" onchange="strataF('common', this.value)"></label>
          <span class="mpk-h-hint" style="margin:0">Empty: footprint × floors less the parcels. New parcels take ${Math.round(STRATA_NET * 100)}% of a floor. Accessory parcels (car bays, store rooms,
            roof or garden areas) belong to a parcel and cannot be sold apart from it.</span>
        </div>
      </section>
      <section class="mpk-h-card"><h4>Floor stack</h4>
        <div class="strata-stack">${stack.join('')}<div class="strata-ground"></div></div>
        <div class="strata-legend small">${types.map(t => `<span><i style="background:${STRATA_TYPE_COLOR[t]}"></i>${strataEsc(STRATA_WF1[t][0])}</span>`).join('')}<span><i class="common"></i>Common property</span></div>
        ${acc.length ? `<div class="mpk-h-hint">Accessory parcels: ${acc.map(x => strataEsc(x.aks_no) + ' → ' + strataEsc(x.petak)).join(', ')}</div>` : ''}
      </section>
    </div>`;
}
function strataLod(v) { const sc = strataSc(); sc.bim.lod = v; sc.bim.lodPicked = true; strataChanged(true); }
function strataGen() {
  const sc = strataSc();
  const ps = strataGenParcels(document.getElementById('strata-gf').value, document.getElementById('strata-gu').value, sc.bld.area_m2, sc.kompleks.jenis);
  if (sc.parcels.length && !confirm(`Replace the ${sc.parcels.length} parcels with ${ps.length} new ones?`)) return;
  sc.parcels = ps.map((x, i) => ({ ...x, id: Date.now().toString(36) + i }));
  strataF('bim.tingkat', sc.bim.tingkat || document.getElementById('strata-gf').value);
}
function strataAdd() {
  const sc = strataSc(), base = strataGenParcels(1, 1, sc.bld.area_m2, sc.kompleks.jenis)[0];
  sc.parcels.push({ ...base, id: Date.now().toString(36), petak: 'M1-' + String(sc.parcels.length + 1).padStart(2, '0'), luas: '' });
  strataChanged(true);
}
function strataDel(i) { strataSc().parcels.splice(i, 1); strataChanged(true); }
function strataXray() {
  STRATA.xray = !STRATA.xray;
  strataLayers();
  if (STRATA.xray) { strataBackToMap(); showToast('Floor X-ray: each floor floats apart, coloured by its main parcel type'); }
  else strataRenderWs();
}

// 3 · share units (Act 757 First Schedule), schedule of parcels with the COB, SiFUS
function strataStep3(sc) {
  const r = strataShareUnits(sc.parcels, sc.kompleks);
  const w = STRATA.whatif;
  const alt = w ? strataShareUnits(sc.parcels.map(p => ({ ...p, wf2: w.wf2 === 'asal' ? p.wf2 : w.wf2 })), { ...sc.kompleks, aircond: w.aircond, lif: w.lif }) : null;
  const k = strataNum(sc.caj.kadar);
  return `<div class="strata-grid2 wide-right">
    <div>
    <section class="mpk-h-card"><h4>Complex <small>(WF1 columns)</small></h4>
      <label class="strata-doc"><input type="checkbox" ${sc.kompleks.aircond ? 'checked' : ''} onchange="strataF('kompleks.aircond', this.checked)">Air-conditioned corridors, lobbies and foyers</label>
      <label class="strata-doc"><input type="checkbox" ${sc.kompleks.lif ? 'checked' : ''} onchange="strataF('kompleks.lif', this.checked)">Common lift / escalator</label>
      <div class="mpk-h-hint">Allocated share units = (area of parcel × WF1 × WF2) + (area of accessory parcel × WF3), in m², rounded to the nearest whole number
        (Act 757, First Schedule, para 2). WF1 from Table 1 by parcel type, WF2 from Table 2 (whole floor parcels; not for simple shop-houses), WF3 from Table 3
        (0.25 outside the building, 0.5 within).</div>
    </section>
    <section class="mpk-h-card"><h4>Filing</h4>
      <div class="mpk-h-form flat">
        <label>SiFUS approved (PTG)${sDate('app.d_sifus', sc.app.d_sifus)}</label>
        <label>SiFUS no.${sIn('app.no_sifus', sc.app.no_sifus)}</label>
        <label>Schedule filed with COB${sDate('app.d_cob', sc.app.d_cob)}</label>
        <label>COB reference${sIn('app.no_cob', sc.app.no_cob)}</label>
      </div>
      <div class="mpk-h-hint">No parcel may be sold until the schedule of parcels, with its location, storey and delineation plans and the surveyor's and architect's
        certificates, is filed with the Commissioner of Buildings (Act 757 s.6). Its share units hold until the Director approves them (Act 318 s.18).</div>
    </section>
    <section class="mpk-h-card"><h4>What-if <small>· tool 4</small></h4>
      ${w ? `<label class="strata-doc"><input type="checkbox" ${w.aircond ? 'checked' : ''} onchange="strataWhatif('aircond', this.checked)">Air-conditioned common areas</label>
        <label class="strata-doc"><input type="checkbox" ${w.lif ? 'checked' : ''} onchange="strataWhatif('lif', this.checked)">Common lift / escalator</label>
        <label class="strata-doc">Whole floors <select onchange="strataWhatif('wf2', this.value)"><option value="asal"${w.wf2 === 'asal' ? ' selected' : ''}>as entered</option>
          ${Object.entries(STRATA_WF2).map(([o, l]) => `<option value="${o}"${w.wf2 === o ? ' selected' : ''}>${l[0]}</option>`).join('')}</select></label>
        <button type="button" class="mpk-btn ghost" onclick="STRATA.whatif = null; strataRenderWs()">Close what-if</button>`
        : `<div class="mpk-h-hint" style="margin-top:0">See how air-con, a lift or whole floors would move every parcel's share units and Charges, without changing the scheme.</div>
        <button type="button" class="mpk-btn" onclick="strataWhatif()">Try a what-if</button>`}
    </section>
    </div>
    <section class="mpk-h-card"><h4>Schedule of parcels <small>· allocated share units (unit syer)</small></h4>
      ${sc.parcels.length ? `<div class="mpk-h-tablewrap"><table class="mpk-h-t">
        <thead><tr><th>Petak</th><th>Floor</th><th>Type</th><th class="r">Area</th><th class="r">WF1</th><th class="r">WF2</th><th class="r">Acc. m²</th><th class="r">WF3</th>
          <th class="r">Share units</th><th class="r">%</th>${alt ? '<th class="r">What-if</th><th class="r">Charges / mo</th>' : ''}</tr></thead>
        <tbody>${sc.parcels.map((x, i) => { const d = alt ? alt.su[i] - r.su[i] : 0;
          return `<tr><td><b>${strataEsc(x.petak)}</b></td><td>${strataEsc(x.tingkat)}</td><td>${strataEsc((STRATA_WF1[x.jenis] || [''])[0])}</td>
          <td class="r">${strataEsc(x.luas)}</td><td class="r">${r.rows[i].wf1.toFixed(2)}</td><td class="r">${r.rows[i].wf2.toFixed(2)}</td>
          <td class="r">${strataEsc(x.aks_luas) || '—'}</td><td class="r">${r.rows[i].wf3 ? r.rows[i].wf3.toFixed(2) : '—'}</td>
          <td class="r"><b>${mpkNum(r.su[i])}</b></td><td class="r">${r.pct[i].toFixed(2)}</td>
          ${alt ? `<td class="r">${mpkNum(alt.su[i])} <small class="${d > 0 ? 'up' : d < 0 ? 'down' : ''}">${d > 0 ? '+' : ''}${d || ''}</small></td>
            <td class="r">${strataRM0(strataCharges(r.su[i], k).caj)} → <b>${strataRM0(strataCharges(alt.su[i], k).caj)}</b></td>` : ''}</tr>`; }).join('')}</tbody>
        <tfoot><tr><td colspan="8">Total</td><td>${mpkNum(r.total)}</td><td>100.00</td>${alt ? `<td>${mpkNum(alt.total)}</td><td></td>` : ''}</tr></tfoot></table></div>
        <div class="mpk-h-hint">Common property (${mpkNum(strataCommon(sc))} m²) carries no share units: it is held by the management corporation for all proprietors.
          Charges and votes follow the share units.</div>`
        : '<div class="mpk-reg-empty">Create the parcels in step 2 first.</div>'}
    </section></div>`;
}
function strataWhatif(k, v) {
  const sc = strataSc();
  if (!STRATA.whatif) STRATA.whatif = { aircond: !sc.kompleks.aircond, lif: sc.kompleks.lif, wf2: 'asal' };
  if (k) STRATA.whatif[k] = v;
  strataRenderWs();
}

// 4 · SiFUS → CPSP → subdivision → strata titles, with the deadlines
function strataStep4(sc) {
  const idx = strataStageIdx(sc), dl = strataDeadlines(sc, strataToday());
  const docs = sc.app.docs || {};
  const fields = {
    sifus: `<label>SiFUS approved${sDate('app.d_sifus', sc.app.d_sifus)}</label><label>Schedule filed with COB${sDate('app.d_cob', sc.app.d_cob)}</label>`,
    cpsp: `<label>Building completed (CCC)${sDate('app.d_siap', sc.app.d_siap)}</label><label>CPSP applied${sDate('app.d_cpsp_mohon', sc.app.d_cpsp_mohon)}</label>
      <label>CPSP approved${sDate('app.d_cpsp', sc.app.d_cpsp)}</label>`,
    pecah: `<label>Applied to PTG${sDate('app.d_pecah', sc.app.d_pecah)}</label><label>PTG file no.${sIn('app.fail_ptg', sc.app.fail_ptg)}</label>`,
    hakmilik: `<label>Titles registered${sDate('app.d_hakmilik', sc.app.d_hakmilik)}</label>
      <label>Strata titles issued${sIn('app.n_hakmilik', sc.app.n_hakmilik, `type="number" min="0" placeholder="${sc.parcels.length}"`)}</label>`,
  };
  const badge = d => `<span class="strata-dl ${d.status}">${d.label}: ${d.status === 'na' ? 'not started' : d.done ? 'done ' + strataDate(d.done) : 'due ' + strataDate(d.due)} · ${d.note}</span>`;
  return `<div class="strata-grid2 wide-left">
    <section class="mpk-h-card"><h4>Application for strata titles</h4>
      <ol class="strata-timeline">${STRATA_STAGES.map((st, i) => `<li class="${i < idx ? 'done' : i === idx ? 'now' : ''}" style="--c:${st.color}">
        <i>${i < idx ? '✓' : i + 1}</i><div><b>${st.label}</b><span>${st.ms}</span>
        ${fields[st.k] ? `<div class="strata-tl-f">${fields[st.k]}</div>` : ''}
        ${st.k === 'cpsp' ? badge(dl[0]) : st.k === 'pecah' ? badge(dl[1]) : ''}</div></li>`).join('')}</ol>
      <div class="strata-row-btns">
        ${idx > 0 ? `<button type="button" class="mpk-dpb-b ghost" onclick="strataAdvance(-1)">← Back to ${STRATA_STAGES[idx - 1].label}</button>` : ''}
        ${idx < STRATA_STAGES.length - 1 ? `<button type="button" class="mpk-dpb-b primary" onclick="strataAdvance(1)">Mark: ${STRATA_STAGES[idx + 1].label}</button>`
          : '<span class="strata-ok">✓ Strata register opened: the management corporation exists</span>'}
      </div>
      <div class="mpk-h-hint">JKPTG: apply for the CPSP within 3 months of the building's completion and for subdivision within 1 month of the CPSP's approval
        (each with 1 month's extension on application). The Land Administrator then registers a strata title for each parcel (Act 318).</div>
    </section>
    <div>
      <section class="mpk-h-card"><h4>Documents</h4>
        ${STRATA_DOCS.map(([k, l]) => `<label class="strata-doc"><input type="checkbox" ${docs[k] ? 'checked' : ''} onchange="strataF('app.docs.${k}', this.checked)">${l}</label>`).join('')}
        <div class="strata-meter"><i style="width:${STRATA_DOCS.filter(([k]) => docs[k]).length / STRATA_DOCS.length * 100}%"></i></div>
        <div class="mpk-h-hint">${STRATA_DOCS.filter(([k]) => docs[k]).length} of ${STRATA_DOCS.length} ready</div>
      </section>
    </div></div>`;
}
function strataAdvance(d) {
  const sc = strataSc(), i = Math.max(0, Math.min(STRATA_STAGES.length - 1, strataStageIdx(sc) + d));
  sc.app.stage = STRATA_STAGES[i].k;
  const key = { sifus: 'd_sifus', cpsp: 'd_cpsp', pecah: 'd_pecah', hakmilik: 'd_hakmilik' }[sc.app.stage];
  if (d > 0 && key && !sc.app[key]) sc.app[key] = strataToday();
  if (sc.app.stage === 'hakmilik' && !sc.urus.d_mc) sc.urus.d_mc = sc.app.d_hakmilik;
  showToast(`${sc.no}: ${STRATA_STAGES[i].label}`);
  strataChanged(true);
}

// 5 · JMB / MC, Charges and sinking fund, assessment tax
function strataStep5(sc) {
  const s = STRATA.s, y = STRATA.year, r = strataShareUnits(sc.parcels, sc.kompleks);
  const bills = sc.bills[y] || {}, c = strataCollection(sc.bills, y), dl = strataDeadlines(sc, strataToday())[2];
  const body = sc.app.stage === 'hakmilik' ? 'Management corporation (MC)' : sc.urus.d_jmb ? 'Joint management body (JMB)' : 'Developer (management period)';
  let tTax = 0, tCaj = 0, tSink = 0;
  const rows = sc.parcels.map((x, i) => {
    const tax = strataTax(x, s), ch = strataCharges(r.su[i], sc.caj.kadar), b = bills[x.id];
    tTax += tax; tCaj += ch.caj; tSink += ch.sinking;
    const est = strataAnnualValue(x.luas, s.sewa[strataUse(x)]);
    return `<tr><td><b>${strataEsc(x.petak)}</b></td><td>${strataEsc(x.pemilik) || '—'}</td><td class="r">${mpkNum(r.su[i])}</td>
      <td class="n"><input data-key="p${i}.nilai" value="${strataEsc(x.nilai)}" placeholder="${est ? est.toLocaleString('en-MY') : ''}" onchange="strataP(${i}, 'nilai', this.value)"></td>
      <td class="r">${strataRM0(tax)}</td><td class="r">${strataRM0(ch.caj)}</td><td class="r">${strataRM0(ch.sinking)}</td>
      ${b ? ['p1', 'p2'].map(h => `<td><button type="button" class="mpk-h-pay${b[h] ? ' paid' : ''}" onclick='strataPay(${JSON.stringify(x.id)}, "${h}")'>${b[h] ? '✓ ' + mpkPlanDateLabel(b[h]) : 'Unpaid'}</button></td>`).join('') : '<td colspan="2" class="mpk-h-empty">no bill</td>'}</tr>`;
  }).join('');
  const kIn = (path, v) => `<input type="number" min="0" step="0.5" data-key="${path}" value="${v}" onchange="strataG('${path}', this.value)">`;
  return `<div class="strata-grid2">
    <section class="mpk-h-card"><h4>Managing body <small>(Act 757)</small></h4>
      <div class="strata-body-now">Now: <b>${body}</b></div>
      <div class="mpk-h-form flat">
        <label>Vacant possession delivered${sDate('urus.d_vp', sc.urus.d_vp)}</label>
        <label>First AGM of the JMB held${sDate('urus.d_jmb', sc.urus.d_jmb)}</label>
        <label class="wide">JMB name${sIn('urus.nama_jmb', sc.urus.nama_jmb, 'placeholder="Badan Pengurusan Bersama ..."')}</label>
        <label>MC in existence (strata register opened)${sDate('urus.d_mc', sc.urus.d_mc)}</label>
        <label>MC name${sIn('urus.nama_mc', sc.urus.nama_mc, 'placeholder="Perbadanan Pengurusan ..."')}</label>
      </div>
      <span class="strata-dl ${dl.status}">${dl.label}: ${dl.status === 'na' ? 'enter the vacant possession date' : dl.done ? 'held ' + strataDate(dl.done) : 'due ' + strataDate(dl.due)} · ${dl.note}</span>
      <div class="mpk-h-hint">The JMB comes into being at its first AGM, which the developer must convene within 12 months of delivering vacant possession
        (s.17–18). The MC comes into existence when the strata register is opened, and takes over the JMB's funds.</div>
    </section>
    <section class="mpk-h-card"><h4>Charges and sinking fund</h4>
      <div class="mpk-h-row">
        <label>Charges (RM per share unit / month)<input type="number" min="0" step="0.01" data-key="caj.kadar" value="${strataEsc(sc.caj.kadar)}" onchange="strataF('caj.kadar', this.value)"></label>
      </div>
      <div class="mpk-h-kpis">
        <div class="mpk-h-kpi"><b>${strataRM(tCaj)}</b><span>Charges a month (all parcels)</span></div>
        <div class="mpk-h-kpi"><b>${strataRM(tSink)}</b><span>sinking fund a month (10 %)</span></div>
      </div>
      <div class="mpk-h-hint">Charges are set by the JMB in proportion to the allocated share units (s.25(3)); the sinking fund is 10 % of the Charges unless the
        body decides otherwise (s.25(4)). The developer pays for unsold parcels.</div>
      <div class="strata-row-btns"><button type="button" class="mpk-btn ghost" onclick="strataTool('sinking')">Sinking fund forecast</button>
        <button type="button" class="mpk-btn ghost" onclick="strataTool('undi')">AGM vote by share units</button></div>
    </section></div>
    <section class="mpk-h-card"><h4>Assessment tax to MPK <small>(cukai taksiran, per parcel)</small></h4>
      <div class="mpk-h-row">
        <label>Year<select onchange="STRATA.year = +this.value; strataRenderWs()">${[...new Set([...Object.keys(sc.bills).map(Number), new Date().getFullYear()])].sort((a, b) => b - a)
          .map(v => `<option${v === y ? ' selected' : ''}>${v}</option>`).join('')}</select></label>
        <button type="button" class="mpk-btn" onclick="strataBills()">Generate ${y} assessment bills</button>
        <button type="button" class="mpk-btn ghost" onclick="strataTool('penyata')">Owner statements PDF</button>
      </div>
      ${sc.parcels.length ? `<div class="mpk-h-tablewrap"><table class="mpk-h-t bills">
        <thead><tr><th>Petak</th><th>Owner</th><th class="r">Share units</th><th>Annual value RM</th><th class="r">Tax / year</th><th class="r">Charges / mo</th><th class="r">Sinking / mo</th><th>Penggal 1</th><th>Penggal 2</th></tr></thead>
        <tbody>${rows}</tbody>
        <tfoot><tr><td colspan="4">Total</td><td>${strataRM0(tTax)}</td><td>${strataRM0(tCaj)}</td><td>${strataRM0(tSink)}</td><td colspan="2"></td></tr></tfoot></table></div>`
        : '<div class="mpk-reg-empty">Create the parcels in step 2 first.</div>'}
      <div class="mpk-h-kpis" style="margin-top:12px">
        <div class="mpk-h-kpi"><b>${strataRM(c.billed)}</b><span>${y} billed</span></div>
        <div class="mpk-h-kpi ok"><b>${strataRM(c.collected)}</b><span>collected · ${(c.rate * 100).toFixed(1)}%</span></div>
        <div class="mpk-h-kpi bad"><b>${strataRM(c.outstanding)}</b><span>outstanding</span></div>
      </div>
      <div class="mpk-h-hint">Tax = annual value × the rate of the parcel's use; an empty annual value is area × rent × 12. Paid in two halves (by end February and end August).</div>
      <details class="strata-rates"><summary>Assessment rates and rents <span class="mpk-tag">assumption</span> · all schemes</summary>
        <table class="mpk-h-t rates"><thead><tr><th>Use</th><th>Rate (% of annual value)</th><th>Rent for the estimate (RM / m² / month)</th></tr></thead>
          <tbody>${Object.keys(s.kadar).map(u => `<tr><td>${u}</td><td>${kIn('kadar.' + u, s.kadar[u])}</td><td>${kIn('sewa.' + u, s.sewa[u])}</td></tr>`).join('')}</tbody></table>
      </details>
    </section>`;
}
function strataBills() {
  const sc = strataSc(), s = STRATA.s, y = STRATA.year;
  if (!sc.parcels.length) { showToast('⚠️ No parcels yet'); return; }
  const b = sc.bills[y] = sc.bills[y] || {};
  let made = 0;
  for (const x of sc.parcels) {
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
  b[half] = b[half] ? null : strataToday();
  strataChanged(true);
}

// 6 · report
function strataStep6(sc) {
  const r = strataShareUnits(sc.parcels, sc.kompleks), dl = strataDeadlines(sc, strataToday());
  const okS = STRATA_SYARAT.filter(([k]) => sc.syarat[k]).length;
  const items = [['Scheme & building', `${sc.no} · ${sc.bld.plus_code} · lot ${sc.bld.lot || '—'}`], ['Conditions', `${okS} of ${STRATA_SYARAT.length} met`],
    ['Parcels', `${sc.parcels.length} parcels · ${mpkNum(r.total)} share units · ${mpkNum(strataCommon(sc))} m² common property`],
    ['Stage', STRATA_STAGES[strataStageIdx(sc)].label], ['Deadlines', dl.map(d => `${d.label}: ${d.note}`).join(' · ')],
    ['Management & tax', `${strataRM(sc.parcels.reduce((a, p) => a + strataTax(p, STRATA.s), 0))} assessment tax a year`]];
  return `<section class="mpk-h-card strata-report">
      <h4>Strata scheme report <small>· A4 PDF, in Bahasa Melayu</small></h4>
      <p class="mpk-h-hint" style="margin-top:0">For the proprietor, a buyer or MPK's own file: the scheme, the building and its height, the JKPTG conditions, the floor stack,
        the schedule of parcels with the Act 757 share units, the application stages and deadlines, the managing body, Charges, sinking fund and
        assessment tax of every parcel.</p>
      <table class="strata-facts">${items.map(([k, v]) => `<tr><th>${k}</th><td>${strataEsc(v)}</td></tr>`).join('')}</table>
      <div class="strata-row-btns">
        <button type="button" class="mpk-btn strata-big" onclick="strataPdf()">⬇ Download the PDF report</button>
        <button type="button" class="mpk-btn ghost" onclick="strataTool('pasport')">Parcel passports (QR)</button>
        <button type="button" class="mpk-btn ghost" onclick="strataTool('penyata')">Owner statements</button>
      </div>
    </section>`;
}

function strataDelete() {
  const sc = strataSc();
  if (!confirm(`Delete strata scheme ${sc.no} with its ${sc.parcels.length} parcels and bills?`)) return;
  delete STRATA.s.schemes[sc.bid];
  STRATA.cur = null;
  strataCloseWs();
  strataChanged(false);
  showToast('🗑️ ' + sc.no + ' deleted');
}

// ---------- Tools ----------
function strataToolShell(title, sub, body, wide) {
  let el = document.getElementById('strata-tool');
  if (!el) {
    el = document.createElement('div');
    el.id = 'strata-tool';
    el.className = 'mpk-dpb-overlay';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-labelledby', 'strata-tool-t');
    el.addEventListener('keydown', e => { if (e.key === 'Escape') strataCloseTool(); });
    document.body.appendChild(el);
  }
  el.innerHTML = `<div class="mpk-dpb-shell${wide ? '' : ' small'}">
    <div class="mpk-dpb-bar"><div class="mpk-dpb-bar-t"><div id="strata-tool-t">${title}</div><small>${sub}</small></div>
      <button type="button" class="mpk-dpb-x" onclick="strataCloseTool()" aria-label="Close">×</button></div>
    <div class="mpk-dpb-scroll strata-tool-body">${body}</div></div>`;
  el.hidden = false;
  el.querySelector('.mpk-dpb-x').focus();
}
function strataCloseTool() { const el = document.getElementById('strata-tool'); if (el) el.hidden = true; }
// The scheme a tool works on: the open one, else the latest
function strataToolScheme() {
  const s = STRATA.s;
  if (STRATA.cur && s.schemes[STRATA.cur]) return s.schemes[STRATA.cur];
  const all = Object.values(s.schemes).sort((a, b) => b.updated.localeCompare(a.updated));
  if (all[0]) { STRATA.cur = all[0].bid; return all[0]; }
  return null;
}
const strataPickHtml = sc => `<label class="strata-pick">Scheme <select onchange="STRATA.cur = this.value; strataTool(STRATA.lastTool)">${Object.values(STRATA.s.schemes)
  .map(x => `<option value="${strataEsc(x.bid)}"${x.bid === sc.bid ? ' selected' : ''}>${strataEsc(x.no)} · ${strataEsc(x.nama)}</option>`).join('')}</select></label>`;
function strataTool(k) {
  STRATA.lastTool = k;
  if (k === 'potensi') { strataCloseWs(); strataSetView('potensi'); strataPotentialList(); return; }
  if (k === 'tinggi') { strataCloseWs(); strataCloseTool(); strataSetView('tinggi'); showToast('Building heights in 3D: the study areas, coloured by estimated floors'); return; }
  if (k === 'radar') { strataRadar(); return; }
  if (k === 'saluran') { strataPipeline(); return; }
  const sc = strataToolScheme();
  if (!sc) { showToast('Start a strata scheme first: click a building on the map'); return; }
  if (k === 'xray') { strataCloseTool(); STRATA.cur = sc.bid; STRATA.xray = true; strataLayers(); strataBackToMap(); showToast('Floor X-ray: ' + sc.no); return; }
  if (k === 'whatif') { strataCloseTool(); STRATA.step = 3; strataGo(sc.bid); strataWhatif(); return; }
  if (k === 'undi') strataVoteTool(sc);
  if (k === 'sinking') strataSinkingTool(sc);
  if (k === 'pasport') strataPassports(sc);
  if (k === 'penyata') strataStatements(sc);
}

// Tool 1: strata potential, the 15 best candidates without a scheme
function strataPotentialList() {
  const s = STRATA.s;
  const top = MPK.data.buildings.features.map(f => ({ p: f.properties, sc: strataPotential(f.properties, mpkStatus(f.properties, MPK.settings)) }))
    .filter(x => !s.schemes[x.p.id]).sort((a, b) => b.sc - a.sc || b.p.area_m2 - a.p.area_m2).slice(0, 15);
  strataToolShell('Strata potential', 'Study areas · score 0 – 100 from storeys, footprint, approval and lot', `
    <div class="mpk-h-hint" style="margin-top:0">Storeys (2 floors and up: 30, +5 a floor up to 50) + footprint (150 m²: 10, 400 m²: 20) + approved by MPK (25) + on a cadastral lot (10);
      illegal buildings lose 40. The map now shows every building's score.</div>
    <div class="mpk-dpb-list" style="margin-top:10px">${top.map(({ p, sc }) => `<button type="button" class="mpk-dpb-row" onclick='strataCloseTool(); map.flyTo({ center: [${p.lng}, ${p.lat}], zoom: 18.2 }); strataPopup(${JSON.stringify(String(p.id))}, [${p.lng}, ${p.lat}])'>
      <div class="mpk-dpb-row-t"><b>${strataEsc(p.plus_code)}</b><span class="strata-score" style="--p:${sc}">${sc}</span></div>
      <div class="mpk-dpb-row-m">${[(MPK_AREAS[p.kawasan] || {}).short, p.tingkat_est ? p.tingkat_est + ' floors' : '', mpkNum(p.area_m2) + ' m²', p.lot ? 'Lot ' + p.lot : '', MPK_STATUS[mpkStatus(p, MPK.settings)].label].filter(Boolean).map(strataEsc).join(' · ')}</div>
    </button>`).join('')}</div>`);
}
// Tool 5: AGM vote by share units
function strataVoteTool(sc) {
  const r = strataShareUnits(sc.parcels, sc.kompleks), votes = sc.parcels.map(p => sc.votes[p.id] || '');
  const v = strataVote(r.su, votes);
  const pct = x => v.total ? (x / v.total * 100).toFixed(1) : '0.0';
  const res = (ok, name, rule) => `<div class="strata-res ${ok ? 'ok' : 'no'}"><b>${ok ? '✓ Passed' : '✗ Not passed'}</b><span>${name}</span><small>${rule}</small></div>`;
  strataToolShell('AGM vote by share units', `${strataEsc(sc.no)} · a poll counts share units, not heads`, `
    ${Object.keys(STRATA.s.schemes).length > 1 ? strataPickHtml(sc) : ''}
    <div class="strata-votebar"><i class="y" style="width:${pct(v.yes)}%"></i><i class="n" style="width:${pct(v.no)}%"></i></div>
    <div class="strata-ramp-l"><span><b>${mpkNum(v.yes)}</b> for (${pct(v.yes)}%)</span><span><b>${mpkNum(v.no)}</b> against (${pct(v.no)}%)</span><span>${mpkNum(v.abstain)} absent / abstain</span></div>
    <div class="strata-res3">${res(v.ordinary, 'Ordinary resolution', 'more for than against, of those voting')}${res(v.special, 'Special resolution', 'at least ¾ of the share units voting')}
      ${res(v.unanimous, 'Unanimous resolution', 'every share unit in favour')}</div>
    <div class="mpk-h-tablewrap" style="margin-top:10px"><table class="mpk-h-t"><thead><tr><th>Petak</th><th>Owner</th><th class="r">Share units</th><th>Vote</th></tr></thead>
      <tbody>${sc.parcels.map((p, i) => `<tr><td><b>${strataEsc(p.petak)}</b></td><td>${strataEsc(p.pemilik) || '—'}</td><td class="r">${mpkNum(r.su[i])}</td>
        <td><div class="strata-seg small">${[['ya', 'For'], ['tidak', 'Against'], ['', 'Absent']].map(([k, l]) =>
          `<button type="button" class="${votes[i] === k ? 'on' : ''}" onclick='strataCast(${JSON.stringify(p.id)}, "${k}")'>${l}</button>`).join('')}</div></td></tr>`).join('')}</tbody></table></div>
    <div class="strata-row-btns"><button type="button" class="mpk-btn ghost" onclick="strataCastAll('ya')">All for</button><button type="button" class="mpk-btn ghost" onclick="strataCastAll('')">Clear</button></div>
    <div class="mpk-h-hint">Simplified from Act 757: on a poll each proprietor votes with the share units of the parcel. Check quorum and proxies against the Act before a real meeting.</div>`, true);
}
function strataCast(pid, v) { const sc = strataToolScheme(); sc.votes[pid] = v; strataSave(); strataVoteTool(sc); }
function strataCastAll(v) { const sc = strataToolScheme(); sc.parcels.forEach(p => { sc.votes[p.id] = v; }); strataSave(); strataVoteTool(sc); }
// Tool 7: sinking fund forecast, 10 years
function strataSinkingTool(sc) {
  const r = strataShareUnits(sc.parcels, sc.kompleks), monthly = strataCharges(r.total, sc.caj.kadar).sinking;
  if (!sc.sf.capex.length) {
    const common = strataCommon(sc);
    sc.sf.capex = [{ tahun: 5, perkara: 'Cat semula bangunan (repaint)', kos: String(Math.round(common * 25)) },
      { tahun: 8, perkara: 'Kalis air bumbung (roof waterproofing)', kos: String(Math.round(strataNum(sc.bld.area_m2) * 60)) }];
    if (sc.kompleks.lif) sc.sf.capex.push({ tahun: 10, perkara: 'Naik taraf lif (lift modernisation)', kos: '250000' });
  }
  const rows = strataSinking(monthly, sc.sf.baki, sc.sf.capex, 10);
  const max = Math.max(1, ...rows.map(x => Math.abs(x.bal)), ...rows.map(x => x.spend));
  const W = 560, H = 190, bw = W / 10;
  const yOf = v => H / 2 - v / max * (H / 2 - 12);
  const bars = rows.map((x, i) => `<g><rect x="${i * bw + 8}" y="${Math.min(yOf(x.bal), H / 2)}" width="${bw - 16}" height="${Math.max(2, Math.abs(yOf(x.bal) - H / 2))}" rx="3"
      fill="${x.bal < 0 ? '#D93025' : '#00897B'}"><title>Year ${x.y}: balance ${strataRM(x.bal)}${x.spend ? ' after ' + strataRM(x.spend) + ' of works' : ''}</title></rect>
      ${x.spend ? `<circle cx="${i * bw + bw / 2}" cy="${yOf(-x.spend)}" r="4" fill="#E8772E"><title>Works ${strataRM(x.spend)}</title></circle>` : ''}
      <text x="${i * bw + bw / 2}" y="${H + 14}" text-anchor="middle" font-size="10" fill="#6B7A90">Y${x.y}</text></g>`).join('');
  const low = rows.find(x => x.bal < 0);
  strataToolShell('Sinking fund forecast', `${strataEsc(sc.no)} · 10 % of the Charges, ${strataRM(monthly)} a month`, `
    ${Object.keys(STRATA.s.schemes).length > 1 ? strataPickHtml(sc) : ''}
    <svg viewBox="0 0 ${W} ${H + 20}" class="strata-chart" role="img" aria-label="Sinking fund balance over ten years">
      <line x1="0" x2="${W}" y1="${H / 2}" y2="${H / 2}" stroke="#CFD8DC"/>${bars}</svg>
    <div class="strata-legend small"><span><i style="background:#00897B"></i>Balance at year end</span><span><i style="background:#D93025"></i>Short</span><span><i style="background:#E8772E;border-radius:50%"></i>Capital works</span></div>
    <div class="${low ? 'strata-warn' : 'strata-okbox'}">${low ? `The fund runs short in year ${low.y} (${strataRM(low.bal)}): raise the contribution above 10 % or spread the works.`
      : `The fund covers the plan: ${strataRM(rows[9].bal)} left after 10 years.`}</div>
    <div class="mpk-h-form flat" style="margin-top:10px"><label>Opening balance (RM)<input type="number" min="0" value="${strataEsc(sc.sf.baki)}" onchange="strataSfSet('baki', this.value)"></label></div>
    <div class="mpk-h-tablewrap" style="margin-top:8px"><table class="mpk-h-t"><thead><tr><th>Year</th><th>Works</th><th class="r">Cost RM</th><th></th></tr></thead>
      <tbody>${sc.sf.capex.map((c, i) => `<tr><td><input type="number" min="1" max="10" value="${strataEsc(c.tahun)}" onchange="strataSfCap(${i}, 'tahun', this.value)"></td>
        <td><input value="${strataEsc(c.perkara)}" onchange="strataSfCap(${i}, 'perkara', this.value)"></td>
        <td class="n"><input value="${strataEsc(c.kos)}" onchange="strataSfCap(${i}, 'kos', this.value)"></td>
        <td><button type="button" class="mpk-h-del" onclick="strataSfDel(${i})" aria-label="Remove">×</button></td></tr>`).join('')}</tbody></table></div>
    <div class="strata-row-btns"><button type="button" class="mpk-btn ghost" onclick="strataSfAdd()">+ Works</button></div>
    <div class="mpk-h-hint">The first works are an estimate (repainting RM 25 a m² of common property, roof RM 60 a m² of roof, lifts RM 250,000): replace them with the body's plan.</div>`, true);
}
function strataSfSet(k, v) { const sc = strataToolScheme(); sc.sf[k] = v; strataSave(); strataSinkingTool(sc); }
function strataSfCap(i, k, v) { const sc = strataToolScheme(); sc.sf.capex[i][k] = v; strataSave(); strataSinkingTool(sc); }
function strataSfAdd() { const sc = strataToolScheme(); sc.sf.capex.push({ tahun: 3, perkara: '', kos: '' }); strataSave(); strataSinkingTool(sc); }
function strataSfDel(i) { const sc = strataToolScheme(); sc.sf.capex.splice(i, 1); strataSave(); strataSinkingTool(sc); }
// Tool 6: deadline radar across schemes
function strataRadar() {
  const today = strataToday(), order = { overdue: 0, late: 1, ext: 2, open: 3, ok: 4, na: 5 };
  const rows = Object.values(STRATA.s.schemes).flatMap(sc => strataDeadlines(sc, today).map(d => ({ sc, d }))).sort((a, b) => order[a.d.status] - order[b.d.status] || (a.d.due || 'z').localeCompare(b.d.due || 'z'));
  const n = k => rows.filter(x => x.d.status === k).length;
  strataToolShell('Deadline radar', 'Act 318 / Act 757 time limits across every scheme', rows.length ? `
    <div class="strata-res3">${[['overdue', 'overdue'], ['ext', 'in extension'], ['open', 'running']].map(([k, l]) => `<div class="strata-res ${k === 'overdue' ? 'no' : k === 'ext' ? 'warn' : 'ok'}"><b>${n(k)}</b><span>${l}</span></div>`).join('')}</div>
    <div class="mpk-dpb-list" style="margin-top:10px">${rows.map(({ sc, d }) => `<button type="button" class="mpk-dpb-row" onclick='strataCloseTool(); STRATA.step = ${d.k === 'jmb' ? 5 : 4}; strataGo(${JSON.stringify(sc.bid)})'>
      <div class="mpk-dpb-row-t"><b>${strataEsc(sc.no)}</b><span class="strata-dl ${d.status}">${d.label}</span></div>
      <div class="mpk-dpb-row-m">${strataEsc(sc.nama)} · ${d.status === 'na' ? 'start date not entered' : d.done ? 'done ' + strataDate(d.done) : 'due ' + strataDate(d.due)} · ${strataEsc(d.note)}</div></button>`).join('')}</div>`
    : '<div class="mpk-reg-empty">No schemes yet.</div>', true);
}
// Tool 10: pipeline by stage and a timeline per scheme
function strataPipeline() {
  const all = Object.values(STRATA.s.schemes);
  const n = STRATA_STAGES.map((st, i) => all.filter(sc => strataStageIdx(sc) === i).length);
  const max = Math.max(1, ...n);
  const keys = ['created', 'd_sifus', 'd_cpsp', 'd_pecah', 'd_hakmilik'];
  const dateOf = (sc, k) => k === 'created' ? sc.created.slice(0, 10) : sc.app[k];
  const ds = all.flatMap(sc => keys.map(k => dateOf(sc, k)).filter(Boolean));
  const t0 = ds.length ? Math.min(...ds.map(Date.parse)) : Date.now(), t1 = Math.max(t0 + 86400000 * 30, Date.now(), ...ds.map(Date.parse));
  const x = d => (Date.parse(d) - t0) / (t1 - t0) * 100;
  strataToolShell('Strata pipeline', `${all.length} scheme${all.length === 1 ? '' : 's'} by stage, with their timelines`, all.length ? `
    <div class="strata-funnel">${STRATA_STAGES.map((st, i) => `<div><span>${st.label}</span><i style="width:${Math.max(n[i] / max * 100, n[i] ? 6 : 0)}%;background:${st.color}"></i><b>${n[i]}</b></div>`).join('')}</div>
    <h4 class="strata-h4">Timeline</h4>
    <div class="strata-gantt">${all.map(sc => { const pts = keys.map((k, i) => ({ d: dateOf(sc, k), st: STRATA_STAGES[i] })).filter(p => p.d);
      const end = pts[pts.length - 1];
      return `<div class="strata-gr"><span>${strataEsc(sc.no)}</span><div class="strata-gt"><i class="bar" style="left:${x(pts[0].d)}%;width:${Math.max(x(end.d) - x(pts[0].d), 0.8)}%"></i>
        ${pts.map(p => `<i class="pt" style="left:${x(p.d)}%;background:${p.st.color}" title="${strataEsc(p.st.label)} · ${strataDate(p.d)}"></i>`).join('')}</div></div>`; }).join('')}
      <div class="strata-ramp-l"><span>${strataDate(new Date(t0).toISOString().slice(0, 10))}</span><span>${strataDate(new Date(t1).toISOString().slice(0, 10))}</span></div></div>`
    : '<div class="mpk-reg-empty">No schemes yet.</div>', true);
}

// ---------- PDFs: report (step 6), parcel passports (tool 8), owner statements (tool 9) ----------
let STRATA_LOGO = null;
async function strataLogo() {
  if (STRATA_LOGO !== null) return STRATA_LOGO;
  try {
    const img = await new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = 'mpk/mpk_logo.png'; });
    const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
    c.getContext('2d').drawImage(img, 0, 0);
    STRATA_LOGO = { url: c.toDataURL('image/png'), ratio: img.naturalHeight / img.naturalWidth };
  } catch (e) { STRATA_LOGO = false; }
  return STRATA_LOGO;
}
const STRATA_P = { W: 210, H: 297, M: 16, NAVY: [30, 44, 68], INK: [33, 37, 41], MUTED: [107, 122, 144], LINE: [214, 220, 228], SHADE: [244, 246, 249],
  PURPLE: [94, 53, 177] };
const strataHex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
// A small layout kit over jsPDF: header, sections, paragraphs, wrapped tables, page numbers
function strataPdfKit(pdf, title, ref, logo) {
  const P = STRATA_P, CW = P.W - 2 * P.M, k = { y: 0, CW };
  k.header = () => {
    pdf.setFillColor(...P.PURPLE); pdf.rect(0, 0, P.W, 3, 'F');
    if (logo) pdf.addImage(logo.url, 'PNG', P.M, 7, 22, 22 * logo.ratio);
    const x = P.M + (logo ? 26 : 0);
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(12); pdf.setTextColor(...P.NAVY); pdf.text('MAJLIS PERBANDARAN KEMAMAN', x, 13);
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8.5); pdf.setTextColor(...P.MUTED); pdf.text(title, x, 18.5);
    pdf.text(ref, P.W - P.M, 13, { align: 'right' });
    pdf.setDrawColor(...P.LINE); pdf.setLineWidth(0.3); pdf.line(P.M, 25, P.W - P.M, 25);
    k.y = 32;
  };
  k.ensure = h => { if (k.y + h > P.H - 18) { pdf.addPage(); k.header(); } };
  k.section = (n, t) => { k.ensure(14); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(11); pdf.setTextColor(...P.PURPLE); pdf.text(`${n}.  ${t.toUpperCase()}`, P.M, k.y); k.y += 6; };
  k.para = (t, size = 9, color = P.INK) => {
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(size); pdf.setTextColor(...color);
    const lines = pdf.splitTextToSize(t, CW); k.ensure(lines.length * size * 0.42 + 2); pdf.text(lines, P.M, k.y); k.y += lines.length * size * 0.42 + 3;
  };
  k.table = (cols, rows, opts = {}) => {
    const pad = 1.6, fs = opts.size || 8.2, lh = fs * 0.4;
    const head = () => {
      pdf.setFillColor(...P.NAVY); pdf.rect(P.M, k.y, CW, 7, 'F');
      pdf.setFont('helvetica', 'bold'); pdf.setFontSize(fs); pdf.setTextColor(255, 255, 255);
      let x = P.M; cols.forEach(c => { pdf.text(c.t, c.r ? x + c.w - pad : x + pad, k.y + 4.7, { align: c.r ? 'right' : 'left' }); x += c.w; });
      k.y += 7;
    };
    k.ensure(16); head();
    rows.forEach((r, i) => {
      const bold = opts.boldLast && i === rows.length - 1;
      pdf.setFont('helvetica', bold ? 'bold' : 'normal'); pdf.setFontSize(fs);
      const cells = r.map((v, j) => pdf.splitTextToSize(String(v == null ? '' : v), cols[j].w - 2 * pad));
      const h = Math.max(...cells.map(c => c.length)) * lh + 2 * pad + 0.6;
      if (k.y + h > P.H - 18) { pdf.addPage(); k.header(); head(); pdf.setFont('helvetica', bold ? 'bold' : 'normal'); pdf.setFontSize(fs); }
      if (i % 2) { pdf.setFillColor(...P.SHADE); pdf.rect(P.M, k.y, CW, h, 'F'); }
      pdf.setTextColor(...P.INK);
      let x = P.M; cells.forEach((c, j) => { pdf.text(c, cols[j].r ? x + cols[j].w - pad : x + pad, k.y + pad + lh * 0.8, { align: cols[j].r ? 'right' : 'left' }); x += cols[j].w; });
      pdf.setDrawColor(...P.LINE); pdf.setLineWidth(0.15); pdf.line(P.M, k.y + h, P.M + CW, k.y + h);
      k.y += h;
    });
    k.y += 5;
  };
  return k;
}
// Footer on every page of a finished PDF
function strataPdfFooter(pdf, text) {
  const P = STRATA_P, n = pdf.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    pdf.setPage(i); pdf.setFont('helvetica', 'normal'); pdf.setFontSize(7.5); pdf.setTextColor(...P.MUTED);
    pdf.text(text, P.M, P.H - 9);
    pdf.text(`Muka ${i} / ${n}`, P.W - P.M, P.H - 9, { align: 'right' });
  }
}
const strataPdfDate = d => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d || ''); if (!m) return '-';
  return `${+m[3]} ${['Januari', 'Februari', 'Mac', 'April', 'Mei', 'Jun', 'Julai', 'Ogos', 'September', 'Oktober', 'November', 'Disember'][+m[2] - 1]} ${m[1]}`; };
const strataPdfRM = v => 'RM ' + strataRM0(v);
async function strataPdf() {
  const sc = strataSc() || strataToolScheme();
  if (!sc) return;
  if (!window.jspdf) { showToast('⚠️ PDF library not loaded'); return; }
  showLoading('Preparing the strata report…', sc.no);
  try {
    const logo = await strataLogo();
    const { jsPDF } = window.jspdf, pdf = new jsPDF({ unit: 'mm', format: 'a4' });
    const P = STRATA_P, today = strataToday();
    const k = strataPdfKit(pdf, 'Laporan Skim Strata', `${sc.no} · ${strataPdfDate(today)}`, logo);
    const r = strataShareUnits(sc.parcels, sc.kompleks), dl = strataDeadlines(sc, today), s = STRATA.s;
    const f = strataBuilding(sc.bid), p = f ? f.properties : {};
    k.header();
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(16); pdf.setTextColor(...P.NAVY);
    const t = pdf.splitTextToSize(sc.nama.toUpperCase(), k.CW); pdf.text(t, P.M, k.y); k.y += t.length * 7;
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(10); pdf.setTextColor(...P.MUTED);
    const sub = pdf.splitTextToSize(`${sc.no} · Peringkat: ${STRATA_STAGES[strataStageIdx(sc)].ms}`, k.CW);
    pdf.text(sub, P.M, k.y); k.y += sub.length * 4.5 + 4;
    // 1 particulars
    k.section(1, 'Maklumat skim dan bangunan');
    k.table([{ t: 'Perkara', w: 52 }, { t: '', w: k.CW - 52 }], [
      ['Tuan punya / pemaju', sc.pemaju || '-'], ['Hakmilik induk', sc.hakmilik_induk || '-'], ['Lot / UPI', [sc.bld.lot || '-', sc.bld.upi].filter(Boolean).join(' · ')],
      ['Mukim / daerah', `${sc.mukim || 'Mukim Kemaman'}, Daerah Kemaman, Terengganu`], ['Alamat', sc.alamat || '-'],
      ['Pegangan', (sc.tempoh || 'Kekal') === 'Kekal' ? 'Pegangan kekal' : `Pajakan, baki ${sc.baki_pajakan || '-'} tahun`],
      ['Jenis permohonan', STRATA_PECAH[sc.jenis_pecah]], ['Jenis skim', STRATA_SCHEME_TYPES[sc.kompleks.jenis] || '-'],
      ['Lokasi (Plus Code)', `${sc.bld.plus_code} · ${(+sc.bld.lat).toFixed(6)}, ${(+sc.bld.lng).toFixed(6)}`],
      ['Keluasan tapak bangunan', `${mpkNum(sc.bld.area_m2)} m²`],
      ['Bilangan tingkat / tinggi', `${sc.bim.tingkat || '-'} tingkat · ${Math.round(strataHeight(sc.bim) * 10) / 10} m${p.tinggi_src ? ` (anggaran: ${p.tinggi_src})` : ''}`],
      ['Tahap model BIM', `LOD ${sc.bim.lod}`], ['Kemudahan bersama', `${sc.kompleks.aircond ? 'Berhawa dingin' : 'Tanpa hawa dingin'} · ${sc.kompleks.lif ? 'ada lif / eskalator' : 'tiada lif / eskalator'}`],
    ]);
    // 2 conditions
    k.section(2, 'Syarat permohonan hakmilik strata');
    k.table([{ t: 'Syarat (JKPTG)', w: k.CW - 26 }, { t: 'Dipenuhi', w: 26 }], STRATA_SYARAT.map(([key, l]) => [l, sc.syarat[key] ? 'Ya' : 'Belum']));
    // 3 floor stack drawing
    if (sc.parcels.length) {
      const floors = Math.max(1, Math.floor(strataNum(sc.bim.tingkat) || Math.max(...sc.parcels.map(x => strataNum(x.tingkat)))));
      const fh = Math.min(9, 70 / floors), h = floors * (fh + 1.5) + 14;
      k.ensure(h + 14); k.section(3, 'Susunan tingkat dan petak');
      const x0 = P.M + 22, w = k.CW - 24, foot = strataNum(sc.bld.area_m2) || 1;
      for (let fl = floors; fl >= 1; fl--) {
        const yy = k.y + (floors - fl) * (fh + 1.5);
        pdf.setFont('helvetica', 'normal'); pdf.setFontSize(7.5); pdf.setTextColor(...P.MUTED); pdf.text(`Tingkat ${fl}`, P.M, yy + fh / 2 + 1.2);
        pdf.setDrawColor(...P.NAVY); pdf.setLineWidth(0.3); pdf.rect(x0, yy, w, fh);
        let xx = x0 + 0.6;
        sc.parcels.filter(x => Math.floor(strataNum(x.tingkat)) === fl).forEach(x => {
          const ww = Math.max(4, strataNum(x.luas) / foot * (w - 1.2));
          pdf.setFillColor(...strataHex(STRATA_TYPE_COLOR[x.jenis] || '#90A4AE')); pdf.rect(xx, yy + 0.6, Math.max(ww - 0.6, 1), fh - 1.2, 'F');
          pdf.setTextColor(255, 255, 255); pdf.setFontSize(Math.min(7, fh * 0.8)); pdf.setFont('helvetica', 'bold');
          if (ww > 10) pdf.text(x.petak, xx + ww / 2 - 0.3, yy + fh / 2 + 1, { align: 'center' });
          xx += ww;
        });
      }
      k.y += floors * (fh + 1.5) + 2;
      pdf.setFillColor(141, 110, 99); pdf.rect(x0, k.y, w, 1.5, 'F'); k.y += 7;
      k.para(`Petak di setiap tingkat dilukis mengikut keluasan; ruang berbaki ialah harta bersama (${mpkNum(strataCommon(sc))} m²).`, 8, P.MUTED);
    }
    // 4 schedule of parcels
    k.section(4, 'Jadual petak dan unit syer');
    k.para('Unit syer diperuntukkan = (keluasan petak × WF1 × WF2) + (keluasan petak aksesori × WF3), dalam meter persegi, dibundarkan kepada nombor bulat terdekat '
      + '(Akta Pengurusan Strata 2013 [Akta 757], Jadual Pertama).', 8.5);
    const W = [16, 11, 0, 17, 12, 12, 19, 12, 17, 14];
    W[2] = k.CW - W.reduce((a, b) => a + b, 0);
    k.table([{ t: 'Petak', w: W[0] }, { t: 'Tgkt', w: W[1] }, { t: 'Jenis petak', w: W[2] }, { t: 'Luas m²', w: W[3], r: 1 }, { t: 'WF1', w: W[4], r: 1 }, { t: 'WF2', w: W[5], r: 1 },
      { t: 'Aksesori m²', w: W[6], r: 1 }, { t: 'WF3', w: W[7], r: 1 }, { t: 'Unit syer', w: W[8], r: 1 }, { t: '%', w: W[9], r: 1 }],
      [...sc.parcels.map((x, i) => [x.petak, x.tingkat, (STRATA_WF1[x.jenis] || [''])[0] + (x.aks_no ? ` (aksesori ${x.aks_no})` : ''), x.luas, r.rows[i].wf1.toFixed(2), r.rows[i].wf2.toFixed(2),
        x.aks_luas || '-', r.rows[i].wf3 ? r.rows[i].wf3.toFixed(2) : '-', mpkNum(r.su[i]), r.pct[i].toFixed(2)]),
       ['Jumlah', '', `${sc.parcels.length} petak`, mpkNum(sc.parcels.reduce((a, x) => a + strataNum(x.luas), 0)), '', '', '', '', mpkNum(r.total), '100.00']], { size: 7.6, boldLast: true });
    k.table([{ t: 'Pemfailan', w: 74 }, { t: 'Tarikh', w: 34 }, { t: 'Rujukan', w: k.CW - 108 }], [
      ['Sijil Formula Unit Syer (SiFUS), PTG', strataPdfDate(sc.app.d_sifus), sc.app.no_sifus || '-'],
      ['Jadual Petak difailkan dengan Pesuruhjaya Bangunan', strataPdfDate(sc.app.d_cob), sc.app.no_cob || '-']]);
    // 5 application stages and deadlines
    k.section(5, 'Status permohonan hakmilik strata');
    const idx = strataStageIdx(sc);
    k.table([{ t: 'Peringkat', w: k.CW - 60 }, { t: 'Tarikh', w: 34 }, { t: 'Status', w: 26 }], STRATA_STAGES.map((st, i) => [st.ms,
      strataPdfDate({ draf: sc.created.slice(0, 10), sifus: sc.app.d_sifus, cpsp: sc.app.d_cpsp, pecah: sc.app.d_pecah, hakmilik: sc.app.d_hakmilik }[st.k]),
      i < idx ? 'Selesai' : i === idx ? 'Semasa' : 'Belum']));
    const dlMs = { ok: 'Menepati masa', late: 'Lewat', overdue: 'Melebihi tempoh', ext: 'Dalam lanjutan', open: 'Berjalan', na: 'Tarikh mula belum diisi' };
    k.table([{ t: 'Had masa', w: k.CW - 84 }, { t: 'Tarikh akhir', w: 30 }, { t: 'Selesai', w: 28 }, { t: 'Status', w: 26 }], dl.map((d, i) => [
      ['Mohon CPSP: 3 bulan dari siap bangunan (+1 bulan)', 'Mohon pecah bahagi: 1 bulan dari CPSP (+1 bulan)', 'AGM pertama JMB: 12 bulan dari milikan kosong'][i],
      strataPdfDate(d.due), strataPdfDate(d.done), dlMs[d.status]]));
    const docs = STRATA_DOCS.filter(([key]) => (sc.app.docs || {})[key]).map(([, l]) => l);
    k.para(`Dokumen sedia: ${docs.length ? docs.join('; ') : 'tiada'} (${docs.length} daripada ${STRATA_DOCS.length}).`, 8.5);
    // 6 management and money
    k.section(6, 'Pengurusan, caj dan cukai taksiran');
    const body = sc.app.stage === 'hakmilik' ? 'Perbadanan Pengurusan (MC)' : sc.urus.d_jmb ? 'Badan Pengurusan Bersama (JMB)' : 'Pemaju (tempoh pengurusan pemaju)';
    k.para(`Badan pengurusan semasa: ${body}${sc.urus.nama_jmb ? ` · JMB: ${sc.urus.nama_jmb}` : ''}${sc.urus.nama_mc ? ` · MC: ${sc.urus.nama_mc}` : ''}. Milikan kosong: ${strataPdfDate(sc.urus.d_vp)}; `
      + `AGM pertama JMB: ${strataPdfDate(sc.urus.d_jmb)}. Caj ditetapkan mengikut unit syer pada RM ${strataNum(sc.caj.kadar).toFixed(2)} seunit sebulan; kumpulan wang penjelas 10% daripada caj (Akta 757 s.25).`, 8.5);
    let tt = 0, tc = 0, ts = 0;
    const money = sc.parcels.map((x, i) => { const tax = strataTax(x, s), ch = strataCharges(r.su[i], sc.caj.kadar); tt += tax; tc += ch.caj; ts += ch.sinking;
      return [x.petak, x.pemilik || '-', mpkNum(r.su[i]), strataRM0(ch.caj), strataRM0(ch.sinking), strataRM0(tax)]; });
    k.table([{ t: 'Petak', w: 18 }, { t: 'Pemilik', w: k.CW - 120 }, { t: 'Unit syer', w: 20, r: 1 }, { t: 'Caj / bulan', w: 26, r: 1 }, { t: 'Penjelas / bulan', w: 28, r: 1 }, { t: 'Cukai / tahun', w: 28, r: 1 }],
      [...money, ['Jumlah', '', mpkNum(r.total), strataRM0(tc), strataRM0(ts), strataRM0(tt)]], { size: 7.8, boldLast: true });
    k.para('Cukai taksiran = nilai tahunan × kadar mengikut kegunaan (Akta Kerajaan Tempatan 1976, s.127), dibayar dua penggal (Februari dan Ogos). '
      + 'Kadar dan nilai tahunan dalam laporan ini ialah anggaran untuk rujukan.', 8, P.MUTED);
    // 7 notes and signatures
    k.section(7, 'Nota');
    k.para('Laporan ini disediakan berdasarkan Akta Hakmilik Strata 1985 [Akta 318], Akta Pengurusan Strata 2013 [Akta 757] dan panduan JKPTG mengenai permohonan hakmilik strata. '
      + 'Ketinggian dan bilangan tingkat bangunan ialah anggaran daripada data terbuka (OpenStreetMap, GHSL) dan perlu disahkan di tapak. '
      + 'Unit syer muktamad tertakluk kepada kelulusan Pengarah Tanah dan Galian (Akta 318 s.18).', 8.5);
    k.ensure(34);
    pdf.setDrawColor(...P.LINE); pdf.setLineWidth(0.3);
    [['Disediakan oleh', P.M], ['Disemak oleh', P.M + k.CW / 2 + 4]].forEach(([l, x]) => {
      pdf.line(x, k.y + 18, x + k.CW / 2 - 8, k.y + 18);
      pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8.5); pdf.setTextColor(...P.MUTED);
      pdf.text(l, x, k.y + 23); pdf.text('Nama / jawatan / tarikh', x, k.y + 27.5);
    });
    strataPdfFooter(pdf, 'Dijana oleh Geospatial AI BuildVision untuk Majlis Perbandaran Kemaman. Dokumen rujukan, bukan dokumen hakmilik rasmi.');
    pdf.save(`Laporan_Strata_${sc.no.replace(/\//g, '-')}.pdf`);
    addActivityLog('Strata report PDF', sc.no);
  } catch (e) {
    showToast('⚠️ Could not make the PDF: ' + e.message, 5000);
  } finally { hideLoading(); }
}
// QR codes from qrcode-generator, loaded the first time
function strataQrLib() {
  if (window.qrcode) return Promise.resolve(window.qrcode);
  return new Promise((ok, no) => {
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js';
    s.onload = () => ok(window.qrcode); s.onerror = () => no(new Error('QR library not reachable'));
    document.head.appendChild(s);
  });
}
async function strataPassports(sc) {
  if (!sc.parcels.length) { showToast('⚠️ No parcels yet'); return; }
  if (!window.jspdf) { showToast('⚠️ PDF library not loaded'); return; }
  strataCloseTool();
  showLoading('Making parcel passports…', `${sc.parcels.length} parcels`);
  try {
    const [qr, logo] = await Promise.all([strataQrLib(), strataLogo()]);
    const { jsPDF } = window.jspdf, pdf = new jsPDF({ unit: 'mm', format: 'a4' }), P = STRATA_P;
    const r = strataShareUnits(sc.parcels, sc.kompleks);
    const cw = (P.W - 2 * P.M - 6) / 2, ch = 62;
    sc.parcels.forEach((x, i) => {
      const slot = i % 8;
      if (i && !slot) pdf.addPage();
      const cx = P.M + (slot % 2) * (cw + 6), cy = 14 + Math.floor(slot / 2) * (ch + 6);
      pdf.setDrawColor(...P.LINE); pdf.setLineWidth(0.4); pdf.roundedRect(cx, cy, cw, ch, 3, 3);
      pdf.setFillColor(...strataHex(STRATA_TYPE_COLOR[x.jenis] || '#5E35B1')); pdf.rect(cx, cy, 4, ch, 'F');
      if (logo) pdf.addImage(logo.url, 'PNG', cx + 7, cy + 4, 12, 12 * logo.ratio);
      pdf.setFont('helvetica', 'bold'); pdf.setFontSize(7.5); pdf.setTextColor(...P.MUTED); pdf.text('PASPORT PETAK STRATA', cx + 22, cy + 7.5);
      pdf.setFontSize(16); pdf.setTextColor(...P.NAVY); pdf.text(x.petak, cx + 22, cy + 15);
      pdf.setFont('helvetica', 'normal'); pdf.setFontSize(7.8); pdf.setTextColor(...P.INK);
      const lines = [['Skim', sc.no], ['Tingkat', x.tingkat], ['Jenis', (STRATA_WF1[x.jenis] || [''])[0]], ['Keluasan', `${x.luas} m²${x.aks_luas ? ` + aksesori ${x.aks_luas} m²` : ''}`],
        ['Unit syer', `${mpkNum(r.su[i])} / ${mpkNum(r.total)} (${r.pct[i].toFixed(2)}%)`], ['Pemilik', x.pemilik || '-'], ['Lokasi', sc.bld.plus_code]];
      // the first two lines sit beside the QR code, the rest below it with the card's full width
      lines.forEach(([a, b], j) => {
        const yy = cy + 23 + j * 5.2, room = (yy < cy + 31 ? cw - 24 - 28 : cw - 25);
        pdf.setFont('helvetica', 'bold'); pdf.text(a, cx + 7, yy);
        pdf.setFont('helvetica', 'normal'); pdf.text(pdf.splitTextToSize(String(b), room)[0], cx + 23, yy);
      });
      const q = qr(0, 'M'); q.addData(`https://www.google.com/maps?q=${sc.bld.lat},${sc.bld.lng}`); q.make();
      const n = q.getModuleCount(), size = 24, m = size / n, qx = cx + cw - size - 4, qy = cy + 4;
      pdf.setFillColor(0, 0, 0);
      for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) if (q.isDark(a, b)) pdf.rect(qx + b * m, qy + a * m, m + 0.02, m + 0.02, 'F');
      pdf.setFontSize(6); pdf.setTextColor(...P.MUTED); pdf.text('Imbas: lokasi bangunan', qx + size / 2, qy + size + 3, { align: 'center' });
    });
    strataPdfFooter(pdf, `${sc.no} · ${sc.nama} · Majlis Perbandaran Kemaman · dokumen rujukan`);
    pdf.save(`Pasport_Petak_${sc.no.replace(/\//g, '-')}.pdf`);
    addActivityLog('Parcel passports PDF', sc.no);
  } catch (e) { showToast('⚠️ ' + e.message, 5000); } finally { hideLoading(); }
}
async function strataStatements(sc) {
  if (!sc.parcels.length) { showToast('⚠️ No parcels yet'); return; }
  if (!window.jspdf) { showToast('⚠️ PDF library not loaded'); return; }
  strataCloseTool();
  showLoading('Making owner statements…', `${sc.parcels.length} parcels`);
  try {
    const logo = await strataLogo();
    const { jsPDF } = window.jspdf, pdf = new jsPDF({ unit: 'mm', format: 'a4' }), P = STRATA_P, y = STRATA.year, s = STRATA.s;
    const r = strataShareUnits(sc.parcels, sc.kompleks), today = strataToday();
    sc.parcels.forEach((x, i) => {
      if (i) pdf.addPage();
      const k = strataPdfKit(pdf, `Penyata Petak Strata ${y}`, `${sc.no} · ${x.petak}`, logo);
      k.header();
      pdf.setFont('helvetica', 'bold'); pdf.setFontSize(14); pdf.setTextColor(...P.NAVY); pdf.text(`PENYATA PEMILIK PETAK ${x.petak}`, P.M, k.y); k.y += 7;
      pdf.setFont('helvetica', 'normal'); pdf.setFontSize(9.5); pdf.setTextColor(...P.MUTED); pdf.text(`${sc.nama} · tarikh penyata ${strataPdfDate(today)}`, P.M, k.y); k.y += 8;
      k.table([{ t: 'Perkara', w: 55 }, { t: '', w: k.CW - 55 }], [['Pemilik', x.pemilik || '-'], ['Petak / tingkat', `${x.petak} · tingkat ${x.tingkat}`],
        ['Jenis petak', (STRATA_WF1[x.jenis] || [''])[0]], ['Keluasan', `${x.luas} m²${x.aks_no ? ` · petak aksesori ${x.aks_no} (${x.aks_luas || '-'} m²)` : ''}`],
        ['Unit syer', `${mpkNum(r.su[i])} daripada ${mpkNum(r.total)} (${r.pct[i].toFixed(2)}%)`], ['Lokasi', `${sc.bld.plus_code} · Lot ${sc.bld.lot || '-'}`]]);
      const tax = strataTax(x, s), b = (sc.bills[y] || {})[x.id], ch = strataCharges(r.su[i], sc.caj.kadar), amt = b ? b.amount : tax;
      k.section('A', `Cukai taksiran ${y} (kepada Majlis Perbandaran Kemaman)`);
      k.table([{ t: 'Penggal', w: 60 }, { t: 'Amaun', w: 40, r: 1 }, { t: 'Status', w: k.CW - 100 }], [
        ['Penggal 1 (akhir Februari)', strataPdfRM(amt / 2), b && b.p1 ? 'Dibayar ' + strataPdfDate(b.p1) : 'Belum dibayar'],
        ['Penggal 2 (akhir Ogos)', strataPdfRM(amt / 2), b && b.p2 ? 'Dibayar ' + strataPdfDate(b.p2) : 'Belum dibayar'],
        ['Jumlah setahun', strataPdfRM(amt), '']], { boldLast: true });
      k.section('B', 'Caj dan kumpulan wang penjelas (kepada badan pengurusan)');
      k.table([{ t: 'Perkara', w: 90 }, { t: 'Sebulan', w: 35, r: 1 }, { t: 'Setahun', w: k.CW - 125, r: 1 }], [
        [`Caj (RM ${strataNum(sc.caj.kadar).toFixed(2)} × ${mpkNum(r.su[i])} unit syer)`, strataPdfRM(ch.caj), strataPdfRM(ch.caj * 12)],
        ['Kumpulan wang penjelas (10% daripada caj)', strataPdfRM(ch.sinking), strataPdfRM(ch.sinking * 12)],
        ['Jumlah', strataPdfRM(ch.caj + ch.sinking), strataPdfRM((ch.caj + ch.sinking) * 12)]], { boldLast: true });
      k.para('Cukai taksiran dibayar kepada MPK; caj dan kumpulan wang penjelas dibayar kepada badan pengurusan (JMB / MC) mengikut unit syer petak (Akta 757 s.25). '
        + 'Amaun ialah anggaran untuk rujukan dan bukan bil rasmi.', 8, P.MUTED);
    });
    strataPdfFooter(pdf, 'Dijana oleh Geospatial AI BuildVision untuk Majlis Perbandaran Kemaman. Penyata rujukan, bukan bil rasmi.');
    pdf.save(`Penyata_Pemilik_${sc.no.replace(/\//g, '-')}_${y}.pdf`);
    addActivityLog('Owner statements PDF', sc.no);
  } catch (e) { showToast('⚠️ ' + e.message, 5000); } finally { hideLoading(); }
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
      <small>${(+k.lat).toFixed(6)}, ${(+k.lng).toFixed(6)}</small></div>
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
  const s = STRATA.s, day = strataToday();
  const q = v => { const t = String(v == null ? '' : v); return /[",\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t; };
  const csv = rows => new Blob(['﻿' + rows.map(r => r.map(q).join(',')).join('\n') + '\n'], { type: 'text/csv;charset=utf-8' });
  let blob, name;
  if (kind === 'json') { blob = new Blob([JSON.stringify(s, null, 1)], { type: 'application/json' }); name = `mpk_strata_${day}.json`; }
  else if (kind === 'parcels') {
    const rows = [['scheme', 'scheme_name', 'stage', 'plus_code', 'lot', 'petak', 'floor', 'area_m2', 'parcel_type', 'wf1', 'wf2', 'accessory', 'accessory_m2', 'wf3',
      'share_units', 'owner', 'charges_month_rm', 'sinking_month_rm', 'assessment_tax_year_rm']];
    for (const sc of Object.values(s.schemes)) {
      const r = strataShareUnits(sc.parcels, sc.kompleks);
      sc.parcels.forEach((x, i) => { const ch = strataCharges(r.su[i], sc.caj.kadar);
        rows.push([sc.no, sc.nama, STRATA_STAGES[strataStageIdx(sc)].label, sc.bld.plus_code, sc.bld.lot, x.petak, x.tingkat, x.luas, (STRATA_WF1[x.jenis] || [''])[0],
          r.rows[i].wf1, r.rows[i].wf2, x.aks_no, x.aks_luas, r.rows[i].wf3 || '', r.su[i], x.pemilik, ch.caj.toFixed(2), ch.sinking.toFixed(2), strataTax(x, s).toFixed(2)]); });
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
    Object.values(STRATA.s.schemes).forEach(strataNormalise);
    STRATA.cur = null;
    strataCloseWs();
    strataChanged(false);
    showToast('📥 Strata data imported');
  }).catch(e => showToast('⚠️ Could not import: ' + e.message, 5000));
}

if (typeof module !== 'undefined') {
  module.exports = { strataWF1, strataShareUnits, strataGenParcels, strataCommon, strataAnnualValue, strataTax, strataCharges, strataLodSuggest,
    strataFloorsFromHeight, strataHeight, strataCollection, strataNextNo, strataAddMonths, strataDeadlines, strataVote, strataSinking, strataPotential,
    STRATA_DEFAULTS, STRATA_NET, STRATA_WF1 };
}
