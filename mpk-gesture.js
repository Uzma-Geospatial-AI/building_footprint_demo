// ============================================================
// MPK KEMAMAN — GESTURE CONTROL (feature 11)
// The camera tracks both hands (MediaPipe Hand Landmarker, in the browser). Clap once to open
// a before / after satellite swipe; say the "before" and "after" years; then drive it by hand:
//   🖐 / ☝️  hover      → move the swipe divider
//   🤏 pinch + move     → pan the map
//   ✌️ hold             → zoom in
//   ✊ hold             → zoom out
//   👏 clap             → close the swipe (clap again to reopen)
// Voice also works during the swipe: "zoom in", "zoom out", "before 2017", "after 2024", "close".
// No video leaves the browser. Pure helpers are exported for tools/test_mpk_gesture.js.
// Loaded after mpk-features.js.
// ============================================================

// ---------- Pure: hand pose ----------
const mpkD = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// One hand's 21 landmarks -> { pose, x, y, size, cx, cy }; x mirrored so it matches the screen
//   pose: 'pinch' | 'fist' | 'point' | 'victory' | 'open' | 'other'
function mpkHandPose(lm) {
  const w = lm[0], size = mpkD(w, lm[9]) || 1e-6;
  // a finger is straight when its tip is well beyond its middle joint, seen from the wrist
  const ext = [[8, 6], [12, 10], [16, 14], [20, 18]].map(([tip, pip]) => mpkD(w, lm[tip]) > mpkD(w, lm[pip]) * 1.2);
  const [index, middle, ring, pinky] = ext, n = ext.filter(Boolean).length;
  let pose = 'other';
  if (mpkD(lm[4], lm[8]) < size * 0.33 && mpkD(w, lm[8]) > mpkD(w, lm[6]) * 0.95) pose = 'pinch';
  else if (n === 0) pose = 'fist';
  else if (index && !middle && !ring && !pinky) pose = 'point';
  else if (index && middle && !ring && !pinky) pose = 'victory';
  else if (n >= 4) pose = 'open';
  const tip = pose === 'pinch' ? { x: (lm[4].x + lm[8].x) / 2, y: (lm[4].y + lm[8].y) / 2 } : lm[8];
  return { pose, x: 1 - tip.x, y: tip.y, size, cx: 1 - (w.x + lm[9].x) / 2, cy: (w.y + lm[9].y) / 2 };
}

// Clap: two hands that were apart come together fast. Returns update(hands, tMs) -> true on a clap.
function mpkClapDetector(opts = {}) {
  const apart = opts.apart || 2.2, touch = opts.touch || 1.3, window_ = opts.window || 800, cooldown = opts.cooldown || 1500;
  let lastApart = -Infinity, lastClap = -Infinity;
  return (hands, t) => {
    if (!hands || hands.length < 2) return false;
    const [a, b] = hands, d = Math.hypot(a.cx - b.cx, a.cy - b.cy) / ((a.size + b.size) / 2);
    if (d > apart) { lastApart = t; return false; }
    if (d < touch && t - lastApart < window_ && t - lastClap > cooldown) { lastClap = t; lastApart = -Infinity; return true; }
    return false;
  };
}

// ---------- Pure: spoken years (digits, English or Malay words) ----------
const MPK_NUM_EN = { zero: 0, oh: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19 };
const MPK_TENS_EN = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
const MPK_NUM_MS = { kosong: 0, satu: 1, dua: 2, tiga: 3, empat: 4, lima: 5, enam: 6, tujuh: 7, lapan: 8, sembilan: 9, sepuluh: 10, sebelas: 11 };

// Words 0–99 at the start of `w` -> [value, words used] or null
function mpkWords99(w) {
  if (!w.length) return null;
  if (MPK_TENS_EN[w[0]] != null) {
    const u = MPK_NUM_EN[w[1]];
    return u != null && u < 10 && u > 0 ? [MPK_TENS_EN[w[0]] + u, 2] : [MPK_TENS_EN[w[0]], 1];
  }
  if (MPK_NUM_EN[w[0]] != null) return [MPK_NUM_EN[w[0]], 1];
  const m = MPK_NUM_MS[w[0]];
  if (m != null) {
    if (m < 10 && w[1] === 'belas') return [10 + m, 2];
    if (m < 10 && w[1] === 'puluh') {
      const u = MPK_NUM_MS[w[2]];
      return u != null && u > 0 && u < 10 ? [m * 10 + u, 3] : [m * 10, 2];
    }
    return [m, 1];
  }
  return null;
}

function mpkParseYear(text) {
  const t = String(text || '').toLowerCase();
  const d = t.match(/\b(19[89]\d|20[0-4]\d)\b/);
  if (d) return +d[1];
  const w = t.replace(/[^a-z\s]/g, ' ').split(/\s+/).filter(x => x && x !== 'and' && x !== 'dan');
  for (let i = 0; i < w.length; i++) {
    // "two thousand (and) thirteen" / "dua ribu tiga belas"
    if ((w[i] === 'two' && w[i + 1] === 'thousand') || (w[i] === 'dua' && w[i + 1] === 'ribu')) {
      const r = mpkWords99(w.slice(i + 2));
      return 2000 + (r ? r[0] : 0);
    }
    // "twenty thirteen", "twenty oh seven", "twenty twenty five"
    if (w[i] === 'twenty') {
      if (w[i + 1] === 'oh') { const r = mpkWords99(w.slice(i + 2)); if (r && r[0] < 10) return 2000 + r[0]; }
      const r = mpkWords99(w.slice(i + 1));
      if (r && r[0] >= 10) return 2000 + r[0];
    }
  }
  return null;
}

// The capture closest to a year (earlier one on a tie)
function mpkNearestFrame(frames, year) {
  let best = null, bd = Infinity;
  for (const f of frames) {
    const d = Math.abs(+f.capture.slice(0, 4) - year);
    if (d < bd) { bd = d; best = f; }
  }
  return best;
}

// Voice commands while the swipe is open
function mpkGestureCommand(text) {
  const t = ' ' + String(text || '').toLowerCase() + ' ';
  const year = mpkParseYear(t);
  if (/zoom in|zoom masuk|dekatkan|besarkan/.test(t)) return { cmd: 'zoomin' };
  if (/zoom out|zoom keluar|jauhkan|kecilkan/.test(t)) return { cmd: 'zoomout' };
  if (/close|exit|stop|tutup|keluar|berhenti/.test(t)) return { cmd: 'close' };
  if (/swap|tukar/.test(t)) return { cmd: 'swap' };
  if (year && /before|sebelum|kiri|left/.test(t)) return { cmd: 'before', year };
  if (year && /after|selepas|lepas|kanan|right/.test(t)) return { cmd: 'after', year };
  return null;
}

if (typeof module !== 'undefined') {
  module.exports = { mpkHandPose, mpkClapDetector, mpkParseYear, mpkNearestFrame, mpkGestureCommand };
}

// ============================================================
// Browser
// ============================================================
const MPK_GEST_LIB = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';
const MPK_GEST_MODEL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';
const MPK_HAND_LINKS = [[0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16], [13, 17], [17, 18], [18, 19], [19, 20], [0, 17]];
const MPK_POSE_LABEL = { pinch: '🤏 Pinch · pan', fist: '✊ Fist · zoom out', point: '☝️ Point · swipe', victory: '✌️ Victory · zoom in',
  open: '🖐 Open hand · swipe', other: '…' };

const MPK_GEST = {
  phase: 'off', token: 0, stream: null, video: null, landmarker: null, raf: null, lastVideoTime: -1,
  clap: null, frames: [], before: null, after: null, maps: null, slider: 0.5, cur: null, pinchFrom: null,
  hold: { pose: null, since: 0 }, rec: null, inject: null, hands: [],
};

if (typeof MPK_FEATURES !== 'undefined') {
  MPK_FEATURES.push({ key: 'gesture', icon: '👏', title: 'Gesture Control', tag: 'Camera hand tracking + voice',
    text: 'Clap to open a before / after satellite swipe, say the two years, then wave to slide, pinch to pan and make a ✌️ or ✊ to zoom. No mouse needed.' });
  MPK_FEAT_RUN.gesture = token => mpkGestureStart(token);
}

// ---------- Start / stop ----------
async function mpkGestureStart(token) {
  MPK_GEST.token = token;
  MPK_FEAT.cleanup.push(mpkGestureStop);
  const area = (() => { const r = mpkFeatData().ranked[0]; return r ? r.p.kawasan : (MPK.area === 'all' ? 'tk' : MPK.area); })();
  MPK_GEST.frames = mpkTimeFrames(MPK.data.wayback && MPK.data.wayback.history, area);
  MPK_GEST.clap = mpkClapDetector();
  mpkGestPhase('loading');
  let camErr = null;
  try {
    MPK_GEST.stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480, facingMode: 'user' }, audio: false });
  } catch (e) { camErr = e; }
  if (!mpkFeatAlive(token)) { mpkGestureStop(); return; }
  if (camErr) { mpkGestPhase('nocam', camErr.name === 'NotAllowedError' ? 'Camera permission was blocked.' : 'No camera found.'); return; }
  const video = MPK_GEST.video = document.createElement('video');
  video.playsInline = true; video.muted = true; video.srcObject = MPK_GEST.stream;
  await video.play().catch(() => {});
  mpkGestCamBox(true);
  try {
    await mpkGestLoadModel();
  } catch (e) {
    if (mpkFeatAlive(token)) mpkGestPhase('nocam', 'Hand tracking could not load (' + e.message + ').');
    return;
  }
  if (!mpkFeatAlive(token)) return;
  mpkGestPhase('armed');
  mpkGestLoop();
}

async function mpkGestLoadModel() {
  if (MPK_GEST.landmarker) return MPK_GEST.landmarker;
  const vision = await import(MPK_GEST_LIB + '/vision_bundle.mjs');
  const files = await vision.FilesetResolver.forVisionTasks(MPK_GEST_LIB + '/wasm');
  const opts = delegate => ({ baseOptions: { modelAssetPath: MPK_GEST_MODEL, delegate }, runningMode: 'VIDEO', numHands: 2,
    minHandDetectionConfidence: 0.55, minHandPresenceConfidence: 0.5, minTrackingConfidence: 0.5 });
  try { MPK_GEST.landmarker = await vision.HandLandmarker.createFromOptions(files, opts('GPU')); }
  catch (e) { MPK_GEST.landmarker = await vision.HandLandmarker.createFromOptions(files, opts('CPU')); }
  return MPK_GEST.landmarker;
}

function mpkGestureStop() {
  MPK_GEST.phase = 'off';
  if (MPK_GEST.raf) { cancelAnimationFrame(MPK_GEST.raf); MPK_GEST.raf = null; }
  mpkGestStopListening();
  if (MPK_GEST.stream) { MPK_GEST.stream.getTracks().forEach(t => t.stop()); MPK_GEST.stream = null; }
  MPK_GEST.video = null;
  mpkSwipeClose();
  mpkGestCamBox(false);
  document.removeEventListener('keydown', mpkGestKey);
}

function mpkGestKey(e) { if (e.key === 'Escape') mpkFeatStop(); }

// ---------- HUD per phase ----------
function mpkGestYearChips(which) {
  const seen = new Set();
  return MPK_GEST.frames.filter(f => !seen.has(f.capture.slice(0, 4)) && seen.add(f.capture.slice(0, 4)))
    .map(f => `<button type="button" onclick="mpkGestYear('${which}', ${f.capture.slice(0, 4)})">${f.capture.slice(0, 4)}</button>`).join('');
}

function mpkGestPhase(phase, msg) {
  MPK_GEST.phase = phase;
  const legend = `<div class="mpk-gest-legend">
      <span><b>👏</b>Clap · open / close</span><span><b>🖐</b>Hover · swipe</span><span><b>🤏</b>Pinch + move · pan</span>
      <span><b>✌️</b>Hold · zoom in</span><span><b>✊</b>Hold · zoom out</span><span><b>🎙️</b>"before 2017", "zoom in", "close"</span></div>`;
  const body = {
    loading: '<div class="mpk-hud-sub">Starting the camera and hand tracking…<br>Allow camera access when the browser asks.</div>',
    nocam: `<div class="mpk-hud-sub">${msg || ''} You can still open the swipe and use the mouse and your voice.</div>
      <div class="mpk-hud-actions"><button class="mpk-btn" onclick="mpkGestAskYears()">Open swipe compare</button></div>`,
    armed: `<div class="mpk-gest-big"><span class="mpk-gest-clap">👏</span><div><b>Clap once</b><small>to open the before / after swipe</small></div></div>
      ${legend}
      <div class="mpk-hud-actions"><button class="mpk-wb-btn" onclick="mpkGestAskYears()">Open without clapping</button></div>
      <div class="mpk-hud-note">Hand tracking runs in this browser; no video is uploaded.</div>`,
    askBefore: `<div class="mpk-gest-big"><span class="mpk-gest-mic">🎙️</span><div><b>Which year for BEFORE?</b><small id="mpk-gest-heard">Say a year, e.g. “2013”</small></div></div>
      <div class="mpk-gest-years">${mpkGestYearChips('before')}</div>`,
    askAfter: `<div class="mpk-gest-big"><span class="mpk-gest-mic">🎙️</span><div><b>Which year for AFTER?</b><small id="mpk-gest-heard">Before: ${MPK_GEST.before ? MPK_GEST.before.capture.slice(0, 4) : ''} · say a year, e.g. “2025”</small></div></div>
      <div class="mpk-gest-years">${mpkGestYearChips('after')}</div>`,
    swipe: `<div class="mpk-gest-now" id="mpk-gest-now">Show your hand to the camera</div>${legend}
      <div class="mpk-hud-note" id="mpk-gest-heard">Listening for voice commands…</div>`,
  }[phase];
  mpkHud('Gesture Control', body, { icon: '👏', side: phase === 'swipe' });
  document.removeEventListener('keydown', mpkGestKey);
  document.addEventListener('keydown', mpkGestKey);
}

// ---------- Voice ----------
function mpkGestSay(text, then) {
  if (!window.speechSynthesis) { if (then) then(); return; }
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'en-GB';
    let done = false;
    const go = () => { if (!done) { done = true; if (then) then(); } };
    u.onend = go; u.onerror = go;
    setTimeout(go, 4000);                           // some browsers never fire onend
    speechSynthesis.speak(u);
  } catch (e) { if (then) then(); }
}

function mpkGestStopListening() {
  const r = MPK_GEST.rec;
  MPK_GEST.rec = null;
  if (r) try { r.onend = null; r.abort(); } catch (e) {}
}

// Listen once (or continuously); calls onText(transcript, isFinal)
function mpkGestListen(onText, continuous) {
  const Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
  mpkGestStopListening();
  if (!Rec) return false;
  const rec = new Rec();
  rec.lang = 'en-MY';
  rec.interimResults = true;
  rec.continuous = !!continuous;
  rec.onresult = e => {
    const r = e.results[e.results.length - 1];
    onText(r[0].transcript, r.isFinal);
  };
  rec.onerror = () => {};
  rec.onend = () => {                                // keep listening while this step is open
    if (MPK_GEST.rec === rec) setTimeout(() => { if (MPK_GEST.rec === rec) try { rec.start(); } catch (e) {} }, 250);
  };
  MPK_GEST.rec = rec;
  try { rec.start(); } catch (e) { return false; }
  return true;
}

function mpkGestAskYears() {
  if (!MPK_GEST.frames.length) { showToast('⚠️ No historical imagery for this area'); return; }
  MPK_GEST.before = MPK_GEST.after = null;
  mpkGestAsk('before');
}

function mpkGestAsk(which) {
  mpkGestPhase(which === 'before' ? 'askBefore' : 'askAfter');
  mpkGestSay(which === 'before' ? 'Which year for before?' : 'And which year for after?', () => {
    const ok = mpkGestListen((txt, final) => {
      const heard = document.getElementById('mpk-gest-heard');
      if (heard) heard.textContent = '“' + txt + '”';
      const y = mpkParseYear(txt);
      if (y && final) mpkGestYear(which, y);
      else if (final && heard) heard.textContent = '“' + txt + '”: no year heard, try again or tap a year';
    });
    if (!ok) { const h = document.getElementById('mpk-gest-heard'); if (h) h.textContent = 'Voice not available here: tap a year'; }
  });
}

function mpkGestYear(which, year) {
  const f = mpkNearestFrame(MPK_GEST.frames, year);
  if (!f) return;
  mpkGestStopListening();
  const note = +f.capture.slice(0, 4) === year ? '' : ` (closest image: ${f.capture.slice(0, 4)})`;
  if (which === 'before') {
    MPK_GEST.before = f;
    showToast(`Before: ${year}${note}`);
    mpkGestAsk('after');
  } else {
    MPK_GEST.after = f;
    showToast(`After: ${year}${note}`);
    mpkGestSay(`Comparing ${MPK_GEST.before.capture.slice(0, 4)} with ${f.capture.slice(0, 4)}.`);
    mpkSwipeOpen();
  }
}

function mpkGestVoiceCommand(txt) {
  const heard = document.getElementById('mpk-gest-heard');
  if (heard) heard.textContent = '🎙️ “' + txt + '”';
  const c = mpkGestureCommand(txt);
  if (!c || !MPK_GEST.maps) return;
  const m = MPK_GEST.maps.after;
  if (c.cmd === 'close') { mpkSwipeClose(); mpkGestPhase('armed'); }
  else if (c.cmd === 'zoomin') m.easeTo({ zoom: m.getZoom() + 1, duration: 600 });
  else if (c.cmd === 'zoomout') m.easeTo({ zoom: m.getZoom() - 1, duration: 600 });
  else if (c.cmd === 'swap') { [MPK_GEST.before, MPK_GEST.after] = [MPK_GEST.after, MPK_GEST.before]; mpkSwipeImagery(); }
  else if (c.cmd === 'before' || c.cmd === 'after') { MPK_GEST[c.cmd] = mpkNearestFrame(MPK_GEST.frames, c.year); mpkSwipeImagery(); }
}

// ---------- Swipe overlay ----------
function mpkSwipeStyle(frame) {
  const sus = mpkFeatData().ranked.map(x => MPK.data.buildings.features.find(f => f.properties.id === x.p.id));
  return { version: 8,
    sources: { img: { type: 'raster', tiles: [mpkWaybackTileUrl(frame.release)], tileSize: 256, maxzoom: 19, attribution: 'Esri World Imagery Wayback' },
               sus: { type: 'geojson', data: mpkFC(sus) } },
    layers: [{ id: 'img', type: 'raster', source: 'img' },
             { id: 'sus', type: 'line', source: 'sus', paint: { 'line-color': '#FF5252', 'line-width': 1.6 } }] };
}

function mpkSwipeOpen() {
  mpkSwipeClose();
  const wrap = document.getElementById('mapWrapper');
  const el = document.createElement('div');
  el.id = 'mpk-swipe';
  el.className = 'mpk-swipe';
  el.innerHTML = `<div id="mpk-sw-after" class="mpk-sw-map"></div><div id="mpk-sw-before" class="mpk-sw-map"></div>
    <div class="mpk-sw-div" id="mpk-sw-div" role="slider" aria-label="Before / after divider" tabindex="0"><span>⇆</span></div>
    <div class="mpk-sw-lbl l" id="mpk-sw-lbl-b"></div><div class="mpk-sw-lbl r" id="mpk-sw-lbl-a"></div>
    <div class="mpk-sw-cursor" id="mpk-sw-cursor" hidden></div>`;
  wrap.appendChild(el);
  const top = mpkFeatData().ranked[0];
  const z = map.getZoom() >= 15 ? map.getZoom() : 16.5;
  const center = map.getZoom() >= 15 || !top ? map.getCenter() : [top.p.lng, top.p.lat];
  const after = new maplibregl.Map({ container: 'mpk-sw-after', style: mpkSwipeStyle(MPK_GEST.after), center, zoom: z,
    minZoom: 12, maxZoom: 19, attributionControl: { compact: true } });
  const before = new maplibregl.Map({ container: 'mpk-sw-before', style: mpkSwipeStyle(MPK_GEST.before), center, zoom: z,
    interactive: false, attributionControl: false });
  after.on('move', () => before.jumpTo({ center: after.getCenter(), zoom: after.getZoom(), bearing: after.getBearing(), pitch: after.getPitch() }));
  MPK_GEST.maps = { after, before };
  mpkSwipeLabels();
  mpkSwipeSet(0.5);
  // mouse / touch: drag the divider
  const div = document.getElementById('mpk-sw-div');
  const move = e => { const r = el.getBoundingClientRect(); mpkSwipeSet((e.clientX - r.left) / r.width); };
  div.addEventListener('pointerdown', e => {
    div.setPointerCapture(e.pointerId);
    div.addEventListener('pointermove', move);
    div.addEventListener('pointerup', () => div.removeEventListener('pointermove', move), { once: true });
  });
  div.addEventListener('keydown', e => { if (e.key === 'ArrowLeft') mpkSwipeSet(MPK_GEST.slider - 0.05); if (e.key === 'ArrowRight') mpkSwipeSet(MPK_GEST.slider + 0.05); });
  mpkGestPhase('swipe');
  mpkGestListen((txt, final) => { if (final) mpkGestVoiceCommand(txt); }, true);
}

function mpkSwipeImagery() {
  if (!MPK_GEST.maps) return;
  MPK_GEST.maps.before.getSource('img').setTiles([mpkWaybackTileUrl(MPK_GEST.before.release)]);
  MPK_GEST.maps.after.getSource('img').setTiles([mpkWaybackTileUrl(MPK_GEST.after.release)]);
  mpkSwipeLabels();
}

function mpkSwipeLabels() {
  const lbl = (f, k) => `<small>${k}</small><b>${f.capture.slice(0, 4)}</b><span>${mpkDayLabel(f.capture)}</span>`;
  document.getElementById('mpk-sw-lbl-b').innerHTML = lbl(MPK_GEST.before, 'BEFORE');
  document.getElementById('mpk-sw-lbl-a').innerHTML = lbl(MPK_GEST.after, 'AFTER');
}

function mpkSwipeSet(f) {
  MPK_GEST.slider = Math.max(0.02, Math.min(0.98, f));
  const b = document.getElementById('mpk-sw-before'), d = document.getElementById('mpk-sw-div');
  if (!b) return;
  b.style.clipPath = `inset(0 ${((1 - MPK_GEST.slider) * 100).toFixed(2)}% 0 0)`;
  d.style.left = (MPK_GEST.slider * 100).toFixed(2) + '%';
  d.setAttribute('aria-valuenow', Math.round(MPK_GEST.slider * 100));
}

function mpkSwipeClose() {
  if (MPK_GEST.maps) { try { MPK_GEST.maps.after.remove(); MPK_GEST.maps.before.remove(); } catch (e) {} MPK_GEST.maps = null; }
  const el = document.getElementById('mpk-swipe');
  if (el) el.remove();
  if (MPK_GEST.phase === 'swipe') mpkGestStopListening();
}

// ---------- Camera preview ----------
function mpkGestCamBox(on) {
  let box = document.getElementById('mpk-gest-cam');
  if (!on) { if (box) box.remove(); return; }
  if (!box) {
    box = document.createElement('div');
    box.id = 'mpk-gest-cam';
    box.className = 'mpk-gest-cam';
    box.innerHTML = '<canvas width="240" height="180" aria-label="Camera with tracked hands"></canvas><span id="mpk-gest-pose">No hands</span>';
    document.getElementById('mapWrapper').appendChild(box);
  }
}

function mpkGestDraw(hands) {
  const box = document.getElementById('mpk-gest-cam');
  if (!box) return;
  const c = box.querySelector('canvas'), g = c.getContext('2d');
  g.save();
  g.translate(c.width, 0); g.scale(-1, 1);                          // mirror, like a selfie
  if (MPK_GEST.video && MPK_GEST.video.readyState >= 2) g.drawImage(MPK_GEST.video, 0, 0, c.width, c.height);
  else { g.fillStyle = '#1E2C44'; g.fillRect(0, 0, c.width, c.height); }
  hands.forEach((lm, i) => {
    g.strokeStyle = i ? '#4DD0E1' : '#FFB74D'; g.lineWidth = 2.5;
    MPK_HAND_LINKS.forEach(([a, b]) => { g.beginPath(); g.moveTo(lm[a].x * c.width, lm[a].y * c.height); g.lineTo(lm[b].x * c.width, lm[b].y * c.height); g.stroke(); });
    g.fillStyle = '#fff';
    lm.forEach(p => { g.beginPath(); g.arc(p.x * c.width, p.y * c.height, 2.6, 0, 7); g.fill(); });
  });
  g.restore();
}

// ---------- Tracking loop ----------
function mpkGestLoop() {
  const step = () => {
    if (MPK_GEST.phase === 'off') return;
    let hands = [];
    if (MPK_GEST.inject) { hands = MPK_GEST.inject; MPK_GEST.inject = null; }
    else if (MPK_GEST.landmarker && MPK_GEST.video && MPK_GEST.video.readyState >= 2 && MPK_GEST.video.currentTime !== MPK_GEST.lastVideoTime) {
      MPK_GEST.lastVideoTime = MPK_GEST.video.currentTime;
      try { hands = MPK_GEST.landmarker.detectForVideo(MPK_GEST.video, performance.now()).landmarks || []; } catch (e) { hands = []; }
    } else { MPK_GEST.raf = requestAnimationFrame(step); return; }
    mpkGestHandle(hands, performance.now());
    MPK_GEST.raf = requestAnimationFrame(step);
  };
  MPK_GEST.raf = requestAnimationFrame(step);
}

// Feed landmarks by hand (testing / demos without a camera)
function mpkGestureFeed(hands) { MPK_GEST.inject = hands; }

function mpkGestHandle(hands, t) {
  MPK_GEST.hands = hands;
  mpkGestDraw(hands);
  const poses = hands.map(mpkHandPose);
  const poseEl = document.getElementById('mpk-gest-pose');
  if (poseEl) poseEl.textContent = poses.length ? poses.map(p => MPK_POSE_LABEL[p.pose]).join(' · ') : 'No hands';
  if (MPK_GEST.clap(poses, t)) {
    if (MPK_GEST.phase === 'armed') { mpkGestSay('Opening swipe compare.'); mpkGestAskYears(); return; }
    if (MPK_GEST.phase === 'swipe') { mpkSwipeClose(); mpkGestPhase('armed'); mpkGestSay('Closed. Clap to open again.'); return; }
  }
  if (MPK_GEST.phase !== 'swipe' || !MPK_GEST.maps) return;
  const cursor = document.getElementById('mpk-sw-cursor'), now = document.getElementById('mpk-gest-now');
  // a frame or two without a hand (motion blur) does not break a pinch or a hold
  if (poses.length === 1) MPK_GEST.lastSeen = t;
  else if (!poses.length && t - (MPK_GEST.lastSeen || 0) < 250) return;
  if (poses.length !== 1) {
    MPK_GEST.pinchFrom = null; MPK_GEST.hold = { pose: null, since: t };
    if (cursor) cursor.hidden = true;
    if (now) now.textContent = poses.length ? 'Two hands: clap to close' : 'Show one hand to the camera';
    return;
  }
  const p = poses[0];
  // camera's central 70% spans the whole screen, smoothed
  const tx = Math.max(0, Math.min(1, (p.x - 0.15) / 0.7)), ty = Math.max(0, Math.min(1, (p.y - 0.15) / 0.7));
  const cur = MPK_GEST.cur = MPK_GEST.cur ? { x: MPK_GEST.cur.x + (tx - MPK_GEST.cur.x) * 0.35, y: MPK_GEST.cur.y + (ty - MPK_GEST.cur.y) * 0.35 } : { x: tx, y: ty };
  if (cursor) { cursor.hidden = false; cursor.style.left = (cur.x * 100) + '%'; cursor.style.top = (cur.y * 100) + '%'; cursor.dataset.pose = p.pose; }
  if (MPK_GEST.hold.pose !== p.pose) MPK_GEST.hold = { pose: p.pose, since: t };
  const held = t - MPK_GEST.hold.since;
  const m = MPK_GEST.maps.after;
  if (now) now.textContent = MPK_POSE_LABEL[p.pose];
  if (p.pose === 'open' || p.pose === 'point') { mpkSwipeSet(cur.x); MPK_GEST.pinchFrom = null; }
  else if (p.pose === 'pinch') {
    if (MPK_GEST.pinchFrom) {
      const c = m.getContainer();
      m.panBy([-(cur.x - MPK_GEST.pinchFrom.x) * c.clientWidth * 1.4, -(cur.y - MPK_GEST.pinchFrom.y) * c.clientHeight * 1.4], { duration: 0 });
    }
    MPK_GEST.pinchFrom = { ...cur };
  } else {
    MPK_GEST.pinchFrom = null;
    if (p.pose === 'victory' && held > 350) m.setZoom(Math.min(19, m.getZoom() + 0.02));
    if (p.pose === 'fist' && held > 350) m.setZoom(Math.max(12, m.getZoom() - 0.02));
  }
}
