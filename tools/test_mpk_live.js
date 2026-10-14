const assert = require('assert');
const L = require('../mpk-live.js');

// Web Mercator metres → lng / lat
const [lng, lat] = L.mpkLiveLngLat(11512000, 477000);
assert.ok(Math.abs(lng - 103.4140555) < 1e-6 && Math.abs(lat - 4.2809751) < 1e-6, `${lng},${lat}`);
// Plus Codes as tools/build_mpk_manual.py writes them
assert.strictEqual(L.mpkLivePlusCode(4.303094, 103.446184), '6PP58C3W+6FM');

// A 20 m × 10 m footprint in Mercator metres
const sq = (x, y, w, h) => ({ type: 'Feature', properties: {}, geometry: { type: 'MultiPolygon',
  coordinates: [[[[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y]]]] } });
const s = L.mpkLiveShape(sq(11512000, 477000, 20, 10));
assert.ok(Math.abs(s.area - 198) < 6, 'area ' + s.area);              // Mercator metres are ~0.3 % larger here
assert.strictEqual(L.mpkLiveShape({ type: 'Feature', geometry: { type: 'MultiPolygon', coordinates: [] } }), null);
assert.strictEqual(L.mpkLiveShape({ type: 'Feature', geometry: null }), null);

// Matching: same place and area → that building; moved 10 m or twice the size → new
const built = [{ lng: s.centre[0], lat: s.centre[1], area_m2: s.area }];
assert.deepStrictEqual(L.mpkLiveMatch([s], built, 2), [0]);
const moved = L.mpkLiveShape(sq(11512010, 477000, 20, 10));
assert.deepStrictEqual(L.mpkLiveMatch([moved], built, 2), [-1]);
const bigger = L.mpkLiveShape(sq(11511995, 477000, 30, 10));
assert.deepStrictEqual(L.mpkLiveMatch([bigger], built, 2), [-1]);
// each built building is taken once, by the nearest
const twin = L.mpkLiveShape(sq(11512000.5, 477000, 20, 10));
assert.deepStrictEqual(L.mpkLiveMatch([twin, s], built, 2), [-1, 0]);

// Merge: kept building keeps id and status with the new outline; a new one in the boundary is classified
const ring = [[103.40, 4.27], [103.43, 4.27], [103.43, 4.30], [103.40, 4.30], [103.40, 4.27]];
const keep = { type: 'Feature', properties: { id: 7, kawasan: 'tk', dalam: true, kategori: 'lulus', lng: s.centre[0], lat: s.centre[1], area_m2: s.area, tinggi_m: 8, tingkat_est: 2 },
  geometry: s.geometry };
const data = { buildings: { features: [keep] }, others: { features: [] }, boundary: { features: [{ geometry: { type: 'Polygon', coordinates: [ring] } }] },
  roads: { features: [] }, kadaster: { features: [] }, pelan: { features: [] } };
const fresh = sq(11512060, 477030, 15, 15);                       // ~60 m away: takes its height
const m = L.mpkLiveMerge(data, [sq(11512000, 477000, 20, 10), fresh]);
assert.deepStrictEqual(m.stats, { footprints: 2, kept: 1, added: 1, removed: 0, study: 2, others: 0 });
assert.strictEqual(m.data.buildings.features[0].properties.id, 7);
assert.strictEqual(m.data.buildings.features[0].properties.kategori, 'lulus');
const n = m.data.buildings.features[1].properties;
assert.deepStrictEqual([n.id, n.kawasan, n.kategori, n.tingkat_est, n.live], [8, 'tk', 'tiada_pelan', 2, true]);
// a footprint gone from the source is dropped
assert.strictEqual(L.mpkLiveMerge(data, [fresh]).stats.removed, 1);

console.log('mpk live: all tests passed');
