// ============================================================
// MPK KEMAMAN — BUILDING PLAN REGISTRATION
// Click an illegal or pending building → MPK's "Borang Perkiraan Daftar Pelan Bangunan"
// (Jabatan Kawalan Bangunan, JKB:(KP)1-03, UUKBS 1984 First Schedule) as a form to fill in,
// with every fee worked out as it is typed. Submitted forms wait for approval in the panel's
// Registrations page (sidebar); an approved one makes its building legal on the map and in the counts.
// Guideline: Kaedah-Kaedah Pengawalan Perancangan (Am) (Terengganu) (Pindaan) 2026, Tr. P.U. 9
// (Warta 10 Sep 2026), shown as a reference beside the form.
// Registrations are kept in this browser (localStorage); Export / Import moves them.
// ============================================================

// ---------- Fee schedule of the form (pure, exported for tools/test_mpk_daftar.js) ----------
// Floor rows: [floor, RM per unit, minimum RM]. A unit is 9 m² or part of it (the form's
// "KADAR (1/9 M.PER)" column): kadar = ceil(luas / 9), jumlah = max(minimum, kadar × rate).
const MPK_DPB_FLOORS = [
  ['BAWAH', 14, 140], ['PERTAMA', 12, 120], ['KEDUA', 10, 100], ['KETIGA', 8, 80],
  ['KEEMPAT & TINGKAT ATASNYA @ BAWAH TANAH', 6, 60],
];
// Para 9, a row of buildings from one plan: [label, rate label, share of the unit fee, units in the band]
const MPK_DPB_SERIES = [
  ['PERTAMA', 'PENUH', 1, 1], ['KE-2 HINGGA KE-5', '90.00%', 0.9, 4], ['KE-6 HINGGA KE-10', '85.00%', 0.85, 5],
  ['KE-11 HINGGA KE-25', '75.00%', 0.75, 15], ['KE-26 DAN TIAP-TIAP BGN. SELANJUTNYA', '60.00%', 0.6, Infinity],
];
// Para 7 & 8: [key, label, rate label, RM, 'area' (per 9 m² unit) | 'count' (per structure)]
const MPK_DPB_KHAS = [
  ['dermaga', 'DERMAGA, JAMBATAN, LANDASAN KERETAPI, TEROWONG, LANDASAN TERBANG, @ BGN. KHAS LAIN', '50.00/M.PER', 50, 'area'],
  ['tel_tanah_a', '(A) KETINGGIAN SEHINGGA 45 METER', '1000.00 PER 1 STRUKTUR', 1000, 'count', 'STRUKTUR TELEKOMUNIKASI BAGI STRUKTUR YANG DIBINA DI ATAS TANAH:'],
  ['tel_tanah_b', '(B) KETINGGIAN MELEBIHI 45 METER', '2000.00 PER 1 STRUKTUR', 2000, 'count'],
  ['tel_bgn_a', '(A) KETINGGIAN SEHINGGA 9 METER', '1000.00 PER 1 STRUKTUR', 1000, 'count', 'STRUKTUR TELEKOMUNIKASI BAGI STRUKTUR YANG DIBINA DI ATAS ATAU BERSAMBUNG DENGAN BANGUNAN:'],
  ['tel_bgn_b', '(B) KETINGGIAN MELEBIHI 9 METER', '2000.00 PER 1 STRUKTUR', 2000, 'count'],
  ['tembok', 'TEMBOK PENAHAN', '6.00/M.PER', 6, 'area'],
];
const MPK_DPB_SUMMARY = [
  ['baru', 'BANGUNAN BARU'], ['sementara', 'BANGUNAN SEMENTARA'], ['tambahan', 'BANGUNAN TAMBAHAN'],
  ['ubahsuai', 'BANGUNAN PENGUBAHSUAIAN'], ['pindaan', 'BANGUNAN PINDAAN'], ['khas', 'BANGUNAN KHAS'],
  ['telko', 'STRUKTUR TELEKOMUNIKASI'],
];

const mpkDpbNum = v => { const n = parseFloat(String(v == null ? '' : v).replace(/,/g, '')); return isFinite(n) && n > 0 ? n : 0; };
// One area row: 9 m² units, then the rate with its minimum (nothing when no area is given)
function mpkDpbArea(luas, rate, min) {
  const l = mpkDpbNum(luas);
  if (!l) return { kadar: 0, jumlah: 0 };
  const kadar = Math.ceil(l / 9);
  return { kadar, jumlah: Math.max(min || 0, kadar * rate) };
}
// Units of a row of N buildings in each para 9 band (1, 4, 5, 15, the rest)
function mpkDpbSeriesUnits(n) {
  let left = Math.floor(mpkDpbNum(n));
  return MPK_DPB_SERIES.map(([, , , cap]) => { const u = Math.min(left, cap); left -= u; return u; });
}
// The rate of a row: as typed in the form (f.rate[key]), else the schedule's
function mpkDpbRate(f, key, def) {
  const v = f.rate && f.rate[key];
  if (v === undefined || v === null || String(v).trim() === '') return def;
  const n = parseFloat(String(v).replace(/,/g, ''));
  return isFinite(n) && n >= 0 ? n : def;
}
// Every figure, subtotal and the grand total of a filled form (f as kept by the form, see mpkDpbBlank).
// Any figure typed by hand (f.ovr[id]) is kept and the totals below it follow it.
function mpkDpbCalc(f) {
  const ovr = f.ovr || {};
  const o = (id, auto) => {
    const v = ovr[id];
    if (v === undefined || v === null || String(v).trim() === '') return auto;
    const n = parseFloat(String(v).replace(/,/g, ''));
    return isFinite(n) ? n : auto;
  };
  const area = (id, luas, rate, min) => {
    const l = mpkDpbNum(luas), kadar = o(id + '-k', l ? Math.ceil(l / 9) : 0);
    return { kadar, rate, jumlah: o(id + '-j', kadar ? Math.max(min || 0, kadar * rate) : 0) };
  };
  const floors = key => MPK_DPB_FLOORS.map(([, rate, min], i) =>
    area(key + '-' + i, (f[key] || [])[i], mpkDpbRate(f, key + '.' + i, rate), min));
  const sum = rows => rows.reduce((s, r) => s + r.jumlah, 0);
  const p1 = floors('p1'), p1Sub = o('p1-sub', sum(p1));
  const k9 = mpkDpbNum(f.p9k), units = mpkDpbSeriesUnits(k9 ? f.unit : 0);
  const p9 = MPK_DPB_SERIES.map(([, , share], i) => {
    const pct = mpkDpbRate(f, 'p9.' + i, share * 100) / 100;
    const kadar = o('p9-k' + i, k9 * pct), unit = o('p9-u' + i, units[i]);
    return { pct, unit, kadar, jumlah: o('p9-j' + i, kadar * unit) };
  });
  const p9Sub = o('p9-sub', sum(p9));
  const one = (key, def) => { const r = area(key, f[key], mpkDpbRate(f, key, def), 0); return { ...r, sub: o(key + '-sub', r.jumlah) }; };
  const count = (key, def) => {
    const rate = mpkDpbRate(f, key, def), j = o(key + '-j', rate * Math.floor(mpkDpbNum(f[key])));
    return { rate, jumlah: j, sub: o(key + '-sub', j) };
  };
  const p2 = one('p2', 7), p61 = one('p61', 7), p65 = count('p65', 50), p101 = count('p101', 120), p102a = count('p102a', 120);
  const khas = MPK_DPB_KHAS.map(([key, , , def, kind]) => {
    const rate = mpkDpbRate(f, 'khas.' + key, def);
    return kind === 'area' ? area('khas-' + key, (f.khas || {})[key], rate, 0)
      : { kadar: 0, rate, jumlah: o('khas-' + key + '-j', rate * Math.floor(mpkDpbNum((f.khas || {})[key]))) };
  });
  const isTel = i => MPK_DPB_KHAS[i][0].startsWith('tel_');
  const khasPart = khas.filter((_, i) => !isTel(i)).reduce((s, r) => s + r.jumlah, 0);
  const telPart = khas.filter((_, i) => isTel(i)).reduce((s, r) => s + r.jumlah, 0);
  const khasSub = o('khas-sub', khasPart + telPart);
  const p102b = floors('p102b'), p102bSub = o('p102b-sub', sum(p102b));
  const p102A = o('p102-a', p102a.sub), p102B = o('p102-b', p102bSub), p102Total = o('p102-t', p102A + p102B);
  const summary = {
    baru: o('sum-baru', p1Sub + p9Sub), sementara: o('sum-sementara', p2.sub), tambahan: o('sum-tambahan', p61.sub),
    ubahsuai: o('sum-ubahsuai', p65.sub), pindaan: o('sum-pindaan', p101.sub + p102Total),
    khas: o('sum-khas', khasPart), telko: o('sum-telko', telPart),
  };
  return { p1, p1Sub, p9, p9Sub, p2, p61, p65, khas, khasSub, p101, p102a, p102b, p102bSub, p102A, p102B, p102Total,
    summary, total: o('sum-total', Object.values(summary).reduce((s, v) => s + v, 0)) };
}
function mpkDpbBlank() {
  return { projek: '', fail: '', jenis: '', unit: '', tajuk: ['', '', ''], helai: '',
    p1: ['', '', '', '', ''], p9k: '', p2: '', p61: '', p65: '', khas: {}, p101: '', p102a: '', p102b: ['', '', '', '', ''],
    rate: {}, ovr: {} };
}
// Next registration number of a year: DPB/2026/0001, DPB/2026/0002, ...
function mpkDpbNextNo(list, year) {
  const seq = list.map(r => /^DPB\/(\d{4})\/(\d+)$/.exec(r.no || '')).filter(m => m && +m[1] === year).map(m => +m[2]);
  return 'DPB/' + year + '/' + String((seq.length ? Math.max(...seq) : 0) + 1).padStart(4, '0');
}
const MPK_DPB_STATUS = {
  menunggu: { label: 'Pending approval', ms: 'Menunggu kelulusan' },
  lulus: { label: 'Approved', ms: 'Diluluskan' },
  tolak: { label: 'Rejected', ms: 'Ditolak' },
};

// ---------- Storage and the buildings ----------
const MPK_DPB = { KEY: 'mpk_daftar_v1', list: [], open: null, filter: '' };

function mpkDpbLoad() {
  try { const v = JSON.parse(localStorage.getItem(MPK_DPB.KEY) || '[]'); MPK_DPB.list = Array.isArray(v) ? v : []; }
  catch (e) { MPK_DPB.list = []; }
}
function mpkDpbSave() {
  try { localStorage.setItem(MPK_DPB.KEY, JSON.stringify(MPK_DPB.list)); return true; }
  catch (e) { showToast('⚠️ Could not save in this browser: ' + e.message, 5000); return false; }
}
const mpkDpbFor = bid => MPK_DPB.list.find(r => String(r.bid) === String(bid));
const mpkDpbBuilding = bid => MPK.data && MPK.data.buildings.features.find(f => String(f.properties.id) === String(bid));

// Called once the MPK data is loaded (mpkEnter)
function mpkDaftarInit() {
  mpkDpbLoad();
  if (typeof mpkEditLoad === 'function') mpkEditLoad();
  mpkDaftarApply(false);
}
// Marks each building with its registration; an approved one is legal (its own class kept in daftar_asal)
function mpkDaftarApply(redraw = true) {
  if (!MPK.data) return;
  if (typeof mpkEditUndo === 'function') mpkEditUndo();       // officers' edits come off first, and back on last
  for (const f of MPK.data.buildings.features) {
    const p = f.properties;
    if ('daftar_asal' in p) { p.kategori = p.daftar_asal; delete p.daftar_asal; }
    delete p.daftar_no; delete p.daftar_status;
  }
  for (const r of MPK_DPB.list) {
    const f = mpkDpbBuilding(r.bid);
    if (!f) continue;
    const p = f.properties;
    p.daftar_no = r.no; p.daftar_status = r.status;
    if (r.status === 'lulus') { p.daftar_asal = p.kategori; p.kategori = 'lulus'; }
  }
  if (typeof mpkEditApply === 'function') mpkEditApply(true);
  if (!redraw) return;
  try { if (map && map.getSource('mpk-buildings')) map.getSource('mpk-buildings').setData(MPK.data.buildings); } catch (e) {}
  if (typeof mpkRender === 'function') mpkRender();
  mpkDaftarRenderList();
}

// ---------- Building popup ----------
// Illegal and pending buildings get a button to register; a registered one shows its registration
function mpkDaftarPopupHTML(p) {
  const r = mpkDpbFor(p.id);
  if (r) {
    return `<div class="mpk-dpb-pop">
      <span class="mpk-dpb-badge ${r.status}">${MPK_DPB_STATUS[r.status].label}</span>
      <span class="mpk-dpb-pop-no">${mpkEscHtml(r.no)}</span>
      <button type="button" class="mpk-btn" onclick='mpkDaftarOpen(${JSON.stringify(String(p.id))})'>View registration</button>
    </div>`;
  }
  if (mpkStatus(p, MPK.settings) === 'legal') return '';
  return `<div class="mpk-dpb-pop"><button type="button" class="mpk-btn mpk-dpb-pop-btn"
    onclick='mpkDaftarOpen(${JSON.stringify(String(p.id))})'>Register plan</button></div>`;
}

// ---------- The form ----------
const mpkDpbRM = v => v ? v.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '';
const mpkDpbAttr = v => mpkEscHtml(v == null ? '' : v);

// Form values pre-filled from the building: its footprint as the ground floor, lot and register details
function mpkDpbPrefill(p) {
  const f = mpkDpbBlank();
  const area = (MPK_AREAS[p.kawasan] || {}).short || '';
  f.projek = 'Pendaftaran bangunan sedia ada · ' + (p.plus_code || '');
  f.fail = p.pelan_fail || p.rekod_fail || '';
  f.jenis = p.pelan_jenis || p.rekod_jenis || '';
  f.unit = '1';
  f.tajuk = [`Cadangan mendaftar bangunan sedia ada di atas Lot ${p.lot || '…'}${p.upi ? ' (UPI ' + p.upi + ')' : ''},`,
    `${area}, Mukim Kemaman, Daerah Kemaman, Terengganu Darul Iman`, ''];
  f.p1[0] = p.area_m2 ? String(Math.round(p.area_m2 * 100) / 100) : '';
  return f;
}

// change: { from, to } when the form comes from the status dropdown in the building's popup (mpk-edit.js)
function mpkDaftarOpen(bid, change) {
  const feat = mpkDpbBuilding(bid);
  const r = mpkDpbFor(bid);
  if (!feat && !r) { showToast('⚠️ Building not found'); return; }
  const p = feat ? feat.properties : r.bangunan;
  MPK_DPB.open = { bid: String(bid), reg: r || null, p, change: change || null };
  if (MPK.popup) { MPK.popup.remove(); MPK.popup = null; }
  let el = document.getElementById('mpk-dpb');
  if (!el) {
    el = document.createElement('div');
    el.id = 'mpk-dpb';
    el.className = 'mpk-dpb-overlay';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-labelledby', 'mpk-dpb-title');
    el.addEventListener('keydown', e => { if (e.key === 'Escape') mpkDaftarClose(); });
    document.body.appendChild(el);
  }
  el.innerHTML = mpkDpbShellHTML(p, r, r ? r.f : mpkDpbPrefill(p), change);
  el.hidden = false;
  mpkDaftarRecalc();
  const first = el.querySelector(change ? '#sf-reason' : '.dpb-paper input');
  if (first) first.focus();
}
function mpkDaftarClose() {
  const el = document.getElementById('mpk-dpb');
  if (el) { el.hidden = true; el.innerHTML = ''; }
  MPK_DPB.open = null;
}

function mpkDpbShellHTML(p, r, f, change) {
  const st = mpkStatus(p, MPK.settings);
  const wasIllegal = r ? r.asal === 'suspected' : st === 'suspected';
  const locked = r && r.status !== 'menunggu' && !change;
  const toLabel = change ? MPK_EDIT_STATUS[change.to].label : '';
  const facts = [p.plus_code, (MPK_AREAS[p.kawasan] || {}).short, p.lot ? 'Lot ' + p.lot : 'no cadastral lot',
    p.area_m2 ? mpkNum(p.area_m2) + ' m² footprint' : ''].filter(Boolean).map(mpkEscHtml).join(' · ');
  const statusLine = r
    ? `<span class="mpk-dpb-badge ${r.status}">${MPK_DPB_STATUS[r.status].label}</span> <b>${mpkEscHtml(r.no)}</b> · submitted ${mpkPlanDateLabel(r.created.slice(0, 10))}${r.decided ? ' · decided ' + mpkPlanDateLabel(r.decided.slice(0, 10)) : ''}`
    : `<span class="mpk-dpb-badge new">New registration</span>`;
  const foot = change
    ? `<span class="mpk-dpb-spacer"></span><button type="button" class="mpk-dpb-b ghost" onclick="mpkDaftarClose()">Cancel</button>
       <button type="button" class="mpk-dpb-b primary" onclick="mpkEditStatusSubmit()">Submit form · change to ${toLabel}</button>`
    : !r
    ? `<button type="button" class="mpk-dpb-b ghost" onclick="mpkDaftarClose()">Cancel</button>
       <button type="button" class="mpk-dpb-b primary" onclick="mpkDaftarSubmit()">Submit for approval</button>`
    : `<button type="button" class="mpk-dpb-b danger-ghost" onclick="mpkDaftarDelete('${mpkDpbAttr(r.no)}')">Delete</button>
       <span class="mpk-dpb-spacer"></span>
       ${r.status === 'menunggu' ? `
         <button type="button" class="mpk-dpb-b ghost" onclick="mpkDaftarSubmit()">Save changes</button>
         <button type="button" class="mpk-dpb-b reject" onclick="mpkDaftarDecide('tolak')">Reject</button>
         <button type="button" class="mpk-dpb-b approve" onclick="mpkDaftarDecide('lulus')">Approve</button>`
       : `<button type="button" class="mpk-dpb-b ghost" onclick="mpkDaftarDecide('menunggu')">Reopen</button>`}`;
  return `<div class="mpk-dpb-shell">
    <div class="mpk-dpb-bar">
      <div class="mpk-dpb-bar-t"><div id="mpk-dpb-title">${change ? 'Change status · ' + MPK_EDIT_STATUS[change.from].label + ' → ' + toLabel : r ? 'Building plan registration' : 'Register building plan'}</div>
        <small>${facts}</small></div>
      <button type="button" class="mpk-dpb-b ghost sm" onclick="mpkDaftarGuide()">Guideline · Tr. P.U. 9/2026</button>
      <button type="button" class="mpk-dpb-b ghost sm" onclick="mpkDaftarPrint()">Print</button>
      <button type="button" class="mpk-dpb-x" onclick="mpkDaftarClose()" aria-label="Close">×</button>
    </div>
    <div class="mpk-dpb-scroll">
      ${change ? `<section class="mpk-sf-box" aria-label="Status change"><div class="mpk-sf-h">1 · Status change <small>required</small></div>
        ${mpkEditChangeHTML(change.from, change.to)}
        <div class="mpk-sf-h">2 · Building plan form · JKB:(KP)1-03 <small>required: Projek, Bertajuk and at least one area or unit</small></div></section>` : ''}
      <div class="mpk-dpb-info">
        <div>${statusLine}</div>
        <div class="mpk-dpb-info-s">Map status before registering: <b>${MPK_STATUS[r ? r.asal : st].label}</b>.
          ${wasIllegal ? 'Built without approval: the fee in Part D of the Third Schedule (5 to 20 times the Part B fee) may also apply, see the guideline.' : ''}
          The ground floor area starts as the building's footprint. Every box can be filled in by hand: the rates, units, KADAR, JUMLAH and the totals.
          Typed figures turn yellow and are kept (the totals below follow them); clear a box to let the form work it out again.</div>
        ${r && r.catatan ? `<div class="mpk-dpb-info-s">Decision note: ${mpkEscHtml(r.catatan)}</div>` : ''}
      </div>
      <form class="dpb-paper" id="mpk-dpb-form" oninput="mpkDaftarRecalc(event)" onfocusout="setTimeout(mpkDaftarRecalc, 0)" onsubmit="return false" ${locked ? 'inert' : ''}>
        ${mpkDpbPaperHTML(f)}
      </form>
      ${r && r.status === 'menunggu' ? `<label class="mpk-dpb-note">Decision note (optional)
        <textarea id="mpk-dpb-catatan" rows="2" placeholder="e.g. conditions, or the reason for rejecting">${mpkDpbAttr(r.catatan)}</textarea></label>` : ''}
    </div>
    <div class="mpk-dpb-foot">
      <div class="mpk-dpb-total">Jumlah keseluruhan <b id="mpk-dpb-total">RM 0.00</b></div>
      ${foot}
    </div>
  </div>`;
}

// The form itself, laid out as MPK's JKB:(KP)1-03 (four pages)
function mpkDpbPaperHTML(f) {
  const inp = (key, val, cls = '', ph = '') => `<input class="dpb-in ${cls}" data-k="${key}" value="${mpkDpbAttr(val)}"${ph ? ` placeholder="${ph}"` : ''} autocomplete="off">`;
  const num = (key, val, ph = '') => `<input class="dpb-in dpb-num" data-k="${key}" value="${mpkDpbAttr(val)}" inputmode="decimal"${ph ? ` placeholder="${ph}"` : ''} autocomplete="off">`;
  // a worked-out figure, also typed by hand (yellow) when the officer wants another number; empty = worked out again
  const ovr = f.ovr || {};
  const out = id => { const v = ovr[id], man = v !== undefined && String(v).trim() !== '';
    return `<input class="dpb-in dpb-auto${man ? ' manual' : ''}" id="dpb-${id}" data-o="${id}" data-manual="${man ? 1 : ''}" value="${man ? mpkDpbAttr(v) : ''}"
      inputmode="decimal" autocomplete="off" title="Worked out by the form: type to use your own figure, clear it to work it out again">`; };
  // a rate cell: the schedule's rate, ready to be changed
  const rateIn = (key, def, unit, dec = 2) => { const v = (f.rate || {})[key];
    return `<span class="dpb-rate"><input class="dpb-in dpb-num dpb-r${v !== undefined && String(v).trim() !== '' && parseFloat(v) !== def ? ' manual' : ''}" data-r="${key}"
      value="${mpkDpbAttr(v !== undefined && String(v).trim() !== '' ? v : def.toFixed(dec))}" inputmode="decimal" autocomplete="off"><small>${unit}</small></span>`; };
  const bar = t => `<div class="dpb-bar">${t}</div>`;
  const floorRows = (key, vals) => MPK_DPB_FLOORS.map(([fl, rate, min], i) => `<tr>
      <td class="c">${fl}<br><i>(MIN RM ${min})</i></td><td class="c">${rateIn(key + '.' + i, rate, '/M.PER')}</td>
      <td>${num(key + '.' + i, (vals || [])[i])}</td><td class="r">${out(key + '-' + i + '-k')}</td><td class="r">${out(key + '-' + i + '-j')}</td></tr>`).join('');
  const areaHead = (first = 'TINGKAT') => `<tr><th>${first}</th><th>KADAR BAYARAN<br><i>( RM )</i></th><th>LUAS<br><i>( M.PER )</i></th>
      <th>KADAR<br><i>( 1/9 M.PER )</i></th><th>JUMLAH<br><i>( RM )</i></th></tr>`;
  const sub = (cols, id) => `<tr class="sub"><td colspan="${cols}">JUMLAH KECIL</td><td class="r">${out(id)}</td></tr>`;
  const one = (key, val, def, unit) => `<table class="dpb-t narrow">
      <tr><th>KADAR BAYARAN<br><i>( RM )</i></th><th>LUAS<br><i>( M.PER )</i></th><th>KADAR<br><i>( 1/9 M.PER )</i></th><th>JUMLAH<br><i>( RM )</i></th></tr>
      <tr><td class="c">${rateIn(key, def, unit)}</td><td>${num(key, val)}</td><td class="r">${out(key + '-k')}</td><td class="r">${out(key + '-j')}</td></tr>
      ${sub(3, key + '-sub')}</table>`;
  const count = (key, val, def, unit, what) => `<table class="dpb-t small">
      <tr><th>KADAR BAYARAN<br><i>( RM )</i></th><th>${what}</th><th>JUMLAH<br><i>( RM )</i></th></tr>
      <tr><td class="c">${rateIn(key, def, unit)}</td><td>${num(key, val)}</td><td class="r">${out(key + '-j')}</td></tr>
      ${sub(2, key + '-sub')}</table>`;
  const khas = MPK_DPB_KHAS.map(([key, label, , def, kind, group]) => (group
    ? `<tr class="grp"><td>${group}</td><td></td><td></td><td></td><td></td></tr>` : '') + `<tr>
      <td class="c">${label}</td><td class="c">${rateIn('khas.' + key, def, kind === 'area' ? '/M.PER' : 'PER 1 STRUKTUR')}</td>
      <td>${num('khas.' + key, (f.khas || {})[key], kind === 'count' ? 'bil.' : '')}</td>
      <td class="r">${kind === 'area' ? out('khas-' + key + '-k') : ''}</td><td class="r">${out('khas-' + key + '-j')}</td></tr>`).join('');
  const p9 = MPK_DPB_SERIES.map(([label, , share], i) => `<tr>
      <td class="c">${label}</td><td class="c">${i === 0 ? '<span class="dpb-rate"><b>PENUH</b></span>' : rateIn('p9.' + i, share * 100, '%')}</td><td class="r">${out('p9-k' + i)}</td>
      <td class="c">${out('p9-u' + i)}</td><td class="r">${out('p9-j' + i)}</td></tr>`).join('');

  return `
  <section class="dpb-page">
    <div class="dpb-head">
      <img src="mpk/mpk_logo.png" alt="Majlis Perbandaran Kemaman" class="dpb-logo">
      <div class="dpb-addr">Majlis Perbandaran Kemaman,<br>24000 Kemaman, Terengganu Darul Iman.
        <small>Tel : 09-8597777 &amp; 09-8597700 Fax : 09-8595455</small><small>Bebas Tol : 1-800-88-7009</small>
        <small>Email : mdktrg@tm.net.my &nbsp; http://mpk.terengganu.gov.my</small></div>
      <div class="dpb-code">JKB:(KP)1-03</div>
    </div>
    <div class="dpb-title"><b>BORANG PERKIRAAN DAFTAR PELAN BANGUNAN</b><span>JABATAN KAWALAN BANGUNAN</span></div>
    <div class="dpb-fields">
      <div class="dpb-f"><label>Projek</label><span>:</span>${inp('projek', f.projek)}</div>
      <div class="dpb-f helai"><label>Helai No. :</label>${inp('helai', f.helai, 'dot')}</div>
      <div class="dpb-f"><label>No. Rujukan Fail</label><span>:</span>${inp('fail', f.fail)}</div>
      <div class="dpb-f"><label>Jenis Bangunan</label><span>:</span>${inp('jenis', f.jenis)}</div>
      <div class="dpb-f"><label>Bil. Unit</label><span>:</span>${num('unit', f.unit)}</div>
      <div class="dpb-f tajuk"><label>Bertajuk</label><span>:</span>
        <div class="dpb-lines">${[0, 1, 2].map(i => inp('tajuk.' + i, (f.tajuk || [])[i], 'long')).join('')}
          <div class="dpb-for">untuk pertimbangan dan kelulusan.</div></div></div>
    </div>
    ${bar('PELAN BANGUNAN BARU (UUKBS 1984 – JADUAL PERTAMA PARAGRAF 1):-')}
    <p class="dpb-desc">- Perkiraan berkenaan dengan pelan-pelan bagi bangunan-bangunan yang digunakan secara eksklusif untuk diluluskan.</p>
    <table class="dpb-t">${areaHead()}${floorRows('p1', f.p1)}${sub(4, 'p1-sub')}</table>
    ${bar('PELAN BANGUNAN BARU (UUKBS 1984 – JADUAL PERTAMA PARAGRAF 9):-')}
    <p class="dpb-desc">- Perkiraan bagi suatu rangkaian atau deretan bangunan daripada pelan yang sama, bahan yang sama dan dikemukakan pada masa yang sama.</p>
    <div class="dpb-inline">Kadar seunit (RM) ${num('p9k', f.p9k, 'jumlah seunit, perenggan 1')}<small>Bil. unit diagih dari <b>Bil. Unit</b> di atas.</small></div>
    <table class="dpb-t"><tr><th>BANGUNAN</th><th>KADAR BAYARAN<br><i>( RM )</i></th><th>KADAR<br>SEUNIT</th><th>BIL. UNIT</th><th>JUMLAH<br><i>( RM )</i></th></tr>
      ${p9}${sub(4, 'p9-sub')}</table>
    <div class="dpb-pno">1</div>
  </section>

  <section class="dpb-page">
    ${bar('PELAN BANGUNAN SEMENTARA (UUKBS 1984 – JADUAL PERTAMA PARAGRAF 2):-')}
    <p class="dpb-desc">- Perkiraan bagi suatu bangunan untuk diluluskan atas asas sementara dari setahun ke setahun dan pelan-pelan lakar percubaan.</p>
    ${one('p2', f.p2, 7, '/M.PER')}
    ${bar('PELAN BANGUNAN TAMBAHAN (UUKBS 1984 – JADUAL PERTAMA PARAGRAF 6-1):-')}
    <p class="dpb-desc">- Perkiraan bagi perubahan bangunan sedia ada.</p>
    ${one('p61', f.p61, 7, '/M.PER')}
    ${bar('PELAN BANGUNAN PENGUBAHSUAIAN (UUKBS 1984 – JADUAL PERTAMA PARAGRAF 6-5):-')}
    <p class="dpb-desc">- Perkiraan bagi perubahan bangunan sedia ada yang melibatkan pecah bahagian bilik-bilik menjadi bilik-bilik yang lebih kecil.</p>
    ${count('p65', f.p65, 50, '/UNIT', 'BIL. UNIT')}
    ${bar('PELAN KHAS (UUKBS 1984 – JADUAL PERTAMA PARAGRAF 7 &amp; 8):-')}
    <table class="dpb-t">${areaHead('JENIS PELAN')}${khas}${sub(4, 'khas-sub')}</table>
    <div class="dpb-pno">2</div>
  </section>

  <section class="dpb-page">
    ${bar('PELAN PINDAAN (UUKBS 1984 – JADUAL PERTAMA PARAGRAF 10-1):-')}
    <p class="dpb-desc">- Perkiraan bagi suatu pindaan daripada pelan yang diluluskan dan dikemukakan untuk diluluskan mengikut bilangan helaian pelan yang dipinda untuk diluluskan.</p>
    ${count('p101', f.p101, 120, '/PELAN', 'BIL. PELAN')}
    ${bar('PELAN PINDAAN (UUKBS 1984 – JADUAL PERTAMA PARAGRAF 10-2):-')}
    <p class="dpb-desc">- Perkiraan bagi suatu pindaan daripada pelan yang diluluskan dan dikemukakan untuk diluluskan melibatkan kawasan tambahan yang mempunyai keluasan berlebihan dari yang asal mengikut bilangan helaian pelan yang dipinda untuk diluluskan.</p>
    <div class="dpb-ab"><b>A.</b>${count('p102a', f.p102a, 120, '/PELAN', 'BIL. PELAN')}</div>
    <div class="dpb-ab"><b>B.</b><table class="dpb-t">${areaHead()}${floorRows('p102b', f.p102b)}${sub(4, 'p102b-sub')}</table></div>
    <table class="dpb-t small"><tr><th>BAYARAN<br><i>( RM )</i></th><th>JUMLAH<br><i>( RM )</i></th></tr>
      <tr><td class="c">A</td><td class="r">${out('p102-a')}</td></tr><tr><td class="c">B</td><td class="r">${out('p102-b')}</td></tr>
      <tr class="sub"><td>JUMLAH KESELURUHAN</td><td class="r">${out('p102-t')}</td></tr></table>
    <div class="dpb-pno">3</div>
  </section>

  <section class="dpb-page">
    ${bar('JUMLAH BAYARAN BAGI PENDAFTARAN PELAN BANGUNAN:-')}
    <table class="dpb-t small"><tr><th>JENIS PELAN</th><th>JUMLAH<br><i>( RM )</i></th></tr>
      ${MPK_DPB_SUMMARY.map(([k, label]) => `<tr><td class="c">${label}</td><td class="r">${out('sum-' + k)}</td></tr>`).join('')}
      <tr class="sub"><td>JUMLAH KESELURUHAN</td><td class="r">${out('sum-total')}</td></tr></table>
    ${bar('<span class="dpb-c">NOTA:-</span>')}
    <p class="dpb-desc">- 'Bangunan' termasuklah sesebuah rumah, pondok, syed atau kepungan beratap, sama ada digunakan bagi maksud kediaman manusia atau selainnya, dan juga sesuatu tembok, pagar, pelantar, tangki bawah tanah, pementasan, get, tiang, pilar, paling, bingkai, papan dendeng, pelancar, limbungan, dermaga, tembok sambut, jeti, pentas-pengkalan, kolam renang, jambatan, landasan keretapi, talian penghantaran, kabel, talian, redifusyen, talian paip atas atau bawah tanah, atau apa-apa lain rangkabina, tupang atau asas. “Akta Kerajaan Tempatan 1976 (Akta 171)-Bahagian 1 paragraf 2”</p>
    <p class="dpb-desc">- Sila lampirkan jadual pengiraan lain, sekiranya ruang pada jadual pengiraan di atas tidak mencukupi.</p>
    <p class="dpb-calc">Kiraan dalam borang ini: KADAR = luas ÷ 9 m², dibundarkan ke atas; JUMLAH = KADAR × kadar bayaran, tidak kurang daripada minimum tingkat.
      Semua petak boleh diisi sendiri: angka yang ditaip (kuning) dikekalkan dan jumlah di bawahnya mengikutnya; kosongkan petak untuk dikira semula.</p>
    <div class="dpb-pno">4</div>
  </section>`;
}

// Reads the form back into the shape of mpkDpbBlank
function mpkDpbRead() {
  const f = mpkDpbBlank();
  document.querySelectorAll('#mpk-dpb-form [data-k]').forEach(el => {
    const [a, b] = el.dataset.k.split('.');
    const v = el.value.trim();
    if (b === undefined) f[a] = v;
    else if (a === 'khas') { if (v) f.khas[b] = v; }
    else f[a][+b] = v;
  });
  document.querySelectorAll('#mpk-dpb-form [data-r]').forEach(el => { f.rate[el.dataset.r] = el.value.trim(); });
  document.querySelectorAll('#mpk-dpb-form [data-o]').forEach(el => { if (el.dataset.manual && el.value.trim()) f.ovr[el.dataset.o] = el.value.trim(); });
  return f;
}
function mpkDaftarRecalc(e) {
  if (!document.getElementById('mpk-dpb-form')) return;
  const t = e && e.target;
  if (t && t.dataset && t.dataset.o) {                 // a worked-out figure typed by hand, or cleared to be worked out again
    t.dataset.manual = t.value.trim() ? '1' : '';
    t.classList.toggle('manual', !!t.dataset.manual);
  }
  if (t && t.dataset && t.dataset.r) t.classList.toggle('manual', t.value.trim() !== '' && t.value.trim() !== t.defaultValue);
  const c = mpkDpbCalc(mpkDpbRead());
  // a box being typed in is left alone; once left empty it is worked out again (focusout)
  const set = (id, v) => { const el = document.getElementById('dpb-' + id); if (el && !el.dataset.manual && el !== document.activeElement) el.value = v; };
  const rm = mpkDpbRM, n = v => v ? String(v) : '';
  ['p1', 'p102b'].forEach(key => c[key].forEach((r, i) => { set(key + '-' + i + '-k', n(r.kadar)); set(key + '-' + i + '-j', rm(r.jumlah)); }));
  set('p1-sub', rm(c.p1Sub)); set('p102b-sub', rm(c.p102bSub));
  c.p9.forEach((r, i) => { set('p9-k' + i, rm(r.kadar)); set('p9-u' + i, r.kadar || r.unit ? String(r.unit || '') : ''); set('p9-j' + i, rm(r.jumlah)); });
  set('p9-sub', rm(c.p9Sub));
  for (const key of ['p2', 'p61']) { set(key + '-k', n(c[key].kadar)); set(key + '-j', rm(c[key].jumlah)); set(key + '-sub', rm(c[key].sub)); }
  for (const key of ['p65', 'p101', 'p102a']) { set(key + '-j', rm(c[key].jumlah)); set(key + '-sub', rm(c[key].sub)); }
  MPK_DPB_KHAS.forEach(([key], i) => { set('khas-' + key + '-k', n(c.khas[i].kadar)); set('khas-' + key + '-j', rm(c.khas[i].jumlah)); });
  set('khas-sub', rm(c.khasSub));
  set('p102-a', rm(c.p102A)); set('p102-b', rm(c.p102B)); set('p102-t', rm(c.p102Total));
  MPK_DPB_SUMMARY.forEach(([k]) => set('sum-' + k, rm(c.summary[k])));
  set('sum-total', rm(c.total));
  const tot = document.getElementById('mpk-dpb-total');
  if (tot) tot.textContent = 'RM ' + (mpkDpbRM(c.total) || '0.00');
  return c;
}

// ---------- Submit, decide, delete ----------
// The open form kept as the building's registration (new or updated), or null when it is not filled in
function mpkDpbUpsert() {
  const o = MPK_DPB.open;
  if (!o) return null;
  const f = mpkDpbRead(), c = mpkDpbCalc(f);
  if (!f.projek || !(f.tajuk || []).some(Boolean)) { showToast('⚠️ Fill in Projek and Bertajuk in the form'); return null; }
  if (!c.total) { showToast('⚠️ Enter at least one area, unit or plan count in the form so there is a fee'); return null; }
  const now = new Date().toISOString();
  const p = o.p;
  if (o.reg) {
    Object.assign(o.reg, { f, jumlah: c.total, updated: now });
  } else {
    const r = { no: mpkDpbNextNo(MPK_DPB.list, new Date().getFullYear()), bid: o.bid, status: 'menunggu',
      asal: mpkStatus(p, MPK.settings), created: now, updated: now, decided: null, catatan: '', f, jumlah: c.total,
      bangunan: { id: p.id, plus_code: p.plus_code, kawasan: p.kawasan, lot: p.lot || '', upi: p.upi || '',
        area_m2: p.area_m2, lng: p.lng, lat: p.lat } };
    MPK_DPB.list.push(r);
    o.reg = r;
  }
  return o.reg;
}
function mpkDaftarSubmit() {
  const o = MPK_DPB.open;
  if (!mpkDpbUpsert()) return;
  const p = o.p;
  if (!mpkDpbSave()) return;
  showToast(`📝 ${o.reg.no} saved · ${MPK_DPB_STATUS[o.reg.status].label.toLowerCase()}`);
  addActivityLog('Building plan registration', o.reg.no + ' · ' + (p.plus_code || ''));
  mpkDaftarApply();
  mpkDaftarOpen(o.bid);
}
// From the status dropdown: the form saved and decided at once (lulus / tolak / menunggu); the registration or null
function mpkDaftarSaveStatus(status, note) {
  const reg = mpkDpbUpsert();
  if (!reg) return null;
  const now = new Date().toISOString();
  Object.assign(reg, { status, catatan: note || reg.catatan, decided: status === 'menunggu' ? null : now, updated: now });
  if (!mpkDpbSave()) return null;
  addActivityLog('Building plan registration', reg.no + ' · ' + MPK_DPB_STATUS[status].label.toLowerCase());
  return reg;
}
function mpkDaftarDecide(status) {
  const o = MPK_DPB.open;
  if (!o || !o.reg) return;
  const note = document.getElementById('mpk-dpb-catatan');
  if (status !== 'menunggu' && o.reg.status === 'menunggu') {
    Object.assign(o.reg, { f: mpkDpbRead() });
    o.reg.jumlah = mpkDpbCalc(o.reg.f).total;
  }
  o.reg.status = status;
  o.reg.catatan = note ? note.value.trim() : o.reg.catatan;
  o.reg.decided = status === 'menunggu' ? null : new Date().toISOString();
  o.reg.updated = new Date().toISOString();
  if (!mpkDpbSave()) return;
  showToast({ lulus: '✅ ' + o.reg.no + ' approved · the building is now legal', tolak: '⛔ ' + o.reg.no + ' rejected',
    menunggu: '↩️ ' + o.reg.no + ' back to pending approval' }[status], 3500);
  addActivityLog('Registration ' + MPK_DPB_STATUS[status].label.toLowerCase(), o.reg.no);
  mpkDaftarApply();
  mpkDaftarOpen(o.bid);
}
function mpkDaftarDelete(no) {
  const r = MPK_DPB.list.find(x => x.no === no);
  if (!r || !confirm(`Delete registration ${no}? This cannot be undone.`)) return;
  MPK_DPB.list = MPK_DPB.list.filter(x => x !== r);
  if (!mpkDpbSave()) return;
  showToast('🗑️ ' + no + ' deleted');
  mpkDaftarClose();
  mpkDaftarApply();
}

// Print just the form (the paper), as on MPK's sheet
function mpkDaftarPrint() {
  document.body.classList.add('mpk-dpb-printing');
  const done = () => { document.body.classList.remove('mpk-dpb-printing'); window.removeEventListener('afterprint', done); };
  window.addEventListener('afterprint', done);
  window.print();
  setTimeout(done, 1500);
}

// ---------- Registrations page (sidebar, under Features) ----------
const MPK_DPB_NAV_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>'
  + '<polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="13" y2="17"/></svg>';
function mpkDaftarBuildPage() {
  if (!document.getElementById('mpk-nav-daftar')) {
    const after = document.getElementById('mpk-nav-feat') || document.getElementById('mpk-nav-stats');
    const nav = document.createElement('a');
    nav.href = '#';
    nav.className = 'nav-item mpk-nav';
    nav.id = 'mpk-nav-daftar';
    nav.innerHTML = MPK_DPB_NAV_ICON + 'Registrations';
    nav.addEventListener('click', e => { e.preventDefault(); mpkShowPage('daftar'); });
    after.after(nav);
  }
  if (!document.getElementById('mpk-daftar-page')) {
    const page = document.createElement('section');
    page.id = 'mpk-daftar-page';
    page.className = 'mpk-stats-page mpk-dpb-page';
    page.hidden = true;
    page.setAttribute('aria-label', 'Registrations');
    page.innerHTML = `<div class="mpk-stats-inner">
        <div class="mpk-stats-head">
          <div><h2>Building plan registrations</h2>
            <p>Borang Perkiraan Daftar Pelan Bangunan filled in for illegal and pending buildings, waiting for approval or decided.</p></div>
          <div class="mpk-dpb-actions">
            <button type="button" class="mpk-btn ghost" onclick="mpkDaftarGuide()">Guideline · Tr. P.U. 9/2026</button>
            <button type="button" class="mpk-btn" onclick="mpkDaftarExport('csv')">Export CSV</button>
            <button type="button" class="mpk-btn ghost" onclick="mpkDaftarExport('json')">Export JSON</button>
            <label class="mpk-btn ghost mpk-dpb-import">Import JSON<input type="file" accept=".json,application/json" onchange="mpkDaftarImport(this)"></label>
          </div>
        </div>
        <div class="mpk-dpb-counts" id="mpk-dpb-counts"></div>
        <div class="mpk-dpb-filters" role="tablist" id="mpk-dpb-filters"></div>
        <div class="mpk-dpb-list" id="mpk-dpb-list"></div>
        <div class="mpk-note">To register: on the Dashboard map click an <b>illegal</b> or <b>pending</b> building, then <i>Register building plan</i>.
          Click a registration here to open its form: approve or reject it, reopen or delete it. Approving makes the building legal.
          Registrations are saved in this browser only: use Export / Import to move them to another computer.</div>
      </div>`;
    document.getElementById('mapWrapper').appendChild(page);
  }
  mpkDaftarRenderList();
}
function mpkDaftarRenderList() {
  const list = document.getElementById('mpk-dpb-list');
  if (!list) return;
  const n = s => MPK_DPB.list.filter(r => r.status === s).length;
  const nav = document.getElementById('mpk-nav-daftar');
  if (nav) nav.innerHTML = MPK_DPB_NAV_ICON + 'Registrations' + (n('menunggu') ? `<span class="mpk-dpb-dot" title="Pending approval">${n('menunggu')}</span>` : '');
  document.getElementById('mpk-dpb-counts').innerHTML = Object.entries(MPK_DPB_STATUS).map(([k, s]) =>
    `<div class="mpk-dpb-count ${k}"><b>${n(k)}</b><span>${s.label}</span></div>`).join('');
  document.getElementById('mpk-dpb-filters').innerHTML = [['', 'All', MPK_DPB.list.length], ...Object.entries(MPK_DPB_STATUS).map(([k, s]) => [k, s.label, n(k)])]
    .map(([k, label, c]) => `<button type="button" class="mpk-chip${MPK_DPB.filter === k ? ' active' : ''}" onclick="mpkDaftarFilter('${k}')">${label} · ${c}</button>`).join('');
  const rows = MPK_DPB.list.filter(r => !MPK_DPB.filter || r.status === MPK_DPB.filter)
    .sort((a, b) => (b.status === 'menunggu') - (a.status === 'menunggu') || b.created.localeCompare(a.created));   // pending first, newest first
  list.innerHTML = rows.length ? rows.map(r => {
    const b = r.bangunan || {};
    return `<button type="button" class="mpk-dpb-row" onclick='mpkDaftarGo(${JSON.stringify(r.no)})'>
      <div class="mpk-dpb-row-t"><b>${mpkEscHtml(r.no)}</b><span class="mpk-dpb-badge ${r.status}">${MPK_DPB_STATUS[r.status].label}</span></div>
      <div class="mpk-dpb-row-l">${mpkEscHtml(r.f.projek || '')}</div>
      <div class="mpk-dpb-row-m">${[b.plus_code, (MPK_AREAS[b.kawasan] || {}).short, b.lot ? 'Lot ' + b.lot : '', 'RM ' + mpkDpbRM(r.jumlah),
        mpkPlanDateLabel(r.created.slice(0, 10))].filter(Boolean).map(mpkEscHtml).join(' · ')}</div>
    </button>`;
  }).join('') : `<div class="mpk-reg-empty">${MPK_DPB.list.length ? 'No registration with this status.' : 'No registrations yet.'}</div>`;
}
function mpkDaftarFilter(k) { MPK_DPB.filter = k; mpkDaftarRenderList(); }
function mpkDaftarGo(no) {
  const r = MPK_DPB.list.find(x => x.no === no);
  if (!r) return;
  const b = r.bangunan || {};
  if (MPK.page !== 'dashboard') mpkShowPage('dashboard');       // the building behind the form
  if (map && b.lng != null) map.flyTo({ center: [b.lng, b.lat], zoom: 18.2 });
  mpkDaftarOpen(r.bid);
}

function mpkDaftarExport(kind) {
  if (!MPK_DPB.list.length) { showToast('⚠️ No registrations to export'); return; }
  let blob, name;
  const day = new Date().toISOString().slice(0, 10);
  if (kind === 'json') {
    blob = new Blob([JSON.stringify(MPK_DPB.list, null, 1)], { type: 'application/json' });
    name = `mpk_registrations_${day}.json`;
  } else {
    const q = v => { const s = String(v == null ? '' : v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const head = ['no', 'status', 'plus_code', 'area', 'lot', 'upi', 'footprint_m2', 'map_status_before', 'projek', 'no_rujukan_fail',
      'jenis_bangunan', 'bil_unit', 'bertajuk', 'jumlah_rm', 'submitted', 'decided', 'note'];
    const rows = MPK_DPB.list.map(r => { const b = r.bangunan || {};
      return [r.no, MPK_DPB_STATUS[r.status].ms, b.plus_code, (MPK_AREAS[b.kawasan] || {}).short, b.lot, b.upi, b.area_m2, r.asal, r.f.projek, r.f.fail,
        r.f.jenis, r.f.unit, (r.f.tajuk || []).filter(Boolean).join(' '), r.jumlah.toFixed(2), r.created.slice(0, 10),
        r.decided ? r.decided.slice(0, 10) : '', r.catatan].map(q).join(','); });
    blob = new Blob(['﻿' + [head.join(','), ...rows].join('\n') + '\n'], { type: 'text/csv;charset=utf-8' });
    name = `mpk_registrations_${day}.csv`;
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
// Adds registrations from an exported file; one with the same number replaces the one here
function mpkDaftarImport(input) {
  const file = input.files && input.files[0];
  input.value = '';
  if (!file) return;
  file.text().then(t => {
    const v = JSON.parse(t);
    if (!Array.isArray(v) || !v.every(r => r && r.no && r.bid != null && r.f && MPK_DPB_STATUS[r.status])) throw new Error('not a registrations file');
    let added = 0, replaced = 0;
    for (const r of v) {
      const i = MPK_DPB.list.findIndex(x => x.no === r.no || String(x.bid) === String(r.bid));
      if (i >= 0) { MPK_DPB.list[i] = r; replaced++; } else { MPK_DPB.list.push(r); added++; }
    }
    if (!mpkDpbSave()) return;
    mpkDaftarApply();
    showToast(`📥 ${added} added, ${replaced} replaced`);
  }).catch(e => showToast('⚠️ Could not import: ' + e.message, 5000));
}

// ---------- Guideline: Tr. P.U. 9/2026 ----------
// Kaedah-Kaedah Pengawalan Perancangan (Am) (Terengganu) (Pindaan) 2026, Jadual Ketiga as gazetted
const MPK_PU9_A = [
  ['1', 'Memproses permohonan kebenaran merancang untuk memecah sempadan atau mencantumkan tanah', [['a) tidak melebihi 4 lot/petak', '100.00/permohonan'], ['b) melebihi 4 lot/petak', '150.00/permohonan']]],
  ['2', 'Memproses permohonan kebenaran kerja bangunan', [['a) kediaman bertanah', '100.00/permohonan'], ['b) kediaman bertingkat/berstrata', '250.00/permohonan'], ['c) lain-lain (pembangunan bercampur, komersial, industri)', '500.00/permohonan']]],
  ['3', 'Memproses permohonan kebenaran merancang untuk membuat perubahan material penggunaan tanah atau bangunan', '100.00/permohonan'],
  ['4', 'Memproses permohonan kebenaran merancang untuk membuat pindaan kepada kelulusan kebenaran merancang', [['a) kediaman', '150.00/permohonan'], ['b) lain-lain', '250.00/permohonan']]],
  ['5', 'Memproses permohonan untuk menjalankan apa-apa kerja operasi seperti kejuruteraan, perlombongan, perindustrian atau pertanian', '500.00/permohonan'],
  ['6', 'Lain-lain permohonan', '200.00/permohonan'],
];
const MPK_PU9_B = [
  ['1. Kebenaran Merancang bagi Susun Atur Penggunaan Tanah', [
    ['A. Kediaman Bertanah', [['i. Rumah kos rendah/mampu milik', '30.00/plot'], ['ii. Lain-lain jenis kediaman', '50.00/plot']]],
    ['B. Kediaman Bertingkat/Berstrata', [['i. Rumah kos rendah/mampu milik', '150.00/plot'], ['ii. Lain-lain jenis kediaman', '300.00/plot']]],
    ['C. Komersial', [['i. Kedai mampu milik/Tapak penjaja', '50.00/plot'], ['ii. Kedai/Rumah kedai/Kedai pejabat', '100.00/plot'],
      ['iii. Kedai/Rumah kedai/Kedai pejabat berstrata', '500.00/plot'], ['iv. Stesen minyak', '500.00/plot'],
      ['v. Stesen minyak dengan perkhidmatan dan lain-lain', '1,000.00/plot'], ['vi. Gedung membeli belah, pasar raya besar, taman tema dan pembangunan bercampur', '5,000.00/plot'],
      ['vii. Pusat pengajian', '4,000.00/plot'], ['viii. Pasar raya, pangsapuri perkhidmatan, SOHO, pusat pameran, galeri, hotel, resort dan kompleks pejabat', '3,000.00/plot'],
      ['ix. Hospital/Klinik swasta', '2,000.00/plot'], ['x. Padang golf', '500.00/lubang'], ['xi. Rumah kelab/persatuan/pertubuhan', '500.00/plot'],
      ['xii. Lapang sasar, tapak tempat letak kenderaan dan sekolah memandu', '1,000.00/plot'], ['xiii. Restoran pandu lalu, homestay dan chalet', '1,000.00/plot'],
      ['xiv. Tadika/Taska/Pusat jagaan', '100.00/plot'], ['xv. Perkuburan swasta', '100.00/plot'],
      ['xvi. Institusi swasta seperti madrasah dan sekolah tahfiz', '100.00/plot'], ['xvii. Lain-lain komersial', '200.00/plot']]],
    ['D. Industri', [['i. Industri jenis teres', '100.00/plot'], ['ii. Lain-lain industri', '200.00/plot']]],
    ['E. Pertanian', [['i. Plot pertanian biasa/Dusun', '40.00/plot']]],
    ['F. Cantuman Lot', '100.00/lot asal'],
    ['G. Institusi dan kemudahan masyarakat', [['i. Kuil, gereja, tokong', '100.00/plot']]],
    ['H. Pengangkutan', '500.00/plot'],
    ['I. Lain-lain seperti kawasan lapang, tapak pencawang elektrik, tapak tangki air, loji pembentungan dan lain-lain rizab utiliti/infrastruktur', '100.00/plot']]],
  ['2. Kebenaran Merancang bagi Pendirian Bangunan', [
    ['A. Kediaman', [['i. Rumah kos rendah/mampu milik', '30.00/unit'], ['ii. Lain-lain jenis kediaman', '50.00/unit']]],
    ['B. Komersial (kiraan fi berdasarkan luas lantai kasar dan tapak pemajuan)', [['i. Kedai mampu milik', '50.00/unit atau tingkat'],
      ['ii. Kedai/Rumah kedai/Kedai pejabat termasuk berstrata', '100.00/unit atau tingkat'], ['iii. Stesen minyak', '500.00/unit'],
      ['iv. Stesen minyak dengan perkhidmatan', '1,000.00/unit'],
      ['v. Komersial utama (gedung membeli belah, pasar raya, hotel, resort, kompleks pejabat, kompleks sukan, pangsapuri perkhidmatan, panggung wayang, taman tema, SOHO, pusat pameran, galeri, pusat pengajian)', '1.00/meter persegi'],
      ['vi. Lain-lain komersial (hospital, klinik, homestay, chalet, rumah kelab, lapang sasar, sekolah memandu, restoran pandu lalu, tadika, taska, extreme park, madrasah, sekolah tahfiz, kemudahan rekreasi)', '1.00/meter persegi'],
      ['vii. Tempat letak kenderaan persendirian berpusat (terbuka atau kompleks) termasuk kenderaan berat', '200.00/tapak atau 10.00/petak, mana-mana lebih tinggi'],
      ['viii. Kubur/Krematorium/Pusat peringatan', '500.00/permohonan'], ['ix. Papan iklan luar (Billboard/Digital Board)', '1,000.00/unit']]],
    ['C. Industri Ringan dan Sederhana (termasuk kontena; luas lantai kasar termasuk tapak pemajuan)', '1.00/meter persegi'],
    ['D. Industri Berat dan Khas (termasuk kontena; luas lantai kasar termasuk tapak pemajuan)', '2.00/meter persegi'],
    ['E. Infrastruktur dan Utiliti', [['i. Talian rentis (lebuh raya, jalan raya utama, rel, kabel, paip, konveyor)', '500.00/kilometer'],
      ['ii. Struktur telekomunikasi: a. kurang 30 m / b. 30 m dan ke atas / c. di atas bangunan atau struktur', '500.00 / 1,000.00 / 100.00 seunit'],
      ['iii. Pencawang masuk utama', '2,000.00/permohonan'], ['iv. Pencawang pembahagi utama', '1,000.00/permohonan'],
      ['v. Pencawang elektrik termasuk compact sub dan lain-lain', '100.00/unit'], ['vi. Loji rawatan kumbahan berpusat', '2,000.00/permohonan'],
      ['vii. Sistem rawatan kumbahan', '100.00/unit'], ['viii. Menara tangki air', '100.00/unit'], ['ix. Mesin komposit', '100.00/unit'],
      ['x. Insinerator', '500.00/unit'], ['xi. Tapak pengurusan sisa pepejal dan enap cemar termasuk transfer station', '5,000.00/permohonan'],
      ['xii. Empangan hidro', '50,000.00/permohonan'], ['xiii. Lain-lain infrastruktur dan utiliti', '1,000.00/permohonan']]],
    ['F. Pengangkutan', [['i. Lapangan terbang', '20,000.00/permohonan'], ['ii. Pelabuhan/Marina', '10,000.00/permohonan'],
      ['iii. Stesen/terminal pengangkutan awam dan kenderaan berat', '5,000.00/permohonan'], ['iv. Jeti pelancongan/pengangkutan dan pelantar perikanan', '1,000.00/unit'],
      ['v. Tambahan, naik taraf dan ubah suai', '2.00/meter persegi'], ['vi. Lain-lain pengangkutan', '500.00/permohonan']]],
    ['G. Pertanian, Penternakan dan Perikanan (ladang ternakan dan unggas, tanaman, burung walit, kolam/tangki/sangkar, tapak semaian)', '500.00/permohonan atau 100.00/ekar, mana-mana lebih tinggi'],
    ['H. Pemajuan Solar', '1.00/meter persegi']]],
  ['3. Kebenaran Merancang bagi Perobohan (luas lantai kasar termasuk tapak pemajuan)', '20.00/10 meter persegi'],
  ['4. Kebenaran Merancang Melibatkan Ruang Udara', '500.00/permohonan'],
  ['5. Kebenaran Merancang bagi Kerja Kejuruteraan, Perlombongan dan Perindustrian', '1.00/meter persegi atau 5,000.00/permohonan, mana-mana lebih tinggi'],
  ['6. Kebenaran Merancang bagi Perubahan Material Penggunaan Tanah', '500.00/permohonan atau 100.00/ekar, mana-mana lebih tinggi'],
  ['7. Kebenaran Merancang bagi Perubahan Material Penggunaan Bangunan', '200.00/permohonan atau 1.00/meter persegi, mana-mana lebih tinggi'],
  ['8. Pindaan kepada Kelulusan Kebenaran Merancang', [['i. Tambahan dan pengurangan luas lantai/unit', 'Fi sebagaimana di ruang (2) Bahagian B'],
    ['ii. Rupa bangunan (fasad), tidak melibatkan tambahan atau pengurangan ruang lantai/unit', '500.00/permohonan']]],
];
// '100.00/permohonan' → RM 100.00 in bold with its unit after it (every amount in a fee text)
const mpkPu9Fee = v => String(v).replace(/(\d[\d,]*\.\d\d)(\/|\s(?=per|PER))?/g, (m, n, sl) => `<b>RM ${n}</b>${sl ? ' / ' : ' '}`)
  .replace(/ \/ (\S)/g, ' / $1');
// a colour and an icon for a fee group, from what it is about
function mpkPu9Kind(label) {
  const t = String(label).toLowerCase();
  const kinds = [['kediaman', 'k-home', '🏠'], ['komersial', 'k-shop', '🏪'], ['industri', 'k-ind', '🏭'], ['pertanian', 'k-agri', '🌾'],
    ['infrastruktur', 'k-util', '⚡'], ['utiliti', 'k-util', '⚡'], ['pengangkutan', 'k-trans', '🚢'], ['institusi', 'k-inst', '🕌'],
    ['solar', 'k-solar', '☀️'], ['cantuman', 'k-lot', '🧩'], ['perobohan', 'k-demo', '🚧'], ['ruang udara', 'k-air', '✈️'],
    ['perlombongan', 'k-ind', '⛏️'], ['penggunaan tanah', 'k-agri', '🗺️'], ['penggunaan bangunan', 'k-shop', '🏢'], ['pindaan', 'k-amend', '✏️'],
    ['susun atur', 'k-lot', '📐'], ['pendirian', 'k-home', '🏗️']];
  const k = kinds.find(([w]) => t.includes(w));
  return k ? { cls: k[1], ic: k[2] } : { cls: 'k-other', ic: '•' };
}
function mpkPu9Rows(items, depth = 0) {
  return items.map(([label, v]) => Array.isArray(v)
    ? `<tr class="h${depth} ${mpkPu9Kind(label).cls}"><td colspan="2"><span class="pu9-ic">${mpkPu9Kind(label).ic}</span>${label}</td></tr>${mpkPu9Rows(v, depth + 1)}`
    : `<tr class="d${depth}" data-q="${mpkEscHtml(String(label + ' ' + v).toLowerCase())}"><td>${label}</td><td class="fee">${mpkPu9Fee(v)}</td></tr>`).join('');
}
// Part B as one collapsible block per category; the first is open
function mpkPu9Blocks() {
  return MPK_PU9_B.map(([label, v], i) => Array.isArray(v)
    ? `<details class="pu9-block ${mpkPu9Kind(label).cls}"${i === 0 ? ' open' : ''}><summary><span><span class="pu9-ic">${mpkPu9Kind(label).ic}</span>${label}</span><em>${v.length} jenis</em></summary>
        <table class="pu9-t">${mpkPu9Rows(v)}</table></details>`
    : `<div class="pu9-block flat ${mpkPu9Kind(label).cls}" data-q="${mpkEscHtml(String(label + ' ' + v).toLowerCase())}"><span><span class="pu9-ic">${mpkPu9Kind(label).ic}</span>${label}</span><div class="fee">${mpkPu9Fee(v)}</div></div>`).join('');
}
// Search over every fee row: rows that do not match hide, their blocks open when something inside matches
function mpkPu9Search(q) {
  q = q.trim().toLowerCase();
  const el = document.getElementById('mpk-pu9');
  el.querySelectorAll('[data-q]').forEach(r => { r.hidden = !!q && !r.dataset.q.includes(q); });
  el.querySelectorAll('.pu9-t tr.h0, .pu9-t tr.h1').forEach(h => {
    let n = h.nextElementSibling, any = false;
    while (n && !n.classList.contains(h.classList.contains('h0') ? 'h0' : 'h1') && !(h.classList.contains('h1') && n.classList.contains('h0'))) {
      if (n.dataset.q && !n.hidden) any = true;
      n = n.nextElementSibling;
    }
    h.hidden = !!q && !any;
  });
  el.querySelectorAll('details.pu9-block').forEach(d => {
    const any = [...d.querySelectorAll('tr[data-q]')].some(r => !r.hidden);
    d.hidden = !!q && !any;
    if (q && any) d.open = true;
  });
  el.querySelectorAll('.pu9-sec').forEach(sec => {
    const rows = sec.querySelectorAll('[data-q]');
    sec.hidden = !!q && rows.length > 0 && ![...rows].some(r => !r.hidden);
  });
  const none = document.getElementById('pu9-none');
  if (none) none.hidden = !q || [...el.querySelectorAll('[data-q]')].some(r => !r.hidden);
}
function mpkPu9Go(id) {
  const t = document.getElementById(id), box = document.querySelector('#mpk-pu9 .pu9');
  if (t && box) box.scrollTo({ top: t.offsetTop - box.offsetTop - 8, behavior: 'smooth' });
}
function mpkDaftarGuide() {
  let el = document.getElementById('mpk-pu9');
  if (!el) {
    el = document.createElement('div');
    el.id = 'mpk-pu9';
    el.className = 'mpk-dpb-overlay guide';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-labelledby', 'mpk-pu9-title');
    el.addEventListener('keydown', e => { if (e.key === 'Escape') { el.hidden = true; } });
    const key = [['30%', 'Fi khidmat nasihat', 'daripada fi Bahagian A dan B (kaedah 5A, baharu)', 'c-blue', '💡'],
      ['+30%', 'Kebenaran merancang khas', 'tambahan atas fi Bahagian A dan B', 'c-purple', '⭐'],
      ['5 – 20×', 'Pemajuan tanpa kebenaran', 'fi Bahagian B (Bahagian D)', 'c-red', '⚠️'],
      ['RM 1,000', 'Sumbangan tempat letak kenderaan', 'per m² petak, Majlis Perbandaran (Jadual Keenam)', 'c-green', '🚗']];
    const points = [
      ['Kaedah 3(3)', 'Permohonan secara <i>kebenaran merancang biasa</i> atau <i>khas</i>; fi permohonan seperti Bahagian A. Tempoh kaedah 3(5) kini ditetapkan oleh pihak berkuasa perancang tempatan.'],
      ['Kaedah 5A · baharu', 'Khidmat nasihat perancangan sebelum memohon, fi <b>30%</b> daripada fi Bahagian A dan Bahagian B.'],
      ['Kaedah 22', '“Tempat letak kereta” kini “tempat letak kenderaan”.'],
      ['Borang A diganti', 'Jenis pemajuan (a) hingga (h), perihal tanah, status pemajuan di tapak 30 hari sebelum permohonan, pihak berkepentingan, persetujuan pemunya tanah dan pemunya tanah berjiran.'],
      ['Jadual Kedua diganti', 'Pelan berwarna berskala 1:100 – 1:1500, tanda utara dan kiblat, pelan kunci dan lokasi, topografi, saliran, anjakan, tempat letak kenderaan, pelan lantai, keratan, perspektif; hakmilik dan carian rasmi (≤ 6 bulan), foto tapak (≤ 30 hari) dan laporan sokongan.'],
      ['Borang D diganti', 'Tuntutan kesusutan nilai tanah kerana mematuhi notis rekuisisi, dalam tempoh 6 bulan.'],
    ];
    const nav = [['pu9-ringkas', 'Ringkasan'], ['pu9-a', 'A · Fi memproses'], ['pu9-b', 'B · Fi kebenaran'], ['pu9-c', 'C · Lanjutan'], ['pu9-d', 'D · Tanpa kebenaran'], ['pu9-6', 'Tempat letak']];
    el.innerHTML = `<div class="mpk-dpb-shell guide">
      <div class="mpk-dpb-bar pu9-bar pu9-hero">
        <span class="pu9-logo"><img src="mpk/mpk_logo.png" alt="Majlis Perbandaran Kemaman"></span>
        <div class="mpk-dpb-bar-t"><div class="pu9-org">Majlis Perbandaran Kemaman · Panduan rujukan</div>
          <div id="mpk-pu9-title">Panduan fi kebenaran merancang · Tr. P.U. 9/2026</div>
          <div class="pu9-chips"><span>Kaedah-Kaedah Pengawalan Perancangan (Am) (Terengganu) (Pindaan) 2026</span><span>Warta 10 Sep 2026</span>
            <span>Jil. 79 No. 37 · Tambahan No. 5</span><span>Akta 172, s.58</span></div></div>
        <button type="button" class="mpk-dpb-x" onclick="document.getElementById('mpk-pu9').hidden = true" aria-label="Close">×</button>
      </div>
      <div class="pu9-tools">
        <nav class="pu9-nav" aria-label="Bahagian">${nav.map(([id, l]) => `<button type="button" class="n-${id.slice(4)}" onclick="mpkPu9Go('${id}')">${l}</button>`).join('')}</nav>
        <input type="search" class="pu9-q" placeholder="Cari fi: cth. industri, hotel, pencawang, perobohan" oninput="mpkPu9Search(this.value)" aria-label="Cari fi">
      </div>
      <div class="mpk-dpb-scroll pu9">
        <section class="pu9-sec sec-r" id="pu9-ringkas">
          <div class="pu9-key">${key.map(([v, t, d, c, ic]) => `<div class="${c}"><i aria-hidden="true">${ic}</i><b>${v}</b><span>${t}</span><small>${d}</small></div>`).join('')}</div>
          <h4>Perkara utama pindaan</h4>
          <div class="pu9-points">${points.map(([t, d], i) => `<div class="pt${i}"><i aria-hidden="true">${['📝', '💡', '🚗', '📄', '📐', '⚖️'][i]}</i><div><b>${t}</b><p>${d}</p></div></div>`).join('')}</div>
          <p class="pu9-lead">Dibuat di bawah subseksyen 58(1) dan (2) Akta Perancangan Bandar dan Desa 1976 [Akta 172]; terpakai bagi semua kawasan pihak
            berkuasa perancang tempatan di Terengganu dan berkuat kuasa pada tarikh disiarkan dalam Warta. Dibuat 26 Julai 2026 [JPBD.Tr.09/0134; PUN.TR.26/2024/7].</p>
        </section>
        <section class="pu9-sec sec-a" id="pu9-a">
          <h4 class="pu9-h"><span class="pu9-tag">A</span> Fi memproses permohonan kebenaran merancang <small>Jadual Ketiga · subkaedah 5(1)</small></h4>
          <table class="pu9-t">${MPK_PU9_A.map(([no, label, v]) => Array.isArray(v) ? `<tr class="h0"><td colspan="2">${no}. ${label}</td></tr>${mpkPu9Rows(v, 1)}`
            : `<tr class="d0" data-q="${mpkEscHtml((label + ' ' + v).toLowerCase())}"><td>${no}. ${label}</td><td class="fee">${mpkPu9Fee(v)}</td></tr>`).join('')}</table>
          <div class="pu9-note">Kebenaran merancang <b>khas</b> (ditentukan oleh PBPT): fi Bahagian A dan B dengan <b>tambahan 30%</b>.</div>
        </section>
        <section class="pu9-sec sec-b" id="pu9-b">
          <h4 class="pu9-h"><span class="pu9-tag">B</span> Fi bagi kebenaran merancang <small>Jadual Ketiga · subkaedah 5(2) · klik kategori untuk buka</small></h4>
          ${mpkPu9Blocks()}
          <div class="pu9-note">Semua fi Bahagian B tertakluk kepada mana-mana yang lebih tinggi.</div>
        </section>
        <section class="pu9-sec sec-c" id="pu9-c">
          <h4 class="pu9-h"><span class="pu9-tag">C</span> Fi melanjutkan kebenaran merancang <small>subkaedah 5(3)</small></h4>
          <div class="pu9-block flat" data-q="lanjutan melanjutkan kebenaran merancang 100 20%"><span>Kategori 1 hingga 8 Bahagian B</span>
            <div class="fee"><b>RM 100.00</b> setiap permohonan atau <b>20%</b> daripada fi terdahulu, mana-mana lebih tinggi</div></div>
        </section>
        <section class="pu9-sec sec-d" id="pu9-d">
          <h4 class="pu9-h"><span class="pu9-tag">D</span> Pemajuan tanpa kebenaran merancang <small>subkaedah 5(5)</small></h4>
          <div class="pu9-alert">
            <div data-q="pemajuan tanpa kebenaran merancang kelulusan pelan bangunan haram"><b>Pemajuan dijalankan tanpa kebenaran merancang atau kelulusan pelan bangunan</b>
              <span><b>5×</b> hingga <b>20×</b> fi Bahagian B</span></div>
            <div data-q="perobohan tanpa kebenaran merancang"><b>Perobohan bangunan dijalankan tanpa kebenaran merancang</b><span><b>5×</b> hingga <b>20×</b> fi Bahagian B</span></div>
            <p>Terpakai kepada bangunan yang disyaki tanpa kelulusan (<i>Illegal buildings</i>) di peta.</p>
          </div>
        </section>
        <section class="pu9-sec sec-6" id="pu9-6">
          <h4 class="pu9-h"><span class="pu9-tag">6</span> Kadar sumbangan tempat letak kenderaan <small>Jadual Keenam · kaedah 22</small></h4>
          <p class="pu9-lead">Sumbangan = nilai Y × saiz petak (m², ditentukan oleh PBPT mengikut jenis kenderaan).</p>
          <div class="pu9-y">${[['Majlis Bandaraya', '1,500.00'], ['Majlis Perbandaran', '1,000.00', 'MPK'], ['Majlis Daerah', '750.00']].map(([n, v, me]) =>
            `<div class="${me ? 'me' : ''}"><span>${n}${me ? ' <em>MPK</em>' : ''}</span><b>RM ${v}</b><small>nilai Y / m²</small></div>`).join('')}</div>
        </section>
        <div class="mpk-reg-empty" id="pu9-none" hidden>Tiada fi yang sepadan dengan carian.</div>
        <p class="pu9-src">Ringkasan untuk rujukan; teks Warta yang sah terpakai.</p>
      </div>
    </div>`;
    document.body.appendChild(el);
  }
  el.hidden = false;
  el.querySelector('.mpk-dpb-x').focus();
}

if (typeof module !== 'undefined') {
  module.exports = { mpkDpbArea, mpkDpbSeriesUnits, mpkDpbCalc, mpkDpbRate, mpkDpbBlank, mpkDpbNextNo, MPK_DPB_FLOORS, MPK_DPB_KHAS };
}
