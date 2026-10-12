"""Replace the MPK building footprints with the ones digitised by hand from Esri imagery of 24 Sep 2026.

Source (12,734 footprints, Teluk Kalong to Chukai, the extent of the MPK aerial basemap):
  https://digitalearthgeojson.s3.ap-southeast-5.amazonaws.com/building/aoi_mpk_esri_2026-09-24_z18.geojson
The file is labelled EPSG:32647 but its coordinates are Web Mercator (EPSG:3857); they are converted
to longitude / latitude here, and areas are recomputed in metres (the file's area_m2 is in Mercator
units, ~1.2% too large).

Run after tools/build_mpk_illegal.py (which writes the cadastral lots and the corridor roads) and
before tools/apply_pelan_lulus.py. In mpk/mpk_buildings.geojson:
  tk   Teluk Kalong: every manual footprint inside the planning boundary, dalam = true, kategori
       'mockup' when the footprint is one of the API's suspect buildings (is_mockup, matched by
       overlap), else 'tiada_lot' (apply_pelan_lulus.py then decides legal / not verified from MPK's
       approved building plans). Footprints outside the study areas are left out.
  bbc  Binjai – Bandar Chukai: manual footprints within CORRIDOR_HALF_M of the corridor road, with
       jarak_jalan_m = closest vertex distance to the road centreline.
  bpb  Bandar Putra – Berenjut lies outside the manual extent and is dropped (its road too).
Every footprint gets lot / upi from the NDCDB lot under its centre, a Plus Code, area_m2 and
sumber = 'manual_esri_20260924' (confidence 1: drawn by a person, not detected by a model).

  python tools/build_mpk_manual.py [--src FILE_OR_URL] [--api FILE_OR_URL]
"""
import argparse
import json
import math
import os
import urllib.request
from collections import Counter

SRC_URL = 'https://digitalearthgeojson.s3.ap-southeast-5.amazonaws.com/building/aoi_mpk_esri_2026-09-24_z18.geojson'
API_URL = 'https://digitalearthgeojson.s3.ap-southeast-5.amazonaws.com/kemaman_buildings_industri_filled.geojson'
MPK_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'mpk')
SOURCE = 'manual_esri_20260924'
CORRIDOR_HALF_M = 50                    # corridor half-width from the road centreline (as before)
R = 6378137.0
KX = 111320 * math.cos(math.radians(4.27))
KY = 110574
EXPECTED_SRC = 12734
EXPECTED = {('tk', 'mockup'): 42, ('tk', 'tiada_lot'): 1512, ('bbc', 'koridor'): 415}


def load(src):
    if src.startswith('http'):
        with urllib.request.urlopen(src, timeout=180) as r:
            return json.loads(r.read().decode('utf-8'))
    with open(src, encoding='utf-8') as f:
        return json.load(f)


def merc_to_lnglat(x, y):
    return [round(x / R * 180 / math.pi, 7), round(math.degrees(math.atan(math.sinh(y / R))), 7)]


def to_m(p):
    return p[0] * KX, p[1] * KY


def ring_area(ring):
    s = 0.0
    for i in range(len(ring) - 1):
        (x1, y1), (x2, y2) = to_m(ring[i]), to_m(ring[i + 1])
        s += x1 * y2 - x2 * y1
    return abs(s) / 2


def point_in_ring(x, y, ring):
    ins, n = False, len(ring)
    for i in range(n):
        x1, y1 = ring[i][0], ring[i][1]
        x2, y2 = ring[(i + 1) % n][0], ring[(i + 1) % n][1]
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1:
            ins = not ins
    return ins


def seg_dist(p, a, b):
    (x, y), (x1, y1), (x2, y2) = to_m(p), to_m(a), to_m(b)
    dx, dy = x2 - x1, y2 - y1
    t = max(0.0, min(1.0, ((x - x1) * dx + (y - y1) * dy) / ((dx * dx + dy * dy) or 1)))
    return math.hypot(x - x1 - t * dx, y - y1 - t * dy)


class Rings:
    """Point-in-polygon over many lng/lat rings with a bbox pre-filter."""
    def __init__(self, rings):
        self.items = [(min(p[0] for p in r), min(p[1] for p in r), max(p[0] for p in r), max(p[1] for p in r), r) for r in rings]

    def find(self, x, y):
        for i, (x0, y0, x1, y1, r) in enumerate(self.items):
            if x0 <= x <= x1 and y0 <= y <= y1 and point_in_ring(x, y, r):
                return i
        return None


def plus_code(lat, lng):
    """Open Location Code, 10 digits + 1 grid character (~3 m), e.g. 6PP57CRW+5GX."""
    A = '23456789CFGHJMPQRVWX'
    la = int(math.floor((min(max(lat, -90), 89.9999999) + 90) * 40000 + 1e-7))       # 1/40000 deg
    lo = int(math.floor((((lng + 180) % 360) + 360) % 360 * 32000 + 1e-7))           # 1/32000 deg
    la_p, la_g = divmod(la, 5)
    lo_p, lo_g = divmod(lo, 4)
    code = ''
    for i, step in enumerate((160000, 8000, 400, 20, 1)):
        code += A[la_p // step] + A[lo_p // step]
        la_p %= step
        lo_p %= step
        if i == 3:
            code += '+'
    return code + A[la_g * 4 + lo_g]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--src', default=SRC_URL)
    ap.add_argument('--api', default=API_URL)
    args = ap.parse_args()

    src = load(args.src)['features']
    assert len(src) == EXPECTED_SRC, ('manual footprints', len(src))
    boundary = load(os.path.join(MPK_DIR, 'tk_sempadan.geojson'))['features'][0]['geometry']
    tk_ring = boundary['coordinates'][0] if boundary['type'] == 'Polygon' else boundary['coordinates'][0][0]
    roads = {f['properties']['kawasan']: [(l[i], l[i + 1]) for l in f['geometry']['coordinates'] for i in range(len(l) - 1)]
             for f in load(os.path.join(MPK_DIR, 'koridor_jalan.geojson'))['features']}
    lots = load(os.path.join(MPK_DIR, 'lot_kadaster.geojson'))['features']
    lot_index = Rings([f['geometry']['coordinates'][0] for f in lots])
    api = [f for f in load(args.api)['features'] if f['properties'].get('is_mockup') is True]
    mock_rings = [f['geometry']['coordinates'][0] for f in api]

    def centre(ring):
        pts = ring[:-1]
        return [sum(p[0] for p in pts) / len(pts), sum(p[1] for p in pts) / len(pts)]

    out, matched_mock = [], set()
    for f in src:
        polys = [[[merc_to_lnglat(*c) for c in ring] for ring in poly] for poly in f['geometry']['coordinates']]
        polys = [p for p in polys if len(p[0]) >= 4]
        if not polys:
            continue
        outer = max((p[0] for p in polys), key=ring_area)
        area = sum(ring_area(p[0]) - sum(ring_area(h) for h in p[1:]) for p in polys)
        lng, lat = centre(outer)
        props = None
        if point_in_ring(lng, lat, tk_ring):
            props = {'kawasan': 'tk', 'kategori': 'tiada_lot', 'dalam': True}
            for k, m in enumerate(mock_rings):
                mc = centre(m)
                if point_in_ring(lng, lat, m) or point_in_ring(mc[0], mc[1], outer):
                    props['kategori'] = 'mockup'
                    props['api_fid'] = api[k]['properties'].get('fid')
                    matched_mock.add(k)
                    break
        else:
            road = roads.get('bbc', [])
            if road and min(seg_dist([lng, lat], a, b) for a, b in road) <= CORRIDOR_HALF_M:
                d = min(seg_dist(p, a, b) for p in outer + [[lng, lat]] for a, b in road)
                props = {'kawasan': 'bbc', 'kategori': 'koridor', 'jarak_jalan_m': round(d, 1)}
        if props is None:
            continue
        props.update({'area_m2': round(area, 1), 'confidence': 1.0, 'sumber': SOURCE, 'src_fid': f['properties'].get('fid'),
                      'plus_code': plus_code(lat, lng), 'lng': round(lng, 6), 'lat': round(lat, 6)})
        li = lot_index.find(lng, lat)
        if li is not None:
            props['lot'] = lots[li]['properties']['lot']
            props['upi'] = lots[li]['properties']['upi']
        geom = {'type': 'Polygon', 'coordinates': polys[0]} if len(polys) == 1 else {'type': 'MultiPolygon', 'coordinates': polys}
        out.append({'type': 'Feature', 'properties': props, 'geometry': geom})

    features = out
    for i, f in enumerate(features):
        f['properties']['id'] = i + 1
    counts = Counter((f['properties']['kawasan'], f['properties']['kategori']) for f in features)
    print('per kawasan/kategori:', dict(sorted(counts.items())))
    print(f'API suspect buildings matched to a 2026 footprint: {len(matched_mock)} of {len(api)}')
    for k, n in EXPECTED.items():
        assert counts[k] == n, (k, counts[k], n)
    with open(os.path.join(MPK_DIR, 'mpk_buildings.geojson'), 'w', encoding='utf-8') as f:
        json.dump({'type': 'FeatureCollection', 'features': features}, f, ensure_ascii=False, separators=(',', ':'))
    print('wrote mpk/mpk_buildings.geojson:', len(features), 'buildings')
    road_file = os.path.join(MPK_DIR, 'koridor_jalan.geojson')
    rd = load(road_file)
    rd['features'] = [f for f in rd['features'] if f['properties']['kawasan'] == 'bbc']
    with open(road_file, 'w', encoding='utf-8') as f:
        json.dump(rd, f, ensure_ascii=False, separators=(',', ':'))
    print('wrote mpk/koridor_jalan.geojson: Binjai – Bandar Chukai only')


if __name__ == '__main__':
    main()
