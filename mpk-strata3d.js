// ============================================================
// STRATA 3D — the UZMA Spatial Studio models in Strata mode (ES module, after mpk-strata.js)
//   Area picker   MPK Kemaman (Teluk Kalong, Binjai – Chukai), Damansara Perdana or Mutiara Damansara;
//                 both Damansara regional models stay on the map (MapLibre custom layer, three.js) and
//                 its building footprints (strata3d/buildings.geojson) take strata schemes like any MPK building
//   Studio        a three.js workspace for one building:
//                   Strata stack   each floor cut into its parcels (petak) and common property, from the
//                                  scheme (or a preview); full stack, cutaway at a floor, or exploded; coloured
//                                  by parcel type, share units, owner, AGM vote or assessment bill; the real
//                                  model as a glass shell or cut solid around it; GLB / PNG download
//                   Interior plan  UZMA Tower's 19 levels and the published unit / house plans, room by room
// Models and data: tools/build_strata3d.mjs (from UzmaTower3D_Model). Estimates, not surveys or registered plans.
// ============================================================
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';

const S3D_BASE = 'strata3d/';
// Bump with the module's index.html version whenever the model catalog changes,
// so a newly deployed UI cannot reuse an older catalog or GLB from browser cache.
const S3D_VERSION = '20261025a';
const s3dAssetUrl = file => S3D_BASE + file + '?v=' + S3D_VERSION;
const S3D_KEMAMAN = [
  { id: 'mpk-all', name: 'All study areas', sub: 'Teluk Kalong + Binjai – Chukai' },
  { id: 'tk', name: 'Teluk Kalong', sub: 'Teluk Kalong Industrial Area' },
  { id: 'bbc', name: 'Binjai – Bandar Chukai', sub: 'Binjai – Chukai road corridor' },
];
const S3D_COLOR_BY = [['type', 'Parcel type'], ['su', 'Share units'], ['owner', 'Owner'], ['vote', 'AGM vote'], ['bill', 'Tax bill']];
const S3D = { cat: null, fc: null, byId: new Map(), loading: null, area: 'mpk-all', group: 'mpk', gltf: new Map(), pending: new Map(),
  progress: {}, onMap: null, mapEntries: [], mapRequest: 0, mapErrors: {}, layerOn: false, bound: false, hiddenNode: null };
try { const a = localStorage.getItem('s3d_area'); if (a) { S3D.area = a; S3D.group = S3D_KEMAMAN.some(k => k.id === a) ? 'mpk' : 'dp'; } } catch (e) {}
// 3D models on the map: on unless switched off in this browser (off: nothing is downloaded or drawn)
S3D.show3d = true;
try { S3D.show3d = localStorage.getItem('s3d_models') !== '0'; } catch (e) {}

const esc = v => (typeof strataEsc === 'function' ? strataEsc(v) : String(v == null ? '' : v));
const num = v => (typeof strataNum === 'function' ? strataNum(v) : (parseFloat(v) || 0));
const fmt = n => (typeof mpkNum === 'function' ? mpkNum(n) : Math.round(n).toLocaleString('en-MY'));
const dpArea = id => S3D.cat && S3D.cat.areas.find(a => a.id === id);
const dpPlan = id => S3D.cat && S3D.cat.plans.find(p => p.id === id);
const isDp = bid => String(bid).startsWith('dp-');
// Both regional overviews contain only their own named areas, including for
// map highlights, scheme totals, search and interior-plan suggestions.
const s3dIncludesArea = (area, id) => !!area && (Array.isArray(area.includedAreaIds) ? area.includedAreaIds.includes(id) : area.id === id);
const s3dRegion = area => area?.region || (String(area?.id || S3D.area).startsWith('mutiara') ? 'Mutiara Damansara' : 'Damansara Perdana');
const s3dAreaLabel = area => area.overview ? area.name : area.name + ', ' + s3dRegion(area);

// ---------- Data ----------
function s3dLoad() {
  if (S3D.cat) return Promise.resolve();
  if (S3D.loading) return S3D.loading;
  S3D.loading = Promise.all([fetch(s3dAssetUrl('catalog.json')).then(r => r.json()), fetch(s3dAssetUrl('buildings.geojson')).then(r => r.json()), s3dPlaces()])
    .then(([cat, fc, places]) => {
      S3D.cat = cat;
      // the regional overviews are named in Malay inside the GLBs ("Seluruh …")
      for (const a of cat.areas) a.name = a.name.replace(/^Seluruh\s+/i, 'All of ');
      for (const f of fc.features) {
        const p = f.properties;
        p.plus_code = typeof mpkPlusCode === 'function' ? mpkPlusCode(p.lat, p.lng) : p.lat.toFixed(5) + ',' + p.lng.toFixed(5);
        p.kawasan_dp = p.dp_area;
        S3D.byId.set(p.id, f);
      }
      s3dMainNames(fc.features, places);
      S3D.fc = fc;
    })
    .catch(e => { S3D.loading = null; if (typeof showToast === 'function') showToast('⚠️ Could not load the Damansara 3D data: ' + e.message, 5000); throw e; });
  return S3D.loading;
}
// Main name of every modelled building (p.nama; the model's own label stays in p.nama_model):
//   1 its own name, without the trailing OSM / Microsoft id and a repeated area prefix ("UZMA Tower", "Menara Bata")
//   2 else a named OpenStreetMap place inside the footprint (shop, office, surau, school… from places.json)
//   3 else its kind and the nearest named road ("House · Jalan PJU 7/26")
const S3D_GENERIC = /\b(house|building|supplementary|townhouse row|structure)\b[^\n]*\d{3,}\s*$|\s\d{6,}\s*$|\b\d{6,}\s+\d{3,}$/i;
function s3dInside(ring, x, y) {
  let ins = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) ins = !ins;
  }
  return ins;
}
function s3dMainNames(features, places) {
  const CELL = 0.002, key = (x, y) => Math.floor(x / CELL) + ':' + Math.floor(y / CELL);
  const grid = (list) => { const g = new Map(); for (const p of list) { const k = key(p.c[0], p.c[1]); (g.get(k) || g.set(k, []).get(k)).push(p); } return g; };
  const dp = (places || []).filter(p => p.r === 'dp');
  const pois = grid(dp.filter(p => !/^(Road|Neighbourhood)$/.test(p.k) && !/ area$/.test(p.k)));
  const roads = grid(dp.filter(p => p.k === 'Road'));
  const near = (g, x, y) => { const out = []; for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) out.push(...(g.get(Math.floor(x / CELL) + i + ':' + (Math.floor(y / CELL) + j)) || [])); return out; };
  for (const f of features) {
    const p = f.properties, own = String(p.nama || '');
    p.nama_model = own;
    let clean = own.replace(/\s+\d{6,}(\s+\d+)?\s*$/, '').replace(/^(.{4,}?) \1 /, '$1 ').trim();
    if (!S3D_GENERIC.test(own) && clean) { p.nama = clean; p.nama_how = 'model'; continue; }
    const ring = f.geometry.coordinates[0];
    const hit = near(pois, p.lng, p.lat).filter(q => s3dInside(ring, q.c[0], q.c[1]));
    if (hit.length) {
      // a building-level name first (malls, offices, schools), then any shop or place in it
      hit.sort((a, b) => (/Building|Mall|School|Office|Mosque|College|Hospital|Hotel/i.test(b.k) ? 1 : 0) - (/Building|Mall|School|Office|Mosque|College|Hospital|Hotel/i.test(a.k) ? 1 : 0));
      p.nama = hit[0].n + (hit.length > 1 ? ` +${hit.length - 1}` : '');
      p.nama_how = 'osm';
      p.nama_alt = hit.map(q => q.n).join(' ');
      continue;
    }
    const kind = /townhouse/i.test(own) ? 'Townhouse' : /semi-detached/i.test(own) ? 'Semi-detached house' : /house/i.test(own) ? 'House' : /shop/i.test(own) ? 'Shop' : 'Building';
    const road = near(roads, p.lng, p.lat).map(q => [q, Math.hypot(q.c[0] - p.lng, q.c[1] - p.lat)]).filter(r => r[1] < 0.0015).sort((a, b) => a[1] - b[1])[0];
    p.nama = road ? `${kind} · ${road[0].n}` : kind + ' · ' + (p.plus_code || p.id);
    p.nama_how = 'road';
  }
}
// A Damansara building as an MPK-like feature, for strataBuilding (mpk-strata.js)
function strata3dBuilding(bid) { return S3D.byId.get(String(bid)) || null; }
function strata3dAreaName(k) {
  if (!k) return '';
  const id = String(k).replace(/^dp:/, ''), a = dpArea(id);
  return a ? s3dAreaLabel(a) : (String(k).startsWith('dp:') ? s3dRegion({ id }) : '');
}

// ---------- Map: building footprints and the GLB model ----------
function s3dBldData() {
  if (!S3D.fc) return { type: 'FeatureCollection', features: [] };
  const schemes = (STRATA.s && STRATA.s.schemes) || {};
  return { type: 'FeatureCollection', features: S3D.fc.features.map(f => {
    const sc = schemes[f.properties.id];
    return { type: 'Feature', geometry: f.geometry, properties: { id: f.properties.id, st: sc ? strataStageIdx(sc) + 1 : 0,
      on: s3dIncludesArea(dpArea(S3D.area), f.properties.dp_area) ? 1 : 0, plan: f.properties.plan ? 1 : 0 } };
  }) };
}
function strata3dSync() {
  if (!STRATA.active || typeof map === 'undefined' || !map || !S3D.fc) return;
  try {
    if (!map.getSource('s3d-bld')) {
      map.addSource('s3d-bld', { type: 'geojson', data: s3dBldData() });
      map.addLayer({ id: 's3d-fill', type: 'fill', source: 's3d-bld', paint: {
        'fill-color': ['case', ['>', ['get', 'st'], 0], strataStageColor(), '#7E57C2'],
        'fill-opacity': s3dFillOpacity() } });
      map.addLayer({ id: 's3d-line', type: 'line', source: 's3d-bld', paint: {
        'line-color': ['case', ['>', ['get', 'st'], 0], '#1E2C44', '#5E35B1'],
        'line-width': ['interpolate', ['linear'], ['zoom'], 13, 0.4, 17, ['case', ['>', ['get', 'st'], 0], 2.2, 1]],
        'line-opacity': ['case', ['==', ['get', 'on'], 1], 0.85, 0.5] } });
    } else map.getSource('s3d-bld').setData(s3dBldData());
    if (!map.getLayer('s3d-models')) { map.addLayer(s3dCustomLayer()); S3D.layerOn = true; }
    // main names over the models: buildings with a real name (their own or an OSM place inside), tallest first
    if (!map.getSource('s3d-names')) {
      map.addSource('s3d-names', { type: 'geojson', data: { type: 'FeatureCollection', features: S3D.fc.features
        .filter(f => f.properties.nama_how !== 'road').map(f => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [f.properties.lng, f.properties.lat] },
          properties: { n: f.properties.nama, h: f.properties.tinggi_m || 3 } })) } });
    }
    if (!map.getLayer('s3d-names')) map.addLayer({ id: 's3d-names', type: 'symbol', source: 's3d-names', minzoom: 15.3,
      layout: { 'text-field': ['get', 'n'], 'text-font': ['Noto Sans Regular'], 'text-size': ['interpolate', ['linear'], ['zoom'], 15.3, 10.5, 18, 13],
        'text-max-width': 9, 'symbol-sort-key': ['-', 0, ['get', 'h']], 'text-padding': 4 },
      paint: { 'text-color': '#311B92', 'text-halo-color': '#fff', 'text-halo-width': 1.6 } });
  } catch (e) { return; }
  if (!S3D.bound) {
    S3D.bound = true;
    map.on('click', 's3d-fill', e => {
      if (!STRATA.active || STRATA.picking || !e.features.length) return;
      strataPopup(e.features[0].properties.id, e.lngLat);
    });
    map.on('mouseenter', 's3d-fill', () => { if (STRATA.active) map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', 's3d-fill', () => { if (STRATA.active) map.getCanvas().style.cursor = 'grab'; });
  }
  s3dXrayHide();
}
function strata3dRemove() {
  strata3dClearSearch();
  s3dTopHint(false);
  ++S3D.mapRequest;
  S3D.onMap = null;
  S3D.mapEntries = [];
  if (S3D.hiddenNode) { S3D.hiddenNode.visible = true; S3D.hiddenNode = null; }
  if (typeof map === 'undefined' || !map) return;
  for (const id of ['s3d-names', 's3d-models', 's3d-line', 's3d-fill']) { try { if (map.getLayer(id)) map.removeLayer(id); } catch (e) {} }
  for (const id of ['s3d-bld', 's3d-names']) { try { if (map.getSource(id)) map.removeSource(id); } catch (e) {} }
  S3D.layerOn = false;
}
// Floor X-ray of a Damansara scheme: the model's own building steps aside for the slabs
function s3dXrayHide() {
  if (S3D.hiddenNode) { S3D.hiddenNode.visible = true; S3D.hiddenNode = null; }
  const sc = STRATA.xray && STRATA.cur && STRATA.s.schemes[STRATA.cur], f = sc && S3D.byId.get(sc.bid);
  if (!f || S3D.group !== 'dp') return;
  const node = S3D.mapEntries.map(entry => s3dFindNode(entry.gltf.scene, f.properties)).find(Boolean);
  if (node) { node.visible = false; S3D.hiddenNode = node; }
  map.triggerRepaint();
}
function s3dFindNode(root, p) {
  let hit = null;
  root.traverse(o => {
    if (hit) return;
    // GLTFLoader rewrites node names (spaces → _): UZMA Tower is known by its tower extras
    const u = o.userData || {};
    if (p.src_id === 'uzma-tower' ? u.storeys && u.shaftWidth : u.id === p.src_id) hit = o;
  });
  return hit;
}
function s3dLights(scene) {
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8a9199, 2.1));
  const sun = new THREE.DirectionalLight(0xffffff, 2.4);
  sun.position.set(-60, 120, 80);
  scene.add(sun);
}
function s3dCustomLayer() {
  return {
    id: 's3d-models', type: 'custom', renderingMode: '3d',
    onAdd(m, gl) {
      this.camera = new THREE.Camera();
      this.renderer = new THREE.WebGLRenderer({ canvas: m.getCanvas(), context: gl, antialias: true });
      this.renderer.autoClear = false;
      this.mx = new THREE.Matrix4();
    },
    render(gl, args) {
      if (!S3D.show3d || !S3D.mapEntries.length || !STRATA.active || S3D.group !== 'dp') return;
      const matrix = args && args.defaultProjectionData ? args.defaultProjectionData.mainMatrix : args;
      this.renderer.resetState();
      for (const entry of S3D.mapEntries) {
        this.camera.projectionMatrix = this.mx.fromArray(matrix).multiply(entry.l);
        this.renderer.render(entry.scene, this.camera);
      }
    },
    onRemove() { if (this.renderer) this.renderer.dispose(); },
  };
}
// GLB of an area, loaded once; progress shown in the area card
function s3dGltf(areaId) {
  if (S3D.gltf.has(areaId)) return Promise.resolve(S3D.gltf.get(areaId));
  if (S3D.pending.has(areaId)) return S3D.pending.get(areaId);
  const a = dpArea(areaId);
  if (!a) return Promise.reject(new Error('Unknown area ' + areaId));
  S3D.progress[areaId] = 0;
  const p = new GLTFLoader().loadAsync(s3dAssetUrl(a.glb), e => {
    const pct = e.total ? Math.round(e.loaded / e.total * 100) : Math.min(99, Math.round(e.loaded / (a.mb * 1048576) * 100));
    if (pct !== S3D.progress[areaId]) { S3D.progress[areaId] = pct; s3dProgressUi(areaId); }
  }).then(g => { S3D.gltf.set(areaId, g); S3D.pending.delete(areaId); delete S3D.progress[areaId]; return g; })
    .catch(e => { S3D.pending.delete(areaId); delete S3D.progress[areaId]; throw e; });
  S3D.pending.set(areaId, p);
  return p;
}
function s3dProgressUi(areaId) {
  const el = document.querySelector('[data-s3d-progress]');
  if (el) el.textContent = s3dMapStatus();
}
// Overview GLBs are disjoint regional exports. Using these roots, rather than
// also adding the selected leaf GLB, keeps neighbouring areas visible once each.
function s3dMapAreas(areaId = S3D.area) {
  const overviews = S3D.cat ? S3D.cat.areas.filter(a => a.overview) : [];
  return overviews.length ? overviews : [dpArea(areaId)].filter(Boolean);
}
function s3dMapStatus(areaId = S3D.area) {
  const areas = s3dMapAreas(areaId);
  if (!areas.length || S3D.group !== 'dp') return '';
  if (!S3D.show3d) return '3D models off';
  const loaded = areas.filter(a => S3D.mapEntries.some(entry => entry.areaId === a.id));
  const failed = areas.filter(a => S3D.mapErrors[a.id]);
  if (failed.length) return '3D failed · select to retry';
  if (loaded.length === areas.length) return '3D on the map';
  // one percentage for all the regional models, weighted by file size
  const mb = areas.reduce((s, a) => s + (a.mb || 1), 0);
  const done = areas.reduce((s, a) => s + (a.mb || 1) * (loaded.includes(a) ? 100 : S3D.progress[a.id] || 0), 0);
  return `Loading 3D… ${Math.min(99, Math.round(done / mb))}%`;
}
// Footprints: faint under the models, filled when the models are off so the buildings still read in 2D
function s3dFillOpacity() {
  return ['case', ['>', ['get', 'st'], 0], 0.55, ['==', ['get', 'on'], 1], S3D.show3d ? 0.04 : 0.45, S3D.show3d ? 0.22 : 0.3];
}
function strata3dToggleModels(on) {
  S3D.show3d = on == null ? !S3D.show3d : !!on;
  try { localStorage.setItem('s3d_models', S3D.show3d ? '1' : '0'); } catch (e) {}
  try { if (map.getLayer('s3d-fill')) map.setPaintProperty('s3d-fill', 'fill-opacity', s3dFillOpacity()); } catch (e) {}
  if (S3D.show3d && S3D.group === 'dp') s3dPutOnMap(S3D.area);      // cached GLBs come back at once
  if (map) map.triggerRepaint();
  strataRenderPanel();
}
function s3dToggleHtml() {
  return `<label class="s3d-toggle"><span><b>3D models</b><small>${S3D.show3d ? 'Shown on the map' : 'Off · footprints only, no download'}</small></span>
    <input type="checkbox" role="switch" ${S3D.show3d ? 'checked' : ''} onchange="strata3dToggleModels(this.checked)" aria-label="Show 3D models on the map"><i></i></label>`;
}
function s3dPutOnMap(areaId, request = ++S3D.mapRequest) {
  if (!S3D.show3d) return Promise.resolve();
  const areas = s3dMapAreas(areaId);
  const current = () => request === S3D.mapRequest && S3D.area === areaId && S3D.group === 'dp' && STRATA.active;
  S3D.mapErrors = {};
  S3D.mapEntries = S3D.mapEntries.filter(entry => areas.some(a => a.id === entry.areaId));
  const refresh = () => {
    const selected = S3D.mapEntries.find(entry => entry.areaId === areaId || s3dIncludesArea(dpArea(entry.areaId), areaId));
    S3D.onMap = selected ? { ...selected, modelAreaId: selected.areaId, areaId } : null;
    strata3dSync();
    if (map) map.triggerRepaint();
    if (typeof strataRenderPanel === 'function') strataRenderPanel();
  };
  if (!current()) return Promise.resolve();
  refresh();
  return Promise.all(areas.map(a => s3dGltf(a.id).then(g => {
    if (!current()) return;
    if (!S3D.mapEntries.some(entry => entry.areaId === a.id)) {
      const scene = new THREE.Scene();
      scene.add(g.scene);
      s3dLights(scene);
      const mc = maplibregl.MercatorCoordinate.fromLngLat(a.center, 0), s = mc.meterInMercatorCoordinateUnits();
      const l = new THREE.Matrix4().makeTranslation(mc.x, mc.y, mc.z).scale(new THREE.Vector3(s, -s, s)).multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2));
      S3D.mapEntries.push({ areaId: a.id, gltf: g, scene, l });
      S3D.mapEntries.sort((x, y) => areas.findIndex(a => a.id === x.areaId) - areas.findIndex(a => a.id === y.areaId));
    }
    refresh();
  }).catch(e => {
    if (!current()) return;
    S3D.mapErrors[a.id] = e.message;
    if (typeof showToast === 'function') showToast('⚠️ ' + s3dRegion(a) + ' 3D did not load: ' + e.message, 5000);
    refresh();
  })));
}

// ---------- Area picker ----------
function s3dKemamanBounds(id) {
  if (!MPK.data) return null;
  let w = 180, s = 90, e = -180, n = -90, any = false;
  for (const f of MPK.data.buildings.features) {
    const p = f.properties;
    if (id !== 'mpk-all' && p.kawasan !== id) continue;
    if (id === 'mpk-all' && !p.kawasan) continue;
    any = true; w = Math.min(w, p.lng); e = Math.max(e, p.lng); s = Math.min(s, p.lat); n = Math.max(n, p.lat);
  }
  return any ? [[w, s], [e, n]] : null;
}
function strata3dSelectArea(id, opts = {}) {
  const fly = opts.fly !== false;
  const request = ++S3D.mapRequest;
  S3D.area = id;
  try { localStorage.setItem('s3d_area', id); } catch (e) {}
  const kem = S3D_KEMAMAN.find(k => k.id === id);
  S3D.group = kem ? 'mpk' : 'dp';
  s3dTitle();
  if (kem) {
    S3D.onMap = null;
    S3D.mapEntries = [];
    S3D.mapErrors = {};
    if (S3D.hiddenNode) { S3D.hiddenNode.visible = true; S3D.hiddenNode = null; }
    const b = s3dKemamanBounds(id);
    if (fly && b && map) map.fitBounds(b, { padding: 60, pitch: 45, bearing: -15, duration: 1400, maxZoom: 16.5 });
    strata3dSync();
    if (map) map.triggerRepaint();
    strataRenderPanel();
    return Promise.resolve();
  }
  return s3dLoad().then(() => {
    if (request !== S3D.mapRequest || S3D.area !== id || S3D.group !== 'dp' || !STRATA.active) return;
    const a = dpArea(id);
    if (!a) return;
    if (fly && map) map.fitBounds(a.bounds, { padding: 70, pitch: 58, bearing: -25, duration: 1600, maxZoom: a.overview ? 16 : 18.2 });
    strata3dSync();
    strataRenderPanel();
    return s3dPutOnMap(id, request);
  });
}
// The page title names the region of the selected area
function s3dTitle() {
  const t = document.getElementById('page-title');
  if (t && STRATA.active) t.textContent = 'Strata Titles — ' + (S3D_KEMAMAN.some(k => k.id === S3D.area) ? 'MPK Kemaman' : s3dRegion(dpArea(S3D.area)));
}
function strata3dSetGroup(g) {
  const kem = S3D_KEMAMAN.some(k => k.id === S3D.area);
  return strata3dSelectArea(g === 'dp' ? (kem ? 'damansara' : S3D.area) : (kem ? S3D.area : 'mpk-all'));
}
function strata3dFilter(q) {
  const t = q.trim().toLowerCase();
  document.querySelectorAll('#tab-strata .s3d-area[data-name]').forEach(b => { b.hidden = !!t && !b.dataset.name.includes(t); });
}

// ---------- Search: areas, buildings, schemes, owners, interior plans, places and addresses ----------
// Local first (both regions, instant), then OpenStreetMap: the places index (strata3d/places.json, stations,
// malls, schools, roads…; tools/build_strata3d_places.mjs) and a live Nominatim lookup for other addresses.
const S3D_REGION_BOX = { dp: [101.575, 3.125, 101.655, 3.205], mpk: [103.38, 4.205, 103.485, 4.315] };  // w, s, e, n
const s3dNorm = s => String(s == null ? '' : s).normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[’'`]/g, '').replace(/[^a-z0-9+/]+/g, ' ').trim();
const SR = { q: '', res: [], places: null, placesP: null, timer: 0, seq: 0, cache: new Map(), marker: null, online: false };
function s3dPlaces() {
  if (SR.places) return Promise.resolve(SR.places);
  return SR.placesP || (SR.placesP = fetch(s3dAssetUrl('places.json')).then(r => (r.ok ? r.json() : [])).catch(() => [])
    .then(p => (SR.places = p.map(x => ({ ...x, t: s3dNorm(x.n + ' ' + x.k + ' ' + (x.a || '')) })))));
}
// all words must appear; a name that starts with the query ranks first
function s3dScore(t, label, terms, weight) {
  if (!terms.every(w => t.includes(w))) return 0;
  const l = s3dNorm(label), q = terms.join(' ');
  return weight + (l === q ? 8 : l.startsWith(q) ? 5 : (' ' + l).includes(' ' + terms[0]) ? 3 : 1) - Math.min(1, l.length / 200);
}
function s3dLocalSearch(q) {
  const terms = s3dNorm(q).split(' ').filter(Boolean), out = [];
  if (!terms.length) return out;
  const add = (kind, label, sub, text, weight, go) => { const s = s3dScore(s3dNorm(text), label, terms, weight); if (s) out.push({ kind, label, sub, s, go }); };
  for (const k of S3D_KEMAMAN) add('Area', k.name, 'MPK Kemaman · ' + k.sub, k.name + ' ' + k.sub + ' kemaman mpk chukai', 6, { area: k.id });
  if (S3D.cat) {
    for (const a of S3D.cat.areas) add('Area', a.name, s3dRegion(a) + ' · ' + fmt(a.buildings) + (a.buildings === 1 ? ' building' : ' buildings'), a.name + ' ' + s3dRegion(a) + ' ' + a.id, 6, { area: a.id });
    for (const p of S3D.cat.plans) add('Interior plan', p.label, p.development, p.label + ' ' + p.development + ' floor plan interior unit', 4, { plan: p.id });
  }
  if (S3D.fc) for (const f of S3D.fc.features) {
    const p = f.properties, a = dpArea(p.dp_area);
    add('Building', p.nama, [a && a.name, p.tingkat_est + (p.tingkat_est === 1 ? ' floor' : ' floors')].filter(Boolean).join(' · '),
      [p.nama, p.nama_model, p.nama_alt, p.plus_code, a && a.name, s3dRegion(a), p.kind].join(' '), 3, { dp: p.id });
  }
  if (MPK.data) for (const f of [...MPK.data.buildings.features, ...((MPK.data.others || {}).features || [])]) {
    const p = f.properties;
    add('Building', p.plus_code || 'Building ' + p.id, ['Kemaman', (MPK_AREAS[p.kawasan] || {}).short, p.lot ? 'Lot ' + p.lot : '', p.tingkat_est ? p.tingkat_est + (p.tingkat_est === 1 ? ' floor' : ' floors') : ''].filter(Boolean).join(' · '),
      [p.plus_code, p.lot && 'lot ' + p.lot, p.upi, p.id, (MPK_AREAS[p.kawasan] || {}).name].filter(Boolean).join(' '), 2, { mpk: p.id, c: [p.lng, p.lat] });
  }
  for (const sc of Object.values((STRATA.s && STRATA.s.schemes) || {})) {
    add('Strata scheme', sc.no + ' · ' + sc.nama, [sc.bld.plus_code, sc.bld.lot && 'Lot ' + sc.bld.lot, strataAreaName(sc.bld.kawasan)].filter(Boolean).join(' · '),
      [sc.no, sc.nama, sc.pemaju, sc.hakmilik_induk, sc.alamat, sc.bld.plus_code, sc.bld.lot].join(' '), 7, { scheme: sc.bid });
    for (const x of sc.parcels) if (x.pemilik) add('Owner', x.pemilik, 'Parcel ' + x.petak + ' · ' + sc.no, x.pemilik + ' ' + x.petak, 5, { scheme: sc.bid, step: 2 });
  }
  // an OSM building already in the models under the same name is shown once, as the model
  const modelled = new Set(out.filter(r => r.go.dp).map(r => s3dNorm(r.label)));
  for (const p of SR.places || []) if (!(p.k === 'Building' && modelled.has(s3dNorm(p.n)))) add(p.k, p.n, (p.r === 'mpk' ? 'Kemaman' : 'Damansara') + ' · OpenStreetMap', p.t, /station|terminal/.test(p.k) ? 8 : 2, { c: p.c, label: p.n });
  return out.sort((x, y) => y.s - x.s).slice(0, 14);
}
// Nominatim (OpenStreetMap) for addresses not in the index: one request per pause in typing, cached
function s3dAddressSearch(q, seq) {
  const key = s3dNorm(q);
  if (SR.cache.has(key)) return Promise.resolve(SR.cache.get(key));
  const look = box => fetch('https://nominatim.openstreetmap.org/search?' + new URLSearchParams({ format: 'jsonv2', q, limit: '6', countrycodes: 'my',
    bounded: '1', viewbox: box.join(','), 'accept-language': 'en' })).then(r => (r.ok ? r.json() : []));
  const first = S3D.group === 'mpk' ? 'mpk' : 'dp', second = first === 'mpk' ? 'dp' : 'mpk';
  return look(S3D_REGION_BOX[first]).then(r => (r.length || seq !== SR.seq ? r : look(S3D_REGION_BOX[second]))).catch(() => [])
    .then(r => {
      const res = r.map(x => ({ kind: 'Address', label: x.name || x.display_name.split(',')[0], sub: x.display_name.split(',').slice(1, 4).join(',').trim(),
        s: 0, go: { c: [+x.lon, +x.lat], label: x.name || x.display_name.split(',')[0] } }));
      SR.cache.set(key, res);
      return res;
    });
}
// The topbar search (#mpk-search-input, mpk.js) runs this search while Strata is on
const S3D_TOP_HINT = 'Search places, addresses, MRT, buildings, lots, owners…';
function strata3dTopSearch(q) { SR.top = true; s3dSearch(q); }
function strata3dSearch(q) { SR.top = false; s3dSearch(q); }
function s3dSearch(q) {
  SR.q = q;
  if (!SR.top) strata3dFilter(q);
  const seq = ++SR.seq;
  clearTimeout(SR.timer);
  const show = extra => {
    if (seq !== SR.seq) return;
    const local = s3dLocalSearch(q), seen = new Set(local.map(r => s3dNorm(r.label)));
    // an address repeated by several OSM ways (or already found locally) shows once
    SR.res = [...local, ...(extra || []).filter(r => { const k = s3dNorm(r.label); if (seen.has(k)) return false; seen.add(k); return true; })];
    s3dResultsUi();
  };
  if (!q.trim()) { SR.res = []; SR.online = false; s3dResultsUi(); return; }
  show();
  Promise.all([s3dPlaces(), S3D.cat ? null : s3dLoad().catch(() => {})]).then(() => show());
  if (q.trim().length >= 3) {
    SR.online = true;
    SR.timer = setTimeout(() => s3dAddressSearch(q.trim(), seq).then(extra => { SR.online = false; show(extra); }), 650);
  } else SR.online = false;
}
function s3dResultsHtml() {
  if (!SR.q.trim()) return '';
  if (!SR.res.length) return `<div class="s3d-res-empty">${SR.online ? 'Searching addresses…' : 'Nothing found. Try a building, road, station, lot or Plus Code.'}</div>`;
  return SR.res.map((r, i) => `<button type="button" class="s3d-res" role="option" onclick="strata3dPick(${i})">
      <b>${esc(r.label)}</b><small><span class="s3d-res-k">${esc(r.kind)}</span>${r.sub ? ' · ' + esc(r.sub) : ''}</small></button>`).join('')
    + (SR.online ? '<div class="s3d-res-empty">Searching addresses…</div>' : '');
}
const S3D_KIND_ICON = { Area: '🗺️', Building: '🏢', 'Strata scheme': '📑', Owner: '👤', 'Interior plan': '📐', Address: '📍', Road: '🛣️' };
function s3dResultsUi() {
  if (SR.top) {
    const dd = document.getElementById('mpk-search-dd');
    if (!dd) return;
    if (!SR.q.trim()) { dd.style.display = 'none'; return; }
    let last = null, html = '';
    SR.res.forEach((r, i) => {
      const group = /station|terminal/i.test(r.kind) ? 'Stations' : ['Area', 'Building', 'Strata scheme', 'Owner', 'Interior plan', 'Address'].includes(r.kind) ? r.kind : 'Places';
      if (group !== last) { html += `<div class="search-section-header">${esc(group === 'Address' ? 'Addresses (OpenStreetMap)' : group === 'Places' || group === 'Stations' ? group + ' (OpenStreetMap)' : group + 's')}</div>`; last = group; }
      html += `<div class="search-item" role="option" onclick="strata3dPick(${i})"><div class="search-item-icon">${S3D_KIND_ICON[r.kind] || (/station/i.test(r.kind) ? '🚉' : '📍')}</div>
        <div class="search-item-body"><div class="search-item-id">${esc(r.label)}</div><div class="search-item-cls">${esc(r.kind)}${r.sub ? ' · ' + esc(r.sub) : ''}</div></div></div>`;
    });
    if (SR.online) html += '<div class="search-loading">Searching addresses…</div>';
    if (!html) html = '<div class="search-loading">Nothing found. Try a building, road, MRT station, lot, Plus Code or owner.</div>';
    dd.innerHTML = html;
    dd.style.display = 'block';
    return;
  }
  const el = document.getElementById('s3d-results');
  if (el) { el.innerHTML = s3dResultsHtml(); el.hidden = !SR.q.trim(); }
}
function strata3dSearchKey(e) {
  if (e.key === 'Enter' && SR.res.length) { e.preventDefault(); strata3dPick(0); }
  if (e.key === 'Escape') { e.target.value = ''; SR.top ? strata3dTopSearch('') : strata3dSearch(''); }
}
// The area that holds a point: the smallest Damansara area whose bounds contain it, else the region overview
function s3dAreaAt(c) {
  if (!S3D.cat) return null;
  const inside = a => a.bounds && c[0] >= a.bounds[0][0] && c[0] <= a.bounds[1][0] && c[1] >= a.bounds[0][1] && c[1] <= a.bounds[1][1];
  const size = a => (a.bounds[1][0] - a.bounds[0][0]) * (a.bounds[1][1] - a.bounds[0][1]);
  return S3D.cat.areas.filter(a => !a.overview && inside(a)).sort((x, y) => size(x) - size(y))[0] || S3D.cat.areas.find(a => a.overview && inside(a)) || null;
}
function s3dGoTo(c, label) {
  const inKemaman = c[0] > 103;
  const a = inKemaman ? null : s3dAreaAt(c);
  if (inKemaman && S3D.group !== 'mpk') strata3dSelectArea('mpk-all', { fly: false });
  else if (a && S3D.area !== a.id) strata3dSelectArea(a.id, { fly: false });
  map.flyTo({ center: c, zoom: 17.6, pitch: 55, duration: 1300 });
  if (SR.marker) SR.marker.remove();
  SR.marker = new maplibregl.Marker({ color: '#5E35B1' }).setLngLat(c).setPopup(new maplibregl.Popup({ offset: 24 }).setText(label)).addTo(map);
  SR.marker.togglePopup();
}
function strata3dPick(i) {
  const r = SR.res[i];
  if (!r) return;
  const g = r.go;
  if (SR.marker && !g.c) { SR.marker.remove(); SR.marker = null; }
  if (g.area) strata3dSelectArea(g.area);
  else if (g.plan) strata3dOpen({ planId: g.plan, mode: 'plan' });
  else if (g.scheme) { strataGo(g.scheme); if (g.step) strataStep(g.step); }
  else if (g.dp) {
    const f = S3D.byId.get(g.dp);
    if (f && S3D.area !== f.properties.dp_area) strata3dSelectArea(f.properties.dp_area, { fly: false });
    strata3dFocus(g.dp);
  } else if (g.mpk) {
    if (S3D.group !== 'mpk') strata3dSelectArea('mpk-all', { fly: false });
    map.flyTo({ center: g.c, zoom: 18.2, pitch: 50, duration: 1200 });
    map.once('moveend', () => strataPopup(g.mpk, g.c));
  } else if (g.c) s3dGoTo(g.c, g.label);
  if (SR.top) {
    const dd = document.getElementById('mpk-search-dd'), input = document.getElementById('mpk-search-input');
    if (dd) dd.style.display = 'none';
    if (input) input.value = r.label;
    SR.q = ''; SR.res = []; SR.top = false;
  } else if (!g.area) { SR.q = ''; SR.res = []; }
  strataRenderPanel();
}
function s3dTopHint(on) {
  const input = document.getElementById('mpk-search-input');
  if (!input) return;
  if (on && input.placeholder !== S3D_TOP_HINT) { input.dataset.mpkHint = input.placeholder; input.placeholder = S3D_TOP_HINT; }
  if (!on && input.dataset.mpkHint) { input.placeholder = input.dataset.mpkHint; delete input.dataset.mpkHint; }
}
function strata3dClearSearch() { if (SR.marker) { SR.marker.remove(); SR.marker = null; } SR.q = ''; SR.res = []; }
function s3dSearchHtml() {
  return `<div class="s3d-searchbox"><input type="search" class="s3d-search" id="s3d-search" value="${esc(SR.q)}" autocomplete="off"
      placeholder="Search a place, address, station, building, lot, owner…" aria-label="Search places, addresses, buildings, schemes and owners"
      aria-controls="s3d-results" oninput="strata3dSearch(this.value)" onkeydown="strata3dSearchKey(event)">
    <div class="s3d-results" id="s3d-results" role="listbox"${SR.q.trim() ? '' : ' hidden'}>${s3dResultsHtml()}</div></div>`;
}
function strata3dPanelHtml() {
  const g = S3D.group, schemes = (STRATA.s && STRATA.s.schemes) || {};
  const seg = `<div class="strata-seg" role="radiogroup" aria-label="Region">${[['mpk', 'MPK Kemaman'], ['dp', 'Damansara Perdana + Mutiara 3D']].map(([k, l]) =>
    `<button type="button" role="radio" aria-checked="${g === k}" class="${g === k ? 'on' : ''}" onclick="strata3dSetGroup('${k}')">${l}</button>`).join('')}</div>`;
  let list = '', detail = '';
  if (g === 'mpk') {
    const count = id => MPK.data ? MPK.data.buildings.features.filter(f => id === 'mpk-all' ? f.properties.kawasan : f.properties.kawasan === id).length : 0;
    list = S3D_KEMAMAN.map(k => `<button type="button" class="s3d-area${S3D.area === k.id ? ' on' : ''}" onclick="strata3dSelectArea('${k.id}')">
      <b>${esc(k.name)}</b><small>${esc(k.sub)} · ${fmt(count(k.id))} buildings</small></button>`).join('');
    detail = `<p class="strata-panel-copy">Strata 3D builds each Kemaman building from its footprint and estimated floors. Open a building, then <b>View in 3D</b>.</p>`;
  } else if (!S3D.cat) {
    list = '<div class="mpk-reg-empty">Loading the Damansara Perdana and Mutiara Damansara areas…</div>';
  } else {
    const areas = S3D.cat.areas;
    const filt = SR.q.trim().toLowerCase();
    list = `<div class="s3d-areas">${areas.map(a => {
        const names = S3D.fc.features.filter(f => s3dIncludesArea(a, f.properties.dp_area)).map(f => f.properties.nama).join(' ');
        const n = Object.values(schemes).filter(x => x.bld && String(x.bld.kawasan).startsWith('dp:') && s3dIncludesArea(a, String(x.bld.kawasan).slice(3))).length;
        const key = (a.name + ' ' + names).toLowerCase();
        return `<button type="button" class="s3d-area${S3D.area === a.id ? ' on' : ''}" data-name="${esc(key)}"${filt && !key.includes(filt) ? ' hidden' : ''} onclick="strata3dSelectArea('${esc(a.id)}')">
          <b>${esc(a.name)}${a.uzma ? ' <span class="s3d-tag">UZMA</span>' : ''}</b>
          <small>${fmt(a.buildings)} building${a.buildings === 1 ? '' : 's'} · ${a.mb} MB model${n ? ` · ${n} scheme${n > 1 ? 's' : ''}` : ''}</small></button>`; }).join('')}</div>`;
    const a = dpArea(S3D.area);
    if (a) {
      const inArea = S3D.fc.features.filter(f => s3dIncludesArea(a, f.properties.dp_area));
      const tall = inArea.slice().sort((x, y) => (y.properties.tinggi_m || 0) - (x.properties.tinggi_m || 0)).slice(0, 6);
      const plans = S3D.cat.plans.filter(p => s3dIncludesArea(a, p.area));
      detail = `<div class="s3d-now"><div class="s3d-now-t"><b>${esc(a.name)}</b><span data-s3d-progress="${esc(a.id)}">${esc(s3dMapStatus(a.id))}</span></div>
        <p class="strata-panel-copy">Click any outlined building to start a strata scheme or open it in the Strata 3D studio.</p>
        ${inArea.some(f => f.properties.historical_reference) ? '<p class="mpk-note">Former eCurve is shown as a historical satellite reference. It is not verified current construction or the proposed The LINES development.</p>' : ''}
        <div class="s3d-chips">${tall.map(f => { const p = f.properties;
          return `<button type="button" class="s3d-chip" onclick='strata3dFocus(${JSON.stringify(p.id)})' title="${esc(p.nama)}">${esc(s3dShort(p.nama))}<small>${p.tingkat_est} fl</small></button>`; }).join('')}</div>
        ${plans.length ? `<div class="s3d-sub">Interior plans</div><div class="s3d-chips">${plans.map(p =>
          `<button type="button" class="s3d-chip plan" onclick='strata3dOpen({ planId: ${JSON.stringify(p.id)}, mode: "plan" })'>${esc(p.label)}</button>`).join('')}</div>` : ''}
        <div class="mpk-note">${esc(S3D.cat.note)}<br>${esc(S3D.cat.attribution)}</div></div>`;
    }
  }
  return `<div class="mpk-card s3d-card"><div class="mpk-card-title">Choose an area <span class="s3d-new">3D</span></div>${s3dSearchHtml()}${seg}${g === 'dp' ? s3dToggleHtml() : ''}${list}${detail}</div>`;
}
const s3dShort = n => String(n).replace(/\s+\d{6,}$/, '').replace(/^(.{26}).+$/, '$1…');
function strata3dFocus(bid) {
  const f = S3D.byId.get(bid);
  if (!f) return;
  const p = f.properties;
  map.flyTo({ center: [p.lng, p.lat], zoom: p.tinggi_m > 60 ? 17.4 : 18.3, pitch: 60, bearing: -25, duration: 1200 });
  map.once('moveend', () => strataPopup(bid, [p.lng, p.lat]));
}
// strataEnter (mpk-strata.js): the remembered area comes back; the map only moves there when it is out of view
function strata3dOnEnter() {
  s3dTitle();
  s3dTopHint(true);
  s3dLoad().then(() => {
    strata3dSync();
    const a = S3D.group === 'dp' && dpArea(S3D.area);
    if (a) strata3dSelectArea(S3D.area, { fly: !map.getBounds().contains(a.center) });
    else strataRenderPanel();
  }).catch(() => {});
}
// A saved Damansara scheme opens with its area's model on the map
function strata3dForScheme(sc) {
  const k = sc && sc.bld && sc.bld.kawasan;
  if (!k || !String(k).startsWith('dp:')) return;
  const id = String(k).slice(3);
  if (S3D.area !== id || !S3D.onMap) strata3dSelectArea(id, { fly: false });
}

// ============================================================
// Studio
// ============================================================
const ST = { el: null, renderer: null, scene: null, camera: null, controls: null, raf: 0, ro: null, root: null, stack: null, shell: null,
  bid: null, sc: null, preview: false, mode: 'strata', view: 'stack', floor: 1, gap: 4, color: 'type', model: 'ghost', sel: null,
  planId: null, planLevel: null, planView: 'floor', planObj: null, room: null, meshes: [], hover: null, origin: null, auto: false };

function s3dLocal(ring, origin) {
  const o = maplibregl.MercatorCoordinate.fromLngLat(origin, 0), s = o.meterInMercatorCoordinateUnits();
  const pts = ring.map(([lng, lat]) => { const m = maplibregl.MercatorCoordinate.fromLngLat([lng, lat], 0); return [(m.x - o.x) / s, (m.y - o.y) / s]; });
  if (pts.length > 1 && pts[0][0] === pts[pts.length - 1][0] && pts[0][1] === pts[pts.length - 1][1]) pts.pop();
  return pts;
}
const s3dArea = pts => { let a = 0; for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; a += p[0] * q[1] - q[0] * p[1]; } return Math.abs(a / 2); };
function s3dCentroid(pts) {
  let a = 0, x = 0, z = 0;
  for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length], c = p[0] * q[1] - q[0] * p[1]; a += c; x += (p[0] + q[0]) * c; z += (p[1] + q[1]) * c; }
  return Math.abs(a) > 1e-9 ? [x / (3 * a), z / (3 * a)] : pts[0];
}
// Sutherland–Hodgman against u ≥ lo and u ≤ hi on the rotated long axis
function s3dClip(pts, lo, hi) {
  const cut = (poly, keep, at) => {
    const out = [];
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i], q = poly[(i + 1) % poly.length], ip = keep(p), iq = keep(q);
      if (ip) out.push(p);
      if (ip !== iq) { const t = (at - p[0]) / (q[0] - p[0]); out.push([at, p[1] + t * (q[1] - p[1])]); }
    }
    return out;
  };
  let r = cut(pts, p => p[0] >= lo, lo);
  if (r.length > 2) r = cut(r, p => p[0] <= hi, hi);
  return r.length > 2 ? r : null;
}
// The floor outline cut across its long axis into slices of the given area shares (sum ≤ 1)
function s3dSlices(pts, shares) {
  const c = s3dCentroid(pts);
  let sxx = 0, szz = 0, sxz = 0;
  for (const [x, z] of pts) { const dx = x - c[0], dz = z - c[1]; sxx += dx * dx; szz += dz * dz; sxz += dx * dz; }
  const th = 0.5 * Math.atan2(2 * sxz, sxx - szz), cs = Math.cos(th), sn = Math.sin(th);
  const rot = pts.map(([x, z]) => [(x - c[0]) * cs + (z - c[1]) * sn, -(x - c[0]) * sn + (z - c[1]) * cs]);
  const back = ([u, v]) => [c[0] + u * cs - v * sn, c[1] + u * sn + v * cs];
  const us = rot.map(p => p[0]), umin = Math.min(...us), umax = Math.max(...us), total = s3dArea(rot);
  const areaTo = u => { const r = s3dClip(rot, umin - 1, u); return r ? s3dArea(r) : 0; };
  const out = [];
  let acc = 0, prev = umin;
  shares.forEach((sh, i) => {
    acc += sh;
    let at = umax;
    if (i < shares.length - 1 || acc < 0.999) {
      let lo = prev, hi = umax;
      for (let k = 0; k < 40; k++) { const mid = (lo + hi) / 2; if (areaTo(mid) < acc * total) lo = mid; else hi = mid; }
      at = (lo + hi) / 2;
    }
    const r = s3dClip(rot, prev, at);
    out.push(r ? r.map(back) : null);
    prev = at;
  });
  return out;
}
function s3dPlate(pts, bottom, depth, material) {
  const sh = new THREE.Shape();
  pts.forEach(([x, z], i) => (i ? sh.lineTo(x, -z) : sh.moveTo(x, -z)));
  sh.closePath();
  const g = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: false, steps: 1, curveSegments: 1 });
  g.rotateX(-Math.PI / 2);
  g.translate(0, bottom, 0);
  return new THREE.Mesh(g, material);
}
function s3dEdges(mesh, color, opacity) {
  const l = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry, 25), new THREE.LineBasicMaterial({ color, transparent: true, opacity }));
  l.userData.edge = true;
  return l;
}

// The scheme in the studio: the saved one, or a preview from the building's estimated floors
function s3dScheme(bid) {
  const saved = STRATA.s.schemes[bid];
  if (saved && saved.parcels.length) return { sc: saved, preview: false };
  const f = strataBuilding(bid), p = f ? f.properties : {};
  const floors = num(saved && saved.bim.tingkat) || num(p.tingkat_est) || 1, area = num(p.area_m2) || 100;
  const kind = String(p.kind || '');
  const type = saved ? saved.kompleks.jenis : isDp(bid) ? (/resid|house|soho|faceted|slab|curved|hillside|apart/.test(kind) ? 'pangsapuri' : /mall|retail|hextar/.test(kind) ? 'runcit' : 'pejabat')
    : p.kawasan === 'tk' ? 'industri' : 'kedai';
  const per = Math.max(1, Math.min(12, Math.round(area * STRATA_NET / (type === 'kedai' ? 140 : type === 'industri' ? 400 : 110))));
  const parcels = strataGenParcels(floors, per, area, type).map((x, i) => ({ ...x, id: 'pv' + i }));
  const sc = saved ? { ...saved, parcels } : { bid, no: 'Preview', nama: p.nama || 'Building ' + (p.plus_code || bid), parcels, kompleks: { jenis: type, aircond: false, lif: floors > 4 },
    bim: { tingkat: String(floors), tinggi: p.tinggi_m ? String(p.tinggi_m) : '' }, bld: { area_m2: area }, caj: { kadar: '0.30' }, votes: {}, bills: {}, app: { stage: 'draf' } };
  return { sc, preview: true };
}
function s3dFloors(sc) { return Math.max(1, Math.floor(num(sc.bim.tingkat) || Math.max(1, ...sc.parcels.map(x => num(x.tingkat))))); }

function strata3dOpen(opts = {}) {
  return s3dLoad().catch(() => {}).then(() => {
    s3dStudioDom();
    if (MPK.popup) { MPK.popup.remove(); MPK.popup = null; }
    ST.bid = opts.bid != null ? String(opts.bid) : null;
    ST.sel = null; ST.room = null;
    const f = ST.bid ? strataBuilding(ST.bid) : null, p = f ? f.properties : {};
    ST.planId = opts.planId || p.plan || null;
    ST.mode = opts.mode || (ST.bid ? 'strata' : 'plan');
    if (ST.mode === 'plan' && !ST.planId) ST.mode = 'strata';
    ST.model = isDp(ST.bid || '') ? 'ghost' : 'box';
    ST.view = 'stack';
    ST.el.hidden = false;
    document.body.classList.add('s3d-open');
    s3dStart();
    return ST.mode === 'plan' ? s3dShowPlan(ST.planId) : s3dShowStrata();
  });
}
function strata3dClose() {
  if (!ST.el || ST.el.hidden) return;
  ST.el.hidden = true;
  document.body.classList.remove('s3d-open');
  cancelAnimationFrame(ST.raf); ST.raf = 0;
}
function s3dStudioDom() {
  if (ST.el) return;
  const el = document.createElement('section');
  el.id = 's3d-studio';
  el.className = 's3d-studio';
  el.setAttribute('aria-label', 'Strata 3D studio');
  el.hidden = true;
  el.innerHTML = `<header class="s3d-head">
      <button type="button" class="mpk-btn ghost" onclick="strata3dClose()">← Back</button>
      <div class="s3d-head-t"><h2 id="s3d-title">Strata 3D</h2><p id="s3d-sub"></p></div>
      <div class="strata-seg s3d-modes" id="s3d-modes" role="tablist"></div>
      <button type="button" class="mpk-dpb-x" onclick="strata3dClose()" aria-label="Close">×</button>
    </header>
    <div class="s3d-main"><aside class="s3d-side" id="s3d-side"></aside>
      <div class="s3d-view" id="s3d-view"><div class="s3d-tip" id="s3d-tip" hidden></div><div class="s3d-card" id="s3d-card" hidden></div>
        <div class="s3d-legend" id="s3d-legend"></div>
        <div class="s3d-tools">
          <button type="button" onclick="S3DUI.cam('iso')" title="Perspective">◩</button><button type="button" onclick="S3DUI.cam('front')" title="Front">▭</button>
          <button type="button" onclick="S3DUI.cam('top')" title="Top">▣</button><button type="button" id="s3d-auto" onclick="S3DUI.auto()" title="Rotate">⟳</button>
          <button type="button" onclick="S3DUI.png()" title="Save image">⤓</button></div>
        <div class="s3d-busy" id="s3d-busy" hidden></div></div></div>`;
  document.getElementById('mapWrapper').appendChild(el);
  el.addEventListener('keydown', e => { if (e.key === 'Escape') strata3dClose(); });
  ST.el = el;
  const view = el.querySelector('#s3d-view');
  ST.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  ST.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  ST.renderer.localClippingEnabled = true;
  view.prepend(ST.renderer.domElement);
  ST.scene = new THREE.Scene();
  ST.scene.background = new THREE.Color(0xe9edf2);
  s3dLights(ST.scene);
  ST.camera = new THREE.PerspectiveCamera(40, 1, 0.5, 6000);
  ST.controls = new OrbitControls(ST.camera, ST.renderer.domElement);
  ST.controls.enableDamping = true;
  ST.controls.maxPolarAngle = Math.PI * 0.495;
  const ground = new THREE.Mesh(new THREE.CircleGeometry(900, 64), new THREE.MeshStandardMaterial({ color: 0xdfe5ea, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -0.05;
  const grid = new THREE.GridHelper(600, 60, 0xc5ced8, 0xd3dae2);
  grid.position.y = -0.03;
  ST.scene.add(ground, grid);
  ST.root = new THREE.Group();
  ST.scene.add(ST.root);
  ST.ro = new ResizeObserver(() => s3dResize());
  ST.ro.observe(view);
  const ray = new THREE.Raycaster(), ptr = new THREE.Vector2();
  const hit = e => {
    const r = ST.renderer.domElement.getBoundingClientRect();
    ptr.set((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1);
    ray.setFromCamera(ptr, ST.camera);
    const objs = ST.meshes.filter(m => m.visible && s3dShown(m));
    const h = ray.intersectObjects(objs, false).find(x => !ST.clip || x.point.y <= ST.clip.constant + 0.01 || !x.object.userData.clipped);
    return h ? h.object : null;
  };
  let down = null;
  ST.renderer.domElement.addEventListener('pointerdown', e => { down = [e.clientX, e.clientY]; });
  ST.renderer.domElement.addEventListener('pointerup', e => {
    if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5) return;
    const o = hit(e);
    if (ST.mode === 'strata') S3DUI.pick(o && o.userData.pid ? o.userData.pid : null);
    else S3DUI.room(o ? s3dRoomOf(o) : null);
  });
  ST.renderer.domElement.addEventListener('pointermove', e => {
    const o = hit(e), tip = document.getElementById('s3d-tip');
    const t = o ? (ST.mode === 'strata' ? o.userData.tip : (s3dRoomOf(o) || {}).userData?.label) : null;
    tip.hidden = !t;
    if (t) { const r = ST.renderer.domElement.getBoundingClientRect(); tip.textContent = t; tip.style.left = (e.clientX - r.left + 14) + 'px'; tip.style.top = (e.clientY - r.top + 10) + 'px'; }
    ST.renderer.domElement.style.cursor = o ? 'pointer' : 'grab';
  });
}
const s3dShown = o => { for (let x = o; x; x = x.parent) if (!x.visible) return false; return true; };
function s3dResize() {
  const v = document.getElementById('s3d-view');
  if (!v || !v.clientWidth) return;
  ST.renderer.setSize(v.clientWidth, v.clientHeight, false);
  ST.camera.aspect = v.clientWidth / v.clientHeight;
  ST.camera.updateProjectionMatrix();
}
function s3dStart() {
  s3dResize();
  if (ST.raf) return;
  const loop = () => {
    ST.raf = requestAnimationFrame(loop);
    ST.controls.autoRotate = ST.auto;
    ST.controls.update();
    ST.renderer.render(ST.scene, ST.camera);
  };
  loop();
}
function s3dClear() {
  for (const c of [...ST.root.children]) {
    ST.root.remove(c);
    c.traverse(o => { if (o.userData.own) { o.geometry && o.geometry.dispose(); } });
  }
  ST.meshes = []; ST.stack = null; ST.shell = null; ST.planObj = null; ST.clip = null;
}
function s3dBusy(t) { const b = document.getElementById('s3d-busy'); b.hidden = !t; b.textContent = t || ''; }
function s3dFrame(box, dir = 'iso') {
  const c = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3()), r = Math.max(size.x, size.y, size.z, 8);
  ST.controls.target.copy(c);
  const d = r * 1.55;
  const off = dir === 'top' ? new THREE.Vector3(0.001, d * 1.1, 0.001) : dir === 'front' ? new THREE.Vector3(0, size.y * 0.15, d) : new THREE.Vector3(d * 0.75, d * 0.6, d * 0.85);
  ST.camera.position.copy(c).add(off);
  ST.camera.near = Math.max(0.1, r / 200); ST.camera.far = r * 60;
  ST.camera.updateProjectionMatrix();
  ST.controls.update();
}
function s3dModes() {
  const f = ST.bid ? strataBuilding(ST.bid) : null, plans = s3dPlansFor(f);
  const m = [['strata', 'Strata stack', !!ST.bid], ['plan', 'Interior plan', plans.length > 0]].filter(x => x[2]);
  document.getElementById('s3d-modes').innerHTML = m.length > 1 ? m.map(([k, l]) =>
    `<button type="button" role="tab" aria-selected="${ST.mode === k}" class="${ST.mode === k ? 'on' : ''}" onclick="S3DUI.mode('${k}')">${l}</button>`).join('') : '';
}
function s3dPlansFor(f) {
  if (!S3D.cat) return [];
  const p = f ? f.properties : null;
  if (!p) return ST.planId ? S3D.cat.plans.filter(x => x.id === ST.planId || x.area === (dpPlan(ST.planId) || {}).area) : [];
  return S3D.cat.plans.filter(x => x.id === p.plan || (p.dp_area && x.area === p.dp_area && (x.kind !== 'unit-template' || x.id === p.plan) && x.id !== 'uzma') || (x.id === 'uzma' && p.plan === 'uzma'));
}

// ---------- Strata stack ----------
function s3dShowStrata() {
  ST.mode = 'strata';
  s3dClear();
  const f = strataBuilding(ST.bid);
  if (!f) { s3dBusy('Building not found'); return; }
  const p = f.properties, { sc, preview } = s3dScheme(ST.bid);
  ST.sc = sc; ST.preview = preview;
  if (preview && !['type', 'su'].includes(ST.color)) ST.color = 'type';
  const area = isDp(ST.bid) ? dpArea(p.dp_area) : null;
  ST.origin = area ? area.center : [p.lng, p.lat];
  const ring = f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates[0][0] : f.geometry.coordinates[0];
  const pts = s3dLocal(ring, ST.origin);
  ST.pts = pts;
  const floors = s3dFloors(sc), H = strataHeight(sc.bim) || floors * STRATA_FLOOR_M, fh = H / floors;
  ST.floors = floors; ST.fh = fh;
  ST.floor = Math.min(Math.max(1, ST.floor), floors);
  const su = strataShareUnits(sc.parcels, sc.kompleks);
  ST.su = su;
  const maxSu = Math.max(1, ...su.su);
  const floorArea = s3dArea(pts);
  const stack = new THREE.Group();
  stack.name = (sc.no || 'Strata') + ' parcels';
  const slabMat = new THREE.MeshStandardMaterial({ color: 0xb8c2cc, roughness: 0.85 });
  const commonMat = new THREE.MeshStandardMaterial({ color: 0xdde3e8, roughness: 0.9, transparent: true, opacity: 0.6 });
  for (let fl = 1; fl <= floors; fl++) {
    const g = new THREE.Group();
    g.name = 'Floor ' + fl;
    g.userData = { floor: fl, base: (fl - 1) * fh };
    const slab = s3dPlate(pts, 0, 0.3, slabMat);
    slab.userData = { own: true, slab: true, floor: fl };
    g.add(slab, s3dEdges(slab, 0x5f6f7f, 0.5));
    const on = sc.parcels.map((x, i) => ({ x, i })).filter(o => Math.floor(num(o.x.tingkat)) === fl);
    const sum = on.reduce((a, o) => a + num(o.x.luas), 0);
    const basis = Math.max(sum, floorArea * (sum > 0 ? 1 : 0), 1);
    let shares = on.map(o => (sum > 0 ? num(o.x.luas) / basis : 1 / on.length));
    const commonShare = Math.max(0, 1 - shares.reduce((a, b) => a + b, 0));
    const half = Math.ceil(on.length / 2);
    const order = [...on.slice(0, half).map(o => ({ o })), ...(commonShare > 0.01 ? [{ common: true }] : []), ...on.slice(half).map(o => ({ o }))];
    shares = order.map(r => (r.common ? commonShare : (sum > 0 ? num(r.o.x.luas) / basis : (1 - commonShare) / on.length)));
    const parts = order.length ? s3dSlices(pts, shares) : [];
    const ph = Math.max(0.6, fh * 0.84 - 0.3);
    order.forEach((r, k) => {
      const poly = parts[k];
      if (!poly) return;
      if (r.common) {
        const m = s3dPlate(poly, 0.3, ph * 0.12, commonMat);
        m.userData = { own: true, common: true, floor: fl, tip: `Common property · Floor ${fl}` };
        g.add(m);
        return;
      }
      const x = r.o.x, i = r.o.i;
      const mat = new THREE.MeshStandardMaterial({ color: s3dParcelColor(sc, x, i, maxSu), roughness: 0.55, metalness: 0.05, transparent: true, opacity: 0.94 });
      const m = s3dPlate(poly, 0.3, ph, mat);
      m.scale.set(0.985, 1, 0.985);
      const cc = s3dCentroid(poly);
      m.position.set(cc[0] * 0.015, 0, cc[1] * 0.015);
      m.userData = { own: true, pid: x.id, idx: i, floor: fl, tip: `${x.petak} · ${fmt(num(x.luas))} m² · ${fmt(su.su[i])} share units` };
      g.add(m, s3dEdges(m, 0x1e2c44, 0.55));
      ST.meshes.push(m);
    });
    stack.add(g);
  }
  // roof plate
  const roof = s3dPlate(pts, floors * fh, 0.25, slabMat);
  roof.userData = { own: true, roof: true };
  stack.add(roof);
  stack.userData = { strata: true, units: 'metres', origin: { longitude: ST.origin[0], latitude: ST.origin[1] } };
  ST.stack = stack;
  ST.root.add(stack);
  s3dShell(p, H);
  s3dLayout();
  s3dFrame(new THREE.Box3().setFromObject(stack));
  s3dModes();
  s3dHead();
  s3dStrataSide();
  s3dLegend();
  S3DUI.pick(ST.sel, true);
}
// The building around the stack: its GLB (Damansara) as glass or a cut solid, else an outline box
function s3dShell(p, H) {
  if (!isDp(ST.bid)) {
    const m = s3dPlate(ST.pts, 0, H, new THREE.MeshBasicMaterial({ visible: false }));
    m.userData.own = true;
    const box = s3dEdges(m, 0x5e35b1, 0.35);
    box.userData.box = true;
    ST.shell = new THREE.Group(); ST.shell.add(box);
    ST.root.add(ST.shell);
    return;
  }
  s3dBusy('Loading the building model…');
  s3dGltf(p.dp_area).then(g => {
    s3dBusy('');
    if (ST.mode !== 'strata' || ST.bid !== p.id) return;
    g.scene.updateMatrixWorld(true);
    const node = s3dFindNode(g.scene, p);
    if (!node) return;
    const c = node.clone(true);
    node.matrixWorld.decompose(c.position, c.quaternion, c.scale);
    c.visible = true;
    const ghost = new THREE.MeshStandardMaterial({ color: 0xd7e3f0, transparent: true, opacity: 0.2, depthWrite: false, roughness: 0.2, side: THREE.DoubleSide });
    c.traverse(o => {
      if (!o.isMesh) return;
      const src = Array.isArray(o.material) ? o.material : [o.material];
      o.userData.solid = src.map(m => { const k = m.clone(); k.clippingPlanes = []; return k; });
      o.userData.ghost = ghost;
      o.userData.clipped = true;
      o.raycast = () => {};
    });
    ST.shell = c;
    ST.root.add(c);
    s3dLayout();
  }).catch(e => s3dBusy('Model not loaded: ' + e.message));
}
function s3dParcelColor(sc, x, i, maxSu) {
  switch (ST.color) {
    case 'su': { const t = (ST.su.su[i] || 0) / maxSu; return new THREE.Color(0xede7f6).lerp(new THREE.Color(0x4527a0), Math.pow(t, 0.8)); }
    case 'owner': return x.pemilik ? 0x43a047 : 0xffb300;
    case 'vote': { const v = (sc.votes || {})[x.id] || ''; return v === 'ya' ? 0x2e7d32 : v === 'tidak' ? 0xc62828 : 0xb0bec5; }
    case 'bill': { const b = ((sc.bills || {})[STRATA.year] || {})[x.id]; return !b ? 0xb0bec5 : b.p1 && b.p2 ? 0x2e7d32 : b.p1 || b.p2 ? 0xffb300 : 0xe53935; }
    default: return STRATA_TYPE_COLOR[x.jenis] || 0x90a4ae;
  }
}
// Floors in place (stack), cut away above a floor (cut), or pulled apart (exploded); the shell follows
function s3dLayout() {
  if (!ST.stack) return;
  const sel = ST.floor, view = ST.view;
  ST.stack.children.forEach(g => {
    if (g.userData.roof) { g.visible = view !== 'cut'; g.position.y = view === 'exploded' ? ST.floors * ST.gap : 0; return; }
    const fl = g.userData.floor;
    if (!fl) return;
    g.visible = view !== 'cut' || fl <= sel;
    g.position.y = g.userData.base + (view === 'exploded' ? (fl - 1) * ST.gap : 0);
    g.traverse(o => {
      if (!o.material || o.userData.edge) return;
      const dim = view === 'cut' && fl < sel;
      if (o.userData.pid) { o.material.opacity = dim ? 0.25 : 0.94; o.material.depthWrite = !dim; }
    });
  });
  const top = sel * ST.fh - 0.05;
  ST.clip = view === 'cut' ? new THREE.Plane(new THREE.Vector3(0, -1, 0), top) : null;
  if (ST.shell) {
    const show = ST.model !== 'off' && view !== 'exploded';
    ST.shell.visible = show;
    ST.shell.traverse(o => {
      if (!o.isMesh || !o.userData.solid) return;
      const solid = ST.model === 'solid';
      o.material = solid ? (o.userData.solid.length > 1 ? o.userData.solid : o.userData.solid[0]) : o.userData.ghost;
      (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { m.clippingPlanes = ST.clip && solid ? [ST.clip] : []; m.needsUpdate = true; });
    });
    if (ST.model === 'ghost' && ST.clip) ST.shell.visible = false;
  }
}
function s3dHead() {
  const f = ST.bid && strataBuilding(ST.bid), p = f ? f.properties : {};
  const sc = ST.sc, area = p.dp_area ? dpArea(p.dp_area) : null;
  document.getElementById('s3d-title').textContent = ST.mode === 'plan' && !ST.bid ? (dpPlan(ST.planId) || {}).label || 'Interior plan'
    : (sc && !ST.preview ? sc.no + ' · ' + sc.nama : (p.nama || 'Building ' + (p.plus_code || '')));
  document.getElementById('s3d-sub').textContent = [p.plus_code, area ? s3dAreaLabel(area) : (MPK_AREAS[p.kawasan] || {}).name,
    p.area_m2 ? fmt(p.area_m2) + ' m² footprint' : '', p.tinggi_m ? p.tinggi_m + ' m' : ''].filter(Boolean).join(' · ');
}
function s3dStrataSide() {
  const sc = ST.sc, su = ST.su, floors = ST.floors;
  const st = !ST.preview ? STRATA_STAGES[strataStageIdx(sc)] : null;
  const perFloor = Array.from({ length: floors }, (_, i) => {
    const on = sc.parcels.map((x, k) => ({ x, k })).filter(o => Math.floor(num(o.x.tingkat)) === i + 1);
    return { n: on.length, su: on.reduce((a, o) => a + su.su[o.k], 0), area: on.reduce((a, o) => a + num(o.x.luas), 0) };
  });
  const seg = (name, cur, opts, fn) => `<div class="strata-seg small" role="radiogroup" aria-label="${name}">${opts.map(([k, l]) =>
    `<button type="button" role="radio" aria-checked="${cur === k}" class="${cur === k ? 'on' : ''}" onclick="S3DUI.${fn}('${k}')">${l}</button>`).join('')}</div>`;
  const dp = isDp(ST.bid);
  document.getElementById('s3d-side').innerHTML = `
    ${ST.preview ? `<div class="s3d-preview"><b>Preview</b><span>${fmt(sc.parcels.length)} parcels estimated from ${floors} floor${floors > 1 ? 's' : ''} and the footprint. Start a scheme to record the real parcels.</span>
      <button type="button" class="mpk-btn" onclick='S3DUI.scheme()'>${STRATA.s.schemes[ST.bid] ? 'Create parcels in Step 2' : 'Start strata scheme'}</button></div>`
      : `<div class="s3d-sum"><span class="strata-badge" style="--c:${st.color}">${esc(st.label)}</span>
      <div class="s3d-kpis"><div><b>${fmt(sc.parcels.length)}</b><span>parcels</span></div><div><b>${fmt(su.total)}</b><span>share units</span></div>
        <div><b>${floors}</b><span>floors</span></div><div><b>${fmt(strataCommon(sc))}</b><span>m² common</span></div></div>
      <button type="button" class="mpk-btn ghost strata-wide" onclick="S3DUI.scheme()">Open scheme · Step 2 parcels</button></div>`}
    <div class="s3d-group"><div class="s3d-label">View</div>${seg('View', ST.view, [['stack', 'Full stack'], ['cut', 'Cut at floor'], ['exploded', 'Exploded']], 'view')}
      ${ST.view === 'exploded' ? `<label class="s3d-range">Floor gap <output>${ST.gap} m</output><input type="range" min="1" max="15" step="0.5" value="${ST.gap}" oninput="S3DUI.gap(this.value, this)"></label>` : ''}</div>
    <div class="s3d-group"><div class="s3d-label">Colour parcels by</div>${seg('Colour', ST.color, ST.preview ? S3D_COLOR_BY.slice(0, 2) : S3D_COLOR_BY, 'color')}</div>
    <div class="s3d-group"><div class="s3d-label">${dp ? 'Building model' : 'Building outline'}</div>${seg('Model', ST.model, dp ? [['ghost', 'Glass'], ['solid', 'Solid'], ['off', 'Hide']] : [['box', 'Outline'], ['off', 'Hide']], 'model')}
      ${dp ? '<p class="s3d-hint">Solid + <b>Cut at floor</b> slices the real model at the chosen floor.</p>' : ''}</div>
    <div class="s3d-group"><div class="s3d-label">Floors <small>click to cut there</small></div>
      <div class="s3d-floors">${perFloor.map((x, i) => i + 1).reverse().map(fl => { const x = perFloor[fl - 1];
        return `<button type="button" class="${ST.floor === fl && ST.view === 'cut' ? 'on' : ''}" onclick="S3DUI.floor(${fl})"><b>${fl === 1 ? 'G' : fl}</b>
          <span>${x.n ? `${x.n} parcel${x.n > 1 ? 's' : ''} · ${fmt(x.area)} m²` : 'common / no parcels'}</span><small>${x.su ? fmt(x.su) + ' SU' : ''}</small></button>`; }).join('')}</div></div>
    <div class="s3d-group s3d-dl"><button type="button" class="mpk-btn" onclick="S3DUI.glb()">Download strata .GLB</button>
      <p class="s3d-hint">Parcels, share units and the building's location go into the GLB. Shapes split the footprint by parcel area: they show proportions, not surveyed parcel boundaries.</p></div>`;
}
function s3dLegend() {
  const el = document.getElementById('s3d-legend');
  if (ST.mode !== 'strata') { el.innerHTML = ''; return; }
  const items = ST.color === 'type' ? [...new Set(ST.sc.parcels.map(x => x.jenis))].map(t => [STRATA_TYPE_COLOR[t], (STRATA_WF1[t] || ['Other'])[0]])
    : ST.color === 'owner' ? [['#43A047', 'Owner recorded'], ['#FFB300', 'No owner yet']]
    : ST.color === 'vote' ? [['#2E7D32', 'For'], ['#C62828', 'Against'], ['#B0BEC5', 'Absent / not voted']]
    : ST.color === 'bill' ? [['#2E7D32', STRATA.year + ' paid'], ['#FFB300', 'Half paid'], ['#E53935', 'Unpaid'], ['#B0BEC5', 'No bill']]
    : null;
  el.innerHTML = items ? items.map(([c, l]) => `<span><i style="background:${c}"></i>${esc(l)}</span>`).join('') + '<span><i class="common"></i>Common property</span>'
    : '<div class="s3d-ramp"></div><div class="s3d-ramp-l"><span>fewer</span><span>share units</span><span>more</span></div>';
}

// ---------- Interior plan ----------
function s3dRoomOf(o) { for (let x = o; x; x = x.parent) if (x.userData && x.userData.role === 'room') return x; return null; }
function s3dShowPlan(planId) {
  ST.mode = 'plan';
  ST.planId = planId;
  s3dClear();
  s3dModes(); s3dHead(); s3dLegend();
  document.getElementById('s3d-card').hidden = true;
  const plan = dpPlan(planId);
  if (!plan) return;
  ST.planLevel = ST.planLevel && plan.levels.some(l => l.id === ST.planLevel) ? ST.planLevel : (plan.levels.find(l => l.plan) || plan.levels[0]).id;
  s3dPlanSide();
  s3dBusy('Loading the interior…');
  return new GLTFLoader().loadAsync(s3dAssetUrl(plan.glb)).then(g => {
    s3dBusy('');
    if (ST.mode !== 'plan' || ST.planId !== planId) return;
    const obj = g.scene;
    obj.traverse(o => {
      if (o.userData && o.userData.levelId && o.userData.baseElevation != null && !o.userData.role) o.userData.levelGroup = true;
      if (o.isMesh && o.userData.role === 'space') { o.material = o.material.clone(); o.userData.base = o.material.color.clone(); }
      if (o.isMesh && o.userData.role !== 'placeholder-envelope') ST.meshes.push(o);
    });
    ST.planObj = obj;
    ST.levels = [];
    obj.traverse(o => { if (o.userData.levelGroup) { o.userData.y0 = o.position.y; ST.levels.push(o); } });
    ST.root.add(obj);
    s3dPlanLayout(true);
  }).catch(e => s3dBusy('Interior not loaded: ' + e.message));
}
function s3dPlanLayout(frame) {
  if (!ST.planObj) return;
  const v = ST.planView, levels = ST.levels;
  levels.forEach((g, i) => {
    g.visible = v !== 'floor' || g.userData.levelId === ST.planLevel;
    g.position.y = g.userData.y0 + (v === 'exploded' ? i * ST.gap : 0);
  });
  if (frame) {
    const target = v === 'floor' ? levels.find(g => g.userData.levelId === ST.planLevel) : ST.planObj;
    if (target) s3dFrame(new THREE.Box3().setFromObject(target), v === 'floor' ? 'iso' : 'iso');
  }
}
function s3dPlanSide() {
  const plan = dpPlan(ST.planId), lv = plan.levels.find(l => l.id === ST.planLevel) || plan.levels[0];
  const f = ST.bid && strataBuilding(ST.bid), plans = s3dPlansFor(f);
  const seg = (cur, opts, fn) => `<div class="strata-seg small">${opts.map(([k, l]) => `<button type="button" class="${cur === k ? 'on' : ''}" onclick="S3DUI.${fn}('${k}')">${l}</button>`).join('')}</div>`;
  const kind = { building: 'Building floors', 'unit-template': 'Unit type (template)', 'house-template': 'House type (template)', 'floor-template': 'Partial floor plan' }[plan.kind] || plan.kind;
  document.getElementById('s3d-side').innerHTML = `
    ${plans.length > 1 ? `<div class="s3d-group"><div class="s3d-label">Plan</div><select class="s3d-select" onchange="S3DUI.plan(this.value)">${plans.map(x =>
      `<option value="${esc(x.id)}"${x.id === plan.id ? ' selected' : ''}>${esc(x.label)}</option>`).join('')}</select></div>` : ''}
    <div class="s3d-sum"><b>${esc(plan.label)}</b><span class="s3d-hint">${esc(kind)}${plan.sqft ? ' · ' + fmt(plan.sqft) + ' sq ft published' : ''}</span></div>
    <div class="s3d-group"><div class="s3d-label">View</div>${seg(ST.planView, [['floor', 'Selected level'], ['stacked', 'All levels'], ['exploded', 'Exploded']], 'planView')}</div>
    <div class="s3d-group"><div class="s3d-label">Levels</div><div class="s3d-floors">${plan.levels.slice().reverse().map(l =>
      `<button type="button" class="${l.id === ST.planLevel ? 'on' : ''}" onclick='S3DUI.level(${JSON.stringify(l.id)})'><b>${esc(l.label.replace(/ ·.*$/, ''))}</b><span>${l.plan ? 'Room plan' : 'Outline only'}</span></button>`).join('')}</div></div>
    ${lv.svg ? `<div class="s3d-group"><div class="s3d-label">2D plan</div><a href="${s3dAssetUrl(lv.svg)}" target="_blank" rel="noopener"><img class="s3d-svg" src="${s3dAssetUrl(lv.svg)}" alt="Floor plan ${esc(lv.label)}"></a></div>` : ''}
    <div class="s3d-group s3d-dl"><a class="mpk-btn" href="${s3dAssetUrl(plan.glb)}" download>Download interior .GLB</a>
      ${lv.csv ? `<a class="mpk-btn ghost" href="${s3dAssetUrl(lv.csv)}" download>Room schedule .CSV</a>` : ''}
      <p class="s3d-hint">${esc(plan.scope)}</p>
      ${plan.sources.map(s => `<a class="s3d-src" href="${esc(s.url)}${s.page ? '#page=' + s.page : ''}" target="_blank" rel="noopener">${esc(s.publisher)} · ${esc(s.title)}${s.page ? ', p.' + s.page : ''} ↗</a>`).join('')}</div>`;
}

// ---------- UI handlers (onclick) ----------
const S3DUI = {
  mode(m) { if (m === 'plan') { const f = ST.bid && strataBuilding(ST.bid); s3dShowPlan(ST.planId || (s3dPlansFor(f)[0] || {}).id); } else s3dShowStrata(); },
  view(v) { ST.view = v; s3dLayout(); s3dStrataSide(); if (v === 'exploded') s3dFrame(new THREE.Box3().setFromObject(ST.stack)); },
  gap(v, el) { ST.gap = Number(v); if (el) el.previousElementSibling.textContent = v + ' m'; if (ST.mode === 'plan') s3dPlanLayout(false); else s3dLayout(); },
  color(c) { ST.color = c; s3dShowStrata(); },
  model(m) { ST.model = m; s3dLayout(); s3dStrataSide(); },
  floor(fl) { ST.floor = fl; ST.view = 'cut'; s3dLayout(); s3dStrataSide(); },
  pick(pid, keep) {
    ST.sel = pid;
    ST.meshes.forEach(m => { if (m.userData.pid && m.material.emissive) { m.material.emissive.set(m.userData.pid === pid ? 0x7e57c2 : 0x000000); m.material.emissiveIntensity = m.userData.pid === pid ? 0.55 : 0; } });
    const card = document.getElementById('s3d-card'), sc = ST.sc;
    const i = pid ? sc.parcels.findIndex(x => x.id === pid) : -1;
    if (i < 0) { card.hidden = true; return; }
    const x = sc.parcels[i], su = ST.su.su[i], ch = strataCharges(su, sc.caj && sc.caj.kadar), tax = strataTax(x, STRATA.s);
    const vote = (sc.votes || {})[x.id], bill = ((sc.bills || {})[STRATA.year] || {})[x.id];
    const row = (k, v) => v !== '' && v != null ? `<tr><th>${k}</th><td>${v}</td></tr>` : '';
    card.innerHTML = `<button type="button" class="s3d-card-x" onclick="S3DUI.pick(null)" aria-label="Close">×</button>
      <div class="s3d-card-h" style="--c:${STRATA_TYPE_COLOR[x.jenis] || '#90A4AE'}"><small>Parcel (petak)${ST.preview ? ' · preview' : ''}</small><b>${esc(x.petak)}</b></div>
      <table>${row('Floor', esc(x.tingkat))}${row('Use', esc((STRATA_WF1[x.jenis] || [''])[0]))}${row('Area', fmt(num(x.luas)) + ' m²')}
        ${row('Share units', `<b>${fmt(su)}</b> · ${ST.su.pct[i].toFixed(2)}%`)}${row('Charges', strataRM(ch.caj) + ' / month')}${row('Sinking fund', strataRM(ch.sinking) + ' / month')}
        ${row('Assessment tax', strataRM(tax) + ' / year')}${row('Owner', esc(x.pemilik) || '<i>not recorded</i>')}
        ${x.aks_no ? row('Accessory', esc(x.aks_no) + ' · ' + fmt(num(x.aks_luas)) + ' m²') : ''}
        ${!ST.preview ? row('AGM vote', vote === 'ya' ? 'For' : vote === 'tidak' ? 'Against' : '—') + row(STRATA.year + ' bill', bill ? (bill.p1 && bill.p2 ? 'Paid' : bill.p1 || bill.p2 ? 'Half paid' : 'Unpaid') : '—') : ''}</table>
      ${!ST.preview ? '<button type="button" class="mpk-btn ghost strata-wide" onclick="S3DUI.scheme()">Edit in Step 2</button>' : ''}`;
    card.hidden = false;
    if (!keep) { ST.floor = Math.floor(num(x.tingkat)) || ST.floor; }
  },
  room(o) {
    ST.meshes.forEach(m => { if (m.userData.role === 'space' && m.userData.base) { m.material.emissive.set(0x000000); m.material.emissiveIntensity = 0; } });
    const card = document.getElementById('s3d-card');
    if (!o) { card.hidden = true; return; }
    o.traverse(m => { if (m.isMesh && m.userData.role === 'space') { m.material.emissive.set(0x487c8d); m.material.emissiveIntensity = 0.45; } });
    const u = o.userData;
    card.innerHTML = `<button type="button" class="s3d-card-x" onclick="S3DUI.room(null)" aria-label="Close">×</button>
      <div class="s3d-card-h" style="--c:#487C8D"><small>Room · ${esc(u.levelId)}</small><b>${esc(u.label)}</b></div>
      <table><tr><th>Use</th><td>${esc(u.kind)}</td></tr><tr><th>Model area</th><td>${u.area ? u.area.toFixed(1) + ' m²' : '—'}</td></tr>
      ${u.printedArea ? `<tr><th>Printed area</th><td>${u.printedArea} m²</td></tr>` : ''}</table>
      <p class="s3d-hint">Room boundaries and furniture are interpreted from the published or supplied plan. Not a strata parcel.</p>`;
    card.hidden = false;
  },
  plan(id) { ST.planLevel = null; s3dShowPlan(id); },
  planView(v) { ST.planView = v; s3dPlanLayout(true); s3dPlanSide(); },
  level(id) { ST.planLevel = id; if (ST.planView === 'stacked') ST.planView = 'floor'; s3dPlanLayout(true); s3dPlanSide(); },
  cam(dir) {
    const o = ST.mode === 'plan' ? ST.planObj : ST.stack;
    if (o) s3dFrame(new THREE.Box3().setFromObject(o), dir);
  },
  auto() { ST.auto = !ST.auto; document.getElementById('s3d-auto').classList.toggle('on', ST.auto); },
  png() {
    ST.renderer.render(ST.scene, ST.camera);
    const a = document.createElement('a');
    a.href = ST.renderer.domElement.toDataURL('image/png');
    a.download = (ST.mode === 'plan' ? ST.planId : (ST.sc && ST.sc.no) || 'strata') + '-3d.png';
    a.click();
  },
  scheme() {
    const bid = ST.bid;
    strata3dClose();
    if (!STRATA.s.schemes[bid]) { strataOpen(bid); return; }
    strataOpen(bid);
    strataStep(2);
  },
  glb() {
    if (!ST.stack) return;
    const sc = ST.sc, su = ST.su, group = ST.stack.clone(true);
    ST.stack.children.forEach((g, i) => { group.children[i].position.y = g.userData.base || 0; group.children[i].visible = true; });
    const edges = [];
    group.traverse(o => { if (o.userData.edge) edges.push(o); });
    edges.forEach(o => o.parent.remove(o));
    const f = strataBuilding(ST.bid), p = f ? f.properties : {};
    group.userData = { name: (sc.no || 'Strata') + ' · ' + sc.nama, units: 'metres', up: '+Y', east: '+X', south: '+Z',
      coordinates: { longitude: ST.origin[0], latitude: ST.origin[1] }, building: { id: ST.bid, plus_code: p.plus_code, footprint_m2: p.area_m2 },
      preview: ST.preview, floors: ST.floors, floorHeight: ST.fh, shareUnitsTotal: su.total,
      parcels: sc.parcels.map((x, i) => ({ petak: x.petak, floor: x.tingkat, use: x.jenis, area_m2: num(x.luas), shareUnits: su.su[i], sharePct: +su.pct[i].toFixed(4), owner: x.pemilik || '' })),
      note: 'Parcel shapes split the footprint by recorded parcel area (proportional, not surveyed boundaries). Share units per Act 757 First Schedule as entered in Strata, MPK.' };
    new GLTFExporter().parseAsync(group, { binary: true }).then(buf => {
      const url = URL.createObjectURL(new Blob([buf], { type: 'model/gltf-binary' }));
      const a = document.createElement('a'); a.href = url; a.download = String(sc.no || 'strata').replace(/[^\w-]+/g, '-') + '-strata.glb'; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    }).catch(e => showToast('⚠️ GLB export failed: ' + e.message, 5000));
  },
};

Object.assign(window, { strata3dBuilding, strata3dAreaName, strata3dSync, strata3dRemove, strata3dSelectArea, strata3dSetGroup, strata3dFilter,
  strata3dPanelHtml, strata3dFocus, strata3dOnEnter, strata3dForScheme, strata3dOpen, strata3dClose, S3DUI,
  strata3dSearch, strata3dTopSearch, strata3dSearchKey, strata3dPick, strata3dToggleModels });
// Strata may already be on (restored mode) before this module ran
if (typeof STRATA !== 'undefined' && STRATA.active) strata3dOnEnter();
