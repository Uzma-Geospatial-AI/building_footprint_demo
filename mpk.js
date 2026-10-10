// ============================================================
// MPK KEMAMAN — SUSPECTED ILLEGAL CONSTRUCTION MODE
// Three study areas from MPK:
//   tk   Teluk Kalong Industrial Area — buildings inside the PBT boundary on no approved
//        lot, or outside the boundary within the buffer
//   bpb  Koridor Bandar Putra – Berenjut } buildings within the road-reserve distance of
//   bbc  Koridor Binjai – Bandar Chukai  } the road centreline
// Data: mpk/*.geojson, built by tools/vectorize_teluk_kalong.py + tools/build_mpk_illegal.py
// ============================================================

// ---------- Pure logic (also exported for tools/test_mpk_logic.js) ----------
// Suspect type of one building under the current settings {rizab}, or null.
// Teluk Kalong: the buildings flagged is_mockup in the Uzma/MPK building API (kategori
// 'mockup'). Corridors: buildings within the road-reserve distance of the centreline.
function mpkJenis(p, s) {
  if (p.kategori === 'mockup') return 'mockup';
  if (p.kategori === 'koridor' && p.jarak_jalan_m != null && p.jarak_jalan_m <= s.rizab) return 'rizab';
  return null;
}

// One of three statuses per building, so legal and illegal are easy to tell apart:
//   suspected  — on the suspect list / encroaching the road reserve (mpkJenis)
//   legal      — stands on an MPK-approved lot (Teluk Kalong)
//   unverified — no approval record to confirm either way
function mpkStatus(p, s) {
  if (mpkJenis(p, s)) return 'suspected';
  return p.kategori === 'lulus' ? 'legal' : 'unverified';
}

// The marked areas the dashboard reports on: Teluk Kalong buildings inside the planning
// boundary, and buildings within the two road corridors
function mpkInScope(p) {
  return (p.kawasan === 'tk' && p.dalam === true) || p.kategori === 'koridor';
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
  const out = { all: empty(), tk: empty(), bpb: empty(), bbc: empty() };
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
    ['all', ['==', ['get', 'kategori'], 'koridor'],
      ['<=', ['to-number', ['coalesce', ['get', 'jarak_jalan_m'], 1e9]], s.rizab]],
  ];
}

function mpkStats(features, s, rates, kawasan) {
  const feats = kawasan === 'all' ? features : features.filter(f => f.properties.kawasan === kawasan);
  const byJenis = { mockup: 0, rizab: 0 };
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
const MPK_CSV_AREA = { tk: 'teluk_kalong', bpb: 'bandar_putra_berenjut', bbc: 'binjai_bandar_chukai' };
const MPK_CSV_TYPE = { mockup: 'suspected_list', rizab: 'road_reserve' };

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

if (typeof module !== 'undefined') {
  module.exports = { mpkInScope, mpkSizeClass, MPK_SIZE_CLASSES, mpkBreakdown, mpkCSVAll, mpkStatus, mpkZoneAt, mpkParseCoords, mpkSearchLocal, mpkJenis, mpkSuspectFilter, mpkStats, mpkCSV, mpkMonthLabel, mpkWaybackTileUrl,
                     mpkDayLabel, mpkSentinelTileUrl, mpkSentinelYears, mpkDefaultMonth, mpkImagerySource,
                     mpkYearBest, mpkEsriImages };
}

// ---------- Browser mode ----------
const MPK_AREAS = {
  tk:  { name: 'Teluk Kalong Industrial Area', short: 'Teluk Kalong' },
  bpb: { name: 'Bandar Putra – Berenjut Corridor', short: 'B. Putra – Berenjut' },
  bbc: { name: 'Binjai – Bandar Chukai Corridor', short: 'Binjai – Chukai' },
};
// Every suspected building is drawn in one red so "red = suspected" reads at a glance;
// the type is given in the popup, the list and the CSV.
const MPK_SUSPECT_COLOR = '#c62828';
const MPK_STATUS = {
  suspected:  { label: 'Suspected illegal', color: MPK_SUSPECT_COLOR,
                hint: 'On the MPK suspect list (Teluk Kalong) or encroaching the road reserve (corridors)' },
  legal:      { label: 'Legal · on approved lot', color: '#26a69a',
                hint: 'Stands on a lot approved by MPK (Teluk Kalong)' },
  unverified: { label: 'Not verified', color: '#CFD8DC',
                hint: 'No approval record to confirm either way' },
};
const MPK_JENIS = {
  mockup:        { label: 'Suspected building (Teluk Kalong list)', color: MPK_SUSPECT_COLOR, areas: ['tk'] },
  rizab:         { label: 'Encroaching road reserve', color: MPK_SUSPECT_COLOR, areas: ['bpb', 'bbc'] },
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
               legend: [...Object.values(MPK_ZONES).map(z => [z.label, z.color]), ['District boundary', '.district']] },
  suspect:   { label: MPK_STATUS.suspected.label, swatch: [MPK_STATUS.suspected.color],
               layers: ['mpk-suspect-fill', 'mpk-suspect-line', 'mpk-suspect-extrude', 'mpk-highlight-line'],
               legend: [] },
  legal:     { label: MPK_STATUS.legal.label, swatch: [MPK_STATUS.legal.color],
               layers: ['mpk-legal-fill', 'mpk-legal-line'], legend: [] },
  sizes:     { label: 'Building size labels', swatch: [], layers: ['mpk-size-label'], legend: [] },
  unverified: { label: MPK_STATUS.unverified.label, swatch: [MPK_STATUS.unverified.color],
               layers: ['mpk-unverified-fill'], legend: [] },
  reference: { label: 'Reference layers', swatchClass: 'line',
               layers: ['mpk-kadaster-line', 'mpk-boundary-fill',
                        'mpk-boundary-line', 'mpk-koridor-band', 'mpk-koridor-line'],
               legend: [['Cadastral lot', '.kadaster'], ['Planning boundary', '.line'],
                        ['Study corridor', '.band']] },
};

const MPK = {
  // Bump with the ?v= on mpk.js / mpk.css in index.html whenever MPK code or data changes,
  // so browsers never mix a cached old file with a new one (GitHub Pages caches 10 min).
  VERSION: '20261011i',
  FILES: {
    buildings: 'mpk/mpk_buildings.geojson',
    boundary: 'mpk/tk_sempadan.geojson',
    kadaster: 'mpk/lot_kadaster.geojson',
    roads: 'mpk/koridor_jalan.geojson',
  },
  // Optional imagery indexes: if one fails to load, only its imagery mode is hidden
  OPTIONAL_FILES: { landuse: 'mpk/landuse.geojson', wayback: 'mpk/wayback.json', sentinel: 'mpk/sentinel.json', landsat: 'mpk/landsat.json' },
  RATES_KEY: 'mpk_rates',
  DEFAULT_RATES: { fee: 2.0, cukai: 6.0 },
  LIST_SIZE: 50,
  LAYERS: ['mpk-wayback-layer', 'mpk-landuse-fill', 'mpk-landuse-line', 'mpk-district-line', 'mpk-kadaster-line', 'mpk-boundary-fill', 'mpk-boundary-line', 'mpk-koridor-band',
           'mpk-koridor-line', 'mpk-unverified-fill', 'mpk-legal-fill', 'mpk-legal-line', 'mpk-suspect-fill', 'mpk-suspect-line',
           'mpk-suspect-extrude', 'mpk-highlight-line', 'mpk-size-label'],
  SOURCES: ['mpk-wayback', 'mpk-size-pts', 'mpk-landuse', 'mpk-kadaster', 'mpk-boundary', 'mpk-roads', 'mpk-buildings', 'mpk-highlight'],
  SUSPECT_LAYERS: ['mpk-suspect-fill', 'mpk-suspect-line', 'mpk-suspect-extrude'],
  active: false,
  data: null,
  bounds: null,
  settings: { rizab: 10 },
  area: 'all',
  // land use starts off so the map shows the buildings first (switch it on in Analysis)
  layerOn: Object.fromEntries(Object.keys(MPK_LAYER_GROUPS).map(k => [k, k !== 'landuse'])),
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

async function mpkEnsureData() {
  if (MPK.data) return;
  const entries = await Promise.all(Object.entries(MPK.FILES).map(async ([key, url]) => {
    const res = await fetch(url + '?v=' + MPK.VERSION);
    if (!res.ok) throw new Error('HTTP ' + res.status + ' · ' + url);
    return [key, await res.json()];
  }));
  const data = Object.fromEntries(entries);
  // the dashboard reports on the marked areas only: Teluk Kalong inside the planning boundary
  // and the two road corridors (buildings outside them are dropped)
  data.buildings = { ...data.buildings, features: data.buildings.features.filter(f => mpkInScope(f.properties)) };
  await Promise.all(Object.entries(MPK.OPTIONAL_FILES).map(async ([key, url]) => {
    try {
      const res = await fetch(url + '?v=' + MPK.VERSION);
      data[key] = res.ok ? await res.json() : null;
    } catch (e) {
      data[key] = null;
    }
  }));
  const b = data.buildings.features;
  MPK.bounds = {
    all: mpkBoundsOf([...b, ...data.boundary.features, ...data.roads.features]),
    tk: mpkBoundsOf(data.boundary.features),
    bpb: mpkBoundsOf(data.roads.features.filter(f => f.properties.kawasan === 'bpb')),
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
    map.addLayer({ id: 'mpk-unverified-fill', type: 'fill', source: 'mpk-buildings', filter: mpkStatusFilter('unverified'),
      paint: { 'fill-color': MPK_STATUS.unverified.color, 'fill-opacity': 0.6, 'fill-outline-color': '#90A4AE' } });
    map.addLayer({ id: 'mpk-legal-fill', type: 'fill', source: 'mpk-buildings', filter: mpkStatusFilter('legal'),
      paint: { 'fill-color': MPK_STATUS.legal.color, 'fill-opacity': 0.6 } });
    map.addLayer({ id: 'mpk-legal-line', type: 'line', source: 'mpk-buildings', filter: mpkStatusFilter('legal'),
      paint: { 'line-color': '#00695C', 'line-width': ['interpolate', ['linear'], ['zoom'], 13, 0.4, 17, 1.4] } });
    map.addLayer({ id: 'mpk-suspect-fill', type: 'fill', source: 'mpk-buildings', filter: suspect,
      paint: { 'fill-color': MPK_SUSPECT_COLOR, 'fill-opacity': 0.45 } });
    map.addLayer({ id: 'mpk-suspect-line', type: 'line', source: 'mpk-buildings', filter: suspect,
      paint: { 'line-color': '#b71c1c', 'line-width': ['interpolate', ['linear'], ['zoom'], 13, 0.6, 17, 2] } });
    map.addLayer({ id: 'mpk-suspect-extrude', type: 'fill-extrusion', source: 'mpk-buildings', filter: suspect,
      layout: { visibility: 'none' },
      paint: { 'fill-extrusion-color': MPK_SUSPECT_COLOR, 'fill-extrusion-height': 8, 'fill-extrusion-base': 0,
               'fill-extrusion-opacity': 0.85 } });
    map.addLayer({ id: 'mpk-highlight-line', type: 'line', source: 'mpk-highlight',
      paint: { 'line-color': '#FDD835', 'line-width': 3 } });
    // footprint size (m²) on every building once zoomed in
    map.addSource('mpk-size-pts', { type: 'geojson', data: { type: 'FeatureCollection',
      features: MPK.data.buildings.features.map(f => ({ type: 'Feature', properties: { m2: f.properties.area_m2 },
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
  if (MPK.wayback.on) mpkShowWaybackImagery();
  if (typeof mpkChangeRestore === 'function') mpkChangeRestore();
  return true;
}

function mpkApplyLayerVisibility() {
  for (const [key, g] of Object.entries(MPK_LAYER_GROUPS)) {
    g.layers.forEach(id => { if (id !== 'mpk-suspect-extrude') mpkSetVis(id, MPK.layerOn[key] ? 'visible' : 'none'); });
  }
  mpkRefresh3D();
}

function mpkToggleLayer(key) {
  MPK.layerOn = { ...MPK.layerOn, [key]: !MPK.layerOn[key] };
  const btn = document.getElementById('mpk-tog-' + key);
  btn.className = 'layer-toggle ' + (MPK.layerOn[key] ? 'on' : 'off');
  btn.setAttribute('aria-checked', String(MPK.layerOn[key]));
  document.getElementById('mpk-group-' + key).classList.toggle('is-off', !MPK.layerOn[key]);
  if (key === 'suspect' && !MPK.layerOn.suspect && MPK.popup) { MPK.popup.remove(); MPK.popup = null; }
  if (map) mpkApplyLayerVisibility();
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
  MPK.LAYERS.forEach(id => { try { if (map.getLayer(id)) map.removeLayer(id); } catch (e) {} });
  MPK.SOURCES.forEach(id => { try { if (map.getSource(id)) map.removeSource(id); } catch (e) {} });
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
  ['mpk-suspect-fill', 'mpk-legal-fill', 'mpk-unverified-fill'].forEach(layer => {
    map.on('click', layer, e => {
      if (!MPK.active || !e.features.length || (typeof MPK_FEAT !== 'undefined' && MPK_FEAT.capture)) return;
      mpkShowPopup(e.features[0].properties, e.lngLat);
    });
    map.on('mouseenter', layer, () => { if (MPK.active) map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', layer, () => { if (MPK.active) map.getCanvas().style.cursor = 'grab'; });
  });
  // a land-use zone answers only where there is no building under the click
  map.on('click', 'mpk-landuse-fill', e => {
    if (!MPK.active || !e.features.length) return;
    const onBuilding = map.queryRenderedFeatures(e.point, { layers: ['mpk-suspect-fill', 'mpk-legal-fill', 'mpk-unverified-fill']
      .filter(id => map.getLayer(id)) }).length;
    if (!onBuilding) mpkShowZonePopup(e.features[0].properties, e.lngLat);
  });
}

function mpkSetMode(mode) {
  if (mode === 'mpk') mpkEnter(); else mpkExit();
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
  MPK.active = true;
  document.body.classList.add('mpk-mode');

  // Leave any Seremban interaction state behind
  try { if (currentPopup) { currentPopup.remove(); currentPopup = null; } } catch (e) {}
  const nav = document.getElementById('mode-navigate');
  if (nav && mapMode !== 'navigate') setMapMode('navigate', nav);
  // UZMA-sat imagery only covers Seremban — use Google Satellite over Kemaman
  if (currentBasemap === 'uzma-sat') {
    const opt = document.querySelector('.basemap-option[onclick*="google-satellite"]');
    switchBasemap('google-satellite', 'Google Satellite', opt);
  }

  mpkSetSerembanVisible(false);
  mpkAddLayers();
  mpkBindEvents();

  const title = document.getElementById('page-title'), sub = document.getElementById('page-sub');
  const panelSub = document.getElementById('panel-sub');
  MPK.prevTitle = { title: title.textContent, sub: sub.textContent, panelSub: panelSub.textContent };
  title.textContent = 'Illegal Construction Monitoring — MPK Kemaman';
  sub.textContent = 'Teluk Kalong · Bandar Putra–Berenjut · Binjai–Bandar Chukai';
  panelSub.textContent = 'MPK Kemaman · Buildings suspected of lacking planning permission';

  const tab = document.getElementById('ptab-mpk');
  tab.style.display = '';
  mpkBuildPanel();
  mpkBuildStatsPage();
  if (typeof mpkBuildFeaturesPage === 'function') mpkBuildFeaturesPage();
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
  const analysisGroups = ['landuse', 'reference'].map(k => {
    const g = MPK_LAYER_GROUPS[k];
    const sw = g.swatchClass ? `<i class="sw ${g.swatchClass}"></i>` : g.swatch.map(c => `<i class="sw" style="background:${c}"></i>`).join('');
    const legend = g.legend.map(([label, v]) =>
      `<span>${v[0] === '.' ? `<i class="sw ${v.slice(1)}"></i>` : `<i class="sw" style="background:${v}"></i>`}${label}</span>`).join('');
    return `<div class="mpk-layer-group${MPK.layerOn[k] ? '' : ' is-off'}" id="mpk-group-${k}">
      <div class="mpk-layer-row"><span class="mpk-sw-group">${sw}</span><div class="mpk-layer-main">${g.label}</div>${toggle(k, g.label)}</div>
      ${legend ? `<div class="mpk-layer-legend">${legend}</div>` : ''}
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

      <div class="mpk-kpis">
        <div class="mpk-kpi"><div class="v" id="mpk-k-total">—</div><div class="l">Buildings<br><span id="mpk-k-m2">—</span></div></div>
        <div class="mpk-kpi legal"><div class="v" id="mpk-k-legal">—</div><div class="l">Legal</div></div>
        <div class="mpk-kpi danger"><div class="v" id="mpk-k-illegal">—</div><div class="l">Suspected illegal</div></div>
      </div>

      <div class="mpk-card mpk-status">
        <div class="mpk-status-bar" id="mpk-status-bar"></div>
        ${statusRows}
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

      <div class="mpk-note">Buildings shown: Teluk Kalong inside the planning boundary, and within the two road corridors.
        Teluk Kalong suspected buildings: the list flagged in the Uzma/MPK building API
        (kemaman_buildings_industri_filled.geojson, <code>is_mockup</code>). Other buildings: Google Open Buildings.
        Boundary & approved lots digitised from MPK's map; road centrelines and land use from OpenStreetMap (not
        official RTD zoning); cadastral lots from NDCDB. Road-reserve width and revenue rates are assumptions.
        Every case needs site verification.</div>
    </div>
  `;
}

// Overview / Analysis inside the panel
function mpkSubTab(sub) {
  document.querySelectorAll('.mpk-subtabs button').forEach(b => {
    b.classList.toggle('active', b.dataset.sub === sub);
    b.setAttribute('aria-selected', String(b.dataset.sub === sub));
  });
  document.getElementById('mpk-sub-overview').hidden = sub !== 'overview';
  document.getElementById('mpk-sub-analysis').hidden = sub !== 'analysis';
}

function mpkSelectArea(area) {
  MPK.area = area;
  document.querySelectorAll('.mpk-chip').forEach(c => c.classList.toggle('active', c.dataset.area === area));
  const showKoridor = area === 'all' || area === 'bpb' || area === 'bbc';
  document.getElementById('mpk-rizab-card').style.display = showKoridor ? '' : 'none';
  document.getElementById('mpk-hero-sub').textContent = {
    all: 'Teluk Kalong (inside the planning boundary) and the two road corridors',
    tk: 'Teluk Kalong Industrial Area · buildings inside the planning boundary',
    bpb: 'Bandar Putra – Berenjut · buildings along the road corridor',
    bbc: 'Binjai – Bandar Chukai · buildings along the road corridor',
  }[area];
  if (MPK.bounds) map.fitBounds(MPK.bounds[area], { padding: 50, duration: 1200 });
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
  const s = mpkStats(MPK.data.buildings.features, MPK.settings, MPK.rates, MPK.area);
  const b = mpkBreakdown(mpkAreaFeatures(), MPK.settings).all;
  MPK.lastStats = s;
  MPK.lastBreakdown = b;
  document.getElementById('mpk-rizab-val').textContent = MPK.settings.rizab + ' m';
  document.getElementById('mpk-k-total').textContent = mpkNum(b.total);
  document.getElementById('mpk-k-m2').textContent = mpkM2(b.m2);
  document.getElementById('mpk-k-legal').textContent = mpkPct(b.byStatus.legal.pct);
  document.getElementById('mpk-k-illegal').textContent = mpkPct(b.byStatus.suspected.pct);
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
    list.innerHTML = s.suspects.slice(0, MPK.LIST_SIZE).map((f, i) => {
      const p = f.properties, j = MPK_JENIS[mpkJenis(p, MPK.settings)];
      return `<div class="mpk-item" onclick="mpkZoomTo(${p.id})">
        <span class="mpk-rank">${i + 1}</span>
        <i class="mpk-dot" style="background:${MPK_STATUS.suspected.color}"></i>
        <div class="mpk-item-main"><div class="mpk-pc">${p.plus_code}</div>
          <div class="mpk-meta">${MPK_AREAS[p.kawasan].short}${p.lot ? ' · Lot ' + p.lot : ''} · ${j.label}</div></div>
        <div class="mpk-area">${mpkNum(p.area_m2)} m²</div>
      </div>`;
    }).join('') + (s.count > MPK.LIST_SIZE
      ? `<div class="mpk-more">+ ${mpkNum(s.count - MPK.LIST_SIZE)} more · see Export CSV</div>` : '');
  }
  if (MPK.page === 'stats') mpkRenderStats();
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
  const suspect = mpkSuspectFilter(MPK.settings);
  MPK.SUSPECT_LAYERS.forEach(id => { if (map.getLayer(id)) map.setFilter(id, suspect); });
  for (const st of ['legal', 'unverified']) {
    for (const id of MPK_LAYER_GROUPS[st].layers) if (map.getLayer(id)) map.setFilter(id, mpkStatusFilter(st));
  }
  mpkRender();
}

function mpkOnRate() {
  const read = id => { const v = parseFloat(document.getElementById(id).value); return isFinite(v) && v >= 0 ? v : 0; };
  MPK.rates = { fee: read('mpk-rate-fee'), cukai: read('mpk-rate-cukai') };
  mpkSaveRates();
  mpkRenderRevenue();
}

// ---------- Map interaction ----------
function mpkStatusText(p, jenis) {
  if (jenis) return 'Suspected illegal · ' + MPK_JENIS[jenis].label;
  if (p.kategori === 'lulus') return 'Legal · on an MPK-approved lot';
  if (p.kategori === 'luar') return 'Not verified · outside the planning boundary';
  if (p.kawasan === 'tk') return 'Not verified · inside the boundary, no approved lot on record';
  return 'Not verified · in corridor, no approval record';
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
  const jenis = mpkJenis(p, MPK.settings);
  const row = (k, v) => `<div class="popup-row"><span class="popup-k">${k}</span><span class="popup-v">${v}</span></div>`;
  const html = `
    <div class="popup-header" style="background:${MPK_STATUS[mpkStatus(p, MPK.settings)].color}">
      <div class="popup-fc">${mpkStatusText(p, jenis)}</div>
      <div class="popup-name">${p.plus_code}</div>
    </div>
    <div class="popup-body">
      ${row('Area', MPK_AREAS[p.kawasan].short)}
      ${MPK.data.landuse ? row('Land use (OSM)', mpkZoneLabel(mpkZoneAt(p.lng, p.lat, MPK.data.landuse.features))) : ''}
      ${p.kategori === 'luar' ? row('Distance from boundary', p.jarak_m + ' m') : ''}
      ${p.kategori === 'koridor' ? row('Distance from road centreline',
        p.jarak_jalan_m == null ? 'no road data' : p.jarak_jalan_m + ' m') : ''}
      ${row('Lot no.', p.lot || 'no cadastral lot')}
      ${p.upi ? row('UPI', p.upi) : ''}
      ${row('Footprint area', mpkNum(p.area_m2) + ' m²')}
      ${row('AI confidence', Math.round(p.confidence * 100) + '%')}
      ${jenis ? row('Est. processing fee', mpkRM(p.area_m2 * MPK.rates.fee)) : ''}
      ${jenis ? row('Est. assessment tax', mpkRM(p.area_m2 * MPK.rates.cukai) + '/yr') : ''}
    </div>`;
  if (MPK.popup) MPK.popup.remove();
  // focusAfterOpen off: otherwise the Enter that picked a search result also "presses" the
  // popup's freshly focused close button and shuts it straight away
  MPK.popup = new maplibregl.Popup({ maxWidth: '290px', focusAfterOpen: false }).setLngLat(lngLat).setHTML(html).addTo(map);
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

function mpkShowPage(page) {
  MPK.page = page;
  const feat = document.getElementById('mpk-feat-page'), featNav = document.getElementById('mpk-nav-feat');
  document.getElementById('mpk-nav-stats').classList.toggle('active', page === 'stats');
  if (featNav) featNav.classList.toggle('active', page === 'features');
  document.querySelector('.sidebar-section .nav-item:not(.mpk-nav)').classList.toggle('active', page === 'dashboard');
  document.getElementById('mpk-stats-page').hidden = page !== 'stats';
  if (feat) feat.hidden = page !== 'features';
  if (page !== 'dashboard' && typeof mpkFeatStop === 'function' && MPK_FEAT.key) mpkFeatStop();
  if (page === 'stats') mpkRenderStats();
  else if (map) map.resize();
}

function mpkRenderStats() {
  const el = document.getElementById('mpk-stats-page');
  const area = MPK.area, s = MPK.settings;
  const all = mpkBreakdown(MPK.data.buildings.features, s), b = all[area === 'all' ? 'all' : area];
  const chips = [['all', 'All areas'], ...Object.entries(MPK_AREAS).map(([k, a]) => [k, a.short])]
    .map(([k, label]) => `<button class="mpk-chip${k === area ? ' active' : ''}" onclick="mpkSelectArea('${k}')">${label}</button>`).join('');
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
        <div><h2>Statistics</h2>
          <p>Buildings in the marked areas only: Teluk Kalong inside the planning boundary, and along the two road corridors.</p></div>
        <div class="mpk-stats-actions">
          <button class="mpk-btn" onclick="mpkExportReport()">Export PDF report</button>
          <button class="mpk-wb-btn" onclick="mpkExportAllCSV()">Export CSV</button>
        </div>
      </header>
      <div class="mpk-chips">${chips}</div>

      <div class="mpk-stats-cards">
        <div class="mpk-stat"><div class="v">${mpkNum(b.total)}</div><div class="l">Buildings</div></div>
        <div class="mpk-stat"><div class="v">${mpkNum(b.m2)}</div><div class="l">Total footprint (m²)</div></div>
        <div class="mpk-stat legal"><div class="v">${mpkPct(b.byStatus.legal.pct)}</div><div class="l">Legal · on approved lot</div></div>
        <div class="mpk-stat danger"><div class="v">${mpkPct(b.byStatus.suspected.pct)}</div><div class="l">Suspected illegal</div></div>
        <div class="mpk-stat"><div class="v">${mpkPct(b.byStatus.unverified.pct)}</div><div class="l">Not verified</div></div>
      </div>

      <div class="mpk-stats-grid">
        <section class="mpk-stats-card">
          <h3>Legal vs illegal</h3>
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
    </div>`;
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
  const cap = maxView == null ? (currentBasemap === 'uzma-sat' ? UZMASAT_MAXZOOM : GLOBAL_MAXZOOM) : maxView;
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

function mpkSearchRender(placesPending) {
  const dd = document.getElementById('mpk-search-dd');
  const icons = { coord: '🎯', area: '🗺️', lot: '📐', building: '🏠', place: '📍' };
  const titles = { coord: 'Coordinate', area: 'Study areas', lot: 'Cadastral lots', building: 'Buildings', place: 'Places in Kemaman' };
  let html = '', last = null;
  MPK_SEARCH.results.forEach((r, i) => {
    if (r.kind !== last) { html += `<div class="search-section-header">${titles[r.kind]}</div>`; last = r.kind; }
    html += `<div class="search-item" role="option" onclick="mpkSearchPick(${i})">
      <div class="search-item-icon">${icons[r.kind]}</div>
      <div class="search-item-body"><div class="search-item-id">${r.label}</div><div class="search-item-cls">${r.sub || ''}</div></div></div>`;
  });
  if (placesPending) html += '<div class="search-loading">Searching places…</div>';
  if (!html) html = '<div class="search-loading">No matches. Try a lot no., UPI, Plus Code, place name or coordinate (e.g. 4.2681, 103.452).</div>';
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
  } else if (r.kind === 'building') {
    mpkZoomTo(r.id);
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
if (typeof module !== 'undefined') Object.assign(module.exports, { MPK_AREAS, MPK_STATUS, MPK_JENIS, MPK_SIZE_CLASSES });
