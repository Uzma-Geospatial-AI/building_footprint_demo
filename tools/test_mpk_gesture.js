const assert = require('assert');
const G = require('../mpk-gesture.js');

// Synthetic 21-point hand: wrist below the middle knuckle; `up` lists the straight fingers
// (index, middle, ring, pinky); pinch puts thumb and index tips together
function hand(cx, cy, { up = [], pinch = false, s = 0.1 } = {}) {
  const lm = Array.from({ length: 21 }, () => ({ x: cx, y: cy, z: 0 }));
  lm[0] = { x: cx, y: cy + s, z: 0 };
  [[5, 6, 7, 8, -0.3], [9, 10, 11, 12, 0], [13, 14, 15, 16, 0.25], [17, 18, 19, 20, 0.5]].forEach(([mcp, pip, dip, tip, dx], i) => {
    const x = cx + dx * s, straight = up.includes(['index', 'middle', 'ring', 'pinky'][i]);
    lm[mcp] = { x, y: cy, z: 0 };
    lm[pip] = { x, y: cy - 0.4 * s, z: 0 };
    lm[dip] = { x, y: cy - (straight ? 0.65 : 0.2) * s, z: 0 };
    lm[tip] = { x, y: cy - (straight ? 0.9 : -0.1) * s, z: 0 };
  });
  if (pinch) lm[8] = { x: cx - 0.3 * s, y: cy - 0.5 * s, z: 0 };
  lm[1] = { x: cx - 0.4 * s, y: cy + 0.7 * s, z: 0 };
  lm[2] = { x: cx - 0.6 * s, y: cy + 0.4 * s, z: 0 };
  lm[3] = { x: cx - 0.7 * s, y: cy + 0.1 * s, z: 0 };
  lm[4] = pinch ? { x: lm[8].x + 0.01 * s, y: lm[8].y, z: 0 } : { x: cx - 0.8 * s, y: cy - 0.1 * s, z: 0 };
  return lm;
}
module.exports = { hand };

if (require.main === module) {
  const pose = (o) => G.mpkHandPose(hand(0.5, 0.5, o)).pose;
  assert.strictEqual(pose({}), 'fist');
  assert.strictEqual(pose({ up: ['index'] }), 'point');
  assert.strictEqual(pose({ up: ['index', 'middle'] }), 'victory');
  assert.strictEqual(pose({ up: ['index', 'middle', 'ring', 'pinky'] }), 'open');
  assert.strictEqual(pose({ up: ['middle', 'ring', 'pinky'], pinch: true }), 'pinch');
  assert.strictEqual(pose({ up: ['middle', 'ring'] }), 'other');

  // Position is mirrored (selfie view): a hand on the camera's left is on the screen's right
  const p = G.mpkHandPose(hand(0.2, 0.5, { up: ['index'] }));
  assert.ok(Math.abs(p.x - 0.8) < 0.04 && Math.abs(p.size - 0.1) < 1e-9);

  // Open hand: 3 straight fingers is enough (easy to hit)
  assert.strictEqual(pose({ up: ['index', 'middle', 'ring'] }), 'open');

  // Hold trigger: open hand for 1 s fires once; stays quiet until the hand is lowered
  const open = [G.mpkHandPose(hand(0.5, 0.5, { up: ['index', 'middle', 'ring', 'pinky'] }))];
  const fist = [G.mpkHandPose(hand(0.5, 0.5))];
  const hold = G.mpkHoldDetector({ pose: 'open', ms: 1000, grace: 300 });
  // camera frames every 50 ms; returns the result at `to`, and whether it fired on the way
  const run = (h, poses, from, to) => { let fired = 0, r; for (let t = from; t <= to; t += 50) { r = h(poses, t); fired += r.fired; } return { ...r, n: fired }; };
  assert.deepStrictEqual(hold(open, 0), { progress: 0, fired: false });
  assert.strictEqual(run(hold, open, 50, 500).progress, 0.5);
  assert.strictEqual(hold([], 550).progress, 0.55);                              // one dropped frame: keeps going
  const r1 = run(hold, open, 600, 1500);
  assert.strictEqual(r1.n, 1);                                                  // fires once at 1 s, not again while held
  assert.deepStrictEqual(run(hold, fist, 1550, 1900), { progress: 0, fired: false, n: 0 });   // lowered -> re-armed
  assert.strictEqual(run(hold, open, 1950, 2950).n, 1);
  // a fist or no hand never fires; a gap longer than the grace restarts the count
  const h2 = G.mpkHoldDetector();
  assert.strictEqual(run(h2, fist, 0, 2000).n + run(h2, [], 2050, 4000).n, 0);
  run(h2, open, 5000, 5800);
  run(h2, [], 5850, 6300);
  assert.strictEqual(run(h2, open, 6350, 6500).progress, 0.15);

  // Years: digits, English words, Malay words
  const y = G.mpkParseYear;
  assert.strictEqual(y('2013'), 2013);
  assert.strictEqual(y('before 2019 please'), 2019);
  assert.strictEqual(y('twenty thirteen'), 2013);
  assert.strictEqual(y('twenty oh seven'), 2007);
  assert.strictEqual(y('twenty twenty five'), 2025);
  assert.strictEqual(y('two thousand and seven'), 2007);
  assert.strictEqual(y('dua ribu tiga belas'), 2013);
  assert.strictEqual(y('dua ribu dua puluh lima'), 2025);
  assert.strictEqual(y('dua ribu sebelas'), 2011);
  assert.strictEqual(y('tahun dua ribu tujuh'), 2007);
  assert.strictEqual(y('hello'), null);
  assert.strictEqual(y('twenty'), null);

  const frames = [{ release: 1, capture: '2007-03-16' }, { release: 2, capture: '2013-10-10' }, { release: 3, capture: '2025-12-04' }];
  assert.strictEqual(G.mpkNearestFrame(frames, 2013).release, 2);
  assert.strictEqual(G.mpkNearestFrame(frames, 2010).release, 1);
  assert.strictEqual(G.mpkNearestFrame(frames, 2030).release, 3);

  const c = G.mpkGestureCommand;
  assert.deepStrictEqual(c('zoom in'), { cmd: 'zoomin' });
  assert.deepStrictEqual(c('tolong zoom keluar'), { cmd: 'zoomout' });
  assert.deepStrictEqual(c('before 2017'), { cmd: 'before', year: 2017 });
  assert.deepStrictEqual(c('selepas dua ribu dua puluh empat'), { cmd: 'after', year: 2024 });
  assert.deepStrictEqual(c('tutup'), { cmd: 'close' });
  assert.strictEqual(c('nice map'), null);

  console.log('mpk gesture: all tests passed');
}
