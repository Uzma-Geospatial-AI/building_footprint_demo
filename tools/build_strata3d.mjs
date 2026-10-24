// Strata 3D: brings the UZMA Spatial Studio models (Perdana and Mutiara Damansara) into Strata mode.
//   node tools/build_strata3d.mjs [path to UzmaTower3D_Model]
// Copies every area model and interior plan into strata3d/, then reads the metadata the studio's
// exporter writes into each GLB (glTF node extras) to make:
//   strata3d/catalog.json       the areas (model file, centre, bounds, building count) and interior plans
//   strata3d/buildings.geojson  one footprint per modelled building, so Strata can start a scheme on it
// Nothing is re-modelled: the GLBs are copied byte for byte and georeferenced by the centre in their extras
// (metres, +X east, +Y up, +Z south, origin at the area centre).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.resolve(process.argv[2] || path.join(ROOT, '..', '..', 'UzmaTower3D_Model'));
const PUB = path.join(SRC, 'public');
const OUT = path.join(ROOT, 'strata3d');
if (!fs.existsSync(PUB)) { console.error('Not found: ' + PUB); process.exit(1); }

// glTF JSON chunk of a .glb
function glbJson(file) {
  const b = fs.readFileSync(file);
  if (b.readUInt32LE(0) !== 0x46546c67) throw new Error('Not a GLB: ' + file);
  return JSON.parse(b.subarray(20, 20 + b.readUInt32LE(12)).toString('utf8'));
}
// Web Mercator, as maplibregl.MercatorCoordinate
const R = 6371008.8;
const mercX = lng => (180 + lng) / 360;
const mercY = lat => (180 - (180 / Math.PI) * Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360))) / 360;
const meterUnits = lat => 1 / (2 * Math.PI * R * Math.cos(lat * Math.PI / 180));
const lngOf = x => x * 360 - 180;
const latOf = y => 360 / Math.PI * Math.atan(Math.exp((180 - y * 360) * Math.PI / 180)) - 90;
const r7 = v => Math.round(v * 1e7) / 1e7;
const r2 = v => Math.round(v * 100) / 100;
function ringArea(ring) { // m², from lng/lat with a local metre scale
  const lat0 = ring[0][1], kx = 111320 * Math.cos(lat0 * Math.PI / 180), ky = 110540;
  let a = 0;
  for (let i = 0; i < ring.length - 1; i++) a += ring[i][0] * kx * ring[i + 1][1] * ky - ring[i + 1][0] * kx * ring[i][1] * ky;
  return Math.abs(a / 2);
}
const slug = s => String(s).normalize('NFKD').replace(/[’']/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '');

fs.mkdirSync(path.join(OUT, 'models'), { recursive: true });
fs.mkdirSync(path.join(OUT, 'interiors'), { recursive: true });
for (const [source, destination] of [['src/umpsa-sources.json','umpsa-sources.json'],['docs/UMPSA-PEKAN.md','umpsa-pekan.md']]) {
  if (fs.existsSync(path.join(SRC,source))) fs.copyFileSync(path.join(SRC,source),path.join(OUT,destination));
}

// ---------- Areas ----------
const areas = [], buildings = new Map();
const files = fs.readdirSync(PUB).filter(f => f.endsWith('.glb'));
let bytes = 0;
for (const f of files) {
  fs.copyFileSync(path.join(PUB, f), path.join(OUT, 'models', f));
  bytes += fs.statSync(path.join(PUB, f)).size;
}
for (const f of files.filter(f => !/^UZMA-/.test(f))) {
  const j = glbJson(path.join(PUB, f)), root = j.nodes[j.scenes[0].nodes[0]], ex = root.extras || {};
  if (!ex.areaId || !ex.coordinates) continue;
  const blds = j.nodes.filter(n => n.extras && Array.isArray(n.extras.footprint) && n.extras.footprint.length > 3);
  let w = 180, s = 90, e = -180, n = -90;
  for (const b of blds) for (const [x, y] of b.extras.footprint) { w = Math.min(w, x); e = Math.max(e, x); s = Math.min(s, y); n = Math.max(n, y); }
  areas.push({ id: ex.areaId, name: ex.areaName || root.name, glb: 'models/' + f, mb: r2(fs.statSync(path.join(PUB, f)).size / 1048576),
    center: [r7(ex.coordinates.longitude), r7(ex.coordinates.latitude)], bounds: [[r7(w), r7(s)], [r7(e), r7(n)]],
    overview: !!ex.overview, includedAreaIds: ex.overview ? ex.includedAreaIds : [ex.areaId],
    region: ex.region || (ex.areaId.startsWith('mutiara') ? 'Mutiara Damansara' : 'Damansara Perdana'),
    regionGroup: ex.regionGroup || 'damansara',
    buildings: blds.length, uzma: /UZMA/.test(root.name) || ex.areaId === 'damansara' });
  for (const b of blds) {
    const x = b.extras, id = 'dp-' + String(x.id).replace(/[^A-Za-z0-9]+/g, '-');
    // the overview repeats every area's buildings: keep the record from the area's own model
    if (buildings.has(id) && ex.overview) continue;
    const ring = x.footprint.map(([lng, lat]) => [r7(lng), r7(lat)]);
    if (ring[0][0] !== ring[ring.length - 1][0] || ring[0][1] !== ring[ring.length - 1][1]) ring.push([...ring[0]]);
    const holes = (x.holes || []).map(hole => {
      const points = hole.map(([lng, lat]) => [r7(lng), r7(lat)]);
      if (points[0][0] !== points.at(-1)[0] || points[0][1] !== points.at(-1)[1]) points.push([...points[0]]);
      return points;
    });
    const levels = Number(x.levels) || 0, height = Number(x.height) || 0;
    buildings.set(id, { type: 'Feature', geometry: { type: 'Polygon', coordinates: [ring, ...holes] }, properties: {
      id, src_id: x.id, nama: x.name, dp_area: x.areaId, kind: x.kind || '', tingkat_est: levels || (height ? Math.max(1, Math.round(height / 3.5)) : 1),
      tinggi_m: height ? r2(height) : null, tinggi_src: x.heightSource || (height ? 'UZMA Spatial Studio model' : 'not recorded; 1 floor assumed'),
      ht_est: !!x.heightEstimated, area_m2: Math.round(ringArea(ring) - holes.reduce((sum, hole) => sum + ringArea(hole), 0)), lng: r7(x.coordinates ? x.coordinates[0] : ring[0][0]),
      lat: r7(x.coordinates ? x.coordinates[1] : ring[0][1]), sumber: x.source || '',
      ...(x.historicalReference ? { historical_reference:true, temporal_status:x.temporalStatus, current_use_verified:false } : {}) } });
  }
}
// UZMA Tower is a detailed model without a footprint record: its shaft outline from the tower's own extras
{
  const j = glbJson(path.join(PUB, 'UZMA-Tower.glb')), root = j.nodes[j.scenes[0].nodes[0]], ex = root.extras, m = root.matrix;
  const { longitude: lng0, latitude: lat0 } = ex.coordinates, k = meterUnits(lat0), b = ex.shaftBounds;
  const ring = [[b.min[0], b.min[2]], [b.max[0], b.min[2]], [b.max[0], b.max[2]], [b.min[0], b.max[2]], [b.min[0], b.min[2]]].map(([x, z]) => {
    const X = m[0] * x + m[8] * z, Z = m[2] * x + m[10] * z;
    return [r7(lngOf(mercX(lng0) + X * k)), r7(latOf(mercY(lat0) + Z * k))];
  });
  buildings.set('dp-uzma-tower', { type: 'Feature', geometry: { type: 'Polygon', coordinates: [ring] }, properties: {
    id: 'dp-uzma-tower', src_id: 'uzma-tower', nama: 'UZMA Tower', dp_area: 'empire', kind: 'uzma-tower', tingkat_est: ex.storeys,
    tinggi_m: ex.height, tinggi_src: 'UZMA Spatial Studio: ' + ex.storeys + ' storeys, ' + ex.height + ' m (photo-informed, estimated)', ht_est: true,
    area_m2: Math.round(ringArea(ring)), lng: r7(lng0), lat: r7(lat0), sumber: ex.footprintReference || '', plan: 'uzma' } });
}

// ---------- Interior plans ----------
for (const f of fs.readdirSync(path.join(PUB, 'interiors'))) fs.copyFileSync(path.join(PUB, 'interiors', f), path.join(OUT, 'interiors', f));
for (const f of ['UZMA-Strata-Interiors.glb', 'UZMA-Level-6-Floor-Plan.svg', 'UZMA-Level-6-Room-Schedule.csv']) fs.copyFileSync(path.join(PUB, f), path.join(OUT, 'interiors', f));
const PLAN_AREA = { 'rafflesia-type-g': 'rafflesia', 'empire-heritage-lower-ground': 'empire' };
const index = JSON.parse(fs.readFileSync(path.join(PUB, 'interiors', 'index.json'), 'utf8'));
const uzmaData = glbJson(path.join(PUB, 'UZMA-Strata-Interiors.glb')).nodes[0].extras.data;
const plans = [{ id: 'uzma', label: 'UZMA Tower · 19 levels', development: 'UZMA Tower', kind: 'building', area: 'empire', glb: 'interiors/UZMA-Strata-Interiors.glb',
  scope: 'B5 – Level 12, 19 user-confirmed levels. Level 6 is traced from a photographed fire-equipment plan; the other levels are floor outlines only. Not a registered strata plan.',
  sources: [], georef: true,
  levels: uzmaData.levels.map(l => ({ id: l.id, label: l.label, plan: l.id === 'L06', svg: l.id === 'L06' ? 'interiors/UZMA-Level-6-Floor-Plan.svg' : null,
    csv: l.id === 'L06' ? 'interiors/UZMA-Level-6-Room-Schedule.csv' : null })) },
  ...index.map(p => ({ id: p.id, label: p.label, development: p.development, kind: p.kind, area: PLAN_AREA[p.id] || 'central-park', glb: 'interiors/' + p.glb,
    scope: p.scope, sources: p.sources || [], sqft: p.publishedAreaSqFt || null, georef: false,
    levels: p.levels.map(l => ({ id: l.id, label: l.label, plan: true, svg: 'interiors/' + l.svg, csv: 'interiors/' + l.csv })) }))];
// a building carries the plans of its development (D'Cosmos tower → D'Cosmos Type A1)
for (const b of buildings.values()) {
  const n = slug(b.properties.nama);
  const hit = plans.find(p => p.id !== 'uzma' && p.kind === 'unit-template' && n.startsWith(slug(p.development).replace(/residences$/, '')));
  if (hit && !b.properties.plan) b.properties.plan = hit.id;
}

const order = a => (a.overview ? 0 : 1);
areas.sort((a, b) => order(a) - order(b) || a.name.localeCompare(b.name));
const catalog = { generated: new Date().toISOString().slice(0, 10), source: 'UZMA Spatial Studio (UzmaTower3D_Model)',
  note: 'Damansara Perdana, Mutiara Damansara and UMPSA Pekan campus. Original mapped and individually reviewed imagery footprints and courtyards with sourced or estimated heights and indicative facades. Regional overviews are separate; coverage is incomplete where reliable footprints are unavailable. UZMA Tower is a photo-informed reconstruction. Not a surveyed digital twin, and the interior plans are not registered strata plans.',
  attribution: 'Building footprints © OpenStreetMap contributors (ODbL 1.0) · Microsoft Global ML Building Footprints (CDLA Permissive 2.0)',
  uzma: { glb: 'models/UZMA-Tower.glb', building: 'dp-uzma-tower' }, areas, plans };
fs.writeFileSync(path.join(OUT, 'catalog.json'), JSON.stringify(catalog, null, 1));
fs.writeFileSync(path.join(OUT, 'buildings.geojson'), JSON.stringify({ type: 'FeatureCollection', features: [...buildings.values()] }));
// Reviewed tenants open their modeled host instead of leaving a marker over a
// missing model. Keep these curated records through subsequent OSM refreshes.
const reviewedFile=path.join(SRC,'src','coverage-review-places.json');
if(fs.existsSync(reviewedFile)){
 const reviewed=JSON.parse(fs.readFileSync(reviewedFile,'utf8'));
 for(const p of reviewed)if(![...buildings.values()].some(b=>b.properties.src_id===p.host))throw new Error('Missing reviewed place host: '+p.host);
 fs.writeFileSync(path.join(OUT,'reviewed-places.json'),JSON.stringify(reviewed,null,2)+'\n');
 const placesFile=path.join(OUT,'places.json'),old=fs.existsSync(placesFile)?JSON.parse(fs.readFileSync(placesFile,'utf8')):[];
 fs.writeFileSync(placesFile,JSON.stringify([...old.filter(p=>!reviewed.some(q=>q.n===p.n)),...reviewed]));
}
console.log(`${areas.length} areas, ${buildings.size} buildings, ${plans.length} plans, ${(bytes / 1048576).toFixed(1)} MB of models → ${path.relative(ROOT, OUT)}`);
