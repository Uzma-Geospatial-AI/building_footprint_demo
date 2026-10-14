// ============================================================
// MPK KEMAMAN — LIVE FOOTPRINTS
// Every time the dashboard loads it asks S3 (CORS is open) when the hand-digitised footprints
// (aoi_mpk_esri_2026-09-24_z18.geojson) last changed. If that is what mpk/sumber.json was built from, the
// built data is used as it is. If S3 is newer, the browser reads the footprints straight from S3 and merges
// them into the built data, so every refresh shows the latest digitising:
//   - a footprint within MATCH_M of a built one, with an area within 0.8 – 1.25 of it, is that building:
//     it keeps its id and everything worked out for it (status, plans, register records, lot, height),
//     with the new outline and area
//   - any other footprint is new: its area (Teluk Kalong boundary / Binjai – Chukai corridor / outside),
//     road distance, cadastral lot, Plus Code, the approved or rejected plan under it and a height from the
//     nearest built building (GHSL is a ~90 m grid) are worked out here; it gets the next free id
//   - built buildings with no footprint any more are dropped
// The hourly rebuild (tools/update_footprints.py) later does the full job (suspect list, register records,
// heights) and the app is back on built data.
// ============================================================
const MPK_LIVE = {
  SRC: 'https://digitalearthgeojson.s3.ap-southeast-5.amazonaws.com/building/aoi_mpk_esri_2026-09-24_z18.geojson',
  MATCH_M: 2, CORRIDOR_M: 50, FLOOR_M: 3.5, info: null,
};
const MPK_LIVE_KX = 111320 * Math.cos(4.27 * Math.PI / 180), MPK_LIVE_KY = 110574;

// ---------- Pure (exported for tools/test_mpk_live.js) ----------
// The file is labelled EPSG:32647 but holds Web Mercator metres
function mpkLiveLngLat(x, y) {
  const R = 6378137;
  return [Math.round(x / R * 180 / Math.PI * 1e7) / 1e7, Math.round(Math.atan(Math.sinh(y / R)) * 180 / Math.PI * 1e7) / 1e7];
}
function mpkLiveRingArea(ring) {
  let s = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    s += ring[i][0] * MPK_LIVE_KX * ring[i + 1][1] * MPK_LIVE_KY - ring[i + 1][0] * MPK_LIVE_KX * ring[i][1] * MPK_LIVE_KY;
  }
  return Math.abs(s) / 2;
}
function mpkLiveInRing(x, y, ring) {
  let ins = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) ins = !ins;
  }
  return ins;
}
function mpkLiveSegDist(p, a, b) {
  const x = p[0] * MPK_LIVE_KX, y = p[1] * MPK_LIVE_KY, x1 = a[0] * MPK_LIVE_KX, y1 = a[1] * MPK_LIVE_KY, x2 = b[0] * MPK_LIVE_KX, y2 = b[1] * MPK_LIVE_KY;
  const dx = x2 - x1, dy = y2 - y1, t = Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / ((dx * dx + dy * dy) || 1)));
  return Math.hypot(x - x1 - t * dx, y - y1 - t * dy);
}
// Open Location Code, 10 digits + 1 grid character (~3 m), as tools/build_mpk_manual.py
function mpkLivePlusCode(lat, lng) {
  const A = '23456789CFGHJMPQRVWX';
  let la = Math.floor((Math.min(Math.max(lat, -90), 89.9999999) + 90) * 40000 + 1e-7);
  let lo = Math.floor((((lng + 180) % 360) + 360) % 360 * 32000 + 1e-7);
  let laP = Math.floor(la / 5), laG = la % 5, loP = Math.floor(lo / 4), loG = lo % 4, code = '';
  [160000, 8000, 400, 20, 1].forEach((step, i) => {
    code += A[Math.floor(laP / step)] + A[Math.floor(loP / step)];
    laP %= step; loP %= step;
    if (i === 3) code += '+';
  });
  return code + A[laG * 4 + loG];
}
// One S3 feature → { geometry (lng/lat), outer ring, centre, area } or null when it has no usable ring
function mpkLiveShape(f) {
  const g = f.geometry;
  if (!g || !g.coordinates || !g.coordinates.length) return null;
  const polys = (g.type === 'Polygon' ? [g.coordinates] : g.coordinates)
    .map(poly => poly.map(ring => ring.map(c => mpkLiveLngLat(c[0], c[1])))).filter(p => p.length && p[0].length >= 4);
  if (!polys.length) return null;
  const outer = polys.map(p => p[0]).reduce((a, b) => mpkLiveRingArea(b) > mpkLiveRingArea(a) ? b : a);
  const pts = outer.slice(0, -1);
  const centre = [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length];
  const area = polys.reduce((s, p) => s + mpkLiveRingArea(p[0]) - p.slice(1).reduce((h, r) => h + mpkLiveRingArea(r), 0), 0);
  return { geometry: polys.length === 1 ? { type: 'Polygon', coordinates: polys[0] } : { type: 'MultiPolygon', coordinates: polys },
    outer, centre, area: Math.round(area * 10) / 10 };
}
// Pairs each new shape with the built building it is (nearest first, each built building once)
function mpkLiveMatch(shapes, built, matchM) {
  const G = 0.0003, grid = new Map();
  built.forEach((b, j) => { const k = Math.floor(b.lng / G) + ':' + Math.floor(b.lat / G); (grid.get(k) || grid.set(k, []).get(k)).push(j); });
  const pairs = [];
  shapes.forEach((s, i) => {
    const gx = Math.floor(s.centre[0] / G), gy = Math.floor(s.centre[1] / G);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      for (const j of grid.get((gx + dx) + ':' + (gy + dy)) || []) {
        const b = built[j], d = Math.hypot((b.lng - s.centre[0]) * MPK_LIVE_KX, (b.lat - s.centre[1]) * MPK_LIVE_KY);
        if (d <= matchM && b.area_m2 && s.area / b.area_m2 >= 0.8 && s.area / b.area_m2 <= 1.25) pairs.push([d, i, j]);
      }
    }
  });
  pairs.sort((a, b) => a[0] - b[0]);
  const of = new Array(shapes.length).fill(-1), taken = new Set();
  for (const [, i, j] of pairs) if (of[i] < 0 && !taken.has(j)) { of[i] = j; taken.add(j); }
  return of;
}

// ---------- Live merge ----------
// Called by mpkEnsureData (mpk.js) once the built data is loaded: returns the data, merged when S3 is newer
async function mpkLiveFootprints(data, sumber) {
  // S3 allows GET only (no HEAD): read the headers, and stop the download at once when nothing is new
  const ctl = new AbortController();
  let res;
  try { res = await fetch(MPK_LIVE.SRC, { cache: 'no-cache', signal: ctl.signal }); } catch (e) { return data; }   // offline: the built data
  const lm = res.ok ? res.headers.get('Last-Modified') || '' : '';
  MPK_LIVE.info = { lastModified: lm, live: false };
  if (!lm || (sumber && sumber.last_modified === lm)) { ctl.abort(); return data; }
  if (typeof showLoading === 'function') showLoading('Updating building footprints…', 'Newer digitising found on the source');
  try {
    const merged = mpkLiveMerge(data, (await res.json()).features);
    MPK_LIVE.info = { lastModified: lm, live: true, ...merged.stats };
    console.info('MPK live footprints', MPK_LIVE.info);
    return merged.data;
  } catch (e) {
    console.warn('MPK live footprints failed, using the built data', e);
    return data;
  }
}
function mpkLiveMerge(data, src) {
  const shapes = src.map(mpkLiveShape).filter(Boolean);
  const study = data.buildings.features, others = data.others ? data.others.features : [];
  const built = [...study.map(f => ({ f, study: true })), ...others.map(f => ({ f, study: false }))];
  const of = mpkLiveMatch(shapes, built.map(b => b.f.properties), MPK_LIVE.MATCH_M);
  const tkRing = (g => g.type === 'Polygon' ? g.coordinates[0] : g.coordinates[0][0])(data.boundary.features[0].geometry);
  const road = data.roads.features.filter(f => f.properties.kawasan === 'bbc').flatMap(f =>
    (f.geometry.type === 'LineString' ? [f.geometry.coordinates] : f.geometry.coordinates).flatMap(l => l.slice(1).map((c, i) => [l[i], c])));
  const lots = (data.kadaster ? data.kadaster.features : []).map(f => { const r = f.geometry.type === 'Polygon' ? f.geometry.coordinates[0] : f.geometry.coordinates[0][0];
    const xs = r.map(c => c[0]), ys = r.map(c => c[1]);
    return { r, b: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)], p: f.properties }; });
  const plans = (data.pelan ? data.pelan.features : []).filter(f => f.properties.keputusan !== 'tiada');
  let nextStudy = Math.max(0, ...study.map(f => f.properties.id)) + 1, nextOther = Math.max(100000, ...others.map(f => f.properties.id)) + 1;
  const outStudy = [], outOther = [];
  let kept = 0, added = 0;
  shapes.forEach((s, i) => {
    const [lng, lat] = s.centre;
    if (of[i] >= 0) {                                             // the same building, new outline
      const b = built[of[i]];
      kept++;
      const props = { ...b.f.properties, area_m2: s.area, lng: Math.round(lng * 1e6) / 1e6, lat: Math.round(lat * 1e6) / 1e6 };
      (b.study ? outStudy : outOther).push({ type: 'Feature', properties: props, geometry: s.geometry });
      return;
    }
    added++;
    const props = { area_m2: s.area, confidence: 1, sumber: 'manual_esri_20260924', plus_code: mpkLivePlusCode(lat, lng),
      lng: Math.round(lng * 1e6) / 1e6, lat: Math.round(lat * 1e6) / 1e6, live: true };
    const lot = lots.find(l => lng >= l.b[0] && lng <= l.b[2] && lat >= l.b[1] && lat <= l.b[3] && mpkLiveInRing(lng, lat, l.r));
    if (lot) { props.lot = lot.p.lot; props.upi = lot.p.upi; }
    let inStudy = false;
    if (mpkLiveInRing(lng, lat, tkRing)) { Object.assign(props, { kawasan: 'tk', dalam: true, kategori: 'tiada_pelan' }); inStudy = true; }
    else if (road.length && Math.min(...road.map(([a, b]) => mpkLiveSegDist(s.centre, a, b))) <= MPK_LIVE.CORRIDOR_M) {
      const d = Math.min(...[...s.outer, s.centre].flatMap(p => road.map(([a, b]) => mpkLiveSegDist(p, a, b))));
      Object.assign(props, { kawasan: 'bbc', kategori: 'koridor', jarak_jalan_m: Math.round(d * 10) / 10 });
      inStudy = true;
    }
    // an approved / rejected plan under it: a plan polygon holding its centre, or two plan vertices inside it
    const hits = plans.filter(pl => {
      const g = pl.geometry;
      if (g.type === 'MultiPolygon') return g.coordinates.some(p => mpkLiveInRing(lng, lat, p[0]));
      const pts = g.type === 'MultiLineString' ? g.coordinates.flat() : g.type === 'MultiPoint' ? g.coordinates : [];
      let n = 0;
      for (const p of pts) { if (Math.abs(p[0] - lng) < 0.002 && Math.abs(p[1] - lat) < 0.002 && mpkLiveInRing(p[0], p[1], s.outer) && ++n >= 2) return true; }
      return false;
    });
    const ok = hits.filter(h => h.properties.keputusan === 'lulus'), use = ok.length ? ok : hits;
    if (use.length) {
      const q = use.reduce((a, b) => (b.properties.tarikh || '') > (a.properties.tarikh || '') ? b : a).properties;
      Object.assign(props, { pelan_fail: q.fail, pelan_tarikh: q.tarikh, pelan_status: q.status, pelan_jenis: q.jenis, pelan_n: use.length, pelan_sumber: q.sumber });
      if (inStudy) props.kategori = ok.length ? 'lulus' : 'tolak';
    }
    if (inStudy) {
      // height from the nearest built study building (GHSL heights are a ~90 m grid)
      let best = null;
      for (const f of study) {
        const q = f.properties, d = Math.hypot((q.lng - lng) * MPK_LIVE_KX, (q.lat - lat) * MPK_LIVE_KY);
        if (q.tinggi_m && d <= 120 && (!best || d < best.d)) best = { d, q };
      }
      props.tinggi_m = best ? best.q.tinggi_m : MPK_LIVE.FLOOR_M;
      props.tingkat_est = best ? best.q.tingkat_est : 1;
      props.tinggi_src = best ? 'GHSL 2018 (90 m), nearest building' : 'default';
      props.id = nextStudy++;
      outStudy.push({ type: 'Feature', properties: props, geometry: s.geometry });
    } else {
      props.id = nextOther++;
      outOther.push({ type: 'Feature', properties: props, geometry: s.geometry });
    }
  });
  const stats = { footprints: shapes.length, kept, added, removed: built.length - kept, study: outStudy.length, others: outOther.length };
  return { data: { ...data, buildings: { ...data.buildings, features: outStudy }, others: data.others ? { ...data.others, features: outOther } : data.others }, stats };
}

if (typeof module !== 'undefined') {
  module.exports = { mpkLiveLngLat, mpkLiveRingArea, mpkLiveInRing, mpkLivePlusCode, mpkLiveShape, mpkLiveMatch, mpkLiveMerge, MPK_LIVE };
}
