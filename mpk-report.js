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

// Why a building is flagged, in plain words
function mpkReportReason(p, s) {
  const j = mpkJenis(p, s);
  if (j === 'mockup') return 'On MPK suspect list';
  if (j === 'rizab') return `Within ${p.jarak_jalan_m} m of road centreline (reserve ${s.rizab} m)`;
  return '';
}

// Table rows of the suspected buildings, largest first
function mpkReportSuspectRows(features, s) {
  return features.filter(f => mpkJenis(f.properties, s))
    .sort((a, b) => b.properties.area_m2 - a.properties.area_m2)
    .map((f, i) => {
      const p = f.properties;
      return [String(i + 1), p.plus_code, MPK_AREAS[p.kawasan].short, p.lot || '—', p.upi || '—',
        mpkReportReason(p, s), mpkFmt(p.area_m2)];
    });
}

// Summary rows: one per status plus the total
function mpkReportSummaryRows(features, s) {
  const b = mpkBreakdown(features, s).all;
  const rows = Object.entries(MPK_STATUS).map(([k, st]) =>
    [st.label, mpkFmt(b.byStatus[k].n), b.byStatus[k].pct.toFixed(1) + '%', mpkFmt(b.byStatus[k].m2)]);
  rows.push(['Total', mpkFmt(b.total), b.total ? '100%' : '0%', mpkFmt(b.m2)]);
  return rows;
}

if (typeof module !== 'undefined') module.exports = { mpkReportId, mpkReportSuspectRows, mpkReportSummaryRows };

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

async function mpkExportReport() {
  if (!window.jspdf) { showToast('⚠️ PDF library not loaded'); return; }
  showLoading('Preparing PDF report…', 'Map, statistics and building list');
  try {
    const area = MPK.area, s = MPK.settings, feats = mpkAreaFeatures(), now = new Date();
    const id = mpkReportId(now);
    const areaName = area === 'all' ? 'All marked areas (Teluk Kalong Industrial Area and two road corridors)' : MPK_AREAS[area].name;
    const dateText = now.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    const shot = await mpkReportMapImage(area);
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const P = MPK_PDF, CW = P.W - 2 * P.M;
    let y = 0;

    const watermark = () => {
      pdf.saveGraphicsState();
      pdf.setGState(new pdf.GState({ opacity: 0.07 }));
      pdf.setFont('helvetica', 'bold'); pdf.setFontSize(80); pdf.setTextColor(...P.NAVY);
      pdf.text('DRAFT', P.W / 2, P.H / 2 + 20, { align: 'center', angle: 35 });
      pdf.restoreGraphicsState();
    };
    const header = () => {
      watermark();
      pdf.setFillColor(...P.NAVY); pdf.rect(0, 0, P.W, 3, 'F');
      pdf.setFont('helvetica', 'bold'); pdf.setFontSize(12); pdf.setTextColor(...P.NAVY);
      pdf.text('MAJLIS PERBANDARAN KEMAMAN', P.M, 13);
      pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8.5); pdf.setTextColor(...P.MUTED);
      pdf.text('Town Planning · Illegal Construction Monitoring', P.M, 18);
      // draft stamp, top right
      pdf.setDrawColor(...P.RED); pdf.setTextColor(...P.RED); pdf.setLineWidth(0.5);
      pdf.roundedRect(P.W - P.M - 44, 8, 44, 11, 1.5, 1.5, 'S');
      pdf.setFont('helvetica', 'bold'); pdf.setFontSize(8.5);
      pdf.text('DRAFT · FOR REVIEW', P.W - P.M - 22, 12.6, { align: 'center' });
      pdf.setFont('helvetica', 'normal'); pdf.setFontSize(6.5);
      pdf.text('Not an official decision', P.W - P.M - 22, 16.6, { align: 'center' });
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
    const title = pdf.splitTextToSize('REPORT ON BUILDINGS SUSPECTED OF LACKING PLANNING PERMISSION', CW);
    pdf.text(title, P.M, y + 2); y += title.length * 6.5 + 3;
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(10); pdf.setTextColor(...P.MUTED);
    pdf.text(areaName.length > 90 ? 'All marked areas' : areaName, P.M, y); y += 8;

    table([{ title: 'Particulars', w: 48 }, { title: '', w: CW - 48 }], [
      ['Report ID', `${id} (system generated)`],
      ['Date generated', dateText],
      ['Study area', areaName],
      ['Scope', 'Teluk Kalong: buildings inside the PBT planning boundary. Corridors: buildings within 50 m of the road centreline.'],
      ['Status', 'Draft for review by MPK. Findings require site verification before any action.'],
      ['Prepared with', 'Geospatial AI BuildVision (Uzma Group)'],
    ]);

    section(1, 'Summary');
    const b = mpkBreakdown(feats, s).all;
    para(`${mpkFmt(b.total)} buildings with a total footprint of ${mpkFmt(b.m2)} m² were assessed. `
      + `${b.byStatus.legal.pct.toFixed(1)}% stand on an MPK-approved lot (legal), `
      + `${b.byStatus.suspected.pct.toFixed(1)}% (${mpkFmt(b.byStatus.suspected.n)} buildings, ${mpkFmt(b.byStatus.suspected.m2)} m²) `
      + `are suspected of lacking planning permission, and ${b.byStatus.unverified.pct.toFixed(1)}% could not be verified `
      + 'against an approval record.');
    table([{ title: 'Status', w: 74 }, { title: 'Buildings', w: 30, align: 'right' },
           { title: 'Share', w: 30, align: 'right' }, { title: 'Footprint (m²)', w: CW - 134, align: 'right' }],
          mpkReportSummaryRows(feats, s), { boldLast: true });

    // ---- map ----
    if (shot) {
      const h = Math.min(CW * shot.aspect, 120);
      const w = h / shot.aspect;
      ensure(h + 22);                       // keep the heading with its map
      section(2, 'Location map');
      pdf.addImage(shot.url, 'PNG', P.M + (CW - w) / 2, y, w, h);
      pdf.setDrawColor(...P.LINE); pdf.rect(P.M + (CW - w) / 2, y, w, h, 'S');
      y += h + 4;
      pdf.setFont('helvetica', 'normal'); pdf.setFontSize(7.5); pdf.setTextColor(...P.MUTED);
      pdf.text('Red: suspected illegal · Teal: legal (on approved lot) · Grey: not verified · Dashed orange: planning boundary',
        P.M, y); y += 8;
    }

    // ---- breakdowns ----
    const all = mpkBreakdown(MPK.data.buildings.features, s);
    section(3, 'Breakdown by area');
    table([{ title: 'Area', w: 64 }, { title: 'Buildings', w: 22, align: 'right' }, { title: 'm²', w: 26, align: 'right' },
           { title: 'Suspected', w: 24, align: 'right' }, { title: 'Legal', w: 22, align: 'right' }, { title: 'Not verified', w: CW - 158, align: 'right' }],
      [...Object.entries(MPK_AREAS).map(([k, a]) => [a.name, all[k]]), ['All marked areas', all.all]].map(([name, r]) =>
        [name, mpkFmt(r.total), mpkFmt(r.m2), `${mpkFmt(r.byStatus.suspected.n)} (${r.byStatus.suspected.pct.toFixed(0)}%)`,
         `${mpkFmt(r.byStatus.legal.n)} (${r.byStatus.legal.pct.toFixed(0)}%)`,
         `${mpkFmt(r.byStatus.unverified.n)} (${r.byStatus.unverified.pct.toFixed(0)}%)`]), { boldLast: true });

    section(4, 'Building size');
    table([{ title: 'Footprint size', w: 50 }, { title: 'Buildings', w: 28, align: 'right' }, { title: 'Suspected', w: 32, align: 'right' },
           { title: 'Legal', w: 32, align: 'right' }, { title: 'Not verified', w: CW - 142, align: 'right' }],
      b.sizes.map(c => [c.label, mpkFmt(c.n), mpkFmt(c.byStatus.suspected), mpkFmt(c.byStatus.legal), mpkFmt(c.byStatus.unverified)]));

    // ---- suspected list ----
    const rows = mpkReportSuspectRows(feats, s);
    section(5, `Suspected buildings (${mpkFmt(rows.length)})`);
    para('Listed largest first. Locations can be found with the Plus Code (e.g. in Google Maps) or the cadastral lot / UPI.', 8.5);
    table([{ title: 'No.', w: 10, align: 'right' }, { title: 'Plus Code', w: 30 }, { title: 'Area', w: 28 }, { title: 'Lot', w: 15 },
           { title: 'UPI', w: 30 }, { title: 'Reason', w: CW - 131 }, { title: 'm²', w: 18, align: 'right' }],
      rows.length ? rows : [['—', '—', '—', '—', '—', 'No suspected buildings in this area', '—']], { size: 7.5 });

    // ---- notes ----
    section(6, 'Notes and limitations');
    [
      'Building footprints: Google Open Buildings (AI-detected). Teluk Kalong suspected buildings: the list in the Uzma/MPK building data (is_mockup).',
      'Planning boundary and approved lots digitised from MPK’s map; cadastral lots from NDCDB; road centrelines from OpenStreetMap.',
      `Corridor buildings are flagged when any part lies within ${s.rizab} m of the road centreline (assumed road reserve).`,
      '"Legal" means the building stands on an MPK-approved lot; it does not confirm Kebenaran Merancang or building plan approval.',
      'This draft is produced automatically for planning review. Every case requires site verification before enforcement.',
    ].forEach((t, i) => para(`${i + 1})  ${t}`, 8.5));

    // ---- verification blocks ----
    section(7, 'Verification');
    ensure(48);
    const bw = (CW - 8) / 3;
    ['Prepared by', 'Checked by', 'Approved by'].forEach((t, i) => {
      const x = P.M + i * (bw + 4);
      pdf.setDrawColor(...P.LINE); pdf.setLineWidth(0.3); pdf.rect(x, y, bw, 42, 'S');
      pdf.setFont('helvetica', 'bold'); pdf.setFontSize(8.5); pdf.setTextColor(...P.NAVY);
      pdf.text(t, x + 3, y + 5.5);
      pdf.setFont('helvetica', 'normal'); pdf.setFontSize(7.5); pdf.setTextColor(...P.MUTED);
      ['Signature', 'Name', 'Designation', 'Date'].forEach((l, k) => {
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
      pdf.text(`Report ${id} · Generated ${dateText} by Geospatial AI BuildVision · System-generated draft for MPK review`, P.M, P.H - 8.5);
      pdf.text(`Page ${i} of ${pages}`, P.W - P.M, P.H - 8.5, { align: 'right' });
    }

    pdf.save(`MPK_Kemaman_Report_${MPK_CSV_AREA[area] || 'all_areas'}_${id}-${String(now.getSeconds()).padStart(2, '0')}.pdf`);
    showToast('📄 PDF report saved · ' + id);
    addActivityLog('MPK PDF report', `${id} · ${area === 'all' ? 'All areas' : MPK_AREAS[area].short}`);
  } catch (err) {
    showToast('⚠️ Could not create the PDF: ' + err.message, 5000);
  } finally {
    hideLoading();
  }
}
