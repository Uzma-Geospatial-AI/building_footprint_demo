const assert = require('assert');
Object.assign(global, require('../mpk.js'));       // the features module uses mpk.js globals
const F = require('../mpk-features.js');

const near = (a, b, tol) => assert.ok(Math.abs(a - b) <= tol, `${a} not within ${tol} of ${b}`);

// Geometry: 0.001° of latitude ≈ 111 m; a 100 m square ≈ 10,000 m²
near(F.mpkMetres([103.4, 4.2], [103.4, 4.201]), 111.3, 0.5);
const sq = F.mpkOffset([103.4, 4.2], 90, 100), up = F.mpkOffset([103.4, 4.2], 0, 100);
near(F.mpkMetres([103.4, 4.2], sq), 100, 0.01);
const ring = [[103.4, 4.2], [sq[0], 4.2], [sq[0], up[1]], [103.4, up[1]], [103.4, 4.2]];
near(F.mpkRingArea(ring), 10000, 5);
near(F.mpkPolyArea({ type: 'Polygon', coordinates: [ring] }), 10000, 5);
near(F.mpkBearing([103.4, 4.2], up), 0, 0.01);
near(F.mpkBearing([103.4, 4.2], sq), 90, 0.01);
assert.strictEqual(F.mpkConvexHull([[0, 0], [2, 0], [1, 1], [2, 2], [0, 2], [1, 0.5]]).length, 4);

// DBSCAN: two tight groups and one loner
const g = (c, n) => Array.from({ length: n }, (_, i) => F.mpkOffset(c, i * 72, 20));
const pts = [...g([103.40, 4.20], 5), ...g([103.45, 4.25], 4), [103.5, 4.3]];
const labels = F.mpkDbscan(pts, 60, 4);
assert.deepStrictEqual(labels, [0, 0, 0, 0, 0, 1, 1, 1, 1, -1]);

// Buildings for the scoring / hotspot / ask tests
let id = 0;
const b = (kawasan, kategori, area_m2, c, extra = {}) => ({ type: 'Feature',
  properties: { id: ++id, kawasan, kategori, area_m2, confidence: 0.8, plus_code: 'P' + id, lng: c[0], lat: c[1], ...extra },
  geometry: { type: 'Polygon', coordinates: [[c, c, c, c]] } });
const s = { rizab: 10 };
const feats = [
  ...g([103.40, 4.20], 5).map(c => b('tk', 'mockup', 200, c, { dalam: true })),   // a cluster of 5 on MPK's list
  b('bbc', 'koridor', 5000, [103.45, 4.25], { jarak_jalan_m: 0 }),
  b('bbc', 'koridor', 10, [103.46, 4.26], { jarak_jalan_m: 10 }),
  b('bbc', 'koridor', 900, [103.47, 4.27], { jarak_jalan_m: 25 }),               // outside the reserve
  b('tk', 'lulus', 1500, [103.41, 4.21], { dalam: true, lot: '3020', upi: 'U1' }),
];
const hot = F.mpkHotspots(feats, s);
assert.strictEqual(hot.length, 1);
assert.strictEqual(hot[0].id, 'H1');
assert.strictEqual(hot[0].n, 5);
assert.strictEqual(hot[0].m2, 1000);
assert.strictEqual(hot[0].kawasan, 'tk');

// Priority: largest on the centreline scores high; tiny at the reserve edge low; legal = no score
assert.strictEqual(F.mpkPriority(feats[5].properties, s, false).score, Math.round(100 * (0.45 + 0.25 + 0.15 * 0.8)));
assert.strictEqual(F.mpkPriority(feats[6].properties, s, false).score, Math.round(100 * (0.25 * 0.4 + 0.15 * 0.8)));
assert.strictEqual(F.mpkPriority(feats[8].properties, s, false), null);
const ranked = F.mpkPriorityList(feats, s, hot);
assert.strictEqual(ranked.length, 7);
assert.strictEqual(ranked[0].p.id, 6);
assert.ok(ranked.every((x, i) => !i || ranked[i - 1].pr.score >= x.pr.score));
assert.strictEqual(ranked.find(x => x.p.id === 1).pr.parts.cluster, 1);

// Route: a straight line visited in order from the first stop, whatever the input order
const line = [0, 3, 1, 4, 2].map(k => [103.4 + k * 0.01, 4.2]);
assert.deepStrictEqual(F.mpkRouteOrder(line).map(i => line[i][0]), [0, 1, 2, 3, 4].map(k => 103.4 + k * 0.01));
assert.strictEqual(F.mpkGmapsDir([[103.4, 4.2], [103.5, 4.3]]), 'https://www.google.com/maps/dir/4.200000,103.400000/4.300000,103.500000');

// Lot coverage: a 1,500 m² building on a 10,000 m² lot = 15%
const cov = F.mpkLotCoverage([{ properties: { lot: '3020', upi: 'U1' }, geometry: { type: 'Polygon', coordinates: [ring] } },
                              { properties: { lot: '9', upi: 'U9' }, geometry: { type: 'Polygon', coordinates: [ring] } }], feats);
assert.strictEqual(cov.length, 1);
near(cov[0].pct, 15, 0.05);

// Policy curve: the 25 m building joins at 25 m only, so 3–20 m adds just the reserve buildings
const curve = F.mpkPolicyCurve(feats, 3, 20);
assert.strictEqual(curve.length, 18);
assert.deepStrictEqual([curve[0].n, curve.find(c => c.r === 10).n, curve[17].n], [6, 7, 7]);

// Time machine: one frame per distinct capture date, oldest first
assert.deepStrictEqual(F.mpkTimeFrames([
  { release: 3, date: '2020-01-01', capture: { tk: '2019-05-03' } },
  { release: 1, date: '2014-02-20', capture: { tk: '2007-03-16' } },
  { release: 2, date: '2017-01-01', capture: { tk: '2007-03-16' } },
], 'tk').map(f => f.release), [1, 3]);

// Ask the map: English and Malay
const ask = F.mpkAsk;
assert.deepStrictEqual(ask('How many illegal buildings in Binjai?'),
  { intent: 'count', area: 'bbc', status: 'suspected', min: null, max: null, lot: null });
assert.deepStrictEqual(ask('Berapa bangunan haram di Teluk Kalong?'),
  { intent: 'count', area: 'tk', status: 'suspected', min: null, max: null, lot: null });
assert.deepStrictEqual(ask('Tunjuk bangunan sah lebih 1,000 m2'),
  { intent: 'show', area: null, status: 'legal', min: 1000, max: null, lot: null });
assert.strictEqual(ask('show legal buildings').status, 'legal');
assert.strictEqual(ask('Largest legal building in Teluk Kalong').intent, 'largest');
assert.strictEqual(ask('zoom to lot 3020').lot, '3020');
assert.strictEqual(ask('Start the drone tour').intent, 'tour');
assert.strictEqual(ask('Tunjuk hotspot').intent, 'hotspots');
assert.strictEqual(ask('buildings under 50').max, 50);
assert.strictEqual(ask('hello').intent, 'help');

assert.strictEqual(F.mpkAskAnswer(ask('how many illegal buildings in Teluk Kalong'), feats, s).text,
  '5 suspected illegal buildings in Teluk Kalong, 1,000 m² of footprint.');
assert.strictEqual(F.mpkAskAnswer(ask('largest illegal building'), feats, s).focus, 6);
assert.strictEqual(F.mpkAskAnswer(ask('show buildings on lot 3020'), feats, s).ids[0], 9);
assert.strictEqual(F.mpkAskAnswer(ask('legal buildings in Binjai'), feats, s).text, 'No legal buildings in Binjai – Chukai.');

console.log('mpk features: all tests passed');
