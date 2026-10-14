const assert = require('assert');
const H = require('../mpk-harta.js');
const rates = H.MPK_HARTA_DEFAULT_RATES;

// Annual value from area × monthly rent × 12; tax = annual value × the rate of the unit's use
assert.strictEqual(H.mpkHartaAnnualValue('100', 6), 7200);
assert.strictEqual(H.mpkHartaAnnualValue('', 6), 0);
assert.strictEqual(H.mpkHartaTax({ luas: '100', kegunaan: 'Industri', nilai: '' }, rates), 648);          // 7,200 × 9%
assert.strictEqual(H.mpkHartaTax({ luas: '100', kegunaan: 'Kediaman', nilai: '12,000' }, rates), 720);   // entered value wins
assert.strictEqual(H.mpkHartaTax({ luas: '80', kegunaan: 'Lain', nilai: '' }, rates), 0);                // unknown use: no rate

// Units: floors × units per floor, the footprint shared on each floor
const u = H.mpkHartaGenUnits(2, 3, 300, 'Komersial');
assert.strictEqual(u.length, 6);
assert.deepStrictEqual(u.map(x => x.petak), ['M1-01', 'M1-02', 'M1-03', 'M2-01', 'M2-02', 'M2-03']);
assert.strictEqual(u[4].tingkat, '2');
assert.strictEqual(u[0].luas, '100');
assert.strictEqual(H.mpkHartaGenUnits('', '', 50, 'Kediaman').length, 1);

// LOD: footprint 100; floors 200; floors + approved plan 300; verified 500
assert.strictEqual(H.mpkHartaLodSuggest({}, { tingkat: '' }), 100);
assert.strictEqual(H.mpkHartaLodSuggest({}, { tingkat: '3' }), 200);
assert.strictEqual(H.mpkHartaLodSuggest({ pelan_fail: 'TK/1' }, { tingkat: '3' }), 300);
assert.strictEqual(H.mpkHartaLodSuggest({ daftar_status: 'lulus' }, { tingkat: '2' }), 300);
assert.strictEqual(H.mpkHartaLodSuggest({}, { tingkat: '', disahkan: true }), 500);
assert.strictEqual(H.mpkHartaHeight({ tingkat: '3' }), 12);
assert.strictEqual(H.mpkHartaHeight({ tingkat: '3', tinggi: '10.5' }), 10.5);

// Collection: halves paid count half each; arrears are the unpaid amounts of earlier years
const bills = {
  2025: { a: { amount: 1000, p1: '2025-02-01', p2: null } },
  2026: { a: { amount: 1000, p1: '2026-02-01', p2: '2026-08-01' }, b: { amount: 600, p1: '2026-02-10', p2: null }, c: { amount: 400, p1: null, p2: null } },
};
const c = H.mpkHartaCollection(bills, 2026);
assert.deepStrictEqual(c, { billed: 2000, collected: 1300, outstanding: 700, arrears: 500, rate: 0.65, n: 3, unpaid: 2 });
assert.deepStrictEqual(H.mpkHartaCollection({}, 2026), { billed: 0, collected: 0, outstanding: 0, arrears: 0, rate: 0, n: 0, unpaid: 0 });

console.log('mpk harta: all tests passed');
