const assert = require('assert');
const S = require('../mpk-strata.js');
const D = S.STRATA_DEFAULTS;

// WF1, Act 757 First Schedule Table 1: by parcel type, air-con to common areas and a common lift
assert.strictEqual(S.strataWF1('pangsapuri', false, true), 1.00);
assert.strictEqual(S.strataWF1('pangsapuri', false, false), 0.85);
assert.strictEqual(S.strataWF1('runcit', true, true), 3.20);
assert.strictEqual(S.strataWF1('hotel', true, false), 2.45);
assert.strictEqual(S.strataWF1('industri', true, true), 1.45);
assert.strictEqual(S.strataWF1('kedai_bawah', false, true), 0.85);
assert.strictEqual(S.strataWF1('kedai_atas', true, true), 1.30);

// Share units = round(area × WF1 × WF2 + accessory area × WF3)
const su = S.strataShareUnits([
  { luas: '100', jenis: 'pangsapuri', wf2: 'tidak', aks_luas: '' },
  { luas: '100', jenis: 'pangsapuri', wf2: 'tidak', aks_luas: '12.5', aks_lokasi: 'luar' },     // + 12.5 × 0.25 = 3.125
  { luas: '1000', jenis: 'pejabat', wf2: 'dengan', aks_luas: '20', aks_lokasi: 'dalam' },       // 1000 × 1.3 × 0.8 + 10
], { aircond: true, lif: true });
assert.deepStrictEqual(su.su, [130, 133, 1050]);
assert.strictEqual(su.total, 1313);
assert.strictEqual(su.rows[2].wf2, 0.8);
assert.strictEqual(su.rows[1].wf3, 0.25);
// rounding to the nearest whole number: 108.5 → 109
assert.strictEqual(S.strataShareUnits([{ luas: '108.5', jenis: 'pejabat', wf2: 'tidak' }], { aircond: false, lif: true }).su[0], 109);
assert.strictEqual(S.strataShareUnits([{ luas: '108.4', jenis: 'pejabat', wf2: 'tidak' }], { aircond: false, lif: true }).su[0], 108);

// Parcels: a shop-house scheme has ground-floor and upper-floor parcels
const ps = S.strataGenParcels(3, 2, 200, 'kedai');
assert.deepStrictEqual(ps.map(p => p.petak), ['M1-01', 'M1-02', 'M2-01', 'M2-02', 'M3-01', 'M3-02']);
assert.deepStrictEqual(ps.map(p => p.jenis), ['kedai_bawah', 'kedai_bawah', 'kedai_atas', 'kedai_atas', 'kedai_atas', 'kedai_atas']);
assert.strictEqual(ps[0].luas, String(200 * S.STRATA_NET / 2));
assert.strictEqual(S.strataGenParcels(2, 1, 100, 'industri')[1].jenis, 'industri');
assert.strictEqual(S.strataCommon({ bld: { area_m2: 200 }, bim: { tingkat: '3' }, parcels: ps, common: '' }), 90);

// Tax by the parcel's use, Charges by share units, sinking fund 10 %
assert.strictEqual(S.strataTax({ luas: '100', jenis: 'industri', nilai: '' }, D), 648);
assert.strictEqual(S.strataTax({ luas: '100', jenis: 'pangsapuri', nilai: '12,000' }, D), 720);
assert.deepStrictEqual(S.strataCharges(135, '0.30'), { caj: 40.5, sinking: 4.05 });

// Heights to floors (3.5 m a floor)
assert.strictEqual(S.strataFloorsFromHeight(8.3), 2);
assert.strictEqual(S.strataFloorsFromHeight(1), 1);
assert.strictEqual(S.strataHeight({ tingkat: '4' }), 14);

// Months, with a short month
assert.strictEqual(S.strataAddMonths('2026-01-31', 1), '2026-02-28');
assert.strictEqual(S.strataAddMonths('2026-10-14', 12), '2027-10-14');

// Deadlines: CPSP 3 months (+1) from completion, subdivision 1 month (+1) from CPSP, JMB AGM 12 months from VP
const d = S.strataDeadlines({ app: { d_siap: '2026-01-10', d_cpsp_mohon: '2026-04-20', d_cpsp: '2026-08-01' }, urus: { d_vp: '2026-02-01' } }, '2026-10-14');
assert.deepStrictEqual(d.map(x => x.status), ['ok', 'overdue', 'open']);
assert.strictEqual(d[0].note, 'within the extension');
assert.strictEqual(d[1].due, '2026-09-01');
assert.strictEqual(d[2].due, '2027-02-01');
assert.strictEqual(S.strataDeadlines({ app: {}, urus: {} }, '2026-10-14')[0].status, 'na');
assert.strictEqual(S.strataDeadlines({ app: { d_siap: '2026-01-10', d_cpsp_mohon: '2026-06-01' }, urus: {} }, '2026-10-14')[0].status, 'late');

// Votes by share units
const v = S.strataVote([100, 200, 300, 400], ['ya', 'ya', 'tidak', '']);
assert.deepStrictEqual([v.yes, v.no, v.abstain, v.ordinary, v.special, v.unanimous], [300, 300, 400, false, false, false]);
assert.strictEqual(S.strataVote([100, 300], ['ya', 'ya']).unanimous, true);
assert.strictEqual(S.strataVote([300, 100], ['ya', 'tidak']).special, true);        // 300 ≥ ¾ of 400

// Sinking fund over the years
const sf = S.strataSinking(100, '1000', [{ tahun: 2, kos: '3000' }], 3);
assert.deepStrictEqual(sf.map(x => x.bal), [2200, 400, 1600]);

// Strata potential
assert.strictEqual(S.strataPotential({ tingkat_est: 4, area_m2: 500, lot: '12' }, 'legal'), 40 + 20 + 25 + 10);
assert.strictEqual(S.strataPotential({ tingkat_est: 1, area_m2: 80 }, 'suspected'), 0);

assert.strictEqual(S.strataNextNo(['STR/2026/0004', 'KBR/2026/0007'], 'STR', 2026), 'STR/2026/0005');
console.log('mpk strata: all tests passed');
