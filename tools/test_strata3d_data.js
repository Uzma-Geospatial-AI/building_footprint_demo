const assert = require('assert');
const fs = require('fs');
const path = require('path');

// strata3d/ as written by tools/build_strata3d.mjs: every file the catalog names exists, every
// building is a closed polygon in Damansara Perdana with the properties Strata reads.
const DIR = path.join(__dirname, '..', 'strata3d');
const cat = JSON.parse(fs.readFileSync(path.join(DIR, 'catalog.json'), 'utf8'));
const fc = JSON.parse(fs.readFileSync(path.join(DIR, 'buildings.geojson'), 'utf8'));
const isGlb = f => fs.readFileSync(path.join(DIR, f)).readUInt32LE(0) === 0x46546c67;

assert.ok(cat.areas.length >= 19, 'areas');
assert.strictEqual(cat.areas.filter(a => a.overview).length, 1, 'one overview area');
for (const a of cat.areas) {
  assert.ok(isGlb(a.glb), a.glb);
  const [[w, s], [e, n]] = a.bounds;
  assert.ok(w < e && s < n, a.id + ' bounds');
  assert.ok(a.center[0] > 101.59 && a.center[0] < 101.63 && a.center[1] > 3.15 && a.center[1] < 3.19, a.id + ' centre in Damansara Perdana');
}
assert.ok(isGlb(cat.uzma.glb), 'UZMA tower model');

const ids = new Set(), areaIds = new Set(cat.areas.map(a => a.id));
for (const f of fc.features) {
  const p = f.properties, ring = f.geometry.coordinates[0];
  assert.ok(p.id.startsWith('dp-') && !ids.has(p.id), 'unique dp- id ' + p.id);
  ids.add(p.id);
  assert.ok(areaIds.has(p.dp_area), p.id + ' area');
  assert.ok(ring.length >= 4 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1], p.id + ' closed ring');
  assert.ok(p.tingkat_est >= 1 && p.area_m2 > 0 && isFinite(p.lng) && isFinite(p.lat), p.id + ' strata fields');
}
assert.ok(ids.has('dp-uzma-tower'), 'UZMA Tower building');
assert.strictEqual(fc.features.find(f => f.properties.id === 'dp-uzma-tower').properties.tingkat_est, 12);

const planIds = new Set(cat.plans.map(p => p.id));
for (const p of cat.plans) {
  assert.ok(isGlb(p.glb), p.glb);
  assert.ok(areaIds.has(p.area), p.id + ' area');
  for (const l of p.levels) for (const k of ['svg', 'csv']) if (l[k]) assert.ok(fs.existsSync(path.join(DIR, l[k])), l[k]);
}
assert.strictEqual(cat.plans.find(p => p.id === 'uzma').levels.length, 19, 'UZMA 19 levels');
for (const f of fc.features) if (f.properties.plan) assert.ok(planIds.has(f.properties.plan), f.properties.id + ' plan');
console.log(`strata3d data OK: ${cat.areas.length} areas, ${fc.features.length} buildings, ${cat.plans.length} plans`);
