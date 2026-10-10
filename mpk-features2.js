// ============================================================
// MPK KEMAMAN — FEATURES 12–15
//   hex        3D Hex Density   suspected footprint per 150 m hexagon, as rising 3D columns
//   radius     Impact Radius    a circle that follows the mouse; live counts inside it
//   lens       Time Lens        a round lens that shows an old satellite photo under the cursor
//   planner    Inspection Planner  suspected cases into a day-by-day site-visit schedule per team
// Pure logic is exported for tools/test_mpk_features2.js. Loaded after mpk-gesture.js.
// ============================================================

// ---------- Pure: hexagon binning (pointy-top, size = centre-to-corner in metres) ----------
function mpkHexKey(lng, lat, size, origin) {
  const [kx, ky] = [111320 * Math.cos(origin[1] * Math.PI / 180), 111320];
  const x = (lng - origin[0]) * kx, y = (lat - origin[1]) * ky;
  const q = (Math.sqrt(3) / 3 * x - y / 3) / size, r = (2 / 3 * y) / size;
  // cube rounding
  let rx = Math.round(q), rz = Math.round(r), ry = Math.round(-q - r);
  const dx = Math.abs(rx - q), dz = Math.abs(rz - r), dy = Math.abs(ry + q + r);
  if (dx > dy && dx > dz) rx = -ry - rz; else if (dy <= dz) rz = -rx - ry;
  return [rx, rz];
}

function mpkHexPolygon(q, r, size, origin) {
  const [kx, ky] = [111320 * Math.cos(origin[1] * Math.PI / 180), 111320];
  const cx = size * Math.sqrt(3) * (q + r / 2), cy = size * 1.5 * r;
  const ring = [];
  for (let i = 0; i <= 6; i++) {
    const a = Math.PI / 180 * (60 * (i % 6) - 30);
    ring.push([origin[0] + (cx + size * Math.cos(a)) / kx, origin[1] + (cy + size * Math.sin(a)) / ky]);
  }
  return { center: [origin[0] + cx / kx, origin[1] + cy / ky], ring };
}

// Buildings into hexagons: [{ q, r, n, sus, susM2, m2, share, center, ring }] (hexes with buildings only)
function mpkHexBins(features, s, size = 150) {
  if (!features.length) return [];
  const origin = [features[0].properties.lng, features[0].properties.lat];
  const bins = new Map();
  for (const f of features) {
    const p = f.properties, [q, r] = mpkHexKey(p.lng, p.lat, size, origin), k = q + ',' + r;
    let b = bins.get(k);
    if (!b) bins.set(k, b = { q, r, n: 0, sus: 0, susM2: 0, m2: 0 });
    b.n++; b.m2 += p.area_m2;
    if (mpkJenis(p, s)) { b.sus++; b.susM2 += p.area_m2; }
  }
  return [...bins.values()].map(b => ({ ...b, share: b.sus / b.n, ...mpkHexPolygon(b.q, b.r, size, origin) }));
}

// ---------- Pure: what lies within R metres of a point ----------
function mpkWithin(features, center, radius, s) {
  const out = { n: 0, m2: 0, byStatus: { suspected: 0, legal: 0, unverified: 0 }, susM2: 0, ids: [], nearest: null };
  let nd = Infinity;
  const [kx, ky] = [111320 * Math.cos(center[1] * Math.PI / 180), 111320];
  for (const f of features) {
    const p = f.properties, d = Math.hypot((p.lng - center[0]) * kx, (p.lat - center[1]) * ky);
    const st = mpkStatus(p, s);
    if (st === 'suspected' && d < nd) { nd = d; out.nearest = { p, d }; }
    if (d > radius) continue;
    out.n++; out.m2 += p.area_m2; out.byStatus[st]++; out.ids.push(p.id);
    if (st === 'suspected') out.susM2 += p.area_m2;
  }
  return out;
}

// ---------- Pure: inspection planner ----------
// The next `n` working days from `start`, skipping `weekend` weekdays (Terengganu: Friday 5, Saturday 6)
function mpkWorkdays(start, n, weekend = [5, 6]) {
  const out = [], d = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  while (out.length < n) {
    if (!weekend.includes(d.getDay())) out.push(new Date(d));
    d.setDate(d.getDate() + 1);
  }
  return out;
}

// One day's visits each: seed with the most urgent case left, then add the case nearest to any
// already in the batch until `cap` (compact, follows roads and clusters), then order as a route.
// items: [{ p, score }] most urgent first
function mpkPlanBatches(items, cap) {
  const left = items.slice(), out = [], pt = x => [x.p.lng, x.p.lat];
  while (left.length) {
    const batch = [left.shift()];
    while (batch.length < cap && left.length) {
      let bi = 0, bd = Infinity;
      for (let i = 0; i < left.length; i++) {
        for (const b of batch) { const d = mpkMetres(pt(b), pt(left[i])); if (d < bd) { bd = d; bi = i; } }
      }
      batch.push(left.splice(bi, 1)[0]);
    }
    out.push(mpkRouteOrder(batch.map(pt)).map(i => batch[i]));
  }
  return out;
}

// Batches handed out to teams day by day: [{ day, date, team, stops, km, hours }]
// km: straight-line route × 1.3; hours: visitMin per stop + driving at kmh
function mpkPlanSchedule(items, opts = {}) {
  const teams = opts.teams || 2, perDay = opts.perDay || 12, visitMin = opts.visitMin || 15, kmh = opts.kmh || 30;
  const batches = mpkPlanBatches(items, perDay);
  const days = mpkWorkdays(opts.start || new Date(), Math.ceil(batches.length / teams), opts.weekend);
  return batches.map((stops, i) => {
    const km = mpkPathLength(stops.map(x => [x.p.lng, x.p.lat])) * 1.3 / 1000;
    return { day: Math.floor(i / teams) + 1, date: days[Math.floor(i / teams)], team: i % teams + 1, stops, km,
             hours: (stops.length * visitMin + km / kmh * 60) / 60 };
  });
}

const mpkYMD = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');

function mpkPlanReason(p, s) {
  return mpkJenis(p, s) === 'mockup' ? 'On MPK suspect list' : `Within ${p.jarak_jalan_m} m of road centreline (reserve ${s.rizab} m)`;
}

// The schedule as CSV, one row per visit
function mpkPlanCSV(plan, s) {
  const q = v => { const t = String(v == null ? '' : v); return /[",\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t; };
  const rows = [['day', 'date', 'team', 'stop', 'plus_code', 'area', 'lot', 'upi', 'footprint_m2', 'priority', 'reason', 'lat', 'lng', 'google_maps']];
  plan.forEach(b => b.stops.forEach((x, k) => rows.push([b.day, mpkYMD(b.date), b.team, k + 1, x.p.plus_code, MPK_AREAS[x.p.kawasan].short,
    x.p.lot || '', x.p.upi || '', Math.round(x.p.area_m2), x.score, mpkPlanReason(x.p, s), x.p.lat, x.p.lng,
    `https://www.google.com/maps/search/?api=1&query=${x.p.lat},${x.p.lng}`])));
  return rows.map(r => r.map(q).join(',')).join('\n');
}

if (typeof module !== 'undefined') {
  module.exports = { mpkHexKey, mpkHexPolygon, mpkHexBins, mpkWithin, mpkWorkdays, mpkPlanBatches, mpkPlanSchedule, mpkPlanCSV, mpkYMD };
}

// ============================================================
// Browser
// ============================================================
if (typeof MPK_FEATURES !== 'undefined') {
  MPK_FEATURES.push(
    { key: 'hex', icon: '🧊', title: '3D Hex Density', tag: 'Where the illegal floor area is',
      text: 'Bins every building into 150 m hexagons and raises them as 3D columns: height = suspected floor area, colour = share of buildings that are suspected. Hover a column for its numbers.' },
    { key: 'radius', icon: '⭕', title: 'Impact Radius', tag: 'Live count around any point',
      text: 'A circle follows your mouse and counts what is inside in real time: buildings by status, suspected m², estimated fees and the nearest suspected building. Click to pin it.' },
    { key: 'lens', icon: '🔍', title: 'Time Lens', tag: 'See the past through a lens',
      text: 'Move a round lens over the latest satellite photo and see the same spot years earlier inside it. Pick the year; resize the lens. Built-up land jumps out at once.' },
    { key: 'planner', icon: '🗓️', title: 'Inspection Planner', tag: 'Day-by-day site visit schedule',
      text: 'Turns the suspected cases into a work plan: set the teams, visits per day and start date, and get each day\'s nearby cases in route order, skipping the Friday–Saturday weekend. Download the CSV or print the checklists.' },
  );
  Object.assign(MPK_FEAT_RUN, {
    hex: token => mpkHexRun(token),
    radius: token => mpkRadiusRun(token),
    lens: token => mpkLensRun(token),
    planner: token => mpkPlannerRun(token),
  });
}

// ---------- 12. 3D Hex Density ----------
function mpkHexRun(token) {
  const feats = mpkAreaFeatures(), s = MPK.settings;
  const bins = mpkHexBins(feats, s, 150);
  const maxM2 = Math.max(1, ...bins.map(b => b.susM2));
  mpkFeatSrc('mpk-feat-hex', mpkFC(bins.map((b, i) => ({ type: 'Feature', id: i,
    properties: { n: b.n, sus: b.sus, susM2: Math.round(b.susM2), m2: Math.round(b.m2), share: b.share,
                  h: 30 + 900 * Math.sqrt(b.susM2 / maxM2) },
    geometry: { type: 'Polygon', coordinates: [b.ring] } }))));
  const color = ['interpolate', ['linear'], ['get', 'share'], 0, '#B2DFDB', 0.05, '#FFE082', 0.25, '#FF8F00', 0.5, '#E53935', 1, '#6A1B1A'];
  mpkFeatLayer({ id: 'mpk-feat-hex', type: 'fill-extrusion', source: 'mpk-feat-hex',
    paint: { 'fill-extrusion-color': color, 'fill-extrusion-height': 0, 'fill-extrusion-opacity': 0.88, 'fill-extrusion-vertical-gradient': true } });
  const t0 = performance.now();
  const grow = now => {
    if (!mpkFeatAlive(token) || !map.getLayer('mpk-feat-hex')) return;
    const t = Math.min(1, (now - t0 - 900) / 1800), e = t <= 0 ? 0 : 1 - Math.pow(1 - t, 3);
    map.setPaintProperty('mpk-feat-hex', 'fill-extrusion-height', ['*', ['get', 'h'], e]);
    if (t < 1) MPK_FEAT.raf = requestAnimationFrame(grow);
  };
  MPK_FEAT.raf = requestAnimationFrame(grow);
  mpkFeatFit(MPK.bounds[MPK.area], { padding: { top: 60, bottom: 40, left: 40, right: 400 }, pitch: 55, bearing: -25, duration: 1600 });
  const top = bins.slice().sort((a, b) => b.susM2 - a.susM2).slice(0, 5);
  const hot = bins.filter(b => b.sus).length;
  MPK_FEAT.hexTop = top;
  mpkHud('3D Hex Density', `
    <div class="mpk-hud-stats"><div><b>${mpkNum(bins.length)}</b><small>hexagons with buildings</small></div>
      <div><b>${mpkNum(hot)}</b><small>with suspected</small></div><div><b>150 m</b><small>hexagon size</small></div></div>
    <div class="mpk-hud-sub" style="margin-top:10px">Height = suspected floor area · colour = share suspected</div>
    <div class="mpk-hud-ramp hex"><span>0%</span><i></i><span>100%</span></div>
    <div class="mpk-hud-sub" style="margin-top:10px"><b>Tallest columns</b></div>
    <div class="mpk-hud-list">${top.map((b, i) => `<button class="mpk-hud-item" onclick="mpkHexFly(${i})"><b>#${i + 1}</b>
      <span>${b.sus} of ${b.n} suspected</span><span class="num">${mpkNum(b.susM2)} m²</span></button>`).join('')}</div>
    <div class="mpk-hud-note" id="mpk-hex-hover">Hover a column for its numbers. Drag with the right mouse button to tilt.</div>`,
    { icon: '🧊', side: true });
  const hover = e => {
    const f = map.queryRenderedFeatures(e.point, { layers: ['mpk-feat-hex'] })[0], el = document.getElementById('mpk-hex-hover');
    if (!el) return;
    el.innerHTML = f ? `<b>${f.properties.n} buildings</b> · ${f.properties.sus} suspected (${Math.round(f.properties.share * 100)}%) · `
      + `${mpkNum(f.properties.susM2)} m² suspected of ${mpkNum(f.properties.m2)} m²` : 'Hover a column for its numbers. Drag with the right mouse button to tilt.';
    map.getCanvas().style.cursor = f ? 'pointer' : '';
  };
  map.on('mousemove', hover);
  MPK_FEAT.cleanup.push(() => { map.off('mousemove', hover); map.getCanvas().style.cursor = ''; map.easeTo({ pitch: 0, bearing: 0, duration: 600 }); });
}

function mpkHexFly(i) {
  const b = (MPK_FEAT.hexTop || [])[i];
  if (b) map.flyTo({ center: b.center, zoom: 16, pitch: 60, bearing: map.getBearing() + 30, duration: 1400 });
}

// ---------- 13. Impact Radius ----------
function mpkRadiusRun() {
  const feats = MPK.data.buildings.features, s = MPK.settings;
  const R = { r: 300, center: map.getCenter().toArray(), pinned: false };
  MPK_FEAT.radius = R;
  mpkFeatSrc('mpk-feat-rad', mpkFC([]));
  mpkFeatSrc('mpk-feat-rad-in', mpkFC([]));
  mpkFeatLayer({ id: 'mpk-feat-rad-fill', type: 'fill', source: 'mpk-feat-rad', paint: { 'fill-color': '#2979FF', 'fill-opacity': 0.08 } });
  mpkFeatLayer({ id: 'mpk-feat-rad-line', type: 'line', source: 'mpk-feat-rad', paint: { 'line-color': '#2979FF', 'line-width': 2.5, 'line-dasharray': [2, 1.2] } });
  mpkFeatLayer({ id: 'mpk-feat-rad-in', type: 'line', source: 'mpk-feat-rad-in', paint: { 'line-color': '#FFEB3B', 'line-width': 2.2 } });
  mpkFeatLayer({ id: 'mpk-feat-rad-near', type: 'circle', source: 'mpk-feat-rad', filter: ['==', ['get', 'kind'], 'near'],
    paint: { 'circle-radius': 9, 'circle-color': 'rgba(0,0,0,0)', 'circle-stroke-color': '#c62828', 'circle-stroke-width': 3 } });
  mpkHud('Impact Radius', `
    <div class="mpk-sim-top"><label for="mpk-rad-r">Radius</label><b class="mono" id="mpk-rad-rv">300 m</b></div>
    <input type="range" id="mpk-rad-r" class="mpk-range" min="100" max="1500" step="50" value="300" oninput="mpkRadiusSet(+this.value)">
    <div class="mpk-hud-stats" id="mpk-rad-stats"></div>
    <div class="mpk-rad-bar" id="mpk-rad-bar"></div>
    <div class="mpk-hud-sub" id="mpk-rad-near"></div>
    <div class="mpk-hud-note" id="mpk-rad-pin">Move the mouse over the map. Click to pin the circle, click again to free it.</div>`,
    { icon: '⭕', side: true });
  const draw = () => {
    const w = mpkWithin(feats, R.center, R.r, s);
    const ring = [];
    for (let a = 0; a <= 360; a += 6) ring.push(mpkOffset(R.center, a, R.r));
    const out = [{ type: 'Feature', properties: { kind: 'circle' }, geometry: { type: 'Polygon', coordinates: [ring] } }];
    if (w.nearest) out.push(mpkPt([w.nearest.p.lng, w.nearest.p.lat], { kind: 'near' }));
    map.getSource('mpk-feat-rad').setData(mpkFC(out));
    const ids = new Set(w.ids);
    map.getSource('mpk-feat-rad-in').setData(mpkFC(w.n > 1500 ? [] : feats.filter(f => ids.has(f.properties.id))));
    const st = document.getElementById('mpk-rad-stats');
    if (!st) return;
    st.innerHTML = `<div><b>${mpkNum(w.n)}</b><small>buildings inside</small></div>
      <div><b>${mpkNum(w.byStatus.suspected)}</b><small>suspected · ${mpkNum(w.susM2)} m²</small></div>
      <div><b>${mpkRM(w.susM2 * MPK.rates.fee)}</b><small>est. processing fee</small></div>`;
    const seg = k => w.n ? (w.byStatus[k] / w.n * 100).toFixed(1) : 0;
    document.getElementById('mpk-rad-bar').innerHTML = w.n ? Object.entries(MPK_STATUS).map(([k, v]) =>
      `<i style="width:${seg(k)}%;background:${v.color}" title="${v.label}: ${w.byStatus[k]}"></i>`).join('') : '';
    document.getElementById('mpk-rad-near').innerHTML = w.nearest
      ? `Nearest suspected: <b>${w.nearest.p.plus_code}</b>, ${mpkNum(w.nearest.d)} m away (${mpkNum(w.nearest.p.area_m2)} m²)` : '';
  };
  R.draw = draw;
  let pending = false;
  const move = e => {
    if (R.pinned || pending) return;
    pending = true;
    requestAnimationFrame(() => { pending = false; R.center = e.lngLat.toArray(); draw(); });
  };
  const click = e => {
    R.pinned = !R.pinned;
    R.center = e.lngLat.toArray();
    draw();
    const n = document.getElementById('mpk-rad-pin');
    if (n) n.textContent = R.pinned ? '📌 Pinned. Click the map to free the circle.' : 'Following the mouse. Click to pin.';
  };
  MPK_FEAT.capture = true;                           // clicks pin the circle instead of opening popups
  map.on('mousemove', move);
  map.on('click', click);
  MPK_FEAT.cleanup.push(() => { map.off('mousemove', move); map.off('click', click); });
  if (map.getZoom() < 14.5) {
    const top = mpkFeatData().hotspots[0];
    if (top) { R.center = top.center; map.flyTo({ center: top.center, zoom: 15.3, pitch: 0, bearing: 0, duration: 1200 }); }
  }
  draw();
}

function mpkRadiusSet(r) {
  const R = MPK_FEAT.radius;
  if (!R) return;
  R.r = r;
  document.getElementById('mpk-rad-rv').textContent = r >= 1000 ? (r / 1000).toFixed(r % 1000 ? 2 : 0) + ' km' : r + ' m';
  R.draw();
}

// ---------- 14. Time Lens ----------
function mpkLensRun(token) {
  const top = mpkFeatData().ranked[0];
  const area = top ? top.p.kawasan : (MPK.area === 'all' ? 'tk' : MPK.area);
  const frames = mpkTimeFrames(MPK.data.wayback && MPK.data.wayback.history, area);
  if (frames.length < 2) { mpkHud('Time Lens', 'Historical imagery index not available.', { icon: '🔍' }); return; }
  if (MPK.wayback.on) mpkHistoricOff();
  // open on the second-oldest photo when there are several: the oldest (2007) is dark and soft
  const L = { size: 260, past: frames[frames.length > 2 ? 1 : 0], now: frames[frames.length - 1], frames, x: null, y: null };
  MPK_FEAT.lens = L;
  // the latest photo on the main map, under the MPK layers
  map.addSource('mpk-feat-lens-now', { type: 'raster', tiles: [mpkWaybackTileUrl(L.now.release)], tileSize: 256, maxzoom: L.now.maxzoom });
  map.addLayer({ id: 'mpk-feat-lens-now', type: 'raster', source: 'mpk-feat-lens-now' }, mpkBottomLayer());
  MPK_FEAT.layers.push('mpk-feat-lens-now'); MPK_FEAT.sources.push('mpk-feat-lens-now');
  // the lens: a second, non-interactive map with the old photo, clipped to a circle at the cursor
  const el = document.createElement('div');
  el.id = 'mpk-lens';
  el.className = 'mpk-lens';
  el.innerHTML = '<div id="mpk-lens-map"></div><div class="mpk-lens-ring" id="mpk-lens-ring" hidden><span id="mpk-lens-tag"></span></div>';
  map.getContainer().appendChild(el);                // same box as the main map: screen points line up
  const lens = new maplibregl.Map({ container: 'mpk-lens-map', interactive: false, attributionControl: false,
    center: map.getCenter(), zoom: map.getZoom(), bearing: map.getBearing(), pitch: map.getPitch(), style: mpkLensStyle(L.past) });
  L.map = lens;
  const sync = () => lens.jumpTo({ center: map.getCenter(), zoom: map.getZoom(), bearing: map.getBearing(), pitch: map.getPitch() });
  const place = () => {
    const ring = document.getElementById('mpk-lens-ring'), m = document.getElementById('mpk-lens-map');
    if (!ring || L.x == null) return;
    const r = L.size / 2, x = L.x, y = L.y;
    m.style.clipPath = `circle(${r}px at ${x}px ${y}px)`;
    ring.style.cssText = `left:${x - r}px;top:${y - r}px;width:${L.size}px;height:${L.size}px`;
    ring.hidden = false;
  };
  const move = e => { L.x = e.point.x; L.y = e.point.y; place(); };
  map.on('move', sync);
  map.on('mousemove', move);
  MPK_FEAT.cleanup.push(() => {
    map.off('move', sync); map.off('mousemove', move);
    try { lens.remove(); } catch (e) {}
    el.remove();
  });
  L.place = place;
  const c = map.getContainer();
  L.x = c.clientWidth * 0.42; L.y = c.clientHeight * 0.55;
  if (top && map.getZoom() < 16) map.flyTo({ center: [top.p.lng, top.p.lat], zoom: 16.8, pitch: 0, bearing: 0, duration: 1400 });
  mpkLensHud();
  place();
}

// The lens map: one old photo plus today's suspected buildings as red outlines
function mpkLensStyle(frame) {
  return { version: 8,
    sources: { img: { type: 'raster', tiles: [mpkWaybackTileUrl(frame.release)], tileSize: 256, maxzoom: frame.maxzoom || 17 },
               sus: { type: 'geojson', data: mpkFC(MPK.data.buildings.features.filter(f => mpkJenis(f.properties, MPK.settings))) } },
    layers: [{ id: 'img', type: 'raster', source: 'img' },
             { id: 'sus', type: 'line', source: 'sus', paint: { 'line-color': '#FF5252', 'line-width': 1.4 } }] };
}

function mpkLensHud() {
  const L = MPK_FEAT.lens;
  const seen = new Set();
  const chips = L.frames.slice(0, -1).filter(f => !seen.has(f.capture.slice(0, 4)) && seen.add(f.capture.slice(0, 4)))
    .map(f => `<button type="button" class="${f === L.past ? 'on' : ''}" onclick="mpkLensYear(${f.release})">${f.capture.slice(0, 4)}</button>`).join('');
  mpkHud('Time Lens', `
    <div class="mpk-hud-sub">Map: <b>${mpkDayLabel(L.now.capture)}</b> · inside the lens: <b>${mpkDayLabel(L.past.capture)}</b></div>
    <div class="mpk-gest-years">${chips}</div>
    <div class="mpk-sim-top" style="margin-top:12px"><label for="mpk-lens-s">Lens size</label><b class="mono" id="mpk-lens-sv">${L.size} px</b></div>
    <input type="range" id="mpk-lens-s" class="mpk-range" min="140" max="520" step="20" value="${L.size}" oninput="mpkLensSize(+this.value)">
    <div class="mpk-hud-note">Move the mouse over the map. Red outlines = suspected buildings today.</div>`,
    { icon: '🔍', side: true });
  const tag = document.getElementById('mpk-lens-tag');
  if (tag) tag.textContent = L.past.capture.slice(0, 4);
}

function mpkLensYear(release) {
  const L = MPK_FEAT.lens;
  if (!L) return;
  L.past = L.frames.find(f => f.release === release) || L.past;
  L.map.setStyle(mpkLensStyle(L.past));
  mpkLensHud();
}

function mpkLensSize(v) {
  const L = MPK_FEAT.lens;
  if (!L) return;
  L.size = v;
  document.getElementById('mpk-lens-sv').textContent = v + ' px';
  L.place();
}

// ---------- 15. Inspection Planner ----------
const MPK_PLAN_DAYNAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const mpkPlanDate = d => `${MPK_PLAN_DAYNAMES[d.getDay()]} ${d.getDate()} ${MPK_MONTH_NAMES[d.getMonth()]}`;

function mpkPlannerRun() {
  const next = mpkWorkdays(new Date(Date.now() + 864e5), 1)[0];        // next working day
  MPK_FEAT.plan = { teams: 2, perDay: 12, start: next, sel: null, plan: [] };
  mpkFeatSrc('mpk-feat-plan-line', mpkFC([]));
  mpkFeatSrc('mpk-feat-plan-pt', mpkFC([]));
  mpkFeatLayer({ id: 'mpk-feat-plan-line', type: 'line', source: 'mpk-feat-plan-line',
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': ['case', ['get', 'sel'], '#2979FF', '#5C6B80'], 'line-width': ['case', ['get', 'sel'], 4, 1.4],
             'line-opacity': ['case', ['get', 'sel'], 0.95, 0.55] } });
  mpkFeatLayer({ id: 'mpk-feat-plan-pt', type: 'circle', source: 'mpk-feat-plan-pt',
    paint: { 'circle-color': ['case', ['get', 'sel'], '#2979FF', ['interpolate', ['linear'], ['get', 'dayf'], 0, '#0D2A4F', 1, '#9FB3C8']],
             'circle-radius': ['case', ['get', 'sel'], 11, 4.5], 'circle-stroke-color': '#fff', 'circle-stroke-width': ['case', ['get', 'sel'], 2.5, 1] } });
  mpkFeatLayer({ id: 'mpk-feat-plan-n', type: 'symbol', source: 'mpk-feat-plan-pt', filter: ['get', 'sel'],
    layout: { 'text-field': ['get', 'n'], 'text-font': ['Noto Sans Regular'], 'text-size': 11.5, 'text-allow-overlap': true },
    paint: { 'text-color': '#fff' } });
  mpkPlannerHud();
  mpkPlannerBuild();
  mpkFeatFit(MPK.bounds[MPK.area], { padding: { top: 50, bottom: 50, left: 50, right: 410 } });
}

function mpkPlannerHud() {
  const P = MPK_FEAT.plan;
  mpkHud('Inspection Planner', `
    <div class="mpk-plan-form">
      <label>Teams<select id="mpk-plan-teams" onchange="mpkPlannerSet('teams', +this.value)">${[1, 2, 3, 4, 5, 6].map(n =>
        `<option ${n === P.teams ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
      <label>Visits / team / day<input id="mpk-plan-per" type="number" min="4" max="30" value="${P.perDay}" onchange="mpkPlannerSet('perDay', +this.value)"></label>
      <label>Start<input id="mpk-plan-start" type="date" value="${mpkYMD(P.start)}" onchange="mpkPlannerSet('start', this.value)"></label>
    </div>
    <div class="mpk-hud-stats" id="mpk-plan-stats"></div>
    <div class="mpk-hud-actions">
      <button class="mpk-btn" onclick="mpkPlannerCSV()">Download CSV</button>
      <button class="mpk-wb-btn" onclick="mpkPlannerPrint()">Print checklists</button>
    </div>
    <div class="mpk-hud-list mpk-plan-days" id="mpk-plan-days"></div>
    <div class="mpk-hud-note">Most urgent cases first (priority score); each day groups nearby cases and orders them as a route.
      Weekend skipped: Friday–Saturday (Terengganu); public holidays are not, so move those days by hand. Time = 15 min per visit + driving at 30 km/h on straight-line distance × 1.3.</div>`,
    { icon: '🗓️', side: true });
}

function mpkPlannerSet(key, v) {
  const P = MPK_FEAT.plan;
  if (!P) return;
  if (key === 'start') { const [y, m, d] = v.split('-').map(Number); if (!y) return; P.start = new Date(y, m - 1, d); }
  else if (key === 'perDay') P.perDay = Math.max(4, Math.min(30, v || 12));
  else P[key] = v;
  P.sel = null;
  mpkPlannerBuild();
}

function mpkPlannerBuild() {
  const P = MPK_FEAT.plan, { ranked } = mpkFeatData();
  P.plan = mpkPlanSchedule(ranked.map(x => ({ p: x.p, score: x.pr.score })), { teams: P.teams, perDay: P.perDay, start: P.start });
  const days = P.plan.length ? P.plan[P.plan.length - 1].day : 0;
  const km = P.plan.reduce((a, b) => a + b.km, 0);
  document.getElementById('mpk-plan-stats').innerHTML = `
    <div><b>${mpkNum(ranked.length)}</b><small>cases to visit</small></div>
    <div><b>${days}</b><small>working days</small></div>
    <div><b>${P.plan.length ? mpkPlanDate(P.plan[P.plan.length - 1].date) : '—'}</b><small>finish · ${mpkNum(km)} km</small></div>`;
  document.getElementById('mpk-plan-days').innerHTML = P.plan.map((b, i) => `
    <button class="mpk-hud-item${P.sel === i ? ' on' : ''}" onclick="mpkPlannerPick(${i})">
      <span class="mpk-plan-day">D${b.day}</span>
      <span><b>${mpkPlanDate(b.date)} · Team ${b.team}</b><small>${b.stops.length} visits · ${b.km.toFixed(1)} km · ~${b.hours.toFixed(1)} h · top score ${b.stops[0].score}</small></span>
    </button>`).join('') || '<div class="mpk-hud-sub">No suspected buildings in this area.</div>';
  mpkPlannerDraw();
}

function mpkPlannerDraw() {
  const P = MPK_FEAT.plan, days = Math.max(1, P.plan.length ? P.plan[P.plan.length - 1].day - 1 : 1);
  map.getSource('mpk-feat-plan-line').setData(mpkFC(P.plan.map((b, i) => ({ type: 'Feature', properties: { sel: P.sel === i },
    geometry: { type: 'LineString', coordinates: b.stops.map(x => [x.p.lng, x.p.lat]) } }))));
  const pts = P.plan.flatMap((b, i) => b.stops.map((x, k) => mpkPt([x.p.lng, x.p.lat],
    { sel: P.sel === i, n: String(k + 1), dayf: (b.day - 1) / days })));
  pts.sort((a, b) => a.properties.sel - b.properties.sel);                 // the picked day on top
  map.getSource('mpk-feat-plan-pt').setData(mpkFC(pts));
}

function mpkPlannerPick(i) {
  const P = MPK_FEAT.plan, b = P.plan[i];
  if (!b) return;
  P.sel = P.sel === i ? null : i;
  document.querySelectorAll('#mpk-plan-days .mpk-hud-item').forEach((el, k) => el.classList.toggle('on', k === P.sel));
  mpkPlannerDraw();
  if (P.sel !== null) {
    mpkFeatFit(mpkBoundsOf([{ geometry: { coordinates: b.stops.map(x => [x.p.lng, x.p.lat]) } }]),
      { padding: { top: 80, bottom: 80, left: 80, right: 420 }, maxZoom: 17.5 });
  }
}

function mpkPlannerCSV() {
  const P = MPK_FEAT.plan;
  if (!P || !P.plan.length) return;
  const blob = new Blob(['﻿' + mpkPlanCSV(P.plan, MPK.settings)], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `mpk_inspection_plan_${MPK_CSV_AREA[MPK.area] || 'all_areas'}_${mpkYMD(P.start)}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  showToast('📄 Inspection plan exported');
}

// One printable checklist page per team-day (the picked day only, if one is picked)
function mpkPlannerPrint() {
  const P = MPK_FEAT.plan;
  if (!P || !P.plan.length) return;
  const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const list = P.sel !== null ? [P.plan[P.sel]] : P.plan;
  const pages = list.map(b => `<section>
      <header><div><h1>Site inspection checklist</h1><p>MPK Kemaman · suspected buildings · draft generated by BuildVision for planning</p></div>
        <div class="meta"><b>Day ${b.day} · ${mpkPlanDate(b.date)} ${b.date.getFullYear()}</b><br>Team ${b.team} · ${b.stops.length} visits · ${b.km.toFixed(1)} km · ~${b.hours.toFixed(1)} h</div></header>
      <table><thead><tr><th>#</th><th>Plus Code / location</th><th>Area · lot</th><th>m²</th><th>Why flagged</th><th>Visited</th><th>Building found</th><th>Notes</th></tr></thead>
      <tbody>${b.stops.map((x, k) => `<tr><td>${k + 1}</td><td><b>${esc(x.p.plus_code)}</b><br><small>${x.p.lat.toFixed(5)}, ${x.p.lng.toFixed(5)}</small></td>
        <td>${esc(MPK_AREAS[x.p.kawasan].short)}<br><small>Lot ${esc(x.p.lot || '—')}</small></td><td>${mpkNum(x.p.area_m2)}</td>
        <td><small>${esc(mpkPlanReason(x.p, MPK.settings))} · score ${x.score}</small></td><td class="box">☐</td><td class="box">☐ Yes ☐ No</td><td class="notes"></td></tr>`).join('')}</tbody></table>
      <footer>Inspector: ____________________ &nbsp; Signature: ____________________ &nbsp; Date: ____________</footer></section>`).join('');
  const w = window.open('', '_blank');
  if (!w) { showToast('⚠️ Allow pop-ups to print the checklists'); return; }
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Inspection checklists</title><style>
    body{font-family:Arial,Helvetica,sans-serif;color:#1E2C44;margin:0}section{padding:18mm 14mm;page-break-after:always}
    header{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:2px solid #1E2C44;padding-bottom:8px;margin-bottom:10px}
    h1{font-size:18px;margin:0}p{margin:3px 0 0;font-size:11px;color:#5E6E84}.meta{text-align:right;font-size:12px}
    table{width:100%;border-collapse:collapse;font-size:11px}th,td{border:1px solid #c9d1db;padding:5px 6px;vertical-align:top;text-align:left}
    th{background:#1E2C44;color:#fff}small{color:#5E6E84}.box{white-space:nowrap}.notes{width:22%}tr{page-break-inside:avoid}
    footer{margin-top:16px;font-size:12px}@page{size:A4 landscape;margin:0}</style></head><body>${pages}</body></html>`);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 300);
}
