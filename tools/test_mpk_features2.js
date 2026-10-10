const assert = require('assert');
Object.assign(global, require('../mpk.js'));
Object.assign(global, require('../mpk-features.js'));
const F = require('../mpk-features2.js');

const near = (a, b, tol) => assert.ok(Math.abs(a - b) <= tol, `${a} not within ${tol} of ${b}`);
const origin = [103.4, 4.2];

// Hexagons: the origin is hex (0,0); a point 100 m east is still in it (150 m hexes), 300 m east is not
assert.deepStrictEqual(F.mpkHexKey(103.4, 4.2, 150, origin).map(Math.abs), [0, 0]);
assert.deepStrictEqual(F.mpkHexKey(mpkOffset(origin, 90, 100)[0], 4.2, 150, origin).map(Math.abs), [0, 0]);
assert.notDeepStrictEqual(F.mpkHexKey(mpkOffset(origin, 90, 300)[0], 4.2, 150, origin).map(Math.abs), [0, 0]);
// a hexagon's centre lands back in the same hexagon, and its area is 3√3/2·s²
const hx = F.mpkHexPolygon(3, -2, 150, origin);
assert.deepStrictEqual(F.mpkHexKey(hx.center[0], hx.center[1], 150, origin), [3, -2]);
near(mpkRingArea(hx.ring), 1.5 * Math.sqrt(3) * 150 * 150, 60);
assert.strictEqual(hx.ring.length, 7);

let id = 0;
const b = (kawasan, kategori, area_m2, c, extra = {}) => ({ type: 'Feature',
  properties: { id: ++id, kawasan, kategori, area_m2, confidence: 0.8, plus_code: 'P' + id, lng: c[0], lat: c[1], ...extra },
  geometry: { type: 'Polygon', coordinates: [[c, c, c, c]] } });
const s = { rizab: 10 };
const feats = [
  b('tk', 'mockup', 300, origin, { dalam: true }),
  b('tk', 'lulus', 100, mpkOffset(origin, 0, 20), { dalam: true }),
  b('tk', 'tiada_lot', 50, mpkOffset(origin, 180, 30), { dalam: true }),
  b('bbc', 'koridor', 800, mpkOffset(origin, 90, 1000), { jarak_jalan_m: 4 }),
];
const bins = F.mpkHexBins(feats, s, 150);
assert.strictEqual(bins.length, 2);
const home = bins.find(x => x.n === 3);
assert.deepStrictEqual([home.sus, home.susM2, home.m2], [1, 300, 450]);
near(home.share, 1 / 3, 1e-9);
assert.strictEqual(bins.find(x => x.n === 1).susM2, 800);

// Within a radius
const w = F.mpkWithin(feats, origin, 100, s);
assert.deepStrictEqual([w.n, w.byStatus.suspected, w.byStatus.legal, w.byStatus.unverified, w.susM2, w.m2], [3, 1, 1, 1, 300, 450]);
assert.strictEqual(w.nearest.p.id, 1);
near(w.nearest.d, 0, 1e-6);
const far = F.mpkWithin(feats, mpkOffset(origin, 90, 1500), 200, s);
assert.strictEqual(far.n, 0);
assert.strictEqual(far.nearest.p.id, 4);                                         // nearest suspected even outside
near(far.nearest.d, 500, 1);

// Fair pick: rejection sampling keeps every index equally likely
let seq = [0xFFFFFFFF, 7];                                                      // first value is above the limit for n=3
assert.strictEqual(F.mpkFairIndex(3, () => seq.shift()), 7 % 3);
const counts = [0, 0, 0, 0, 0];
let x = 12345;
const lcg = () => (x = (Math.imul(x, 1664525) + 1013904223) >>> 0);
for (let i = 0; i < 50000; i++) counts[F.mpkFairIndex(5, lcg)]++;
counts.forEach(c => near(c, 10000, 400));

// Roulette slows down: delays never shrink, from fast to slow
const d = F.mpkRouletteDelays(34, 45, 520);
assert.strictEqual(d.length, 34);
assert.deepStrictEqual([d[0], d[33]], [45, 520]);
assert.ok(d.every((v, i) => !i || v >= d[i - 1]));

console.log('mpk features 12-15: all tests passed');
