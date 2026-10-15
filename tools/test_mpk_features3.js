const assert = require('assert');
Object.assign(global, require('../mpk.js'));
Object.assign(global, require('../mpk-features.js'));
const F = require('../mpk-features3.js');

const near = (a, b, tol) => assert.ok(Math.abs(a - b) <= tol, `${a} not within ${tol} of ${b}`);

// Geometry: a point in a square lot, not in its hole; distance to a road line in metres
const sq = [[103.4, 4.2], [103.401, 4.2], [103.401, 4.201], [103.4, 4.201], [103.4, 4.2]];
const hole = [[103.4004, 4.2004], [103.4006, 4.2004], [103.4006, 4.2006], [103.4004, 4.2006], [103.4004, 4.2004]];
assert.ok(F.mpkInGeom([103.4002, 4.2002], { type: 'Polygon', coordinates: [sq] }));
assert.ok(!F.mpkInGeom([103.4005, 4.2005], { type: 'Polygon', coordinates: [sq, hole] }));
assert.ok(F.mpkInGeom([103.4002, 4.2002], { type: 'MultiPolygon', coordinates: [[sq]] }));
const road = { type: 'MultiLineString', coordinates: [[[103.4, 4.2], [103.41, 4.2]]] };
near(F.mpkDistToLines(mpkOffset([103.405, 4.2], 0, 25), road), 25, 0.1);
near(F.mpkDistToLines(mpkOffset([103.41, 4.2], 90, 40), road), 40, 0.1);   // past the end: to the end point
assert.deepStrictEqual(F.mpkGeomCentre({ type: 'MultiLineString', coordinates: [[[0, 0], [2, 0]], [[0, 2], [2, 2]]] }), [1, 1]);

// Site checks: inside the reserve is the first, red check; a lot without plans is a warning
const c1 = F.mpkSiteChecks({ reserve: { d: 6, rizab: 10, inside: true }, lot: true, zone: 'Industrial',
  plans: { approved: 0 }, buildings: { n: 2, suspected: 1 } });
assert.deepStrictEqual(c1.map(c => c.level), ['bad', 'warn', 'bad', 'info']);
// off the lot map: say so, and word the rest as "within 40 m"; inside the lot map but on no lot: a warning
const c2 = F.mpkSiteChecks({ reserve: null, lot: false, lotMapped: false, where: 'within 40 m', zone: null,
  plans: { approved: 1 }, buildings: { n: 0, suspected: 0 } });
assert.deepStrictEqual(c2.map(c => c.level), ['info', 'ok']);
assert.strictEqual(c2[1].title, '1 approved building plan within 40 m');
assert.strictEqual(F.mpkSiteChecks({ lot: false, lotMapped: true, plans: { approved: 0 }, buildings: { n: 0 } })[0].title, 'No cadastral lot here');
assert.strictEqual(F.mpkSiteChecks({ reserve: { d: 30, rizab: 10, inside: false }, lot: true, zone: null,
  plans: { approved: 2 }, buildings: { n: 1, suspected: 0 } })[1].title, '2 approved building plans on this lot');

// Notice: reference from the date and Plus Code; both languages fill every row and name the days
const p = { plus_code: '6PP56CGH+C3R', lat: 4.2, lng: 103.4, lot: '', upi: '110312', area_m2: 3039.4 };
assert.strictEqual(F.mpkNoticeRef(p, '2026-10-13'), 'MPK/KB/2026/6PP56CGHC3R');
for (const lang of ['en', 'ms']) {
  const c = F.mpkNoticeContent(lang, p, 'Binjai', 'Encroaching road reserve', 21, '2026-10-13');
  assert.strictEqual(c.lines.length, 7);
  assert.strictEqual(c.lines[2][1], F.MPK_NOTICE_TEXT[lang].none);          // no lot on record
  assert.strictEqual(c.lines[5][1], '3,039 m²');
  assert.ok(c.body.some(t => t.includes('21')));
  assert.ok(/DRAF/.test(c.T.draft));
}

// Notice as an MPK letter: dates as MPK writes them, the addressee, bold words marked, the days named
assert.strictEqual(F.mpkNoticeDate('2026-10-05', 'ms'), '05 Okt, 2026');
assert.strictEqual(F.mpkNoticeDate('2019-06-03', 'en'), '03 Jun, 2019');
assert.strictEqual(F.mpkNoticeHijri('2019-06-03'), '29 Ramadhan, 1440');                // MPK's own letter of that day
for (const lang of ['en', 'ms']) {
  const L = F.mpkNoticeLetter(lang, { ...p, lot: '3351' }, 'Teluk Kalong', 'Finding.', 21, '2026-10-13');
  assert.deepStrictEqual(L.to.slice(1), ['Lot 3351,', 'Teluk Kalong,', '24000 Kemaman', 'Terengganu.']);
  assert.strictEqual(L.paras.length, 3);
  assert.ok(L.paras[1].includes('**21 ') && L.paras[0].includes('**Plus Code 6PP56CGH+C3R**') && !L.paras[0].includes('..'));
}
assert.strictEqual(F.mpkNoticeLetter('ms', p, 'X', 'Y', 30, '2026-10-13').to[1], 'Plus Code 6PP56CGH+C3R,');   // no lot
assert.deepStrictEqual(F.mpkRichSegs('a **b** c'), [{ t: 'a ', b: false }, { t: 'b', b: true }, { t: ' c', b: false }]);

// Notice finding in the notice's language
assert.ok(F.mpkNoticeReason('ms', { jarak_jalan_m: 4.2 }, 'rizab', 10).startsWith('Bangunan dalam rizab jalan: 4.2 m'));
assert.ok(F.mpkNoticeReason('en', {}, 'tolak', 10).includes('rejected'));
assert.ok(F.mpkNoticeReason('ms', {}, 'mockup', 10).startsWith('Tiada pelan'));
assert.ok(F.mpkNoticeReason('ms', {}, 'manual', 10).startsWith('Ditanda'));

// Portfolio: one applicant whatever the spelling; records counted once; shop records without a drawing
assert.strictEqual(F.mpkApplicantKey('Rayhar Properties Sdn. Bhd.'), F.mpkApplicantKey('RAYHAR PROPERTIES'));
assert.strictEqual(F.mpkApplicantKey('-999'), '');
const pl = (rekod, pemohon, keputusan, tarikh, bangunan = false) => ({ properties: { rekod, pemohon, keputusan, tarikh, bangunan, fail: 'F' + rekod } });
const port = F.mpkPortfolios([
  pl('K1', 'RAYHAR PROPERTIES', 'lulus', '2010-08-01', true), pl('K1', 'RAYHAR PROPERTIES', 'lulus', '2010-08-01', true),
  pl('K2', 'Rayhar Properties Sdn. Bhd', 'lulus', '2016-03-08'), pl('K3', 'RAYHAR PROPERTIES SDN BHD', 'tolak', '2011-01-11'),
  pl('T9', 'TJ OILLAND SERVICES SDN BHD', 'lulus', '2006-01-01'), pl('K4', '', 'lulus', '2006-01-01'),
], [{ peta: 'tiada_geo', pemohon: 'RAYHAR PROPERTIES', fail: 'X' }, { peta: 'ya', pemohon: 'RAYHAR PROPERTIES', fail: 'Y' }]);
assert.strictEqual(port.length, 2);
assert.deepStrictEqual([port[0].records, port[0].lulus, port[0].tolak, port[0].built, port[0].off, port[0].first, port[0].last, port[0].files],
  [3, 2, 1, 1, 1, 2010, 2016, 4]);
assert.strictEqual(port[0].name, 'RAYHAR PROPERTIES');

// Timeline: one count per record and year, gaps filled, undated and undecided records left out
const yrs = F.mpkApprovalYears([pl('A', 'x', 'lulus', '2004-02-11'), pl('A', 'x', 'lulus', '2004-02-11'), pl('B', 'x', 'tolak', '2006-07-23'),
  pl('C', 'x', 'lulus', '2006-01-01'), pl('D', 'x', 'tiada', '2005-01-01'), pl('E', 'x', 'lulus', '')]);
assert.deepStrictEqual(yrs, [{ y: 2004, lulus: 1, tolak: 0 }, { y: 2005, lulus: 0, tolak: 0 }, { y: 2006, lulus: 1, tolak: 1 }]);

// Revenue: fee once, tax per year
assert.deepStrictEqual(F.mpkRecoverable(100, { fee: 2, cukai: 6 }, 3), { fee: 200, tax: 1800, total: 2000 });

console.log('mpk features3 tests passed');
