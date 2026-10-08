const assert = require('assert');
const { mpkJenis, mpkSuspectFilter, mpkStats, mpkCSV, mpkMonthLabel, mpkWaybackTileUrl, mpkWaybackHistory,
  mpkDayLabel, mpkSentinelTileUrl, mpkSentinelYears, mpkDefaultMonth } = require('../mpk.js');

const f = (id, kawasan, kategori, extra, area_m2) => ({
  properties: { id, kawasan, kategori, area_m2, confidence: 0.8, plus_code: 'X' + id, lng: 103.4, lat: 4.2, ...extra },
});
const feats = [
  f(1, 'tk', 'lulus', { dalam: true, lot: '100' }, 100),
  f(2, 'tk', 'tiada_lot', { dalam: true, lot: '52497', upi: '11030800052497' }, 50),
  f(3, 'tk', 'luar', { jarak_m: 600 }, 200),
  f(4, 'tk', 'luar', { jarak_m: 500 }, 30),
  f(5, 'bpb', 'koridor', { jarak_jalan_m: 8.5 }, 70),
  f(6, 'bpb', 'koridor', { jarak_jalan_m: 12 }, 90),
  f(7, 'bbc', 'koridor', { jarak_jalan_m: null }, 40),
  f(8, 'tk', 'lulus', { dalam: true }, 20),        // inside, on approved lot, but no cadastral lot
  f(9, 'tk', 'tiada_lot', { dalam: true }, 10),    // inside, no lot of either kind
  f(10, 'tk', 'lulus', {}, 15),                    // outside the boundary: no cadastral coverage
];
const s = { buffer: 500, rizab: 10 };
const rates = { fee: 2, cukai: 6 };

// jenis (suspect type) per building
assert.deepStrictEqual(feats.map(x => mpkJenis(x.properties, s)),
  [null, 'tiada_lot', null, 'luar_sempadan', 'rizab', null, null, 'tiada_kadaster', 'tiada_kadaster', null]);
assert.strictEqual(mpkJenis(feats[5].properties, { buffer: 500, rizab: 12 }), 'rizab');

// stats, all areas
const all = mpkStats(feats, s, rates, 'all');
assert.strictEqual(all.total, 10);
assert.strictEqual(all.lulus, 3);
assert.strictEqual(all.count, 5);
assert.strictEqual(all.area, 180);
assert.deepStrictEqual(all.byJenis, { tiada_kadaster: 2, tiada_lot: 1, luar_sempadan: 1, rizab: 1 });
assert.strictEqual(all.fee, 360);
assert.strictEqual(all.cukai, 1080);
assert.deepStrictEqual(all.suspects.map(x => x.properties.id), [5, 2, 4, 8, 9]);   // largest first

// stats, one area
const bpb = mpkStats(feats, s, rates, 'bpb');
assert.strictEqual(bpb.total, 2);
assert.strictEqual(bpb.count, 1);
assert.deepStrictEqual(bpb.byJenis, { tiada_kadaster: 0, tiada_lot: 0, luar_sempadan: 0, rizab: 1 });

// map filter mirrors mpkJenis
assert.deepStrictEqual(mpkSuspectFilter(s), ['any',
  ['all', ['==', ['get', 'dalam'], true], ['!', ['has', 'lot']]],
  ['==', ['get', 'kategori'], 'tiada_lot'],
  ['all', ['==', ['get', 'kategori'], 'luar'], ['<=', ['get', 'jarak_m'], 500]],
  ['all', ['==', ['get', 'kategori'], 'koridor'],
    ['<=', ['to-number', ['coalesce', ['get', 'jarak_jalan_m'], 1e9]], 10]],
]);

// CSV (English header and codes for the people who receive the export)
const csv = mpkCSV(all.suspects, rates, s).trim().split('\n');
assert.strictEqual(csv.length, 6);
assert.strictEqual(csv[0], 'id,area,type,plus_code,lng,lat,distance_m,area_m2,confidence,lot,upi,est_processing_fee_rm,est_annual_assessment_tax_rm');
assert.strictEqual(csv[1], '5,bandar_putra_berenjut,road_reserve,X5,103.4,4.2,8.5,70,0.8,,,140.00,420.00');
assert.strictEqual(csv[2], '2,teluk_kalong,no_approved_lot,X2,103.4,4.2,,50,0.8,52497,11030800052497,100.00,300.00');
assert.strictEqual(csv[3], '4,teluk_kalong,outside_boundary,X4,103.4,4.2,500,30,0.8,,,60.00,180.00');
assert.strictEqual(csv[4], '8,teluk_kalong,no_cadastral_lot,X8,103.4,4.2,,20,0.8,,,40.00,120.00');

// Wayback helpers
assert.strictEqual(mpkMonthLabel('2024-08-30'), 'Aug 2024');
assert.strictEqual(mpkMonthLabel('2026-07'), 'Jul 2026');
assert.strictEqual(mpkWaybackTileUrl(10842),
  'https://wayback.maptiles.arcgis.com/arcgis/rest/services/World_Imagery/WMTS/1.0.0/default028mm/MapServer/tile/10842/{z}/{y}/{x}');
// History per area: one entry per distinct capture date, oldest first, first release that showed it
const hist = [
  { release: 10, date: '2014-02-20', capture: { tk: '2007-03-16', bpb: '2011-01-19' } },
  { release: 15045, date: '2020-04-29', capture: { tk: '2019-05-03', bpb: '2019-04-06' } },
  { release: 15423, date: '2021-05-19', capture: { tk: '2020-08-27', bpb: '2019-04-06' } },
  { release: 13851, date: '2022-07-21', capture: { tk: '2019-05-03', bpb: '2019-04-06' } },   // regression to 2019
];
assert.deepStrictEqual(mpkWaybackHistory(hist, 'tk').map(e => e.release), [10, 15045, 15423]);
assert.deepStrictEqual(mpkWaybackHistory(hist, 'bpb').map(e => e.release), [10, 15045]);

// Sentinel-2 monthly helpers
assert.strictEqual(mpkDayLabel('2024-10-21'), '21 Oct 2024');
assert.strictEqual(mpkSentinelTileUrl('S2A_X'),
  'https://planetarycomputer.microsoft.com/api/data/v1/item/tiles/WebMercatorQuad/{z}/{x}/{y}@1x'
  + '?collection=sentinel-2-l2a&item=S2A_X&assets=visual&asset_bidx=visual%7C1%2C2%2C3&nodata=0&format=png');
assert.deepStrictEqual(mpkSentinelYears({ '2016': [], '2024': [], '2019': [] }), ['2024', '2019', '2016']);   // newest first
assert.deepStrictEqual(mpkSentinelYears(undefined), []);

// Default month: latest clear month (<= 20% cloud), else the least cloudy, else January
const m = c => (c == null ? null : { cloud: c });
assert.strictEqual(mpkDefaultMonth([m(5), m(30), m(12), m(100), null]), 2);
assert.strictEqual(mpkDefaultMonth([m(60), m(40), m(90), null]), 1);
assert.strictEqual(mpkDefaultMonth([null, null]), 0);

console.log('mpk logic: all tests passed');
