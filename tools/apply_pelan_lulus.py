"""Apply MPK's registers of building plans to the buildings.

Sources (MPK registers: file and lot number, decision and date, building type, plan geometry
digitised from the CAD plans):
  tk     Pelan Bangunan Teluk Kalong Lulus, 966 records, all approved
         https://digitalearthgeojson.s3.ap-southeast-5.amazonaws.com/Pelan_Bangunan_Teluk_Kalong_Lulus.geojson
  kedai  Pelan Bangunan Kedai (shops, Chukai and Binjai), 4,547 records; only those with a geometry
         inside Kemaman are shown. Approved (LULUS, LULUS BERSYARAT / DGN SYARAT, DILULUSKAN and the
         misspellings LUUS / ULUS) and rejected (TOLAK) records decide a building's status; records
         with no decision (blank, -9999, TAMBAHAN, place names, dates) are drawn as plan drawings
         only. Records without geometry, or whose coordinates fall outside Kemaman, cannot be placed.
         https://digitalearthgeojson.s3.ap-southeast-5.amazonaws.com/building/Pelan_Bangunan_Kedai.geojson

  rekod  every record of the Teluk Kalong register (mpk/rekod_semua.geojson, 23,214 records, from
         tools/build_rekod_semua.py): only each record's centre is known. A record belongs to the
         building whose footprint holds its centre. Where no plan drawing above covers a building, an
         approved record on it (LULUS / LUUS / DILULUSKAN / LULUS BERSYARAT) makes it legal and a TOLAK
         record makes it rejected; SOKONG and SEDIA ADA are not decisions.

Run after tools/build_mpk_manual.py. A plan covers a building when a plan polygon holds the
building's centre, the building holds a plan polygon's centre, or at least two vertices of the
plan's CAD outline lie on / within 2 m of the footprint. In mpk/mpk_buildings.geojson:
  Teluk Kalong (inside the boundary)
    lulus        an approved plan covers it (legal)
    tolak        only a rejected plan covers it (suspected)
    mockup       on the API's suspect list, no plan (suspected)
    tiada_pelan  no plan on record (not verified)
  Binjai - Chukai corridor
    lulus        an approved plan covers it (legal)
    tolak        only a rejected plan covers it (suspected)
    koridor      no plan: the road-reserve rule decides in the browser
Buildings outside the study areas (mpk/mpk_buildings_luar.geojson) only get the plan's details.
Every covered building gets pelan_fail, pelan_tarikh, pelan_status, pelan_jenis, pelan_n and
pelan_sumber (`Rekod` when it comes from a register record). Every building with register records
gets rekod_n (records on it), rekod_sah (with a valid status) and, from its most telling record,
rekod_id, rekod_fail, rekod_pemohon, rekod_jenis, rekod_status and rekod_tarikh. The first run keeps each study building's previous class in `asal`, so the script
can be re-run on its own output.

Also writes mpk/pelan_lulus.geojson: the approved and rejected plans for the map (applicant and
architect names left out).

  python tools/apply_pelan_lulus.py [--tk FILE_OR_URL] [--kedai FILE_OR_URL]
"""
import argparse
import json
import math
import os
import re
import urllib.request
from collections import Counter, defaultdict

URL = 'https://digitalearthgeojson.s3.ap-southeast-5.amazonaws.com/Pelan_Bangunan_Teluk_Kalong_Lulus.geojson'
REKOD = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'mpk', 'rekod_semua.geojson')
URL_KEDAI = 'https://digitalearthgeojson.s3.ap-southeast-5.amazonaws.com/building/Pelan_Bangunan_Kedai.geojson'
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'mpk')
BUILDINGS = os.path.join(ROOT, 'mpk_buildings.geojson')
OTHERS = os.path.join(ROOT, 'mpk_buildings_luar.geojson')
OUT_PLANS = os.path.join(ROOT, 'pelan_lulus.geojson')
OUT_REGISTER = os.path.join(ROOT, 'pelan_kedai_daftar.json')   # every shop record, mapped or not
NO_VALUE = {'0', '-9', '-99', '-999', '-9999', '-999999', 'None'}   # placeholders the register uses for blank
KEMAMAN = (103.13, 4.0, 103.65, 4.6)                 # district box: shop records outside it are mis-placed
EXPECTED = {'records': 966, 'kedai_records': 4547, 'kedai_approvals': 414}   # 414 as in MPK's register summary
EXPECTED_CLASSES = {('tk', 'lulus'): 347, ('tk', 'mockup'): 25, ('tk', 'tiada_pelan'): 1182,
                    ('bbc', 'lulus'): 40, ('bbc', 'tolak'): 1, ('bbc', 'koridor'): 374}
KX = 111320 * math.cos(math.radians(4.27))
KY = 111320
GRID = 0.001                                         # ~110 m index cells


def load(src):
    if src.startswith('http'):
        with urllib.request.urlopen(src, timeout=120) as r:
            return json.loads(r.read().decode('utf-8'))
    with open(src, encoding='utf-8') as f:
        return json.load(f)


def parts(g):
    """(closed rings, loose vertices) of a geometry: polygons and closed lines are rings;
    open CAD lines and points give vertices."""
    rings, pts = [], []
    if not g:
        return rings, pts
    t, c = g['type'], g.get('coordinates')
    if t == 'Polygon':
        rings.append(c[0])
    elif t == 'MultiPolygon':
        rings += [p[0] for p in c]
    elif t in ('LineString', 'MultiLineString'):
        for line in ([c] if t == 'LineString' else c):
            if len(line) >= 4 and line[0] == line[-1]:
                rings.append(line)
            else:
                pts += line
    elif t == 'Point':
        pts.append(c)
    elif t == 'MultiPoint':
        pts += c
    elif t == 'GeometryCollection':
        for sub in g['geometries']:
            a, b = parts(sub)
            rings += a
            pts += b
    return rings, pts


def inside(pt, ring):
    x, y = pt[0], pt[1]
    ins, j = False, len(ring) - 1
    for i in range(len(ring)):
        xi, yi = ring[i][0], ring[i][1]
        xj, yj = ring[j][0], ring[j][1]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
            ins = not ins
        j = i
    return ins


def seg_dist(p, a, b):
    px, py, ax, ay, bx, by = p[0] * KX, p[1] * KY, a[0] * KX, a[1] * KY, b[0] * KX, b[1] * KY
    dx, dy = bx - ax, by - ay
    L = dx * dx + dy * dy
    t = 0 if L == 0 else max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / L))
    return math.hypot(px - ax - t * dx, py - ay - t * dy)


def on_footprint(p, ring, tol=2.0):
    return inside(p, ring) or any(seg_dist(p, ring[i], ring[i + 1]) <= tol for i in range(len(ring) - 1))


def centre(ring):
    pts = ring[:-1] if ring[0] == ring[-1] else ring
    return [sum(c[0] for c in pts) / len(pts), sum(c[1] for c in pts) / len(pts)]


def covers(rings, pts, footprint):
    c = centre(footprint)
    if any(inside(c, r) for r in rings) or any(len(r) > 2 and inside(centre(r), footprint) for r in rings):
        return True
    if pts:
        k = sum(1 for q in pts if on_footprint(q, footprint))
        return k >= 2 or (len(pts) == 1 and k == 1)
    return False


def r6(c):
    return [round(c[0], 6), round(c[1], 6)]                # ~10 cm


def decision(status):
    """'lulus' (approved), 'tolak' (rejected) or None (blank / not a decision)."""
    t = (status or '').upper()
    if 'TOLAK' in t:
        return 'tolak'
    if re.search(r'LULUS|LUUS|ULUS|DILULUSKAN', t):
        return 'lulus'
    return None


def group_of(status):
    """Status group as in MPK's register summary: Lulus, Lulus Bersyarat, Tolak or Tidak dinyatakan."""
    t = (status or '').upper()
    if 'TOLAK' in t:
        return 'Tolak'
    if re.search(r'SYARAT|SYRT|SYARA', t):
        return 'Lulus Bersyarat'
    return 'Lulus' if decision(status) == 'lulus' else 'Tidak dinyatakan'


def is_approval(pr):
    """An approval-related record: it states a decision or carries an approval date."""
    tl = str(pr.get('Tarikh_Lulus') or '').strip()
    return bool(decision(pr.get('Status_Kelulusan')) or (tl and tl not in ('-9999', 'None')))


def centre_of(g):
    rings, pts = parts(g)
    allc = [c for r in rings for c in r] + pts
    if not allc:
        return None
    return sum(c[0] for c in allc) / len(allc), sum(c[1] for c in allc) / len(allc)


def plan_shapes(g):
    """Polygons, lines and points of a plan, coordinates to ~10 cm, repeats dropped."""
    polys, lines, points, seen = [], [], [], set()

    def add(bucket, item):
        key = json.dumps(item)
        if key not in seen:
            seen.add(key)
            bucket.append(item)

    def clean(line):
        o = []
        for c in line:
            c = r6(c)
            if not o or o[-1] != c:
                o.append(c)
        return o

    for sub in (g['geometries'] if g['type'] == 'GeometryCollection' else [g]):
        if not sub or not sub.get('coordinates'):
            continue
        t, c = sub['type'], sub['coordinates']
        if t == 'Polygon':
            add(polys, [clean(r) for r in c])
        elif t == 'MultiPolygon':
            for poly in c:
                add(polys, [clean(r) for r in poly])
        elif t == 'LineString':
            if len(clean(c)) > 1:
                add(lines, clean(c))
        elif t == 'MultiLineString':
            for line in c:
                if len(clean(line)) > 1:
                    add(lines, clean(line))
        elif t == 'Point':
            add(points, r6(c))
        elif t == 'MultiPoint':
            for q in c:
                add(points, r6(q))
    return (('MultiPolygon', polys), ('MultiLineString', lines), ('MultiPoint', points))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--tk', default=URL)
    ap.add_argument('--kedai', default=URL_KEDAI)
    ap.add_argument('--rekod', default=REKOD)
    args = ap.parse_args()

    plans, skipped = [], Counter()
    tk_src = load(args.tk)['features']
    assert len(tk_src) == EXPECTED['records'], ('Teluk Kalong plan records', len(tk_src))
    for p in tk_src:
        pr = p['properties']
        plans.append({'key': 'T%d' % pr['ID_Rekod'], 'sumber': 'Teluk Kalong', 'pr': pr, 'geometry': p['geometry'],
                      'keputusan': decision(pr.get('Status_Kelulusan')) or 'lulus'})   # the register lists approvals
    kedai_src = load(args.kedai)['features']
    assert len(kedai_src) == EXPECTED['kedai_records'], ('shop plan records', len(kedai_src))
    for n, p in enumerate(kedai_src, 1):
        pr, g = p['properties'], p['geometry']
        c = centre_of(g) if g else None
        if c is None:
            skipped['no geometry'] += 1
            continue
        if not (KEMAMAN[0] <= c[0] <= KEMAMAN[2] and KEMAMAN[1] <= c[1] <= KEMAMAN[3]):
            skipped['outside Kemaman (mis-placed)'] += 1
            continue
        k = decision(pr.get('Status_Kelulusan')) or 'tiada'      # tiada: drawing only, no decision
        plans.append({'key': 'K%d' % n, 'sumber': 'Kedai', 'pr': pr, 'geometry': g, 'keputusan': k})

    data = load(BUILDINGS)
    others = load(OTHERS)
    study = [f for f in data['features'] if (f['properties']['kawasan'] == 'tk' and f['properties'].get('dalam'))
             or f['properties']['kawasan'] == 'bbc']
    allb = study + others['features']

    def ring_of(f):
        g = f['geometry']
        return g['coordinates'][0] if g['type'] == 'Polygon' else max((q[0] for q in g['coordinates']), key=len)

    grid = defaultdict(list)
    for i, f in enumerate(allb):
        ring = ring_of(f)
        xs, ys = [c[0] for c in ring], [c[1] for c in ring]
        for gx in range(int(min(xs) / GRID), int(max(xs) / GRID) + 1):
            for gy in range(int(min(ys) / GRID), int(max(ys) / GRID) + 1):
                grid[(gx, gy)].append(i)

    covered = defaultdict(lambda: {'lulus': [], 'tolak': [], 'tiada': []})
    hit = set()
    for p in plans:
        rings, pts = parts(p['geometry'])
        allc = [c for r in rings for c in r] + pts
        if not allc:
            continue
        xs, ys = [c[0] for c in allc], [c[1] for c in allc]
        cand = set()
        for gx in range(int(min(xs) / GRID) - 1, int(max(xs) / GRID) + 2):
            for gy in range(int(min(ys) / GRID) - 1, int(max(ys) / GRID) + 2):
                cand.update(grid.get((gx, gy), ()))
        for i in cand:
            if covers(rings, pts, ring_of(allb[i])):
                covered[i][p['keputusan']].append(p)
                hit.add(p['key'])

    # the register's records, by the footprint that holds their centre
    on_bldg = defaultdict(list)
    rekod_src = load(args.rekod)['features']
    for r in rekod_src:
        pt = r['geometry']['coordinates']
        for i in grid.get((int(pt[0] / GRID), int(pt[1] / GRID)), ()):
            if inside(pt, ring_of(allb[i])):
                on_bldg[i].append(r['properties'])
                break
    rekod_used = Counter()
    for i, recs in on_bldg.items():
        if covered.get(i) and (covered[i]['lulus'] or covered[i]['tolak']):
            continue                                 # a plan drawing already decides it
        for q in recs:
            k = 'lulus' if q['k'] in ('lulus', 'syarat') else 'tolak' if q.get('c') == 'Tolak' else None
            if k:
                covered[i][k].append({'key': 'R%d' % q['i'], 'sumber': 'Rekod', 'keputusan': k,
                                      'pr': {'No_Fail': q.get('f'), 'Tarikh_Lulus': q.get('t'), 'Jenis_Bangunan': q.get('j'),
                                             'Status_Kelulusan': q.get('s') or q['c'].upper()}})
                rekod_used[k] += 1

    def telling(q):                                  # valid status first, then the most filled-in, then the latest
        return (q['k'] != 'tiada', sum(1 for x in 'flpjt' if q.get(x)), q.get('t') or '')

    for i, f in enumerate(allb):
        pr = f['properties']
        for k in [k for k in pr if k.startswith('rekod_')]:
            del pr[k]
        recs = on_bldg.get(i)
        if recs:
            pr['rekod_n'] = len(recs)
            pr['rekod_sah'] = sum(1 for q in recs if q['k'] != 'tiada')
            q = max(recs, key=telling)
            if telling(q)[0] or telling(q)[1]:
                pr['rekod_id'] = q['i']
                for key, x in (('rekod_fail', 'f'), ('rekod_pemohon', 'p'), ('rekod_jenis', 'j'), ('rekod_tarikh', 't')):
                    if q.get(x):
                        pr[key] = q[x]
                pr['rekod_status'] = q['c'] if q['k'] != 'tiada' else ''
                if not pr['rekod_status']:
                    del pr['rekod_status']

    for i, f in enumerate(allb):
        pr = f['properties']
        in_study = i < len(study)
        if in_study:
            pr.setdefault('asal', pr['kategori'])
        for k in [k for k in pr if k.startswith('pelan_')]:
            del pr[k]
        c = covered.get(i)
        use = c and (c['lulus'] or c['tolak'])
        if use:
            latest = max(use, key=lambda q: q['pr'].get('Tarikh_Lulus') or '')
            q = latest['pr']
            pr['pelan_fail'] = q.get('No_Fail') or ''
            pr['pelan_tarikh'] = q.get('Tarikh_Lulus') or ''
            pr['pelan_status'] = q.get('Status_Kelulusan') or ''
            pr['pelan_jenis'] = q.get('Jenis_Bangunan') or ''
            pr['pelan_n'] = len(use)
            pr['pelan_sumber'] = latest['sumber']
        if not in_study:
            continue
        if c and c['lulus']:
            pr['kategori'] = 'lulus'
        elif c and c['tolak']:
            pr['kategori'] = 'tolak'
        elif pr['kawasan'] == 'tk':
            pr['kategori'] = 'mockup' if pr['asal'] == 'mockup' else 'tiada_pelan'
        else:
            pr['kategori'] = 'koridor'

    counts = Counter((f['properties']['kawasan'], f['properties']['kategori']) for f in study)
    used = Counter((p['sumber'], p['keputusan']) for p in plans)
    print('plans used:', dict(used), '| shop records left out:', dict(skipped))
    print('plans covering a building:', len(hit), 'of', len(plans))
    print('study-area buildings:', dict(sorted(counts.items())))
    print('register records on a building:', sum(len(v) for v in on_bldg.values()), 'of', len(rekod_src),
          '| buildings with records:', len(on_bldg), '| decided by a record alone:', dict(rekod_used))
    print('outside the study areas with a plan:', sum(1 for f in others['features'] if 'pelan_fail' in f['properties']))
    if os.environ.get('MPK_NO_EXPECT') != '1' and EXPECTED_CLASSES:   # 1 when the footprints themselves changed
        for k, n in EXPECTED_CLASSES.items():
            assert counts[k] == n, (k, counts[k], n)
    with open(BUILDINGS, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, separators=(',', ':'))
    with open(OTHERS, 'w', encoding='utf-8') as f:
        json.dump(others, f, ensure_ascii=False, separators=(',', ':'))

    # the plans for the map: one feature per record and kind (outlines, filled shapes, points)
    out = []
    for p in plans:
        pr, g = p['pr'], p['geometry']
        if not g:
            continue
        props = {'rekod': p['key'], 'sumber': p['sumber'], 'keputusan': p['keputusan'],
                 'fail': pr.get('No_Fail') or '', 'lot': pr.get('No_Lot') or '',
                 'tarikh': pr.get('Tarikh_Lulus') or '', 'status': pr.get('Status_Kelulusan') or '',
                 'jenis': pr.get('Jenis_Bangunan') or '', 'luas': round(pr.get('Luas_Bangunan_mp') or 0),
                 'pemohon': (pr.get('Nama_Pemohon') or '').strip(),
                 'bangunan': p['key'] in hit}
        for kind, geom in plan_shapes(g):
            if geom:
                out.append({'type': 'Feature', 'properties': props, 'geometry': {'type': kind, 'coordinates': geom}})
    with open(OUT_PLANS, 'w', encoding='utf-8') as f:
        json.dump({'type': 'FeatureCollection', 'features': out}, f, ensure_ascii=False, separators=(',', ':'))
    print('wrote', BUILDINGS, OTHERS, 'and', OUT_PLANS, f'({len(out)} plan shapes)')

    # the shop register: every record of Pelan Bangunan Kedai, approved or not, on the map or not
    def clean(v):
        v = str(v if v is not None else '').strip()
        return '' if v in NO_VALUE else v

    reg = []
    for n, p in enumerate(kedai_src, 1):
        pr, g = p['properties'], p['geometry']
        c = centre_of(g) if g else None
        r = {'n': n, 'fail': clean(pr.get('No_Fail')), 'lot': clean(pr.get('No_Lot')), 'pemohon': clean(pr.get('Nama_Pemohon')),
             'arkitek': clean(pr.get('Arkitek')), 'jenis': clean(pr.get('Jenis_Bangunan')), 'status': clean(pr.get('Status_Kelulusan')),
             'kumpulan': group_of(pr.get('Status_Kelulusan')) if is_approval(pr) else 'Tiada keputusan',
             'tarikh': clean(pr.get('Tarikh_Lulus'))[:10]}
        if c is None:
            r['peta'] = 'tiada_geo'
        elif not (KEMAMAN[0] <= c[0] <= KEMAMAN[2] and KEMAMAN[1] <= c[1] <= KEMAMAN[3]):
            r['peta'] = 'luar'
        else:
            r['peta'] = 'ya'
            r['c'] = [round(c[0], 6), round(c[1], 6)]
            if ('K%d' % n) in hit:
                r['bangunan'] = 1
        reg.append({k: v for k, v in r.items() if v != ''})
    reg.sort(key=lambda r: (r.get('tarikh', '0'), -r['n']), reverse=True)
    print('shop register:', len(reg), 'records', dict(Counter(r['kumpulan'] for r in reg)), dict(Counter(r['peta'] for r in reg)))
    if os.environ.get('MPK_NO_EXPECT') != '1':
        assert len(reg) == EXPECTED['kedai_records'], ('shop records', len(reg))
        assert sum(r['kumpulan'] != 'Tiada keputusan' for r in reg) == EXPECTED['kedai_approvals']
    with open(OUT_REGISTER, 'w', encoding='utf-8') as f:
        json.dump(reg, f, ensure_ascii=False, separators=(',', ':'))

if __name__ == '__main__':
    main()
