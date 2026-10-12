"""Apply MPK's approved building plans (Pelan Bangunan Lulus) to the Teluk Kalong buildings.

Source: MPK's register of approved building plans for Teluk Kalong (966 records: file and lot
number, approval date and status, building type, plan geometry digitised from the CAD plans):
  https://digitalearthgeojson.s3.ap-southeast-5.amazonaws.com/Pelan_Bangunan_Teluk_Kalong_Lulus.geojson

Run after tools/build_mpk_illegal.py. For every Teluk Kalong building inside the planning
boundary (mpk/mpk_buildings.geojson), the class is decided from the approved plans; it replaces
the older "on an approved lot" rule digitised from MPK's map:
  lulus        an approved building plan covers the building (legal)
  mockup       on the API's suspect list and no approved plan covers it (suspected)
  tiada_pelan  no approved building plan on record (not verified)
A plan covers a building when a plan polygon holds the building's centre, the building holds a
plan polygon's centre, or at least two vertices of the plan's CAD outline lie on / within 2 m of
the footprint. The first run keeps each building's previous class in `asal`, so the script can
be re-run on its own output.

Also writes mpk/pelan_lulus.geojson: the plans for the map (geometry collections split, applicant
and architect names left out).

  python tools/apply_pelan_lulus.py [path-or-url-of-the-geojson]
"""
import json
import math
import os
import sys
import urllib.request
from collections import Counter, defaultdict

URL = 'https://digitalearthgeojson.s3.ap-southeast-5.amazonaws.com/Pelan_Bangunan_Teluk_Kalong_Lulus.geojson'
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'mpk')
BUILDINGS = os.path.join(ROOT, 'mpk_buildings.geojson')
OUT_PLANS = os.path.join(ROOT, 'pelan_lulus.geojson')
EXPECTED = {'records': 966, 'lulus': 345, 'mockup': 26, 'tiada_pelan': 1183}   # 2026 manual footprints
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


def round_geom(g):
    t, c = g['type'], g['coordinates']
    if t == 'Point':
        return {'type': t, 'coordinates': r6(c)}
    if t in ('LineString', 'MultiPoint'):
        return {'type': t, 'coordinates': [r6(x) for x in c]}
    if t in ('Polygon', 'MultiLineString'):
        return {'type': t, 'coordinates': [[r6(x) for x in ring] for ring in c]}
    return {'type': t, 'coordinates': [[[r6(x) for x in ring] for ring in poly] for poly in c]}


def main():
    plans = load(sys.argv[1] if len(sys.argv) > 1 else URL)['features']
    assert len(plans) == EXPECTED['records'], ('plan records', len(plans))
    data = load(BUILDINGS)
    feats = data['features']
    tk = [f for f in feats if f['properties']['kawasan'] == 'tk' and f['properties'].get('dalam')]

    grid = defaultdict(list)
    for i, f in enumerate(tk):
        ring = f['geometry']['coordinates'][0]
        xs, ys = [c[0] for c in ring], [c[1] for c in ring]
        for gx in range(int(min(xs) / GRID), int(max(xs) / GRID) + 1):
            for gy in range(int(min(ys) / GRID), int(max(ys) / GRID) + 1):
                grid[(gx, gy)].append(i)

    covered = defaultdict(list)                       # building index -> plans covering it
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
            if covers(rings, pts, tk[i]['geometry']['coordinates'][0]):
                covered[i].append(p['properties'])
                hit.add(p['properties']['ID_Rekod'])

    for i, f in enumerate(tk):
        pr = f['properties']
        pr.setdefault('asal', pr['kategori'])
        for k in [k for k in pr if k.startswith('pelan_')]:
            del pr[k]
        if i in covered:
            latest = max(covered[i], key=lambda q: q.get('Tarikh_Lulus') or '')
            pr['kategori'] = 'lulus'
            pr['pelan_fail'] = latest.get('No_Fail') or ''
            pr['pelan_tarikh'] = latest.get('Tarikh_Lulus') or ''
            pr['pelan_status'] = latest.get('Status_Kelulusan') or ''
            pr['pelan_jenis'] = latest.get('Jenis_Bangunan') or ''
            pr['pelan_n'] = len(covered[i])
        else:
            pr['kategori'] = 'mockup' if pr['asal'] == 'mockup' else 'tiada_pelan'

    counts = Counter(f['properties']['kategori'] for f in tk)
    print('Teluk Kalong buildings:', dict(counts), '· plans covering a building:', len(hit), 'of', len(plans))
    if os.environ.get('MPK_NO_EXPECT') != '1':          # set it to 1 when the footprints themselves changed
        for k in ('lulus', 'mockup', 'tiada_pelan'):
            assert counts[k] == EXPECTED[k], (k, counts[k], EXPECTED[k])
    with open(BUILDINGS, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, separators=(',', ':'))

    # the plans for the map: one feature per record and kind (outlines, filled shapes, points),
    # coordinates to ~10 cm, repeated vertices and duplicate pieces dropped
    out = []
    for p in plans:
        pr, g = p['properties'], p['geometry']
        if not g:
            continue
        props = {'rekod': pr['ID_Rekod'], 'fail': pr.get('No_Fail') or '', 'lot': pr.get('No_Lot') or '',
                 'tarikh': pr.get('Tarikh_Lulus') or '', 'status': pr.get('Status_Kelulusan') or '',
                 'jenis': pr.get('Jenis_Bangunan') or '', 'luas': round(pr.get('Luas_Bangunan_mp') or 0),
                 'bangunan': pr['ID_Rekod'] in hit}
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
                for l in c:
                    if len(clean(l)) > 1:
                        add(lines, clean(l))
            elif t == 'Point':
                add(points, r6(c))
            elif t == 'MultiPoint':
                for q in c:
                    add(points, r6(q))
        for kind, geom in (('MultiPolygon', polys), ('MultiLineString', lines), ('MultiPoint', points)):
            if geom:
                out.append({'type': 'Feature', 'properties': props, 'geometry': {'type': kind, 'coordinates': geom}})
    with open(OUT_PLANS, 'w', encoding='utf-8') as f:
        json.dump({'type': 'FeatureCollection', 'features': out}, f, ensure_ascii=False, separators=(',', ':'))
    print('wrote', BUILDINGS, 'and', OUT_PLANS, f'({len(out)} plan shapes)')


if __name__ == '__main__':
    main()
