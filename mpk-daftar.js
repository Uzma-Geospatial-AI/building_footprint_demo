// ============================================================
// MPK KEMAMAN — BUILDING PLAN REGISTRATION
// Click an illegal or pending building → MPK's "Borang Perkiraan Daftar Pelan Bangunan"
// (Jabatan Kawalan Bangunan, JKB:(KP)1-03, UUKBS 1984 First Schedule) as a form to fill in,
// with every fee worked out as it is typed. Submitted forms wait for approval in the panel's
// Registrations tab; an approved one makes its building legal on the map and in the counts.
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
// Every subtotal and the grand total of a filled form (f as kept by the form, see mpkDpbBlank)
function mpkDpbCalc(f) {
  const floors = arr => MPK_DPB_FLOORS.map(([, rate, min], i) => mpkDpbArea((arr || [])[i], rate, min));
  const sum = rows => rows.reduce((s, r) => s + r.jumlah, 0);
  const p1 = floors(f.p1);
  const k9 = mpkDpbNum(f.p9k), units = mpkDpbSeriesUnits(k9 ? f.unit : 0);
  const p9 = MPK_DPB_SERIES.map(([, , share], i) => ({ unit: units[i], kadar: k9 * share, jumlah: k9 * share * units[i] }));
  const p2 = mpkDpbArea(f.p2, 7, 0), p61 = mpkDpbArea(f.p61, 7, 0);
  const p65 = { jumlah: 50 * Math.floor(mpkDpbNum(f.p65)) };
  const khas = MPK_DPB_KHAS.map(([key, , , rate, kind]) => kind === 'area' ? mpkDpbArea((f.khas || {})[key], rate, 0)
    : { kadar: 0, jumlah: rate * Math.floor(mpkDpbNum((f.khas || {})[key])) });
  const p101 = { jumlah: 120 * Math.floor(mpkDpbNum(f.p101)) };
  const p102a = { jumlah: 120 * Math.floor(mpkDpbNum(f.p102a)) }, p102b = floors(f.p102b);
  const isTel = i => MPK_DPB_KHAS[i][0].startsWith('tel_');
  const summary = {
    baru: sum(p1) + sum(p9), sementara: p2.jumlah, tambahan: p61.jumlah, ubahsuai: p65.jumlah,
    pindaan: p101.jumlah + p102a.jumlah + sum(p102b),
    khas: khas.filter((_, i) => !isTel(i)).reduce((s, r) => s + r.jumlah, 0),
    telko: khas.filter((_, i) => isTel(i)).reduce((s, r) => s + r.jumlah, 0),
  };
  return { p1, p1Sub: sum(p1), p9, p9Sub: sum(p9), p2, p61, p65, khas, khasSub: summary.khas + summary.telko,
    p101, p102a, p102b, p102bSub: sum(p102b), p102Total: p102a.jumlah + sum(p102b),
    summary, total: Object.values(summary).reduce((s, v) => s + v, 0) };
}
function mpkDpbBlank() {
  return { projek: '', fail: '', jenis: '', unit: '', tajuk: ['', '', ''], helai: '',
    p1: ['', '', '', '', ''], p9k: '', p2: '', p61: '', p65: '', khas: {}, p101: '', p102a: '', p102b: ['', '', '', '', ''] };
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
  mpkDaftarApply(false);
}
// Marks each building with its registration; an approved one is legal (its own class kept in daftar_asal)
function mpkDaftarApply(redraw = true) {
  if (!MPK.data) return;
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
    onclick='mpkDaftarOpen(${JSON.stringify(String(p.id))})'>Register building plan</button></div>`;
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

function mpkDaftarOpen(bid) {
  const feat = mpkDpbBuilding(bid);
  const r = mpkDpbFor(bid);
  if (!feat && !r) { showToast('⚠️ Building not found'); return; }
  const p = feat ? feat.properties : r.bangunan;
  MPK_DPB.open = { bid: String(bid), reg: r || null, p };
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
  el.innerHTML = mpkDpbShellHTML(p, r, r ? r.f : mpkDpbPrefill(p));
  el.hidden = false;
  mpkDaftarRecalc();
  const first = el.querySelector('.dpb-paper input');
  if (first) first.focus();
}
function mpkDaftarClose() {
  const el = document.getElementById('mpk-dpb');
  if (el) { el.hidden = true; el.innerHTML = ''; }
  MPK_DPB.open = null;
}

function mpkDpbShellHTML(p, r, f) {
  const st = mpkStatus(p, MPK.settings);
  const wasIllegal = r ? r.asal === 'suspected' : st === 'suspected';
  const locked = r && r.status !== 'menunggu';
  const facts = [p.plus_code, (MPK_AREAS[p.kawasan] || {}).short, p.lot ? 'Lot ' + p.lot : 'no cadastral lot',
    p.area_m2 ? mpkNum(p.area_m2) + ' m² footprint' : ''].filter(Boolean).map(mpkEscHtml).join(' · ');
  const statusLine = r
    ? `<span class="mpk-dpb-badge ${r.status}">${MPK_DPB_STATUS[r.status].label}</span> <b>${mpkEscHtml(r.no)}</b> · submitted ${mpkPlanDateLabel(r.created.slice(0, 10))}${r.decided ? ' · decided ' + mpkPlanDateLabel(r.decided.slice(0, 10)) : ''}`
    : `<span class="mpk-dpb-badge new">New registration</span>`;
  const foot = !r
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
      <div class="mpk-dpb-bar-t"><div id="mpk-dpb-title">${r ? 'Building plan registration' : 'Register building plan'}</div>
        <small>${facts}</small></div>
      <button type="button" class="mpk-dpb-b ghost sm" onclick="mpkDaftarGuide()">Guideline · Tr. P.U. 9/2026</button>
      <button type="button" class="mpk-dpb-b ghost sm" onclick="mpkDaftarPrint()">Print</button>
      <button type="button" class="mpk-dpb-x" onclick="mpkDaftarClose()" aria-label="Close">×</button>
    </div>
    <div class="mpk-dpb-scroll">
      <div class="mpk-dpb-info">
        <div>${statusLine}</div>
        <div class="mpk-dpb-info-s">Map status before registering: <b>${MPK_STATUS[r ? r.asal : st].label}</b>.
          ${wasIllegal ? 'Built without approval: the fee in Part D of the Third Schedule (5 to 20 times the Part B fee) may also apply, see the guideline.' : ''}
          The ground floor area starts as the building's footprint; change any figure. Every fee is worked out as you type.</div>
        ${r && r.catatan ? `<div class="mpk-dpb-info-s">Decision note: ${mpkEscHtml(r.catatan)}</div>` : ''}
      </div>
      <form class="dpb-paper" id="mpk-dpb-form" oninput="mpkDaftarRecalc()" onsubmit="return false" ${locked ? 'inert' : ''}>
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
  const out = id => `<output class="dpb-out" id="dpb-${id}"></output>`;
  const bar = t => `<div class="dpb-bar">${t}</div>`;
  const floorRows = (key, vals) => MPK_DPB_FLOORS.map(([fl, rate, min], i) => `<tr>
      <td class="c">${fl}<br><i>(MIN RM ${min})</i></td><td class="c">${rate.toFixed(2)}/M.PER</td>
      <td>${num(key + '.' + i, (vals || [])[i])}</td><td class="r">${out(key + '-k' + i)}</td><td class="r">${out(key + '-j' + i)}</td></tr>`).join('');
  const areaHead = (first = 'TINGKAT') => `<tr><th>${first}</th><th>KADAR BAYARAN<br><i>( RM )</i></th><th>LUAS<br><i>( M.PER )</i></th>
      <th>KADAR<br><i>( 1/9 M.PER )</i></th><th>JUMLAH<br><i>( RM )</i></th></tr>`;
  const sub = (cols, id) => `<tr class="sub"><td colspan="${cols}">JUMLAH KECIL</td><td class="r">${out(id)}</td></tr>`;
  const one = (key, val, rate) => `<table class="dpb-t narrow">
      <tr><th>KADAR BAYARAN<br><i>( RM )</i></th><th>LUAS<br><i>( M.PER )</i></th><th>KADAR<br><i>( 1/9 M.PER )</i></th><th>JUMLAH<br><i>( RM )</i></th></tr>
      <tr><td class="c">${rate}</td><td>${num(key, val)}</td><td class="r">${out(key + '-k')}</td><td class="r">${out(key + '-j')}</td></tr>
      ${sub(3, key + '-sub')}</table>`;
  const count = (key, val, rate, what) => `<table class="dpb-t small">
      <tr><th>KADAR BAYARAN<br><i>( RM )</i></th><th>${what}</th><th>JUMLAH<br><i>( RM )</i></th></tr>
      <tr><td class="c">${rate}</td><td>${num(key, val)}</td><td class="r">${out(key + '-j')}</td></tr>
      ${sub(2, key + '-sub')}</table>`;
  const khas = MPK_DPB_KHAS.map(([key, label, rateLabel, , kind, group]) => (group
    ? `<tr class="grp"><td>${group}</td><td></td><td></td><td></td><td></td></tr>` : '') + `<tr>
      <td class="c">${label}</td><td class="c">${rateLabel}</td>
      <td>${num('khas.' + key, (f.khas || {})[key], kind === 'count' ? 'bil.' : '')}</td>
      <td class="r">${kind === 'area' ? out('khas-k-' + key) : ''}</td><td class="r">${out('khas-j-' + key)}</td></tr>`).join('');
  const p9 = MPK_DPB_SERIES.map(([label, rateLabel], i) => `<tr>
      <td class="c">${label}</td><td class="c">${rateLabel}</td><td class="r">${out('p9-k' + i)}</td>
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
    ${one('p2', f.p2, '7.00/M.PER')}
    ${bar('PELAN BANGUNAN TAMBAHAN (UUKBS 1984 – JADUAL PERTAMA PARAGRAF 6-1):-')}
    <p class="dpb-desc">- Perkiraan bagi perubahan bangunan sedia ada.</p>
    ${one('p61', f.p61, '7.00/M.PER')}
    ${bar('PELAN BANGUNAN PENGUBAHSUAIAN (UUKBS 1984 – JADUAL PERTAMA PARAGRAF 6-5):-')}
    <p class="dpb-desc">- Perkiraan bagi perubahan bangunan sedia ada yang melibatkan pecah bahagian bilik-bilik menjadi bilik-bilik yang lebih kecil.</p>
    ${count('p65', f.p65, '50.00/UNIT', 'BIL. UNIT')}
    ${bar('PELAN KHAS (UUKBS 1984 – JADUAL PERTAMA PARAGRAF 7 &amp; 8):-')}
    <table class="dpb-t">${areaHead('JENIS PELAN')}${khas}${sub(4, 'khas-sub')}</table>
    <div class="dpb-pno">2</div>
  </section>

  <section class="dpb-page">
    ${bar('PELAN PINDAAN (UUKBS 1984 – JADUAL PERTAMA PARAGRAF 10-1):-')}
    <p class="dpb-desc">- Perkiraan bagi suatu pindaan daripada pelan yang diluluskan dan dikemukakan untuk diluluskan mengikut bilangan helaian pelan yang dipinda untuk diluluskan.</p>
    ${count('p101', f.p101, '120.00/PELAN', 'BIL. PELAN')}
    ${bar('PELAN PINDAAN (UUKBS 1984 – JADUAL PERTAMA PARAGRAF 10-2):-')}
    <p class="dpb-desc">- Perkiraan bagi suatu pindaan daripada pelan yang diluluskan dan dikemukakan untuk diluluskan melibatkan kawasan tambahan yang mempunyai keluasan berlebihan dari yang asal mengikut bilangan helaian pelan yang dipinda untuk diluluskan.</p>
    <div class="dpb-ab"><b>A.</b>${count('p102a', f.p102a, '120.00/PELAN', 'BIL. PELAN')}</div>
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
    <p class="dpb-calc">Kiraan dalam borang ini: KADAR = luas ÷ 9 m², dibundarkan ke atas; JUMLAH = KADAR × kadar bayaran, tidak kurang daripada minimum tingkat.</p>
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
  return f;
}
function mpkDaftarRecalc() {
  if (!document.getElementById('mpk-dpb-form')) return;
  const c = mpkDpbCalc(mpkDpbRead());
  const set = (id, v) => { const el = document.getElementById('dpb-' + id); if (el) el.textContent = v; };
  const rm = mpkDpbRM, n = v => v ? String(v) : '';
  ['p1', 'p102b'].forEach(key => c[key].forEach((r, i) => { set(key + '-k' + i, n(r.kadar)); set(key + '-j' + i, rm(r.jumlah)); }));
  set('p1-sub', rm(c.p1Sub)); set('p102b-sub', rm(c.p102bSub));
  c.p9.forEach((r, i) => { set('p9-k' + i, rm(r.kadar)); set('p9-u' + i, r.kadar ? String(r.unit) : ['1', '4', '5', '15', ''][i]); set('p9-j' + i, rm(r.jumlah)); });
  set('p9-sub', rm(c.p9Sub));
  for (const key of ['p2', 'p61']) { set(key + '-k', n(c[key].kadar)); set(key + '-j', rm(c[key].jumlah)); set(key + '-sub', rm(c[key].jumlah)); }
  for (const key of ['p65', 'p101', 'p102a']) { set(key + '-j', rm(c[key].jumlah)); set(key + '-sub', rm(c[key].jumlah)); }
  MPK_DPB_KHAS.forEach(([key], i) => { set('khas-k-' + key, n(c.khas[i].kadar)); set('khas-j-' + key, rm(c.khas[i].jumlah)); });
  set('khas-sub', rm(c.khasSub));
  set('p102-a', rm(c.p102a.jumlah)); set('p102-b', rm(c.p102bSub)); set('p102-t', rm(c.p102Total));
  MPK_DPB_SUMMARY.forEach(([k]) => set('sum-' + k, rm(c.summary[k])));
  set('sum-total', rm(c.total));
  const t = document.getElementById('mpk-dpb-total');
  if (t) t.textContent = 'RM ' + (mpkDpbRM(c.total) || '0.00');
  return c;
}

// ---------- Submit, decide, delete ----------
function mpkDaftarSubmit() {
  const o = MPK_DPB.open;
  if (!o) return;
  const f = mpkDpbRead(), c = mpkDpbCalc(f);
  if (!f.projek || !(f.tajuk || []).some(Boolean)) { showToast('⚠️ Fill in Projek and Bertajuk'); return; }
  if (!c.total) { showToast('⚠️ Enter at least one area, unit or plan count so there is a fee'); return; }
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
  if (!mpkDpbSave()) return;
  showToast(`📝 ${o.reg.no} saved · ${MPK_DPB_STATUS[o.reg.status].label.toLowerCase()}`);
  addActivityLog('Building plan registration', o.reg.no + ' · ' + (p.plus_code || ''));
  mpkDaftarApply();
  mpkDaftarOpen(o.bid);
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

// ---------- Registrations tab ----------
function mpkDaftarTabHTML() {
  return `<div class="mpk-card mpk-dpb-tab">
      <div class="mpk-card-title">Building plan registrations</div>
      <div class="mpk-dpb-counts" id="mpk-dpb-counts"></div>
      <div class="mpk-dpb-filters" role="tablist" id="mpk-dpb-filters"></div>
      <div class="mpk-dpb-list" id="mpk-dpb-list"></div>
      <div class="mpk-dpb-actions">
        <button type="button" class="mpk-btn" onclick="mpkDaftarExport('csv')">Export CSV</button>
        <button type="button" class="mpk-btn ghost" onclick="mpkDaftarExport('json')">Export JSON</button>
        <label class="mpk-btn ghost mpk-dpb-import">Import JSON<input type="file" accept=".json,application/json" onchange="mpkDaftarImport(this)"></label>
      </div>
      <div class="mpk-note">Click an <b>illegal</b> or <b>pending</b> building on the map, then <i>Register building plan</i>, to fill in
        MPK's Borang Perkiraan Daftar Pelan Bangunan. Approving a registration makes the building legal. Registrations are saved in this
        browser only: use Export / Import to move them to another computer.</div>
      <button type="button" class="mpk-btn ghost mpk-dpb-guide-btn" onclick="mpkDaftarGuide()">Guideline · Tr. P.U. 9/2026 (planning fees)</button>
    </div>`;
}
function mpkDaftarRenderList() {
  const list = document.getElementById('mpk-dpb-list');
  if (!list) return;
  const n = s => MPK_DPB.list.filter(r => r.status === s).length;
  const tab = document.querySelector('.mpk-subtabs [data-sub="daftar"]');
  if (tab) tab.innerHTML = 'Registrations' + (n('menunggu') ? ` <span class="mpk-dpb-dot">${n('menunggu')}</span>` : '');
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
function mpkPu9Rows(items, depth = 0) {
  return items.map(([label, v]) => Array.isArray(v)
    ? `<tr class="h${depth}"><td colspan="2">${label}</td></tr>${mpkPu9Rows(v, depth + 1)}`
    : `<tr class="d${depth}"><td>${label}</td><td>${v}</td></tr>`).join('');
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
    el.innerHTML = `<div class="mpk-dpb-shell guide">
      <div class="mpk-dpb-bar">
        <div class="mpk-dpb-bar-t"><div id="mpk-pu9-title">Guideline · Tr. P.U. 9/2026</div>
          <small>Kaedah-Kaedah Pengawalan Perancangan (Am) (Terengganu) (Pindaan) 2026 · Warta Kerajaan Negeri Terengganu, Jil. 79 No. 37, Tambahan No. 5, 10 September 2026</small></div>
        <button type="button" class="mpk-dpb-x" onclick="document.getElementById('mpk-pu9').hidden = true" aria-label="Close">×</button>
      </div>
      <div class="mpk-dpb-scroll pu9">
        <p class="pu9-lead">Dibuat di bawah subseksyen 58(1) dan (2) Akta Perancangan Bandar dan Desa 1976 [Akta 172]; terpakai bagi semua kawasan
          pihak berkuasa perancang tempatan dalam Negeri Terengganu, berkuat kuasa pada tarikh disiarkan dalam Warta. Dibuat 26 Julai 2026
          [JPBD.Tr.09/0134; PUN.TR.26/2024/7].</p>
        <h4>Perkara utama pindaan</h4>
        <ul>
          <li><b>Kaedah 3(3):</b> permohonan kebenaran merancang boleh dikemukakan secara <i>kebenaran merancang biasa</i> atau <i>kebenaran merancang khas</i>;
            fi permohonan seperti Bahagian A Jadual Ketiga. Tempoh dalam kaedah 3(5) kini <i>suatu tempoh yang ditetapkan oleh pihak berkuasa perancang tempatan</i>.</li>
          <li><b>Kaedah 5A (baharu):</b> khidmat nasihat perancangan sebelum memohon; fi <b>30%</b> daripada fi Bahagian A dan Bahagian B Jadual Ketiga.</li>
          <li><b>Kaedah 22:</b> “tempat letak kereta” kini “tempat letak kenderaan”.</li>
          <li><b>Jadual Pertama, Borang A</b> (Permohonan untuk Kebenaran Merancang, subkaedah 3(1)) diganti: jenis pemajuan (a) hingga (h), perihal tanah,
            status pemajuan di tapak 30 hari sebelum permohonan, pihak berkepentingan, persetujuan pemunya tanah dan pemunya tanah berjiran.</li>
          <li><b>Jadual Kedua</b> diganti: dokumen dan pelan bagi permohonan (pelan berwarna berskala 1:100 hingga 1:1500, tanda utara dan arah kiblat,
            pelan kunci dan lokasi, jadual komponen, akses sah, topografi dan kontur, saliran, anjakan, tempat letak kenderaan, pelan lantai, keratan,
            perspektif), salinan hakmilik dan carian rasmi (≤ 6 bulan), foto tapak (≤ 30 hari) dan laporan sokongan.</li>
          <li><b>Jadual Kelima, Borang D</b> diganti: tuntutan kesusutan nilai tanah kerana mematuhi notis rekuisisi, dalam tempoh 6 bulan.</li>
        </ul>
        <h4>Jadual Ketiga · Bahagian A · Fi memproses permohonan kebenaran merancang <small>[subkaedah 5(1)]</small></h4>
        <table class="pu9-t"><tr><th>Jenis proses</th><th>Fi (RM)</th></tr>
          ${MPK_PU9_A.map(([no, label, v]) => Array.isArray(v) ? `<tr class="h0"><td colspan="2">${no}. ${label}</td></tr>${mpkPu9Rows(v, 1)}`
            : `<tr class="d0"><td>${no}. ${label}</td><td>${v}</td></tr>`).join('')}</table>
        <p class="pu9-n"><b>Kebenaran merancang khas</b> (ditentukan oleh pihak berkuasa perancang tempatan): fi seperti Bahagian A dan Bahagian B
          dengan <b>tambahan 30%</b>.</p>
        <h4>Jadual Ketiga · Bahagian B · Fi bagi kebenaran merancang <small>[subkaedah 5(2)]</small></h4>
        <table class="pu9-t"><tr><th>Jenis pemajuan</th><th>Fi (RM)</th></tr>${mpkPu9Rows(MPK_PU9_B)}</table>
        <p class="pu9-n">Nota: semua fi di ruang (2) Bahagian B tertakluk kepada mana-mana yang lebih tinggi.</p>
        <h4>Bahagian C · Fi melanjutkan kebenaran merancang <small>[subkaedah 5(3)]</small></h4>
        <p class="pu9-n">Kategori 1 hingga 8 Bahagian B: <b>RM 100.00</b> setiap permohonan atau <b>20%</b> daripada fi terdahulu, mana-mana lebih tinggi.</p>
        <h4 class="pu9-warn">Bahagian D · Pemajuan tanpa kebenaran merancang <small>[subkaedah 5(5)]</small></h4>
        <table class="pu9-t"><tr><th>Perkara</th><th>Fi</th></tr>
          <tr class="d0"><td>Pemajuan dijalankan tanpa kebenaran merancang atau kelulusan pelan bangunan</td><td><b>5 kali ganda</b>, tidak melebihi <b>20 kali ganda</b> fi Bahagian B</td></tr>
          <tr class="d0"><td>Perobohan bangunan dijalankan tanpa kebenaran merancang</td><td><b>5 kali ganda</b>, tidak melebihi <b>20 kali ganda</b> fi Bahagian B</td></tr></table>
        <p class="pu9-n">Berkaitan bangunan yang disyaki tanpa kelulusan (<i>Illegal buildings</i>) di peta.</p>
        <h4>Jadual Keenam · Kadar sumbangan tempat letak kenderaan <small>[kaedah 22]</small></h4>
        <p class="pu9-n">Kadar sumbangan = nilai Y × saiz keluasan petak (m², ditentukan oleh PBPT ikut jenis kenderaan). Nilai Y: Majlis Bandaraya
          RM 1,500.00 · <b>Majlis Perbandaran RM 1,000.00</b> (MPK) · Majlis Daerah RM 750.00.</p>
        <p class="pu9-src">Ringkasan untuk rujukan; teks Warta yang sah terpakai.</p>
      </div>
    </div>`;
    document.body.appendChild(el);
  }
  el.hidden = false;
  el.querySelector('.mpk-dpb-x').focus();
}

if (typeof module !== 'undefined') {
  module.exports = { mpkDpbArea, mpkDpbSeriesUnits, mpkDpbCalc, mpkDpbBlank, mpkDpbNextNo, MPK_DPB_FLOORS, MPK_DPB_KHAS };
}
