const assert = require('assert');
const { mpkJenis, mpkSuspectFilter, mpkStats, mpkCSV } = require('../mpk.js');

const f = (id, kawasan, kategori, extra, area_m2) => ({
  properties: { id, kawasan, kategori, area_m2, confidence: 0.8, plus_code: 'X' + id, lng: 103.4, lat: 4.2, ...extra },
});
const feats = [
  f(1, 'tk', 'lulus', {}, 100),
  f(2, 'tk', 'tiada_lot', {}, 50),
  f(3, 'tk', 'luar', { jarak_m: 600 }, 200),
  f(4, 'tk', 'luar', { jarak_m: 500 }, 30),
  f(5, 'bpb', 'koridor', { jarak_jalan_m: 8.5 }, 70),
  f(6, 'bpb', 'koridor', { jarak_jalan_m: 12 }, 90),
  f(7, 'bbc', 'koridor', { jarak_jalan_m: null }, 40),
];
const s = { buffer: 500, rizab: 10 };
const rates = { fee: 2, cukai: 6 };

// jenis (suspect type) per building
assert.deepStrictEqual(feats.map(x => mpkJenis(x.properties, s)),
  [null, 'tiada_lot', null, 'luar_sempadan', 'rizab', null, null]);
assert.strictEqual(mpkJenis(feats[5].properties, { buffer: 500, rizab: 12 }), 'rizab');

// stats, all areas
const all = mpkStats(feats, s, rates, 'all');
assert.strictEqual(all.total, 7);
assert.strictEqual(all.lulus, 1);
assert.strictEqual(all.count, 3);
assert.strictEqual(all.area, 150);
assert.deepStrictEqual(all.byJenis, { tiada_lot: 1, luar_sempadan: 1, rizab: 1 });
assert.strictEqual(all.fee, 300);
assert.strictEqual(all.cukai, 900);
assert.deepStrictEqual(all.suspects.map(x => x.properties.id), [5, 2, 4]);   // largest first

// stats, one area
const bpb = mpkStats(feats, s, rates, 'bpb');
assert.strictEqual(bpb.total, 2);
assert.strictEqual(bpb.count, 1);
assert.deepStrictEqual(bpb.byJenis, { tiada_lot: 0, luar_sempadan: 0, rizab: 1 });

// map filter mirrors mpkJenis
assert.deepStrictEqual(mpkSuspectFilter(s), ['any',
  ['==', ['get', 'kategori'], 'tiada_lot'],
  ['all', ['==', ['get', 'kategori'], 'luar'], ['<=', ['get', 'jarak_m'], 500]],
  ['all', ['==', ['get', 'kategori'], 'koridor'],
    ['<=', ['to-number', ['coalesce', ['get', 'jarak_jalan_m'], 1e9]], 10]],
]);

// CSV
const csv = mpkCSV(all.suspects, rates, s).trim().split('\n');
assert.strictEqual(csv.length, 4);
assert.strictEqual(csv[0], 'id,kawasan,jenis,plus_code,lng,lat,jarak_m,area_m2,confidence,anggaran_fee_rm,anggaran_cukai_tahunan_rm');
assert.strictEqual(csv[1], '5,bpb,rizab,X5,103.4,4.2,8.5,70,0.8,140.00,420.00');
assert.strictEqual(csv[2], '2,tk,tiada_lot,X2,103.4,4.2,,50,0.8,100.00,300.00');
assert.strictEqual(csv[3], '4,tk,luar_sempadan,X4,103.4,4.2,500,30,0.8,60.00,180.00');

console.log('mpk logic: all tests passed');
