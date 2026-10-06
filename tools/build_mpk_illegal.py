"""Build the MPK Kemaman suspected-illegal-construction data files.

Classifies Google Open Buildings v3 footprints around Chukai / Teluk Kalong against the
PBT industrial planning boundary (ring #3 of the API "sempadan industri" file):

  status = 'dalam'  -> centroid inside the boundary (under PBT planning)
  status = 'luar'   -> centroid outside; jarak_m = distance to the boundary in metres

Only buildings inside, or outside within MAX_DIST_M, are written. The browser then
flags 'luar' buildings with jarak_m <= the user's buffer as suspected.

Pure Python stdlib. Usage:
  python tools/build_mpk_illegal.py                # stream ~980 MB from Google
  python tools/build_mpk_illegal.py --csv FILE     # reuse a pre-filtered CSV
"""
import argparse
import csv
import gzip
import io
import json
import math
import os
import sys
import urllib.request

OPEN_BUILDINGS_URL = ('https://storage.googleapis.com/open-buildings-data/v3/'
                      'polygons_s2_level_4_gzip/31d_buildings.csv.gz')
BOUNDARY_URL = ('https://digitalearthgeojson.s3.ap-southeast-5.amazonaws.com/'
                'building/sempadan+industri.geojson')
BOUNDARY_INDEX = 3                       # the ring covering Chukai / Teluk Kalong
BOUNDARY_NAME = 'Sempadan Perindustrian Teluk Kalong / Chukai'
BBOX = (103.36, 4.18, 103.52, 4.34)      # W, S, E, N
MAX_DIST_M = 1000
EXPECTED_INSIDE = 4159                   # matches API buildings_industri zone_3
EXPECTED_OUT_500 = 1337

# Local equirectangular metres per degree at the study latitude
KX = 111320 * math.cos(math.radians(4.27))
KY = 110574

OUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'mpk')


def load_boundary():
    with urllib.request.urlopen(BOUNDARY_URL) as r:
        gj = json.load(r)
    parts = gj['features'][BOUNDARY_INDEX]['geometry']['coordinates']
    ring = [pt for part in parts for pt in part]
    if ring[0] != ring[-1]:
        ring.append(ring[0])
    return ring


def to_m(lng, lat):
    return lng * KX, lat * KY


def point_in_ring(x, y, ring_m):
    inside = False
    n = len(ring_m)
    for i in range(n):
        x1, y1 = ring_m[i]
        x2, y2 = ring_m[(i + 1) % n]
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1:
            inside = not inside
    return inside


def dist_to_ring(x, y, ring_m):
    best = float('inf')
    for i in range(len(ring_m) - 1):
        x1, y1 = ring_m[i]
        x2, y2 = ring_m[i + 1]
        dx, dy = x2 - x1, y2 - y1
        t = ((x - x1) * dx + (y - y1) * dy) / ((dx * dx + dy * dy) or 1)
        t = max(0.0, min(1.0, t))
        best = min(best, math.hypot(x - x1 - t * dx, y - y1 - t * dy))
    return best


def parse_polygon_wkt(wkt):
    """Outer ring of a WKT POLYGON as [[lng, lat], ...] rounded to 6 dp."""
    body = wkt[wkt.index('((') + 2:]
    outer = body.split(')')[0]
    ring = []
    for pair in outer.split(','):
        lng, lat = pair.split()
        ring.append([round(float(lng), 6), round(float(lat), 6)])
    if ring[0] != ring[-1]:
        ring.append(ring[0])
    return ring


def iter_rows(csv_path):
    csv.field_size_limit(10 ** 9)
    if csv_path:
        with open(csv_path, encoding='utf-8', newline='') as f:
            yield from csv.DictReader(f)
        return
    w, s, e, n = BBOX
    with urllib.request.urlopen(OPEN_BUILDINGS_URL) as r:
        reader = csv.DictReader(io.TextIOWrapper(gzip.GzipFile(fileobj=r), encoding='utf-8'))
        for i, row in enumerate(reader, 1):
            if i % 2_000_000 == 0:
                print(f'  scanned {i:,} rows', flush=True)
            if s <= float(row['latitude']) <= n and w <= float(row['longitude']) <= e:
                yield row


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--csv', help='pre-filtered Open Buildings CSV (skips the download)')
    args = ap.parse_args()

    ring = load_boundary()
    ring_m = [to_m(*pt) for pt in ring]
    w, s, e, n = BBOX

    features, inside, out_500 = [], 0, 0
    for row in iter_rows(args.csv):
        lng, lat = float(row['longitude']), float(row['latitude'])
        if not (s <= lat <= n and w <= lng <= e):
            continue
        x, y = to_m(lng, lat)
        if point_in_ring(x, y, ring_m):
            status, dist = 'dalam', 0
            inside += 1
        else:
            dist = dist_to_ring(x, y, ring_m)
            if dist > MAX_DIST_M:
                continue
            status = 'luar'
            if dist <= 500:
                out_500 += 1
        features.append({
            'type': 'Feature',
            'geometry': {'type': 'Polygon', 'coordinates': [parse_polygon_wkt(row['geometry'])]},
            'properties': {
                'id': len(features) + 1,
                'status': status,
                'jarak_m': int(math.ceil(dist)),  # ceil so 'jarak_m <= buffer' never over-counts
                'area_m2': round(float(row['area_in_meters']), 1),
                'confidence': round(float(row['confidence']), 2),
                'plus_code': row['full_plus_code'],
                'lng': round(lng, 6),
                'lat': round(lat, 6),
            },
        })

    print(f'inside={inside} outside<=500m={out_500} written={len(features)}')
    assert inside == EXPECTED_INSIDE, f'inside count {inside} != {EXPECTED_INSIDE}'
    assert out_500 == EXPECTED_OUT_500, f'outside<=500m count {out_500} != {EXPECTED_OUT_500}'

    os.makedirs(OUT_DIR, exist_ok=True)
    with open(os.path.join(OUT_DIR, 'mpk_buildings.geojson'), 'w', encoding='utf-8') as f:
        json.dump({'type': 'FeatureCollection', 'features': features}, f, separators=(',', ':'))
    with open(os.path.join(OUT_DIR, 'mpk_sempadan.geojson'), 'w', encoding='utf-8') as f:
        json.dump({'type': 'FeatureCollection', 'features': [{
            'type': 'Feature',
            'geometry': {'type': 'Polygon', 'coordinates': [[[round(a, 6), round(b, 6)] for a, b in ring]]},
            'properties': {'name': BOUNDARY_NAME},
        }]}, f, separators=(',', ':'))
    print('wrote mpk/mpk_buildings.geojson and mpk/mpk_sempadan.geojson')


if __name__ == '__main__':
    sys.exit(main())
