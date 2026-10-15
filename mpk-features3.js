// ============================================================
// MPK KEMAMAN — FEATURES: site check · notice · portfolio · timeline · money
//   sitecheck  Site Check          click any spot: lot, land use, road reserve, buildings and plans there
//   notice     Notice Drafter      draft enforcement notice (PDF, English or Malay) for an illegal building
//   portfolio  Developer Portfolio every plan an applicant holds, on the map, with its record
//   timeline   Approval Timeline   plan approvals appear on the map year by year
//   money      Revenue Map         recoverable fees and assessment tax per building, in 3D
// Their cards sit in the Features grid of mpk-features.js. Pure logic is exported for
// tools/test_mpk_features3.js. Loaded after mpk-features2.js.
// ============================================================

// ---------- Pure: geometry ----------
function mpkInRing(pt, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < (xj - xi) * (pt[1] - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function mpkInGeom(pt, geom) {
  const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.type === 'MultiPolygon' ? geom.coordinates : [];
  return polys.some(rings => mpkInRing(pt, rings[0]) && !rings.slice(1).some(r => mpkInRing(pt, r)));
}
// Shortest distance in metres from a point to a (Multi)LineString
function mpkDistToLines(pt, geom) {
  const lines = geom.type === 'LineString' ? [geom.coordinates] : geom.type === 'MultiLineString' ? geom.coordinates : [];
  const [kx, ky] = [111320 * Math.cos(pt[1] * Math.PI / 180), 111320];
  let best = Infinity;
  for (const line of lines) {
    for (let i = 1; i < line.length; i++) {
      const ax = (line[i - 1][0] - pt[0]) * kx, ay = (line[i - 1][1] - pt[1]) * ky;
      const bx = (line[i][0] - pt[0]) * kx, by = (line[i][1] - pt[1]) * ky;
      const dx = bx - ax, dy = by - ay, len = dx * dx + dy * dy;
      const t = len ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len)) : 0;
      best = Math.min(best, Math.hypot(ax + t * dx, ay + t * dy));
    }
  }
  return best;
}
// Average of every coordinate of a geometry (a label point for CAD drawings)
function mpkGeomCentre(geom) {
  let x = 0, y = 0, n = 0;
  const walk = c => { if (typeof c[0] === 'number') { x += c[0]; y += c[1]; n++; } else c.forEach(walk); };
  walk(geom.coordinates);
  return n ? [x / n, y / n] : null;
}

// ---------- Pure: site check ----------
// Checks for one spot from the facts found there: [{ level: 'ok'|'warn'|'bad'|'info', title, text }].
// f.where is 'on this lot', or 'within 40 m' where no cadastral lot covers the spot.
function mpkSiteChecks(f) {
  const out = [], where = f.where || 'on this lot', s = n => (n > 1 ? 's' : '');
  if (f.reserve) {
    out.push(f.reserve.inside
      ? { level: 'bad', title: 'Inside the road reserve', text: `${f.reserve.d} m from the corridor road's centreline; the reserve is ${f.reserve.rizab} m. No building may stand here.` }
      : { level: 'ok', title: 'Clear of the road reserve', text: `${f.reserve.d} m from the corridor road's centreline (reserve ${f.reserve.rizab} m).` });
  }
  if (!f.lot) {
    out.push(f.lotMapped
      ? { level: 'warn', title: 'No cadastral lot here', text: 'The spot is not inside a lot of the cadastral map (road, river or state land).' }
      : { level: 'info', title: 'Cadastral lots not mapped here', text: 'The lot map covers Teluk Kalong; buildings and plans within 40 m are checked instead.' });
  }
  out.push(f.plans.approved
    ? { level: 'ok', title: `${f.plans.approved} approved building plan${s(f.plans.approved)} ${where}`, text: 'New works still need their own approval.' }
    : { level: 'warn', title: `No approved building plan ${where}`, text: 'MPK\'s registers hold no approval here.' });
  if (f.buildings.n) {
    out.push(f.buildings.suspected
      ? { level: 'bad', title: `${f.buildings.suspected} illegal building${s(f.buildings.suspected)} ${where}`, text: `${f.buildings.n} building${s(f.buildings.n)} in all.` }
      : { level: 'info', title: `${f.buildings.n} building${s(f.buildings.n)} ${where}`, text: 'None of them is flagged as illegal.' });
  }
  if (f.zone) out.push({ level: 'info', title: 'Land use: ' + f.zone, text: 'From OpenStreetMap; indicative only, the local plan decides.' });
  return out;
}

// ---------- Pure: enforcement notice ----------
const MPK_NOTICE_TEXT = {
  en: {
    draft: 'DRAFT · FOR REVIEW BY MPK\'S LEGAL UNIT BEFORE ISSUE',
    council: 'MAJLIS PERBANDARAN KEMAMAN', dept: 'Building Control Department',
    title: 'NOTICE: BUILDING ERECTED WITHOUT AN APPROVED BUILDING PLAN',
    act: 'Street, Drainage and Building Act 1974 (Act 133), section 70',
    ref: 'Our reference', date: 'Date', to: 'To: the owner / occupier of the premises at the location below',
    rows: { place: 'Location (Plus Code)', coords: 'Coordinates', lot: 'Lot no.', upi: 'UPI', area: 'Area', m2: 'Building footprint', why: 'Finding' },
    none: 'not recorded',
    body: days => [
      'The Council\'s records show that the building at the location above has no approved building plan.',
      `You are required, within ${days} days of the date of this notice, to:`,
      '(a) submit a copy of the approved building plan for the building, if there is one; or',
      '(b) stop all works and submit an application for approval to the Council\'s One Stop Centre (OSC).',
      'Failure to comply with this notice may lead to action under Act 133.',
    ],
    sign: 'Officer\'s name and signature', role: 'for the President, Majlis Perbandaran Kemaman',
    foot: 'Generated by BuildVision from mapped data (footprint digitised from aerial imagery). The finding must be verified on site before this notice is issued.',
  },
  ms: {
    draft: 'DRAF · UNTUK SEMAKAN UNIT UNDANG-UNDANG MPK SEBELUM DIKELUARKAN',
    council: 'MAJLIS PERBANDARAN KEMAMAN', dept: 'Jabatan Kawalan Bangunan',
    title: 'NOTIS: BANGUNAN DIDIRIKAN TANPA PELAN BANGUNAN YANG DILULUSKAN',
    act: 'Akta Jalan, Parit dan Bangunan 1974 (Akta 133), seksyen 70',
    ref: 'Rujukan kami', date: 'Tarikh', to: 'Kepada: pemilik / penghuni premis di lokasi berikut',
    rows: { place: 'Lokasi (Plus Code)', coords: 'Koordinat', lot: 'No. lot', upi: 'UPI', area: 'Kawasan', m2: 'Keluasan tapak bangunan', why: 'Penemuan' },
    none: 'tiada rekod',
    body: days => [
      'Rekod Majlis menunjukkan bangunan di lokasi di atas tidak mempunyai pelan bangunan yang diluluskan.',
      `Tuan/Puan dikehendaki, dalam tempoh ${days} hari dari tarikh notis ini:`,
      '(a) mengemukakan salinan pelan bangunan yang diluluskan bagi bangunan tersebut, jika ada; atau',
      '(b) menghentikan semua kerja dan mengemukakan permohonan kelulusan kepada Pusat Setempat (OSC) Majlis.',
      'Kegagalan mematuhi notis ini boleh menyebabkan tindakan diambil di bawah Akta 133.',
    ],
    sign: 'Nama dan tandatangan pegawai', role: 'b.p. Yang Dipertua, Majlis Perbandaran Kemaman',
    foot: 'Dijana oleh BuildVision daripada data pemetaan (tapak bangunan didigitkan daripada imej udara). Penemuan mesti disahkan di tapak sebelum notis ini dikeluarkan.',
  },
};
// The notice's area name and finding, in its own language; jenis = mpkJenis(p, settings)
const MPK_NOTICE_AREA = { en: { tk: 'Teluk Kalong Industrial Area', bbc: 'Binjai – Bandar Chukai Corridor' },
                          ms: { tk: 'Kawasan Perindustrian Teluk Kalong', bbc: 'Koridor Binjai – Bandar Chukai' } };
function mpkNoticeReason(lang, p, jenis, rizab) {
  const ms = lang === 'ms';
  if (jenis === 'tolak') return ms ? 'Pelan bangunan bagi tapak ini ditolak oleh Majlis (TOLAK)' : 'The building plan for this site was rejected by the Council (TOLAK)';
  if (jenis === 'manual') return ms ? 'Ditanda sebagai bangunan haram oleh pegawai Majlis selepas semakan' : 'Marked as an illegal building by a Council officer after review';
  if (jenis === 'mockup') return ms ? 'Tiada pelan bangunan yang diluluskan; tersenarai dalam senarai bangunan disyaki Majlis'
    : 'No approved building plan; on the Council\'s list of suspected buildings';
  return ms ? `Bangunan dalam rizab jalan: ${p.jarak_jalan_m} m dari garis tengah jalan (rizab ${rizab} m)`
    : `Building inside the road reserve: ${p.jarak_jalan_m} m from the road centreline (reserve ${rizab} m)`;
}
const mpkNoticeRef = (p, date) => `MPK/KB/${date.slice(0, 4)}/${p.plus_code.replace('+', '')}`;

// ---------- Pure: the notice as an MPK letter (the layout of MPK's letters, e.g. MPK/BP/67/55) ----------
// '**' marks bold words inside a paragraph
const MPK_NOTICE_MONTHS = {
  ms: ['Jan', 'Feb', 'Mac', 'Apr', 'Mei', 'Jun', 'Julai', 'Ogos', 'Sept', 'Okt', 'Nov', 'Dis'],
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
};
const MPK_HIJRI_MONTHS = ['Muharram', 'Safar', 'Rabiulawal', 'Rabiulakhir', 'Jamadilawal', 'Jamadilakhir',
  'Rejab', 'Syaaban', 'Ramadhan', 'Syawal', 'Zulkaedah', 'Zulhijjah'];
// '2026-10-15' -> '15 Okt, 2026' (as MPK writes it)
function mpkNoticeDate(date, lang) {
  const [y, m, d] = date.split('-');
  return `${d} ${MPK_NOTICE_MONTHS[lang][+m - 1]}, ${y}`;
}
// '2026-10-15' -> '3 Jamadilakhir, 1448' (Umm al-Qura calendar), or '' where the browser cannot say
function mpkNoticeHijri(date) {
  try {
    const parts = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura', { day: 'numeric', month: 'numeric', year: 'numeric', timeZone: 'UTC' })
      .formatToParts(new Date(date + 'T00:00:00Z'));
    const g = t => +(parts.find(x => x.type === t) || {}).value;
    const d = g('day'), m = g('month'), y = parseInt((parts.find(x => x.type === 'year') || {}).value, 10);
    return d && m && y ? `${String(d).padStart(2, '0')} ${MPK_HIJRI_MONTHS[m - 1]}, ${y}` : '';
  } catch (e) { return ''; }
}
const MPK_NOTICE_LETTER = {
  ms: {
    hand: 'DAFTAR/TANGAN', dear: 'Tuan/Puan,', dateLabel: 'Tarikh',
    to: 'Pemilik / Penghuni Premis',
    title: ['NOTIS BANGUNAN DIDIRIKAN TANPA PELAN BANGUNAN YANG DILULUSKAN', '( AKTA JALAN, PARIT DAN BANGUNAN 1974 [AKTA 133], SEKSYEN 70 )'],
    paras: (x, days) => [
      `Dengan hormatnya perkara di atas adalah dirujuk. Semakan rekod Majlis mendapati bangunan di **Plus Code ${x.code}** (koordinat ${x.coords})${x.lot ? `, **Lot ${x.lot}**` : ''}${x.upi ? ` (UPI ${x.upi})` : ''}, dengan keluasan tapak **${x.m2}** di **${x.area}**, tidak mempunyai pelan bangunan yang diluluskan. Penemuan: ${x.reason}.`,
      `Adalah dimaklumkan, tuan/puan dikehendaki dalam tempoh **${days} hari** dari tarikh notis ini sama ada **mengemukakan salinan pelan bangunan yang diluluskan** bagi bangunan tersebut, jika ada, atau **menghentikan semua kerja dan mengemukakan permohonan kelulusan** kepada Pusat Setempat (OSC) Majlis Perbandaran Kemaman.`,
      'Sekiranya tuan/puan gagal mematuhi notis ini, tindakan penguatkuasaan atau perundangan akan diambil mengikut Akta Jalan, Parit dan Bangunan 1974 (Akta 133) dan undang-undang yang diterima pakai oleh pihak Majlis Perbandaran Kemaman.',
    ],
    thanks: 'Sekian, terima kasih.',
    motto: ['“TERENGGANU MAJU, BERKAT, SEJAHTERA”', '“BERKHIDMAT UNTUK NEGARA”'],
    trust: 'Saya yang menjalankan amanah,',
    sign: ['( ............................................................ )', 'Yang Dipertua', 'Majlis Perbandaran Kemaman.'],
    cc: [['Jabatan Kawalan Bangunan', 'Untuk tindakan'], ['Bahagian Penguatkuasaan', 'Untuk tindakan'], ['Jabatan Perancangan Bandar', 'Untuk makluman']],
    ccOf: 'Majlis Perbandaran Kemaman', file: 'Fail Timbul (Kawalan Bangunan)', code: 'BuildVision/Notis 2026',
    draft: 'DRAF · Dijana oleh BuildVision daripada data pemetaan. Penemuan mesti disahkan di tapak dan disemak Unit Undang-undang MPK sebelum notis ini dikeluarkan.',
    annex: 'LAMPIRAN A', annexSub: 'Pelan lokasi dan butiran bangunan',
  },
  en: {
    hand: 'BY HAND / REGISTERED POST', dear: 'Sir/Madam,', dateLabel: 'Date',
    to: 'The Owner / Occupier of the Premises',
    title: ['NOTICE OF A BUILDING ERECTED WITHOUT AN APPROVED BUILDING PLAN', '( STREET, DRAINAGE AND BUILDING ACT 1974 [ACT 133], SECTION 70 )'],
    paras: (x, days) => [
      `The above matter refers. A review of the Council's records found that the building at **Plus Code ${x.code}** (coordinates ${x.coords})${x.lot ? `, **Lot ${x.lot}**` : ''}${x.upi ? ` (UPI ${x.upi})` : ''}, with a footprint of **${x.m2}** in the **${x.area}**, has no approved building plan. Finding: ${x.reason}.`,
      `You are hereby informed that, within **${days} days** of the date of this notice, you are required either to **submit a copy of the approved building plan** for the building, if there is one, or to **stop all works and submit an application for approval** to the One Stop Centre (OSC) of Majlis Perbandaran Kemaman.`,
      'Should you fail to comply with this notice, enforcement or legal action will be taken under the Street, Drainage and Building Act 1974 (Act 133) and the laws adopted by Majlis Perbandaran Kemaman.',
    ],
    thanks: 'Thank you.',
    motto: ['“TERENGGANU MAJU, BERKAT, SEJAHTERA”', '“BERKHIDMAT UNTUK NEGARA”'],
    trust: 'Yours faithfully,',
    sign: ['( ............................................................ )', 'President', 'Majlis Perbandaran Kemaman.'],
    cc: [['Building Control Department', 'For action'], ['Enforcement Division', 'For action'], ['Town Planning Department', 'For information']],
    ccOf: 'Majlis Perbandaran Kemaman', file: 'File (Building Control)', code: 'BuildVision/Notice 2026',
    draft: 'DRAFT · Generated by BuildVision from mapped data. The finding must be verified on site and reviewed by MPK\'s Legal Unit before this notice is issued.',
    annex: 'APPENDIX A', annexSub: 'Location plan and building details',
  },
};
// Everything the letter says for one building
function mpkNoticeLetter(lang, p, area, reason, days, date) {
  const L = MPK_NOTICE_LETTER[lang];
  const x = { code: p.plus_code, coords: `${p.lat.toFixed(6)}, ${p.lng.toFixed(6)}`, lot: p.lot || '', upi: p.upi || '',
    m2: `${Math.round(p.area_m2).toLocaleString('en-MY')} m²`, area, reason: reason.replace(/\.$/, '') };
  return {
    L, ref: mpkNoticeRef(p, date), date: mpkNoticeDate(date, lang), hijri: mpkNoticeHijri(date),
    to: [L.to, (x.lot ? `Lot ${x.lot}` : `Plus Code ${x.code}`) + ',', area + ',', '24000 Kemaman', 'Terengganu.'],
    paras: L.paras(x, days),
  };
}
// '**bold** text' -> [{ t, b }]
const mpkRichSegs = s => String(s).split('**').map((t, i) => ({ t, b: i % 2 === 1 })).filter(x => x.t);
// The notice's words for one building: { lines: [[label, value]], body: [...] } (the PDF lays them out)
function mpkNoticeContent(lang, p, area, reason, days, date) {
  const T = MPK_NOTICE_TEXT[lang];
  return {
    T, ref: mpkNoticeRef(p, date),
    lines: [[T.rows.place, p.plus_code], [T.rows.coords, `${p.lat.toFixed(6)}, ${p.lng.toFixed(6)}`],
      [T.rows.lot, p.lot || T.none], [T.rows.upi, p.upi || T.none], [T.rows.area, area],
      [T.rows.m2, `${Math.round(p.area_m2).toLocaleString('en-MY')} m²`], [T.rows.why, reason]],
    body: T.body(days),
  };
}

// ---------- Pure: developer portfolio ----------
// One key per applicant, whatever the spelling: "Rayhar Properties Sdn. Bhd." = "RAYHAR PROPERTIES"
function mpkApplicantKey(name) {
  const k = String(name || '').toUpperCase().replace(/\(M\)|\bSDN\b|\bBHD\b|\bBERHAD\b|\bENTERPRISE\b/g, ' ')
    .replace(/[^A-Z0-9]+/g, ' ').trim();
  return /[A-Z]{2}/.test(k) ? k : '';                // placeholders such as -999 are no name
}
// Applicants from the plan shapes (on the map) and the shop register rows (on the map or not)
function mpkPortfolios(planFeatures, register) {
  const by = new Map();
  const get = name => {
    const k = mpkApplicantKey(name);
    if (!k || k.length < 3) return null;
    if (!by.has(k)) by.set(k, { key: k, names: new Map(), rekod: new Set(), files: new Set(), lulus: new Set(), tolak: new Set(), years: [], built: new Set(), off: 0 });
    const a = by.get(k);
    a.names.set(name, (a.names.get(name) || 0) + 1);
    return a;
  };
  for (const f of planFeatures) {
    const p = f.properties, a = p.pemohon && get(p.pemohon);
    if (!a || a.rekod.has(p.rekod)) continue;
    a.rekod.add(p.rekod);
    if (p.fail) a.files.add(p.fail);
    if (p.keputusan === 'lulus') a.lulus.add(p.rekod);
    if (p.keputusan === 'tolak') a.tolak.add(p.rekod);
    if (p.bangunan) a.built.add(p.rekod);
    const y = +String(p.tarikh || '').slice(0, 4);
    if (y >= 1980 && y <= 2100) a.years.push(y);
  }
  for (const r of register || []) {                 // shop records with no drawing on the map
    if (r.peta === 'ya' || !r.pemohon) continue;
    const a = get(r.pemohon);
    if (!a) continue;
    a.off++;
    if (r.fail) a.files.add(r.fail);
  }
  return [...by.values()].map(a => ({
    key: a.key, name: [...a.names.entries()].sort((x, y) => y[1] - x[1])[0][0], records: a.rekod.size, files: a.files.size,
    lulus: a.lulus.size, tolak: a.tolak.size, built: a.built.size, off: a.off,
    first: a.years.length ? Math.min(...a.years) : null, last: a.years.length ? Math.max(...a.years) : null,
  })).filter(a => a.records).sort((x, y) => y.records - x.records || x.name.localeCompare(y.name));
}

// ---------- Pure: approval timeline ----------
// Approvals (and rejections) per year, one per plan record: [{ y, lulus, tolak }] from the first year to the last
function mpkApprovalYears(planFeatures) {
  const seen = new Map();
  for (const f of planFeatures) {
    const p = f.properties, y = +String(p.tarikh || '').slice(0, 4);
    if (!(y >= 1980 && y <= 2100) || (p.keputusan !== 'lulus' && p.keputusan !== 'tolak') || seen.has(p.rekod)) continue;
    seen.set(p.rekod, { y, k: p.keputusan });
  }
  const ys = [...seen.values()].map(v => v.y);
  if (!ys.length) return [];
  const out = [];
  for (let y = Math.min(...ys); y <= Math.max(...ys); y++) out.push({ y, lulus: 0, tolak: 0 });
  for (const v of seen.values()) out[v.y - out[0].y][v.k]++;
  return out;
}

// ---------- Pure: revenue ----------
// What the council could recover from one building: processing fee once, plus assessment tax for `years`
function mpkRecoverable(m2, rates, years) {
  const fee = m2 * rates.fee, tax = m2 * rates.cukai * years;
  return { fee, tax, total: fee + tax };
}

if (typeof module !== 'undefined') {
  module.exports = { mpkInRing, mpkInGeom, mpkDistToLines, mpkGeomCentre, mpkSiteChecks, mpkNoticeRef, mpkNoticeContent, mpkNoticeReason, MPK_NOTICE_TEXT,
    mpkNoticeLetter, mpkNoticeDate, mpkNoticeHijri, mpkRichSegs,
    mpkApplicantKey, mpkPortfolios, mpkApprovalYears, mpkRecoverable };
}

// ============================================================
// Browser
// ============================================================
if (typeof MPK_FEAT_RUN !== 'undefined') {
  Object.assign(MPK_FEAT_RUN, {
    sitecheck: token => mpkSiteRun(token),
    portfolio: token => mpkPortRun(token),
    notice: token => mpkNoticeRun(token),
    timeline: token => mpkTimelineRun(token),
    money: token => mpkMoneyRun(token),
  });
}

const MPK_HUD_PAD = { top: 60, bottom: 60, left: 60, right: 400 };

// ---------- Site Check ----------
function mpkSiteRun() {
  MPK_FEAT.capture = true;
  mpkHud('Site Check', `<div class="mpk-hud-big">Click any spot</div>
    <div class="mpk-hud-sub">Anywhere in Kemaman: an empty plot, a house, a shop. The check reads the cadastral lot,
      land use, road reserve, buildings and approved plans there.</div>`, { icon: '📍', side: true });
  ['mpk-feat-site-lot', 'mpk-feat-site-bld', 'mpk-feat-site-plan', 'mpk-feat-site-pt'].forEach(id => mpkFeatSrc(id, mpkFC([])));
  mpkFeatLayer({ id: 'mpk-feat-site-lot-fill', type: 'fill', source: 'mpk-feat-site-lot', paint: { 'fill-color': '#FFB300', 'fill-opacity': 0.14 } });
  mpkFeatLayer({ id: 'mpk-feat-site-lot', type: 'line', source: 'mpk-feat-site-lot', paint: { 'line-color': '#FF8F00', 'line-width': 3 } });
  mpkFeatLayer({ id: 'mpk-feat-site-plan', type: 'line', source: 'mpk-feat-site-plan', paint: { 'line-color': '#00695C', 'line-width': 2 } });
  mpkFeatLayer({ id: 'mpk-feat-site-bld', type: 'line', source: 'mpk-feat-site-bld', paint: { 'line-color': '#fff', 'line-width': 2.5 } });
  mpkFeatLayer({ id: 'mpk-feat-site-pt', type: 'circle', source: 'mpk-feat-site-pt',
    paint: { 'circle-radius': 8, 'circle-color': '#FF6F00', 'circle-stroke-color': '#fff', 'circle-stroke-width': 3 } });
  const onClick = e => mpkSiteShow([e.lngLat.lng, e.lngLat.lat]);
  map.on('click', onClick);
  map.getCanvas().style.cursor = 'crosshair';
  MPK_FEAT.cleanup.push(() => { map.off('click', onClick); map.getCanvas().style.cursor = ''; });
}

function mpkSiteShow(pt) {
  const s = MPK.settings;
  const bbox = f => f._bb || (f._bb = mpkBoundsOf([f]));
  const inBox = (f, p) => { const b = bbox(f); return p[0] >= b[0][0] && p[0] <= b[1][0] && p[1] >= b[0][1] && p[1] <= b[1][1]; };
  const lot = (MPK.data.kadaster.features || []).find(f => inBox(f, pt) && mpkInGeom(pt, f.geometry)) || null;
  const zone = MPK.data.landuse ? mpkZoneAt(pt[0], pt[1], MPK.data.landuse.features) : null;
  const road = MPK.data.roads.features.find(f => f.properties.kawasan === 'bbc');
  const d = road ? mpkDistToLines(pt, road.geometry) : Infinity;
  const reserve = d < 400 ? { d: Math.round(d), rizab: s.rizab, inside: d <= s.rizab } : null;
  const inTk = MPK.data.boundary.features.some(f => mpkInGeom(pt, f.geometry));
  // buildings and plans whose centre sits on the lot
  const all = [...MPK.data.buildings.features, ...(MPK.data.others ? MPK.data.others.features : [])];
  // on the lot, or within 40 m where the lot map does not reach
  const here = lot ? c => inBox(lot, c) && mpkInGeom(c, lot.geometry) : c => mpkMetres(c, pt) <= 40;
  const blds = all.filter(f => here([f.properties.lng, f.properties.lat]));
  const plans = new Map();
  for (const f of MPK.data.pelan ? MPK.data.pelan.features : []) {
    const c = f._c || (f._c = mpkGeomCentre(f.geometry));
    if (c && here(c)) plans.set(f.properties.rekod, f);
  }
  const kb = MPK.lotExtent || (MPK.lotExtent = mpkBoundsOf(MPK.data.kadaster.features));
  const lotMapped = pt[0] >= kb[0][0] && pt[0] <= kb[1][0] && pt[1] >= kb[0][1] && pt[1] <= kb[1][1];
  const planList = [...plans.values()].map(f => f.properties).sort((a, b) => String(b.tarikh).localeCompare(String(a.tarikh)));
  const sus = blds.filter(f => f.properties.kawasan && mpkStatus(f.properties, s) === 'suspected').length;
  const checks = mpkSiteChecks({
    reserve, lot: !!lot, lotMapped, where: lot ? 'on this lot' : 'within 40 m', zone: zone ? mpkZoneLabel(zone) : null,
    plans: { approved: planList.filter(p => p.keputusan === 'lulus').length },
    buildings: { n: blds.length, suspected: sus },
  });
  map.getSource('mpk-feat-site-pt').setData(mpkPt(pt));
  map.getSource('mpk-feat-site-lot').setData(lot ? lot : mpkFC([]));
  map.getSource('mpk-feat-site-bld').setData(mpkFC(blds));
  map.getSource('mpk-feat-site-plan').setData(mpkFC([...plans.values()]));
  if (lot) map.fitBounds(mpkBoundsOf([lot]), { padding: MPK_HUD_PAD, maxZoom: 19, duration: 900 });
  else map.easeTo({ center: pt, zoom: Math.max(map.getZoom(), 18), padding: { right: 360 }, duration: 900 });
  const icon = { ok: '✓', warn: '!', bad: '✕', info: 'i' };
  const lotM2 = lot ? mpkPolyArea(lot.geometry) : 0;
  mpkHudBody(`
    <div class="mpk-site-head"><div><small>Cadastral lot</small><b>${lot ? 'Lot ' + mpkEsc(lot.properties.lot) : lotMapped ? 'None' : 'Not mapped'}</b></div>
      <div><small>Lot size</small><b>${lot ? mpkFmtM2(lotM2) : '—'}</b></div>
      <div><small>Study area</small><b>${inTk ? 'Teluk Kalong' : reserve ? 'Binjai – Chukai' : 'Outside'}</b></div></div>
    ${lot && lot.properties.upi ? `<div class="mpk-hud-sub">UPI ${mpkEsc(lot.properties.upi)} · ${pt[1].toFixed(5)}, ${pt[0].toFixed(5)}</div>` : `<div class="mpk-hud-sub">${pt[1].toFixed(5)}, ${pt[0].toFixed(5)}</div>`}
    <div class="mpk-site-checks">${checks.map(c => `<div class="mpk-site-check ${c.level}"><i>${icon[c.level]}</i>
      <div><b>${mpkEsc(c.title)}</b><small>${mpkEsc(c.text)}</small></div></div>`).join('')}</div>
    ${planList.length ? `<div class="mpk-hud-sub"><b>Plans ${lot ? 'on this lot' : 'within 40 m'}</b></div><div class="mpk-hud-list">${planList.slice(0, 6).map(p => `
      <div class="mpk-hud-item static"><b>${mpkEsc(p.fail || p.rekod)}</b><span>${mpkEsc(p.pemohon || p.jenis || '')}</span>
        <span class="num">${p.keputusan === 'lulus' ? 'Approved' : p.keputusan === 'tolak' ? 'Rejected' : 'No decision'}${p.tarikh ? ' · ' + mpkEsc(String(p.tarikh).slice(0, 4)) : ''}</span></div>`).join('')}</div>` : ''}
    <div class="mpk-site-need"><b>Before building here</b>
      Planning permission (Town and Country Planning Act 1976, s.19) and building plan approval (Act 133, s.70),
      applied for at MPK's One Stop Centre.</div>
    <div class="mpk-hud-note">A screening aid from mapped data, not a planning decision. Click another spot to check it.</div>`);
}

// ---------- Notice Drafter ----------
function mpkNoticeRun() {
  const { ranked, s } = mpkFeatData();
  MPK_FEAT.notice = ranked.map(x => x.p);
  MPK_FEAT.capture = true;
  let lang = 'ms';
  try { lang = localStorage.getItem('mpk_report_lang') || 'ms'; } catch (e) {}
  mpkHud('Notice Drafter', `
    <div class="mpk-notice-opts">
      <label>Language<select id="mpk-nt-lang"><option value="ms"${lang === 'ms' ? ' selected' : ''}>Bahasa Melayu</option>
        <option value="en"${lang === 'en' ? ' selected' : ''}>English</option></select></label>
      <label>Days to comply<input id="mpk-nt-days" type="number" min="7" max="90" value="30"></label>
    </div>
    <div class="mpk-hud-sub">Click an illegal building on the map, or pick one below (highest priority first).</div>
    <div class="mpk-hud-list" id="mpk-nt-list">${ranked.slice(0, 40).map(({ p }, i) => `
      <button class="mpk-hud-item" onclick="mpkNoticePick(${i})"><b>${p.plus_code}</b><span>${MPK_AREAS[p.kawasan].short}</span>
        <span class="num">${mpkFmtM2(p.area_m2)}</span></button>`).join('') || '<div class="mpk-hud-sub">No illegal buildings in this area.</div>'}</div>
    <div class="mpk-hud-actions"><button class="mpk-wb-btn" onclick="mpkNoticeBatch()"${ranked.length ? '' : ' disabled'}>
      All ${mpkNum(ranked.length)} in one PDF</button></div>
    <div class="mpk-hud-note">Drafts only: every notice carries a DRAFT banner and needs site verification and the legal unit's review.</div>`,
    { icon: '📄', side: true });
  const onClick = e => {
    const hit = map.queryRenderedFeatures(e.point, { layers: ['mpk-suspect-fill'].filter(id => map.getLayer(id)) })[0];
    if (!hit) { showToast('Click a red (illegal) building'); return; }
    mpkNoticeOne(hit.properties.id);
  };
  map.on('click', onClick);
  MPK_FEAT.cleanup.push(() => map.off('click', onClick));
  mpkFeatFit(MPK.bounds[MPK.area], { padding: MPK_HUD_PAD });
  void s;
}
function mpkNoticePick(i) { const p = (MPK_FEAT.notice || [])[i]; if (p) mpkNoticeOne(p.id); }
function mpkNoticeOpts() {
  const lang = document.getElementById('mpk-nt-lang').value;
  const days = Math.max(7, Math.min(90, +document.getElementById('mpk-nt-days').value || 30));
  try { localStorage.setItem('mpk_report_lang', lang); } catch (e) {}
  return { lang, days, date: mpkYMD(new Date()) };
}
// The notice laid out as MPK's letters: the letterhead, the reference and dates on the right, DAFTAR/TANGAN,
// the addressee, the underlined title, numbered justified paragraphs, the mottos, the signature block and the
// s.k. list, in URW Gothic (a free Century Gothic look-alike) at the letter's size. Positions in mm on A4,
// measured from MPK's letter MPK/BP/67/55 Jld 3 - (32).
const MPK_NOTICE_FILES = { book: 'mpk/notis/URWGothic-Book.ttf', demi: 'mpk/notis/URWGothic-Demi.ttf',
  head: 'mpk/notis/kepala.png', foot: 'mpk/notis/kaki.png', mark: 'mpk/notis/tera.png' };
let mpkNoticeAssetsP = null;
function mpkNoticeAssets() {
  if (mpkNoticeAssetsP) return mpkNoticeAssetsP;
  const b64 = buf => { let s = ''; const u = new Uint8Array(buf); for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); };
  const get = async (url, kind) => {
    const r = await fetch(url + '?v=' + MPK.VERSION);
    if (!r.ok) throw new Error('HTTP ' + r.status + ' · ' + url);
    const buf = await r.arrayBuffer();
    return kind === 'font' ? b64(buf) : 'data:image/png;base64,' + b64(buf);
  };
  mpkNoticeAssetsP = Promise.all(Object.entries(MPK_NOTICE_FILES).map(async ([k, url]) => [k, await get(url, /\.ttf$/.test(url) ? 'font' : 'img')]))
    .then(Object.fromEntries)
    .catch(e => { mpkNoticeAssetsP = null; throw e; });
  return mpkNoticeAssetsP;
}
function mpkNoticeFonts(pdf, a) {
  pdf.addFileToVFS('URWGothic-Book.ttf', a.book); pdf.addFont('URWGothic-Book.ttf', 'URWGothic', 'normal');
  pdf.addFileToVFS('URWGothic-Demi.ttf', a.demi); pdf.addFont('URWGothic-Demi.ttf', 'URWGothic', 'bold');
}
const MPK_LT = { pt: 9.6, lead: 4.19, x: 19.9, indent: 31.8, right: 179.2, gap: 2.9 };
const mpkLtFont = (pdf, bold) => pdf.setFont('URWGothic', bold ? 'bold' : 'normal');
// text with an underline the width of the text
function mpkLtUnder(pdf, t, x, y) {
  pdf.text(t, x, y);
  pdf.setLineWidth(0.25); pdf.setDrawColor(0); pdf.line(x, y + 0.75, x + pdf.getTextWidth(t), y + 0.75);
}
// A justified paragraph of '**bold**' segments: the first line starts at xFirst, the rest at x0; returns the last baseline
function mpkLtPara(pdf, text, x0, xFirst, xR, y, justify = true) {
  // a word is glued to the one before when no space parts them (a bold run ending mid-word: "**Lot 3351**,")
  const words = [];
  let prevEnd = true;
  for (const sg of mpkRichSegs(text)) {
    sg.t.split(/\s+/).forEach((w, i) => { if (w) words.push({ w, b: sg.b, glue: i === 0 && !prevEnd && words.length > 0 }); });
    prevEnd = /\s$/.test(sg.t);
  }
  const width = wd => { mpkLtFont(pdf, wd.b); return pdf.getTextWidth(wd.w); };
  mpkLtFont(pdf, false);
  const space = pdf.getTextWidth(' ');
  const units = [];
  for (const wd of words) {
    if (wd.glue && units.length) units[units.length - 1].push(wd); else units.push([wd]);
  }
  const uw = u => u.reduce((a, wd) => a + width(wd), 0);
  const lines = [];
  let cur = [], curW = 0;
  for (const u of units) {
    const w = uw(u), avail = xR - (lines.length ? x0 : xFirst);
    if (cur.length && curW + space + w > avail) { lines.push(cur); cur = []; curW = 0; }
    curW += (cur.length ? space : 0) + w;
    cur.push(u);
  }
  if (cur.length) lines.push(cur);
  lines.forEach((ln, i) => {
    const start = i ? x0 : xFirst, avail = xR - start, total = ln.reduce((a, u) => a + uw(u), 0);
    const gap = justify && i < lines.length - 1 && ln.length > 1 ? (avail - total) / (ln.length - 1) : space;
    let x = start;
    for (const u of ln) {
      for (const wd of u) { mpkLtFont(pdf, wd.b); pdf.text(wd.w, x, y); x += pdf.getTextWidth(wd.w); }
      x += gap;
    }
    if (i < lines.length - 1) y += MPK_LT.lead;
  });
  return y;
}
// The letterhead, its rule, the faint crest behind the text and the Beautiful Terengganu mark
function mpkLtFrame(pdf, a) {
  pdf.addImage(a.mark, 'PNG', 36, 136, 131.6, 80);
  pdf.addImage(a.head, 'PNG', 13.6, 6.8, 175.4, 39.5);
  pdf.setDrawColor(0); pdf.setLineWidth(0.37); pdf.line(0, 47.6, 202.6, 47.6);
  pdf.addImage(a.foot, 'PNG', 164.3, 262.5, 29.6, 16.7);
}
function mpkNoticeLetterPage(pdf, c, a) {
  const T = MPK_LT, L = c.L;
  pdf.setTextColor(0);
  mpkLtFrame(pdf, a);
  pdf.setFontSize(T.pt);
  // reference and dates, right
  mpkLtFont(pdf, true); pdf.text(c.ref, 133.8, 56.2);
  mpkLtFont(pdf, false);
  const lab = `${L.dateLabel} : `;
  pdf.text(lab + c.date, 133.8, 60.3);
  if (c.hijri) pdf.text(c.hijri, 133.8 + pdf.getTextWidth(lab), 64.6);
  // DAFTAR/TANGAN and the addressee; below it everything follows on from the address
  mpkLtFont(pdf, true); mpkLtUnder(pdf, L.hand, 20.4, 68.1);
  let y = 75;
  c.to.forEach((t, i) => {
    mpkLtFont(pdf, i === 0);
    if (i === c.to.length - 1) mpkLtUnder(pdf, t, 20.4, y); else pdf.text(t, 20.4, y);
    if (i < c.to.length - 1) y += 4.15;
  });
  mpkLtFont(pdf, false); pdf.text(L.dear, 20.4, y += 8.4);
  // title: bold, underlined, wrapped
  mpkLtFont(pdf, true);
  y += 8.9;
  L.title.forEach(t => pdf.splitTextToSize(t, T.right - 20.1).forEach(l => { mpkLtUnder(pdf, l, 20.1, y); y += 4.4; }));
  // numbered paragraphs (the first unnumbered, as in MPK's letters)
  y += 6.6 - 4.4;
  c.paras.forEach((para, i) => {
    if (i) { mpkLtFont(pdf, false); pdf.text(`${i + 1}.`, T.x, y); }
    y = mpkLtPara(pdf, para, T.x, i ? T.indent : T.x, T.right, y) + T.lead + T.gap;
  });
  mpkLtFont(pdf, false); pdf.text(L.thanks, T.x - 0.3, y += 2.0);
  mpkLtFont(pdf, true); pdf.text(L.motto[0], T.x - 0.5, y += 11.1); pdf.text(L.motto[1], T.x - 0.5, y += 4.2);
  mpkLtFont(pdf, false); pdf.text(L.trust, T.x - 0.6, y += 8.4);
  mpkLtFont(pdf, true); pdf.text(L.sign[0], T.x - 0.6, y += 19.2);
  mpkLtFont(pdf, false); pdf.text(L.sign[1], T.x - 0.6, y += 3.9); pdf.text(L.sign[2], T.x - 0.6, y += 4.2);
  // s.k.
  y += 8.2;
  pdf.text('s.k.', 18.8, y);
  L.cc.forEach(([dept, act], i) => {
    pdf.text(`${i + 1}.`, 31.1, y); pdf.text(dept, 42.6, y);
    pdf.text(L.ccOf, 42.6, y + 4.2); pdf.text('-', 128.6, y + 4.2); pdf.text(act, 131.5, y + 4.2);
    y += 10.4;
  });
  pdf.text(`${L.cc.length + 1}.`, 31.1, y); pdf.text(L.file, 42.6, y);
  pdf.setFontSize(5.9); pdf.text(L.code, 18.5, Math.max(y + 9, 258));
  // the draft note, small at the foot
  pdf.setFontSize(6.2); pdf.setTextColor(150, 40, 40);
  pdf.text(pdf.splitTextToSize(L.draft, 140), 18.5, 287);
  pdf.setTextColor(0);
}
// Appendix (single notices): the map snapshot and the building's details, on the same letterhead
function mpkNoticeAnnex(pdf, c, t, img, a) {
  const T = MPK_LT;
  mpkLtFrame(pdf, a);
  pdf.setFontSize(T.pt); pdf.setTextColor(0);
  mpkLtFont(pdf, true); pdf.text(c.ref, 133.8, 56.2);
  mpkLtUnder(pdf, c.L.annex, 20.4, 68.1);
  mpkLtFont(pdf, false); pdf.text(c.L.annexSub, 20.4, 72.6);
  let y = 78;
  if (img) {
    const w = T.right - 20.4, h = Math.min(w * img.aspect, 110);
    pdf.addImage(img.url, 'JPEG', 20.4, y, w, h);
    pdf.setDrawColor(0); pdf.setLineWidth(0.25); pdf.rect(20.4, y, w, h);
    y += h + 8;
  }
  t.lines.forEach(([k, v]) => {
    mpkLtFont(pdf, true); pdf.text(k, 20.4, y);
    mpkLtFont(pdf, false);
    const lines = pdf.splitTextToSize(String(v), T.right - 72);
    pdf.text(':', 66, y); pdf.text(lines, 70, y);
    y += Math.max(1, lines.length) * T.lead + 1.2;
  });
}
// One notice: the letter, plus the appendix when there is a map snapshot
function mpkNoticePage(pdf, p, o, img, a) {
  const s = MPK.settings, area = MPK_NOTICE_AREA[o.lang][p.kawasan] || 'Kemaman';
  const reason = mpkNoticeReason(o.lang, p, mpkJenis(p, s), s.rizab);
  mpkNoticeLetterPage(pdf, mpkNoticeLetter(o.lang, p, area, reason, o.days, o.date), a);
  if (img) { pdf.addPage(); mpkNoticeAnnex(pdf, mpkNoticeLetter(o.lang, p, area, reason, o.days, o.date), mpkNoticeContent(o.lang, p, area, reason, o.days, o.date), img, a); }
}
async function mpkNoticeOne(id) {
  const f = MPK.data.buildings.features.find(x => x.properties.id === id);
  if (!f || !window.jspdf) { if (!window.jspdf) showToast('⚠️ PDF library not loaded'); return; }
  const p = f.properties, o = mpkNoticeOpts();
  try { map.getSource('mpk-highlight').setData(f); } catch (e) {}
  showLoading('Drafting notice…', p.plus_code);
  try {
    const a = await mpkNoticeAssets();
    const prev = { center: map.getCenter(), zoom: map.getZoom(), bearing: map.getBearing(), pitch: map.getPitch() };
    map.jumpTo({ center: [p.lng, p.lat], zoom: 18.6, pitch: 0, bearing: 0 });
    await new Promise(r => { const t = setTimeout(r, 8000); map.once('idle', () => { clearTimeout(t); r(); }); });
    const url = typeof snapshotMapCanvas === 'function' ? await snapshotMapCanvas() : null;
    const c = map.getCanvas(), img = url ? { url, aspect: c.height / c.width } : null;
    map.jumpTo(prev);
    const { jsPDF } = window.jspdf, pdf = new jsPDF({ unit: 'mm', format: 'a4' });
    mpkNoticeFonts(pdf, a);
    mpkNoticePage(pdf, p, o, img, a);
    pdf.save(`notis_${o.lang}_${p.plus_code.replace('+', '')}.pdf`);
    addActivityLog('Notice drafted', p.plus_code);
  } catch (e) {
    showToast('⚠️ Could not draft the notice: ' + e.message);
  } finally { hideLoading(); }
}
async function mpkNoticeBatch() {
  const list = MPK_FEAT.notice || [];
  if (!list.length || !window.jspdf) return;
  showLoading('Drafting notices…', list.length + ' buildings');
  try {
    const a = await mpkNoticeAssets();
    const o = mpkNoticeOpts(), { jsPDF } = window.jspdf, pdf = new jsPDF({ unit: 'mm', format: 'a4' });
    mpkNoticeFonts(pdf, a);
    list.forEach((p, i) => { if (i) pdf.addPage(); mpkNoticePage(pdf, p, o, null, a); });
    pdf.save(`notis_${o.lang}_${MPK.area}_${list.length}.pdf`);
    addActivityLog('Notices drafted', list.length + ' buildings');
  } catch (e) {
    showToast('⚠️ Could not draft the notices: ' + e.message);
  } finally { hideLoading(); }
}

// ---------- Developer Portfolio ----------
function mpkPortRun() {
  if (!MPK.data.pelan) { mpkHud('Developer Portfolio', 'The plan registers did not load.', { icon: '🏢', side: true }); return; }
  MPK_FEAT.port = mpkPortfolios(MPK.data.pelan.features, MPK.data.daftar);
  mpkFeatSrc('mpk-feat-port', mpkFC([]));
  mpkFeatLayer({ id: 'mpk-feat-port-fill', type: 'fill', source: 'mpk-feat-port', filter: ['==', ['geometry-type'], 'Polygon'],
    paint: { 'fill-color': '#7C4DFF', 'fill-opacity': 0.35 } });
  mpkFeatLayer({ id: 'mpk-feat-port-line', type: 'line', source: 'mpk-feat-port',
    paint: { 'line-color': ['case', ['==', ['get', 'keputusan'], 'tolak'], '#D50000', '#651FFF'], 'line-width': 2.4 } });
  mpkFeatLayer({ id: 'mpk-feat-port-dot', type: 'circle', source: 'mpk-feat-port', maxzoom: 15,
    paint: { 'circle-color': '#651FFF', 'circle-radius': 5, 'circle-stroke-color': '#fff', 'circle-stroke-width': 1.5 } });
  mpkHud('Developer Portfolio', `
    <input type="search" class="mpk-reg-q" id="mpk-port-q" placeholder="Search a developer or applicant" oninput="mpkPortList()" aria-label="Applicant">
    <div class="mpk-hud-sub" id="mpk-port-sum"></div>
    <div class="mpk-hud-list" id="mpk-port-list"></div>
    <div id="mpk-port-card"></div>`, { icon: '🏢', side: true });
  mpkPortList();
}
function mpkPortList() {
  const q = mpkApplicantKey(document.getElementById('mpk-port-q').value);
  const all = MPK_FEAT.port || [], hits = all.map((a, i) => ({ a, i })).filter(({ a }) => !q || a.key.includes(q));
  document.getElementById('mpk-port-sum').textContent = `${mpkNum(all.length)} applicants in MPK's plan registers` + (q ? ` · ${hits.length} match` : ' · largest first');
  document.getElementById('mpk-port-list').innerHTML = hits.slice(0, 12).map(({ a, i }) => `
    <button class="mpk-hud-item" onclick="mpkPortShow(${i})"><b>${mpkEsc(a.name)}</b>
      <span class="num">${a.records} plan${a.records > 1 ? 's' : ''}${a.first ? ` · ${a.first}${a.last !== a.first ? '–' + a.last : ''}` : ''}</span></button>`).join('')
    || '<div class="mpk-hud-sub">No applicant matches.</div>';
}
function mpkPortShow(i) {
  const a = (MPK_FEAT.port || [])[i];
  if (!a) return;
  const feats = MPK.data.pelan.features.filter(f => f.properties.pemohon && mpkApplicantKey(f.properties.pemohon) === a.key);
  map.getSource('mpk-feat-port').setData(mpkFC(feats));
  if (feats.length) map.fitBounds(mpkBoundsOf(feats), { padding: MPK_HUD_PAD, maxZoom: 18, duration: 1100 });
  // one row per plan: records with the same file, lot, decision and date are the same plan drawn in pieces
  const byRec = new Map(feats.map(f => [f.properties.rekod, f.properties]));
  const rows = new Map();
  for (const p of byRec.values()) {
    const k = [p.fail || p.rekod, p.lot, p.keputusan, String(p.tarikh || '').slice(0, 10)].join('|');
    if (rows.has(k)) rows.get(k).n++; else rows.set(k, { p, n: 1, fail: p.fail });
  }
  const files = [...rows.values()].sort((x, y) => String(y.p.tarikh).localeCompare(String(x.p.tarikh)));
  document.getElementById('mpk-port-list').innerHTML = '';
  document.getElementById('mpk-port-card').innerHTML = `
    <div class="mpk-port-top"><button type="button" class="mpk-port-back" onclick="mpkPortBack()" aria-label="Back to all developers">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>All developers</button></div>
    <div class="mpk-port-name">${mpkEsc(a.name)}</div>
    <div class="mpk-hud-stats"><div><b>${a.records}</b><small>records on the map</small></div><div><b>${a.lulus}</b><small>approved</small></div>
      <div><b>${a.built}</b><small>with a building</small></div></div>
    <div class="mpk-hud-sub">${a.first ? `Approvals ${a.first}${a.last !== a.first ? ' to ' + a.last : ''}` : 'No approval dates'}${a.tolak ? ` · ${a.tolak} rejected` : ''}${a.off ? ` · ${a.off} more shop record${a.off > 1 ? 's' : ''} without a drawing` : ''}</div>
    <div class="mpk-hud-sub">${mpkNum(files.length)} plan file${files.length === 1 ? '' : 's'}${files.length > 30 ? ' · latest 30 shown' : ''}</div>
    <div class="mpk-hud-list">${files.slice(0, 30).map(({ p, n }) => `
      <button class="mpk-hud-item" onclick="mpkPortFly(${mpkEsc(JSON.stringify([p.fail || '', p.lot || '', p.rekod]))})"><b>${mpkEsc(p.fail || p.rekod)}</b>
        <span>${p.lot ? 'Lot ' + mpkEsc(p.lot) : ''}${n > 1 ? ` <em class="mpk-port-n">× ${n}</em>` : ''}</span>
        <span class="num">${p.keputusan === 'lulus' ? 'Approved' : p.keputusan === 'tolak' ? 'Rejected' : 'No decision'}${p.tarikh ? ' · ' + mpkEsc(String(p.tarikh).slice(0, 10)) : ''}</span></button>`).join('')}</div>
    <div class="mpk-hud-actions"><button class="mpk-wb-btn" onclick="mpkPortBack()">Back to all developers</button></div>`;
  const card = document.getElementById('mpk-port-card');
  if (card.closest('.mpk-hud-body')) card.closest('.mpk-hud-body').scrollTop = 0;
}
// Back to every developer: the search kept, the map cleared and back on the area
function mpkPortBack() {
  document.getElementById('mpk-port-card').innerHTML = '';
  try { map.getSource('mpk-feat-port').setData(mpkFC([])); } catch (e) {}
  if (MPK.bounds) map.fitBounds(MPK.bounds[MPK.area], { padding: MPK_HUD_PAD, duration: 900 });
  mpkPortList();
  const q = document.getElementById('mpk-port-q');
  if (q) q.focus();
}
// [file, lot, record]: every piece of that plan (same file and lot), or the one record
function mpkPortFly([fail, lot, rekod]) {
  const fs = MPK.data.pelan.features.filter(f => fail ? f.properties.fail === fail && (f.properties.lot || '') === lot : f.properties.rekod === rekod);
  if (fs.length) map.fitBounds(mpkBoundsOf(fs), { padding: MPK_HUD_PAD, maxZoom: 19, duration: 900 });
}

// ---------- Approval Timeline ----------
function mpkTimelineRun(token) {
  if (!MPK.data.pelan) { mpkHud('Approval Timeline', 'The plan registers did not load.', { icon: '📅', wide: true }); return; }
  const years = mpkApprovalYears(MPK.data.pelan.features);
  if (!years.length) { mpkHud('Approval Timeline', 'No dated approvals.', { icon: '📅', wide: true }); return; }
  const feats = [], pts = [], done = new Set();
  for (const f of MPK.data.pelan.features) {
    const p = f.properties, yr = +String(p.tarikh || '').slice(0, 4);
    if (!(yr >= years[0].y) || (p.keputusan !== 'lulus' && p.keputusan !== 'tolak')) continue;
    feats.push({ ...f, properties: { yr, k: p.keputusan } });
    if (!done.has(p.rekod)) { done.add(p.rekod); const c = mpkGeomCentre(f.geometry); if (c) pts.push(mpkPt(c, { yr, k: p.keputusan })); }
  }
  mpkFeatSrc('mpk-feat-tl', mpkFC(feats));
  mpkFeatSrc('mpk-feat-tl-pt', mpkFC(pts));
  mpkFeatLayer({ id: 'mpk-feat-tl-line', type: 'line', source: 'mpk-feat-tl', filter: ['<=', ['get', 'yr'], 0],
    paint: { 'line-color': ['case', ['==', ['get', 'k'], 'tolak'], '#D50000', '#00BFA5'], 'line-width': 1.6 } });
  mpkFeatLayer({ id: 'mpk-feat-tl-pt', type: 'circle', source: 'mpk-feat-tl-pt', filter: ['<=', ['get', 'yr'], 0],
    paint: { 'circle-color': ['case', ['==', ['get', 'k'], 'tolak'], '#D50000', '#00BFA5'], 'circle-radius': 4,
             'circle-stroke-color': '#fff', 'circle-stroke-width': 1, 'circle-opacity': 0.85 } });
  const maxN = Math.max(...years.map(y => y.lulus + y.tolak), 1), Y0 = years[0].y, Y1 = years[years.length - 1].y;
  MPK_FEAT.tl = { years, i: 0, playing: true, token };
  mpkHud('Approval Timeline', `
    <div class="mpk-tl-top"><div class="mpk-tm-year mono" id="mpk-tl-year">${Y0}</div>
      <div><div class="mpk-hud-sub" id="mpk-tl-sub"></div><div class="mpk-hud-sub" id="mpk-tl-total"></div></div>
      <button class="mpk-btn" id="mpk-tl-play" onclick="mpkTimelinePlay()">Pause</button></div>
    <svg class="mpk-tl-chart" viewBox="0 0 320 70" role="img" aria-label="Plan approvals per year">${years.map((y, i) => {
      const w = 300 / years.length, h = (y.lulus + y.tolak) / maxN * 52;
      return `<rect class="mpk-tl-bar" data-i="${i}" x="${10 + i * w + 0.6}" y="${58 - h}" width="${Math.max(1, w - 1.2)}" height="${h}"><title>${y.y}: ${y.lulus} approved${y.tolak ? ', ' + y.tolak + ' rejected' : ''}</title></rect>`;
    }).join('')}<text x="10" y="68" font-size="8" fill="#6b7685">${Y0}</text><text x="310" y="68" font-size="8" fill="#6b7685" text-anchor="end">${Y1}</text></svg>
    <input type="range" class="mpk-range" id="mpk-tl-r" min="0" max="${years.length - 1}" value="0" oninput="mpkTimelineSet(+this.value, true)" aria-label="Year">
    <div class="mpk-hud-note">One mark per plan record of MPK's two registers (Teluk Kalong and shop plans), on its approval date. Teal = approved, red = rejected.</div>`,
    { icon: '📅', wide: true });
  mpkFeatFit(MPK.bounds.all, { padding: { top: 330, bottom: 40, left: 60, right: 60 }, duration: 1200 });
  mpkTimelineSet(0);
  const tick = () => {
    const t = MPK_FEAT.tl;
    if (!mpkFeatAlive(token) || !t) return;
    if (t.playing) {
      if (t.i < t.years.length - 1) mpkTimelineSet(t.i + 1);
      else { t.playing = false; const b = document.getElementById('mpk-tl-play'); if (b) b.textContent = 'Replay'; }
    }
    timer = setTimeout(tick, 900);
  };
  let timer = setTimeout(tick, 1500);
  MPK_FEAT.cleanup.push(() => { clearTimeout(timer); MPK_FEAT.tl = null; });
}
function mpkTimelineSet(i, byHand) {
  const t = MPK_FEAT.tl;
  if (!t || !map.getLayer('mpk-feat-tl-line')) return;
  if (byHand) { t.playing = false; document.getElementById('mpk-tl-play').textContent = 'Play'; }
  t.i = i;
  const y = t.years[i];
  map.setFilter('mpk-feat-tl-line', ['<=', ['get', 'yr'], y.y]);
  map.setFilter('mpk-feat-tl-pt', ['<=', ['get', 'yr'], y.y]);
  map.setPaintProperty('mpk-feat-tl-pt', 'circle-radius', ['case', ['==', ['get', 'yr'], y.y], 9, 3.5]);
  map.setPaintProperty('mpk-feat-tl-pt', 'circle-stroke-width', ['case', ['==', ['get', 'yr'], y.y], 3, 1]);
  const total = t.years.slice(0, i + 1).reduce((a, x) => a + x.lulus, 0);
  document.getElementById('mpk-tl-year').textContent = y.y;
  document.getElementById('mpk-tl-sub').textContent = `${y.lulus} approved${y.tolak ? ` · ${y.tolak} rejected` : ''} in ${y.y}`;
  document.getElementById('mpk-tl-total').textContent = `${mpkNum(total)} approvals so far`;
  document.getElementById('mpk-tl-r').value = i;
  document.querySelectorAll('.mpk-tl-bar').forEach(b => b.classList.toggle('on', +b.dataset.i <= i));
}
function mpkTimelinePlay() {
  const t = MPK_FEAT.tl;
  if (!t) return;
  if (!t.playing && t.i >= t.years.length - 1) mpkTimelineSet(0);
  t.playing = !t.playing;
  document.getElementById('mpk-tl-play').textContent = t.playing ? 'Pause' : 'Play';
}

// ---------- Revenue Map ----------
function mpkMoneyRun() {
  MPK_FEAT.moneyYears = MPK_FEAT.moneyYears || 3;
  mpkHud('Revenue Map', `
    <div class="mpk-sim-top"><label for="mpk-money-y">Years of assessment tax to recover</label><b class="mono" id="mpk-money-yv"></b></div>
    <input type="range" id="mpk-money-y" class="mpk-range" min="1" max="10" step="1" value="${MPK_FEAT.moneyYears}" oninput="mpkMoneySet(+this.value)">
    <div class="mpk-hud-stats" id="mpk-money-stats"></div>
    <div class="mpk-hud-sub"><b>Largest single amounts</b> (illegal buildings)</div>
    <div class="mpk-hud-list" id="mpk-money-list"></div>
    <div class="mpk-hud-note" id="mpk-money-note"></div>`, { icon: '💰', side: true });
  // frame the area flat first, then tilt so the columns stand up
  mpkFeatMove(() => mpkFeatFit(MPK.bounds[MPK.area], { padding: MPK_HUD_PAD, duration: 900 }))
    .then(() => { if (MPK_FEAT.key === 'money') map.easeTo({ pitch: 55, bearing: -18, zoom: map.getZoom() + 0.8, duration: 1200 }); });
  mpkMoneySet(MPK_FEAT.moneyYears);
}
function mpkMoneySet(years) {
  MPK_FEAT.moneyYears = years;
  const s = MPK.settings, rates = MPK.rates, feats = mpkAreaFeatures();
  const rows = feats.map(f => ({ f, st: mpkStatus(f.properties, s) })).filter(x => x.st !== 'legal')
    .map(x => ({ ...x, r: mpkRecoverable(x.f.properties.area_m2, rates, years) }));
  const max = Math.max(1, ...rows.map(x => x.r.total));
  mpkFeatSrc('mpk-feat-money', mpkFC(rows.map(x => ({ ...x.f, properties: { ...x.f.properties, st: x.st, rm: x.r.total,
    h: 6 + 260 * Math.sqrt(x.r.total / max) } }))));
  if (!map.getLayer('mpk-feat-money')) {
    mpkFeatLayer({ id: 'mpk-feat-money', type: 'fill-extrusion', source: 'mpk-feat-money',
      paint: { 'fill-extrusion-height': ['get', 'h'], 'fill-extrusion-opacity': 0.92, 'fill-extrusion-vertical-gradient': true,
               'fill-extrusion-color': ['case', ['==', ['get', 'st'], 'suspected'],
                 ['interpolate', ['linear'], ['get', 'h'], 6, '#FFE082', 120, '#FFB300', 266, '#E65100'], '#90A4AE'] } });
  }
  const sum = st => rows.filter(x => x.st === st).reduce((a, x) => a + x.r.total, 0);
  const sus = rows.filter(x => x.st === 'suspected').sort((a, b) => b.r.total - a.r.total);
  MPK_FEAT.money = sus;
  document.getElementById('mpk-money-yv').textContent = years + (years > 1 ? ' years' : ' year');
  document.getElementById('mpk-money-stats').innerHTML = `
    <div><b>${mpkRM(sum('suspected'))}</b><small>from ${mpkNum(sus.length)} illegal buildings</small></div>
    <div><b>${mpkRM(sum('unverified'))}</b><small>more if pending ones lack approval</small></div>`;
  document.getElementById('mpk-money-list').innerHTML = sus.slice(0, 10).map((x, i) => `
    <button class="mpk-hud-item" onclick="mpkMoneyFly(${i})"><b>${x.f.properties.plus_code}</b>
      <span>${mpkFmtM2(x.f.properties.area_m2)}</span><span class="num">${mpkRM(x.r.total)}</span></button>`).join('')
    || '<div class="mpk-hud-sub">No illegal buildings in this area.</div>';
  document.getElementById('mpk-money-note').textContent = `Per building: footprint × RM ${rates.fee}/m² processing fee + footprint × RM ${rates.cukai}/m² `
    + `assessment tax × ${years} year${years > 1 ? 's' : ''}. Rates are assumptions; change them in Analysis → Estimated council revenue. `
    + 'Gold columns = illegal, grey = pending.';
}
function mpkMoneyFly(i) {
  const x = (MPK_FEAT.money || [])[i];
  if (!x) return;
  const p = x.f.properties;
  map.flyTo({ center: [p.lng, p.lat], zoom: 18, pitch: 60, bearing: map.getBearing() + 30, padding: { right: 360 }, duration: 1400 });
  try { map.getSource('mpk-highlight').setData(x.f); } catch (e) {}
}
