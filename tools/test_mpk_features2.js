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

// Working days skip the Terengganu weekend (Friday, Saturday). 15 Oct 2026 is a Thursday.
assert.deepStrictEqual(F.mpkWorkdays(new Date(2026, 9, 15), 3).map(F.mpkYMD), ['2026-10-15', '2026-10-18', '2026-10-19']);
assert.deepStrictEqual(F.mpkWorkdays(new Date(2026, 9, 16), 1).map(F.mpkYMD), ['2026-10-18']);         // starts on a Friday
assert.deepStrictEqual(F.mpkWorkdays(new Date(2026, 9, 16), 2, [0, 6]).map(F.mpkYMD), ['2026-10-16', '2026-10-19']);

// Batches: the most urgent case seeds a day, its nearest cases fill it, the rest go to later days
const A = [90, 50, 40, 30].map((sc, i) => ({ score: sc, p: { id: 'A' + sc, lng: mpkOffset(origin, i * 90, 40 + i * 10)[0],
  lat: mpkOffset(origin, i * 90, 40 + i * 10)[1] } }));
const far5 = mpkOffset(origin, 90, 5000);
const B = [80, 70].map((sc, i) => ({ score: sc, p: { id: 'B' + sc, lng: mpkOffset(far5, 0, i * 60)[0], lat: mpkOffset(far5, 0, i * 60)[1] } }));
const items = [A[0], B[0], B[1], A[1], A[2], A[3]];                                // most urgent first
const batches = F.mpkPlanBatches(items, 3);
assert.strictEqual(batches.length, 2);
assert.strictEqual(batches[0][0].p.id, 'A90');                                   // the seed leads the route
assert.deepStrictEqual(batches[0].map(x => x.p.id).sort(), ['A40', 'A50', 'A90']);
assert.deepStrictEqual(batches[1].map(x => x.p.id).slice(0, 2), ['B80', 'B70']);
assert.strictEqual(batches.flat().length, 6);

// Schedule: batches go to teams in turn, a new day when every team has one
const plan = F.mpkPlanSchedule(items, { teams: 2, perDay: 2, start: new Date(2026, 9, 15) });
assert.deepStrictEqual(plan.map(b => [b.day, F.mpkYMD(b.date), b.team, b.stops.length]),
  [[1, '2026-10-15', 1, 2], [1, '2026-10-15', 2, 2], [2, '2026-10-18', 1, 2]]);
assert.ok(plan.every(b => b.km >= 0 && b.hours >= b.stops.length * 15 / 60));
const one = F.mpkPlanSchedule([A[0]], { teams: 3, perDay: 10, start: new Date(2026, 9, 15) });
assert.deepStrictEqual([one.length, one[0].km, one[0].hours], [1, 0, 0.25]);
assert.deepStrictEqual(F.mpkPlanSchedule([], { start: new Date(2026, 9, 15) }), []);

// CSV: header + one row per visit, with the reason and a Google Maps link
const csvPlan = F.mpkPlanSchedule([{ score: 77, p: feats[3].properties }, { score: 60, p: feats[0].properties }],
  { teams: 1, perDay: 5, start: new Date(2026, 9, 15) });
const lines = F.mpkPlanCSV(csvPlan, s).split('\n');
assert.strictEqual(lines.length, 3);
assert.strictEqual(lines[0], 'day,date,team,stop,plus_code,area,lot,upi,footprint_m2,priority,reason,lat,lng,google_maps');
assert.ok(lines[1].startsWith('1,2026-10-15,1,1,P4,Binjai – Chukai,,,800,77,Within 4 m of road centreline (reserve 10 m),'));
assert.ok(lines[2].includes(',On MPK suspect list,') && lines[2].includes('https://www.google.com/maps/search/?api=1&query='));

console.log('mpk features 12-15: all tests passed');
