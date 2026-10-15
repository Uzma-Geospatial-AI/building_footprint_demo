const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'mpk.js'), 'utf8');

// Keep the real renderers, revenue calculations, area selection and rate
// handlers. This DOM boundary only tracks rendered IDs, inputs and disclosures.
function setup(features = sampleFeatures()) {
  const elements = {};
  const storage = new Map();
  function isDescendant(node, parent) {
    for (let p = node.parentElement; p; p = p.parentElement) if (p === parent) return true;
    return false;
  }
  function element(id, parent = null, attributes = {}) {
    let html = '';
    const node = {
      id, parentElement: parent, attributes, textContent: '', hidden: false,
      value: attributes.value || '', open: Object.hasOwn(attributes, 'open'),
      dataset: Object.fromEntries(Object.entries(attributes).filter(([key]) => key.startsWith('data-'))
        .map(([key, value]) => [key.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase()), value])),
      style: {}, classList: { toggle() {} },
      focus() { document.activeElement = this; },
      getAttribute(name) { return this.attributes[name] ?? null; },
      querySelectorAll(selector) {
        return Object.values(elements).filter(child => isDescendant(child, this)
          && selector.includes('data-stats-section') && Object.hasOwn(child.attributes, 'data-stats-section'));
      },
      get innerHTML() { return html; },
      set innerHTML(value) {
        for (const [key, child] of Object.entries(elements)) if (isDescendant(child, this)) delete elements[key];
        html = value;
        for (const match of value.matchAll(/<([a-z][\w-]*)\b([^>]*\bid="[^"]+"[^>]*)>/gi)) {
          const attrs = {};
          for (const attr of match[2].matchAll(/([\w-]+)(?:="([^"]*)")?/g)) attrs[attr[1]] = attr[2] || '';
          element(attrs.id, this, attrs);
        }
      },
    };
    elements[id] = node;
    return node;
  }
  for (const id of ['mpk-stats-page', 'mpk-rate-fee', 'mpk-rate-cukai', 'mpk-r-fee', 'mpk-r-cukai',
    'mpk-r-total', 'mpk-rizab-card', 'mpk-hero-sub']) element(id);
  const document = {
    getElementById: id => elements[id] || null,
    querySelectorAll: selector => selector.includes('data-stats-section')
      ? elements['mpk-stats-page'].querySelectorAll(selector) : [],
  };
  const context = vm.createContext({
    document, map: null, console,
    localStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value) },
  });
  vm.runInContext(source + `
    mpkRender = () => {
      MPK.lastStats = mpkStats(MPK.data.buildings.features, MPK.settings, MPK.rates, MPK.area);
      mpkRenderStats();
    };
    globalThis.ui = { state: MPK, render: mpkRenderStats, revenue: mpkRenderStatsRevenue,
      setYears: mpkSetStatsYears, setRates: mpkOnStatsRate, selectArea: mpkSelectArea,
      areaFeatures: mpkAreaFeatures, calculate: mpkRevenue, money: mpkRM, count: mpkNum };
  `, context, { filename: 'mpk.js' });
  const ui = context.ui;
  Object.assign(ui.state, { page: 'stats', data: { buildings: { features } }, rates: { fee: 2, cukai: 6 } });
  return { ui, elements, context, storage };
}

function sampleFeatures() {
  const feature = (id, kawasan, kategori, area_m2, extra = {}) => ({ properties: {
    id, kawasan, kategori, area_m2, plus_code: `TEST-${id}`, lot: String(100 + id), dalam: true, ...extra,
  } });
  return [
    feature(1, 'tk', 'lulus', 400),
    feature(2, 'tk', 'mockup', 100),
    feature(3, 'tk', 'tiada_lot', 300),
    feature(4, 'bbc', 'koridor', 250, { jarak_jalan_m: 5 }),
    feature(5, 'bbc', 'tolak', 50),
    feature(6, 'bbc', 'tiada_pelan', 200),
  ];
}

function allHtml(elements) {
  return elements['mpk-stats-page'].innerHTML + (elements['mpk-rev-body']?.innerHTML || '');
}

function sectionHtml(elements, id) {
  const html = allHtml(elements);
  return html.match(new RegExp(`<details\\b[^>]*id="${id}"[^>]*>[\\s\\S]*?<\\/details>`))?.[0];
}

// Collapsing secondary information must leave rates, map links and exports
// available, with a concise initial view and no leaked template values.
{
  const { ui, elements } = setup();
  ui.render();
  const html = allHtml(elements);
  for (const id of ['mpk-stats-breakdown', 'mpk-stats-priority', 'mpk-stats-rates', 'mpk-stats-buildings']) {
    assert.ok(sectionHtml(elements, id), `${id} remains available`);
    assert.strictEqual(elements[id].open, false, `${id} starts collapsed`);
  }
  assert.ok(elements['mpk-srate-fee']);
  assert.ok(elements['mpk-srate-cukai']);
  assert.match(html, /onclick="mpkExportReport\(\)"/);
  assert.match(html, /onclick="mpkExportAllCSV\(\)"/);
  assert.match(sectionHtml(elements, 'mpk-stats-priority'), /mpkZoomTo\(4\)/);
  assert.match(sectionHtml(elements, 'mpk-stats-buildings'), /TEST-1/);
  assert.ok(!/undefined|NaN|Infinity/.test(html));
}

// Each area uses its own building counts and footprint-derived estimates.
// Excluding an area must exclude its buildings from the priority ranking too.
for (const [area, count, approvedCount, illegalCount, pendingCount, annual, fee] of [
  ['all', 6, 1, 3, 2, 2400, 800], ['tk', 3, 1, 1, 1, 600, 200], ['bbc', 3, 0, 2, 1, 1800, 600],
]) {
  const { ui, elements } = setup();
  ui.selectArea(area);
  const r = ui.calculate(ui.areaFeatures(), ui.state.settings, ui.state.rates, ui.state.statsYears);
  assert.strictEqual(ui.areaFeatures().length, count);
  assert.strictEqual(r.suspected.n, illegalCount);
  assert.strictEqual(r.suspected.tax, annual);
  assert.strictEqual(r.suspected.fee, fee);
  const displayedCounts = Array.from(elements['mpk-stats-page'].innerHTML.matchAll(/<div class="v">([^<]+)<\/div>/g), match => match[1]);
  assert.deepStrictEqual(displayedCounts, [count, approvedCount, illegalCount, pendingCount].map(ui.count));
  const visible = elements['mpk-rev-body'].innerHTML.split('<details')[0];
  for (const value of [annual, annual + fee, annual * 5, annual * 5 + fee]) {
    assert.ok(visible.includes(ui.money(value)), `${area}: displayed estimate ${ui.money(value)}`);
  }
  const priority = sectionHtml(elements, 'mpk-stats-priority');
  if (area === 'tk') assert.ok(!priority.includes('TEST-4'));
  if (area === 'bbc') assert.ok(!priority.includes('TEST-2'));
}

// A horizon changes the cumulative comparison, never the annual or first-year
// estimates. Invalid programmatic input cannot create an unsupported scenario.
{
  const { ui, elements } = setup();
  ui.render();
  assert.strictEqual(elements['mpk-stats-year-5'].getAttribute('aria-pressed'), 'true');
  for (const years of [1, 3, 5, 10]) {
    ui.setYears(years);
    assert.strictEqual(ui.state.statsYears, years);
    const html = elements['mpk-rev-body'].innerHTML.split('<details')[0];
    assert.strictEqual((html.match(/aria-pressed="true"/g) || []).length, 1);
    assert.strictEqual(elements[`mpk-stats-year-${years}`].getAttribute('aria-pressed'), 'true');
    for (const value of [2400, 3200, 2400 * years, 800 + 2400 * years]) {
      assert.ok(html.includes(ui.money(value)), `${years}-year view: ${ui.money(value)}`);
    }
  }
  for (const invalid of [-1, 0, 2, 1.5, 100, NaN, null, 'oops']) {
    ui.setYears(invalid);
    assert.strictEqual(ui.state.statsYears, 10, `Reject horizon ${invalid}`);
  }
}

// Editing rates updates the visible figures, persists the settings and keeps
// the dashboard inputs in sync without closing an expanded details section.
{
  const { ui, elements, storage } = setup();
  ui.selectArea('all');
  ui.setYears(3);
  elements['mpk-stats-breakdown'].open = true;
  elements['mpk-stats-rates'].open = true;
  elements['mpk-srate-fee'].value = '3.5';
  elements['mpk-srate-cukai'].value = '7';
  ui.setRates();
  assert.deepStrictEqual(JSON.parse(storage.get(ui.state.RATES_KEY)), { fee: 3.5, cukai: 7 });
  assert.strictEqual(Number(elements['mpk-rate-fee'].value), 3.5);
  assert.strictEqual(Number(elements['mpk-rate-cukai'].value), 7);
  assert.strictEqual(elements['mpk-r-fee'].textContent, ui.money(1400));
  assert.strictEqual(elements['mpk-r-total'].textContent, ui.money(4200));
  const html = elements['mpk-rev-body'].innerHTML.split('<details')[0];
  for (const value of [2800, 4200, 8400, 9800]) assert.ok(html.includes(ui.money(value)));
  assert.strictEqual(ui.state.statsYears, 3);
  assert.strictEqual(elements['mpk-stats-breakdown'].open, true);
  assert.strictEqual(elements['mpk-stats-rates'].open, true);
  ui.selectArea('tk');
  assert.strictEqual(ui.state.statsYears, 3);
  assert.strictEqual(elements['mpk-stats-breakdown'].open, true);
  assert.strictEqual(elements['mpk-stats-rates'].open, true);
}

// Empty scope and zero rates must both render finite, usable zero estimates.
for (const features of [[], sampleFeatures().filter(f => f.properties.kategori === 'lulus')]) {
  const { ui, elements } = setup(features);
  ui.render();
  const html = allHtml(elements);
  assert.ok(html.includes(ui.money(0)));
  assert.ok(!/NaN|Infinity|undefined/.test(html));
  assert.ok(elements['mpk-srate-fee']);
  assert.ok(elements['mpk-srate-cukai']);
  assert.match(html, /mpkExportReport\(\)/);
}
{
  const { ui, elements } = setup();
  ui.state.rates = { fee: 0, cukai: 0 };
  ui.render();
  ui.setYears(10);
  assert.ok(!/NaN|Infinity|undefined/.test(allHtml(elements)));
  assert.ok(elements['mpk-rev-body'].innerHTML.includes(ui.money(0)));
}

console.log('mpk statistics UI: all tests passed');
