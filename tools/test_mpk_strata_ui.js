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

console.log('mpk strata UI: all tests passed');
