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

  // Clap: apart, then together within the window -> one clap; held together -> no repeat
  const clap = G.mpkClapDetector();
  const two = (dx) => [hand(0.5 - dx, 0.5), hand(0.5 + dx, 0.5)].map(G.mpkHandPose);
  assert.strictEqual(clap(two(0.2), 0), false);
  assert.strictEqual(clap(two(0.04), 300), true);
  assert.strictEqual(clap(two(0.04), 400), false);
  assert.strictEqual(clap(two(0.2), 2000), false);
  assert.strictEqual(clap(two(0.04), 2300), true);
  // too slow: hands drift together over 2 s
  const slow = G.mpkClapDetector();
  slow(two(0.2), 0);
  assert.strictEqual(slow(two(0.04), 2000), false);
  assert.strictEqual(slow([G.mpkHandPose(hand(0.5, 0.5))], 0), false);

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
