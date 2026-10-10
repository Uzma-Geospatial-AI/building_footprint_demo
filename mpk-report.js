// ============================================================
// MPK KEMAMAN — PDF REPORT
// A council-style A4 report of the buildings in the marked areas: summary, map, breakdown by
// area and size, the list of suspected buildings, notes, and blank verification blocks for
// MPK officers to sign. It is a system-generated DRAFT for review: no council logo, seal,
// signature or official reference number is added.
// Loaded after mpk.js; uses jsPDF (window.jspdf) and the mpk.js helpers.
// ============================================================

// ---------- Pure (also exported for tools/test_mpk_report.js) ----------
// System report ID, e.g. BV-20261011-1405 (BuildVision, local date and time)
function mpkReportId(d) {
  const p = n => String(n).padStart(2, '0');
  return `BV-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

const mpkFmt = n => Math.round(n).toLocaleString('en-MY');

// Report wording: English (en) or Bahasa Melayu (ms)
const MPK_REPORT_TEXT = {
  en: {
    months: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
    unit: 'Town Planning · Illegal Construction Monitoring',
    stamp: 'DRAFT · FOR REVIEW', stampSub: 'Not an official decision', watermark: 'DRAFT',
    title: 'REPORT ON BUILDINGS SUSPECTED OF LACKING PLANNING PERMISSION',
    areas: { tk: 'Teluk Kalong Industrial Area', bpb: 'Bandar Putra – Berenjut Corridor', bbc: 'Binjai – Bandar Chukai Corridor' },
    short: { tk: 'Teluk Kalong', bpb: 'B. Putra – Berenjut', bbc: 'Binjai – Chukai' },
    allAreas: 'All marked areas', allAreasLong: 'All marked areas (Teluk Kalong Industrial Area and two road corridors)',
    particulars: 'Particulars', reportId: 'Report ID', systemGen: 'system generated', dateGen: 'Date generated',
    studyArea: 'Study area', scope: 'Scope', status: 'Status', preparedWith: 'Prepared with',
    scopeText: 'Teluk Kalong: buildings inside the PBT planning boundary. Corridors: buildings within 50 m of the road centreline.',
    statusText: 'Draft for review by MPK. Findings require site verification before any action.',
    sec: ['Summary', 'Location map', 'Breakdown by area', 'Building size', 'Suspected buildings', 'Notes and limitations', 'Verification'],
    summary: (b, f) => `${f(b.total)} buildings with a total footprint of ${f(b.m2)} m² were assessed. `
      + `${b.byStatus.legal.pct.toFixed(1)}% stand on an MPK-approved lot (legal), `
      + `${b.byStatus.suspected.pct.toFixed(1)}% (${f(b.byStatus.suspected.n)} buildings, ${f(b.byStatus.suspected.m2)} m²) `
      + `are suspected of lacking planning permission, and ${b.byStatus.unverified.pct.toFixed(1)}% could not be verified `
      + 'against an approval record.',
    statusLabel: { suspected: 'Suspected illegal', legal: 'Legal · on approved lot', unverified: 'Not verified' },
    total: 'Total', buildings: 'Buildings', share: 'Share', footprint: 'Footprint (m²)', area: 'Area',
    suspected: 'Suspected', legal: 'Legal', unverified: 'Not verified', sizeCol: 'Footprint size',
    sizes: ['Under 100 m²', '100 – 500 m²', '500 – 1,000 m²', '1,000 – 5,000 m²', '5,000 m² and over'],
    mapKey: 'Red: suspected illegal · Teal: legal (on approved lot) · Grey: not verified · Dashed orange: planning boundary',
    listNote: 'Listed largest first. Locations can be found with the Plus Code (e.g. in Google Maps) or the cadastral lot / UPI.',
    no: 'No.', reason: 'Reason', none: 'No suspected buildings in this area',
    reasonList: 'On MPK suspect list',
    reasonRoad: (d, r) => `Within ${d} m of road centreline (reserve ${r} m)`,
    notes: r => [
      'Building footprints: Google Open Buildings (AI-detected). Teluk Kalong suspected buildings: the list in the Uzma/MPK building data (is_mockup).',
      'Planning boundary and approved lots digitised from MPK’s map; cadastral lots from NDCDB; road centrelines from OpenStreetMap.',
      `Corridor buildings are flagged when any part lies within ${r} m of the road centreline (assumed road reserve).`,
      '"Legal" means the building stands on an MPK-approved lot; it does not confirm Kebenaran Merancang or building plan approval.',
      'This draft is produced automatically for planning review. Every case requires site verification before enforcement.',
    ],
    signers: ['Prepared by', 'Checked by', 'Approved by'], signLines: ['Signature', 'Name', 'Designation', 'Date'],
    footer: (id, d) => `Report ${id} · Generated ${d} by Geospatial AI BuildVision · System-generated draft for MPK review`,
    page: (i, n) => `Page ${i} of ${n}`, file: 'Report',
  },
  ms: {
    months: ['Januari', 'Februari', 'Mac', 'April', 'Mei', 'Jun', 'Julai', 'Ogos', 'September', 'Oktober', 'November', 'Disember'],
    unit: 'Perancangan Bandar · Pemantauan Binaan Tanpa Kebenaran',
    stamp: 'DRAF · UNTUK SEMAKAN', stampSub: 'Bukan keputusan rasmi', watermark: 'DRAF',
    title: 'LAPORAN BANGUNAN YANG DISYAKI TIADA KEBENARAN MERANCANG',
    areas: { tk: 'Kawasan Perindustrian Teluk Kalong', bpb: 'Koridor Bandar Putra – Berenjut', bbc: 'Koridor Binjai – Bandar Chukai' },
    short: { tk: 'Teluk Kalong', bpb: 'B. Putra – Berenjut', bbc: 'Binjai – Chukai' },
    allAreas: 'Semua kawasan bertanda', allAreasLong: 'Semua kawasan bertanda (Kawasan Perindustrian Teluk Kalong dan dua koridor jalan)',
    particulars: 'Butiran', reportId: 'ID Laporan', systemGen: 'dijana sistem', dateGen: 'Tarikh dijana',
    studyArea: 'Kawasan kajian', scope: 'Skop', status: 'Status', preparedWith: 'Disediakan dengan',
    scopeText: 'Teluk Kalong: bangunan di dalam sempadan perancangan PBT. Koridor: bangunan dalam lingkungan 50 m dari garis tengah jalan.',
    statusText: 'Draf untuk semakan MPK. Penemuan perlu disahkan di tapak sebelum sebarang tindakan diambil.',
    sec: ['Ringkasan', 'Peta lokasi', 'Pecahan mengikut kawasan', 'Saiz bangunan', 'Bangunan disyaki', 'Nota dan batasan', 'Pengesahan'],
    summary: (b, f) => `Sebanyak ${f(b.total)} bangunan dengan jumlah keluasan tapak ${f(b.m2)} m² telah dinilai. `
      + `${b.byStatus.legal.pct.toFixed(1)}% terletak di atas lot yang diluluskan MPK (sah), `
      + `${b.byStatus.suspected.pct.toFixed(1)}% (${f(b.byStatus.suspected.n)} bangunan, ${f(b.byStatus.suspected.m2)} m²) `
      + `disyaki tiada kebenaran merancang, dan ${b.byStatus.unverified.pct.toFixed(1)}% tidak dapat disahkan `
      + 'dengan rekod kelulusan.',
    statusLabel: { suspected: 'Disyaki haram', legal: 'Sah · di atas lot diluluskan', unverified: 'Belum disahkan' },
    total: 'Jumlah', buildings: 'Bangunan', share: 'Peratus', footprint: 'Keluasan tapak (m²)', area: 'Kawasan',
    suspected: 'Disyaki', legal: 'Sah', unverified: 'Belum disahkan', sizeCol: 'Saiz keluasan tapak',
    sizes: ['Bawah 100 m²', '100 – 500 m²', '500 – 1,000 m²', '1,000 – 5,000 m²', '5,000 m² dan ke atas'],
    mapKey: 'Merah: disyaki haram · Hijau kebiruan: sah (di atas lot diluluskan) · Kelabu: belum disahkan · Oren putus-putus: sempadan perancangan',
    listNote: 'Disenaraikan mengikut saiz terbesar. Lokasi boleh dicari menggunakan Plus Code (cth. dalam Google Maps) atau lot kadaster / UPI.',
    no: 'Bil.', reason: 'Sebab', none: 'Tiada bangunan disyaki di kawasan ini',
    reasonList: 'Dalam senarai syak MPK',
    reasonRoad: (d, r) => `Dalam ${d} m dari garis tengah jalan (rizab ${r} m)`,
    notes: r => [
      'Tapak bangunan: Google Open Buildings (dikesan AI). Bangunan disyaki di Teluk Kalong: senarai dalam data bangunan Uzma/MPK (is_mockup).',
      'Sempadan perancangan dan lot diluluskan didigitkan daripada peta MPK; lot kadaster daripada NDCDB; garis tengah jalan daripada OpenStreetMap.',
      `Bangunan koridor ditanda apabila mana-mana bahagiannya terletak dalam ${r} m dari garis tengah jalan (andaian rizab jalan).`,
      '"Sah" bermaksud bangunan terletak di atas lot yang diluluskan MPK; ia tidak mengesahkan Kebenaran Merancang atau kelulusan pelan bangunan.',
      'Draf ini dijana secara automatik untuk semakan perancangan. Setiap kes perlu disahkan di tapak sebelum tindakan penguatkuasaan.',
    ],
    signers: ['Disediakan oleh', 'Disemak oleh', 'Diluluskan oleh'], signLines: ['Tandatangan', 'Nama', 'Jawatan', 'Tarikh'],
    footer: (id, d) => `Laporan ${id} · Dijana ${d} oleh Geospatial AI BuildVision · Draf dijana sistem untuk semakan MPK`,
    page: (i, n) => `Halaman ${i} daripada ${n}`, file: 'Laporan',
  },
};
const mpkReportText = lang => MPK_REPORT_TEXT[lang] || MPK_REPORT_TEXT.en;
const mpkReportDate = (d, lang) => `${d.getDate()} ${mpkReportText(lang).months[d.getMonth()]} ${d.getFullYear()}`;

// Why a building is flagged, in plain words
function mpkReportReason(p, s, lang) {
  const j = mpkJenis(p, s), T = mpkReportText(lang);
  if (j === 'mockup') return T.reasonList;
  if (j === 'rizab') return T.reasonRoad(p.jarak_jalan_m, s.rizab);
  return '';
}

// Table rows of the suspected buildings, largest first
function mpkReportSuspectRows(features, s, lang = 'en') {
  return features.filter(f => mpkJenis(f.properties, s))
    .sort((a, b) => b.properties.area_m2 - a.properties.area_m2)
    .map((f, i) => {
      const p = f.properties;
      return [String(i + 1), p.plus_code, mpkReportText(lang).short[p.kawasan], p.lot || '—', p.upi || '—',
        mpkReportReason(p, s, lang), mpkFmt(p.area_m2)];
    });
}

// Summary rows: one per status plus the total
function mpkReportSummaryRows(features, s, lang = 'en') {
  const b = mpkBreakdown(features, s).all, T = mpkReportText(lang);
  const rows = Object.keys(MPK_STATUS).map(k =>
    [T.statusLabel[k], mpkFmt(b.byStatus[k].n), b.byStatus[k].pct.toFixed(1) + '%', mpkFmt(b.byStatus[k].m2)]);
  rows.push([T.total, mpkFmt(b.total), b.total ? '100%' : '0%', mpkFmt(b.m2)]);
  return rows;
}

if (typeof module !== 'undefined') module.exports = { mpkReportId, mpkReportDate, mpkReportSuspectRows, mpkReportSummaryRows, MPK_REPORT_TEXT };

// ---------- PDF ----------
const MPK_PDF = {
  W: 210, H: 297, M: 16,                       // A4 portrait, margin (mm)
  NAVY: [30, 44, 68], INK: [40, 48, 60], MUTED: [110, 120, 135], LINE: [205, 211, 219],
  SHADE: [238, 241, 245], RED: [198, 40, 40],
};

// Map snapshot of the selected area (PNG data URL + aspect), view restored afterwards
async function mpkReportMapImage(area) {
  const prev = { center: map.getCenter(), zoom: map.getZoom(), bearing: map.getBearing(), pitch: map.getPitch() };
  if (MPK.popup) MPK.popup.remove();
  map.jumpTo({ pitch: 0, bearing: 0 });
  map.fitBounds(MPK.bounds[area], { padding: 30, duration: 0 });
  await new Promise(resolve => { const t = setTimeout(resolve, 9000); map.once('idle', () => { clearTimeout(t); resolve(); }); });
  const url = await snapshotMapCanvas();
  const c = map.getCanvas();
  map.jumpTo(prev);
  return url ? { url, aspect: c.height / c.width } : null;
}

// Export PDF: first ask for the report language, then build it
function mpkExportReport(lang) {
  if (lang) { mpkCloseReportLang(); return mpkBuildReport(lang); }
  let last = 'en';
  try { last = localStorage.getItem('mpk_report_lang') || 'en'; } catch (e) { /* storage blocked */ }
  let el = document.getElementById('mpk-report-lang');
  if (!el) {
    el = document.createElement('div');
    el.id = 'mpk-report-lang';
    el.className = 'mpk-lang-overlay';
    el.addEventListener('click', e => { if (e.target === el) mpkCloseReportLang(); });
    document.body.appendChild(el);
  }
  const areaLabel = MPK.area === 'all' ? 'All marked areas' : MPK_AREAS[MPK.area].name;
  el.innerHTML = `<div class="mpk-lang-box" role="dialog" aria-modal="true" aria-labelledby="mpk-lang-title">
      <h3 id="mpk-lang-title">Export PDF report</h3>
      <p>${areaLabel} · choose the report language</p>
      <div class="mpk-lang-opts">
        <button class="mpk-lang-opt${last === 'en' ? ' last' : ''}" onclick="mpkExportReport('en')"><b>English</b><small>Report on buildings suspected…</small></button>
        <button class="mpk-lang-opt${last === 'ms' ? ' last' : ''}" onclick="mpkExportReport('ms')"><b>Bahasa Melayu</b><small>Laporan bangunan yang disyaki…</small></button>
      </div>
      <button class="mpk-wb-btn mpk-lang-cancel" onclick="mpkCloseReportLang()">Cancel</button>
    </div>`;
  el.hidden = false;
  el.querySelector('.mpk-lang-opt.last').focus();
  document.addEventListener('keydown', mpkReportLangKey);
}
function mpkReportLangKey(e) { if (e.key === 'Escape') mpkCloseReportLang(); }
function mpkCloseReportLang() {
  const el = document.getElementById('mpk-report-lang');
  if (el) el.hidden = true;
  document.removeEventListener('keydown', mpkReportLangKey);
}

async function mpkBuildReport(lang) {
  if (!window.jspdf) { showToast('⚠️ PDF library not loaded'); return; }
  try { localStorage.setItem('mpk_report_lang', lang); } catch (e) { /* storage blocked */ }
  showLoading('Preparing PDF report…', 'Map, statistics and building list');
  try {
    const T = mpkReportText(lang);
    const area = MPK.area, s = MPK.settings, feats = mpkAreaFeatures(), now = new Date();
    const id = mpkReportId(now);
    const areaName = area === 'all' ? T.allAreasLong : T.areas[area];
    const dateText = mpkReportDate(now, lang);
    const shot = await mpkReportMapImage(area);
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const P = MPK_PDF, CW = P.W - 2 * P.M;
    let y = 0;

    const watermark = () => {
      pdf.saveGraphicsState();
      pdf.setGState(new pdf.GState({ opacity: 0.07 }));
      pdf.setFont('helvetica', 'bold'); pdf.setFontSize(80); pdf.setTextColor(...P.NAVY);
      pdf.text(T.watermark, P.W / 2, P.H / 2 + 20, { align: 'center', angle: 35 });
      pdf.restoreGraphicsState();
    };
    const header = () => {
      watermark();
      pdf.setFillColor(...P.NAVY); pdf.rect(0, 0, P.W, 3, 'F');
      pdf.setFont('helvetica', 'bold'); pdf.setFontSize(12); pdf.setTextColor(...P.NAVY);
      pdf.text('MAJLIS PERBANDARAN KEMAMAN', P.M, 13);
      pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8.5); pdf.setTextColor(...P.MUTED);
      pdf.text(T.unit, P.M, 18);
      // draft stamp, top right
      pdf.setDrawColor(...P.RED); pdf.setTextColor(...P.RED); pdf.setLineWidth(0.5);
      pdf.roundedRect(P.W - P.M - 48, 8, 48, 11, 1.5, 1.5, 'S');
      pdf.setFont('helvetica', 'bold'); pdf.setFontSize(8.5);
      pdf.text(T.stamp, P.W - P.M - 24, 12.6, { align: 'center' });
      pdf.setFont('helvetica', 'normal'); pdf.setFontSize(6.5);
      pdf.text(T.stampSub, P.W - P.M - 24, 16.6, { align: 'center' });
      pdf.setDrawColor(...P.LINE); pdf.setLineWidth(0.3); pdf.line(P.M, 22, P.W - P.M, 22);
      y = 29;
    };
    const ensure = h => { if (y + h > P.H - 18) { pdf.addPage(); header(); } };
    const section = (num, title) => {
      ensure(14);
      pdf.setFont('helvetica', 'bold'); pdf.setFontSize(11); pdf.setTextColor(...P.NAVY);
      pdf.text(`${num}.  ${title.toUpperCase()}`, P.M, y);
      y += 6;
    };
    const para = (text, size = 9) => {
      pdf.setFont('helvetica', 'normal'); pdf.setFontSize(size); pdf.setTextColor(...P.INK);
      const lines = pdf.splitTextToSize(text, CW);
      ensure(lines.length * size * 0.42 + 2);
      pdf.text(lines, P.M, y);
      y += lines.length * size * 0.42 + 3;
    };
    // cols: [{ title, w (mm), align }]; long cells wrap; the header repeats on a new page
    const table = (cols, rows, opts = {}) => {
      const pad = 1.8, fs = opts.size || 8.5, lh = fs * 0.4;
      const head = () => {
        pdf.setFillColor(...P.NAVY); pdf.rect(P.M, y, CW, 7, 'F');
        pdf.setFont('helvetica', 'bold'); pdf.setFontSize(fs); pdf.setTextColor(255, 255, 255);
        let x = P.M;
        cols.forEach(c => {
          pdf.text(c.title, c.align === 'right' ? x + c.w - pad : x + pad, y + 4.7, { align: c.align === 'right' ? 'right' : 'left' });
          x += c.w;
        });
        y += 7;
      };
      ensure(16); head();
      rows.forEach((r, i) => {
        pdf.setFont('helvetica', opts.boldLast && i === rows.length - 1 ? 'bold' : 'normal'); pdf.setFontSize(fs);
        const cells = r.map((v, k) => pdf.splitTextToSize(String(v), cols[k].w - 2 * pad));
        const h = Math.max(...cells.map(c => c.length)) * lh + 2 * pad + 0.6;
        if (y + h > P.H - 18) { pdf.addPage(); header(); head(); pdf.setFont('helvetica', 'normal'); pdf.setFontSize(fs); }
        if (i % 2) { pdf.setFillColor(...P.SHADE); pdf.rect(P.M, y, CW, h, 'F'); }
        pdf.setTextColor(...P.INK);
        let x = P.M;
        cells.forEach((c, k) => {
          const col = cols[k];
          pdf.text(c, col.align === 'right' ? x + col.w - pad : x + pad, y + pad + lh * 0.8, { align: col.align === 'right' ? 'right' : 'left' });
          x += col.w;
        });
        pdf.setDrawColor(...P.LINE); pdf.setLineWidth(0.15); pdf.line(P.M, y + h, P.M + CW, y + h);
        y += h;
      });
      y += 5;
    };

    // ---- page 1: title and particulars ----
    header();
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(15); pdf.setTextColor(...P.NAVY);
    const title = pdf.splitTextToSize(T.title, CW);
    pdf.text(title, P.M, y + 2); y += title.length * 6.5 + 3;
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(10); pdf.setTextColor(...P.MUTED);
    pdf.text(area === 'all' ? T.allAreas : areaName, P.M, y); y += 8;

    table([{ title: T.particulars, w: 48 }, { title: '', w: CW - 48 }], [
      [T.reportId, `${id} (${T.systemGen})`],
      [T.dateGen, dateText],
      [T.studyArea, areaName],
      [T.scope, T.scopeText],
      [T.status, T.statusText],
      [T.preparedWith, 'Geospatial AI BuildVision (Uzma Group)'],
    ]);

    section(1, T.sec[0]);
    const b = mpkBreakdown(feats, s).all;
    para(T.summary(b, mpkFmt));
    table([{ title: T.status, w: 74 }, { title: T.buildings, w: 30, align: 'right' },
           { title: T.share, w: 30, align: 'right' }, { title: T.footprint, w: CW - 134, align: 'right' }],
          mpkReportSummaryRows(feats, s, lang), { boldLast: true });

    // ---- map ----
    if (shot) {
      const h = Math.min(CW * shot.aspect, 120);
      const w = h / shot.aspect;
      ensure(h + 22);                       // keep the heading with its map
      section(2, T.sec[1]);
      pdf.addImage(shot.url, 'PNG', P.M + (CW - w) / 2, y, w, h);
      pdf.setDrawColor(...P.LINE); pdf.rect(P.M + (CW - w) / 2, y, w, h, 'S');
      y += h + 4;
      pdf.setFont('helvetica', 'normal'); pdf.setFontSize(7.5); pdf.setTextColor(...P.MUTED);
      const key = pdf.splitTextToSize(T.mapKey, CW);
      pdf.text(key, P.M, y); y += key.length * 3.2 + 5;
    }

    // ---- breakdowns ----
    const all = mpkBreakdown(MPK.data.buildings.features, s);
    section(3, T.sec[2]);
    table([{ title: T.area, w: 56 }, { title: T.buildings, w: 22, align: 'right' }, { title: 'm²', w: 24, align: 'right' },
           { title: T.suspected, w: 24, align: 'right' }, { title: T.legal, w: 24, align: 'right' }, { title: T.unverified, w: CW - 150, align: 'right' }],
      [...Object.keys(MPK_AREAS).map(k => [T.areas[k], all[k]]), [T.allAreas, all.all]].map(([name, r]) =>
        [name, mpkFmt(r.total), mpkFmt(r.m2), `${mpkFmt(r.byStatus.suspected.n)} (${r.byStatus.suspected.pct.toFixed(0)}%)`,
         `${mpkFmt(r.byStatus.legal.n)} (${r.byStatus.legal.pct.toFixed(0)}%)`,
         `${mpkFmt(r.byStatus.unverified.n)} (${r.byStatus.unverified.pct.toFixed(0)}%)`]), { boldLast: true });

    section(4, T.sec[3]);
    table([{ title: T.sizeCol, w: 50 }, { title: T.buildings, w: 28, align: 'right' }, { title: T.suspected, w: 32, align: 'right' },
           { title: T.legal, w: 32, align: 'right' }, { title: T.unverified, w: CW - 142, align: 'right' }],
      b.sizes.map((c, i) => [T.sizes[i], mpkFmt(c.n), mpkFmt(c.byStatus.suspected), mpkFmt(c.byStatus.legal), mpkFmt(c.byStatus.unverified)]));

    // ---- suspected list ----
    const rows = mpkReportSuspectRows(feats, s, lang);
    section(5, `${T.sec[4]} (${mpkFmt(rows.length)})`);
    para(T.listNote, 8.5);
    table([{ title: T.no, w: 10, align: 'right' }, { title: 'Plus Code', w: 30 }, { title: T.area, w: 28 }, { title: 'Lot', w: 15 },
           { title: 'UPI', w: 30 }, { title: T.reason, w: CW - 131 }, { title: 'm²', w: 18, align: 'right' }],
      rows.length ? rows : [['—', '—', '—', '—', '—', T.none, '—']], { size: 7.5 });

    // ---- notes ----
    section(6, T.sec[5]);
    T.notes(s.rizab).forEach((t, i) => para(`${i + 1})  ${t}`, 8.5));

    // ---- verification blocks ----
    section(7, T.sec[6]);
    ensure(48);
    const bw = (CW - 8) / 3;
    T.signers.forEach((t, i) => {
      const x = P.M + i * (bw + 4);
      pdf.setDrawColor(...P.LINE); pdf.setLineWidth(0.3); pdf.rect(x, y, bw, 42, 'S');
      pdf.setFont('helvetica', 'bold'); pdf.setFontSize(8.5); pdf.setTextColor(...P.NAVY);
      pdf.text(t, x + 3, y + 5.5);
      pdf.setFont('helvetica', 'normal'); pdf.setFontSize(7.5); pdf.setTextColor(...P.MUTED);
      T.signLines.forEach((l, k) => {
        const ly = y + 15 + k * 7.5;
        pdf.text(l, x + 3, ly);
        pdf.setDrawColor(...P.LINE); pdf.line(x + 22, ly + 0.5, x + bw - 3, ly + 0.5);
      });
    });
    y += 46;

    // ---- footer on every page ----
    const pages = pdf.getNumberOfPages();
    for (let i = 1; i <= pages; i++) {
      pdf.setPage(i);
      pdf.setDrawColor(...P.LINE); pdf.setLineWidth(0.3); pdf.line(P.M, P.H - 13, P.W - P.M, P.H - 13);
      pdf.setFont('helvetica', 'normal'); pdf.setFontSize(7); pdf.setTextColor(...P.MUTED);
      pdf.text(T.footer(id, dateText), P.M, P.H - 8.5);
      pdf.text(T.page(i, pages), P.W - P.M, P.H - 8.5, { align: 'right' });
    }

    pdf.save(`MPK_Kemaman_${T.file}_${MPK_CSV_AREA[area] || 'all_areas'}_${id}-${String(now.getSeconds()).padStart(2, '0')}.pdf`);
    showToast('📄 PDF report saved · ' + id);
    addActivityLog('MPK PDF report', `${id} · ${lang === 'ms' ? 'BM' : 'EN'} · ${area === 'all' ? 'All areas' : MPK_AREAS[area].short}`);
  } catch (err) {
    showToast('⚠️ Could not create the PDF: ' + err.message, 5000);
  } finally {
    hideLoading();
  }
}
