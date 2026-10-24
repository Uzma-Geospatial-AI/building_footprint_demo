const assert = require('assert');
const fs = require('fs');
const path = require('path');

// strata3d/ as written by tools/build_strata3d.mjs: every file the catalog names exists, every
// building is a closed polygon in Perdana/Mutiara Damansara with the properties Strata reads.
const DIR = path.join(__dirname, '..', 'strata3d');
const cat = JSON.parse(fs.readFileSync(path.join(DIR, 'catalog.json'), 'utf8'));
const fc = JSON.parse(fs.readFileSync(path.join(DIR, 'buildings.geojson'), 'utf8'));
const isGlb = f => fs.readFileSync(path.join(DIR, f)).readUInt32LE(0) === 0x46546c67;

assert.strictEqual(cat.areas.length, 31, '29 modeled areas plus two regional overviews');
assert.deepStrictEqual(cat.areas.filter(a => a.overview).map(a => a.id).sort(), ['damansara', 'mutiara']);
for (const a of cat.areas) {
  assert.ok(isGlb(a.glb), a.glb);
  const [[w, s], [e, n]] = a.bounds;
  assert.ok(w < e && s < n, a.id + ' bounds');
  assert.ok(a.center[0] > 101.59 && a.center[0] < 101.63 && a.center[1] > 3.15 && a.center[1] < 3.19, a.id + ' centre in Damansara Perdana');
  assert.ok(a.includedAreaIds.length > 0 && a.includedAreaIds.every(id => cat.areas.some(other => other.id === id && !other.overview)), a.id + ' explicit area membership');
  assert.strictEqual(a.region, a.id.startsWith('mutiara') ? 'Mutiara Damansara' : 'Damansara Perdana');
}
assert.ok(isGlb(cat.uzma.glb), 'UZMA tower model');

const ids = new Set(), areaIds = new Set(cat.areas.map(a => a.id));
for (const f of fc.features) {
  const p = f.properties, ring = f.geometry.coordinates[0];
  assert.ok(p.id.startsWith('dp-') && !ids.has(p.id), 'unique dp- id ' + p.id);
  ids.add(p.id);
  assert.ok(areaIds.has(p.dp_area), p.id + ' area');
  assert.ok(ring.length >= 4 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1], p.id + ' closed ring');
  for (const hole of f.geometry.coordinates.slice(1)) assert.ok(hole.length >= 4 && hole[0][0] === hole.at(-1)[0] && hole[0][1] === hole.at(-1)[1], p.id + ' closed courtyard');
  assert.ok(p.tingkat_est >= 1 && p.area_m2 > 0 && isFinite(p.lng) && isFinite(p.lat), p.id + ' strata fields');
}
assert.ok(ids.has('dp-uzma-tower'), 'UZMA Tower building');
assert.strictEqual(fc.features.length, 1540, '906 Mutiara structures including one historical reference, plus 634 existing structures');
const historical=fc.features.find(f=>f.properties.src_id==='way/107998493');
assert.ok(historical.properties.historical_reference && historical.properties.current_use_verified===false);
assert.match(historical.properties.nama,/historical reference/);
const regionalBytes=fs.readFileSync(path.join(DIR,cat.areas.find(a=>a.id==='mutiara').glb));
const regionalJson=JSON.parse(regionalBytes.subarray(20,20+regionalBytes.readUInt32LE(12)).toString('utf8'));
const bridges=regionalJson.nodes.filter(n=>n.extras && n.extras.pedestrianLink);
assert.strictEqual(bridges.length,15,'The regional map GLB contains all pedestrian bridges');
assert.strictEqual(new Set(bridges.map(n=>n.extras.routeId)).size,15,'No duplicate links in the overview');
assert.strictEqual(bridges.reduce((n,b)=>n+b.extras.stairRoutes.length,0),4,'Mapped station access stairs survive deployment export');
assert.ok(bridges.every(b=>!b.extras.footprint),'Bridge infrastructure cannot create additional strata parcels');
const regionIds = new Set();
for (const a of cat.areas.filter(area => area.overview)) {
  const selected = fc.features.filter(f => a.includedAreaIds.includes(f.properties.dp_area));
  assert.strictEqual(selected.length, a.buildings + Number(a.uzma), a.id + ' overview count includes its own region only');
  for (const f of selected) { assert.ok(!regionIds.has(f.properties.id), 'regional overviews are disjoint'); regionIds.add(f.properties.id); }
}
assert.strictEqual(regionIds.size, fc.features.length, 'every source building belongs to one regional overview');
const curve = fc.features.find(f => f.properties.src_id === 'relation/13518521');
assert.strictEqual(curve.geometry.coordinates.length, 3, 'The Curve retains both courtyard holes in the map footprint');
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
