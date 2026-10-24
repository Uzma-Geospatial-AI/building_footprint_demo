const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

// Exercise the browser handlers with a small DOM boundary; keep the actual
// parcel generation, scheme mutations, HTML rendering and navigation functions.
const source = fs.readFileSync(path.join(__dirname, '..', 'mpk-strata.js'), 'utf8');
const escapeHtml = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function numberInput(value) {
  return {
    value: String(value),
    checkValidity() { const n = Number(this.value); return this.value !== '' && Number.isFinite(n) && Number.isInteger(n) && n >= 1; },
    reportValidity() { return this.checkValidity(); },
  };
}
function setup() {
  const elements = {
    'strata-gf': numberInput(2), 'strata-gu': numberInput(2),
    'strata-gen-preview': { textContent: '' }, 'strata-gen-btn': { disabled: false },
    'strata-ws': { hidden: false, innerHTML: '', scrollTop: 0 },
  };
  const calls = { changed: [], confirmations: [], toasts: [], renderedSteps: [] };
  const context = vm.createContext({
    document: { getElementById: id => elements[id] || null },
    mpkEscHtml: escapeHtml, mpkNum: n => Number(n).toLocaleString('en-MY'), mpkPlanDateLabel: d => d,
    MPK: { popup: null }, MPK_AREAS: {}, map: { jumpTo() {} },
    confirm: message => { calls.confirmations.push(message); return calls.acceptReplacement !== false; },
    showToast: message => calls.toasts.push(message),
    recordChange: rerender => calls.changed.push(rerender),
    recordRender: step => calls.renderedSteps.push(step),
    recordTool: html => { calls.toolHtml = html; },
  });
  vm.runInContext(source + `
    const renderWorkspace = strataRenderWs;
    strataBuilding = () => null;
    strataChanged = rerender => recordChange(rerender);
    strataRenderWs = () => recordRender(STRATA.step);
    strataToolShell = (title, subtitle, html) => recordTool(html);
    strataCloseTool = () => {};
    globalThis.ui = { state: STRATA, blank: strataBlank, normalise: strataNormalise, generate: strataGen,
      preview: strataGenPreview, step2: strataStep2, common: strataCommon,
      radar: strataRadar, open: strataOpen, render: renderWorkspace };
  `, context, { filename: 'mpk-strata.js' });
  const ui = context.ui;
  const scheme = ui.normalise({
    bid: 'A', no: 'STR/2026/0001', nama: 'Existing scheme', created: '2026-01-01', updated: '2026-01-01',
    bld: { area_m2: 200, plus_code: 'TEST', kawasan: 'tk' },
    bim: { tingkat: '2', tinggi: '7', lod: 200 }, kompleks: { jenis: 'pangsapuri', aircond: false, lif: true },
    parcels: [], common: '', app: {},
  });
  ui.state.s = ui.blank();
  ui.state.s.schemes.A = scheme;
  ui.state.cur = 'A';
  return { ui, scheme, elements, calls, context };
}

// A changed floor count must be reflected in both the created parcels and the
// model used by common-area calculations and the floor preview.
{
  const { ui, scheme, elements, calls } = setup();
  elements['strata-gf'].value = '3';
  elements['strata-gu'].value = '2';
  ui.generate();
  assert.strictEqual(scheme.parcels.length, 6);
  assert.strictEqual(scheme.bim.tingkat, '3');
  assert.deepStrictEqual(Array.from(scheme.parcels, p => p.tingkat), ['1', '1', '2', '2', '3', '3']);
  assert.strictEqual(ui.common(scheme), 90);
  assert.match(ui.step2(scheme), /Floor 3/);
  assert.strictEqual(new Set(scheme.parcels.map(p => p.id)).size, 6);
  assert.strictEqual(calls.confirmations.length, 0);
  assert.strictEqual(calls.changed.length, 1);
}

// Cancelling replacement must preserve all existing parcel and model details.
{
  const { ui, scheme, elements, calls } = setup();
  ui.generate();
  Object.assign(scheme.parcels[0], { pemilik: 'Existing owner', luas: '76', aks_no: 'P-19', aks_luas: '12', wf2: 'dengan' });
  const before = JSON.stringify(scheme);
  calls.changed.length = 0;
  calls.acceptReplacement = false;
  elements['strata-gf'].value = '4';
  elements['strata-gu'].value = '3';
  ui.generate();
  assert.strictEqual(JSON.stringify(scheme), before);
  assert.strictEqual(calls.changed.length, 0);
  assert.strictEqual(calls.confirmations.length, 1);
  assert.match(calls.confirmations[0], /owner|accessory/i);
}

// Invalid counts must neither create parcels nor reset a previously saved
// scheme, even if the action is called directly instead of through its button.
for (const [floors, units] of [['', '2'], ['0', '2'], ['-1', '2'], ['1.5', '2'], ['abc', '2'], ['2', ''], ['2', '0'], ['2', '1.5']]) {
  const { ui, scheme, elements, calls } = setup();
  ui.generate();
  const before = JSON.stringify(scheme);
  calls.changed.length = 0;
  elements['strata-gf'].value = floors;
  elements['strata-gu'].value = units;
  ui.preview();
  assert.strictEqual(elements['strata-gen-btn'].disabled, true, `${floors} floors / ${units} units must be rejected`);
  ui.generate();
  assert.strictEqual(JSON.stringify(scheme), before);
  assert.strictEqual(calls.changed.length, 0);
  assert.strictEqual(calls.confirmations.length, 0);
  assert.match(elements['strata-gen-preview'].textContent, /whole number/i);
}

// Simplifying the form must keep saved owner/accessory details editable and
// safely escaped. Technical fields belong in optional sections, not the basic table.
{
  const { ui, scheme } = setup();
  const empty = ui.step2(scheme);
  assert.match(empty, /No parcels added yet/);
  assert.match(empty, /Create parcels/);
  ui.generate();
  Object.assign(scheme.parcels[0], { pemilik: 'A & B "Owners"', luas: '1,200.50', aks_no: '<Parking 1>', aks_luas: '12', wf2: 'dengan' });
  const html = ui.step2(scheme);
  const basic = html.match(/<table\b[^>]*class="[^"]*strata-parcel-table[^"]*"[\s\S]*?<\/table>/)?.[0];
  const extras = html.match(/<details\b[^>]*id="strata-parcel-extras"[^>]*>[\s\S]*?<\/details>/)?.[0];
  assert.ok(basic, 'Basic parcel table is available');
  assert.ok(extras, 'Accessory and whole-floor fields remain available');
  for (const field of ['petak', 'tingkat', 'luas', 'jenis', 'pemilik']) assert.ok(basic.includes(`data-key="p0.${field}"`), field);
  for (const field of ['wf2', 'aks_no', 'aks_luas', 'aks_lokasi']) {
    assert.ok(extras.includes(`data-key="p0.${field}"`), field);
    assert.ok(!basic.includes(`data-key="p0.${field}"`), `${field} stays optional`);
  }
  assert.match(basic, /A &amp; B &quot;Owners&quot;/);
  assert.match(basic, /data-key="p0\.luas"[^>]*value="1200.50"/, 'Previously accepted comma-formatted areas remain visible in number inputs');
  assert.match(extras, /&lt;Parking 1&gt;/);
  assert.ok(!/<details\b[^>]*id="strata-parcel-extras"[^>]*\sopen(?:\s|>)/.test(extras), 'Optional fields start collapsed');
  assert.match(html, /data-key="common"/);
  assert.match(html, /data-key="bim.tinggi"/);
  assert.match(html, /ground floor/i);
  const keys = Array.from(html.matchAll(/data-key="([^"]+)"/g), match => match[1]);
  assert.strictEqual(new Set(keys).size, keys.length, 'Each field has a distinct key so focus returns to the edited field');
  ui.state.details['strata-parcel-extras'] = true;
  assert.match(ui.step2(scheme), /id="strata-parcel-extras" open/);
}

// Draft counts must survive changing the building use before creation. The
// stored model should change only when the user accepts parcel generation.
{
  const { ui, scheme, elements, context } = setup();
  const input = ui.step2(scheme).match(/<input\b[^>]*id="strata-gf"[^>]*>/)?.[0];
  const oninput = input?.match(/oninput="([^"]+)"/)?.[1];
  const unitInput = ui.step2(scheme).match(/<input\b[^>]*id="strata-gu"[^>]*>/)?.[0];
  const onUnitInput = unitInput?.match(/oninput="([^"]+)"/)?.[1];
  assert.ok(oninput, 'Floor-count input updates the setup preview');
  assert.ok(onUnitInput, 'Parcel-count input updates the setup preview');
  elements['strata-gf'].value = '4';
  elements['strata-gu'].value = '3';
  context.floorInput = elements['strata-gf'];
  context.unitInput = elements['strata-gu'];
  vm.runInContext(`(function () { ${oninput} }).call(floorInput); (function () { ${onUnitInput} }).call(unitInput); strataF('kompleks.jenis', 'kedai');`, context);
  assert.match(ui.step2(scheme), /id="strata-gf"[^>]*value="4"/);
  assert.match(ui.step2(scheme), /id="strata-gu"[^>]*value="3"/);
  assert.strictEqual(scheme.bim.tingkat, '2');
  ui.generate();
  assert.strictEqual(scheme.bim.tingkat, '4');
  assert.strictEqual(scheme.parcels.length, 12);
  assert.strictEqual(scheme.parcels[0].jenis, 'kedai_bawah');
  assert.strictEqual(scheme.parcels.at(-1).jenis, 'kedai_atas');
}

// A deadline in another scheme must open the corresponding application or
// management step without losing the destination while switching schemes.
{
  const { ui, scheme, calls, context } = setup();
  ui.state.s.schemes.B = ui.normalise({ ...JSON.parse(JSON.stringify(scheme)), bid: 'B', no: 'STR/2026/0002' });
  ui.radar();
  const rows = Array.from(calls.toolHtml.matchAll(/<button\b[^>]*onclick='([^']+)'[^>]*>([\s\S]*?)<\/button>/g));
  const targetRows = rows.filter(row => row[2].includes('STR/2026/0002'));
  assert.strictEqual(targetRows.length, 3);
  for (const row of targetRows) {
    ui.state.cur = 'A';
    ui.state.step = 2;
    vm.runInContext(row[1], context);
    assert.strictEqual(ui.state.cur, 'B');
    const expected = /JMB|AGM/.test(row[2]) ? 5 : 4;
    assert.strictEqual(ui.state.step, expected, 'Deadline link opens the relevant step in the selected scheme');
    assert.strictEqual(calls.renderedSteps.at(-1), expected);
  }
}

// Render all six complete workspaces, both before and after parcel creation,
// to catch missing template dependencies and inconsistent navigation controls.
{
  const { ui, elements } = setup();
  for (const populated of [false, true]) {
    if (populated) ui.generate();
    for (let step = 1; step <= 6; step++) {
      ui.state.step = step;
      ui.render();
      const html = elements['strata-ws'].innerHTML;
      assert.ok(html.includes(`Step ${step} of 6`));
      assert.strictEqual((html.match(/aria-current="step"/g) || []).length, 1);
      assert.ok(!html.includes('undefined'), `Step ${step} does not expose missing values`);
      assert.strictEqual(html.includes('← Previous'), step > 1);
      assert.strictEqual(html.includes('Next:'), step < 6);
      if (step === 6) assert.ok(html.includes('onclick="strataPdf()"'));
    }
  }
}

// The two Damansara overviews must keep map highlights, building shortcuts,
// plans, saved-scheme counts and labels inside the selected region.
{
  const moduleSource = fs.readFileSync(path.join(__dirname, '..', 'mpk-strata3d.js'), 'utf8').replace(/^import .*;\r?$/gm, '');
  const title = { textContent: '' };
  const context = vm.createContext({
    window: {}, localStorage: { getItem() { return null; } },
    document: { getElementById: id => id === 'page-title' ? title : null },
    STRATA: { active: false, s: { schemes: {
      dp: { bld: { kawasan: 'dp:empire' } },
      md1: { bld: { kawasan: 'dp:mutiara-retail' } },
      md2: { bld: { kawasan: 'dp:mutiara-retail' } },
      mpk: { bld: { kawasan: 'tk' } },
    } } },
    MPK: { data: { buildings: { features: [{ properties: { kawasan: 'tk' } }] } } },
    strataEsc: escapeHtml,
  });
  vm.runInContext(moduleSource + `
    globalThis.ui = { state: S3D, panel: strata3dPanelHtml, data: s3dBldData, title: s3dTitle, areaName: strata3dAreaName };
  `, context, { filename: 'mpk-strata3d.js' });
  const { ui } = context;
  ui.state.cat = {
    areas: [
      { id: 'damansara', name: 'Seluruh Damansara Perdana', overview: true, includedAreaIds: ['empire'], region: 'Damansara Perdana', buildings: 1, mb: 1 },
      { id: 'mutiara', name: 'Seluruh Mutiara Damansara', overview: true, includedAreaIds: ['mutiara-retail'], region: 'Mutiara Damansara', buildings: 1, mb: 1 },
      { id: 'empire', name: 'Empire Damansara', includedAreaIds: ['empire'], region: 'Damansara Perdana', buildings: 1, mb: 1 },
      { id: 'mutiara-retail', name: 'Mutiara retail', includedAreaIds: ['mutiara-retail'], region: 'Mutiara Damansara', buildings: 1, mb: 1 },
    ],
    plans: [{ id: 'uzma', label: 'UZMA interior', area: 'empire' }, { id: 'md-test', label: 'Mutiara interior fixture', area: 'mutiara-retail' }],
    note: 'Estimated geometry', attribution: 'Footprint sources',
  };
  ui.state.fc = { type: 'FeatureCollection', features: [
    { type: 'Feature', geometry: null, properties: { id: 'dp-tower', dp_area: 'empire', nama: 'UZMA Tower', tinggi_m: 62, tingkat_est: 12 } },
    { type: 'Feature', geometry: null, properties: { id: 'dp-retail', dp_area: 'mutiara-retail', nama: 'IKEA Damansara', tinggi_m: 15, tingkat_est: 3 } },
  ] };
  ui.state.group = 'dp';
  for (const [selected, flags, ownBuilding, otherBuilding, ownPlan, otherPlan, schemes] of [
    ['mutiara', [0, 1], 'IKEA Damansara', 'UZMA Tower', 'Mutiara interior fixture', 'UZMA interior', 2],
    ['damansara', [1, 0], 'UZMA Tower', 'IKEA Damansara', 'UZMA interior', 'Mutiara interior fixture', 1],
    ['mutiara-retail', [0, 1], 'IKEA Damansara', 'UZMA Tower', 'Mutiara interior fixture', 'UZMA interior', 2],
  ]) {
    ui.state.area = selected;
    assert.deepStrictEqual(Array.from(ui.data().features, f => f.properties.on), flags, selected + ' map highlights');
    const html = ui.panel(), detail = html.slice(html.indexOf('<div class="s3d-now">'));
    assert.ok(detail.includes(ownBuilding) && !detail.includes(otherBuilding), selected + ' building shortcuts');
    assert.ok(detail.includes(ownPlan) && !detail.includes(otherPlan), selected + ' interior plans');
    const selectedCard = html.match(/<button\b[^>]*class="s3d-area on"[^>]*>[\s\S]*?<\/button>/)?.[0];
    assert.ok(selectedCard.includes(`${schemes} scheme`), selected + ' scheme count');
    assert.ok(selectedCard.includes(ownBuilding.toLowerCase()) && !selectedCard.includes(otherBuilding.toLowerCase()), selected + ' search terms');
    context.STRATA.active = true;
    ui.title();
    assert.strictEqual(title.textContent, 'Strata Titles — ' + (selected.startsWith('mutiara') ? 'Mutiara Damansara' : 'Damansara Perdana'));
  }
  assert.strictEqual(ui.areaName('dp:mutiara-retail'), 'Mutiara retail, Mutiara Damansara');
  assert.strictEqual(ui.areaName('dp:empire'), 'Empire Damansara, Damansara Perdana');
  assert.strictEqual(ui.areaName('dp:mutiara'), 'Seluruh Mutiara Damansara');
  ui.state.area = 'tk'; ui.state.group = 'mpk'; ui.title();
  assert.strictEqual(title.textContent, 'Strata Titles — MPK Kemaman');
  assert.deepStrictEqual(Array.from(ui.data().features, f => f.properties.on), [0, 0]);
  assert.match(ui.panel(), /Teluk Kalong/);
}

// Exercise actual map-loading orchestration at the renderer/network boundary.
// Deferred GLBs reproduce switching regions while the other download is pending.
async function checkRegionalModelLoading() {
  const moduleSource = fs.readFileSync(path.join(__dirname, '..', 'mpk-strata3d.js'), 'utf8').replace(/^import .*;\r?$/gm, '');
  const tick = () => new Promise(resolve => setImmediate(resolve));
  function setupMap() {
    const calls = { loads: [], renders: [], toasts: [] }, pending = new Map();
    class Matrix4 {
      constructor() { this.ops = []; }
      makeTranslation(...v) { this.ops = [['translation', ...v]]; return this; }
      makeRotationX(v) { this.ops = [['rotation', v]]; return this; }
      scale(v) { this.ops.push(['scale', v.x, v.y, v.z]); return this; }
      multiply(m) { this.ops.push(...m.ops); return this; }
      fromArray(v) { this.ops = [['projection', ...v]]; return this; }
    }
    class Scene { constructor() { this.children = []; } add(o) { this.children.push(o); } }
    class Vector3 { constructor(x, y, z) { Object.assign(this, { x, y, z }); } }
    class Renderer {
      resetState() {}
      render(scene, camera) { calls.renders.push({ scene, transform: camera.projectionMatrix.ops.map(op => [...op]) }); }
      dispose() {}
    }
    class GLTFLoader {
      loadAsync(url, progress) {
        calls.loads.push(url);
        return new Promise((resolve, reject) => pending.set(url.match(/models\/([^.]+)\.glb/)[1], { resolve, reject, progress }));
      }
    }
    const sources = new Map(), layers = new Map();
    const map = {
      getSource: id => sources.get(id), addSource: (id, source) => sources.set(id, { ...source, setData(data) { this.data = data; } }),
      getLayer: id => layers.get(id), addLayer: layer => layers.set(layer.id, layer), removeLayer: id => layers.delete(id), removeSource: id => sources.delete(id),
      triggerRepaint() {}, on() {}, fitBounds() {}, getCanvas: () => ({}),
    };
    const context = vm.createContext({
      window: {}, localStorage: { getItem() { return null; }, setItem() {} },
      document: { getElementById() { return null; }, querySelector() { return null; } },
      THREE: { Matrix4, Scene, Vector3, Camera: class {}, WebGLRenderer: Renderer, HemisphereLight: class {}, DirectionalLight: class { constructor() { this.position = { set() {} }; } } },
      GLTFLoader, map, maplibregl: { MercatorCoordinate: { fromLngLat: center => ({ x: center[0], y: center[1], z: 0, meterInMercatorCoordinateUnits: () => 0.01 }) } },
      STRATA: { active: false, s: { schemes: {} } }, MPK: { data: null },
      strataStageColor: () => '#123456', strataRenderPanel() {}, showToast: msg => calls.toasts.push(msg),
    });
    vm.runInContext(moduleSource + `
      globalThis.ui = { state: S3D, select: strata3dSelectArea, group: strata3dSetGroup, remove: strata3dRemove,
        layer: s3dCustomLayer, xray: s3dXrayHide, status: s3dMapStatus };
    `, context, { filename: 'mpk-strata3d.js' });
    const { ui } = context;
    context.STRATA.active = true;
    ui.state.cat = { areas: [
      { id: 'damansara', overview: true, includedAreaIds: ['empire'], region: 'Damansara Perdana', center: [101.61, 3.17], bounds: [[101, 3], [102, 4]], glb: 'models/damansara.glb', mb: 1 },
      { id: 'mutiara', overview: true, includedAreaIds: ['mutiara-retail'], region: 'Mutiara Damansara', center: [101.62, 3.16], bounds: [[101, 3], [102, 4]], glb: 'models/mutiara.glb', mb: 1 },
      { id: 'empire', includedAreaIds: ['empire'], center: [101.61, 3.17], glb: 'models/empire.glb', mb: 1 },
      { id: 'mutiara-retail', includedAreaIds: ['mutiara-retail'], center: [101.62, 3.16], glb: 'models/mutiara-retail.glb', mb: 1 },
    ], plans: [] };
    ui.state.fc = { type: 'FeatureCollection', features: [] };
    const nodes = {};
    function resolve(id) {
      const node = { visible: true, userData: { id: id + '-building' } };
      nodes[id] = node;
      pending.get(id).resolve({ scene: { traverse(fn) { fn(node); } } });
    }
    return { ui, context, calls, pending, map, nodes, resolve };
  }
  {
    const t = setupMap(), selected = t.ui.select('damansara', { fly: false });
    await tick();
    assert.strictEqual(t.calls.loads.length, 2, 'Selecting one region requests both overview GLBs');
    t.pending.get('mutiara').progress({ loaded: 1, total: 2 });
    t.resolve('damansara'); await tick();
    assert.strictEqual(t.ui.state.mapEntries.length, 1, 'A loaded region appears while the second is downloading');
    assert.match(t.ui.status(), /1\/2.*Mutiara Damansara 50%/);
    t.resolve('mutiara'); await selected;
    assert.deepStrictEqual(Array.from(t.ui.state.mapEntries, entry => entry.areaId), ['damansara', 'mutiara']);
    assert.strictEqual(t.ui.state.onMap.areaId, 'damansara');
    const layer = t.ui.layer(); layer.onAdd(t.map, {});
    layer.render({}, { defaultProjectionData: { mainMatrix: [1, 0, 0, 1] } });
    assert.strictEqual(t.calls.renders.length, 2, 'Both regional scenes are rendered in the same frame');
    assert.deepStrictEqual(t.calls.renders.map(r => r.transform.find(op => op[0] === 'translation').slice(1)), [[101.61, 3.17, 0], [101.62, 3.16, 0]], 'Each overview uses its own geographic origin');
    await t.ui.select('empire', { fly: false });
    assert.strictEqual(t.calls.loads.length, 2, 'Leaf selection reuses the overview cache without duplicating a leaf GLB');
    assert.strictEqual(t.ui.state.mapEntries.length, 2);
    assert.strictEqual(t.ui.state.onMap.areaId, 'empire');
    assert.strictEqual(t.ui.state.onMap.modelAreaId, 'damansara');
    t.ui.state.byId.set('dp-md', { properties: { src_id: 'mutiara-building' } });
    t.context.STRATA.s.schemes.md = { bid: 'dp-md' };
    t.context.STRATA.cur = 'md'; t.context.STRATA.xray = true;
    t.ui.xray();
    assert.strictEqual(t.nodes.mutiara.visible, false, 'X-ray finds a building in the other regional entry');
    t.context.STRATA.xray = false; t.ui.xray();
    assert.strictEqual(t.nodes.mutiara.visible, true);
    await t.ui.group('mpk');
    assert.strictEqual(t.ui.state.mapEntries.length, 0);
    assert.strictEqual(t.ui.state.onMap, null);
    layer.render({}, [1, 0, 0, 1]);
    assert.strictEqual(t.calls.renders.length, 2, 'MPK selection does not render Damansara models');
    await t.ui.group('dp');
    assert.strictEqual(t.ui.state.mapEntries.length, 2, 'Returning to the Damansara group restores both regional models');
    assert.strictEqual(t.calls.loads.length, 2, 'Returning uses already cached GLBs');
  }
  {
    const t = setupMap(), first = t.ui.select('damansara', { fly: false });
    await tick();
    const second = t.ui.select('mutiara-retail', { fly: false }); await tick();
    t.resolve('damansara'); t.resolve('mutiara'); await Promise.all([first, second]);
    assert.strictEqual(t.calls.loads.length, 2, 'Concurrent selections share pending overview downloads');
    assert.strictEqual(t.ui.state.onMap.areaId, 'mutiara-retail', 'Stale selection cannot replace the latest selected area');
    assert.strictEqual(t.ui.state.onMap.modelAreaId, 'mutiara');
    assert.strictEqual(t.ui.state.mapEntries.length, 2, 'Racing selections cannot duplicate map entries');
  }
  for (const leave of ['mpk', 'remove']) {
    const t = setupMap(), loading = t.ui.select('damansara', { fly: false });
    await tick();
    if (leave === 'mpk') await t.ui.select('tk', { fly: false }); else t.ui.remove();
    t.resolve('damansara'); t.resolve('mutiara'); await loading;
    assert.strictEqual(t.ui.state.onMap, null, leave + ': pending downloads cannot restore a closed map');
    assert.strictEqual(t.ui.state.mapEntries.length, 0);
  }
  {
    const t = setupMap(), loading = t.ui.select('damansara', { fly: false });
    await tick(); t.resolve('damansara'); t.pending.get('mutiara').reject(new Error('Network interrupted')); await loading;
    assert.strictEqual(t.ui.state.mapEntries.length, 1, 'One failed download does not hide the successful regional model');
    assert.match(t.ui.status(), /1\/2.*Mutiara Damansara failed/);
    assert.match(t.calls.toasts[0], /Mutiara Damansara.*Network interrupted/);
    const retry = t.ui.select('empire', { fly: false }); await tick();
    assert.strictEqual(t.calls.loads.length, 3, 'Retry downloads only the failed regional model');
    t.resolve('mutiara'); await retry;
    assert.strictEqual(t.ui.state.mapEntries.length, 2);
    assert.match(t.ui.status(), /Damansara Perdana \+ Mutiara Damansara 3D on the map/);
  }
}

checkRegionalModelLoading().then(() => console.log('mpk strata UI: all tests passed')).catch(error => { console.error(error); process.exitCode = 1; });
