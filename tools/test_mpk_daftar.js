const assert = require('assert');
const D = require('../mpk-daftar.js');

// One area row: 9 m² units (part of one counts), the rate, then the floor's minimum
assert.deepStrictEqual(D.mpkDpbArea('', 14, 140), { kadar: 0, jumlah: 0 });
assert.deepStrictEqual(D.mpkDpbArea('90', 14, 140), { kadar: 10, jumlah: 140 });
assert.deepStrictEqual(D.mpkDpbArea('100', 14, 140), { kadar: 12, jumlah: 168 });
assert.deepStrictEqual(D.mpkDpbArea('5', 14, 140), { kadar: 1, jumlah: 140 });          // the minimum
assert.deepStrictEqual(D.mpkDpbArea('1,800', 7, 0), { kadar: 200, jumlah: 1400 });     // thousands separator

// Para 9 bands: 1, 4, 5, 15, then the rest
assert.deepStrictEqual(D.mpkDpbSeriesUnits(30), [1, 4, 5, 15, 5]);
assert.deepStrictEqual(D.mpkDpbSeriesUnits('3'), [1, 2, 0, 0, 0]);
assert.deepStrictEqual(D.mpkDpbSeriesUnits(''), [0, 0, 0, 0, 0]);

// A whole form: every section lands in its line of the summary
const f = D.mpkDpbBlank();
f.unit = '7';
f.p1 = ['592.4', '100', '', '', ''];          // 66 units × 14 = 924; 12 units × 12 = 144
f.p9k = '1000';                               // 1000 + 4 × 900 + 2 × 850 = 6300
f.p2 = '45';                                  // 5 × 7 = 35
f.p61 = '';
f.p65 = '3';                                  // 150
f.khas = { dermaga: '18', tel_tanah_b: '1', tembok: '20' };   // 2 × 50 = 100; 2000; 3 × 6 = 18
f.p101 = '2';                                 // 240
f.p102a = '1';                                // 120
f.p102b = ['9', '', '', '', ''];              // 1 unit × 14 → minimum 140
const c = D.mpkDpbCalc(f);
assert.strictEqual(c.p1Sub, 924 + 144);
assert.strictEqual(c.p9Sub, 6300);
assert.deepStrictEqual(c.summary, { baru: 1068 + 6300, sementara: 35, tambahan: 0, ubahsuai: 150,
  pindaan: 240 + 120 + 140, khas: 118, telko: 2000 });
assert.strictEqual(c.total, 7368 + 35 + 150 + 500 + 118 + 2000);
// para 9 needs a unit fee: without one nothing is charged and no units are spread
assert.strictEqual(D.mpkDpbCalc({ ...f, p9k: '' }).p9Sub, 0);
assert.strictEqual(D.mpkDpbCalc(D.mpkDpbBlank()).total, 0);

// Registration numbers run per year
assert.strictEqual(D.mpkDpbNextNo([], 2026), 'DPB/2026/0001');
assert.strictEqual(D.mpkDpbNextNo([{ no: 'DPB/2026/0007' }, { no: 'DPB/2025/0040' }, { no: 'x' }], 2026), 'DPB/2026/0008');

console.log('mpk daftar: all tests passed');
