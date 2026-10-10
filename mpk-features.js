// ============================================================
// MPK KEMAMAN — FEATURES
// Ten showcase tools on the MPK data, launched from the Features page (sidebar, under
// Statistics). Each runs on the map with a floating HUD and cleans up after itself:
//   tour · radar · hotspots · priority · route · ask · passport · coverage · timemachine · simulator
// Pure logic (geometry, clustering, scoring, routing, the question parser) is exported for
// tools/test_mpk_features.js. Loaded after mpk.js.
// ============================================================

// ---------- Pure: geometry ----------
const MPK_M_PER_DEG = 111320;

// Local metres per degree at a latitude: [x per ° lng, y per ° lat]
const mpkMScale = lat => [MPK_M_PER_DEG * Math.cos(lat * Math.PI / 180), MPK_M_PER_DEG];

function mpkMetres(a, b) {
  const [kx, ky] = mpkMScale((a[1] + b[1]) / 2);
  return Math.hypot((a[0] - b[0]) * kx, (a[1] - b[1]) * ky);
}

// Polygon ring area in m² (shoelace in a local metric projection)
function mpkRingArea(ring) {
  const [kx, ky] = mpkMScale(ring[0][1]);
  let s = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    s += (ring[j][0] * kx) * (ring[i][1] * ky) - (ring[i][0] * kx) * (ring[j][1] * ky);
  }
  return Math.abs(s) / 2;
}

function mpkPolyArea(geom) {
  const poly = rings => rings.reduce((a, r, i) => a + (i ? -1 : 1) * mpkRingArea(r), 0);
  if (geom.type === 'Polygon') return poly(geom.coordinates);
  if (geom.type === 'MultiPolygon') return geom.coordinates.reduce((a, p) => a + poly(p), 0);
  return 0;
}

// Compass bearing from c to p, 0–360° clockwise from north
function mpkBearing(c, p) {
  const [kx, ky] = mpkMScale(c[1]);
  const b = Math.atan2((p[0] - c[0]) * kx, (p[1] - c[1]) * ky) * 180 / Math.PI;
  return (b + 360) % 360;
}

// Point `m` metres from c on bearing `deg`
function mpkOffset(c, deg, m) {
  const [kx, ky] = mpkMScale(c[1]), r = deg * Math.PI / 180;
  return [c[0] + Math.sin(r) * m / kx, c[1] + Math.cos(r) * m / ky];
}

// Convex hull (monotone chain) of [lng, lat] points, counter-clockwise, not closed
function mpkConvexHull(pts) {
  const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return p;
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [], upper = [];
  for (const q of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop();
    lower.push(q);
  }
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop();
    upper.push(q);
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

// ---------- Pure: hotspots (DBSCAN on suspected buildings) ----------
// labels[i] = cluster number (0, 1, …) or -1 for noise
function mpkDbscan(pts, eps, minPts) {
  const n = pts.length, labels = new Array(n).fill(undefined);
  const near = i => { const r = []; for (let j = 0; j < n; j++) if (mpkMetres(pts[i], pts[j]) <= eps) r.push(j); return r; };
  let c = -1;
  for (let i = 0; i < n; i++) {
    if (labels[i] !== undefined) continue;
    const nb = near(i);
    if (nb.length < minPts) { labels[i] = -1; continue; }
    labels[i] = ++c;
    const queue = nb.filter(j => j !== i);
    while (queue.length) {
      const j = queue.shift();
      if (labels[j] === -1) labels[j] = c;
      if (labels[j] !== undefined) continue;
      labels[j] = c;
      const nb2 = near(j);
      if (nb2.length >= minPts) queue.push(...nb2);
    }
  }
  return labels;
}

// Clusters of suspected buildings: [{ id:'H1', n, m2, ids, kawasan, center, hull }] biggest first
function mpkHotspots(features, s, eps = 150, minPts = 4) {
  const sus = features.filter(f => mpkJenis(f.properties, s));
  const pts = sus.map(f => [f.properties.lng, f.properties.lat]);
  const labels = mpkDbscan(pts, eps, minPts);
  const groups = new Map();
  labels.forEach((l, i) => { if (l >= 0) { if (!groups.has(l)) groups.set(l, []); groups.get(l).push(i); } });
  return [...groups.values()].map(idx => {
    const mem = idx.map(i => sus[i].properties);
    const center = [mem.reduce((a, p) => a + p.lng, 0) / mem.length, mem.reduce((a, p) => a + p.lat, 0) / mem.length];
    // hull pushed 30 m out from the centre so the buildings sit inside the shape
    const hull = mpkConvexHull(idx.map(i => pts[i])).map(q => mpkOffset(q, mpkBearing(center, q), 30));
    const byArea = {};
    mem.forEach(p => { byArea[p.kawasan] = (byArea[p.kawasan] || 0) + 1; });
    return { n: mem.length, m2: mem.reduce((a, p) => a + p.area_m2, 0), ids: mem.map(p => p.id),
             kawasan: Object.entries(byArea).sort((a, b) => b[1] - a[1])[0][0], center, hull };
  }).sort((a, b) => b.n - a.n || b.m2 - a.m2).map((h, i) => ({ id: 'H' + (i + 1), ...h }));
}

// ---------- Pure: enforcement priority (0–100) ----------
// size 45% (log scale, 10 m² → 0, 5,000 m² → 1) · evidence 25% (on MPK's list = 1; road
// reserve = 0.4 at the reserve edge up to 1 on the centreline) · AI confidence 15% · in a hotspot 15%
const MPK_PRIORITY_WEIGHTS = { size: 0.45, evidence: 0.25, confidence: 0.15, cluster: 0.15 };
function mpkPriority(p, s, inHotspot) {
  const clamp = v => Math.max(0, Math.min(1, v));
  const j = mpkJenis(p, s);
  if (!j) return null;
  const parts = {
    size: clamp((Math.log10(Math.max(p.area_m2, 1)) - 1) / (Math.log10(5000) - 1)),
    evidence: j === 'mockup' ? 1 : clamp(0.4 + 0.6 * (1 - p.jarak_jalan_m / s.rizab)),
    confidence: clamp(p.confidence || 0),
    cluster: inHotspot ? 1 : 0,
  };
  const score = Math.round(100 * Object.entries(MPK_PRIORITY_WEIGHTS).reduce((a, [k, w]) => a + w * parts[k], 0));
  return { score, parts };
}

// Suspected buildings with their score, highest first
function mpkPriorityList(features, s, hotspots) {
  const inHot = new Set((hotspots || []).flatMap(h => h.ids));
  return features.map(f => ({ p: f.properties, pr: mpkPriority(f.properties, s, inHot.has(f.properties.id)) }))
    .filter(x => x.pr).sort((a, b) => b.pr.score - a.pr.score || b.p.area_m2 - a.p.area_m2);
}

// ---------- Pure: inspection route (fallback when the road router is offline) ----------
// Open path from stop 0: nearest neighbour, then 2-opt. Returns the visiting order (indices).
function mpkRouteOrder(pts) {
  if (pts.length < 3) return pts.map((_, i) => i);
  const left = new Set(pts.map((_, i) => i)), order = [0];
  left.delete(0);
  while (left.size) {
    const last = pts[order[order.length - 1]];
    let best = null, bd = Infinity;
    for (const i of left) { const d = mpkMetres(last, pts[i]); if (d < bd) { bd = d; best = i; } }
    order.push(best); left.delete(best);
  }
  const d = (a, b) => mpkMetres(pts[order[a]], pts[order[b]]);
  for (let improved = true; improved;) {
    improved = false;
    for (let i = 1; i < order.length - 1; i++) {
      for (let k = i + 1; k < order.length; k++) {
        const before = d(i - 1, i) + (k + 1 < order.length ? d(k, k + 1) : 0);
        const after = d(i - 1, k) + (k + 1 < order.length ? d(i, k + 1) : 0);
        if (after < before - 1e-6) { order.splice(i, k - i + 1, ...order.slice(i, k + 1).reverse()); improved = true; }
      }
    }
  }
  return order;
}

const mpkPathLength = pts => pts.slice(1).reduce((a, p, i) => a + mpkMetres(pts[i], p), 0);

// Google Maps directions through the stops, in order
function mpkGmapsDir(pts) {
  return 'https://www.google.com/maps/dir/' + pts.map(p => p[1].toFixed(6) + ',' + p[0].toFixed(6)).join('/');
}

// ---------- Pure: lot coverage ----------
// Building footprint ÷ lot area, per cadastral lot that has buildings (joined on UPI)
function mpkLotCoverage(lots, buildings) {
  const built = new Map();
  buildings.forEach(f => {
    const p = f.properties;
    if (!p.upi) return;
    const b = built.get(p.upi) || { m2: 0, n: 0 };
    b.m2 += p.area_m2; b.n += 1;
    built.set(p.upi, b);
  });
  const seen = new Set();
  return lots.filter(l => built.has(l.properties.upi) && !seen.has(l.properties.upi) && seen.add(l.properties.upi))
    .map(l => {
      const lotM2 = mpkPolyArea(l.geometry), b = built.get(l.properties.upi);
      return { lot: l.properties.lot, upi: l.properties.upi, lotM2, builtM2: b.m2, n: b.n,
               pct: lotM2 > 0 ? 100 * b.m2 / lotM2 : 0, geometry: l.geometry };
    }).sort((a, b) => b.pct - a.pct);
}

// ---------- Pure: policy simulator ----------
// Suspected buildings and footprint for each road-reserve width rMin..rMax (m)
function mpkPolicyCurve(features, rMin = 3, rMax = 20) {
  const out = [];
  for (let r = rMin; r <= rMax; r++) {
    let n = 0, m2 = 0;
    features.forEach(f => { if (mpkJenis(f.properties, { rizab: r })) { n++; m2 += f.properties.area_m2; } });
    out.push({ r, n, m2 });
  }
  return out;
}

// ---------- Pure: time machine frames ----------
// One frame per distinct capture date for the area, oldest first
function mpkTimeFrames(history, area) {
  const seen = new Set();
  return (history || []).map(h => ({ release: h.release, capture: (h.capture || {})[area] || h.date }))
    .filter(f => f.capture && !seen.has(f.capture) && seen.add(f.capture))
    .sort((a, b) => a.capture.localeCompare(b.capture));
}

// ---------- Pure: "Ask the map" (English and Malay) ----------
function mpkAsk(text) {
  const t = ' ' + String(text || '').toLowerCase().replace(/(\d),(?=\d{3})/g, '$1').replace(/[?!.,]/g, ' ').replace(/\s+/g, ' ') + ' ';
  const q = { intent: null, area: null, status: null, min: null, max: null, lot: null };
  if (/teluk|kalong/.test(t)) q.area = 'tk';
  else if (/putra|berenjut/.test(t)) q.area = 'bpb';
  else if (/binjai|chukai/.test(t)) q.area = 'bbc';
  if (/illegal|haram|suspect|disyaki|syak|tidak sah|tak sah|tanpa kebenaran/.test(t)) q.status = 'suspected';
  else if (/not verified|unverified|belum|unknown/.test(t)) q.status = 'unverified';
  else if (/\blegal\b|\bsah\b|approved|lulus/.test(t)) q.status = 'legal';
  const num = s => parseInt(s.replace(/,/g, ''), 10);
  let m = t.match(/(?:over|above|more than|bigger than|larger than|greater than|>|lebih(?: daripada| dari)?|melebihi|atas)\s*([\d,]+)/);
  if (m) q.min = num(m[1]);
  m = t.match(/(?:under|below|less than|smaller than|<|kurang(?: daripada| dari)?|bawah)\s*([\d,]+)/);
  if (m) q.max = num(m[1]);
  m = t.match(/\blot\s*(?:no\.?\s*|number\s*|nombor\s*)?(\d{2,})/);
  if (m) q.lot = m[1];
  const has = re => re.test(t);
  if (has(/\b(reset|clear|semula|padam)\b/)) q.intent = 'reset';
  else if (has(/\b(tour|drone|fly|terbang|lawat maya)\b/)) q.intent = 'tour';
  else if (has(/\b(radar|scan|imbas)\b/)) q.intent = 'radar';
  else if (has(/hotspot|cluster|kelompok|tumpuan/)) q.intent = 'hotspots';
  else if (has(/route|inspection|inspect|laluan|lawatan tapak|pemeriksaan/)) q.intent = 'route';
  else if (has(/time ?machine|history|historical|sejarah|wayback|dulu/)) q.intent = 'timemachine';
  else if (has(/priority|urgent|keutamaan|segera/)) q.intent = 'priority';
  else if (has(/coverage|over-?built|density|padat|liputan/)) q.intent = 'coverage';
  else if (has(/simulat|what if|policy|dasar|reserve|rizab/)) q.intent = 'simulator';
  else if (has(/passport|pasport|profile|profil/)) q.intent = 'passport';
  else if (q.lot) q.intent = 'lot';
  else if (has(/largest|biggest|terbesar|paling besar|besar sekali/)) q.intent = 'largest';
  else if (has(/how many|how much|berapa|count|jumlah|total|bilangan/)) q.intent = 'count';
  else if (q.status || q.area || q.min != null || q.max != null || has(/\b(show|tunjuk|papar|cari|find)\b/)) q.intent = 'show';
  else q.intent = 'help';
  return q;
}

// Buildings matching the parsed question
function mpkAskMatch(q, features, s) {
  return features.filter(f => {
    const p = f.properties;
    if (q.area && p.kawasan !== q.area) return false;
    if (q.status && mpkStatus(p, s) !== q.status) return false;
    if (q.min != null && p.area_m2 <= q.min) return false;
    if (q.max != null && p.area_m2 >= q.max) return false;
    if (q.lot && String(p.lot) !== q.lot) return false;
    return true;
  });
}

// One-line answer for count / show / largest / lot questions
function mpkAskAnswer(q, features, s) {
  const hits = mpkAskMatch(q, features, s);
  const n = hits.length, m2 = hits.reduce((a, f) => a + f.properties.area_m2, 0);
  const fmt = v => Math.round(v).toLocaleString('en-MY');
  const what = (q.status ? { suspected: 'suspected illegal', legal: 'legal', unverified: 'not-verified' }[q.status] + ' ' : '')
    + (n === 1 ? 'building' : 'buildings')
    + (q.min != null ? ` over ${fmt(q.min)} m²` : '') + (q.max != null ? ` under ${fmt(q.max)} m²` : '')
    + (q.lot ? ` on lot ${q.lot}` : '')
    + (q.area ? ' in ' + MPK_AREAS[q.area].short : ' in the marked areas');
  if (q.intent === 'largest') {
    const top = hits.slice().sort((a, b) => b.properties.area_m2 - a.properties.area_m2)[0];
    if (!top) return { text: `No ${what}.`, ids: [] };
    return { text: `The largest ${what.replace(/^buildings?/, 'building').replace('buildings', 'building')} is ${top.properties.plus_code}: `
      + `${fmt(top.properties.area_m2)} m².`, ids: [top.properties.id], focus: top.properties.id };
  }
  return { text: n ? `${fmt(n)} ${what}, ${fmt(m2)} m² of footprint.` : `No ${what}.`, ids: hits.map(f => f.properties.id) };
}

if (typeof module !== 'undefined') {
  module.exports = { mpkMetres, mpkRingArea, mpkPolyArea, mpkBearing, mpkOffset, mpkConvexHull, mpkDbscan, mpkHotspots,
    mpkPriority, mpkPriorityList, mpkRouteOrder, mpkPathLength, mpkGmapsDir, mpkLotCoverage, mpkPolicyCurve, mpkTimeFrames,
    mpkAsk, mpkAskMatch, mpkAskAnswer, MPK_PRIORITY_WEIGHTS };
}

// ============================================================
// Browser: Features page, HUD and the ten tools
// ============================================================
const MPK_FEATURES = [
  { key: 'tour', icon: '🚁', title: 'Drone Tour', tag: 'Cinematic 3D flight',
    text: 'The map rises into 3D and flies itself from one high-priority case to the next, orbiting each building with its facts on screen. Loops as a booth showcase.' },
  { key: 'radar', icon: '📡', title: 'Radar Sweep', tag: 'Live detection scan',
    text: 'A radar beam sweeps the study area and every suspected building lights up the moment the beam passes, with a live counter.' },
  { key: 'hotspots', icon: '🔥', title: 'Hotspot Finder', tag: 'Spatial clustering (DBSCAN)',
    text: 'Finds clusters of suspected buildings automatically and draws a zone around each one, ranked by size: where enforcement teams get the most out of one visit.' },
  { key: 'priority', icon: '🎯', title: 'Priority Score', tag: 'Explainable 0–100 ranking',
    text: 'Scores every suspected building on size, evidence, AI confidence and clustering. The map recolours by urgency and each score shows its breakdown.' },
  { key: 'route', icon: '🧭', title: 'Smart Inspection Route', tag: 'Optimised field visit',
    text: 'Plans the shortest driving route through the top cases on real roads, with distance and drive time, and sends it to Google Maps in one tap.' },
  { key: 'ask', icon: '🎙️', title: 'Ask the Map', tag: 'Voice or text, English & Malay',
    text: 'Ask “how many illegal buildings in Binjai?” or “tunjuk bangunan haram lebih 1000 m²”. The map answers, highlights the buildings and can speak back.' },
  { key: 'passport', icon: '🪪', title: 'Building Passport', tag: 'One-click case file + QR',
    text: 'Click any building for its case file: satellite close-up, status, lot, UPI, score and a QR code that opens the site on a phone.' },
  { key: 'coverage', icon: '🧱', title: 'Lot Coverage X-ray', tag: 'Over-built lots',
    text: 'Measures how much of each cadastral lot is covered by buildings and shades every lot, flagging the most densely built ones.' },
  { key: 'timemachine', icon: '⏳', title: 'Time Machine', tag: 'Up to 20 years of imagery',
    text: 'Plays every historical satellite capture of the site as a smooth time-lapse, so you can watch the land being cleared and built on.' },
  { key: 'simulator', icon: '🎚️', title: 'Policy Simulator', tag: 'What-if, live',
    text: 'Drag the road-reserve width and watch buildings switch to suspected on the map in real time, with counts, footprint and fees updating as you drag.' },
];

const MPK_FEAT = { key: null, token: 0, layers: [], sources: [], cleanup: [], raf: null, capture: false, booth: false };

// ---------- Page ----------
function mpkBuildFeaturesPage() {
  if (!document.getElementById('mpk-nav-feat')) {
    const stats = document.getElementById('mpk-nav-stats');
    const nav = document.createElement('a');
    nav.href = '#';
    nav.className = 'nav-item mpk-nav';
    nav.id = 'mpk-nav-feat';
    nav.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15 9 22 9.5 16.5 14 18.5 21 12 17 5.5 21 7.5 14 2 9.5 9 9 12 2"/></svg>Features';
    nav.addEventListener('click', e => { e.preventDefault(); mpkShowPage('features'); });
    stats.after(nav);
  }
  if (!document.getElementById('mpk-feat-page')) {
    const page = document.createElement('section');
    page.id = 'mpk-feat-page';
    page.className = 'mpk-stats-page mpk-feat-page';
    page.hidden = true;
    page.setAttribute('aria-label', 'Features');
    page.innerHTML = `<div class="mpk-stats-inner">
        <header class="mpk-feat-hero">
          <div>
            <div class="mpk-feat-kicker">BuildVision · MPK Kemaman</div>
            <h2>${MPK_FEATURES.length} smart tools built on the MPK data</h2>
            <p>Each one runs live on the real buildings, lots and imagery of Teluk Kalong and the two road corridors.</p>
          </div>
          <button class="mpk-feat-booth" onclick="mpkFeatLaunch('tour', { booth: true })">
            <span>▶</span><b>Start booth mode</b><small>Drone tour on a loop · tap the map to stop</small></button>
        </header>
        <div class="mpk-feat-grid">${MPK_FEATURES.map((f, i) => `
          <article class="mpk-feat-card" style="--i:${i}">
            <div class="mpk-feat-top"><span class="mpk-feat-icon" aria-hidden="true">${f.icon}</span><span class="mpk-feat-no">${String(i + 1).padStart(2, '0')}</span></div>
            <h3>${f.title}</h3>
            <div class="mpk-feat-tag">${f.tag}</div>
            <p>${f.text}</p>
            <button class="mpk-btn" onclick="mpkFeatLaunch('${f.key}')">Launch</button>
          </article>`).join('')}
        </div>
      </div>`;
    document.getElementById('mapWrapper').appendChild(page);
  }
  if (!document.getElementById('mpk-hud')) {
    const hud = document.createElement('div');
    hud.id = 'mpk-hud';
    hud.className = 'mpk-hud';
    hud.hidden = true;
    hud.setAttribute('role', 'region');
    hud.setAttribute('aria-live', 'polite');
    document.getElementById('mapWrapper').appendChild(hud);
  }
}

// ---------- Runtime helpers ----------
function mpkHud(title, body, opts = {}) {
  const hud = document.getElementById('mpk-hud');
  hud.className = 'mpk-hud' + (opts.wide ? ' wide' : '') + (opts.side ? ' side' : '');
  hud.innerHTML = `<div class="mpk-hud-head"><span class="mpk-hud-icon">${opts.icon || ''}</span><b>${title}</b>
      <button class="mpk-hud-x" onclick="mpkFeatStop()" aria-label="Close">✕</button></div>
    <div class="mpk-hud-body" id="mpk-hud-body">${body}</div>`;
  hud.hidden = false;
}
const mpkHudBody = html => { const b = document.getElementById('mpk-hud-body'); if (b) b.innerHTML = html; };

function mpkFeatSrc(id, data) {
  if (map.getSource(id)) map.getSource(id).setData(data);
  else { map.addSource(id, { type: 'geojson', data }); MPK_FEAT.sources.push(id); }
}
function mpkFeatLayer(def, before) {
  if (map.getLayer(def.id)) map.removeLayer(def.id);
  map.addLayer(def, before);
  if (!MPK_FEAT.layers.includes(def.id)) MPK_FEAT.layers.push(def.id);
}
const mpkFC = features => ({ type: 'FeatureCollection', features });
const mpkPt = (c, props = {}) => ({ type: 'Feature', properties: props, geometry: { type: 'Point', coordinates: c } });

// Promise helpers that give up quietly once the feature is stopped
const mpkFeatAlive = token => MPK_FEAT.token === token;
const mpkFeatWait = ms => new Promise(r => { const t = setTimeout(r, ms); MPK_FEAT.cleanup.push(() => clearTimeout(t)); });
function mpkFeatMove(run, timeout = 12000) {
  return new Promise(resolve => {
    const done = () => { clearTimeout(t); map.off('moveend', done); resolve(); };
    const t = setTimeout(done, timeout);
    map.once('moveend', done);
    MPK_FEAT.cleanup.push(() => { clearTimeout(t); map.off('moveend', done); });
    run();
  });
}

// Fit bounds and set pitch / bearing in one move
function mpkFeatFit(bounds, opts = {}) {
  const { pitch = 0, bearing = 0, padding = 50, duration = 1000, maxZoom } = opts;
  const cam = map.cameraForBounds(bounds, { padding, bearing, ...(maxZoom != null ? { maxZoom } : {}) });
  if (!cam || !isFinite(cam.zoom)) return;
  map.easeTo({ ...cam, bearing, pitch, duration });
}

// Data the tools share (selected area)
function mpkFeatData() {
  const feats = mpkAreaFeatures(), s = MPK.settings;
  const hotspots = mpkHotspots(feats, s);
  return { feats, s, hotspots, ranked: mpkPriorityList(feats, s, hotspots) };
}

function mpkFeatLaunch(key, opts = {}) {
  if (!MPK.active || !map) return;
  mpkFeatStop();
  if (MPK.page !== 'dashboard') mpkShowPage('dashboard');
  if (MPK.popup) { MPK.popup.remove(); MPK.popup = null; }
  MPK_FEAT.key = key;
  MPK_FEAT.booth = !!opts.booth;
  const token = ++MPK_FEAT.token;
  const f = MPK_FEATURES.find(x => x.key === key);
  addActivityLog('Feature · ' + f.title, MPK.area === 'all' ? 'All areas' : MPK_AREAS[MPK.area].short);
  setTimeout(() => { if (mpkFeatAlive(token)) MPK_FEAT_RUN[key](token, opts); }, map.loaded() ? 0 : 300);
}

function mpkFeatStop() {
  MPK_FEAT.token++;
  MPK_FEAT.cleanup.splice(0).forEach(fn => { try { fn(); } catch (e) {} });
  if (MPK_FEAT.raf) { cancelAnimationFrame(MPK_FEAT.raf); MPK_FEAT.raf = null; }
  if (map) {
    MPK_FEAT.layers.splice(0).forEach(id => { try { if (map.getLayer(id)) map.removeLayer(id); } catch (e) {} });
    MPK_FEAT.sources.splice(0).forEach(id => { try { if (map.getSource(id)) map.removeSource(id); } catch (e) {} });
  }
  if (MPK_FEAT.key && map) try { map.getSource('mpk-highlight').setData(mpkFC([])); } catch (e) {}
  MPK_FEAT.capture = false;
  MPK_FEAT.key = null;
  MPK_FEAT.booth = false;
  if (window.speechSynthesis) try { speechSynthesis.cancel(); } catch (e) {}
  const hud = document.getElementById('mpk-hud');
  if (hud) { hud.hidden = true; hud.innerHTML = ''; }
}

// Stop a running animation when the person takes the map
function mpkFeatStopOnTouch() {
  const stop = () => mpkFeatStop();
  ['mousedown', 'touchstart', 'wheel'].forEach(ev => map.getCanvas().addEventListener(ev, stop, { once: true, passive: true }));
  MPK_FEAT.cleanup.push(() => ['mousedown', 'touchstart', 'wheel'].forEach(ev => map.getCanvas().removeEventListener(ev, stop)));
}

// 3D buildings coloured by status, rising from the ground over `ms`
function mpkFeat3D(feats, s, ms = 1800) {
  const height = { suspected: 16, legal: 9, unverified: 5 };
  mpkFeatSrc('mpk-feat-3d', mpkFC(feats.map(f => ({ ...f, properties: { ...f.properties, st: mpkStatus(f.properties, s),
    h: height[mpkStatus(f.properties, s)] * (0.7 + 0.6 * Math.min(1, f.properties.area_m2 / 1500)) } }))));
  const color = ['match', ['get', 'st'], 'suspected', MPK_SUSPECT_COLOR, 'legal', MPK_STATUS.legal.color, '#B0BEC5'];
  mpkFeatLayer({ id: 'mpk-feat-3d', type: 'fill-extrusion', source: 'mpk-feat-3d',
    paint: { 'fill-extrusion-color': color, 'fill-extrusion-height': 0, 'fill-extrusion-opacity': 0.9,
             'fill-extrusion-vertical-gradient': true } });
  const t0 = performance.now();
  const step = now => {
    if (!map.getLayer('mpk-feat-3d')) return;
    const t = Math.min(1, (now - t0) / ms), e = 1 - Math.pow(1 - t, 3);
    map.setPaintProperty('mpk-feat-3d', 'fill-extrusion-height', ['*', ['get', 'h'], e]);
    if (t < 1) MPK_FEAT.raf = requestAnimationFrame(step);
  };
  MPK_FEAT.raf = requestAnimationFrame(step);
}

const mpkFmtM2 = n => mpkNum(n) + ' m²';
const mpkFeatReason = (p, s) => mpkJenis(p, s) === 'mockup' ? 'On MPK suspect list'
  : `${p.jarak_jalan_m} m from road centreline (reserve ${s.rizab} m)`;

// ---------- The ten tools ----------
const MPK_FEAT_RUN = {
  // 1. Drone tour: 3D rise, then fly and orbit through the top cases (loops in booth mode)
  async tour(token, opts) {
    const { feats, s, ranked } = mpkFeatData();
    const stops = ranked.slice(0, 8);
    mpkHud('Drone Tour', '<div class="mpk-hud-big">Taking off…</div>', { icon: '🚁', wide: true });
    if (!stops.length) { mpkHudBody('No suspected buildings in this area.'); return; }
    mpkFeat3D(feats, s);
    mpkFeatStopOnTouch();
    for (let loop = 0; mpkFeatAlive(token) && (loop === 0 || MPK_FEAT.booth); loop++) {
      await mpkFeatMove(() => mpkFeatFit(MPK.bounds[MPK.area], { padding: 60, pitch: 50, bearing: -20, duration: 2500 }));
      if (!mpkFeatAlive(token)) return;
      mpkHudBody(`<div class="mpk-hud-big">${mpkNum(ranked.length)} suspected buildings</div>
        <div class="mpk-hud-sub">Flying to the ${stops.length} highest-priority cases…</div>`);
      await mpkFeatWait(1800);
      for (let i = 0; i < stops.length && mpkFeatAlive(token); i++) {
        const { p, pr } = stops[i], bearing = (i * 70 + 20) % 360;
        mpkHudBody(`<div class="mpk-hud-row"><span class="mpk-hud-step">${i + 1}/${stops.length}</span>
            <span class="mpk-hud-score" style="--c:${mpkScoreColor(pr.score)}">${pr.score}</span>
            <div><b>${p.plus_code}</b><div class="mpk-hud-sub">${MPK_AREAS[p.kawasan].short} · ${mpkFmtM2(p.area_m2)}${p.lot ? ' · Lot ' + p.lot : ''}</div>
            <div class="mpk-hud-sub">${mpkFeatReason(p, s)}</div></div></div>
          <div class="mpk-hud-progress"><i style="width:${(i + 1) / stops.length * 100}%"></i></div>`);
        try { map.getSource('mpk-highlight').setData(MPK.data.buildings.features.find(f => f.properties.id === p.id)); } catch (e) {}
        await mpkFeatMove(() => map.flyTo({ center: [p.lng, p.lat], zoom: 18, pitch: 62, bearing, duration: 4200, curve: 1.5, essential: true }));
        if (!mpkFeatAlive(token)) return;
        await mpkFeatMove(() => map.easeTo({ bearing: bearing + 75, duration: 4500, easing: t => t }));
      }
    }
    if (!mpkFeatAlive(token)) return;
    try { map.getSource('mpk-highlight').setData(mpkFC([])); } catch (e) {}
    map.easeTo({ pitch: 45, duration: 1200 });
    mpkHudBody(`<div class="mpk-hud-big">Tour complete</div><div class="mpk-hud-actions">
      <button class="mpk-btn" onclick="mpkFeatLaunch('tour')">Fly again</button>
      <button class="mpk-wb-btn" onclick="mpkFeatLaunch('tour', { booth: true })">Loop for booth</button></div>`);
  },

  // 2. Radar sweep around the area centre; buildings light up as the beam passes
  radar(token) {
    const { feats, s, ranked } = mpkFeatData();
    const b = MPK.bounds[MPK.area], c = [(b[0][0] + b[1][0]) / 2, (b[0][1] + b[1][1]) / 2];
    const pts = ranked.map(({ p }) => mpkPt([p.lng, p.lat], { ang: mpkBearing(c, [p.lng, p.lat]), m2: p.area_m2 }));
    const radius = Math.max(300, ...feats.map(f => mpkMetres(c, [f.properties.lng, f.properties.lat]))) * 1.05;
    const ring = (r, from = 0, to = 360) => {
      const out = [];
      for (let a = from; a <= to; a += 3) out.push(mpkOffset(c, a, r));
      return out;
    };
    mpkFeatFit([mpkOffset(c, 225, radius * 1.42), mpkOffset(c, 45, radius * 1.42)], { padding: 30, duration: 1200 });
    const world = [[[-180, -85], [180, -85], [180, 85], [-180, 85], [-180, -85]]];
    mpkFeatSrc('mpk-feat-dim', { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: world } });
    mpkFeatLayer({ id: 'mpk-feat-dim', type: 'fill', source: 'mpk-feat-dim', paint: { 'fill-color': '#04121c', 'fill-opacity': 0.55 } });
    mpkFeatSrc('mpk-feat-rings', mpkFC([0.25, 0.5, 0.75, 1].map(k => ({ type: 'Feature', properties: {},
      geometry: { type: 'LineString', coordinates: ring(radius * k) } })).concat([0, 90, 180, 270].map(a => ({ type: 'Feature',
      properties: {}, geometry: { type: 'LineString', coordinates: [c, mpkOffset(c, a, radius)] } })))));
    mpkFeatLayer({ id: 'mpk-feat-rings', type: 'line', source: 'mpk-feat-rings',
      paint: { 'line-color': '#4DD0E1', 'line-opacity': 0.45, 'line-width': 1 } });
    mpkFeatSrc('mpk-feat-beam', mpkFC([]));
    mpkFeatLayer({ id: 'mpk-feat-beam', type: 'fill', source: 'mpk-feat-beam',
      paint: { 'fill-color': '#4DD0E1', 'fill-opacity': ['get', 'o'] } });
    mpkFeatSrc('mpk-feat-blips', mpkFC(pts));
    mpkFeatLayer({ id: 'mpk-feat-blips', type: 'circle', source: 'mpk-feat-blips', filter: ['<=', ['get', 'ang'], -1],
      paint: { 'circle-color': '#FF5252', 'circle-stroke-color': '#fff', 'circle-stroke-width': 1,
               'circle-radius': 4, 'circle-blur': 0.15 } });
    const total = pts.length, totalM2 = ranked.reduce((a, x) => a + x.p.area_m2, 0);
    mpkHud('Radar Sweep', '', { icon: '📡' });
    const render = (n, m2, done) => mpkHudBody(`<div class="mpk-hud-big mono">${mpkNum(n)}<small> / ${mpkNum(total)}</small></div>
      <div class="mpk-hud-sub">suspected buildings detected · ${mpkFmtM2(m2)}</div>
      ${done ? '<div class="mpk-hud-actions"><button class="mpk-btn" onclick="mpkFeatLaunch(\'radar\')">Scan again</button></div>' : ''}`);
    render(0, 0);
    const sorted = pts.map(p => p.properties).sort((a, b2) => a.ang - b2.ang);
    const SWEEP = 9000;
    let t0 = null;
    const frame = now => {
      if (!mpkFeatAlive(token) || !map.getLayer('mpk-feat-beam')) return;
      if (t0 === null) t0 = now + 1300;                        // after the zoom-out settles
      const a = Math.max(0, Math.min(360, (now - t0) / SWEEP * 360));
      // trailing beam: 8 slices fading out behind the leading edge
      const slices = [];
      for (let k = 0; k < 8; k++) {
        const to = a - k * 4, from = to - 4;
        if (to <= 0) break;
        slices.push({ type: 'Feature', properties: { o: 0.42 * (1 - k / 8) },
          geometry: { type: 'Polygon', coordinates: [[c, ...ring(radius, Math.max(0, from), to), mpkOffset(c, to, radius), c]] } });
      }
      map.getSource('mpk-feat-beam').setData(mpkFC(slices));
      map.setFilter('mpk-feat-blips', ['<=', ['get', 'ang'], a]);
      map.setPaintProperty('mpk-feat-blips', 'circle-radius', ['interpolate', ['linear'], ['-', a, ['get', 'ang']], 0, 13, 25, 4.5]);
      let n = 0, m2 = 0;
      for (const p of sorted) { if (p.ang > a) break; n++; m2 += p.m2; }
      if (n !== frame.n) { frame.n = n; render(n, m2); }
      if (a < 360) MPK_FEAT.raf = requestAnimationFrame(frame);
      else { map.getSource('mpk-feat-beam').setData(mpkFC([])); render(total, totalM2, true); }
    };
    frame.n = -1;
    MPK_FEAT.raf = requestAnimationFrame(frame);
  },

  // 3. Hotspots: DBSCAN zones, ranked
  hotspots() {
    const { hotspots, s } = mpkFeatData();
    mpkFeatSrc('mpk-feat-hot', mpkFC(hotspots.map(h => ({ type: 'Feature', properties: { id: h.id, n: h.n },
      geometry: { type: 'Polygon', coordinates: [[...h.hull, h.hull[0]]] } }))));
    mpkFeatSrc('mpk-feat-hot-lbl', mpkFC(hotspots.map(h => mpkPt(h.center, { label: `${h.id} · ${h.n}` }))));
    mpkFeatLayer({ id: 'mpk-feat-hot-fill', type: 'fill', source: 'mpk-feat-hot',
      paint: { 'fill-color': '#FF6F00', 'fill-opacity': ['interpolate', ['linear'], ['get', 'n'], 4, 0.12, 40, 0.3] } });
    mpkFeatLayer({ id: 'mpk-feat-hot-line', type: 'line', source: 'mpk-feat-hot',
      paint: { 'line-color': '#E65100', 'line-width': 2.2, 'line-dasharray': [2, 1.5] } });
    mpkFeatLayer({ id: 'mpk-feat-hot-lbl', type: 'symbol', source: 'mpk-feat-hot-lbl',
      layout: { 'text-field': ['get', 'label'], 'text-font': ['Noto Sans Regular'], 'text-size': 13, 'text-allow-overlap': true },
      paint: { 'text-color': '#fff', 'text-halo-color': '#BF360C', 'text-halo-width': 2.2 } });
    const sus = mpkFeatData().ranked.length, inHot = hotspots.reduce((a, h) => a + h.n, 0);
    mpkHud('Hotspot Finder', `
      <div class="mpk-hud-big">${hotspots.length} hotspots</div>
      <div class="mpk-hud-sub">${mpkNum(inHot)} of ${mpkNum(sus)} suspected buildings (${sus ? Math.round(inHot / sus * 100) : 0}%) sit in clusters:
        at least 4 suspected buildings within 150 m of each other.</div>
      <div class="mpk-hud-list">${hotspots.slice(0, 8).map((h, i) => `
        <button class="mpk-hud-item" onclick="mpkFeatHotFly(${i})"><b>${h.id}</b><span>${MPK_AREAS[h.kawasan].short}</span>
          <span class="num">${h.n} bldg · ${mpkFmtM2(h.m2)}</span></button>`).join('') || '<div class="mpk-hud-sub">No clusters found.</div>'}</div>`,
      { icon: '🔥', side: true });
    MPK_FEAT.hot = hotspots;
    if (hotspots.length) mpkFeatFit(mpkBoundsOf(hotspots.map(h => ({ geometry: { coordinates: h.hull } }))), { padding: { top: 80, bottom: 80, left: 80, right: 400 }, duration: 1200 });
    void s;
  },

  // 4. Priority score, explainable
  priority() {
    const { ranked, s } = mpkFeatData();
    const byId = new Map(ranked.map(x => [x.p.id, x.pr.score]));
    mpkFeatSrc('mpk-feat-prio', mpkFC(MPK.data.buildings.features.filter(f => byId.has(f.properties.id))
      .map(f => ({ ...f, properties: { ...f.properties, score: byId.get(f.properties.id) } }))));
    const ramp = ['interpolate', ['linear'], ['get', 'score'], 20, '#FFE082', 45, '#FF8F00', 65, '#E53935', 85, '#6A1B1A'];
    mpkFeatLayer({ id: 'mpk-feat-prio-fill', type: 'fill', source: 'mpk-feat-prio', paint: { 'fill-color': ramp, 'fill-opacity': 0.9 } });
    mpkFeatLayer({ id: 'mpk-feat-prio-dot', type: 'circle', source: 'mpk-feat-prio', maxzoom: 15.5,
      paint: { 'circle-color': ramp, 'circle-radius': ['interpolate', ['linear'], ['get', 'score'], 20, 3, 90, 8],
               'circle-stroke-color': '#fff', 'circle-stroke-width': 1 } });
    const W = MPK_PRIORITY_WEIGHTS;
    mpkHud('Priority Score', `
      <div class="mpk-hud-sub">Score = size ${W.size * 100}% + evidence ${W.evidence * 100}% + AI confidence ${W.confidence * 100}% + in a hotspot ${W.cluster * 100}%</div>
      <div class="mpk-hud-ramp"><span>Low</span><i></i><span>Urgent</span></div>
      <div class="mpk-hud-list">${ranked.slice(0, 10).map(({ p, pr }) => `
        <button class="mpk-hud-item prio" onclick="mpkZoomTo(${p.id})">
          <span class="mpk-hud-score" style="--c:${mpkScoreColor(pr.score)}">${pr.score}</span>
          <span><b>${p.plus_code}</b><small>${MPK_AREAS[p.kawasan].short} · ${mpkFmtM2(p.area_m2)}</small></span>
          <span class="mpk-hud-parts" title="Size · Evidence · Confidence · Hotspot">${Object.keys(W).map(k =>
            `<i style="width:${Math.round(pr.parts[k] * W[k] * 100)}%" class="p-${k}"></i>`).join('')}</span>
        </button>`).join('')}</div>
      <div class="mpk-hud-key"><span><i class="p-size"></i>Size</span><span><i class="p-evidence"></i>Evidence</span>
        <span><i class="p-confidence"></i>Confidence</span><span><i class="p-cluster"></i>Hotspot</span></div>`,
      { icon: '🎯', side: true });
    mpkFeatFit(MPK.bounds[MPK.area], { padding: { top: 50, bottom: 50, left: 50, right: 400 } });
    void s;
  },

  // 5. Inspection route on real roads (OSRM), with a straight-line fallback
  async route(token) {
    const { ranked } = mpkFeatData();
    const stops = ranked.slice(0, 8).map(x => x.p);
    mpkHud('Smart Inspection Route', '<div class="mpk-hud-sub">Planning the route on the road network…</div>', { icon: '🧭', side: true });
    if (stops.length < 2) { mpkHudBody('Need at least two suspected buildings in this area.'); return; }
    const pts = stops.map(p => [p.lng, p.lat]);
    let order, line, km, mins, source;
    try {
      const url = 'https://router.project-osrm.org/trip/v1/driving/' + pts.map(p => p[0].toFixed(6) + ',' + p[1].toFixed(6)).join(';')
        + '?roundtrip=false&source=first&destination=any&geometries=geojson&overview=full';
      const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 9000);
      const res = await fetch(url, { signal: ctl.signal });
      clearTimeout(t);
      const j = await res.json();
      if (j.code !== 'Ok') throw new Error(j.code);
      order = j.waypoints.map((w, i) => [w.waypoint_index, i]).sort((a, b) => a[0] - b[0]).map(x => x[1]);
      line = j.trips[0].geometry.coordinates;
      km = j.trips[0].distance / 1000; mins = j.trips[0].duration / 60;
      source = 'Driving route on OpenStreetMap roads (OSRM)';
    } catch (e) {
      order = mpkRouteOrder(pts);
      line = order.map(i => pts[i]);
      km = mpkPathLength(line) * 1.3 / 1000; mins = km / 30 * 60;
      source = 'Road router offline: straight-line order, distance × 1.3, 30 km/h';
    }
    if (!mpkFeatAlive(token)) return;
    const ordered = order.map(i => stops[i]);
    mpkFeatSrc('mpk-feat-route', { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: line } });
    mpkFeatLayer({ id: 'mpk-feat-route-casing', type: 'line', source: 'mpk-feat-route',
      layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#0D47A1', 'line-width': 9, 'line-opacity': 0.35 } });
    mpkFeatLayer({ id: 'mpk-feat-route', type: 'line', source: 'mpk-feat-route',
      layout: { 'line-cap': 'butt', 'line-join': 'round' }, paint: { 'line-color': '#2979FF', 'line-width': 4.5, 'line-dasharray': [0, 2, 2] } });
    mpkFeatSrc('mpk-feat-stops', mpkFC(ordered.map((p, i) => mpkPt([p.lng, p.lat], { n: String(i + 1) }))));
    mpkFeatLayer({ id: 'mpk-feat-stops', type: 'circle', source: 'mpk-feat-stops',
      paint: { 'circle-color': '#2979FF', 'circle-radius': 11, 'circle-stroke-color': '#fff', 'circle-stroke-width': 2.5 } });
    mpkFeatLayer({ id: 'mpk-feat-stops-n', type: 'symbol', source: 'mpk-feat-stops',
      layout: { 'text-field': ['get', 'n'], 'text-font': ['Noto Sans Regular'], 'text-size': 12, 'text-allow-overlap': true },
      paint: { 'text-color': '#fff' } });
    // marching-ants animation along the route
    const dashes = [[0, 4, 3], [0.5, 4, 2.5], [1, 4, 2], [1.5, 4, 1.5], [2, 4, 1], [2.5, 4, 0.5], [3, 4, 0], [0, 0.5, 3, 3.5],
                    [0, 1, 3, 3], [0, 1.5, 3, 2.5], [0, 2, 3, 2], [0, 2.5, 3, 1.5], [0, 3, 3, 1], [0, 3.5, 3, 0.5]];
    let k = 0;
    const tick = () => {
      if (!mpkFeatAlive(token) || !map.getLayer('mpk-feat-route')) return;
      map.setPaintProperty('mpk-feat-route', 'line-dasharray', dashes[k = (k + 1) % dashes.length]);
      timer = setTimeout(tick, 70);
    };
    let timer = null;
    tick();
    MPK_FEAT.cleanup.push(() => clearTimeout(timer));
    mpkFeatFit(mpkBoundsOf([{ geometry: { coordinates: line } }]), { padding: { top: 60, bottom: 60, left: 60, right: 400 }, duration: 1200 });
    mpkHudBody(`
      <div class="mpk-hud-stats"><div><b>${ordered.length}</b><small>stops</small></div><div><b>${km.toFixed(1)}</b><small>km</small></div>
        <div><b>${Math.round(mins)}</b><small>min drive</small></div></div>
      <div class="mpk-hud-list">${ordered.map((p, i) => `
        <button class="mpk-hud-item" onclick="mpkZoomTo(${p.id})"><span class="mpk-hud-stop">${i + 1}</span>
          <span><b>${p.plus_code}</b><small>${MPK_AREAS[p.kawasan].short} · ${mpkFmtM2(p.area_m2)}</small></span></button>`).join('')}</div>
      <div class="mpk-hud-actions"><a class="mpk-btn" href="${mpkGmapsDir(ordered.map(p => [p.lng, p.lat]))}" target="_blank" rel="noopener">Open in Google Maps</a></div>
      <div class="mpk-hud-note">${source}. Stops: the ${ordered.length} highest priority scores.</div>`);
  },

  // 6. Ask the map (text or voice)
  ask() {
    const Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
    const examples = ['How many illegal buildings in Binjai?', 'Show suspected buildings over 1000 m²', 'Largest legal building in Teluk Kalong',
                      'Berapa bangunan haram di Teluk Kalong?', 'Tunjuk hotspot', 'Start the drone tour'];
    mpkHud('Ask the Map', `
      <form class="mpk-ask" onsubmit="event.preventDefault();mpkAskRun(this.q.value)">
        <input name="q" id="mpk-ask-q" type="text" placeholder="Ask in English or Malay…" autocomplete="off" aria-label="Question">
        ${Rec ? '<button type="button" class="mpk-ask-mic" id="mpk-ask-mic" onclick="mpkAskListen()" aria-label="Speak">🎙️</button>' : ''}
        <button type="submit" class="mpk-btn">Ask</button>
      </form>
      <div class="mpk-ask-answer" id="mpk-ask-answer">Try one of these:</div>
      <div class="mpk-ask-examples">${examples.map(e => `<button type="button" onclick="mpkAskRun(this.textContent)">${e}</button>`).join('')}</div>
      <label class="mpk-ask-voice"><input type="checkbox" id="mpk-ask-speak" checked> Speak the answer</label>`,
      { icon: '🎙️', wide: true });
    mpkFeatSrc('mpk-feat-ask', mpkFC([]));
    mpkFeatLayer({ id: 'mpk-feat-ask-fill', type: 'fill', source: 'mpk-feat-ask', paint: { 'fill-color': '#FFEB3B', 'fill-opacity': 0.55 } });
    mpkFeatLayer({ id: 'mpk-feat-ask-line', type: 'line', source: 'mpk-feat-ask', paint: { 'line-color': '#F57F17', 'line-width': 2.5 } });
    mpkFeatLayer({ id: 'mpk-feat-ask-dot', type: 'circle', source: 'mpk-feat-ask', maxzoom: 15,
      paint: { 'circle-color': '#FFEB3B', 'circle-radius': 4, 'circle-stroke-color': '#F57F17', 'circle-stroke-width': 1.2 } });
    setTimeout(() => { const q = document.getElementById('mpk-ask-q'); if (q) q.focus(); }, 50);
  },

  // 7. Building passport: click a building for its case file with a QR code
  passport() {
    MPK_FEAT.capture = true;
    mpkHud('Building Passport', '<div class="mpk-hud-sub">Click any building on the map.</div>', { icon: '🪪', side: true });
    const layers = ['mpk-suspect-fill', 'mpk-legal-fill', 'mpk-unverified-fill'];
    const onClick = e => {
      const hit = map.queryRenderedFeatures(e.point, { layers: layers.filter(id => map.getLayer(id)) })[0];
      if (hit) mpkPassportShow(hit.properties.id);
    };
    map.on('click', onClick);
    MPK_FEAT.cleanup.push(() => map.off('click', onClick));
    const { ranked } = mpkFeatData();
    if (ranked.length) mpkPassportShow(ranked[0].p.id);
  },

  // 8. Lot coverage: footprint ÷ lot area per cadastral lot
  coverage() {
    const lots = mpkLotCoverage(MPK.data.kadaster.features, mpkAreaFeatures());
    mpkFeatSrc('mpk-feat-cov', mpkFC(lots.map(l => ({ type: 'Feature', properties: { lot: l.lot, pct: Math.min(l.pct, 100) }, geometry: l.geometry }))));
    const ramp = ['interpolate', ['linear'], ['get', 'pct'], 0, '#E3F2FD', 25, '#90CAF9', 50, '#42A5F5', 75, '#1565C0', 100, '#0D1B4C'];
    mpkFeatLayer({ id: 'mpk-feat-cov-fill', type: 'fill', source: 'mpk-feat-cov', paint: { 'fill-color': ramp, 'fill-opacity': 0.75 } },
      map.getLayer('mpk-unverified-fill') ? 'mpk-unverified-fill' : undefined);
    mpkFeatLayer({ id: 'mpk-feat-cov-line', type: 'line', source: 'mpk-feat-cov', paint: { 'line-color': '#0D47A1', 'line-width': 0.8 } },
      map.getLayer('mpk-unverified-fill') ? 'mpk-unverified-fill' : undefined);
    const med = lots.length ? lots.map(l => l.pct).sort((a, b) => a - b)[Math.floor(lots.length / 2)] : 0;
    const dense = lots.filter(l => l.pct >= 60).length;
    const real = lots.filter(l => l.pct <= 100);
    MPK_FEAT.cov = real;
    mpkHud('Lot Coverage X-ray', `
      <div class="mpk-hud-stats"><div><b>${mpkNum(lots.length)}</b><small>lots with buildings</small></div>
        <div><b>${Math.round(med)}%</b><small>median coverage</small></div><div><b>${mpkNum(dense)}</b><small>lots ≥ 60% built</small></div></div>
      <div class="mpk-hud-ramp cov"><span>0%</span><i></i><span>100%</span></div>
      <div class="mpk-hud-sub"><b>Most densely built lots</b></div>
      <div class="mpk-hud-list">${real.slice(0, 8).map((l, i) => `
        <button class="mpk-hud-item" onclick="mpkFeatCovFly(${i})"><b>Lot ${l.lot}</b>
          <span class="num">${Math.round(l.pct)}% · ${mpkNum(l.builtM2)} / ${mpkNum(l.lotM2)} m²</span></button>`).join('')}</div>
      <div class="mpk-hud-note">Building footprints (AI-detected) ÷ cadastral lot area; each building counts on the lot under its centre.
        ${lots.length - real.length ? `${lots.length - real.length} lots hold a building that spans several lots (over 100%) and are left out of the list. ` : ''}A screening aid, not an official plot-ratio check.</div>`,
      { icon: '🧱', side: true });
    mpkFeatFit(MPK.bounds[MPK.area], { padding: { top: 50, bottom: 50, left: 50, right: 400 } });
  },

  // 9. Time machine: every historical Esri capture of the top case, cross-faded
  async timemachine(token) {
    const { ranked } = mpkFeatData();
    const focus = ranked[0] ? ranked[0].p : null;
    const area = focus ? focus.kawasan : (MPK.area === 'all' ? 'tk' : MPK.area);
    const frames = mpkTimeFrames(MPK.data.wayback && MPK.data.wayback.history, area);
    mpkHud('Time Machine', '<div class="mpk-hud-sub">Loading imagery…</div>', { icon: '⏳', wide: true });
    if (frames.length < 2) { mpkHudBody('Historical imagery index not available.'); return; }
    if (MPK.wayback.on) mpkHistoricOff();
    if (focus) await mpkFeatMove(() => map.flyTo({ center: [focus.lng, focus.lat], zoom: 16.6, pitch: 0, bearing: 0, duration: 1800 }));
    if (!mpkFeatAlive(token)) return;
    const before = mpkBottomLayer();
    const addFrame = (i, slot) => {
      const id = 'mpk-feat-tm-' + slot;
      if (map.getLayer(id)) map.removeLayer(id);
      if (map.getSource(id)) map.removeSource(id);
      map.addSource(id, { type: 'raster', tiles: [mpkWaybackTileUrl(frames[i].release)], tileSize: 256, maxzoom: 19,
        attribution: 'Esri World Imagery Wayback' });
      map.addLayer({ id, type: 'raster', source: id, paint: { 'raster-opacity': 0, 'raster-opacity-transition': { duration: 1400 } } }, before);
      if (!MPK_FEAT.layers.includes(id)) { MPK_FEAT.layers.push(id); MPK_FEAT.sources.push(id); }
      return id;
    };
    const dots = i => frames.map((f, k) => `<i class="${k === i ? 'on' : k < i ? 'past' : ''}" title="${f.capture}"></i>`).join('');
    let slot = 0;
    for (let i = 0; i < frames.length && mpkFeatAlive(token); i++) {
      const id = addFrame(i, slot);
      await mpkFeatWait(900);                                // let the tiles arrive before the fade
      if (!mpkFeatAlive(token)) return;
      map.setPaintProperty(id, 'raster-opacity', 1);
      const other = 'mpk-feat-tm-' + (1 - slot);
      if (map.getLayer(other)) map.moveLayer(id, before);
      mpkHudBody(`<div class="mpk-tm"><div class="mpk-tm-year mono">${frames[i].capture.slice(0, 4)}</div>
          <div><div class="mpk-hud-sub">Captured ${mpkDayLabel(frames[i].capture)} · image ${i + 1} of ${frames.length}</div>
          <div class="mpk-tm-dots">${dots(i)}</div></div></div>`);
      await mpkFeatWait(2600);
      slot = 1 - slot;
    }
    if (!mpkFeatAlive(token)) return;
    mpkHudBody(`<div class="mpk-tm"><div class="mpk-tm-year mono">${frames[frames.length - 1].capture.slice(0, 4)}</div>
      <div><div class="mpk-hud-sub">${frames.length} captures from ${frames[0].capture.slice(0, 4)} to ${frames[frames.length - 1].capture.slice(0, 4)}</div>
      <div class="mpk-tm-dots">${dots(frames.length - 1)}</div></div></div>
      <div class="mpk-hud-actions"><button class="mpk-btn" onclick="mpkFeatLaunch('timemachine')">Replay</button></div>`);
  },

  // 10. Policy simulator: live road-reserve what-if
  simulator() {
    if (MPK.area === 'tk') mpkSelectArea('all');           // the reserve only applies to the corridors
    const feats = mpkAreaFeatures(), curve = mpkPolicyCurve(feats, 3, 20), orig = MPK.settings.rizab;
    MPK_FEAT.simOrig = orig;
    MPK_FEAT.simCurve = curve;
    MPK_FEAT.cleanup.push(() => { if (MPK_FEAT.simOrig != null && MPK.settings.rizab !== MPK_FEAT.simOrig) mpkFeatSimSet(MPK_FEAT.simOrig, true); MPK_FEAT.simOrig = null; });
    mpkHud('Policy Simulator', `
      <div class="mpk-sim-top"><label for="mpk-sim-r">Road reserve from centreline</label><b class="mono" id="mpk-sim-rv"></b></div>
      <input type="range" id="mpk-sim-r" class="mpk-range" min="3" max="20" step="1" value="${orig}" oninput="mpkFeatSimSet(+this.value)">
      <div class="mpk-hud-stats" id="mpk-sim-stats"></div>
      <svg class="mpk-sim-chart" id="mpk-sim-chart" viewBox="0 0 300 90" role="img" aria-label="Suspected buildings by road reserve width"></svg>
      <div class="mpk-hud-actions"><button class="mpk-btn" onclick="MPK_FEAT.simOrig=null;mpkFeatStop();showToast('Road reserve set to ' + MPK.settings.rizab + ' m')">Keep this setting</button>
        <button class="mpk-wb-btn" onclick="mpkFeatStop()">Reset</button></div>
      <div class="mpk-hud-note">Corridor buildings count as suspected when they lie within the reserve. Teluk Kalong's MPK list does not change.</div>`,
      { icon: '🎚️', side: true });
    mpkFeatFit(MPK.bounds[MPK.area === 'all' ? 'bbc' : MPK.area], { padding: { top: 40, bottom: 40, left: 40, right: 400 } });
    mpkFeatSimSet(orig, true);
  },
};

// ---------- Tool helpers (called from HUD markup) ----------
function mpkScoreColor(v) {
  return v >= 85 ? '#6A1B1A' : v >= 65 ? '#E53935' : v >= 45 ? '#FF8F00' : '#F9A825';
}

function mpkFeatHotFly(i) {
  const h = (MPK_FEAT.hot || [])[i];
  if (h) map.fitBounds(mpkBoundsOf([{ geometry: { coordinates: h.hull } }]), { padding: { top: 60, bottom: 60, left: 60, right: 380 }, maxZoom: 18, duration: 1000 });
}

function mpkFeatCovFly(i) {
  const l = (MPK_FEAT.cov || [])[i];
  if (l) map.fitBounds(mpkBoundsOf([{ geometry: l.geometry }]), { padding: { top: 80, bottom: 80, left: 80, right: 420 }, maxZoom: 19, duration: 1000 });
}

function mpkFeatSimSet(r, quiet) {
  mpkOnSetting('rizab', r);
  const slider = document.getElementById('mpk-rizab');
  if (slider) slider.value = r;
  const curve = MPK_FEAT.simCurve, el = document.getElementById('mpk-sim-chart');
  if (!curve || !el) return;
  const cur = curve.find(c => c.r === r) || curve[0], base = curve.find(c => c.r === MPK_FEAT.simOrig) || cur;
  document.getElementById('mpk-sim-rv').textContent = r + ' m';
  const d = cur.n - base.n;
  document.getElementById('mpk-sim-stats').innerHTML = `
    <div><b>${mpkNum(cur.n)}</b><small>suspected${d ? ` (${d > 0 ? '+' : ''}${d})` : ''}</small></div>
    <div><b>${mpkNum(cur.m2)}</b><small>m² footprint</small></div>
    <div><b>${mpkRM(cur.m2 * MPK.rates.fee)}</b><small>est. processing fee</small></div>`;
  const maxN = Math.max(...curve.map(c => c.n), 1), X = r2 => 8 + (r2 - 3) / 17 * 284, Y = n => 80 - n / maxN * 70;
  const path = curve.map((c, i) => (i ? 'L' : 'M') + X(c.r).toFixed(1) + ' ' + Y(c.n).toFixed(1)).join(' ');
  el.innerHTML = `<path d="${path} L ${X(20)} 80 L ${X(3)} 80 Z" fill="rgba(198,40,40,0.12)"/>
    <path d="${path}" fill="none" stroke="#c62828" stroke-width="2"/>
    <line x1="${X(r)}" x2="${X(r)}" y1="6" y2="80" stroke="#1E2C44" stroke-width="1" stroke-dasharray="3 2"/>
    <circle cx="${X(r)}" cy="${Y(cur.n)}" r="4.5" fill="#c62828" stroke="#fff" stroke-width="2"/>
    <text x="8" y="89" font-size="8" fill="#6b7685">3 m</text><text x="292" y="89" font-size="8" fill="#6b7685" text-anchor="end">20 m</text>`;
  void quiet;
}

// Ask the map: run a question
function mpkAskRun(text) {
  const input = document.getElementById('mpk-ask-q');
  if (input && input.value !== text) input.value = text;
  const q = mpkAsk(text), out = document.getElementById('mpk-ask-answer');
  const say = msg => {
    if (out) out.innerHTML = `<b>${msg}</b>`;
    const speak = document.getElementById('mpk-ask-speak');
    if (speak && speak.checked && window.speechSynthesis) {
      try { speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(msg); u.lang = 'en-GB'; speechSynthesis.speak(u); } catch (e) {}
    }
  };
  const launch = ['tour', 'radar', 'hotspots', 'route', 'timemachine', 'priority', 'coverage', 'simulator', 'passport'];
  if (launch.includes(q.intent)) {
    const f = MPK_FEATURES.find(x => x.key === q.intent);
    say('Opening ' + f.title + '.');
    setTimeout(() => mpkFeatLaunch(q.intent), 700);
    return;
  }
  if (q.intent === 'reset') { map.getSource('mpk-feat-ask').setData(mpkFC([])); say('Cleared.'); return; }
  if (q.intent === 'help') {
    say('Ask about illegal, legal or not-verified buildings, an area, a size such as over 1000 square metres, or a lot number.');
    return;
  }
  if (q.area && q.area !== MPK.area && MPK.area !== 'all') mpkSelectArea('all');
  const ans = mpkAskAnswer(q, MPK.data.buildings.features, MPK.settings);
  const ids = new Set(ans.ids);
  const hits = MPK.data.buildings.features.filter(f => ids.has(f.properties.id));
  map.getSource('mpk-feat-ask').setData(mpkFC(hits));
  say(ans.text);
  if (ans.focus) mpkZoomTo(ans.focus);
  else if (hits.length) map.fitBounds(mpkBoundsOf(hits), { padding: 90, maxZoom: 18, pitch: 0, duration: 1000 });
}

function mpkAskListen() {
  const Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Rec) return;
  const rec = new Rec(), mic = document.getElementById('mpk-ask-mic'), out = document.getElementById('mpk-ask-answer');
  rec.lang = 'en-MY';
  rec.interimResults = true;
  rec.onresult = e => {
    const txt = Array.from(e.results).map(r => r[0].transcript).join(' ');
    document.getElementById('mpk-ask-q').value = txt;
    if (e.results[e.results.length - 1].isFinal) mpkAskRun(txt);
  };
  rec.onerror = e => { if (out) out.textContent = 'Microphone: ' + e.error; };
  rec.onend = () => { if (mic) mic.classList.remove('rec'); };
  if (mic) mic.classList.add('rec');
  if (out) out.textContent = 'Listening…';
  rec.start();
  MPK_FEAT.cleanup.push(() => { try { rec.abort(); } catch (e) {} });
}

// Building passport card
const MPK_QR_LIB = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';
function mpkLoadQR() {
  if (window.QRCode) return Promise.resolve();
  if (!mpkLoadQR.p) {
    mpkLoadQR.p = new Promise((res, rej) => {
      const sc = document.createElement('script');
      sc.src = MPK_QR_LIB; sc.onload = res; sc.onerror = () => { mpkLoadQR.p = null; rej(new Error('QR library')); };
      document.head.appendChild(sc);
    });
  }
  return mpkLoadQR.p;
}

// Satellite close-up: Esri imagery tiles around the building, its outline drawn on top
function mpkTileMosaic(f) {
  const [sw, ne] = mpkBoundsOf([f]);
  const span = Math.max(mpkMetres(sw, [ne[0], sw[1]]), mpkMetres(sw, [sw[0], ne[1]]));
  const z = span < 40 ? 19 : span < 90 ? 18 : 17;
  const world = 256 * Math.pow(2, z);
  const px = lng => (lng + 180) / 360 * world;
  const py = lat => { const r = lat * Math.PI / 180; return (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * world; };
  const cx = px(f.properties.lng), cy = py(f.properties.lat);
  const tx = Math.floor(cx / 256), ty = Math.floor(cy / 256);
  let tiles = '';
  for (let dx = -2; dx <= 2; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      const x = tx + dx, y = ty + dy;
      tiles += `<img src="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}" alt=""
        style="left:calc(50% + ${Math.round(x * 256 - cx)}px);top:calc(50% + ${Math.round(y * 256 - cy)}px)">`;
    }
  }
  const rings = f.geometry.type === 'Polygon' ? [f.geometry.coordinates[0]] : f.geometry.coordinates.map(p => p[0]);
  const outline = rings.map(r => `<polygon points="${r.map(c => (px(c[0]) - cx).toFixed(1) + ',' + (py(c[1]) - cy).toFixed(1)).join(' ')}"/>`).join('');
  return `<div class="mpk-pp-tiles">${tiles}<svg viewBox="-1 -1 2 2" overflow="visible">${outline}</svg></div>`;
}

function mpkPassportShow(id) {
  const f = MPK.data.buildings.features.find(x => x.properties.id === id);
  if (!f) return;
  const p = f.properties, s = MPK.settings, st = mpkStatus(p, s);
  const { hotspots } = mpkFeatData();
  const hot = hotspots.find(h => h.ids.includes(id));
  const pr = mpkPriority(p, s, !!hot);
  const gmaps = `https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lng}`;
  const zone = MPK.data.landuse ? mpkZoneLabel(mpkZoneAt(p.lng, p.lat, MPK.data.landuse.features)) : null;
  const row = (k, v) => `<div class="mpk-pp-row"><span>${k}</span><b>${v}</b></div>`;
  mpkHudBody(`<div class="mpk-pp">
    <div class="mpk-pp-img" role="img" aria-label="Satellite close-up of ${p.plus_code}">${mpkTileMosaic(f)}<span class="mpk-badge" style="--c:${MPK_STATUS[st].color}">${MPK_STATUS[st].label}</span></div>
    <div class="mpk-pp-id"><div><small>Plus Code</small><b class="mono">${p.plus_code}</b></div>
      ${pr ? `<span class="mpk-hud-score" style="--c:${mpkScoreColor(pr.score)}" title="Priority score">${pr.score}</span>` : ''}</div>
    ${row('Area', MPK_AREAS[p.kawasan].name)}
    ${row('Lot / UPI', (p.lot || '—') + (p.upi ? ' · ' + p.upi : ''))}
    ${row('Footprint', mpkFmtM2(p.area_m2))}
    ${row('AI confidence', Math.round(p.confidence * 100) + '%')}
    ${mpkJenis(p, s) ? row('Why flagged', mpkFeatReason(p, s)) : ''}
    ${hot ? row('Hotspot', `${hot.id} · ${hot.n} suspected nearby`) : ''}
    ${zone ? row('Land use (OSM)', zone) : ''}
    <div class="mpk-pp-qr"><div id="mpk-pp-qr"></div><div><b>Scan to open on your phone</b>
      <small>Google Maps · ${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}</small>
      <a class="mpk-wb-btn" href="${gmaps}" target="_blank" rel="noopener">Open in Google Maps</a></div></div>
  </div>`);
  try { map.getSource('mpk-highlight').setData(f); } catch (e) {}
  map.flyTo({ center: [p.lng, p.lat], zoom: Math.max(map.getZoom(), 17.5), padding: { right: 340 }, duration: 900 });
  mpkLoadQR().then(() => {
    const el = document.getElementById('mpk-pp-qr');
    if (el) new QRCode(el, { text: gmaps, width: 96, height: 96, correctLevel: QRCode.CorrectLevel.M });
  }).catch(() => { const el = document.getElementById('mpk-pp-qr'); if (el) el.textContent = 'QR unavailable offline'; });
}
