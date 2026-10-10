const assert = require('assert');
const mpk = require('../mpk.js');
Object.assign(global, mpk);                       // the report module uses mpk.js globals
const { mpkReportId, mpkReportSuspectRows, mpkReportSummaryRows } = require('../mpk-report.js');

// System report ID: BV-YYYYMMDD-HHMM (local time) — not an official council reference
assert.strictEqual(mpkReportId(new Date(2026, 9, 11, 14, 5)), 'BV-20261011-1405');

const f = (id, kawasan, kategori, extra, area_m2) => ({
  properties: { id, kawasan, kategori, area_m2, confidence: 0.8, plus_code: 'X' + id, lng: 103.4, lat: 4.2, ...extra },
});
const s = { rizab: 10 };
const feats = [
  f(1, 'tk', 'lulus', { dalam: true, lot: '100' }, 400),
  f(2, 'tk', 'mockup', { dalam: true, lot: '52497', upi: '11030800052497' }, 50.4),
  f(3, 'bbc', 'koridor', { jarak_jalan_m: 6.3 }, 1786.5),
  f(4, 'tk', 'tiada_lot', { dalam: true }, 30),
];

// Suspected buildings, largest first, with a plain-language reason
assert.deepStrictEqual(mpkReportSuspectRows(feats, s), [
  ['1', 'X3', 'Binjai – Chukai', '—', '—', 'Within 6.3 m of road centreline (reserve 10 m)', '1,787'],
  ['2', 'X2', 'Teluk Kalong', '52497', '11030800052497', 'On MPK suspect list', '50'],
]);

// Summary table: one row per status plus a total
assert.deepStrictEqual(mpkReportSummaryRows(feats, s), [
  ['Suspected illegal', '2', '50.0%', '1,837'],
  ['Legal · on approved lot', '1', '25.0%', '400'],
  ['Not verified', '1', '25.0%', '30'],
  ['Total', '4', '100%', '2,267'],
]);

console.log('mpk report: all tests passed');
