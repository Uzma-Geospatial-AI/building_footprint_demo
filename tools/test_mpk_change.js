const assert = require('assert');
const { mpkFlag, mpkClassifyChange, mpkS2Expressions, mpkPixelOf, mpkBuildingsInMask, mpkExg, mpkMaskHectares } = require('../mpk-change.js');

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

console.log('mpk change: all tests passed');
