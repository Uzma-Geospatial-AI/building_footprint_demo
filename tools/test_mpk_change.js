const assert = require('assert');
const { MPK_EXG_TH: MPK_EXG_TH_TEST } = require('../mpk-change.js');
const { mpkOpenMask, mpkOtsu, mpkEsriIndices, mpkNewBuildings, mpkCompareUrl, mpkCompareParse, mpkFlag, mpkClassifyChange, mpkS2Expressions, mpkPixelOf, mpkBuildingsInMask, mpkExg, mpkMaskHectares } = require('../mpk-change.js');

// Sentinel-2 processing baseline 04.00 (from 25 Jan 2022) adds 1000 to every band
assert.strictEqual(mpkS2Expressions('2021-06-01').ndvi, '(B08-B04)/(B08+B04)');
assert.strictEqual(mpkS2Expressions('2024-06-18').ndvi, '(B08-B04)/(B08+B04-2000)');
assert.strictEqual(mpkS2Expressions('2024-06-18').ndbi, '(B11-B08)/(B11+B08-2000)');
// bright-blue cloud test (SCL misses small clouds): blue reflectance > 0.22
assert.strictEqual(mpkS2Expressions('2021-06-01').cloud, '(B02)>2200');
assert.strictEqual(mpkS2Expressions('2024-06-18').cloud, '(B02-1000)>2200');

// Per-pixel rules. Pixels: 0 forest->bare, 1 bare->grass, 2 grass->hard surface,
// 3 unchanged forest, 4 cloud in the after image (invalid), 5 existing town whose built-up
// index rose with the season (must NOT count as new built-up)
const before = { ndvi: [0.7, 0.1, 0.5, 0.7, 0.7, 0.15], ndbi: [-0.4, 0.1, -0.3, -0.4, -0.4, -0.08], valid: [1, 1, 1, 1, 1, 1] };
const after = { ndvi: [0.15, 0.6, 0.1, 0.7, 0.1, 0.12], ndbi: [0.05, -0.3, 0.05, -0.4, 0.2, 0.06], valid: [1, 1, 1, 1, 0, 1] };
assert.deepStrictEqual([...mpkClassifyChange('cleared', before, after)], [1, 0, 1, 0, 0, 0]);
assert.deepStrictEqual([...mpkClassifyChange('gain', before, after)], [0, 1, 0, 0, 0, 0]);
assert.deepStrictEqual([...mpkClassifyChange('built', before, after)], [1, 0, 1, 0, 0, 0]);

// Pixel lookup on a lng/lat grid (row 0 = north) and a Web Mercator grid
const geo = { west: 103, east: 104, north: 5, south: 4, w: 10, h: 10, proj: 'geo' };
assert.deepStrictEqual(mpkPixelOf(103.05, 4.95, geo), [0, 0]);
assert.deepStrictEqual(mpkPixelOf(103.95, 4.05, geo), [9, 9]);
assert.strictEqual(mpkPixelOf(102.9, 4.5, geo), null);
const merc = { west: 103, east: 104, north: 5, south: 4, w: 10, h: 10, proj: 'merc' };
assert.deepStrictEqual(mpkPixelOf(103.5, 4.5, merc), [5, 5]);

// Buildings whose centroid falls on (or next to) a changed pixel
const mask = new Uint8Array(100); mask[5 * 10 + 5] = 1;
const b = (id, lng, lat) => ({ properties: { id, lng, lat } });
assert.deepStrictEqual(mpkBuildingsInMask([b(1, 103.55, 4.45), b(2, 103.65, 4.45), b(3, 103.15, 4.85)], mask, geo)
  .map(f => f.properties.id), [1, 2]);
// coarse pixels (Landsat 30 m): the centroid pixel only, no neighbours
assert.deepStrictEqual(mpkBuildingsInMask([b(1, 103.55, 4.45), b(2, 103.65, 4.45)], mask, geo, 0)
  .map(f => f.properties.id), [1]);

// Excess-green index from RGB (vegetation in plain photos)
assert.ok(mpkExg(40, 120, 40) > 0.2);
assert.ok(mpkExg(150, 140, 130) < 0.02);

// Area of the changed pixels on a 10 m grid
assert.strictEqual(mpkMaskHectares(new Uint8Array([1, 1, 0, 1]), 10), 0.03);

// Boolean expression pixels arrive as raw 0/1 (not 0/255): 1 must count as set
assert.strictEqual(mpkFlag(1), true);
assert.strictEqual(mpkFlag(255), true);
assert.strictEqual(mpkFlag(0), false);

// Compare page link: the state survives the trip to the new tab
const state = { area: 'tk', before: { source: 's2', item: 'S2A_X', date: '2018-07-15', cloud: 1 },
                after: { source: 's2', item: 'S2B_Y', date: '2025-02-03', cloud: 0.5 },
                center: [103.452, 4.268], zoom: 13.5 };
const url = mpkCompareUrl(state);
assert.ok(url.startsWith('compare.html?d='));
assert.deepStrictEqual(mpkCompareParse(url.slice(url.indexOf('?'))), state);
assert.strictEqual(mpkCompareParse('?d=not-json'), null);
assert.strictEqual(mpkCompareParse(''), null);

// New buildings, judged per footprint (mean of the pixels inside it)
const g10 = { west: 103, east: 104, north: 5, south: 4, w: 10, h: 10, proj: 'geo' };
const arr = v => Array(100).fill(v);
const sq = (id, w, s, e, n) => ({ properties: { id, lng: (w + e) / 2, lat: (s + n) / 2 },
  geometry: { type: 'Polygon', coordinates: [[[w, s], [e, s], [e, n], [w, n], [w, s]]] } });
const bf = { ndvi: arr(0.1), ndbi: arr(0.1), valid: arr(1) }, af = { ndvi: arr(0.1), ndbi: arr(0.1), valid: arr(1) };
bf.ndvi[55] = 0.7; bf.ndbi[55] = -0.3; af.ndvi[55] = 0.1; af.ndbi[55] = 0.1;    // pixel col 5,row 5: green -> built
bf.ndvi[22] = 0.7; af.ndvi[22] = 0.7;                                           // pixel col 2,row 2: stays green
const fp = [sq(1, 103.5, 4.4, 103.6, 4.5),          // covers pixel (5,5): new
            sq(2, 103.2, 4.7, 103.3, 4.8),          // covers pixel (2,2): unchanged
            sq(3, 103.52, 4.42, 103.53, 4.43)];     // too small for a pixel centre: centroid pixel (5,5)
assert.deepStrictEqual(mpkNewBuildings(fp, g10, bf, af, 'spectral').map(f => f.properties.id), [1, 3]);
// Esri photos: green before (excess-green) and not green after
// (values already centred on each image's Otsu threshold: > 0 green, < 0 not green)
const eb = { ndvi: arr(-0.05), valid: arr(1) }, ea = { ndvi: arr(-0.05), valid: arr(1) };
eb.ndvi[55] = 0.1;
assert.deepStrictEqual(mpkNewBuildings(fp, g10, eb, ea, 'exg').map(f => f.properties.id), [1, 3]);

// Esri photos differ in colour between years: the Before photo is colour-matched to the After
// photo (histograms), one green threshold is used for both, and water / dark pixels are ignored
const rgba = px => Uint8ClampedArray.from(px.flatMap(([r, g, b]) => [r, g, b, 255]));
const scene = [...Array(50).fill([60, 120, 50]), ...Array(40).fill([150, 130, 110]), ...Array(10).fill([30, 60, 110])]; // forest, soil, sea
const dullScene = scene.map(([r, g, b]) => [r * 0.6 + 40, g * 0.6 + 40, b * 0.6 + 40]);          // hazy, washed-out year
let idx = mpkEsriIndices(rgba(dullScene), rgba(scene));
assert.strictEqual(idx.after.valid.slice(90).reduce((x, y) => x + y), 0, 'sea is ignored');
for (const t of ['gain', 'cleared']) {
  assert.strictEqual([...mpkClassifyChange(t, idx.before, idx.after, MPK_EXG_TH_TEST)].reduce((x, y) => x + y), 0,
    'unchanged scene, different colour balance: no ' + t);
}
// 20 soil pixels became green, 10 forest pixels were cleared
const later = scene.map((c, i) => (i >= 50 && i < 70 ? [60, 120, 50] : i < 10 ? [150, 130, 110] : c));
idx = mpkEsriIndices(rgba(dullScene), rgba(later));
assert.strictEqual([...mpkClassifyChange('gain', idx.before, idx.after, MPK_EXG_TH_TEST)].reduce((x, y) => x + y), 20);
assert.strictEqual([...mpkClassifyChange('cleared', idx.before, idx.after, MPK_EXG_TH_TEST)].reduce((x, y) => x + y), 10);

// Esri mosaics: each pixel's capture-date pair is its group. Groups are colour-matched on
// their own, and a group with the same capture in both images (-1) is not compared at all.
const two = [...scene.slice(0, 90), ...scene.slice(0, 90)];                // two halves, same land cover
const beforeTwo = [...dullScene.slice(0, 90), ...scene.slice(0, 90).map(([r, g, b]) => [r * 1.3, g * 0.8, b])];  // two different source photos
const groups = Int32Array.from([...Array(90).fill(0), ...Array(90).fill(1)]);
idx = mpkEsriIndices(rgba(beforeTwo), rgba(two), groups);
for (const t of ['gain', 'cleared']) {
  assert.strictEqual([...mpkClassifyChange(t, idx.before, idx.after, MPK_EXG_TH_TEST)].reduce((x, y) => x + y), 0,
    'two differently coloured source photos, no real change: no ' + t);
}
const sameCapture = Int32Array.from([...Array(90).fill(0), ...Array(90).fill(-1)]);
idx = mpkEsriIndices(rgba(beforeTwo), rgba(two), sameCapture);
assert.strictEqual(idx.after.valid.slice(90).reduce((x, y) => x + y), 0, 'same capture in both: not compared');

// Clouds in an Esri photo (bright, colourless) are dropped, with a margin around them, so
// "cloud in Before, forest in After" is not reported as vegetation gain
const W = 20, H = 5;
const forestImg = Array(W * H).fill([60, 120, 50]);
const cloudyImg = forestImg.map((c, i) => (i % W < 6 ? [235, 235, 238] : c));     // columns 0-5 cloud
idx = mpkEsriIndices(rgba(cloudyImg), rgba(forestImg), null, { width: W, cloudMargin: 2 });
const validCols = new Set();
idx.after.valid.forEach((v, i) => { if (v) validCols.add(i % W); });
assert.ok(!validCols.has(5) && !validCols.has(7) && validCols.has(8), 'cloud columns 0-5 + 2 px margin dropped');
assert.strictEqual([...mpkClassifyChange('gain', idx.before, idx.after, MPK_EXG_TH_TEST)].reduce((x, y) => x + y), 0);

// Speckle removal: a 1-pixel dot disappears, a 5x5 patch survives intact
const m9 = new Uint8Array(100);
m9[1 * 10 + 1] = 1;                                                // lone pixel
for (let y = 4; y < 9; y++) for (let x = 4; x < 9; x++) m9[y * 10 + x] = 1;   // 5x5 patch
const opened = mpkOpenMask(m9, 10, 1);
assert.strictEqual(opened[11], 0);
assert.strictEqual(opened.reduce((x, y) => x + y), 25);

console.log('mpk change: all tests passed');
