const assert = require('assert');
const fs = require('fs');
const path = require('path');

// strata3d/ as written by tools/build_strata3d.mjs: every file the catalog names exists, every
// building is a closed polygon in Perdana/Mutiara Damansara with the properties Strata reads.
const DIR = path.join(__dirname, '..', 'strata3d');
const cat = JSON.parse(fs.readFileSync(path.join(DIR, 'catalog.json'), 'utf8'));
const fc = JSON.parse(fs.readFileSync(path.join(DIR, 'buildings.geojson'), 'utf8'));
const isGlb = f => fs.readFileSync(path.join(DIR, f)).readUInt32LE(0) === 0x46546c67;

assert.strictEqual(cat.areas.length, 34, '32 modeled areas including TM Bukit Lanjan plus two regional overviews');
assert.deepStrictEqual(cat.areas.filter(a => a.overview).map(a => a.id).sort(), ['damansara', 'mutiara']);
for (const a of cat.areas) {
  assert.ok(isGlb(a.glb), a.glb);
  const [[w, s], [e, n]] = a.bounds;
  assert.ok(w < e && s < n, a.id + ' bounds');
  assert.ok(a.center[0] > 101.59 && a.center[0] < 101.63 && a.center[1] > 3.14 && a.center[1] < 3.19, a.id + ' centre in Damansara Perdana');
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
assert.strictEqual(fc.features.length, 1578, 'Eight restored masses and one merged row fragment, without duplicated structures');
for(const id of ['reference/dvine-podium','reference/dvine-tower','way/1158914503','reference/dvervain-tower-a','reference/dvervain-tower-b','way/1242229816','way/745554991','reference/base3-retail'])assert.ok(fc.features.some(f=>f.properties.src_id===id),id+' restored in Strata');
assert.ok(!fc.features.some(f=>f.properties.src_id==='microsoft/2026-08-13/132232022/691049'),'Joined row fragment not exported separately');
const reviewedPlaces=JSON.parse(fs.readFileSync(path.join(DIR,'reviewed-places.json'),'utf8'));
for(const p of reviewedPlaces){assert.ok(fc.features.some(f=>f.properties.src_id===p.host),'Reviewed place has actual model host: '+p.n);assert.ok(JSON.parse(fs.readFileSync(path.join(DIR,'places.json'),'utf8')).some(q=>q.n===p.n&&q.host===p.host),'Reviewed place persists in unified search');}
const oneUtama=cat.areas.find(a=>a.id==='mutiara-one-utama');
assert.ok(oneUtama&&oneUtama.name.includes('1 Utama'));
assert.strictEqual(fc.features.filter(f=>f.properties.dp_area==='mutiara-one-utama').length,8,'Eight distinct mall volumes, terrace and connection');
for(const id of ['way/776319384','way/1213508066','way/38952992','way/559336198','way/1220994486','reference/reflection-tower','reference/reflection-podium','reference/pju726-courtyard-house','reference/pju726-small-house','reference/pju726-courtyard'])assert.ok(fc.features.some(f=>f.properties.src_id===id),id+' restored to live Strata footprints');
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

// the search index of named places (tools/build_strata3d_places.mjs)
const places = JSON.parse(fs.readFileSync(path.join(DIR, 'places.json'), 'utf8'));
assert.ok(places.length > 1000, 'places index');
for (const p of places) assert.ok(p.n && p.k && ['dp', 'mpk'].includes(p.r) && isFinite(p.c[0]) && isFinite(p.c[1]), 'place ' + p.n);
for (const n of ['Surian', 'Mutiara Damansara', 'Bandar Utama']) assert.ok(places.some(p => p.n === n && /^MRT station/.test(p.k)), n + ' MRT station');
assert.ok(!places.some(p => /^(Rail|MRT|LRT) station/.test(p.k) && /\bbus\b|\bbas\b/i.test(p.n)), 'bus hubs are not rail stations');
console.log(`places OK: ${places.length}`);

for(const id of ['way/1125645848','way/1125645849','way/1125645853','way/1125645854','way/1125645855','node/10293480242','reference/foresthill-podium','reference/foresthill-tower-a','reference/foresthill-tower-b'])assert.ok(fc.features.some(f=>f.properties.src_id===id),id+' visible in Strata');
assert.ok(cat.areas.find(a=>a.id==='damansara').includedAreaIds.includes('tm-bukit-lanjan'));
assert.equal(fc.features.find(f=>f.properties.src_id==='reference/foresthill-tower-a').properties.tingkat_est,38);
assert.equal(fc.features.find(f=>f.properties.src_id==='reference/foresthill-tower-b').properties.tingkat_est,35);
