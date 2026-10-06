const assert = require('assert');
const { mpkSuspectFilter, mpkSuspects, mpkStats, mpkCSV } = require('../mpk.js');
const f = (id, status, jarak_m, area_m2) => ({ properties: { id, status, jarak_m, area_m2, confidence: 0.8, plus_code: 'X' + id, lng: 103.4, lat: 4.2 } });
const feats = [f(1, 'dalam', 0, 100), f(2, 'luar', 100, 50), f(3, 'luar', 600, 200), f(4, 'luar', 500, 30)];

assert.deepStrictEqual(mpkSuspects(feats, 500).map(x => x.properties.id), [2, 4]);

const s = mpkStats(feats, 500, { fee: 2, cukai: 6 });
assert.strictEqual(s.count, 2);
assert.strictEqual(s.area, 80);
assert.strictEqual(s.inPlan, 1);
assert.strictEqual(s.fee, 160);
assert.strictEqual(s.cukai, 480);
assert.deepStrictEqual(s.suspects.map(x => x.properties.id), [2, 4]);

assert.deepStrictEqual(mpkSuspectFilter(250), ['all', ['==', ['get', 'status'], 'luar'], ['<=', ['get', 'jarak_m'], 250]]);

const csv = mpkCSV(s.suspects, { fee: 2, cukai: 6 }).trim().split('\n');
assert.strictEqual(csv.length, 3);
assert.strictEqual(csv[0], 'id,plus_code,lng,lat,jarak_m,area_m2,confidence,anggaran_fee_rm,anggaran_cukai_tahunan_rm');
assert.strictEqual(csv[1], '2,X2,103.4,4.2,100,50,0.8,100.00,300.00');

console.log('mpk logic: all tests passed');
