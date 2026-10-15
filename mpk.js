// ============================================================
// MPK KEMAMAN — SUSPECTED ILLEGAL CONSTRUCTION MODE
// Two study areas from MPK (footprints digitised by hand from Esri imagery of 24 Sep 2026):
//   tk   Teluk Kalong Industrial Area — buildings inside the PBT boundary, legal when an
//        MPK-approved building plan covers them
//   bbc  Koridor Binjai – Bandar Chukai — buildings within the road-reserve distance of the
//        road centreline
// Data: mpk/*.geojson, built by tools/build_mpk_illegal.py, tools/build_mpk_manual.py and
// tools/apply_pelan_lulus.py
// ============================================================

// ---------- Pure logic (also exported for tools/test_mpk_logic.js) ----------
// Suspect type of one building under the current settings {rizab}, or null.
// Teluk Kalong: the buildings flagged is_mockup in the Uzma/MPK building API (kategori
// 'mockup'). Corridors: buildings within the road-reserve distance of the centreline.
function mpkJenis(p, s) {
  if (p.kategori === 'mockup') return 'mockup';
  if (p.kategori === 'tolak') return 'tolak';            // only a rejected building plan covers it
  if (p.kategori === 'manual_haram') return 'manual';    // marked illegal by an officer (mpk-edit.js)
  if (p.kategori === 'koridor' && p.jarak_jalan_m != null && p.jarak_jalan_m <= s.rizab) return 'rizab';
  return null;
}

// One of three statuses per building, so legal and illegal are easy to tell apart:
//   suspected  — on the suspect list / encroaching the road reserve (mpkJenis)
//   legal      — an MPK-approved building plan covers it (Teluk Kalong, tools/apply_pelan_lulus.py)
//   unverified — no approval record to confirm either way
function mpkStatus(p, s) {
  if (mpkJenis(p, s)) return 'suspected';
  return p.kategori === 'lulus' ? 'legal' : 'unverified';
}

// The marked areas the dashboard reports on: Teluk Kalong buildings inside the planning
// boundary, and buildings within the Binjai – Bandar Chukai road corridor
function mpkInScope(p) {
  return (p.kawasan === 'tk' && p.dalam === true) || p.kawasan === 'bbc';
}

// Building size classes (footprint m²)
const MPK_SIZE_CLASSES = [
  { max: 100, label: 'Under 100 m²' },
  { max: 500, label: '100 – 500 m²' },
  { max: 1000, label: '500 – 1,000 m²' },
  { max: 5000, label: '1,000 – 5,000 m²' },
  { max: Infinity, label: '5,000 m² and over' },
];
function mpkSizeClass(m2) {
  return MPK_SIZE_CLASSES.findIndex(c => m2 < c.max);
}

// Counts, m² and share per status, per area and overall, plus the size distribution
function mpkBreakdown(features, s) {
  const empty = () => ({ total: 0, m2: 0,
    byStatus: { suspected: { n: 0, m2: 0, pct: 0 }, legal: { n: 0, m2: 0, pct: 0 }, unverified: { n: 0, m2: 0, pct: 0 } },
    sizes: MPK_SIZE_CLASSES.map(c => ({ label: c.label, n: 0, byStatus: { suspected: 0, legal: 0, unverified: 0 } })) });
  const out = { all: empty(), ...Object.fromEntries(Object.keys(MPK_AREAS).map(k => [k, empty()])) };
  for (const f of features) {
    const p = f.properties, st = mpkStatus(p, s), cls = mpkSizeClass(p.area_m2);
    for (const key of ['all', p.kawasan]) {
      const b = out[key];
      if (!b) continue;
      b.total++; b.m2 += p.area_m2;
      b.byStatus[st].n++; b.byStatus[st].m2 += p.area_m2;
      b.sizes[cls].n++; b.sizes[cls].byStatus[st]++;
    }
  }
  for (const b of Object.values(out)) {
    for (const v of Object.values(b.byStatus)) v.pct = b.total ? v.n * 100 / b.total : 0;
  }
  return out;
}

// MapLibre filter equivalent of mpkJenis(...) !== null
function mpkSuspectFilter(s) {
  return ['any',
    ['==', ['get', 'kategori'], 'mockup'],
    ['==', ['get', 'kategori'], 'tolak'],
    ['==', ['get', 'kategori'], 'manual_haram'],
    ['all', ['==', ['get', 'kategori'], 'koridor'],
      ['<=', ['to-number', ['coalesce', ['get', 'jarak_jalan_m'], 1e9]], s.rizab]],
  ];
}

function mpkStats(features, s, rates, kawasan) {
  const feats = kawasan === 'all' ? features : features.filter(f => f.properties.kawasan === kawasan);
  const byJenis = { mockup: 0, rizab: 0, tolak: 0, manual: 0 };
  const byStatus = { suspected: 0, legal: 0, unverified: 0 };
  const suspects = [];
  let lulus = 0;
  for (const f of feats) {
    if (f.properties.kategori === 'lulus') lulus++;
    byStatus[mpkStatus(f.properties, s)]++;
    const j = mpkJenis(f.properties, s);
    if (j) { byJenis[j]++; suspects.push(f); }
  }
  suspects.sort((a, b) => b.properties.area_m2 - a.properties.area_m2);
  const area = suspects.reduce((sum, f) => sum + f.properties.area_m2, 0);
  return { total: feats.length, lulus, count: suspects.length, area, byJenis, byStatus,
           fee: area * rates.fee, cukai: area * rates.cukai, suspects };
}

// Every building with its status and size, largest first
const MPK_CSV_STATUS = { suspected: 'suspected_illegal', legal: 'legal_approved_lot', unverified: 'not_verified' };
function mpkCSVAll(features, s) {
  const rows = [...features].sort((a, b) => b.properties.area_m2 - a.properties.area_m2).map(f => {
    const p = f.properties;
    return [p.id, MPK_CSV_AREA[p.kawasan], MPK_CSV_STATUS[mpkStatus(p, s)], p.plus_code, p.lng, p.lat, p.area_m2,
      p.lot || '', p.upi || ''].join(',');
  });
  return ['id,area,status,plus_code,lng,lat,area_m2,lot,upi', ...rows].join('\n') + '\n';
}

// English codes written to the CSV export
const MPK_CSV_AREA = { tk: 'teluk_kalong', bbc: 'binjai_bandar_chukai' };
const MPK_CSV_TYPE = { mockup: 'suspected_list', rizab: 'road_reserve', tolak: 'plan_rejected' };

function mpkCSV(suspects, rates, s) {
  const header = 'id,area,type,plus_code,lng,lat,distance_m,area_m2,confidence,lot,upi,est_processing_fee_rm,est_annual_assessment_tax_rm';
  const rows = suspects.map(f => {
    const p = f.properties, jenis = mpkJenis(p, s);
    const jarak = jenis === 'rizab' ? p.jarak_jalan_m : '';
    return [p.id, MPK_CSV_AREA[p.kawasan], MPK_CSV_TYPE[jenis], p.plus_code, p.lng, p.lat, jarak, p.area_m2, p.confidence, p.lot || '', p.upi || '',
      (p.area_m2 * rates.fee).toFixed(2), (p.area_m2 * rates.cukai).toFixed(2)].join(',');
  });
  return [header, ...rows].join('\n') + '\n';
}

// ---------- Esri World Imagery Wayback helpers ----------
const MPK_MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// '2024-08-30' or '2024-08' -> 'Aug 2024'
function mpkMonthLabel(d) {
  const [y, m] = d.split('-');
  return MPK_MONTH_NAMES[+m - 1] + ' ' + y;
}

function mpkWaybackTileUrl(release) {
  return 'https://wayback.maptiles.arcgis.com/arcgis/rest/services/World_Imagery/WMTS/1.0.0/default028mm/MapServer/tile/'
    + release + '/{z}/{y}/{x}';
}

// '2024-10-21' -> '21 Oct 2024'
function mpkDayLabel(d) {
  const [y, m, day] = d.split('-');
  return +day + ' ' + MPK_MONTH_NAMES[+m - 1] + ' ' + y;
}

// Sentinel-2 L2A true-colour tiles rendered by Microsoft Planetary Computer
function mpkSentinelTileUrl(item) {
  return 'https://planetarycomputer.microsoft.com/api/data/v1/item/tiles/WebMercatorQuad/{z}/{x}/{y}@1x'
    + '?collection=sentinel-2-l2a&item=' + item + '&assets=visual&asset_bidx=visual%7C1%2C2%2C3&nodata=0&format=png';
}

// Month to open a year on: the latest clear month (<= 20% cloud), else the least cloudy one
function mpkDefaultMonth(months) {
  for (let j = months.length - 1; j >= 0; j--) if (months[j] && months[j].cloud <= 20) return j;
  let best = 0;
  months.forEach((e, j) => { if (e && (!months[best] || e.cloud < months[best].cloud)) best = j; });
  return best;
}

// Years that have monthly images for one area, newest first
function mpkSentinelYears(areaYears) {
  return Object.keys(areaYears || {}).sort().reverse();
}

// Each satellite is shown on its own, never mixed. Landsat 7 images after its scan-line
// corrector failed (31 May 2003) have empty stripes, so in "by year" they only win a year
// when every other scene is this many cloud points worse (same rule as tools/build_landsat.py).
const MPK_SLC_OFF_PENALTY = 20;

// By year within one satellite: the clearest month of each year, oldest year first.
// years = { '2024': [12 month entries or null], ... } from sentinel.json / landsat.json
function mpkYearBest(years, source) {
  const score = e => e.cloud + (e.platform === 'landsat-7' && e.date >= '2003-05-31' ? MPK_SLC_OFF_PENALTY : 0);
  return Object.keys(years || {}).sort().map(year => {
    const best = years[year].filter(Boolean).reduce((a, e) => (!a || score(e) < score(a) ? e : a), null);
    return best ? { year, source, ...best } : { year, source: null };
  });
}

// Esri high-res images over one area: one per distinct capture date, oldest first, using the
// first release that showed it (a later release can fall back to an older image)
function mpkEsriImages(history, area) {
  const byCapture = new Map();
  for (const e of history || []) if (!byCapture.has(e.capture[area])) byCapture.set(e.capture[area], e);
  return [...byCapture.entries()].sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, e]) => ({ source: 'esri', release: e.release, date, metadata: e.metadata }));
}

// Raster source for one imagery entry (Esri, Sentinel-2 or Landsat), or null when none.
// maxView caps the map zoom while the image is shown (null = no cap). All satellites zoom
// as deep as Esri; past ~z14 (Sentinel-2) / ~z12 (Landsat) their pixels are just enlarged.
// kind changes the source settings (max zoom, credit), so it must be rebuilt per kind.
function mpkImagerySource(entry) {
  if (!entry || !entry.source) return null;
  if (entry.source === 'esri') {
    return { kind: 'esri', tiles: [mpkWaybackTileUrl(entry.release)], maxzoom: 19, maxView: null,
             attribution: 'Esri World Imagery Wayback' };
  }
  if (entry.source === 's2') {
    return { kind: 's2', tiles: [mpkSentinelTileUrl(entry.item)], maxzoom: 16, maxView: null,
             attribution: 'Sentinel-2 (Copernicus) via Microsoft Planetary Computer' };
  }
  return { kind: 'landsat', maxzoom: 15, maxView: null, attribution: 'Landsat (USGS/NASA) via Microsoft Planetary Computer',
           tiles: ['https://planetarycomputer.microsoft.com/api/data/v1/item/tiles/WebMercatorQuad/{z}/{x}/{y}@1x'
             + '?collection=landsat-c2-l2&item=' + entry.item + '&assets=red&assets=green&assets=blue&nodata=0&format=png'
             + '&color_formula=gamma%20RGB%202.7%2C%20saturation%201.5%2C%20sigmoidal%20RGB%2015%200.55'] };
}

// Land-use zone (mpk/landuse.geojson feature) under a point: the smallest containing zone,
// so a park inside a housing estate wins; the district outline is not a zone. null if none.
function mpkZoneAt(lng, lat, features) {
  const inRing = ring => {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i], [xj, yj] = ring[j];
      if ((yi > lat) !== (yj > lat) && lng < (xj - xi) * (lat - yi) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  };
  const area = ring => Math.abs(ring.reduce((a, p, i) => { const q = ring[(i + 1) % ring.length]; return a + p[0] * q[1] - q[0] * p[1]; }, 0)) / 2;
  let best = null, bestArea = Infinity;
  for (const f of features) {
    if (f.properties.zone === 'district') continue;
    const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
    for (const rings of polys) {
      if (inRing(rings[0]) && !rings.slice(1).some(inRing) && area(rings[0]) < bestArea) {
        best = f; bestArea = area(rings[0]);
      }
    }
  }
  return best;
}

// A coordinate typed in the search box -> { lat, lng }, or null. Accepts decimal degrees
// ("4.2681, 103.452", either order, any of , ; or space between) and degrees-minutes(-seconds)
// with hemisphere letters ("4°16'05"N 103°27'07"E", "4 16 05 N 103 27 07 E", "N4°16.08' E103°27.12'").
function mpkParseCoords(text) {
  const q = text.trim().toUpperCase().replace(/[′’‘`]/g, "'").replace(/[″“”]|''/g, '"');
  const inRange = (lat, lng) => Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
  // decimal pair
  let m = q.match(/^([-+]?\d+(?:\.\d+)?)\s*[,;\s]\s*([-+]?\d+(?:\.\d+)?)$/);
  if (m) {
    let a = +m[1], b = +m[2];
    if (!m[1].includes('.') && !m[2].includes('.')) return null;      // "1328 20": not a coordinate
    if (Math.abs(a) > 90 && Math.abs(b) <= 90) [a, b] = [b, a];       // typed as lng, lat
    return inRange(a, b) ? { lat: a, lng: b } : null;
  }
  // two DMS / DM parts, each with a hemisphere letter before ("N4°16'") or after ("4°16'N")
  const num = String.raw`(\d+(?:\.\d+)?)\s*(?:°|D|\s)\s*(?:(\d+(?:\.\d+)?)\s*(?:'|M|\s)\s*)?(?:(\d+(?:\.\d+)?)\s*(?:"|S(?![A-Z])|\s)?\s*)?`;
  const forms = { pre: String.raw`([NSEW])\s*` + num, post: num + String.raw`([NSEW])` };
  const read = (hemi, d, mi, se) => {
    if (mi != null && +mi >= 60 || se != null && +se >= 60) return null;
    const v = +d + (mi ? +mi / 60 : 0) + (se ? +se / 3600 : 0);
    return { hemi, v: hemi === 'S' || hemi === 'W' ? -v : v };
  };
  const part = (form, g) => (form === 'pre' ? read(g[0], g[1], g[2], g[3]) : read(g[3], g[0], g[1], g[2]));
  for (const f1 of ['pre', 'post']) {
    for (const f2 of ['pre', 'post']) {
      m = q.match(new RegExp(String.raw`^${forms[f1]}\s*[,;]?\s*${forms[f2]}$`));
      if (!m) continue;
      const x = part(f1, m.slice(1, 5)), y = part(f2, m.slice(5, 9));
      if (!x || !y) continue;
      const lat = 'NS'.includes(x.hemi) ? x : y, lng = 'EW'.includes(x.hemi) ? x : y;
      if (lat === lng || !'NS'.includes(lat.hemi) || !'EW'.includes(lng.hemi)) continue;
      return inRange(lat.v, lng.v) ? { lat: lat.v, lng: lng.v } : null;
    }
  }
  return null;
}

// Search MPK's own data: study areas by name, cadastral lots by lot no. / UPI prefix,
// buildings by Plus Code (the "+" may be left out). At most `limit` results per kind.
function mpkSearchLocal(query, areas, lots, buildings, limit = 6) {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const out = [];
  for (const [key, a] of Object.entries(areas)) {
    if (a.name.toLowerCase().includes(q) || a.short.toLowerCase().includes(q)) {
      out.push({ kind: 'area', label: a.short, sub: a.name, key });
    }
  }
  if (/^\d+$/.test(q)) {
    out.push(...lots.filter(f => f.properties.lot.startsWith(q) || f.properties.upi.startsWith(q)).slice(0, limit)
      .map(f => ({ kind: 'lot', label: 'Lot ' + f.properties.lot, sub: 'UPI ' + f.properties.upi, feature: f })));
  }
  const code = q.replace('+', '').toUpperCase();
  if (code.length >= 3) {
    out.push(...buildings.filter(f => f.properties.plus_code.replace('+', '').includes(code)).slice(0, limit)
      .map(f => ({ kind: 'building', label: f.properties.plus_code, sub: 'Building footprint', id: f.properties.id })));
  }
  return out;
}

// Search every detail (attribute) of a set of features. groups: [{ kind, features, labels: {key: label},
// skip: [keys], extra: p => [[label, value], ...] }]. Every word typed must be found in some detail of the
// feature; a number matches from its start. Best first (a whole detail, then its start, then anywhere),
// at most `limit` per group, with how many matched in all and the detail that matched.
function mpkSearchAttrs(query, groups, limit = 8) {
  const words = query.trim().toLowerCase().split(/\s+/).filter(w => w.length >= 2);
  if (!words.length) return [];
  const out = [];
  for (const g of groups) {
    const hits = [];
    for (const f of g.features || []) {
      const p = f.properties, skip = g.skip || [];
      const fields = Object.entries(p).filter(([k, v]) => v != null && v !== '' && !skip.includes(k))
        .map(([k, v]) => [g.labels[k] || k, v]).concat(g.extra ? g.extra(p) : []);
      let score = 0, best = null;
      const ok = words.every(w => {
        let top = 0, at = null;
        for (const [label, v] of fields) {
          const t = String(v).toLowerCase(), num = typeof v === 'number';
          const s = t === w ? 3 : t.startsWith(w) ? 2 : !num && t.includes(w) ? 1 : 0;
          if (s > top) { top = s; at = [label, String(v)]; if (s === 3) break; }
        }
        if (!top) return false;
        score += top;
        if (!best || w.length > best.w.length) best = { w, label: at[0], value: at[1] };
        return true;
      });
      if (ok) hits.push({ f, score, best });
    }
    hits.sort((a, b) => b.score - a.score);
    hits.slice(0, limit).forEach((h, i) => out.push({ kind: g.kind, feature: h.f, field: h.best.label, value: h.best.value,
      word: h.best.w, total: i === 0 ? hits.length : undefined }));
  }
  return out;
}

if (typeof module !== 'undefined') {
  module.exports = { mpkInScope, mpkSizeClass, MPK_SIZE_CLASSES, mpkBreakdown, mpkCSVAll, mpkStatus, mpkZoneAt, mpkParseCoords, mpkSearchLocal, mpkSearchAttrs, mpkJenis, mpkSuspectFilter, mpkStats, mpkCSV, mpkMonthLabel, mpkWaybackTileUrl,
                     mpkDayLabel, mpkSentinelTileUrl, mpkSentinelYears, mpkDefaultMonth, mpkImagerySource,
                     mpkYearBest, mpkEsriImages };
}

// ---------- Browser mode ----------
const MPK_AREAS = {
  tk:  { name: 'Teluk Kalong Industrial Area', short: 'Teluk Kalong' },
  bbc: { name: 'Binjai – Bandar Chukai Corridor', short: 'Binjai – Chukai' },
};
// Every suspected building is drawn in one red so "red = suspected" reads at a glance;
// the type is given in the popup, the list and the CSV.
const MPK_SUSPECT_COLOR = '#FF1744';   // bright red; outline #B2102F
// Bright fills with a darker outline of the same hue, readable on the road map and on imagery
const MPK_OUTLINE = { suspected: '#B2102F', legal: '#00873A', unverified: '#0039CB', others: '#C56200' };
const MPK_STATUS = {
  suspected:  { label: 'Illegal buildings', color: MPK_SUSPECT_COLOR,
                hint: 'On the MPK suspect list (Teluk Kalong) or encroaching the road reserve (corridors)' },
  legal:      { label: 'Approved buildings', color: '#00C853',
                hint: 'Covered by a building plan approved by MPK (Teluk Kalong, Pelan Bangunan Lulus)' },
  unverified: { label: 'Pending buildings', color: '#2962FF',
                hint: 'No approval record to confirm either way' },
};
const MPK_JENIS = {
  mockup:        { label: 'Suspected building (Teluk Kalong list)', color: MPK_SUSPECT_COLOR, areas: ['tk'] },
  rizab:         { label: 'Encroaching road reserve', color: MPK_SUSPECT_COLOR, areas: ['bbc'] },
  tolak:         { label: 'Building plan rejected by MPK (TOLAK)', color: MPK_SUSPECT_COLOR, areas: ['tk', 'bbc'] },
  manual:        { label: 'Marked illegal by an MPK officer', color: MPK_SUSPECT_COLOR, areas: ['tk', 'bbc'] },
};

// Land-use classes of mpk/landuse.geojson (OpenStreetMap, grouped by tools/build_landuse.py)
const MPK_ZONES = {
  industrial:    { label: 'Industrial', color: '#8E63CE' },
  residential:   { label: 'Residential', color: '#F2C744' },
  commercial:    { label: 'Commercial', color: '#E58A3A' },
  institutional: { label: 'Institutional', color: '#4A90D9' },
  recreation:    { label: 'Recreation / open space', color: '#7BC67B' },
  agriculture:   { label: 'Agriculture', color: '#B9D46A' },
  forest:        { label: 'Forest', color: '#2E7D32' },
  water:         { label: 'Water body', color: '#4FC3F7' },
  development:   { label: 'Under development', color: '#A1887F' },
};

// Map layers the viewer can switch on/off from the panel, in display order (land use first).
const MPK_LAYER_GROUPS = {
  landuse:   { label: 'Land use · Kemaman (OSM)', swatchClass: 'landuse',
               layers: ['mpk-landuse-fill', 'mpk-landuse-line', 'mpk-district-line'],
               legend: [...Object.entries(MPK_ZONES).map(([k, z]) => [z.label, z.color, k]), ['District boundary', '.district', 'district']] },
  suspect:   { label: MPK_STATUS.suspected.label, swatch: [MPK_STATUS.suspected.color],
               layers: ['mpk-suspect-fill', 'mpk-suspect-line', 'mpk-suspect-extrude', 'mpk-highlight-line'],
               legend: [] },
  legal:     { label: MPK_STATUS.legal.label, swatch: [MPK_STATUS.legal.color],
               layers: ['mpk-legal-fill', 'mpk-legal-line'], legend: [] },
  sizes:     { label: 'Building size labels', swatch: [], layers: ['mpk-size-label'], legend: [] },
  unverified: { label: MPK_STATUS.unverified.label, swatch: [MPK_STATUS.unverified.color],
               layers: ['mpk-unverified-fill'], legend: [] },
  others:    { label: 'Outside · near Teluk Kalong', swatch: ['#FF9100'],
               layers: ['mpk-other-fill', 'mpk-other-line'], legend: [] },
  othersBbc: { label: 'Outside · near Binjai – Chukai', swatch: ['#AB47BC'],
               layers: ['mpk-other-bbc-fill', 'mpk-other-bbc-line'], legend: [] },
  pelan:     { label: 'Approved building plans · MPK', swatchClass: 'pelan',
               layers: ['mpk-pelan-fill', 'mpk-pelan-line'],
               legend: [['Approved plan covering a building', '.pelan', 'covers'], ['Approved, no building found', '.pelan-none', 'none'],
                        ['Rejected plan (TOLAK)', '.pelan-tolak', 'tolak'], ['Plan drawing, no decision recorded', '.pelan-tiada', 'tiada']] },
  rekod:     { label: 'All plan records · Teluk Kalong register', swatchClass: 'rekod-lulus',
               layers: ['mpk-rekod-pt'],
               legend: [['Lulus / Diluluskan · 570', '.rekod-lulus', 'lulus'],
                        ['Lulus Bersyarat · 400', '.rekod-syarat', 'syarat'],
                        ['Sokong / Sedia Ada / Tolak · 7', '.rekod-lain', 'lain'],
                        ['No valid status · 22,237', '.rekod-tiada', 'tiada']] },
  reference: { label: 'Reference layers', swatchClass: 'line',
               layers: ['mpk-kadaster-line', 'mpk-boundary-fill',
                        'mpk-boundary-line', 'mpk-koridor-band', 'mpk-koridor-line'],
               legend: [['Cadastral lot', '.kadaster', 'kadaster'], ['Study area · Teluk Kalong', '.line', 'boundary'],
                        ['Study area · Binjai – Chukai', '.band', 'corridor']] },
};

const MPK = {
  // Bump with the ?v= on mpk.js / mpk.css in index.html whenever MPK code or data changes,
  // so browsers never mix a cached old file with a new one (GitHub Pages caches 10 min).
  VERSION: '20261015t',
  FILES: {
    buildings: 'mpk/mpk_buildings.geojson',
    boundary: 'mpk/tk_sempadan.geojson',
    kadaster: 'mpk/lot_kadaster.geojson',
    roads: 'mpk/koridor_jalan.geojson',
  },
  // Optional imagery indexes: if one fails to load, only its imagery mode is hidden
  OPTIONAL_FILES: { others: 'mpk/mpk_buildings_luar.geojson', landuse: 'mpk/landuse.geojson', pelan: 'mpk/pelan_lulus.geojson', daftar: 'mpk/pelan_kedai_daftar.json', wayback: 'mpk/wayback.json', sentinel: 'mpk/sentinel.json', landsat: 'mpk/landsat.json' },
  RATES_KEY: 'mpk_rates',
  DEFAULT_RATES: { fee: 2.0, cukai: 6.0 },
  LIST_SIZE: 50,
  // every record of the Teluk Kalong register as a point (tools/build_rekod_semua.py), loaded the
  // first time its layer is switched on; the counts are that script's output
  REKOD: { file: 'mpk/rekod_semua.geojson', total: 23214, placed: 22086, data: null, loading: false },
  LAYERS: ['mpk-wayback-layer', 'mpk-landuse-fill', 'mpk-landuse-line', 'mpk-district-line', 'mpk-pelan-fill', 'mpk-pelan-line', 'mpk-other-fill', 'mpk-other-line', 'mpk-other-bbc-fill', 'mpk-other-bbc-line', 'mpk-kadaster-line', 'mpk-boundary-fill', 'mpk-boundary-line', 'mpk-koridor-band',
           'mpk-koridor-line', 'mpk-unverified-fill', 'mpk-legal-fill', 'mpk-legal-line', 'mpk-suspect-fill', 'mpk-suspect-line',
           'mpk-suspect-extrude', 'mpk-highlight-line', 'mpk-rekod-pt', 'mpk-size-label'],
  SOURCES: ['mpk-wayback', 'mpk-rekod', 'mpk-size-pts', 'mpk-other', 'mpk-pelan', 'mpk-landuse', 'mpk-kadaster', 'mpk-boundary', 'mpk-roads', 'mpk-buildings', 'mpk-highlight'],
  SUSPECT_LAYERS: ['mpk-suspect-fill', 'mpk-suspect-line', 'mpk-suspect-extrude'],
  active: false,
  data: null,
  bounds: null,
  settings: { rizab: 10 },
  area: 'all',
  // land use starts off so the map shows the buildings first (switch it on in Analysis)
  // default view: the approved and pending buildings; illegal and outside buildings start off (switch on in Overview)
  layerOn: Object.fromEntries(Object.keys(MPK_LAYER_GROUPS).map(k => [k, !['landuse', 'pelan', 'rekod', 'suspect', 'others', 'othersBbc'].includes(k)])),
  rates: null,
  boundMap: null,
  prevTitle: null,
  popup: null,
  // Historical imagery, one satellite at a time: src 'esri' | 's2' | 'landsat', view 'image' |
  // 'year' | 'month' (month needs `year`); index per src:view, null = that list's default
  wayback: { on: false, src: null, view: null, year: null, index: {}, kind: null, timer: null },
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

// mpk/sumber.json (tools/update_footprints.py): when and from what the buildings were last rebuilt. Read
// without the cache so a rebuild reaches the browser at once: its version is part of every data URL.
async function mpkFetchSumber() {
  try {
    const res = await fetch('mpk/sumber.json?t=' + Date.now(), { cache: 'no-store' });
    return res.ok ? await res.json() : null;
  } catch (e) { return null; }
}
const mpkDataV = () => MPK.VERSION + (MPK.sumber && MPK.sumber.version ? '-' + MPK.sumber.version : '');

// Buildings outside the study areas, split by the study area they are nearer to: the Teluk Kalong boundary
// or the Binjai – Chukai corridor road (straight-line distance from the footprint's centre), as p.dekat
const MPK_DEKAT = {
  tk: { label: 'Outside · near Teluk Kalong', color: '#FF9100', outline: '#C56200', group: 'others' },
  bbc: { label: 'Outside · near Binjai – Chukai', color: '#AB47BC', outline: '#6A1B9A', group: 'othersBbc' },
};
function mpkSegM(p, a, b) {
  const KX = 111320 * Math.cos(4.27 * Math.PI / 180), KY = 110574;
  const x = p[0] * KX, y = p[1] * KY, x1 = a[0] * KX, y1 = a[1] * KY, dx = b[0] * KX - x1, dy = b[1] * KY - y1;
  const t = Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / ((dx * dx + dy * dy) || 1)));
  return Math.hypot(x - x1 - t * dx, y - y1 - t * dy);
}
// Outside buildings on the map now: the side(s) of the selected area chip whose switch is on
function mpkOutsideShown() {
  if (!MPK.data || !MPK.data.others) return [];
  return MPK.data.others.features.filter(f => {
    const k = f.properties.dekat, d = MPK_DEKAT[k];
    return d && MPK.layerOn[d.group] && (MPK.area === 'all' || MPK.area === k);
  });
}
// Overview: only the outside row(s) of the selected area chip
function mpkSyncOutsideRows() {
  for (const [k, d] of Object.entries(MPK_DEKAT)) {
    const row = document.getElementById('mpk-group-' + d.group);
    if (row) row.hidden = !(MPK.area === 'all' || MPK.area === k);
  }
}
function mpkTagNearest(data) {
  const segs = lines => lines.flatMap(l => l.slice(1).map((c, i) => [l[i], c]));
  const tkG = data.boundary.features[0].geometry;
  const tk = segs(tkG.type === 'Polygon' ? tkG.coordinates : tkG.coordinates.flat());
  const bbc = segs(data.roads.features.filter(f => f.properties.kawasan === 'bbc')
    .flatMap(f => f.geometry.type === 'LineString' ? [f.geometry.coordinates] : f.geometry.coordinates));
  const near = (p, list) => list.reduce((m, [a, b]) => Math.min(m, mpkSegM(p, a, b)), Infinity);
  for (const f of data.others.features) {
    const p = f.properties, pt = [p.lng, p.lat];
    p.dekat = !bbc.length || near(pt, tk) <= near(pt, bbc) ? 'tk' : 'bbc';
  }
}

async function mpkEnsureData() {
  if (MPK.data) return;
  MPK.sumber = await mpkFetchSumber();
  const entries = await Promise.all(Object.entries(MPK.FILES).map(async ([key, url]) => {
    const res = await fetch(url + '?v=' + mpkDataV());
    if (!res.ok) throw new Error('HTTP ' + res.status + ' · ' + url);
    return [key, await res.json()];
  }));
  const data = Object.fromEntries(entries);
  // the dashboard reports on the marked areas only: Teluk Kalong inside the planning boundary
  // and the Binjai – Bandar Chukai corridor (buildings outside them are dropped)
  data.buildings = { ...data.buildings, features: data.buildings.features.filter(f => mpkInScope(f.properties)) };
  await Promise.all(Object.entries(MPK.OPTIONAL_FILES).map(async ([key, url]) => {
    try {
      const res = await fetch(url + '?v=' + mpkDataV());
      data[key] = res.ok ? await res.json() : null;
    } catch (e) {
      data[key] = null;
    }
  }));
  // newer footprints on S3 than the build: merge them in the browser (mpk-live.js), so every load is current
  if (typeof mpkLiveFootprints === 'function') {
    const live = await mpkLiveFootprints(data, MPK.sumber);
    data.buildings = live.buildings;
    data.others = live.others;
  }
  if (data.others) mpkTagNearest(data);
  const b = data.buildings.features;
  MPK.bounds = {
    all: mpkBoundsOf([...b, ...data.boundary.features, ...data.roads.features]),
    tk: mpkBoundsOf(data.boundary.features),
    bbc: mpkBoundsOf(data.roads.features.filter(f => f.properties.kawasan === 'bbc')),
  };
  MPK.data = data;
}

// Returns false when the style was not ready and nothing was added.
function mpkAddLayers() {
  if (!map) return false;
  if (map.getSource('mpk-buildings')) return true;
  const suspect = mpkSuspectFilter(MPK.settings);
  try {
    map.addSource('mpk-kadaster', { type: 'geojson', data: MPK.data.kadaster });
    map.addSource('mpk-boundary', { type: 'geojson', data: MPK.data.boundary });
    map.addSource('mpk-roads', { type: 'geojson', data: MPK.data.roads });
    map.addSource('mpk-buildings', { type: 'geojson', data: MPK.data.buildings });
    map.addSource('mpk-highlight', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });

    map.addLayer({ id: 'mpk-kadaster-line', type: 'line', source: 'mpk-kadaster',
      paint: { 'line-color': '#00ACC1', 'line-opacity': 0.85,
               'line-width': ['interpolate', ['linear'], ['zoom'], 13, 0.4, 17, 1.4] } });
    if (MPK.data.pelan) {
      // MPK's approved building plans (CAD outlines and shapes): dark teal where a building stands
      // on the plan, purple where no building was found on it
      map.addSource('mpk-pelan', { type: 'geojson', data: MPK.data.pelan });
      const pelanColor = ['case', ['==', ['get', 'keputusan'], 'tolak'], '#D50000', ['==', ['get', 'keputusan'], 'tiada'], '#78909C',
        ['get', 'bangunan'], '#00695C', '#7E57C2'];
      map.addLayer({ id: 'mpk-pelan-fill', type: 'fill', source: 'mpk-pelan', filter: ['==', ['geometry-type'], 'Polygon'],
        paint: { 'fill-color': pelanColor, 'fill-opacity': 0.12 } });
      map.addLayer({ id: 'mpk-pelan-line', type: 'line', source: 'mpk-pelan', filter: ['!=', ['geometry-type'], 'Point'],
        paint: { 'line-color': pelanColor, 'line-opacity': 0.9,
                 'line-width': ['interpolate', ['linear'], ['zoom'], 13, 0.5, 18, 1.6] } });
    }
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
    if (MPK.data.landuse) {
      // in front of the imagery, lots and boundaries; only the buildings are drawn over it
      map.addSource('mpk-landuse', { type: 'geojson', data: MPK.data.landuse });
      const zoneColor = ['match', ['get', 'zone'], ...Object.entries(MPK_ZONES).flatMap(([k, z]) => [k, z.color]), '#9E9E9E'];
      const notDistrict = ['!=', ['get', 'zone'], 'district'];
      map.addLayer({ id: 'mpk-landuse-fill', type: 'fill', source: 'mpk-landuse', filter: notDistrict,
        paint: { 'fill-color': zoneColor, 'fill-opacity': 0.4 } });
      map.addLayer({ id: 'mpk-landuse-line', type: 'line', source: 'mpk-landuse', filter: notDistrict,
        paint: { 'line-color': zoneColor, 'line-width': 1, 'line-opacity': 0.9 } });
      map.addLayer({ id: 'mpk-district-line', type: 'line', source: 'mpk-landuse', filter: ['==', ['get', 'zone'], 'district'],
        paint: { 'line-color': '#1E2C44', 'line-width': 2.5, 'line-dasharray': [4, 2, 1, 2] } });
    }
    // not verified (quiet grey) < legal (green) < suspected (red), so the two that matter stand out
    if (MPK.data.others) {
      // the hand-drawn footprints outside the study areas: on the map, no status
      map.addSource('mpk-other', { type: 'geojson', data: MPK.data.others });
      for (const [k, d] of Object.entries(MPK_DEKAT)) {
        const id = k === 'tk' ? 'mpk-other' : 'mpk-other-bbc', only = ['==', ['get', 'dekat'], k];
        map.addLayer({ id: id + '-fill', type: 'fill', source: 'mpk-other', filter: only, paint: { 'fill-color': d.color, 'fill-opacity': 0.5 } });
        map.addLayer({ id: id + '-line', type: 'line', source: 'mpk-other', filter: only,
          paint: { 'line-color': d.outline, 'line-width': ['interpolate', ['linear'], ['zoom'], 13, 0.4, 17, 1.2] } });
      }
    }
    map.addLayer({ id: 'mpk-unverified-fill', type: 'fill', source: 'mpk-buildings', filter: mpkStatusFilter('unverified'),
      paint: { 'fill-color': MPK_STATUS.unverified.color, 'fill-opacity': 0.55, 'fill-outline-color': MPK_OUTLINE.unverified } });
    map.addLayer({ id: 'mpk-legal-fill', type: 'fill', source: 'mpk-buildings', filter: mpkStatusFilter('legal'),
      paint: { 'fill-color': MPK_STATUS.legal.color, 'fill-opacity': 0.6 } });
    map.addLayer({ id: 'mpk-legal-line', type: 'line', source: 'mpk-buildings', filter: mpkStatusFilter('legal'),
      paint: { 'line-color': MPK_OUTLINE.legal, 'line-width': ['interpolate', ['linear'], ['zoom'], 13, 0.5, 17, 1.5] } });
    map.addLayer({ id: 'mpk-suspect-fill', type: 'fill', source: 'mpk-buildings', filter: suspect,
      paint: { 'fill-color': MPK_SUSPECT_COLOR, 'fill-opacity': 0.65 } });
    map.addLayer({ id: 'mpk-suspect-line', type: 'line', source: 'mpk-buildings', filter: suspect,
      paint: { 'line-color': MPK_OUTLINE.suspected, 'line-width': ['interpolate', ['linear'], ['zoom'], 13, 0.7, 17, 2.2] } });
    map.addLayer({ id: 'mpk-suspect-extrude', type: 'fill-extrusion', source: 'mpk-buildings', filter: suspect,
      layout: { visibility: 'none' },
      paint: { 'fill-extrusion-color': MPK_SUSPECT_COLOR, 'fill-extrusion-height': 8, 'fill-extrusion-base': 0,
               'fill-extrusion-opacity': 0.85 } });
    map.addLayer({ id: 'mpk-highlight-line', type: 'line', source: 'mpk-highlight',
      paint: { 'line-color': '#FDD835', 'line-width': 3 } });
    // the register's records: valid statuses drawn larger and on top of the blank ones
    map.addSource('mpk-rekod', { type: 'geojson', data: MPK.REKOD.data || { type: 'FeatureCollection', features: [] } });
    map.addLayer({ id: 'mpk-rekod-pt', type: 'circle', source: 'mpk-rekod', layout: { visibility: 'none',
        'circle-sort-key': ['match', ['get', 'k'], 'tiada', 0, 1] },
      paint: { 'circle-color': ['match', ['get', 'k'], ...Object.entries(MPK_REKOD_COLOR).flat(), '#90A4AE'],
               'circle-radius': ['interpolate', ['linear'], ['zoom'], 11, ['match', ['get', 'k'], 'tiada', 1.5, 3],
                                 18, ['match', ['get', 'k'], 'tiada', 4, 7]],
               'circle-stroke-color': '#ffffff', 'circle-stroke-width': ['match', ['get', 'k'], 'tiada', 0.3, 1],
               'circle-opacity': ['match', ['get', 'k'], 'tiada', 0.7, 0.95] } });
    // footprint size (m²) on every building once zoomed in
    map.addSource('mpk-size-pts', { type: 'geojson', data: { type: 'FeatureCollection',
      features: MPK.data.buildings.features.map(f => ({ type: 'Feature', properties: { m2: f.properties.area_m2, kawasan: f.properties.kawasan },
        geometry: { type: 'Point', coordinates: [f.properties.lng, f.properties.lat] } })) } });
    map.addLayer({ id: 'mpk-size-label', type: 'symbol', source: 'mpk-size-pts', minzoom: 16.5,
      layout: { 'text-field': ['concat', ['to-string', ['round', ['get', 'm2']]], ' m²'], 'text-font': ['Noto Sans Regular'],
                'text-size': ['interpolate', ['linear'], ['zoom'], 16.5, 9.5, 19, 12.5], 'text-allow-overlap': false },
      paint: { 'text-color': '#1E2C44', 'text-halo-color': '#ffffff', 'text-halo-width': 1.4 } });
  } catch (e) {
    // Style not ready yet (e.g. mid basemap rebuild) — mpkOnStyleLoad retries.
    mpkRemoveLayers();
    return false;
  }
  mpkApplyLayerVisibility();
  if (typeof strataLayers === 'function') strataLayers();              // Strata mode: schemes and cemetery sites
  if (MPK.wayback.on) mpkShowWaybackImagery();
  if (typeof mpkChangeRestore === 'function') mpkChangeRestore();
  return true;
}

// Building layers show the selected area only (All = both): status filter AND area
function mpkInArea(filter) {
  return MPK.area === 'all' ? filter : ['all', filter, ['==', ['get', 'kawasan'], MPK.area]];
}
function mpkApplyBuildingFilters() {
  if (!map || !map.getLayer('mpk-suspect-fill')) return;
  const suspect = mpkInArea(mpkSuspectFilter(MPK.settings));
  MPK.SUSPECT_LAYERS.forEach(id => { if (map.getLayer(id)) map.setFilter(id, suspect); });
  for (const st of ['legal', 'unverified']) {
    for (const id of MPK_LAYER_GROUPS[st].layers) if (map.getLayer(id)) map.setFilter(id, mpkInArea(mpkStatusFilter(st)));
  }
  if (map.getLayer('mpk-size-label')) map.setFilter('mpk-size-label', MPK.area === 'all' ? null : ['==', ['get', 'kawasan'], MPK.area]);
  // outside buildings: each side follows its own switch and the area chip
  for (const [k, d] of Object.entries(MPK_DEKAT)) {
    const show = MPK.layerOn[d.group] && (MPK.area === 'all' || MPK.area === k);
    MPK_LAYER_GROUPS[d.group].layers.forEach(id => { if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', show ? 'visible' : 'none'); });
  }
}

// Map layers that belong to one legend entry of their group
const MPK_SUB_LAYERS = {
  'mpk-kadaster-line': 'reference:kadaster', 'mpk-boundary-fill': 'reference:boundary', 'mpk-boundary-line': 'reference:boundary',
  'mpk-koridor-band': 'reference:corridor', 'mpk-koridor-line': 'reference:corridor', 'mpk-district-line': 'landuse:district',
};
const mpkSubOn = (group, sub) => !(MPK.subOff || MPK_SUB_DEFAULT_OFF)[group + ':' + sub];
const MPK_SUB_DEFAULT_OFF = { 'reference:kadaster': true };
// a study area outline belongs to its area chip
const MPK_SUB_AREA = { 'reference:boundary': 'tk', 'reference:corridor': 'bbc' };
const mpkSubVisible = sub => mpkSubOn(...sub.split(':')) && (!MPK_SUB_AREA[sub] || MPK.area === 'all' || MPK.area === MPK_SUB_AREA[sub]);

function mpkApplyLayerVisibility() {
  for (const [key, g] of Object.entries(MPK_LAYER_GROUPS)) {
    g.layers.forEach(id => {
      if (id === 'mpk-suspect-extrude') return;
      const sub = MPK_SUB_LAYERS[id];
      mpkSetVis(id, MPK.layerOn[key] && (!sub || mpkSubVisible(sub)) ? 'visible' : 'none');
    });
  }
  // land use: only the classes switched on
  const zonesOff = Object.keys(MPK_ZONES).filter(z => !mpkSubOn('landuse', z));
  const zoneFilter = ['all', ['!=', ['get', 'zone'], 'district'], ['!', ['in', ['get', 'zone'], ['literal', zonesOff]]]];
  ['mpk-landuse-fill', 'mpk-landuse-line'].forEach(id => { if (map.getLayer(id)) map.setFilter(id, zoneFilter); });
  // approved plans: covering a building and / or with none found
  const ok = ['==', ['get', 'keputusan'], 'lulus'];
  const which = ['any', false,
    ...(mpkSubOn('pelan', 'covers') ? [['all', ok, ['get', 'bangunan']]] : []),
    ...(mpkSubOn('pelan', 'none') ? [['all', ok, ['!', ['get', 'bangunan']]]] : []),
    ...(mpkSubOn('pelan', 'tolak') ? [['==', ['get', 'keputusan'], 'tolak']] : []),
    ...(mpkSubOn('pelan', 'tiada') ? [['==', ['get', 'keputusan'], 'tiada']] : [])];
  if (map.getLayer('mpk-pelan-fill')) map.setFilter('mpk-pelan-fill', ['all', ['==', ['geometry-type'], 'Polygon'], which]);
  if (map.getLayer('mpk-pelan-line')) map.setFilter('mpk-pelan-line', ['all', ['!=', ['geometry-type'], 'Point'], which]);
  // register records: the status groups switched on
  if (map.getLayer('mpk-rekod-pt')) {
    map.setFilter('mpk-rekod-pt', ['in', ['get', 'k'], ['literal', Object.keys(MPK_REKOD_COLOR).filter(k => mpkSubOn('rekod', k))]]);
  }
  if (MPK.layerOn.rekod && !MPK.REKOD.data) mpkLoadRekod();
  mpkApplyBuildingFilters();
  mpkSyncStudyArea();
  mpkRefresh3D();
  if (typeof strataHideMpk === 'function') strataHideMpk();          // Strata mode keeps MPK's status layers off
}

// One legend entry on / off; switching one on also switches its group on
// Study-area switch in Overview: the outline(s) of the selected chip (both for All)
const mpkStudySubs = () => MPK.area === 'tk' ? ['boundary'] : MPK.area === 'bbc' ? ['corridor'] : ['boundary', 'corridor'];
function mpkStudyAreaOn() {
  return MPK.layerOn.reference && mpkStudySubs().every(sub => mpkSubOn('reference', sub));
}
function mpkToggleStudyArea() {
  const on = !mpkStudyAreaOn();
  const off = { ...(MPK.subOff || MPK_SUB_DEFAULT_OFF) };
  mpkStudySubs().forEach(sub => { off['reference:' + sub] = !on; });
  MPK.subOff = off;
  mpkStudySubs().forEach(sub => {
    const btn = document.getElementById('mpk-sub-reference-' + sub);
    if (btn) { btn.classList.toggle('on', on); btn.setAttribute('aria-checked', String(on)); }
  });
  if (on && !MPK.layerOn.reference) { mpkToggleLayer('reference'); return; }
  if (map) mpkApplyLayerVisibility();
}
function mpkSyncStudyArea() {
  const btn = document.getElementById('mpk-tog-studyarea');
  if (!btn) return;
  const on = mpkStudyAreaOn();
  btn.className = 'layer-toggle ' + (on ? 'on' : 'off');
  btn.setAttribute('aria-checked', String(on));
  document.getElementById('mpk-group-studyarea').classList.toggle('is-off', !on);
  document.getElementById('mpk-sa-label').textContent = { tk: 'Study area · Teluk Kalong', bbc: 'Study area · Binjai – Chukai' }[MPK.area] || 'Study areas';
  document.getElementById('mpk-sa-sub').textContent = { tk: 'planning boundary on the map', bbc: 'road corridor on the map' }[MPK.area]
    || 'Teluk Kalong boundary and Binjai – Chukai corridor';
}

function mpkToggleSub(group, sub) {
  MPK.subOff = { ...(MPK.subOff || MPK_SUB_DEFAULT_OFF), [group + ':' + sub]: mpkSubOn(group, sub) };
  const on = mpkSubOn(group, sub);
  const btn = document.getElementById(`mpk-sub-${group}-${sub}`);
  if (btn) { btn.classList.toggle('on', on); btn.setAttribute('aria-checked', String(on)); }
  if (on && !MPK.layerOn[group]) { mpkToggleLayer(group); return; }
  if (map) mpkApplyLayerVisibility();
}

function mpkToggleLayer(key) {
  MPK.layerOn = { ...MPK.layerOn, [key]: !MPK.layerOn[key] };
  const btn = document.getElementById('mpk-tog-' + key);
  btn.className = 'layer-toggle ' + (MPK.layerOn[key] ? 'on' : 'off');
  btn.setAttribute('aria-checked', String(MPK.layerOn[key]));
  document.getElementById('mpk-group-' + key).classList.toggle('is-off', !MPK.layerOn[key]);
  if (key === 'suspect' && !MPK.layerOn.suspect && MPK.popup) { MPK.popup.remove(); MPK.popup = null; }
  if (map) mpkApplyLayerVisibility();
  if (key === 'others' || key === 'othersBbc') mpkRender();          // the total counts the outside buildings switched on
}

// MapLibre filter for one building status (mirrors mpkStatus)
function mpkStatusFilter(status) {
  const suspect = mpkSuspectFilter(MPK.settings), legal = ['==', ['get', 'kategori'], 'lulus'];
  if (status === 'suspected') return suspect;
  if (status === 'legal') return ['all', ['!', suspect], legal];
  return ['all', ['!', suspect], ['!', legal]];
}

function mpkRemoveLayers() {
  if (!map) return;
  if (typeof strataRemoveLayers === 'function') strataRemoveLayers();
  MPK.LAYERS.forEach(id => { try { if (map.getLayer(id)) map.removeLayer(id); } catch (e) {} });
  MPK.SOURCES.forEach(id => { try { if (map.getSource(id)) map.removeSource(id); } catch (e) {} });
}

const MPK_REKOD_COLOR = { lulus: '#00897B', syarat: '#F9A825', lain: '#7E57C2', tiada: '#90A4AE' };

// Fetches the register's records (3.6 MB) the first time their layer is switched on
async function mpkLoadRekod(quiet) {
  if (MPK.REKOD.data || MPK.REKOD.loading) return;
  MPK.REKOD.loading = true;
  if (!quiet) showToast('Loading ' + mpkNum(MPK.REKOD.total) + ' plan records…', 2500);
  try {
    const res = await fetch(MPK.REKOD.file + '?v=' + MPK.VERSION);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    MPK.REKOD.data = await res.json();
    const src = map && map.getSource('mpk-rekod');
    if (src) src.setData(MPK.REKOD.data);
  } catch (e) {
    showToast('⚠️ Could not load the plan records: ' + e.message, 5000);
  } finally {
    MPK.REKOD.loading = false;
  }
}

function mpkSetVis(id, vis) {
  if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', vis);
}

// Called from refresh3DLayers() in index.html
function mpkRefresh3D() {
  if (!map) return;
  mpkSetVis('mpk-suspect-extrude', MPK.active && is3D && MPK.layerOn.suspect ? 'visible' : 'none');
}

// Called from the style.load handler in index.html. Basemap code re-adds the Seremban
// layers in its own style.load handler, so defer until after it has run.
function mpkOnStyleLoad() {
  if (!MPK.active) return;
  if (typeof mpkFeatStop === 'function' && MPK_FEAT.key) mpkFeatStop();     // the style swap dropped its layers
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
  ['mpk-other-fill', 'mpk-other-bbc-fill'].forEach(layer => map.on('click', layer, e => {
    if (!MPK.active || !e.features.length || (typeof MPK_FEAT !== 'undefined' && MPK_FEAT.capture)) return;
    const onStudy = map.queryRenderedFeatures(e.point, { layers: ['mpk-suspect-fill', 'mpk-legal-fill', 'mpk-unverified-fill']
      .filter(id => map.getLayer(id)) }).length;
    if (!onStudy) mpkShowOtherPopup(e.features[0].properties, e.lngLat);
  }));
  ['mpk-suspect-fill', 'mpk-legal-fill', 'mpk-unverified-fill', 'mpk-other-fill', 'mpk-other-bbc-fill'].forEach(layer => {
    map.on('click', layer, e => {
      if (!MPK.active || !e.features.length || (typeof MPK_FEAT !== 'undefined' && MPK_FEAT.capture) || layer.startsWith('mpk-other')) return;
      mpkShowPopup(e.features[0].properties, e.lngLat);
    });
    map.on('mouseenter', layer, () => { if (MPK.active) map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', layer, () => { if (MPK.active) map.getCanvas().style.cursor = 'grab'; });
  });
  // a land-use zone answers only where there is no building under the click
  ['mpk-pelan-fill', 'mpk-pelan-line'].forEach(layer => map.on('click', layer, e => {
    if (!MPK.active || !e.features.length || (typeof MPK_FEAT !== 'undefined' && MPK_FEAT.capture)) return;
    const onBuilding = map.queryRenderedFeatures(e.point, { layers: ['mpk-suspect-fill', 'mpk-legal-fill', 'mpk-unverified-fill']
      .filter(id => map.getLayer(id)) }).length;
    if (!onBuilding) mpkShowPlanPopup(e.features[0].properties, e.lngLat);
  }));
  // registered after the building layers, so on a record its popup replaces the building's
  map.on('click', 'mpk-rekod-pt', e => {
    if (!MPK.active || !e.features.length || (typeof MPK_FEAT !== 'undefined' && MPK_FEAT.capture)) return;
    mpkShowRekodPopup(e.features[0].properties, e.features[0].geometry.coordinates);
  });
  map.on('mouseenter', 'mpk-rekod-pt', () => { if (MPK.active) map.getCanvas().style.cursor = 'pointer'; });
  map.on('mouseleave', 'mpk-rekod-pt', () => { if (MPK.active) map.getCanvas().style.cursor = 'grab'; });
  map.on('click', 'mpk-landuse-fill', e => {
    if (!MPK.active || !e.features.length) return;
    const onBuilding = map.queryRenderedFeatures(e.point, { layers: ['mpk-suspect-fill', 'mpk-legal-fill', 'mpk-unverified-fill']
      .filter(id => map.getLayer(id)) }).length;
    if (!onBuilding) mpkShowZonePopup(e.features[0].properties, e.lngLat);
  });
}

// Area dropdown: Seremban, MPK Kemaman, or Strata (the strata title concept, mpk-strata.js, on the MPK data)
function mpkSetMode(mode) {
  if (mode === 'mpk' || mode === 'strata') {
    mpkEnter().then(() => { if (typeof strataSet === 'function') strataSet(MPK.active && mode === 'strata'); });
  } else mpkExit();
}

async function mpkEnter() {
  if (MPK.active) return;
  if (!MPK.rates) MPK.rates = mpkLoadRates();
  try {
    if (!MPK.data) showLoading('Loading MPK Kemaman data...', 'Buildings, boundary, lots & corridors');
    await mpkEnsureData();
  } catch (err) {
    hideLoading();
    showToast('⚠️ Could not load MPK data: ' + err.message, 5000);
    document.getElementById('area-mode').value = 'seremban';
    return;
  }
  hideLoading();
  if (typeof mpkDaftarInit === 'function' && !MPK.daftarReady) {     // registrations: before the layers are drawn
    mpkDaftarInit();
    MPK.daftarReady = true;
  }
  MPK.active = true;
  mpkWatchSumber();
  document.body.classList.add('mpk-mode');

  // Leave any Seremban interaction state behind
  try { if (currentPopup) { currentPopup.remove(); currentPopup = null; } } catch (e) {}
  const nav = document.getElementById('mode-navigate');
  if (nav && mapMode !== 'navigate') setMapMode('navigate', nav);
  // default view: the Esri 24 Sep 2026 aerial (the imagery the footprints were drawn on), the analysis panel closed
  if (!(BASEMAPS[currentBasemap] && BASEMAPS[currentBasemap].mpk)) {
    // the swap rebuilds the style and puts the camera back where it was: be over the study area first
    if (MPK.bounds) map.fitBounds(MPK.bounds[MPK.area], { padding: 50, duration: 0 });
    switchBasemap('mpk-esri-2026', '24 Sep 2026', document.querySelector(`.basemap-option[onclick*="'mpk-esri-2026'"]`));
  }
  if (!MPK.viewSet) { MPK.viewSet = true; toggleSide('rp', true); }

  mpkSetSerembanVisible(false);
  mpkAddLayers();
  mpkBindEvents();

  const title = document.getElementById('page-title'), sub = document.getElementById('page-sub');
  const panelSub = document.getElementById('panel-sub');
  MPK.prevTitle = { title: title.textContent, sub: sub.textContent, panelSub: panelSub.textContent };
  title.textContent = 'Illegal Construction Monitoring — MPK Kemaman';
  sub.textContent = 'Teluk Kalong · Binjai–Bandar Chukai';
  panelSub.textContent = 'MPK Kemaman · Buildings suspected of lacking planning permission';

  const tab = document.getElementById('ptab-mpk');
  tab.style.display = '';
  mpkBuildPanel();
  mpkBuildStatsPage();
  mpkBuildFloatCard();
  if (typeof mpkBuildFeaturesPage === 'function') mpkBuildFeaturesPage();
  if (typeof mpkDaftarBuildPage === 'function') mpkDaftarBuildPage();
  MPK.page = 'dashboard';
  mpkBuildHistoricBasemaps();
  mpkBindSearch();
  if (typeof mpkChangeInit === 'function') mpkChangeInit();
  switchTab(tab, 'mpk');
  mpkSelectArea(MPK.area);
  addActivityLog('MPK Kemaman mode', 'Suspected illegal construction');
}

function mpkExit() {
  if (!MPK.active) return;
  if (typeof strataSet === 'function') strataSet(false);
  MPK.active = false;
  if (typeof mpkFeatStop === 'function') mpkFeatStop();
  if (MPK.page !== 'dashboard') mpkShowPage('dashboard');
  document.body.classList.remove('mpk-mode');
  mpkHistoricOff();
  if (MPK_SEARCH.marker) { MPK_SEARCH.marker.remove(); MPK_SEARCH.marker = null; }
  if (typeof mpkChangeClear === 'function') mpkChangeClear();
  if (MPK.popup) { MPK.popup.remove(); MPK.popup = null; }
  mpkRemoveLayers();
  mpkSetSerembanVisible(true);
  // the MPK aerial basemaps only cover Kemaman
  if (BASEMAPS[currentBasemap] && BASEMAPS[currentBasemap].mpk) {
    switchBasemap('google-road', 'Google Maps', document.querySelector(`.basemap-option[onclick*="'google-road'"]`));
  }
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
  addActivityLog('Seremban mode', 'Back to the Seremban dashboard');
}

// ---------- Panel ----------
const mpkNum = n => Math.round(n).toLocaleString('en-MY');
const mpkRM = n => 'RM ' + Math.round(n).toLocaleString('en-MY');

function mpkBuildPanel() {
  const el = document.getElementById('tab-mpk');
  if (el.dataset.built) return;
  el.dataset.built = '1';
  const chips = [['all', 'All'], ...Object.entries(MPK_AREAS).map(([k, a]) => [k, a.short])]
    .map(([k, label]) => `<button class="mpk-chip" data-area="${k}" onclick="mpkSelectArea('${k}')">${label}</button>`).join('');
  // a switch row for one layer group (shared by the Overview status rows and the Analysis layers)
  const toggle = (k, label) => `<button type="button" class="layer-toggle ${MPK.layerOn[k] ? 'on' : 'off'}" id="mpk-tog-${k}"
    role="switch" aria-checked="${MPK.layerOn[k]}" aria-label="${label}" onclick="mpkToggleLayer('${k}')"></button>`;
  const statusRows = Object.entries(MPK_STATUS).map(([k, st]) => {
    const group = { suspected: 'suspect', legal: 'legal', unverified: 'unverified' }[k];
    return `<div class="mpk-st-row mpk-layer-group${MPK.layerOn[group] ? '' : ' is-off'}" id="mpk-group-${group}" title="${st.hint}">
      <i class="sw" style="background:${st.color}"></i>
      <div class="mpk-st-main"><div class="mpk-st-label">${st.label}</div><div class="mpk-st-sub" id="mpk-st-sub-${k}">—</div></div>
      <div class="mpk-st-pct" id="mpk-st-pct-${k}">—</div>
      ${toggle(group, st.label)}
    </div>`;
  }).join('');
  const analysisGroups = ['landuse', 'pelan', 'rekod', 'reference'].filter(k => k !== 'pelan' || MPK.data.pelan).map(k => {
    const g = MPK_LAYER_GROUPS[k];
    const sw = g.swatchClass ? `<i class="sw ${g.swatchClass}"></i>` : g.swatch.map(c => `<i class="sw" style="background:${c}"></i>`).join('');
    // every legend entry is its own switch (the group switch still turns them all on / off)
    const legend = g.legend.map(([label, v, sub]) => {
      const on = mpkSubOn(k, sub);
      return `<button type="button" class="mpk-sub${on ? ' on' : ''}" id="mpk-sub-${k}-${sub}" role="switch" aria-checked="${on}"
        onclick="mpkToggleSub('${k}', '${sub}')"><span class="mpk-sub-box" aria-hidden="true"></span>${v[0] === '.' ? `<i class="sw ${v.slice(1)}"></i>` : `<i class="sw" style="background:${v}"></i>`}${label}</button>`;
    }).join('');
    return `<div class="mpk-layer-group${MPK.layerOn[k] ? '' : ' is-off'}" id="mpk-group-${k}">
      <div class="mpk-layer-row"><span class="mpk-sw-group">${sw}</span><div class="mpk-layer-main">${g.label}</div>${toggle(k, g.label)}</div>
      ${legend ? `<div class="mpk-layer-legend">${legend}</div>` : ''}
      ${k === 'rekod' ? `<div class="mpk-layer-note">${mpkNum(MPK.REKOD.total)} records: ${mpkNum(MPK.REKOD.placed)} on the map, ${mpkNum(MPK.REKOD.total - MPK.REKOD.placed)} with no usable coordinates. One point per record, at its centre; one plan is often many CAD records.</div>` : ''}
    </div>`;
  }).join('');

  el.innerHTML = `
    <div class="mpk-subtabs" role="tablist">
      <button type="button" role="tab" data-sub="overview" class="active" onclick="mpkSubTab('overview')">Overview</button>
      <button type="button" role="tab" data-sub="analysis" onclick="mpkSubTab('analysis')">Analysis</button>
    </div>

    <div id="mpk-sub-overview">
      <div class="mpk-chips" role="tablist">${chips}</div>
      <div class="mpk-scope" id="mpk-hero-sub"></div>
      ${mpkSumberHTML()}

      <div class="mpk-kpis">
        <div class="mpk-kpi"><div class="v" id="mpk-k-total">—</div><div class="l">Total buildings<br><span id="mpk-k-m2">—</span></div></div>
        <div class="mpk-kpi legal"><div class="v" id="mpk-k-legal">—</div><div class="l">Approved buildings<br><span id="mpk-k-legal-n">—</span></div></div>
        <div class="mpk-kpi danger"><div class="v" id="mpk-k-illegal">—</div><div class="l">Illegal buildings<br><span id="mpk-k-illegal-n">—</span></div></div>
      </div>

      <div class="mpk-card mpk-status">
        <div class="mpk-status-bar" id="mpk-status-bar"></div>
        ${statusRows}
        <div class="mpk-st-row mpk-layer-group" id="mpk-group-studyarea" title="Outline of the study area of the selected chip">
          <i class="sw" style="background:none;border:2px dashed #E8772E"></i>
          <div class="mpk-st-main"><div class="mpk-st-label" id="mpk-sa-label">Study areas</div>
            <div class="mpk-st-sub" id="mpk-sa-sub">outline on the map</div></div>
          <button type="button" class="layer-toggle off" id="mpk-tog-studyarea" role="switch" aria-checked="false"
            aria-label="Study area outline" onclick="mpkToggleStudyArea()"></button>
        </div>
        ${MPK.data.others ? Object.entries(MPK_DEKAT).map(([k, d]) => `<div class="mpk-st-row mpk-layer-group${MPK.layerOn[d.group] ? '' : ' is-off'}" id="mpk-group-${d.group}"
            title="Hand-drawn footprints outside the study areas, nearer to ${k === 'tk' ? 'the Teluk Kalong boundary' : 'the Binjai – Chukai corridor'}: shown on the map, no status">
          <i class="sw" style="background:${d.color};border:1px solid ${d.outline}"></i>
          <div class="mpk-st-main"><div class="mpk-st-label">${d.label}</div>
            <div class="mpk-st-sub">${mpkNum(MPK.data.others.features.filter(f => f.properties.dekat === k).length)} buildings · map only, no status</div></div>
          ${toggle(d.group, d.label)}
        </div>`).join('') : ''}
        <div class="mpk-st-row mpk-layer-group${MPK.layerOn.sizes ? '' : ' is-off'}" id="mpk-group-sizes">
          <i class="sw sizes">m²</i>
          <div class="mpk-st-main"><div class="mpk-st-label">Building size labels</div>
            <div class="mpk-st-sub">m² shown on each building when zoomed in</div></div>
          ${toggle('sizes', 'Building size labels')}
        </div>
      </div>

      <div class="mpk-list-head">
        <div class="mpk-card-title">Largest suspected buildings</div>
        <button class="mpk-btn" onclick="mpkExportCSV()">Export CSV</button>
      </div>
      <div class="mpk-list" id="mpk-list"></div>
    </div>

    <div id="mpk-sub-analysis" hidden>
      <div class="mpk-card mpk-layers">
        <div class="mpk-card-title">Map layers</div>
        ${analysisGroups}
      </div>

      <div class="mpk-card" id="mpk-rizab-card">
        <div class="mpk-row">
          <label for="mpk-rizab" class="mpk-label">Road reserve from centreline (corridors)</label>
          <span class="mpk-slider-val" id="mpk-rizab-val"></span>
        </div>
        <input type="range" id="mpk-rizab" class="mpk-range" min="3" max="20" step="1"
          value="${MPK.settings.rizab}" oninput="mpkOnSetting('rizab', this.value)">
        <div class="mpk-range-scale"><span>3 m</span><span>20 m</span></div>
      </div>
${typeof mpkChangeCardHTML === 'function' ? mpkChangeCardHTML() : ''}

      <div class="mpk-card">
        <div class="mpk-card-title">Estimated council revenue <span class="mpk-tag">assumption</span></div>
        <div class="mpk-rate-row">
          <label for="mpk-rate-fee">Development application processing fee<small>RM / m²</small></label>
          <input type="number" id="mpk-rate-fee" min="0" step="0.1" value="${MPK.rates.fee}" oninput="mpkOnRate()">
          <div class="mpk-money" id="mpk-r-fee">—</div>
        </div>
        <div class="mpk-rate-row">
          <label for="mpk-rate-cukai">Assessment tax (Cukai Pintu)<small>RM / m² / year</small></label>
          <input type="number" id="mpk-rate-cukai" min="0" step="0.1" value="${MPK.rates.cukai}" oninput="mpkOnRate()">
          <div class="mpk-money" id="mpk-r-cukai">—</div>
        </div>
        <div class="mpk-total"><span>First-year revenue potential</span><strong id="mpk-r-total">—</strong></div>
      </div>

${MPK.data.daftar ? mpkRegisterCardHTML() : ''}

      <div class="mpk-note">Buildings shown: Teluk Kalong inside the planning boundary, and along the Binjai – Bandar Chukai corridor.
        Teluk Kalong suspected buildings: the list flagged in the Uzma/MPK building API
        (kemaman_buildings_industri_filled.geojson, <code>is_mockup</code>). Footprints: digitised by hand from Esri imagery
        of 24 Sep 2026.
        Legal = covered by an MPK-approved building plan (Pelan Bangunan Lulus, 966 records). Boundary digitised
        from MPK's map; road centrelines and land use from OpenStreetMap (not
        official RTD zoning); cadastral lots from NDCDB. Road-reserve width and revenue rates are assumptions.
        Every case needs site verification.</div>
    </div>
  `;
}

// Where the footprints come from and when they were last rebuilt from the source on S3
function mpkSumberHTML() {
  const s = MPK.sumber, live = typeof MPK_LIVE !== 'undefined' ? MPK_LIVE.info : null;
  if (!s && !live) return '';
  const stamp = (live && live.lastModified) || (s && s.last_modified) || '';
  const when = new Date(stamp);
  const day = isNaN(when) ? '' : when.toLocaleString('en-MY', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const total = MPK.data ? MPK.data.buildings.features.length + (MPK.data.others ? MPK.data.others.features.length : 0) : 0;
  const how = live && live.live
    ? `live from the source · ${mpkNum(live.added)} new or redrawn, ${mpkNum(live.removed)} removed since the last full rebuild`
    : 'up to date with the source';
  return `<div class="mpk-data-src${live && live.live ? ' live' : ''}" title="${mpkEscHtml(s ? s.url : '')}"><span class="mpk-data-dot" aria-hidden="true"></span>
    Footprints digitised ${mpkEscHtml(day)} · ${mpkNum(total)} buildings · ${how} · checked at every load</div>`;
}
// While the dashboard is open, ask the source every 10 minutes and offer a reload when it changes
function mpkWatchSumber() {
  if (MPK.sumberTimer || typeof MPK_LIVE === 'undefined') return;
  MPK.sumberTimer = setInterval(async () => {
    if (!MPK.active || !MPK_LIVE.info || MPK.sumberNotified) return;
    try {
      const ctl = new AbortController();                       // headers only: S3 allows GET, not HEAD
      const res = await fetch(MPK_LIVE.SRC, { cache: 'no-cache', signal: ctl.signal });
      const lm = res.ok ? res.headers.get('Last-Modified') : '';
      ctl.abort();
      if (lm && lm !== MPK_LIVE.info.lastModified) {
        MPK.sumberNotified = true;
        showToast('🏗️ New building footprints are available: refresh the page to see them', 12000);
      }
    } catch (e) { /* offline */ }
  }, 10 * 60 * 1000);
}

// Shop building plan register (Pelan Bangunan Kedai): every record, approved or not, on the map or not
const MPK_REG_GROUPS = ['Lulus', 'Lulus Bersyarat', 'Tolak', 'Tidak dinyatakan', 'Tiada keputusan'];
const MPK_REG_PAGE = 150;
function mpkRegisterCardHTML() {
  const reg = MPK.data.daftar;
  const n = k => reg.filter(r => r.kumpulan === k).length;
  const onMap = reg.filter(r => r.peta === 'ya').length;
  return `<div class="mpk-card mpk-reg">
        <div class="mpk-card-title">Shop building plan register</div>
        <div class="mpk-reg-sum">${mpkNum(reg.length)} records · ${mpkNum(onMap)} drawn on the map ·
          ${mpkNum(reg.length - onMap)} cannot be placed</div>
        <input type="search" id="mpk-reg-q" class="mpk-reg-q" placeholder="File no., lot, applicant or building type"
          oninput="mpkRenderRegister()" aria-label="Search the register">
        <div class="mpk-reg-filters">
          <select id="mpk-reg-st" onchange="mpkRenderRegister()" aria-label="Approval status">
            <option value="">All statuses (${mpkNum(reg.length)})</option>
            ${MPK_REG_GROUPS.map(k => `<option value="${k}">${k} (${mpkNum(n(k))})</option>`).join('')}
          </select>
          <select id="mpk-reg-map" onchange="mpkRenderRegister()" aria-label="On the map">
            <option value="">On the map or not</option>
            <option value="ya">On the map (${mpkNum(onMap)})</option>
            <option value="no">Not on the map (${mpkNum(reg.length - onMap)})</option>
          </select>
        </div>
        <div class="mpk-reg-count" id="mpk-reg-count"></div>
        <div class="mpk-reg-list" id="mpk-reg-list"></div>
      </div>`;
}
function mpkRegisterMatches() {
  const q = (document.getElementById('mpk-reg-q').value || '').trim().toUpperCase();
  const st = document.getElementById('mpk-reg-st').value, mp = document.getElementById('mpk-reg-map').value;
  return MPK.data.daftar.map((r, i) => ({ ...r, i })).filter(r =>
    (!st || r.kumpulan === st) && (!mp || (mp === 'ya') === (r.peta === 'ya'))
    && (!q || [r.fail, r.lot, r.pemohon, r.jenis, r.arkitek, r.status, String(r.n)].some(t => (t || '').toUpperCase().includes(q))));
}
function mpkRegisterRow(r) {
  const cls = { 'Lulus': 'ok', 'Lulus Bersyarat': 'cond', 'Tolak': 'no', 'Tidak dinyatakan': 'na', 'Tiada keputusan': 'na' };
  const where = r.peta === 'ya' ? 'on the map' + (r.bangunan ? ' · covers a building' : '')
    : r.peta === 'luar' ? 'not on the map · coordinates outside Kemaman' : 'not on the map · no drawing in the register';
  const title = r.fail ? 'File ' + mpkEscHtml(r.fail) : 'Record ' + r.n;
  const meta = [r.lot ? 'Lot ' + mpkEscHtml(r.lot) : '', r.tarikh ? mpkPlanDateLabel(r.tarikh) : '',
    r.status && !MPK_REG_GROUPS.includes(r.status) ? 'status: ' + mpkEscHtml(r.status) : '', where].filter(Boolean).join(' · ');
  return `<button type="button" class="mpk-reg-row${r.c ? '' : ' nomap'}" ${r.c ? `onclick="mpkRegisterGo(${r.i})"` : 'disabled'}>
      <div class="mpk-reg-top"><b>${title}</b><span class="mpk-reg-st ${cls[r.kumpulan]}">${mpkEscHtml(r.kumpulan)}</span></div>
      ${r.pemohon || r.jenis ? `<div class="mpk-reg-l">${[mpkEscHtml(r.pemohon), mpkEscHtml(r.jenis)].filter(Boolean).join(' · ')}</div>` : ''}
      <div class="mpk-reg-m">${meta}</div>
    </button>`;
}
function mpkRenderRegister(more) {
  if (!document.getElementById('mpk-reg-list')) return;
  MPK.regShown = more ? MPK.regShown + MPK_REG_PAGE : MPK_REG_PAGE;
  const rows = mpkRegisterMatches(), shown = rows.slice(0, MPK.regShown);
  document.getElementById('mpk-reg-count').textContent = rows.length
    ? `${mpkNum(rows.length)} record${rows.length === 1 ? '' : 's'}${rows.length > shown.length ? ` · showing ${mpkNum(shown.length)}` : ''}` : '';
  document.getElementById('mpk-reg-list').innerHTML = rows.length
    ? shown.map(mpkRegisterRow).join('') + (rows.length > shown.length
      ? `<button type="button" class="mpk-reg-more" onclick="mpkRenderRegister(true)">Show ${mpkNum(Math.min(MPK_REG_PAGE, rows.length - shown.length))} more</button>` : '')
    : '<div class="mpk-reg-empty">No record matches.</div>';
}
function mpkRegisterGo(i) {
  const r = MPK.data.daftar[i];
  if (!r || !r.c || !map) return;
  if (!MPK.layerOn.pelan) mpkToggleLayer('pelan');
  if (r.kumpulan === 'Tiada keputusan' || r.kumpulan === 'Tidak dinyatakan') {     // their drawings sit under 'no decision'
    const btn = document.getElementById('mpk-sub-pelan-tiada');
    if (btn && !btn.classList.contains('on')) mpkToggleSub('pelan', 'tiada');
  }
  map.flyTo({ center: r.c, zoom: 18.5 });
}

// Overview / Analysis inside the panel
function mpkSubTab(sub) {
  document.querySelectorAll('.mpk-subtabs button').forEach(b => {
    b.classList.toggle('active', b.dataset.sub === sub);
    b.setAttribute('aria-selected', String(b.dataset.sub === sub));
  });
  for (const k of ['overview', 'analysis']) {
    const el = document.getElementById('mpk-sub-' + k);
    if (el) el.hidden = sub !== k;
  }
}

function mpkSelectArea(area) {
  MPK.area = area;
  document.querySelectorAll('.mpk-chip').forEach(c => c.classList.toggle('active', c.dataset.area === area));
  const showKoridor = area === 'all' || area === 'bbc';
  document.getElementById('mpk-rizab-card').style.display = showKoridor ? '' : 'none';
  document.getElementById('mpk-hero-sub').textContent = {
    all: 'Teluk Kalong (inside the planning boundary) and the Binjai – Bandar Chukai corridor',
    tk: 'Teluk Kalong Industrial Area · buildings inside the planning boundary',
    bbc: 'Binjai – Bandar Chukai · buildings along the road corridor',
  }[area];
  if (MPK.bounds) map.fitBounds(MPK.bounds[area], { padding: 50, duration: 1200 });
  if (map) mpkApplyLayerVisibility();            // study-area outlines follow the chip
  mpkRender();
  if (MPK.wayback.on) {
    MPK.wayback.index = {};                    // lists differ per area: start each on its default
    mpkWaybackSource(MPK.wayback.src);
  }
  if (typeof mpkChangeAreaChanged === 'function') mpkChangeAreaChanged();
}

// Buildings of the selected area (the dataset only holds the marked areas)
function mpkAreaFeatures() {
  const all = MPK.data.buildings.features;
  return MPK.area === 'all' ? all : all.filter(f => f.properties.kawasan === MPK.area);
}

const mpkPct = v => (v > 0 && v < 1 ? '<1' : Math.round(v)) + '%';
const mpkM2 = v => (v >= 10000 ? (v / 10000).toLocaleString('en-MY', { maximumFractionDigits: 1 }) + ' ha'
  : mpkNum(v) + ' m²');

function mpkRender() {
  if (!MPK.data) return;
  const regList = document.getElementById('mpk-reg-list');
  if (regList && !regList.childElementCount) mpkRenderRegister();
  const s = mpkStats(MPK.data.buildings.features, MPK.settings, MPK.rates, MPK.area);
  const b = mpkBreakdown(mpkAreaFeatures(), MPK.settings).all;
  MPK.lastStats = s;
  MPK.lastBreakdown = b;
  document.getElementById('mpk-rizab-val').textContent = MPK.settings.rizab + ' m';
  // the total counts the outside buildings switched on as well (they have no status, so the shares stay on the study area)
  const out = mpkOutsideShown(), outM2 = out.reduce((a, f) => a + f.properties.area_m2, 0);
  MPK.lastOutside = { n: out.length, m2: outM2 };
  document.getElementById('mpk-k-total').textContent = mpkNum(b.total + out.length);
  document.getElementById('mpk-k-m2').innerHTML = mpkM2(b.m2 + outM2) + (out.length ? `<br><small class="mpk-k-out">incl. ${mpkNum(out.length)} outside</small>` : '');
  mpkSyncOutsideRows();
  document.getElementById('mpk-k-legal').textContent = mpkPct(b.byStatus.legal.pct);
  document.getElementById('mpk-k-illegal').textContent = mpkPct(b.byStatus.suspected.pct);
  const nb = n => mpkNum(n) + ' building' + (n === 1 ? '' : 's');
  document.getElementById('mpk-k-legal-n').textContent = nb(b.byStatus.legal.n);
  document.getElementById('mpk-k-illegal-n').textContent = nb(b.byStatus.suspected.n);
  mpkRenderFloatCard(b);
  document.getElementById('mpk-status-bar').innerHTML = Object.entries(MPK_STATUS)
    .map(([k, st]) => `<i style="width:${b.byStatus[k].pct}%;background:${st.color}" title="${st.label}: ${mpkNum(b.byStatus[k].n)}"></i>`).join('');
  Object.keys(MPK_STATUS).forEach(k => {
    const v = b.byStatus[k];
    document.getElementById('mpk-st-sub-' + k).textContent = `${mpkNum(v.n)} buildings · ${mpkM2(v.m2)}`;
    document.getElementById('mpk-st-pct-' + k).textContent = mpkPct(v.pct);
  });
  mpkRenderRevenue();

  const list = document.getElementById('mpk-list');
  if (!s.count) {
    list.innerHTML = '<div class="mpk-empty">No suspected buildings in this area.</div>';
  } else {
    // pages of LIST_SIZE; back to the first page when the area changes, kept in range when the count changes
    const size = MPK.LIST_SIZE, pages = Math.ceil(s.count / size);
    if (MPK.listArea !== MPK.area) { MPK.listArea = MPK.area; MPK.listPage = 0; }
    const pg = MPK.listPage = Math.min(Math.max(0, MPK.listPage || 0), pages - 1), from = pg * size;
    list.innerHTML = s.suspects.slice(from, from + size).map((f, i) => {
      const p = f.properties, j = MPK_JENIS[mpkJenis(p, MPK.settings)];
      return `<div class="mpk-item" onclick="mpkZoomTo(${p.id})">
        <span class="mpk-rank">${from + i + 1}</span>
        <i class="mpk-dot" style="background:${MPK_STATUS.suspected.color}"></i>
        <div class="mpk-item-main"><div class="mpk-pc">${p.plus_code}</div>
          <div class="mpk-meta">${MPK_AREAS[p.kawasan].short}${p.lot ? ' · Lot ' + p.lot : ''} · ${j.label}</div></div>
        <div class="mpk-area">${mpkNum(p.area_m2)} m²</div>
      </div>`;
    }).join('') + (pages > 1 ? mpkListPager(pg, pages, from, Math.min(from + size, s.count), s.count) : '');
  }
  if (MPK.page === 'stats') mpkRenderStats();
}

// Money the council could collect if the suspected buildings are regularised (estimate):
// one-off processing fee = m² × fee rate; assessment tax (Cukai Pintu) = m² × tax rate a year.
// `unverified` is the upper bound if every not-verified building also lacked approval.
function mpkRevenue(features, s, rates, years = 5) {
  const sum = list => {
    const m2 = list.reduce((a, p) => a + p.area_m2, 0), fee = m2 * rates.fee, tax = m2 * rates.cukai;
    return { n: list.length, m2, fee, tax, year1: fee + tax, multi: fee + tax * years };
  };
  const props = features.map(f => f.properties);
  const sus = props.filter(p => mpkJenis(p, s));
  return {
    years, suspected: sum(sus),
    byArea: Object.fromEntries(Object.keys(MPK_AREAS).map(k => [k, sum(sus.filter(p => p.kawasan === k))])),
    byType: Object.fromEntries(Object.keys(MPK_JENIS).map(k => [k, sum(sus.filter(p => mpkJenis(p, s) === k))])),
    unverified: sum(props.filter(p => mpkStatus(p, s) === 'unverified')),
  };
}

function mpkRenderRevenue() {
  const s = MPK.lastStats;
  if (!s) return;
  const fee = s.area * MPK.rates.fee, cukai = s.area * MPK.rates.cukai;
  document.getElementById('mpk-r-fee').textContent = mpkRM(fee);
  document.getElementById('mpk-r-cukai').textContent = mpkRM(cukai) + '/yr';
  document.getElementById('mpk-r-total').textContent = mpkRM(fee + cukai);
}

function mpkOnSetting(key, v) {
  MPK.settings = { ...MPK.settings, [key]: parseInt(v, 10) };
  mpkApplyBuildingFilters();
  mpkRender();
}

function mpkOnRate() {
  const read = id => { const v = parseFloat(document.getElementById(id).value); return isFinite(v) && v >= 0 ? v : 0; };
  MPK.rates = { fee: read('mpk-rate-fee'), cukai: read('mpk-rate-cukai') };
  mpkSaveRates();
  mpkRenderRevenue();
  mpkRenderStatsRevenue();
}

// Statistics page: rates edited there update the panel too, and the other way round
function mpkOnStatsRate() {
  const read = id => { const v = parseFloat(document.getElementById(id).value); return isFinite(v) && v >= 0 ? v : 0; };
  MPK.rates = { fee: read('mpk-srate-fee'), cukai: read('mpk-srate-cukai') };
  mpkSaveRates();
  const pf = document.getElementById('mpk-rate-fee'), pc = document.getElementById('mpk-rate-cukai');
  if (pf) pf.value = MPK.rates.fee;
  if (pc) pc.value = MPK.rates.cukai;
  mpkRenderRevenue();
  mpkRenderStatsRevenue();
}

// Keep the user's expanded sections when rates, areas or projections refresh.
function mpkRememberStatsSections() {
  const page = document.getElementById('mpk-stats-page');
  if (!page) return;
  MPK.statsSections = MPK.statsSections || {};
  page.querySelectorAll('details[data-stats-section]').forEach(d => { MPK.statsSections[d.dataset.statsSection] = d.open; });
}
const mpkStatsSectionAttrs = key => `id="mpk-stats-${key}" data-stats-section="${key}"${MPK.statsSections && MPK.statsSections[key] ? ' open' : ''}`;
function mpkSetStatsYears(years) {
  if (![1, 3, 5, 10].includes(years)) return;
  MPK.statsYears = years;
  mpkRenderStatsRevenue();
  const button = document.getElementById('mpk-stats-year-' + years);
  if (button) button.focus({ preventScroll: true });
}

// Short financial overview; detailed figures stay available on demand.
function mpkRenderStatsRevenue() {
  const el = document.getElementById('mpk-rev-body');
  if (!el || MPK.page !== 'stats') return;
  mpkRememberStatsSections();
  const years = [1, 3, 5, 10].includes(MPK.statsYears) ? MPK.statsYears : 5;
  const r = mpkRevenue(mpkAreaFeatures(), MPK.settings, MPK.rates, years), sp = r.suspected, yr = sp.tax;
  const loss = yr * years, maxProjection = Math.max(loss, sp.multi, 1);
  const bar = (v, max, cls) => `<i class="${cls}" style="width:${max ? Math.max(0, Math.min(v / max * 100, 100)) : 0}%"></i>`;
  const areas = Object.entries(r.byArea).filter(([, x]) => x.n), maxA = Math.max(...areas.map(([, x]) => x.tax), 1);
  const types = Object.entries(r.byType).filter(([, x]) => x.n), maxT = Math.max(...types.map(([, x]) => x.tax), 1);
  const top = mpkAreaFeatures().filter(f => mpkJenis(f.properties, MPK.settings))
    .sort((a, b) => b.properties.area_m2 - a.properties.area_m2).slice(0, 10);
  const maxTop = top.length ? top[0].properties.area_m2 * MPK.rates.cukai : 1;
  el.innerHTML = `
    <section class="mpk-impact" aria-labelledby="mpk-impact-title">
      <div class="mpk-impact-heading"><h3 id="mpk-impact-title">Revenue impact <span class="mpk-estimate">Estimate</span></h3><span>${mpkNum(sp.n)} illegal buildings · ${mpkNum(sp.m2)} m²</span></div>
      <div class="mpk-impact-metrics">
        <div class="mpk-impact-metric loss"><span>Uncollected tax / year</span><strong>${mpkRM(yr)}</strong><small>${mpkRM(yr / 12)} / month</small></div>
        <div class="mpk-impact-metric gain"><span>Potential first-year revenue</span><strong>${mpkRM(sp.year1)}</strong><small>Tax + one-off fees, if approved</small></div>
      </div>
      ${sp.n ? `<div class="mpk-projection">
        <div class="mpk-projection-head"><h4>Over ${years} year${years === 1 ? '' : 's'}</h4>
          <div class="mpk-year-options" role="group" aria-label="Projection period">${[1, 3, 5, 10].map(y => `<button type="button" id="mpk-stats-year-${y}" aria-pressed="${years === y}" onclick="mpkSetStatsYears(${y})">${y} yr${y === 1 ? '' : 's'}</button>`).join('')}</div>
        </div>
        <div class="mpk-projection-chart" aria-live="polite">
          <div class="mpk-projection-row loss"><div><span>Uncollected tax</span><b>${mpkRM(loss)}</b></div><div class="mpk-projection-track" aria-hidden="true">${bar(loss, maxProjection, 'loss')}</div></div>
          <div class="mpk-projection-row gain"><div><span>Revenue if approved</span><b>${mpkRM(sp.multi)}</b></div><div class="mpk-projection-track" aria-hidden="true">${bar(sp.multi, maxProjection, 'gain')}</div></div>
        </div>
      </div>` : '<div class="mpk-stats-empty">No illegal buildings in this area.</div>'}
    </section>

    <details class="mpk-stats-disclosure" ${mpkStatsSectionAttrs('breakdown')}>
      <summary>Revenue breakdown</summary>
      <div class="mpk-disclosure-body"><div class="mpk-stats-grid">
      <section class="mpk-stats-card">
        <h3>By area <small>tax / year</small></h3>
        ${areas.length ? areas.map(([k, x]) => `<div class="mpk-lg-row wide"><span>${MPK_AREAS[k].short}<small>${mpkNum(x.n)} building${x.n === 1 ? '' : 's'}</small></span>
          <div class="mpk-lg-bar">${bar(x.tax, maxA, 'loss')}</div><b>${mpkRM(x.tax)}</b></div>`).join('') : '<p class="mpk-stats-empty">No flagged buildings.</p>'}
      </section>
      <section class="mpk-stats-card">
        <h3>By reason <small>tax / year</small></h3>
        ${types.length ? types.map(([k, x]) => `<div class="mpk-lg-row wide"><span>${MPK_JENIS[k].label}<small>${mpkNum(x.n)} building${x.n === 1 ? '' : 's'}</small></span>
          <div class="mpk-lg-bar">${bar(x.tax, maxT, 'loss')}</div><b>${mpkRM(x.tax)}</b></div>`).join('') : '<p class="mpk-stats-empty">No flagged buildings.</p>'}
      </section></div>
      <div class="mpk-stats-fee"><span>One-off processing fees</span><b>${mpkRM(sp.fee)}</b></div>
      ${r.unverified.n ? `<p class="mpk-lg-note">${mpkNum(r.unverified.n)} pending buildings are excluded. Potential additional tax if all lack approval: <b>${mpkRM(r.unverified.tax)} / year</b>.</p>` : ''}
      </div>
    </details>

    <details class="mpk-stats-disclosure" ${mpkStatsSectionAttrs('priority')}>
      <summary>Priority buildings <span>Top ${top.length}</span></summary>
      <div class="mpk-disclosure-body"><div class="mpk-top">${top.length ? top.map((f, i) => { const p = f.properties, loss = p.area_m2 * MPK.rates.cukai;
        return `<div class="mpk-top-row"><span class="mpk-top-n">${i + 1}</span>
          <div class="mpk-top-t"><b>${mpkEscHtml(p.plus_code)}</b><small>${MPK_AREAS[p.kawasan].short} · ${mpkNum(p.area_m2)} m²</small></div>
          <div class="mpk-lg-bar">${bar(loss, maxTop, 'loss')}</div>
          <b class="mpk-top-v">${mpkRM(loss)}<small>/ year</small></b>
          <button type="button" class="mpk-link" aria-label="View ${mpkEscHtml(p.plus_code)} on map" onclick="mpkShowPage('dashboard');mpkZoomTo(${p.id})">View map</button></div>`; }).join('') : '<p class="mpk-stats-empty">No priority buildings.</p>'}</div></div>
    </details>`;
}

// ---------- Map interaction ----------
function mpkStatusText(p, jenis) {
  if (jenis) return 'Illegal building · ' + MPK_JENIS[jenis].label;
  if (p.kategori === 'lulus') return p.edit_status ? 'Legal · approved by an MPK officer' : 'Legal · MPK-approved building plan';
  if (p.kategori === 'manual_pending') return 'Pending · set by an MPK officer';
  if (p.kategori === 'tiada_pelan') return 'Pending · no approved building plan on record';
  if (p.kategori === 'luar') return 'Pending · outside the planning boundary';
  if (p.kawasan === 'tk') return 'Pending · inside the boundary, no approved building plan on record';
  return 'Pending · in corridor, no approval record';
}

function mpkZoneLabel(zone) {
  if (!zone) return 'not mapped';
  const z = MPK_ZONES[zone.properties.zone];
  return (z ? z.label : zone.properties.zone) + (zone.properties.name ? ' · ' + zone.properties.name : '');
}

function mpkShowZonePopup(zone, lngLat) {
  const z = MPK_ZONES[zone.zone] || { label: zone.zone, color: '#9E9E9E' };
  const html = `
    <div class="popup-header" style="background:${z.color}">
      <div class="popup-fc">Land use · OpenStreetMap (not official RTD zoning)</div>
      <div class="popup-name">${zone.name || z.label}</div>
    </div>
    <div class="popup-body">
      <div class="popup-row"><span class="popup-k">Class</span><span class="popup-v">${z.label}</span></div>
      <div class="popup-row"><span class="popup-k">OSM tag</span><span class="popup-v">landuse=${zone.osm}</span></div>
    </div>`;
  if (MPK.popup) MPK.popup.remove();
  MPK.popup = new maplibregl.Popup({ maxWidth: '290px', focusAfterOpen: false }).setLngLat(lngLat).setHTML(html).addTo(map);
}

function mpkShowPopup(p, lngLat) {
  if (typeof MPK_EDIT !== 'undefined') { MPK_EDIT.lngLat = lngLat; p = (mpkEditFeature(p.id) || { properties: p }).properties; }
  const jenis = mpkJenis(p, MPK.settings);
  const tools = typeof mpkEditHeader === 'function';
  const row = (k, v) => `<div class="popup-row"><span class="popup-k">${k}</span><span class="popup-v">${v}</span></div>`;
  const html = `
    <div class="popup-header" style="background:${MPK_STATUS[mpkStatus(p, MPK.settings)].color}">
      ${tools ? mpkEditHeader(p, true) : `<div class="popup-fc">${mpkStatusText(p, jenis)}</div>`}
      <div class="popup-name">${p.plus_code}</div>
    </div>
    <div class="popup-body">
      ${tools && mpkEditing(p.id) ? mpkEditFormHTML(p) : mpkPopupFull(p, { area: MPK_AREAS[p.kawasan].short, money: true, jenis })}
      ${tools ? mpkEditHistoryHTML(p) : ''}
      ${typeof mpkDaftarPopupHTML === 'function' ? mpkDaftarPopupHTML(p) : ''}
    </div>`;
  if (MPK.popup) MPK.popup.remove();
  // focusAfterOpen off: otherwise the Enter that picked a search result also "presses" the
  // popup's freshly focused close button and shuts it straight away
  MPK.popup = new maplibregl.Popup({ maxWidth: '290px', focusAfterOpen: false }).setLngLat(lngLat).setHTML(html).addTo(map);
}

// Where a footprint comes from: drawn by hand on Esri imagery, or detected by Google's model
const mpkSourceLabel = p => p.sumber === 'manual_esri_20260924' ? 'Manual · Esri 24 Sep 2026'
  : 'Google Open Buildings (AI, ' + Math.round((p.confidence || 0) * 100) + '% confidence)';
const mpkEscHtml = t => String(t == null ? '' : t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// '2009-09-30' -> '30 Sep 2009' (dates outside 1950–2100 in the register are shown as given)
function mpkPlanDateLabel(d) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d || '');
  return m && +m[1] >= 1950 && +m[1] <= 2100 ? mpkDayLabel(m[0]) : String(d || '');
}

// An approved building plan (from MPK's register) where no building stands under the click
function mpkShowPlanPopup(p, lngLat) {
  const row = (k, v) => v ? `<div class="popup-row"><span class="popup-k">${k}</span><span class="popup-v">${v}</span></div>` : '';
  const html = `
    <div class="popup-header" style="background:${p.keputusan === 'tolak' ? '#D50000' : p.keputusan === 'tiada' ? '#78909C' : p.bangunan ? '#00695C' : '#7E57C2'}">
      <div class="popup-fc">${p.keputusan === 'tolak' ? 'Rejected building plan (TOLAK) · MPK' : p.keputusan === 'tiada' ? 'Plan drawing · no decision recorded' : 'Approved building plan · MPK' + (p.bangunan ? '' : ' · no building found on it')}</div>
      <div class="popup-name">${mpkEscHtml(p.fail || 'No file number')}</div>
    </div>
    <div class="popup-body">
      ${row('Lot', mpkEscHtml(p.lot))}
      ${row('Register', mpkEscHtml(p.sumber === 'Kedai' ? 'Shops (Pelan Bangunan Kedai)' : 'Teluk Kalong'))}
      ${p.keputusan === 'tiada' ? row('Status in the register', mpkEscHtml(p.status || 'blank')) : row(p.keputusan === 'tolak' ? 'Decided on' : 'Approved on', mpkPlanDateLabel(p.tarikh))}
      ${row('Status', mpkEscHtml(p.status))}
      ${row('Building', mpkEscHtml(p.jenis))}
      ${p.luas ? row('Floor area (plan)', mpkNum(p.luas) + ' m²') : ''}
    </div>`;
  if (MPK.popup) MPK.popup.remove();
  MPK.popup = new maplibregl.Popup({ maxWidth: '300px', focusAfterOpen: false }).setLngLat(lngLat).setHTML(html).addTo(map);
}

// One record of the Teluk Kalong register (a point at its centre)
const MPK_REKOD_ISSUE = { tiada_koordinat: 'no coordinates', koordinat_tidak_munasabah: 'impossible coordinates',
  luar_teluk_kalong: 'outside the Teluk Kalong area', tiada_dalam_geojson_lulus: 'valid status, missing from the approved plans',
  status_salah_medan: 'the status field holds another field' };
function mpkShowRekodPopup(p, lngLat) {
  const row = (k, v) => v ? `<div class="popup-row"><span class="popup-k">${k}</span><span class="popup-v">${v}</span></div>` : '';
  const valid = p.k !== 'tiada';
  const issues = String(p.u || '').split(';').filter(Boolean).map(x => MPK_REKOD_ISSUE[x] || x);
  const html = `
    <div class="popup-header" style="background:${p.k === 'tiada' ? '#607D8B' : p.k === 'syarat' ? '#B26A00' : MPK_REKOD_COLOR[p.k]}">
      <div class="popup-fc">Plan record #${mpkEscHtml(p.i)} · Teluk Kalong register</div>
      <div class="popup-name">${mpkEscHtml(p.f || 'No file number')}</div>
    </div>
    <div class="popup-body">
      ${row('Status', mpkEscHtml(valid ? p.c : 'No valid status (' + String(p.c).toLowerCase() + ')'))}
      ${row('As written', mpkEscHtml(p.s))}
      ${row('Lot', mpkEscHtml(p.l))}
      ${row('Applicant', mpkEscHtml(p.p))}
      ${row('Building', mpkEscHtml(p.j))}
      ${p.t ? row('Approved on', mpkPlanDateLabel(p.t)) : ''}
      ${row('CAD piece', mpkEscHtml(p.g) + (p.a ? ' · ' + mpkNum(p.a) + ' m²' : ''))}
      ${row('Area', p.d ? 'Teluk Kalong' : 'Outside Teluk Kalong')}
      ${issues.length ? row('Data issues', mpkEscHtml(issues.join(', '))) : ''}
    </div>`;
  if (MPK.popup) MPK.popup.remove();
  MPK.popup = new maplibregl.Popup({ maxWidth: '300px', focusAfterOpen: false }).setLngLat(lngLat).setHTML(html).addTo(map);
}

// A hand-drawn footprint outside the study areas: facts only, no legal status
function mpkShowOtherPopup(p, lngLat) {
  if (typeof MPK_EDIT !== 'undefined') { MPK_EDIT.lngLat = lngLat; p = (mpkEditFeature(p.id) || { properties: p }).properties; }
  const tools = typeof mpkEditHeader === 'function';
  const row = (k, v) => `<div class="popup-row"><span class="popup-k">${k}</span><span class="popup-v">${v}</span></div>`;
  const zone = MPK.data.landuse ? mpkZoneLabel(mpkZoneAt(p.lng, p.lat, MPK.data.landuse.features)) : null;
  const html = `
    <div class="popup-header" style="background:${(MPK_DEKAT[p.dekat] || MPK_DEKAT.tk).outline}">
      ${tools ? mpkEditHeader(p, false) : ''}
      <div class="popup-fc">${(MPK_DEKAT[p.dekat] || MPK_DEKAT.tk).label} · no status</div>
      <div class="popup-name">${mpkEscHtml(p.plus_code)}</div>
    </div>
    <div class="popup-body">
      ${tools && mpkEditing(p.id) ? mpkEditFormHTML(p) : mpkPopupFull(p, { area: (MPK_DEKAT[p.dekat] || MPK_DEKAT.tk).label, zone, money: false })}
      ${tools ? mpkEditHistoryHTML(p) : ''}
    </div>`;
  if (MPK.popup) MPK.popup.remove();
  MPK.popup = new maplibregl.Popup({ maxWidth: '290px', focusAfterOpen: false }).setLngLat(lngLat).setHTML(html).addTo(map);
}

// Every building's popup lists the same details, grouped; a detail the records do not have says so
// instead of leaving the row out (the most complete building shows every row filled)
function mpkPopupFull(p, o) {
  const na = t => `<span class="popup-na">${t || 'No record'}</span>`;
  const row = (k, v) => `<div class="popup-row"><span class="popup-k">${k}</span><span class="popup-v">${v}</span></div>`;
  const sec = t => `<div class="popup-sec">${t}</div>`;
  const esc = mpkEscHtml;
  const zone = o.zone !== undefined ? o.zone : (MPK.data.landuse ? mpkZoneLabel(mpkZoneAt(p.lng, p.lat, MPK.data.landuse.features)) : null);
  const rejected = /TOLAK/i.test(p.pelan_status || '');
  const hasPlan = !!(p.pelan_fail || p.pelan_status);
  const regShown = p.rekod_id && !p.pelan_fail;
  const st = p.kawasan ? mpkStatus(p, MPK.settings) : null;
  const money = v => o.jenis ? mpkRM(v) : na(st === 'legal' ? 'Not applicable · approved' : st ? 'Only for illegal buildings' : 'Not applicable · no status');
  return [
    sec('Location'),
    row('Area', esc(o.area)),
    row('Land use (OSM)', zone && zone !== 'not mapped' ? zone : na('Not mapped')),
    row('Lot no.', p.lot ? esc(p.lot) : na('No cadastral lot')),
    row('UPI', p.upi ? esc(p.upi) : na()),
    row('Distance from road centreline', p.kawasan === 'bbc' ? (p.jarak_jalan_m == null ? na('No road data') : p.jarak_jalan_m + ' m') : na('Not in the corridor')),
    sec('Building'),
    row('Footprint area', mpkNum(p.area_m2) + ' m²'),
    row('Height · floors', p.tinggi_m ? `${p.tinggi_m} m · ${p.tingkat_est} floor${p.tingkat_est > 1 ? 's' : ''}` : na()),
    row('Footprint source', mpkSourceLabel(p)),
    sec('Building plan'),
    row(rejected ? 'Rejected plan' : 'Plan on record', hasPlan ? esc(p.pelan_fail || '—') + (p.pelan_n > 1 ? ` (+${p.pelan_n - 1} more)` : '') : na('No plan on record')),
    row(rejected ? 'Decided on' : 'Approved on', p.pelan_tarikh ? mpkPlanDateLabel(p.pelan_tarikh) + (p.pelan_status ? ' · ' + esc(p.pelan_status) : '') : na()),
    row('Plan building type', p.pelan_jenis ? esc(p.pelan_jenis) : na()),
    row('Register', p.pelan_sumber ? esc(MPK_PLAN_REGISTER[p.pelan_sumber] || 'Teluk Kalong') : na()),
    sec('Register records'),
    row('Records on this building', p.rekod_n ? mpkNum(p.rekod_n) + (p.rekod_sah ? ` · ${mpkNum(p.rekod_sah)} with a status` : ' · none with a status') : na('None')),
    row('Record', regShown ? `#${esc(p.rekod_id)} · ` + ([p.rekod_fail, p.rekod_pemohon].filter(Boolean).map(esc).join(' · ') || '—') : na(p.rekod_id ? 'Shown under Building plan' : 'None')),
    row('Building (register)', regShown && p.rekod_jenis ? esc(p.rekod_jenis) : na()),
    row('Status (register)', regShown && p.rekod_status ? esc(p.rekod_status) + (p.rekod_tarikh ? ' · ' + mpkPlanDateLabel(p.rekod_tarikh) : '') : na()),
    row('Note', p.catatan ? esc(p.catatan) : na('None')),
    ...(o.money ? [sec('Estimated revenue'),
      row('Est. processing fee', money(p.area_m2 * MPK.rates.fee)),
      row('Est. assessment tax', o.jenis ? mpkRM(p.area_m2 * MPK.rates.cukai) + '/yr' : money(0))] : []),
  ].join('');
}

// Popup rows for the building plan on record (approved or rejected), if any
function mpkPlanRows(p, row) {
  return mpkPlanOnRecord(p, row) + mpkRekodRows(p, row);
}
const MPK_PLAN_REGISTER = { Kedai: 'Shops (Pelan Bangunan Kedai)', Rekod: 'Teluk Kalong · register record' };
function mpkPlanOnRecord(p, row) {
  if (!p.pelan_fail && !p.pelan_status) return '';
  const rejected = /TOLAK/i.test(p.pelan_status || '');
  return [
    row(rejected ? 'Rejected plan' : 'Approved plan', mpkEscHtml(p.pelan_fail || '—') + (p.pelan_n > 1 ? ` (+${p.pelan_n - 1} more)` : '')),
    p.pelan_tarikh ? row(rejected ? 'Decided on' : 'Approved on', mpkPlanDateLabel(p.pelan_tarikh) + (p.pelan_status ? ' · ' + mpkEscHtml(p.pelan_status) : '')) : '',
    p.pelan_jenis ? row('Plan building type', mpkEscHtml(p.pelan_jenis)) : '',
    p.pelan_sumber ? row('Register', mpkEscHtml(MPK_PLAN_REGISTER[p.pelan_sumber] || 'Teluk Kalong')) : '',
  ].join('');
}
// The Teluk Kalong register's records whose centre lies on this building (tools/apply_pelan_lulus.py)
function mpkRekodRows(p, row) {
  if (!p.rekod_n) return '';
  const who = [p.rekod_fail, p.rekod_pemohon].filter(Boolean).map(mpkEscHtml).join(' · ');
  return [
    row('Register records here', mpkNum(p.rekod_n) + (p.rekod_sah ? ` · ${mpkNum(p.rekod_sah)} with a status` : ' · none with a status')),
    p.rekod_id && !p.pelan_fail ? row('Record #' + mpkEscHtml(p.rekod_id), who || '—') : '',
    p.rekod_id && !p.pelan_fail && p.rekod_jenis ? row('Building (register)', mpkEscHtml(p.rekod_jenis)) : '',
    p.rekod_id && !p.pelan_fail && p.rekod_status ? row('Status (register)', mpkEscHtml(p.rekod_status)
      + (p.rekod_tarikh ? ' · ' + mpkPlanDateLabel(p.rekod_tarikh) : '')) : '',
  ].join('');
}

// Pager under the list of suspected buildings: previous / page numbers (with gaps) / next
function mpkListPager(pg, pages, from, to, count) {
  const nums = [...new Set([0, pg - 1, pg, pg + 1, pages - 1])].filter(n => n >= 0 && n < pages).sort((a, b) => a - b);
  let btns = '', prev = -1;
  for (const n of nums) {
    if (n - prev > 1) btns += '<span class="mpk-pg-gap">…</span>';
    btns += `<button type="button" class="mpk-pg-n${n === pg ? ' on' : ''}" onclick="mpkListGo(${n})"${n === pg ? ' aria-current="page"' : ''}>${n + 1}</button>`;
    prev = n;
  }
  return `<nav class="mpk-pager" aria-label="Pages of suspected buildings">
    <div class="mpk-pg-info">${mpkNum(from + 1)}–${mpkNum(to)} of ${mpkNum(count)}</div>
    <div class="mpk-pg-btns">
      <button type="button" class="mpk-pg-n" onclick="mpkListGo(${pg - 1})" ${pg === 0 ? 'disabled' : ''} aria-label="Previous page">‹</button>
      ${btns}
      <button type="button" class="mpk-pg-n" onclick="mpkListGo(${pg + 1})" ${pg === pages - 1 ? 'disabled' : ''} aria-label="Next page">›</button>
    </div></nav>`;
}
function mpkListGo(n) {
  MPK.listPage = n;
  mpkRender();
  const list = document.getElementById('mpk-list');
  if (list) list.scrollTop = 0;
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
  if (!s || !s.count) { showToast('⚠️ No suspected buildings to export'); return; }
  const blob = new Blob(['﻿' + mpkCSV(s.suspects, MPK.rates, MPK.settings)], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'mpk_suspected_buildings_' + (MPK_CSV_AREA[MPK.area] || 'all_areas') + '.csv';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  showToast('📄 ' + mpkNum(s.count) + ' suspected buildings exported');
  addActivityLog('MPK CSV export', mpkNum(s.count) + ' buildings · ' + (MPK_AREAS[MPK.area]?.short || 'All areas'));
}

// ---------- Statistics page (sidebar: Dashboard / Statistics, MPK mode) ----------
// Sidebar entry under "Dashboard" and the page itself (over the map area)
function mpkBuildStatsPage() {
  if (!document.getElementById('mpk-nav-stats')) {
    const dash = document.querySelector('.sidebar-section .nav-item.active');
    const nav = document.createElement('a');
    nav.href = '#';
    nav.className = 'nav-item mpk-nav';
    nav.id = 'mpk-nav-stats';
    nav.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="20" x2="18" y2="10"/>'
      + '<line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>Statistics';
    nav.addEventListener('click', e => { e.preventDefault(); mpkShowPage('stats'); });
    dash.after(nav);
    dash.id = dash.id || 'mpk-nav-dash';
    dash.addEventListener('click', e => { if (MPK.active) { e.preventDefault(); mpkShowPage('dashboard'); } });
  }
  if (!document.getElementById('mpk-stats-page')) {
    const page = document.createElement('section');
    page.id = 'mpk-stats-page';
    page.className = 'mpk-stats-page';
    page.hidden = true;
    page.setAttribute('aria-label', 'Statistics');
    document.getElementById('mapWrapper').appendChild(page);
  }
}

// Floating status card on the dashboard map: exact shares and counts for the selected area; folds to a pill
function mpkBuildFloatCard() {
  if (document.getElementById('mpk-float')) return;
  let closed = false;
  try { closed = localStorage.getItem('mpk_float_closed') === '1'; } catch (e) {}
  const box = document.createElement('div');
  box.id = 'mpk-float';
  box.className = 'mpk-float' + (closed ? ' closed' : '');
  box.innerHTML = `
    <div class="mpk-float-card" role="region" aria-label="Building status">
      <div class="mpk-float-head"><span id="mpk-float-area">All study areas</span>
        <button type="button" class="mpk-float-x" onclick="mpkToggleFloatCard(true)" aria-label="Close status card" title="Close">×</button></div>
      <div class="mpk-float-tiles">
        ${[['legal', 'Approved buildings'], ['suspected', 'Illegal buildings'], ['unverified', 'Pending buildings']].map(([k, l]) =>
          `<div class="mpk-float-tile ${k}"><div class="v" id="mpk-float-v-${k}">—</div><div class="l">${l}</div>
            <div class="n" id="mpk-float-n-${k}">—</div></div>`).join('')}
      </div>
    </div>
    <button type="button" class="mpk-float-pill" onclick="mpkToggleFloatCard(false)" aria-label="Open status card">
      <i style="background:#00C853"></i><i style="background:#FF1744"></i><i style="background:#2962FF"></i>Building status</button>`;
  document.getElementById('mapWrapper').appendChild(box);
}
function mpkToggleFloatCard(close) {
  const box = document.getElementById('mpk-float');
  if (!box) return;
  box.classList.toggle('closed', close);
  try { localStorage.setItem('mpk_float_closed', close ? '1' : '0'); } catch (e) {}
}
function mpkRenderFloatCard(b) {
  if (!document.getElementById('mpk-float')) return;
  const out = MPK.lastOutside && MPK.lastOutside.n;
  document.getElementById('mpk-float-area').textContent =
    (MPK_AREAS[MPK.area] ? MPK_AREAS[MPK.area].short : 'All study areas') + ' · ' + mpkNum(b.total + (out || 0)) + ' buildings'
    + (out ? ` (${mpkNum(out)} outside, no status)` : '');
  for (const k of ['legal', 'suspected', 'unverified']) {
    document.getElementById('mpk-float-v-' + k).textContent = mpkStatPct(b.byStatus[k], b.total);
    document.getElementById('mpk-float-n-' + k).innerHTML = mpkStatCount(b.byStatus[k], b.total);
  }
}

function mpkShowPage(page) {
  MPK.page = page;
  const fl = document.getElementById('mpk-float');
  if (fl) fl.hidden = page !== 'dashboard';
  const feat = document.getElementById('mpk-feat-page'), featNav = document.getElementById('mpk-nav-feat');
  const daftar = document.getElementById('mpk-daftar-page'), daftarNav = document.getElementById('mpk-nav-daftar');
  document.getElementById('mpk-nav-stats').classList.toggle('active', page === 'stats');
  if (featNav) featNav.classList.toggle('active', page === 'features');
  if (daftarNav) daftarNav.classList.toggle('active', page === 'daftar');
  if (daftar) daftar.hidden = page !== 'daftar';
  document.querySelector('.sidebar-section .nav-item:not(.mpk-nav)').classList.toggle('active', page === 'dashboard');
  document.getElementById('mpk-stats-page').hidden = page !== 'stats';
  if (feat) feat.hidden = page !== 'features';
  if (page !== 'dashboard' && typeof mpkFeatStop === 'function' && MPK_FEAT.key) mpkFeatStop();
  if (page === 'stats') mpkRenderStats();
  else if (page === 'daftar') mpkDaftarRenderList();
  else if (map) map.resize();
}

// A status share to one decimal, and the count behind it: '19.6%' · '385 of 1,969 buildings'
const mpkStatPct = (v, total) => (total ? (100 * v.n / total).toFixed(1) : '0.0') + '%';
const mpkStatCount = (v, total) => `<b>${mpkNum(v.n)}</b> of ${mpkNum(total)} buildings`;

function mpkRenderStats() {
  const el = document.getElementById('mpk-stats-page');
  mpkRememberStatsSections();
  const area = MPK.area, s = MPK.settings;
  const all = mpkBreakdown(MPK.data.buildings.features, s), b = all[area === 'all' ? 'all' : area];
  const chips = [['all', 'All areas'], ...Object.entries(MPK_AREAS).map(([k, a]) => [k, a.short])]
    .map(([k, label]) => `<button type="button" class="mpk-chip${k === area ? ' active' : ''}" aria-pressed="${k === area}" onclick="mpkSelectArea('${k}')">${label}</button>`).join('');
  const st = MPK_STATUS;
  // donut: status shares as conic-gradient segments with a 2px surface gap between them
  let at = 0;
  const segs = Object.entries(st).filter(([k]) => b.byStatus[k].n).map(([k, v]) => {
    const from = at, to = at + b.byStatus[k].pct;
    at = to;
    return `${v.color} ${from}% calc(${to}% - 0.4%), #fff calc(${to}% - 0.4%) ${to}%`;
  }).join(',');
  const legendRows = Object.entries(st).map(([k, v]) => `<tr>
      <td><span class="mpk-st-cell"><i class="sw" style="background:${v.color}"></i>${v.label}</span></td>
      <td class="num">${mpkNum(b.byStatus[k].n)}</td><td class="num">${mpkPct(b.byStatus[k].pct)}</td>
      <td class="num">${mpkNum(b.byStatus[k].m2)}</td></tr>`).join('');
  const areaRows = [...Object.entries(MPK_AREAS).map(([k, a]) => [k, a.name]), ['all', 'All areas']].map(([k, name]) => {
    const r = all[k];
    return `<tr class="${k === 'all' ? 'total' : ''}${k === area ? ' current' : ''}">
      <td>${name}</td><td class="num">${mpkNum(r.total)}</td><td class="num">${mpkNum(r.m2)}</td>
      ${Object.keys(st).map(sk => `<td class="num">${mpkNum(r.byStatus[sk].n)} <small>${mpkPct(r.byStatus[sk].pct)}</small></td>`).join('')}
    </tr>`;
  }).join('');
  const maxN = Math.max(1, ...b.sizes.map(c => c.n));
  const sizeRows = b.sizes.map(c => `<div class="mpk-size-row">
      <div class="mpk-size-label">${c.label}</div>
      <div class="mpk-size-bar" style="width:${c.n / maxN * 100}%">
        ${Object.entries(st).map(([k, v]) => c.byStatus[k]
          ? `<i style="flex:${c.byStatus[k]};background:${v.color}" title="${v.label}: ${mpkNum(c.byStatus[k])}"></i>` : '').join('')}
      </div>
      <div class="mpk-size-n">${mpkNum(c.n)}</div>
    </div>`).join('');
  const largest = mpkAreaFeatures().slice().sort((x, y) => y.properties.area_m2 - x.properties.area_m2).slice(0, 15)
    .map((f, i) => {
      const p = f.properties, k = mpkStatus(p, s);
      return `<tr><td class="num">${i + 1}</td><td>${p.plus_code}</td><td>${MPK_AREAS[p.kawasan].short}</td>
        <td><span class="mpk-badge" style="--c:${st[k].color}">${st[k].label}</span></td>
        <td>${p.lot || '—'}</td><td class="num">${mpkNum(p.area_m2)}</td>
        <td><button class="mpk-link" onclick="mpkShowPage('dashboard');mpkZoomTo(${p.id})">View</button></td></tr>`;
    }).join('');

  el.innerHTML = `
    <div class="mpk-stats-inner">
      <header class="mpk-stats-head">
        <div><h2>Statistics</h2></div>
        <div class="mpk-stats-actions">
          <button class="mpk-btn" onclick="mpkExportReport()">Export PDF</button>
          <button class="mpk-wb-btn" onclick="mpkExportAllCSV()">Export CSV</button>
        </div>
      </header>
      <div class="mpk-chips" role="group" aria-label="Statistics area">${chips}</div>

      <div class="mpk-simple-cards">
        <div class="mpk-stat"><div class="l">Total buildings</div><div class="v">${mpkNum(b.total)}</div><div class="mpk-stat-track" aria-hidden="true">${Object.entries(st).map(([k, v]) => `<i style="width:${b.byStatus[k].pct}%;background:${v.color}"></i>`).join('')}</div></div>
        ${[['legal', 'Approved', 'legal'], ['suspected', 'Illegal', 'danger'], ['unverified', 'Pending', 'pending']].map(([k, label, cls]) => `<div class="mpk-stat ${cls}"><div class="l">${label}</div><div class="mpk-stat-number"><div class="v">${mpkNum(b.byStatus[k].n)}</div><span>${mpkStatPct(b.byStatus[k], b.total)}</span></div><div class="mpk-stat-track" aria-hidden="true"><i style="width:${b.byStatus[k].pct}%;background:${st[k].color}"></i></div></div>`).join('')}
      </div>

      <div id="mpk-rev-body"></div>

      <details class="mpk-stats-disclosure mpk-how" ${mpkStatsSectionAttrs('rates')}>
        <summary>Rates &amp; calculation</summary>
        <div class="mpk-disclosure-body">
        <div class="mpk-rev-rates">
          <label>Processing fee<small>RM / m², one-off</small><input type="number" id="mpk-srate-fee" min="0" step="0.1" value="${MPK.rates.fee}" oninput="mpkOnStatsRate()"></label>
          <label>Assessment tax<small>RM / m² / year</small><input type="number" id="mpk-srate-cukai" min="0" step="0.1" value="${MPK.rates.cukai}" oninput="mpkOnStatsRate()"></label>
        </div>
        <p>Uncollected tax / year = flagged footprint area × tax rate. Potential revenue = tax × selected years + one-off fees.</p>
        <p>Estimates assume all flagged buildings can be approved. Pending buildings are excluded; rates stay constant.</p>
        </div>
      </details>

      <details class="mpk-stats-disclosure" ${mpkStatsSectionAttrs('buildings')}>
        <summary>Building details</summary>
      <div class="mpk-disclosure-body">
      <div class="mpk-stats-grid">
        <section class="mpk-stats-card">
          <h3>Building status</h3>
          <div class="mpk-donut-wrap">
            <div class="mpk-donut" role="img" aria-label="Share of buildings by status"
              style="background:conic-gradient(${segs || '#eee 0 100%'})"><span>${mpkNum(b.total)}<small>buildings</small></span></div>
            <table class="mpk-table"><thead><tr><th>Status</th><th class="num">Buildings</th><th class="num">Share</th>
              <th class="num">m²</th></tr></thead><tbody>${legendRows}</tbody></table>
          </div>
        </section>

        <section class="mpk-stats-card">
          <h3>Building size</h3>
          <div class="mpk-size">${sizeRows}</div>
          <div class="mpk-size-key">${Object.values(st).map(v => `<span><i style="background:${v.color}"></i>${v.label}</span>`).join('')}</div>
        </section>
      </div>

      <section class="mpk-stats-card">
        <h3>By area</h3>
        <table class="mpk-table"><thead><tr><th>Area</th><th class="num">Buildings</th><th class="num">Footprint m²</th>
          ${Object.values(st).map(v => `<th class="num">${v.label}</th>`).join('')}</tr></thead><tbody>${areaRows}</tbody></table>
      </section>

      <section class="mpk-stats-card">
        <h3>Largest buildings · ${area === 'all' ? 'all areas' : MPK_AREAS[area].short}</h3>
        <table class="mpk-table"><thead><tr><th class="num">#</th><th>Plus Code</th><th>Area</th><th>Status</th><th>Lot</th>
          <th class="num">m²</th><th></th></tr></thead><tbody>${largest}</tbody></table>
      </section>
      </div>
      </details>
    </div>`;
  mpkRenderStatsRevenue();
}

function mpkExportAllCSV() {
  const feats = mpkAreaFeatures();
  const blob = new Blob(['﻿' + mpkCSVAll(feats, MPK.settings)], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'mpk_buildings_' + (MPK_CSV_AREA[MPK.area] || 'all_areas') + '.csv';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  showToast('📄 ' + mpkNum(feats.length) + ' buildings exported');
}

// ---------- Historical imagery: one satellite per tab ----------
// views = what that satellite's archive supports; data = key in MPK.data
const MPK_SATELLITES = {
  esri:    { label: 'Esri Wayback', data: 'wayback', views: [['image', 'By image']],
             thumb: '🏙️', short: 'High-res ~30 cm · 2007 →',
             info: 'Esri World Imagery Wayback · ~30 cm · buildings visible · a few images since 2007' },
  s2:      { label: 'Sentinel-2', data: 'sentinel', views: [['year', 'By year'], ['month', 'By month']],
             thumb: '🛰️', short: '10 m · 2016 → · year / month',
             info: 'ESA Sentinel-2 · 10 m · every ~5 days since 2016 · least-cloudy image shown' },
  landsat: { label: 'Landsat', data: 'landsat', views: [['year', 'By year'], ['month', 'By month']],
             thumb: '🌐', short: '30 m · 2000 → · year / month',
             info: 'NASA/USGS Landsat 5–9 · 30 m · every ~8–16 days since 2000 · least-cloudy image shown' },
};

// Area whose imagery is listed; 'All' uses Teluk Kalong
function mpkWaybackArea() {
  return MPK.area === 'all' ? 'tk' : MPK.area;
}

function mpkSatYears() {
  const w = MPK.wayback;
  return (MPK.data[MPK_SATELLITES[w.src].data].areas || {})[mpkWaybackArea()] || {};
}

// Entries the slider steps through for the current satellite and view
function mpkWaybackList() {
  const w = MPK.wayback;
  if (w.view === 'image') return mpkEsriImages(MPK.data.wayback.history, mpkWaybackArea());
  if (w.view === 'year') return mpkYearBest(mpkSatYears(), w.src);
  return (mpkSatYears()[w.year] || Array(12).fill(null)).map(e => e && { source: w.src, ...e });
}

function mpkWaybackKey() {
  const w = MPK.wayback;
  return w.src + ':' + w.view + (w.view === 'month' ? ':' + w.year : '');
}

function mpkWaybackIndex() {
  const w = MPK.wayback, list = mpkWaybackList(), i = w.index[mpkWaybackKey()];
  if (i != null) return i;
  if (w.view === 'month') return mpkDefaultMonth(list);
  if (w.view === 'year') {                         // latest clear year, else the latest with an image
    for (let j = list.length - 1; j >= 0; j--) if (list[j].source && list[j].cloud <= 20) return j;
    for (let j = list.length - 1; j >= 0; j--) if (list[j].source) return j;
  }
  return list.length - 1;
}

function mpkShowWaybackImagery() {
  if (!map || !MPK.wayback.src) return;
  const w = MPK.wayback, src = mpkImagerySource(mpkWaybackList()[mpkWaybackIndex()]);
  mpkImageryZoomCap(src ? src.maxView : null);
  if (!src) {                                       // no usable image here: show none
    if (map.getLayer('mpk-wayback-layer')) map.setLayoutProperty('mpk-wayback-layer', 'visibility', 'none');
    return;
  }
  if (map.getSource('mpk-wayback') && w.kind === src.kind) {
    map.getSource('mpk-wayback').setTiles(src.tiles);
    map.setLayoutProperty('mpk-wayback-layer', 'visibility', 'visible');
    return;
  }
  mpkHideWaybackImagery();                          // source settings differ per satellite
  try {
    map.addSource('mpk-wayback', { type: 'raster', tiles: src.tiles, tileSize: 256, maxzoom: src.maxzoom,
      attribution: src.attribution });
    // under every MPK overlay, above the basemap
    // a little contrast lifts the haze of 10-30 m imagery; Esri photos are left as they are
    map.addLayer({ id: 'mpk-wayback-layer', type: 'raster', source: 'mpk-wayback',
      paint: src.kind === 'esri' ? {} : { 'raster-contrast': 0.15, 'raster-saturation': 0.1 } },
      mpkBottomLayer());
    w.kind = src.kind;
  } catch (e) {}                                    // style reloading — mpkAddLayers re-adds it
}

// Cap map zoom at the satellite's sharpest level (zooming out if needed); null releases it
function mpkImageryZoomCap(maxView) {
  if (!map) return;
  const cap = maxView == null ? (currentBasemap === 'uzma-sat' ? UZMASAT_MAXZOOM : (BASEMAPS[currentBasemap] && BASEMAPS[currentBasemap].maxView) || GLOBAL_MAXZOOM) : maxView;
  map.setMaxZoom(cap);
  if (map.getZoom() > cap) map.easeTo({ zoom: cap, duration: 600 });
}

// The lowest MPK layer: imagery is inserted under it so every MPK overlay stays visible
function mpkBottomLayer() {
  return map.getLayer('mpk-kadaster-line') ? 'mpk-kadaster-line' : undefined;
}

function mpkHideWaybackImagery() {
  if (!map) return;
  if (map.getLayer('mpk-wayback-layer')) map.removeLayer('mpk-wayback-layer');
  if (map.getSource('mpk-wayback')) map.removeSource('mpk-wayback');
  MPK.wayback.kind = null;
}

// The historical satellites are basemap choices (MPK mode only), listed under the Google /
// OSM basemaps in the basemap dropdown with their controls just below them.
function mpkBuildHistoricBasemaps() {
  const box = document.getElementById('mpk-basemap-section');
  if (!box || box.dataset.built) return;
  box.dataset.built = '1';
  const available = Object.entries(MPK_SATELLITES).filter(([, sat]) => MPK.data[sat.data]);
  if (!available.length) return;
  box.innerHTML = `
    <div class="mpk-hist-head">Historical imagery · MPK Kemaman</div>
    ${available.map(([k, sat]) => `
      <div class="basemap-option mpk-hist-opt" data-src="${k}" onclick="mpkSelectHistoric('${k}')">
        <div class="basemap-option-thumb mpk-hist-thumb ${k}">${sat.thumb}</div>
        <div><div style="font-size:12px;font-weight:500;">${sat.label}</div>
          <div style="font-size:10px;color:rgba(66,66,66,0.4);">${sat.short}</div></div>
      </div>`).join('')}
    <div class="mpk-hist-controls" id="mpk-wb-body" hidden>
      <div class="mpk-wb-info" id="mpk-wb-info"></div>
      <div class="mpk-wb-row">
        <label for="mpk-wb-view">View</label>
        <select id="mpk-wb-view" onchange="mpkWaybackView(this.value)"></select>
      </div>
      <div class="mpk-wb-row" id="mpk-wb-yearrow">
        <label for="mpk-wb-year">Year</label>
        <select id="mpk-wb-year" onchange="mpkWaybackYear(this.value)"></select>
      </div>
      <div class="mpk-wb-date" id="mpk-wb-date">—</div>
      <div class="mpk-wb-sub" id="mpk-wb-sub"></div>
      <input type="range" id="mpk-wb-slider" class="mpk-range" min="0" max="0" step="1" value="0"
        aria-label="Imagery date" oninput="mpkWaybackGo(+this.value)">
      <div class="mpk-range-scale"><span id="mpk-wb-first"></span><span id="mpk-wb-last"></span></div>
      <div class="mpk-wb-controls">
        <button type="button" class="mpk-wb-btn" onclick="mpkWaybackStep(-1)" aria-label="Previous image">◀</button>
        <button type="button" class="mpk-wb-btn play" id="mpk-wb-play" onclick="mpkWaybackPlay()" aria-label="Play">▶ Play</button>
        <button type="button" class="mpk-wb-btn" onclick="mpkWaybackStep(1)" aria-label="Next image">▶</button>
      </div>
    </div>`;
}

function mpkSelectHistoric(src) {
  const w = MPK.wayback;
  if (!w.on) MPK.prevBasemapLabel = document.getElementById('basemap-label').textContent;
  w.on = true;
  if (typeof MPK_CHANGE !== 'undefined' && MPK_CHANGE.result) mpkChangeView('map');   // one imagery layer at a time
  document.querySelectorAll('.basemap-option').forEach(o => o.classList.toggle('active', o.dataset.src === src));
  document.getElementById('mpk-wb-body').hidden = false;
  mpkWaybackSource(src);
  addActivityLog('Historical imagery', MPK_SATELLITES[src].label);
}

// Called by switchBasemap (index.html) and on leaving MPK mode
function mpkHistoricOff() {
  const w = MPK.wayback;
  if (!w.on) return;
  w.on = false;
  mpkWaybackStop();
  mpkHideWaybackImagery();
  mpkImageryZoomCap(null);
  document.querySelectorAll('.mpk-hist-opt').forEach(o => o.classList.remove('active'));
  const body = document.getElementById('mpk-wb-body');
  if (body) body.hidden = true;
  const label = document.getElementById('basemap-label');
  if (MPK.prevBasemapLabel) label.textContent = MPK.prevBasemapLabel;
  // the underlying basemap option is active again
  const base = document.querySelector(`.basemap-option[onclick*="'${currentBasemap}'"]`);
  if (base) base.classList.add('active');
}

// Switch satellite: keep the view if this satellite offers it, else its first view
function mpkWaybackSource(src) {
  const w = MPK.wayback, sat = MPK_SATELLITES[src];
  w.src = src;
  document.getElementById('mpk-wb-info').textContent = sat.info;
  const views = sat.views.map(([v]) => v);
  if (!views.includes(w.view)) w.view = views[0];
  document.getElementById('mpk-wb-view').innerHTML =
    sat.views.map(([v, label]) => `<option value="${v}"${v === w.view ? ' selected' : ''}>${label}</option>`).join('');
  document.getElementById('mpk-wb-view').disabled = sat.views.length < 2;
  mpkWaybackView(w.view);
}

function mpkWaybackView(view) {
  const w = MPK.wayback;
  mpkWaybackStop();
  w.view = view;
  document.getElementById('mpk-wb-yearrow').hidden = view !== 'month';
  if (view === 'month') {
    const years = mpkSentinelYears(mpkSatYears());
    if (!years.includes(w.year)) w.year = years[0];
    document.getElementById('mpk-wb-year').innerHTML =
      years.map(y => `<option value="${y}"${y === w.year ? ' selected' : ''}>${y}</option>`).join('');
  }
  const list = mpkWaybackList();
  document.getElementById('mpk-wb-slider').max = list.length - 1;
  const ends = view === 'month' ? ['Jan', 'Dec']
    : view === 'year' ? [list[0].year, list[list.length - 1].year]
    : [mpkMonthLabel(list[0].date), mpkMonthLabel(list[list.length - 1].date)];
  document.getElementById('mpk-wb-first').textContent = ends[0];
  document.getElementById('mpk-wb-last').textContent = ends[1];
  mpkWaybackGo(mpkWaybackIndex());
}

function mpkWaybackYear(year) {
  MPK.wayback.year = year;
  mpkWaybackView('month');
}

function mpkWaybackGo(i) {
  MPK.wayback.index[mpkWaybackKey()] = i;
  document.getElementById('mpk-wb-slider').value = i;
  mpkShowWaybackImagery();
  mpkWaybackRender();
}

function mpkSatName(entry) {
  return entry.source === 'landsat' && entry.platform ? entry.platform.replace('landsat-', 'Landsat ')
    : MPK_SATELLITES[entry.source].label;
}

function mpkWaybackRender() {
  if (!MPK.wayback.on) return;
  const w = MPK.wayback, list = mpkWaybackList(), i = mpkWaybackIndex(), entry = list[i];
  const area = MPK_AREAS[mpkWaybackArea()].short;
  const period = w.view === 'month' ? MPK_MONTH_NAMES[i] + ' ' + w.year : w.view === 'year' ? entry.year : '';
  const date = document.getElementById('mpk-wb-date'), sub = document.getElementById('mpk-wb-sub');
  if (!entry || !entry.source) {
    document.getElementById('basemap-label').textContent = `${MPK_SATELLITES[w.src].label} · ${period}`;
    date.textContent = `${period} · no usable image`;
    sub.textContent = `No ${MPK_SATELLITES[w.src].label} image of ${area} with usable coverage`;
    return;
  }
  const cloud = entry.cloud != null ? ` · ${Math.round(entry.cloud)}% cloud` : '';
  date.textContent = mpkDayLabel(entry.date) + cloud;
  document.getElementById('basemap-label').textContent = `${MPK_SATELLITES[w.src].label} · ${mpkMonthLabel(entry.date)}`;
  sub.textContent = w.view === 'image'
    ? `Image ${i + 1} of ${list.length} · ${area}`
    : `Least-cloudy ${mpkSatName(entry)} image of ${period} · ${area}`;
}

function mpkWaybackStep(d) {
  const n = mpkWaybackList().length;
  mpkWaybackGo((mpkWaybackIndex() + d + n) % n);
}

function mpkWaybackPlay() {
  const w = MPK.wayback;
  if (w.timer) { mpkWaybackStop(); return; }
  w.timer = setInterval(() => mpkWaybackStep(1), 2000);
  const btn = document.getElementById('mpk-wb-play');
  btn.textContent = '❚❚ Pause';
  btn.setAttribute('aria-label', 'Pause');
}

function mpkWaybackStop() {
  const w = MPK.wayback;
  if (w.timer) { clearInterval(w.timer); w.timer = null; }
  const btn = document.getElementById('mpk-wb-play');
  if (btn) { btn.textContent = '▶ Play'; btn.setAttribute('aria-label', 'Play'); }
}

// ---------- Search (MPK mode topbar) ----------
// Kemaman bounds for place-name lookups (OpenStreetMap Nominatim): W, N, E, S
const MPK_SEARCH_VIEWBOX = '103.30,4.40,103.60,4.10';
const MPK_SEARCH = { results: [], placeTimer: null, seq: 0 };

function mpkBindSearch() {
  const input = document.getElementById('mpk-search-input');
  if (!input || input.dataset.bound) return;
  input.dataset.bound = '1';
  input.addEventListener('input', () => mpkSearchRun(input.value));
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && MPK_SEARCH.results.length) mpkSearchPick(0);
    if (e.key === 'Escape') mpkSearchClose();
  });
  input.addEventListener('focus', () => { if (input.value.trim()) mpkSearchRun(input.value); });
  document.addEventListener('click', e => { if (!e.target.closest('.mpk-search')) mpkSearchClose(); });
}

function mpkSearchRun(query) {
  const seq = ++MPK_SEARCH.seq;
  clearTimeout(MPK_SEARCH.placeTimer);
  const q = query.trim();
  if (!q) { mpkSearchClose(); return; }
  const coord = mpkParseCoords(q);
  if (coord) {
    MPK_SEARCH.results = [{ kind: 'coord', label: `${coord.lat.toFixed(6)}, ${coord.lng.toFixed(6)}`,
                            sub: 'Go to this coordinate', lat: coord.lat, lng: coord.lng }];
    mpkSearchRender(false);
    return;
  }
  MPK_SEARCH.results = mpkSearchLocal(q, MPK_AREAS, MPK.data.kadaster.features,
    MPK.data.buildings.features);
  // every detail of the buildings, the plans and the register (debounced: tens of thousands of features)
  MPK_SEARCH.query = q;
  clearTimeout(MPK_SEARCH.attrTimer);
  MPK_SEARCH.attrTimer = setTimeout(() => { if (seq === MPK_SEARCH.seq) mpkSearchAttrRun(q, seq); }, 160);
  if (q.length >= 2 && !MPK.REKOD.data && !MPK.REKOD.loading) {
    mpkLoadRekod(true).then(() => { if (seq === MPK_SEARCH.seq && MPK.REKOD.data) mpkSearchAttrRun(q, seq); });
  }
  mpkSearchRender(q.length >= 3);
  if (q.length < 3) return;
  // place names: wait for a pause in typing (Nominatim allows ~1 request per second)
  MPK_SEARCH.placeTimer = setTimeout(async () => {
    try {
      const url = 'https://nominatim.openstreetmap.org/search?' + new URLSearchParams({
        format: 'jsonv2', q, viewbox: MPK_SEARCH_VIEWBOX, bounded: 1, countrycodes: 'my', limit: 6 });
      const places = await (await fetch(url, { headers: { 'Accept-Language': 'en' } })).json();
      if (seq !== MPK_SEARCH.seq) return;              // a newer query is on screen
      MPK_SEARCH.results = MPK_SEARCH.results.filter(r => r.kind !== 'place').concat(places.map(p => ({
        kind: 'place', label: p.name || p.display_name.split(',')[0],
        sub: p.display_name.split(',').slice(1, 3).join(',').trim(), lng: +p.lon, lat: +p.lat, bbox: p.boundingbox })));
    } catch (e) {}
    if (seq === MPK_SEARCH.seq) mpkSearchRender(false);
  }, 600);
}

// Labels of the details searched (the rest are searched under their own key)
const MPK_ATTR_LABELS = {
  bld: { plus_code: 'Plus Code', lot: 'Lot', upi: 'UPI', area_m2: 'Area m²', tinggi_m: 'Height m', tingkat_est: 'Floors', tinggi_src: 'Height source',
    pelan_fail: 'Plan file', pelan_jenis: 'Plan building type', pelan_status: 'Plan status', pelan_tarikh: 'Plan date', pelan_sumber: 'Plan register',
    rekod_fail: 'Register file', rekod_pemohon: 'Applicant', rekod_jenis: 'Building (register)', rekod_status: 'Status (register)', rekod_tarikh: 'Register date',
    rekod_id: 'Register record', kategori: 'Class', sumber: 'Footprint source', jarak_jalan_m: 'From road m', daftar_no: 'Registration no.',
    daftar_status: 'Registration', catatan: 'Note', id: 'Building id', api_fid: 'API id', src_fid: 'Source id', asal: 'Origin' },
  pelan: { fail: 'Plan file', jenis: 'Building', keputusan: 'Decision', lot: 'Lot', luas: 'Floor area m²', pemohon: 'Applicant', rekod: 'Register record',
    status: 'Status', sumber: 'Register', tarikh: 'Date' },
  rekod: { i: 'Record no.', f: 'File no.', p: 'Applicant', j: 'Building', l: 'Lot', s: 'Status as written', c: 'Status', t: 'Approved on',
    g: 'CAD piece', a: 'CAD area m²', u: 'Data issues' },
};
function mpkSearchAttrGroups() {
  const st = p => p.kawasan ? MPK_STATUS[mpkStatus(p, MPK.settings)].label : '';
  const bldExtra = p => {
    const j = p.kawasan ? mpkJenis(p, MPK.settings) : null;
    return [['Status', st(p)], ...(p.pelan_sumber ? [['Plan register', MPK_PLAN_REGISTER[p.pelan_sumber] || 'Teluk Kalong']] : []), ['Area', p.kawasan ? MPK_AREAS[p.kawasan].name : (MPK_DEKAT[p.dekat] || MPK_DEKAT.tk).label],
      ...(j ? [['Why illegal', MPK_JENIS[j].label]] : []), ...(p.edit_status ? [['Set by', 'MPK officer']] : [])];
  };
  const skip = ['lng', 'lat', 'dalam', 'pelan_sumber', 'kategori', 'confidence', 'kawasan', 'dekat', 'edited', 'edit_status', 'daftar_asal', 'pelan_n', 'rekod_n', 'rekod_sah', 'bangunan'];
  return [
    { kind: 'a-bld', features: MPK.data.buildings.features, labels: MPK_ATTR_LABELS.bld, skip, extra: bldExtra },
    { kind: 'a-out', features: MPK.data.others ? MPK.data.others.features : [], labels: MPK_ATTR_LABELS.bld, skip, extra: bldExtra },
    { kind: 'a-pelan', features: MPK.data.pelan ? MPK.data.pelan.features : [], labels: MPK_ATTR_LABELS.pelan, skip: ['bangunan', 'sumber'],
      extra: p => [['Register', p.sumber === 'Kedai' ? 'Shops (Pelan Bangunan Kedai)' : 'Teluk Kalong']] },
    { kind: 'a-rekod', features: MPK.REKOD.data ? MPK.REKOD.data.features : [], labels: MPK_ATTR_LABELS.rekod, skip: ['k', 'd'],
      extra: p => [['Area', p.d ? 'Teluk Kalong' : 'Outside Teluk Kalong']] },
  ];
}
function mpkSearchAttrRun(q, seq) {
  const shown = new Set(MPK_SEARCH.results.filter(r => r.kind === 'building').map(r => String(r.id)));
  const attrs = mpkSearchAttrs(q, mpkSearchAttrGroups())
    .filter(r => !(r.kind === 'a-bld' && shown.has(String(r.feature.properties.id))));
  if (seq !== MPK_SEARCH.seq) return;
  MPK_SEARCH.results = MPK_SEARCH.results.filter(r => !r.kind.startsWith('a-'));
  const at = MPK_SEARCH.results.findIndex(r => r.kind === 'place');
  MPK_SEARCH.results.splice(at < 0 ? MPK_SEARCH.results.length : at, 0, ...attrs.map(r => {
    const p = r.feature.properties;
    const label = r.kind === 'a-pelan' ? (p.fail || 'Plan · no file no.') : r.kind === 'a-rekod' ? `Record #${p.i}${p.f ? ' · ' + p.f : ''}` : p.plus_code;
    return { ...r, label, sub: r.field + ': ' + r.value };
  }));
  mpkSearchRender(false);
}

function mpkSearchRender(placesPending) {
  const dd = document.getElementById('mpk-search-dd');
  const icons = { coord: '🎯', area: '🗺️', lot: '📐', building: '🏠', place: '📍', 'a-bld': '🏠', 'a-out': '🏚️', 'a-pelan': '📄', 'a-rekod': '🗂️' };
  const titles = { coord: 'Coordinate', area: 'Study areas', lot: 'Cadastral lots', building: 'Buildings', place: 'Places in Kemaman',
    'a-bld': 'Buildings · any detail', 'a-out': 'Outside the study areas · any detail', 'a-pelan': 'Building plans · any detail', 'a-rekod': 'Teluk Kalong register · any detail' };
  const esc = mpkEscHtml;
  // the matched word marked in the detail shown (long details cut around it)
  const mark = (text, w) => {
    let t = String(text);
    const i = w ? t.toLowerCase().indexOf(w) : -1;
    if (t.length > 70 && i > 30) t = '…' + t.slice(i - 25);
    if (t.length > 70) t = t.slice(0, 68) + '…';
    const j = w ? t.toLowerCase().indexOf(w) : -1;
    return j < 0 ? esc(t) : esc(t.slice(0, j)) + '<mark>' + esc(t.slice(j, j + w.length)) + '</mark>' + esc(t.slice(j + w.length));
  };
  let html = '', last = null;
  MPK_SEARCH.results.forEach((r, i) => {
    if (r.kind !== last) {
      const n = r.total, more = n > 8 ? ` <small>${mpkNum(n)} found · first 8 shown, type more to narrow</small>` : n ? ` <small>${mpkNum(n)} found</small>` : '';
      html += `<div class="search-section-header">${titles[r.kind]}${more}</div>`; last = r.kind;
    }
    const isAttr = r.kind.startsWith('a-');
    html += `<div class="search-item" role="option" onclick="mpkSearchPick(${i})">
      <div class="search-item-icon">${icons[r.kind]}</div>
      <div class="search-item-body"><div class="search-item-id">${isAttr ? esc(r.label) : r.label}</div><div class="search-item-cls">${isAttr ? esc(r.field) + ': ' + mark(r.value, r.word) : r.sub || ''}</div></div></div>`;
  });
  if (MPK.REKOD.loading) html += '<div class="search-loading">Loading the Teluk Kalong register to search it too…</div>';
  if (placesPending) html += '<div class="search-loading">Searching places…</div>';
  if (!html) html = '<div class="search-loading">No matches. Search any detail: lot, UPI, Plus Code, file no., applicant, building type, status, place name or coordinate (e.g. 4.2681, 103.452).</div>';
  dd.innerHTML = html;
  dd.style.display = 'block';
}

function mpkSearchClose() {
  const dd = document.getElementById('mpk-search-dd');
  if (dd) dd.style.display = 'none';
}

function mpkSearchPick(i) {
  const r = MPK_SEARCH.results[i];
  if (!r) return;
  mpkSearchClose();
  document.getElementById('mpk-search-input').value = r.label;
  if (r.kind === 'coord') {
    mpkSearchMarker(r.lng, r.lat);
    map.flyTo({ center: [r.lng, r.lat], zoom: Math.max(map.getZoom(), 17), duration: 1000 });
  } else if (r.kind === 'area') {
    mpkSelectArea(r.key);
  } else if (r.kind === 'building' || r.kind === 'a-bld') {
    mpkZoomTo(r.id || r.feature.properties.id);
  } else if (r.kind.startsWith('a-')) {
    const f = r.feature, p = f.properties, b = mpkBoundsOf([f]);
    const at = [(b[0][0] + b[1][0]) / 2, (b[0][1] + b[1][1]) / 2];
    if (b[0][0] === b[1][0]) map.flyTo({ center: at, zoom: Math.max(map.getZoom(), 18), duration: 1000 });
    else map.fitBounds(b, { padding: 140, maxZoom: 18, duration: 1000 });
    if (r.kind === 'a-out') {
      if (!MPK.layerOn[(MPK_DEKAT[p.dekat] || MPK_DEKAT.tk).group]) mpkToggleLayer((MPK_DEKAT[p.dekat] || MPK_DEKAT.tk).group);
      try { map.getSource('mpk-highlight').setData(f); } catch (e) {}
      mpkShowOtherPopup(p, [p.lng, p.lat]);
    } else if (r.kind === 'a-pelan') {
      try { map.getSource('mpk-highlight').setData(f.geometry.type === 'Point' ? { type: 'FeatureCollection', features: [] } : f); } catch (e) {}
      mpkShowPlanPopup(p, at);
    } else {
      mpkShowRekodPopup(p, at);
    }
  } else if (r.kind === 'lot') {
    map.fitBounds(mpkBoundsOf([r.feature]), { padding: 120, maxZoom: 18, duration: 1000 });
    try { map.getSource('mpk-highlight').setData(r.feature); } catch (e) {}
    showToast('📐 ' + r.label + ' · ' + r.sub);
  } else {
    const b = r.bbox && r.bbox.map(Number);
    if (b && b[0] !== b[1]) map.fitBounds([[b[2], b[0]], [b[3], b[1]]], { padding: 60, maxZoom: 17, duration: 1000 });
    else map.flyTo({ center: [r.lng, r.lat], zoom: 16, duration: 1000 });
  }
  addActivityLog('Search', r.label);
}

// Pin at a searched coordinate (one at a time); its popup shows the coordinate
function mpkSearchMarker(lng, lat) {
  if (MPK_SEARCH.marker) MPK_SEARCH.marker.remove();
  const text = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
  MPK_SEARCH.marker = new maplibregl.Marker({ color: '#E8772E' }).setLngLat([lng, lat])
    .setPopup(new maplibregl.Popup({ offset: 28, focusAfterOpen: false })
      .setHTML(`<div class="popup-body"><div class="popup-row"><span class="popup-k">Coordinate</span>
        <span class="popup-v">${text}</span></div></div>`))
    .addTo(map);
  MPK_SEARCH.marker.togglePopup();
}

// labels the report module (mpk-report.js) also uses under Node tests
if (typeof module !== 'undefined') Object.assign(module.exports, { MPK_AREAS, MPK_STATUS, MPK_JENIS, MPK_SIZE_CLASSES, mpkRevenue });
