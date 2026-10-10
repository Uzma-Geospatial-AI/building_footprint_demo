// ============================================================
// MPK KEMAMAN — FEATURES 12–15
//   hex        3D Hex Density   suspected footprint per 150 m hexagon, as rising 3D columns
//   radius     Impact Radius    a circle that follows the mouse; live counts inside it
//   lens       Time Lens        a round lens that shows an old satellite photo under the cursor
//   roulette   Audit Roulette   a fair random pick of a suspected building for a spot check
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

// ---------- Pure: fair random pick and the slowing roulette schedule ----------
// Uniform integer in [0, n) from a 32-bit random source (rejection sampling, no modulo bias)
function mpkFairIndex(n, rand32) {
  const limit = Math.floor(0x100000000 / n) * n;
  let v;
  do { v = rand32(); } while (v >= limit);
  return v % n;
}

// Delays (ms) between roulette flashes: fast at first, easing out to a stop
function mpkRouletteDelays(steps = 34, first = 45, last = 520) {
  return Array.from({ length: steps }, (_, i) => Math.round(first + (last - first) * Math.pow(i / (steps - 1), 2.6)));
}

if (typeof module !== 'undefined') {
  module.exports = { mpkHexKey, mpkHexPolygon, mpkHexBins, mpkWithin, mpkFairIndex, mpkRouletteDelays };
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
    { key: 'roulette', icon: '🎰', title: 'Audit Roulette', tag: 'Fair random spot check',
      text: 'Spins through the suspected buildings like a slot machine and lands on one at random for an unbiased site audit, then flies there and shows its case file.' },
  );
  Object.assign(MPK_FEAT_RUN, {
    hex: token => mpkHexRun(token),
    radius: token => mpkRadiusRun(token),
    lens: token => mpkLensRun(token),
    roulette: token => mpkRouletteRun(token),
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

// ---------- 15. Audit Roulette ----------
function mpkRouletteRun() {
  const { ranked } = mpkFeatData();
  MPK_FEAT.roulette = { pool: ranked.map(x => x.p), picks: [] };
  mpkFeatSrc('mpk-feat-rou', mpkFC([]));
  mpkFeatLayer({ id: 'mpk-feat-rou-glow', type: 'circle', source: 'mpk-feat-rou',
    paint: { 'circle-radius': 26, 'circle-color': '#FFD600', 'circle-opacity': 0.35, 'circle-blur': 0.6 } });
  mpkFeatLayer({ id: 'mpk-feat-rou', type: 'circle', source: 'mpk-feat-rou',
    paint: { 'circle-radius': 9, 'circle-color': '#FFD600', 'circle-stroke-color': '#1E2C44', 'circle-stroke-width': 3 } });
  mpkFeatFit(MPK.bounds[MPK.area], { padding: { top: 60, bottom: 60, left: 60, right: 400 } });
  mpkRouletteHud();
}

function mpkRouletteHud(slot) {
  const R = MPK_FEAT.roulette;
  mpkHud('Audit Roulette', `
    <div class="mpk-slot" id="mpk-slot"><small>Suspected building</small><b class="mono" id="mpk-slot-code">${slot || '— — —'}</b>
      <span id="mpk-slot-sub">${mpkNum(R.pool.length)} in the draw</span></div>
    <div class="mpk-hud-actions"><button class="mpk-btn mpk-spin" id="mpk-spin" onclick="mpkRouletteSpin()">🎰 Spin</button></div>
    <div class="mpk-hud-list" id="mpk-rou-picks">${R.picks.map((p, i) => `<button class="mpk-hud-item" onclick="mpkZoomTo(${p.id})">
      <span class="mpk-hud-stop">${i + 1}</span><span><b>${p.plus_code}</b><small>${MPK_AREAS[p.kawasan].short} · ${mpkNum(p.area_m2)} m²</small></span></button>`).join('')}</div>
    <div class="mpk-hud-note">Every suspected building in the selected area has the same chance (crypto-random, no repeats), so spot
      checks are unbiased, a common way to audit a large list fairly.</div>`, { icon: '🎰', side: true });
}

async function mpkRouletteSpin() {
  const R = MPK_FEAT.roulette, token = MPK_FEAT.token;
  if (!R || R.spinning) return;
  const left = R.pool.filter(p => !R.picks.includes(p));
  if (!left.length) { showToast('Every building has been drawn'); return; }
  R.spinning = true;
  const btn = document.getElementById('mpk-spin');
  if (btn) btn.disabled = true;
  const rand32 = () => crypto.getRandomValues(new Uint32Array(1))[0];
  const winner = left[mpkFairIndex(left.length, rand32)];
  const delays = mpkRouletteDelays();
  map.easeTo({ pitch: 0, bearing: 0, duration: 400 });
  for (let i = 0; i < delays.length; i++) {
    if (!mpkFeatAlive(token)) return;
    const p = i === delays.length - 1 ? winner : left[mpkFairIndex(left.length, rand32)];
    map.getSource('mpk-feat-rou').setData(mpkFC([mpkPt([p.lng, p.lat])]));
    const code = document.getElementById('mpk-slot-code'), sub = document.getElementById('mpk-slot-sub');
    if (code) code.textContent = p.plus_code;
    if (sub) sub.textContent = MPK_AREAS[p.kawasan].short + ' · ' + mpkNum(p.area_m2) + ' m²';
    await mpkFeatWait(delays[i]);
  }
  if (!mpkFeatAlive(token)) return;
  R.picks.push(winner);
  R.spinning = false;
  const slot = document.getElementById('mpk-slot');
  if (slot) slot.classList.add('win');
  await mpkFeatMove(() => map.flyTo({ center: [winner.lng, winner.lat], zoom: 18, duration: 1800 }));
  if (!mpkFeatAlive(token)) return;
  mpkRouletteHud(winner.plus_code);
  document.getElementById('mpk-slot').classList.add('win');
  document.getElementById('mpk-slot-sub').textContent = MPK_AREAS[winner.kawasan].short + ' · ' + mpkNum(winner.area_m2) + ' m² · drawn for audit';
  mpkShowPopup(winner, [winner.lng, winner.lat]);
}
