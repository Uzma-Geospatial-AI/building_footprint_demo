// ============================================================
// MPK KEMAMAN — FEATURES
// Showcase tools on the MPK data, launched from the Features page (sidebar, under
// Statistics). Each runs on the map with a floating HUD and cleans up after itself. This file runs
//   tour · priority · ask · passport · timemachine
// and lists sitecheck · portfolio · notice · timeline · money, which mpk-features3.js runs.
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
// reserve = 0.4 at the reserve edge up to 1 on the centreline) · footprint confidence 15% (1 for footprints
// digitised by hand, the model's score for Google Open Buildings) · in a hotspot 15%
const MPK_PRIORITY_WEIGHTS = { size: 0.45, evidence: 0.25, confidence: 0.15, cluster: 0.15 };
function mpkPriority(p, s, inHotspot) {
  const clamp = v => Math.max(0, Math.min(1, v));
  const j = mpkJenis(p, s);
  if (!j) return null;
  const parts = {
    size: clamp((Math.log10(Math.max(p.area_m2, 1)) - 1) / (Math.log10(5000) - 1)),
    evidence: j === 'rizab' ? clamp(0.4 + 0.6 * (1 - p.jarak_jalan_m / s.rizab)) : 1,   // MPK's list or a rejected plan
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

// ---------- Pure: time machine frames ----------
// One frame per distinct capture date for the area, oldest first. maxzoom: the deepest tile level
// the release serves here (Wayback answers 404 below it, so MapLibre must stretch that level):
// releases before 2024 stop at z17 over Kemaman, later ones at z18.
function mpkTimeFrames(history, area) {
  const seen = new Set();
  return (history || []).map(h => ({ release: h.release, capture: (h.capture || {})[area] || h.date,
                                     maxzoom: (h.date || '') >= '2024' ? 18 : 17 }))
    .filter(f => f.capture && !seen.has(f.capture) && seen.add(f.capture))
    .sort((a, b) => a.capture.localeCompare(b.capture));
}

// ---------- Pure: "Ask the map" (English and Malay) ----------
// Questions that open a tool rather than count buildings
const MPK_ASK_TOOLS = ['reset', 'tour', 'sitecheck', 'notice', 'portfolio', 'timeline', 'money', 'hex', 'planner', 'timemachine', 'priority', 'passport'];
// Words the question parser understands; anything else left in a question is taken as a place name
const MPK_ASK_VOCAB = new Set(('a an the and or of for to from with without me my i we you your us our can could would will '
  + 'please pls tell know show find give list display see get let what whats which who where how many much is are was were be '
  + 'there theres here any all some this that these those it its on in at near around inside within by about between per '
  + 'total number count amount area areas region zone place places building buildings bldg house houses structure structures '
  + 'illegal illegally legal suspected suspect suspicious unverified verified not approved approval permit permits planning '
  + 'permission lacking over under above below more less than bigger smaller larger greater largest biggest smallest square '
  + 'metre metres meter meters sqm m2 m² hey hi hello ok okay thanks thank lot lots plot no nombor footprint size sizes '
  + 'do does did have has many data info information about '
  + 'berapa banyak ada tak tidak yang dan atau dalam kat dekat sekitar kawasan untuk dari daripada ke dengan tanpa kebenaran '
  + 'bangunan rumah kilang haram sah lulus disyaki syak belum disahkan tunjuk papar cari senarai jumlah bilangan lebih kurang '
  + 'melebihi atas bawah terbesar besar paling sekali saya nak mahu boleh tolong apa mana seluruh semua luas keluasan meter '
  + 'persegi hai terima kasih ni tu itu ini je jer ke kah buah unit '
  + 'tour drone fly terbang radar scan imbas hotspot hotspots cluster route inspection inspect laluan time machine history '
  + 'historical sejarah wayback priority urgent keutamaan coverage density simulator simulate policy reserve rizab passport '
  + 'profile reset clear start open launch run mula buka '
  + 'teluk kalong binjai chukai cukai corridor corridors koridor industrial perindustrian marked '
  + 'kemaman mpk terengganu majlis perbandaran').split(' '));

// The place a question names that is not one of the study areas, e.g. "illegal buildings in Kerteh" -> "kerteh"
function mpkAskPlace(text) {
  const words = String(text || '').toLowerCase().replace(/[^a-z0-9\u00b2\s'-]/g, ' ').split(/\s+/)
    .filter(w => w && !/^\d/.test(w) && !MPK_ASK_VOCAB.has(w));
  const place = words.join(' ').trim();
  return place.length >= 3 ? place : null;
}

// Is a building inside a resolved place? place: { rings: [[ring], …] } | { bbox: [w, s, e, n] } | { center, radius }
function mpkInPlace(p, place) {
  if (place.rings) {
    const inRing = ring => {
      let inside = false;
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi, yi] = ring[i], [xj, yj] = ring[j];
        if ((yi > p.lat) !== (yj > p.lat) && p.lng < (xj - xi) * (p.lat - yi) / (yj - yi) + xi) inside = !inside;
      }
      return inside;
    };
    return place.rings.some(r => inRing(r));
  }
  if (place.bbox) { const [w, so, e, n] = place.bbox; return p.lng >= w && p.lng <= e && p.lat >= so && p.lat <= n; }
  return mpkMetres([p.lng, p.lat], place.center) <= place.radius;
}

// A named land-use zone (OSM) matching the place text, or null
function mpkAskLocalPlace(place, zones) {
  if (!place || place.length < 4) return null;
  const norm = t => t.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  const q = norm(place);
  const named = zones.filter(z => z.properties.name && z.properties.zone !== 'district');
  // one word ("Kerteh") must match a whole name, or "Kilang Penapisan Minyak Kerteh" would answer for the town
  return named.find(z => norm(z.properties.name) === q)
    || (q.includes(' ') ? named.find(z => norm(z.properties.name).includes(q)) : null)
    || named.find(z => { const n = norm(z.properties.name); return n.length >= 6 && q.includes(n); })
    || null;
}

// A full place name (OSM land-use zone, 2+ words) written in the question, longest first, or null.
// Wins over the study-area words: "Taman Chukai Utama" is a housing estate, not the Chukai corridor.
function mpkAskNamedIn(text, zones) {
  const norm = t => ' ' + String(t).toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim() + ' ';
  const t = norm(text);
  let best = null;
  for (const z of zones) {
    const n = z.properties.name;
    if (!n || z.properties.zone === 'district' || n.trim().split(/\s+/).length < 2) continue;
    if (t.includes(norm(n)) && (!best || n.length > best.length)) best = n;
  }
  return best;
}

const MPK_ASK_COVERAGE = 'My data covers Teluk Kalong Industrial Area and the Binjai–Bandar Chukai road corridor.';

function mpkAsk(text) {
  const t = ' ' + String(text || '').toLowerCase().replace(/(\d),(?=\d{3})/g, '$1').replace(/[?!.,]/g, ' ').replace(/\s+/g, ' ') + ' ';
  const q = { intent: null, area: null, status: null, min: null, max: null, lot: null, place: null, district: false };
  if (/teluk|kalong/.test(t)) q.area = 'tk';
  else if (/binjai|chukai|cukai/.test(t)) q.area = 'bbc';
  else q.district = /\b(kemaman|mpk)\b/.test(t);
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
  else if (has(/can i build|boleh bina|site check|semak tapak|check this site/)) q.intent = 'sitecheck';
  else if (has(/notice|notis|surat amaran/)) q.intent = 'notice';
  else if (has(/developer|pemaju|applicant|pemohon|portfolio/)) q.intent = 'portfolio';
  else if (has(/timeline|garis masa|approvals? (?:by|per|each) year|kelulusan (?:setiap|ikut) tahun/)) q.intent = 'timeline';
  else if (has(/revenue|hasil|kutipan|money|duit|wang/)) q.intent = 'money';
  else if (has(/hotspot|cluster|kelompok|tumpuan|density|padat/)) q.intent = 'hex';
  else if (has(/route|inspection|inspect|laluan|lawatan tapak|pemeriksaan|schedule|jadual/)) q.intent = 'planner';
  else if (has(/time ?machine|history|historical|sejarah|wayback|dulu/)) q.intent = 'timemachine';
  else if (has(/priority|urgent|keutamaan|segera/)) q.intent = 'priority';
  else if (has(/passport|pasport|profile|profil/)) q.intent = 'passport';
  else if (q.lot) q.intent = 'lot';
  else if (has(/largest|biggest|terbesar|paling besar|besar sekali/)) q.intent = 'largest';
  else if (has(/how many|how much|berapa|count|jumlah|total|bilangan/)) q.intent = 'count';
  else if (q.status || q.area || q.min != null || q.max != null || has(/\b(show|tunjuk|papar|cari|find)\b/)) q.intent = 'show';
  else q.intent = 'help';
  // a place the parser does not know: answered only if it can be found and holds our data
  if (!q.area && !MPK_ASK_TOOLS.includes(q.intent)) {
    q.place = mpkAskPlace(text);
    // just a place name ("Kerteh"): count there; a long sentence we do not follow: say so, do not guess
    if (q.place && q.intent === 'help') {
      if (q.place.split(' ').length <= 3) q.intent = 'count'; else q.place = null;
    }
  }
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
// `where`: the place's name when the buildings were already cut to a place
function mpkAskAnswer(q, features, s, where) {
  const hits = mpkAskMatch(q, features, s);
  const n = hits.length, m2 = hits.reduce((a, f) => a + f.properties.area_m2, 0);
  const fmt = v => Math.round(v).toLocaleString('en-MY');
  const what = (q.status ? { suspected: 'suspected illegal', legal: 'legal', unverified: 'not-verified' }[q.status] + ' ' : '')
    + (n === 1 ? 'building' : 'buildings')
    + (q.min != null ? ` over ${fmt(q.min)} m²` : '') + (q.max != null ? ` under ${fmt(q.max)} m²` : '')
    + (q.lot ? ` on lot ${q.lot}` : '')
    + (where ? ' in ' + where : q.area ? ' in ' + MPK_AREAS[q.area].short : ' in the marked areas');
  if (q.intent === 'largest') {
    const top = hits.slice().sort((a, b) => b.properties.area_m2 - a.properties.area_m2)[0];
    if (!top) return { text: `No ${what}.`, ids: [] };
    return { text: `The largest ${what.replace(/^buildings?/, 'building').replace('buildings', 'building')} is ${top.properties.plus_code}: `
      + `${fmt(top.properties.area_m2)} m².`, ids: [top.properties.id], focus: top.properties.id };
  }
  let text = n ? `${fmt(n)} ${what}, ${fmt(m2)} m² of footprint.` : `No ${what}.`;
  if (!n && where && features.length) {              // the place has buildings, just none that match
    const by = { suspected: 0, legal: 0, unverified: 0 };
    features.forEach(f => { by[mpkStatus(f.properties, s)]++; });
    text += ` Our data has ${fmt(features.length)} buildings there: ${fmt(by.suspected)} suspected illegal, ${fmt(by.legal)} legal and `
      + `${fmt(by.unverified)} not verified.`;
  }
  if (n && !q.status) {                              // no status asked: say how they split
    const by = { suspected: 0, legal: 0, unverified: 0 };
    hits.forEach(f => { by[mpkStatus(f.properties, s)]++; });
    text = `${fmt(n)} ${what}: ${fmt(by.suspected)} suspected illegal, ${fmt(by.legal)} legal and ${fmt(by.unverified)} not verified; `
      + `${fmt(m2)} m² of footprint.`;
  }
  return { text, ids: hits.map(f => f.properties.id) };
}

if (typeof module !== 'undefined') {
  module.exports = { mpkMetres, mpkRingArea, mpkPolyArea, mpkBearing, mpkOffset, mpkConvexHull, mpkDbscan, mpkHotspots,
    mpkPriority, mpkPriorityList, mpkRouteOrder, mpkPathLength, mpkGmapsDir, mpkTimeFrames,
    mpkAsk, mpkAskMatch, mpkAskAnswer, mpkAskPlace, mpkInPlace, mpkAskLocalPlace, mpkAskNamedIn, MPK_ASK_COVERAGE, MPK_PRIORITY_WEIGHTS };
}

// ============================================================
// Browser: Features page, HUD and the tools
// ============================================================
const MPK_FEATURES = [
  { key: 'tour', icon: '🚁', title: 'Drone Tour', tag: 'Cinematic 3D flight',
    text: 'The map rises into 3D and flies itself from one high-priority case to the next, orbiting each building with its facts on screen. Loops as a booth showcase.' },
  { key: 'sitecheck', icon: '📍', title: 'Site Check', tag: '"Can I build here?" in one click',
    text: 'Click any spot in Kemaman: the cadastral lot and its size, land use, distance to the road reserve, the buildings and approved plans on that lot, and what approvals a new building needs.' },
  { key: 'portfolio', icon: '🏢', title: 'Developer Portfolio', tag: 'Every plan an applicant holds',
    text: 'Pick a developer or applicant from MPK\'s plan registers: all their plans light up on the map, with files, approval years, rejections and which plans have a building on them.' },
  { key: 'priority', icon: '🎯', title: 'Priority Score', tag: 'Explainable 0–100 ranking',
    text: 'Scores every suspected building on size, evidence, footprint confidence and clustering. The map recolours by urgency and each score shows its breakdown.' },
  { key: 'notice', icon: '📄', title: 'Notice Drafter', tag: 'Enforcement notice in one click',
    text: 'Choose an illegal building and get a ready-to-review draft notice under Act 133, in English or Malay, with the location, lot, footprint, finding and a map snapshot. Download one, or the whole area in one PDF.' },
  { key: 'ask', icon: '🎙️', title: 'Ask the Map', tag: 'Voice or text, English & Malay',
    text: 'Ask “how many illegal buildings in Binjai?” or “tunjuk bangunan haram lebih 1000 m²”. The map answers, highlights the buildings and can speak back.' },
  { key: 'passport', icon: '🪪', title: 'Building Passport', tag: 'One-click case file + QR',
    text: 'Click any building for its case file: satellite close-up, status, lot, UPI, score and a QR code that opens the site on a phone.' },
  { key: 'timeline', icon: '📅', title: 'Approval Timeline', tag: 'Twenty years of approvals, played back',
    text: 'Watch MPK\'s building plan approvals appear on the map year by year, with a bar chart of approvals per year. Pause on any year or drag through time.' },
  { key: 'timemachine', icon: '⏳', title: 'Time Machine', tag: 'Up to 20 years of imagery',
    text: 'Plays every historical satellite capture of the site as a smooth time-lapse, so you can watch the land being cleared and built on.' },
  { key: 'money', icon: '💰', title: 'Revenue Map', tag: 'Recoverable revenue per building, in 3D',
    text: 'Every illegal and pending building rises as a gold column sized by what the council could recover: processing fee plus years of assessment tax. Lists the top buildings and the total.' },
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
            <p>Each one runs live on the real buildings, lots and imagery of Teluk Kalong and the Binjai – Bandar Chukai corridor.</p>
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
  document.body.classList.add('mpk-feat-on');            // the floating status card steps aside
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
  document.body.classList.remove('mpk-feat-on');
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
const mpkFeatReason = (p, s) => mpkJenis(p, s) === 'tolak' ? 'Building plan rejected by MPK (TOLAK)' : mpkJenis(p, s) === 'mockup' ? 'On MPK suspect list'
  : `${p.jarak_jalan_m} m from road centreline (reserve ${s.rizab} m)`;

// ---------- The tools run here ----------
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
      <div class="mpk-hud-sub">Score = size ${W.size * 100}% + evidence ${W.evidence * 100}% + footprint confidence ${W.confidence * 100}% + in a hotspot ${W.cluster * 100}%</div>
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

  // 6. Ask the map (text or voice)
  ask() {
    const Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
    const examples = ['How many illegal buildings in Binjai?', 'Show suspected buildings over 1000 m²', 'Largest legal building in Teluk Kalong',
                      'Berapa bangunan haram di Teluk Kalong?', 'Illegal buildings in Taman Chukai Utama', 'Illegal buildings in Kerteh',
                      'Tunjuk hotspot', 'Start the drone tour'];
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
    mpkFeatSrc('mpk-feat-ask-place', mpkFC([]));
    mpkFeatLayer({ id: 'mpk-feat-ask-place', type: 'line', source: 'mpk-feat-ask-place',
      paint: { 'line-color': '#7E57C2', 'line-width': 2.5, 'line-dasharray': [2, 1.5] } });
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
      map.addSource(id, { type: 'raster', tiles: [mpkWaybackTileUrl(frames[i].release)], tileSize: 256, maxzoom: frames[i].maxzoom,
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

};

// ---------- Tool helpers (called from HUD markup) ----------
function mpkScoreColor(v) {
  return v >= 85 ? '#6A1B1A' : v >= 65 ? '#E53935' : v >= 45 ? '#FF8F00' : '#F9A825';
}

// Search box for place names: the whole Kemaman district (from the land-use file), else the search box
function mpkAskViewbox() {
  const d = MPK.data.landuse && MPK.data.landuse.features.find(f => f.properties.zone === 'district');
  if (!d) return MPK_SEARCH_VIEWBOX;
  const [[w, so], [e, n]] = mpkBoundsOf([d]);
  return [w, n, e, so].map(v => v.toFixed(3)).join(',');
}

// Ask the map: find where a place is (OSM land-use names first, then OpenStreetMap search in Kemaman)
const MPK_ASK_PLACES = new Map();
async function mpkAskResolvePlace(place) {
  if (MPK_ASK_PLACES.has(place)) return MPK_ASK_PLACES.get(place);
  let found = null;
  const zone = MPK.data.landuse && mpkAskLocalPlace(place, MPK.data.landuse.features);
  if (zone) {
    const polys = zone.geometry.type === 'Polygon' ? [zone.geometry.coordinates] : zone.geometry.coordinates;
    found = { name: zone.properties.name, rings: polys.map(r => r[0]), geometry: zone.geometry };
  } else {
    try {
      const url = 'https://nominatim.openstreetmap.org/search?' + new URLSearchParams({
        format: 'jsonv2', q: place, viewbox: mpkAskViewbox(), bounded: 1, countrycodes: 'my', limit: 8 });
      const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 7000);
      const list = await (await fetch(url, { headers: { 'Accept-Language': 'en' }, signal: ctl.signal })).json();
      // prefer a town / village / estate, then anything named after the words asked, then the first hit
      // only a hit named after the words asked counts (a railway tagged "Kerteh" is not Kerteh);
      // among those, a town / village / estate first
      const named = x => (x.name || '').toLowerCase().includes(place);
      const r = list.find(x => (x.category === 'place' || x.category === 'boundary') && named(x)) || list.find(named);
      clearTimeout(t);
      if (r) {
        const [s0, n0, w0, e0] = r.boundingbox.map(Number), center = [+r.lon, +r.lat];
        const name = r.name || r.display_name.split(',')[0];
        // a town or estate: its own box (+300 m); a single spot: 1 km around it
        found = (n0 - s0) > 0.004 && (n0 - s0) < 0.08
          ? { name, bbox: [w0 - 0.003, s0 - 0.003, e0 + 0.003, n0 + 0.003], center }
          : { name, center, radius: 1000 };
      }
    } catch (e) {
      MPK_ASK_PLACES.delete(place);
      return { error: true };
    }
  }
  MPK_ASK_PLACES.set(place, found);
  return found;
}

function mpkAskPlaceShape(found) {
  if (found.geometry) return { type: 'Feature', properties: {}, geometry: found.geometry };
  if (found.bbox) {
    const [w, so, e, n] = found.bbox;
    return { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [[[w, so], [e, so], [e, n], [w, n], [w, so]]] } };
  }
  const ring = [];
  for (let a = 0; a <= 360; a += 8) ring.push(mpkOffset(found.center, a, found.radius));
  return { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [ring] } };
}

// Ask the map: run a question
async function mpkAskRun(text) {
  const input = document.getElementById('mpk-ask-q');
  if (input && input.value !== text) input.value = text;
  const seq = (mpkAskRun.seq = (mpkAskRun.seq || 0) + 1);
  const q = mpkAsk(text), out = document.getElementById('mpk-ask-answer');
  const named = MPK.data.landuse && mpkAskNamedIn(text, MPK.data.landuse.features);
  if (named && !MPK_ASK_TOOLS.includes(q.intent)) {
    q.place = named; q.area = null;
    if (q.intent === 'help') q.intent = 'count';
  }
  const say = msg => {
    if (seq !== mpkAskRun.seq) return;
    if (out) out.innerHTML = `<b>${mpkEsc(msg)}</b>`;
    const speak = document.getElementById('mpk-ask-speak');
    if (speak && speak.checked && window.speechSynthesis) {
      try { speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(msg); u.lang = 'en-GB'; speechSynthesis.speak(u); } catch (e) {}
    }
  };
  const show = (feats, place) => {
    map.getSource('mpk-feat-ask').setData(mpkFC(feats));
    if (map.getSource('mpk-feat-ask-place')) map.getSource('mpk-feat-ask-place').setData(mpkFC(place ? [mpkAskPlaceShape(place)] : []));
  };
  if (MPK_ASK_TOOLS.includes(q.intent) && q.intent !== 'reset') {
    const f = MPK_FEATURES.find(x => x.key === q.intent);
    say('Opening ' + f.title + '.');
    setTimeout(() => mpkFeatLaunch(q.intent), 700);
    return;
  }
  if (q.intent === 'reset') { show([]); say('Cleared.'); return; }
  if (q.intent === 'help') {
    show([]);
    say('Sorry, I did not understand that question, so I will not guess. Ask about illegal, legal or not-verified buildings, '
      + 'a place, a size such as over 1000 square metres, or a lot number. ' + MPK_ASK_COVERAGE);
    return;
  }
  let place = null;
  if (q.place) {
    if (out) out.innerHTML = `Looking for “${mpkEsc(q.place)}” in Kemaman…`;
    place = await mpkAskResolvePlace(q.place);
    if (seq !== mpkAskRun.seq) return;
    if (place && place.error) { show([]); say(`I could not look up “${q.place}” right now (no connection to the map search). Try again, or ask about a study area.`); return; }
    if (!place) { show([]); say(`I could not find “${q.place}” in Kemaman, so I have no data for it. ` + MPK_ASK_COVERAGE); return; }
  }
  const all = MPK.data.buildings.features;
  const feats = place ? all.filter(f => mpkInPlace(f.properties, place)) : all;
  if (place && !feats.length) {
    show([], place);
    const c = place.center || mpkBoundsOf([mpkAskPlaceShape(place)]).reduce((a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]);
    map.flyTo({ center: c, zoom: 13.5, pitch: 0, duration: 1200 });
    say(`No data for ${place.name}: it is outside the areas we monitor. ` + MPK_ASK_COVERAGE);
    return;
  }
  if (q.area && q.area !== MPK.area && MPK.area !== 'all') mpkSelectArea('all');
  const ans = mpkAskAnswer(q, feats, MPK.settings, place && (place.radius ? `and around ${place.name} (1 km)` : place.name));
  const ids = new Set(ans.ids);
  const hits = all.filter(f => ids.has(f.properties.id));
  show(hits, place);
  say((q.district ? 'For Kemaman, only the marked study areas have data. ' : '') + ans.text);
  if (ans.focus) mpkZoomTo(ans.focus);
  else if (hits.length) map.fitBounds(mpkBoundsOf(hits), { padding: 90, maxZoom: 18, pitch: 0, duration: 1000 });
  else if (place) map.fitBounds(mpkBoundsOf([mpkAskPlaceShape(place)]), { padding: 90, maxZoom: 16, pitch: 0, duration: 1000 });
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
  // Esri World Imagery stops at z18 over Kemaman (z19 answers "Map data not yet available"),
  // so small buildings use z18 tiles drawn at 2x instead
  const z = span < 90 ? 18 : 17, k = span < 40 ? 2 : 1, T = 256 * k;
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
        style="width:${T}px;height:${T}px;left:calc(50% + ${Math.round((x * 256 - cx) * k)}px);top:calc(50% + ${Math.round((y * 256 - cy) * k)}px)">`;
    }
  }
  const rings = f.geometry.type === 'Polygon' ? [f.geometry.coordinates[0]] : f.geometry.coordinates.map(p => p[0]);
  const outline = rings.map(r => `<polygon points="${r.map(c => ((px(c[0]) - cx) * k).toFixed(1) + ',' + ((py(c[1]) - cy) * k).toFixed(1)).join(' ')}"/>`).join('');
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
    ${row('Footprint', mpkSourceLabel(p))}
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
