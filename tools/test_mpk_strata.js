const assert = require('assert');
const S = require('../mpk-strata.js');
const D = S.STRATA_DEFAULTS;

// Parcels: floors × parcels per floor, each an equal share of the floor's saleable area (85 %)
const ps = S.strataGenParcels(3, 2, 200, 'Komersial');
assert.strictEqual(ps.length, 6);
assert.deepStrictEqual(ps.map(p => p.petak), ['M1-01', 'M1-02', 'M2-01', 'M2-02', 'M3-01', 'M3-02']);
assert.strictEqual(ps[0].luas, String(200 * S.STRATA_NET / 2));
assert.strictEqual(S.strataGenParcels('', '', 50, 'Kediaman').length, 1);

// Common property: footprint × floors less the parcels, unless entered
const sc = { bld: { area_m2: 200 }, bim: { tingkat: '3' }, parcels: ps, common: '' };
assert.strictEqual(S.strataCommon(sc), 90);              // 600 − 6 × 85
assert.strictEqual(S.strataCommon({ ...sc, common: '120' }), 120);

// Share units: area × use weightage + accessory area × accessory weightage, rounded
const su = S.strataShareUnits([
  { luas: '100', kegunaan: 'Kediaman', aks_luas: '' },
  { luas: '100', kegunaan: 'Komersial', aks_luas: '20' },
], D.faktor);
assert.deepStrictEqual(su.su, [100, 135]);               // 100 × 1; 100 × 1.3 + 20 × 0.25
assert.strictEqual(su.total, 235);
assert.ok(Math.abs(su.pct[0] - 42.553) < 0.01);

// Assessment tax and the monthly charges (sinking fund 10 % of the charge)
assert.strictEqual(S.strataAnnualValue('100', 6), 7200);
assert.strictEqual(S.strataTax({ luas: '100', kegunaan: 'Industri', nilai: '' }, D), 648);
assert.strictEqual(S.strataTax({ luas: '100', kegunaan: 'Kediaman', nilai: '12,000' }, D), 720);
assert.deepStrictEqual(S.strataCharges(135, '0.30'), { caj: 40.5, sinking: 4.05 });
assert.deepStrictEqual(S.strataCharges(0, '0.30'), { caj: 0, sinking: 0 });

// LOD from the record; height 4 m a floor unless entered
assert.strictEqual(S.strataLodSuggest({}, { tingkat: '' }), 100);
assert.strictEqual(S.strataLodSuggest({}, { tingkat: '2' }), 200);
assert.strictEqual(S.strataLodSuggest({ pelan_fail: 'TK/1' }, { tingkat: '2' }), 300);
assert.strictEqual(S.strataLodSuggest({}, { disahkan: true }), 500);
assert.strictEqual(S.strataHeight({ tingkat: '5' }), 20);
assert.strictEqual(S.strataHeight({ tingkat: '5', tinggi: '17.5' }), 17.5);

// Collection: halves count half each; arrears are the unpaid amounts of earlier years
const c = S.strataCollection({ 2025: { a: { amount: 1000, p1: 'x', p2: null } },
  2026: { a: { amount: 1000, p1: 'x', p2: 'y' }, b: { amount: 600, p1: 'x', p2: null }, c: { amount: 400, p1: null, p2: null } } }, 2026);
assert.deepStrictEqual(c, { billed: 2000, collected: 1300, outstanding: 700, arrears: 500, rate: 0.65, n: 3, unpaid: 2 });

// Numbers run per year
assert.strictEqual(S.strataNextNo([], 'STR', 2026), 'STR/2026/0001');
assert.strictEqual(S.strataNextNo(['STR/2026/0004', 'STR/2025/0009', 'KBR/2026/0007'], 'STR', 2026), 'STR/2026/0005');

console.log('mpk strata: all tests passed');
