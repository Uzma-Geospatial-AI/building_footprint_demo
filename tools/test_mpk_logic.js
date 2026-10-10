const assert = require('assert');
const { mpkJenis, mpkSuspectFilter, mpkStats, mpkCSV, mpkMonthLabel, mpkWaybackTileUrl,
  mpkDayLabel, mpkSentinelTileUrl, mpkSentinelYears, mpkDefaultMonth, mpkImagerySource,
  mpkYearBest, mpkEsriImages, mpkSearchLocal, mpkParseCoords, mpkZoneAt, mpkStatus,
  mpkInScope, mpkSizeClass, MPK_SIZE_CLASSES, mpkBreakdown, mpkCSVAll } = require('../mpk.js');

const f = (id, kawasan, kategori, extra, area_m2) => ({
  properties: { id, kawasan, kategori, area_m2, confidence: 0.8, plus_code: 'X' + id, lng: 103.4, lat: 4.2, ...extra },
});
const feats = [
  f(1, 'tk', 'lulus', { dalam: true, lot: '100' }, 100),
  f(2, 'tk', 'mockup', { dalam: true, lot: '52497', upi: '11030800052497' }, 50),   // API is_mockup building
  f(3, 'tk', 'luar', { jarak_m: 200 }, 200),       // Teluk Kalong rules no longer flag anything
  f(4, 'tk', 'tiada_lot', { dalam: true }, 30),
  f(5, 'bpb', 'koridor', { jarak_jalan_m: 8.5 }, 70),
  f(6, 'bpb', 'koridor', { jarak_jalan_m: 12 }, 90),
  f(7, 'bbc', 'koridor', { jarak_jalan_m: null }, 40),
  f(8, 'tk', 'mockup', {}, 20),
];
const s = { rizab: 10 };
const rates = { fee: 2, cukai: 6 };

// jenis (suspect type) per building: Teluk Kalong = the API mockup list, corridors = road reserve
assert.deepStrictEqual(feats.map(x => mpkJenis(x.properties, s)),
  [null, 'mockup', null, null, 'rizab', null, null, 'mockup']);
assert.strictEqual(mpkJenis(feats[5].properties, { rizab: 12 }), 'rizab');

// stats, all areas
const all = mpkStats(feats, s, rates, 'all');
assert.strictEqual(all.total, 8);
assert.strictEqual(all.lulus, 1);
assert.strictEqual(all.count, 3);
assert.strictEqual(all.area, 140);
assert.deepStrictEqual(all.byJenis, { mockup: 2, rizab: 1 });
assert.strictEqual(all.fee, 280);
assert.strictEqual(all.cukai, 840);
assert.deepStrictEqual(all.suspects.map(x => x.properties.id), [5, 2, 8]);   // largest first

// stats, one area
const bpb = mpkStats(feats, s, rates, 'bpb');
assert.strictEqual(bpb.total, 2);
assert.strictEqual(bpb.count, 1);
assert.deepStrictEqual(bpb.byJenis, { mockup: 0, rizab: 1 });

// Three clear statuses: suspected (red), legal = on an MPK-approved lot (green), not verified
assert.deepStrictEqual(feats.map(x => mpkStatus(x.properties, s)),
  ['legal', 'suspected', 'unverified', 'unverified', 'suspected', 'unverified', 'unverified', 'suspected']);
assert.deepStrictEqual(all.byStatus, { suspected: 3, legal: 1, unverified: 4 });
assert.deepStrictEqual(bpb.byStatus, { suspected: 1, legal: 0, unverified: 1 });

// map filter mirrors mpkJenis
assert.deepStrictEqual(mpkSuspectFilter(s), ['any',
  ['==', ['get', 'kategori'], 'mockup'],
  ['all', ['==', ['get', 'kategori'], 'koridor'],
    ['<=', ['to-number', ['coalesce', ['get', 'jarak_jalan_m'], 1e9]], 10]],
]);

// CSV (English header and codes for the people who receive the export)
const csv = mpkCSV(all.suspects, rates, s).trim().split('\n');
assert.strictEqual(csv.length, 4);
assert.strictEqual(csv[0], 'id,area,type,plus_code,lng,lat,distance_m,area_m2,confidence,lot,upi,est_processing_fee_rm,est_annual_assessment_tax_rm');
assert.strictEqual(csv[1], '5,bandar_putra_berenjut,road_reserve,X5,103.4,4.2,8.5,70,0.8,,,140.00,420.00');
assert.strictEqual(csv[2], '2,teluk_kalong,suspected_list,X2,103.4,4.2,,50,0.8,52497,11030800052497,100.00,300.00');

// Wayback helpers
assert.strictEqual(mpkMonthLabel('2024-08-30'), 'Aug 2024');
assert.strictEqual(mpkMonthLabel('2026-07'), 'Jul 2026');
assert.strictEqual(mpkWaybackTileUrl(10842),
  'https://wayback.maptiles.arcgis.com/arcgis/rest/services/World_Imagery/WMTS/1.0.0/default028mm/MapServer/tile/10842/{z}/{y}/{x}');
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

// One tile source per satellite (Esri, Sentinel-2, Landsat)
const esri = mpkImagerySource({ source: 'esri', release: 10 });
assert.strictEqual(esri.kind, 'esri'); assert.strictEqual(esri.maxzoom, 19);
assert.strictEqual(esri.tiles[0], mpkWaybackTileUrl(10));
const s2 = mpkImagerySource({ source: 's2', item: 'S2A_X' });
assert.strictEqual(s2.kind, 's2'); assert.strictEqual(s2.tiles[0], mpkSentinelTileUrl('S2A_X'));
const ls = mpkImagerySource({ source: 'landsat', item: 'LT05_X' });
assert.strictEqual(ls.kind, 'landsat');
assert.ok(ls.tiles[0].includes('collection=landsat-c2-l2&item=LT05_X&assets=red&assets=green&assets=blue'));
// No zoom cap for any satellite: like Esri, Sentinel-2 and Landsat can be zoomed to z20
assert.strictEqual(esri.maxView, null);
assert.strictEqual(s2.maxView, null);
assert.strictEqual(ls.maxView, null);
assert.strictEqual(mpkImagerySource(null), null);
assert.strictEqual(mpkImagerySource({ year: 2001, source: null }), null);

// By year within one satellite: the clearest month of each year, oldest year first;
// striped Landsat 7 (after May 2003) only wins when 20 points clearer
const yrs = {
  '2012': [null, { item: 'L7a', date: '2012-02-01', cloud: 5, platform: 'landsat-7' }, null],
  '2008': [{ item: 'A', date: '2008-01-03', cloud: 30 }, { item: 'B', date: '2008-02-03', cloud: 4 }, null],
  '2014': [{ item: 'L7b', date: '2014-01-01', cloud: 0, platform: 'landsat-7' },
           { item: 'L8', date: '2014-03-01', cloud: 10, platform: 'landsat-8' }],
  '2015': [null, null],
};
assert.deepStrictEqual(mpkYearBest(yrs, 'landsat').map(e => [e.year, e.item, e.source]),
  [['2008', 'B', 'landsat'], ['2012', 'L7a', 'landsat'], ['2014', 'L8', 'landsat'], ['2015', undefined, null]]);

// Esri images over one area: one per distinct capture date, oldest first
const hist = [
  { release: 10, capture: { tk: '2007-03-16' } }, { release: 15045, capture: { tk: '2019-05-03' } },
  { release: 15423, capture: { tk: '2020-08-27' } }, { release: 13851, capture: { tk: '2019-05-03' } },
];
assert.deepStrictEqual(mpkEsriImages(hist, 'tk').map(e => [e.release, e.date, e.source]),
  [[10, '2007-03-16', 'esri'], [15045, '2019-05-03', 'esri'], [15423, '2020-08-27', 'esri']]);

// Search: study areas by name, cadastral lots by lot no. / UPI prefix, buildings by Plus Code
const areas = { tk: { name: 'Teluk Kalong Industrial Area', short: 'Teluk Kalong' },
                bbc: { name: 'Binjai – Bandar Chukai Corridor', short: 'Binjai – Chukai' } };
const lots = [{ properties: { lot: '1328', upi: '1103120001328' } }, { properties: { lot: '13280', upi: '1103120013280' } },
              { properties: { lot: '3020', upi: '1103120003020' } }];
const blds = [{ properties: { id: 7, plus_code: '6PP56FR4+V8MV' } }, { properties: { id: 8, plus_code: '6PP57F33+49XJ' } }];
const kinds = r => r.map(x => x.kind + ':' + x.label);
assert.deepStrictEqual(kinds(mpkSearchLocal('kalong', areas, lots, blds)), ['area:Teluk Kalong']);
assert.deepStrictEqual(kinds(mpkSearchLocal('chukai', areas, lots, blds)), ['area:Binjai – Chukai']);
assert.deepStrictEqual(kinds(mpkSearchLocal('1328', areas, lots, blds)), ['lot:Lot 1328', 'lot:Lot 13280']);
assert.deepStrictEqual(kinds(mpkSearchLocal('1103120003020', areas, lots, blds)), ['lot:Lot 3020']);
assert.deepStrictEqual(kinds(mpkSearchLocal('f33+49', areas, lots, blds)), ['building:6PP57F33+49XJ']);
assert.deepStrictEqual(mpkSearchLocal(' ', areas, lots, blds), []);

// Coordinates typed in the search box -> { lat, lng } (null when not a coordinate)
const near = (r, lat, lng) => r && Math.abs(r.lat - lat) < 1e-4 && Math.abs(r.lng - lng) < 1e-4;
assert.ok(near(mpkParseCoords('4.2681, 103.4520'), 4.2681, 103.452));
assert.ok(near(mpkParseCoords('4.2681 103.4520'), 4.2681, 103.452));
assert.ok(near(mpkParseCoords('4.2681;103.4520'), 4.2681, 103.452));
assert.ok(near(mpkParseCoords('103.4520, 4.2681'), 4.2681, 103.452));          // lng, lat order
assert.ok(near(mpkParseCoords('-4.5, 103.2'), -4.5, 103.2));
assert.ok(near(mpkParseCoords(`4°16'05"N 103°27'07"E`), 4 + 16 / 60 + 5 / 3600, 103 + 27 / 60 + 7 / 3600));
assert.ok(near(mpkParseCoords("4°16'05''N, 103°27'07''E"), 4 + 16 / 60 + 5 / 3600, 103 + 27 / 60 + 7 / 3600));
assert.ok(near(mpkParseCoords('4 16 05 N 103 27 07 E'), 4 + 16 / 60 + 5 / 3600, 103 + 27 / 60 + 7 / 3600));
assert.ok(near(mpkParseCoords(`N4°16.08' E103°27.12'`), 4 + 16.08 / 60, 103 + 27.12 / 60));
assert.ok(near(mpkParseCoords(`103°27'07"E 4°16'05"N`), 4 + 16 / 60 + 5 / 3600, 103 + 27 / 60 + 7 / 3600));
assert.ok(near(mpkParseCoords(`4°16'05"S 103°27'07"W`), -(4 + 16 / 60 + 5 / 3600), -(103 + 27 / 60 + 7 / 3600)));
assert.strictEqual(mpkParseCoords('1328'), null);                     // a lot number
assert.strictEqual(mpkParseCoords('Jalan Kemaman'), null);
assert.strictEqual(mpkParseCoords('95, 200'), null);                  // out of range
assert.strictEqual(mpkParseCoords(`5.80528; 5'56'`), null);           // incomplete

// Land-use zone under a point: the smallest zone that contains it (a park inside a housing
// estate wins); the district outline is not a zone
const sqz = (zone, w, s2, e, n, extra = {}) => ({ properties: { zone, ...extra },
  geometry: { type: 'Polygon', coordinates: [[[w, s2], [e, s2], [e, n], [w, n], [w, s2]]] } });
const zones = [sqz('district', 0, 0, 10, 10), sqz('residential', 1, 1, 5, 5, { name: 'Taman A' }),
               sqz('recreation', 2, 2, 3, 3), sqz('industrial', 6, 6, 9, 9)];
assert.strictEqual(mpkZoneAt(4, 4, zones).properties.name, 'Taman A');
assert.strictEqual(mpkZoneAt(2.5, 2.5, zones).properties.zone, 'recreation');
assert.strictEqual(mpkZoneAt(7, 7, zones).properties.zone, 'industrial');
assert.strictEqual(mpkZoneAt(5.5, 9.5, zones), null);
const multi = { properties: { zone: 'commercial' }, geometry: { type: 'MultiPolygon',
  coordinates: [[[[20, 20], [21, 20], [21, 21], [20, 21], [20, 20]]], [[[30, 30], [31, 30], [31, 31], [30, 31], [30, 30]]]] } };
assert.strictEqual(mpkZoneAt(30.5, 30.5, [multi]).properties.zone, 'commercial');

// Scope: Teluk Kalong buildings inside the planning boundary, and corridor buildings
const scope = [f(1, 'tk', 'lulus', { dalam: true }, 100), f(2, 'tk', 'lulus', {}, 100), f(3, 'tk', 'mockup', { dalam: true }, 50),
               f(4, 'tk', 'mockup', {}, 50), f(5, 'tk', 'luar', { jarak_m: 30 }, 10), f(6, 'bbc', 'koridor', { jarak_jalan_m: 4 }, 600)];
assert.deepStrictEqual(scope.map(x => mpkInScope(x.properties)), [true, false, true, false, false, true]);

// Size classes (m²)
assert.deepStrictEqual([50, 100, 499, 500, 999, 1000, 4999, 5000, 20000].map(mpkSizeClass), [0, 1, 1, 2, 2, 3, 3, 4, 4]);
assert.strictEqual(MPK_SIZE_CLASSES.length, 5);

// Breakdown per area and status, with m², share and size classes
const inScope = scope.filter(x => mpkInScope(x.properties));
const bd = mpkBreakdown(inScope, s);
assert.strictEqual(bd.all.total, 3);
assert.strictEqual(bd.all.m2, 750);
assert.deepStrictEqual(bd.all.byStatus.legal, { n: 1, m2: 100, pct: 100 / 3 });
assert.deepStrictEqual(bd.all.byStatus.suspected, { n: 2, m2: 650, pct: 200 / 3 });
assert.deepStrictEqual(bd.all.byStatus.unverified, { n: 0, m2: 0, pct: 0 });
assert.strictEqual(bd.tk.total, 2);
assert.strictEqual(bd.bbc.byStatus.suspected.n, 1);
assert.strictEqual(bd.bpb.total, 0);
assert.deepStrictEqual(bd.all.sizes.map(c => c.n), [1, 1, 1, 0, 0]);      // 50, 100, 600 m²
assert.deepStrictEqual(bd.all.sizes[2].byStatus, { suspected: 1, legal: 0, unverified: 0 });

// CSV of every building in scope with its status and size
const all2 = mpkCSVAll(inScope, s).trim().split('\n');
assert.strictEqual(all2[0], 'id,area,status,plus_code,lng,lat,area_m2,lot,upi');
assert.strictEqual(all2.length, 4);
assert.strictEqual(all2[1], '6,binjai_bandar_chukai,suspected_illegal,X6,103.4,4.2,600,,');   // largest first

console.log('mpk logic: all tests passed');
