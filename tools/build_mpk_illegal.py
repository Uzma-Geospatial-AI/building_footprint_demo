"""Build the MPK Kemaman suspected-illegal-construction building data.

Three study areas from MPK:

  tk   Kawasan Industri Teluk Kalong — boundary + approved lots, vectorised from MPK's
       map by tools/vectorize_teluk_kalong.py (mpk/tk_sempadan.geojson,
       mpk/tk_lot_lulus.geojson). Each building is classified:
         lulus      on an approved lot
         tiada_lot  inside the boundary but on no approved lot
         luar       outside the boundary; jarak_m = distance to it (<= MAX_DIST_M kept)
  bpb  Koridor Bandar Putra – Berenjut     } road corridors from MPK's point lists,
  bbc  Koridor Binjai – Bandar Chukai      } snapped to OpenStreetMap road centrelines.
       Buildings within CORRIDOR_HALF_M of the road are kept as kategori 'koridor' with
       jarak_jalan_m = closest vertex distance to the road centreline. The browser flags
       those within the road-reserve slider as encroaching.

Every building whose centroid falls on an NDCDB cadastral lot also gets lot / upi.

Writes mpk/mpk_buildings.geojson, mpk/koridor_jalan.geojson and mpk/lot_kadaster.geojson.
Pure Python stdlib.

Usage:
  python tools/build_mpk_illegal.py [--csv OPEN_BUILDINGS.csv] [--osm OVERPASS.json] [--lots LOTS.geojson]
Without --csv it streams ~980 MB from Google; without --osm it queries Overpass.
"""
import argparse
import csv
import gzip
import io
import json
import math
import os
import time
import urllib.parse
import urllib.request

OPEN_BUILDINGS_URL = ('https://storage.googleapis.com/open-buildings-data/v3/'
                      'polygons_s2_level_4_gzip/31d_buildings.csv.gz')
LOTS_URL = ('https://digitalearthgeojson.s3.ap-southeast-5.amazonaws.com/'
            'building/lots_sempadan_industri_kemaman.geojson')   # NDCDB cadastral lots
OVERPASS_URLS = ['https://overpass-api.de/api/interpreter',
                 'https://overpass.private.coffee/api/interpreter']
OVERPASS_QUERY = ('[out:json][timeout:90];way["highway"~"^(trunk|primary|secondary|tertiary|'
                  'unclassified|residential|trunk_link|primary_link|secondary_link|tertiary_link)$"]'
                  '(4.18,103.39,4.26,103.44);out geom;')
BBOX = (103.36, 4.18, 103.52, 4.34)      # W, S, E, N
MAX_DIST_M = 1000                        # Teluk Kalong: keep outside buildings this close
CORRIDOR_HALF_M = 50                     # corridor half-width from the road centreline
SNAP_DIST_M = 15                         # OSM vertex must be this close to MPK's line
SNAP_ANGLE_DEG = 30                      # ... and the OSM segment roughly parallel to it
GROW_DIST_M = 60                         # follow connected road segments this close
GROW_ANGLE_DEG = 50                      # ... and within this angle of MPK's line

# Road corridors as (lat, lng) points read off MPK's maps, in drawing order.
CORRIDORS = {
    'bpb': {'name': 'Koridor Bandar Putra – Berenjut', 'lines': [[
        (4.193800, 103.408184), (4.189765, 103.409394), (4.187595, 103.412295),
        (4.185425, 103.415096), (4.184621, 103.417151), (4.185164, 103.421261),
        (4.185646, 103.425129), (4.186188, 103.427224), (4.187776, 103.428776),
        (4.189283, 103.432966)]]},
    'bbc': {'name': 'Koridor Binjai – Bandar Chukai', 'lines': [[
        (4.238328, 103.394876), (4.240609, 103.403454), (4.240587, 103.404027),
        (4.238661, 103.409993), (4.236299, 103.417371), (4.234897, 103.421277),
        (4.232973, 103.424934), (4.231288, 103.428702), (4.226570, 103.427555),
        (4.222129, 103.426248), (4.218989, 103.423640), (4.219757, 103.421909),
        (4.220418, 103.419551), (4.229405, 103.420188), (4.231334, 103.421196),
        (4.234897, 103.421277)], [
        (4.240587, 103.404027), (4.245516, 103.406674), (4.249561, 103.408443)]]},
}

# Regression checks for the current inputs; update deliberately when inputs change.
EXPECTED = {'tk': 8740, 'bpb': 451, 'bbc': 1593}
EXPECTED_LOTS = 4122

KX = 111320 * math.cos(math.radians(4.24))   # metres per degree, local equirectangular
KY = 110574
MPK_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'mpk')


def to_m(lng, lat):
    return lng * KX, lat * KY


# ---------- geometry ----------
def point_in_ring(x, y, ring):
    inside = False
    n = len(ring)
    for i in range(n):
        x1, y1 = ring[i]
        x2, y2 = ring[(i + 1) % n]
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1:
            inside = not inside
    return inside


def seg_dist(x, y, a, b):
    (x1, y1), (x2, y2) = a, b
    dx, dy = x2 - x1, y2 - y1
    t = ((x - x1) * dx + (y - y1) * dy) / ((dx * dx + dy * dy) or 1)
    t = max(0.0, min(1.0, t))
    return math.hypot(x - x1 - t * dx, y - y1 - t * dy)


def dist_to_segments(x, y, segs):
    return min(seg_dist(x, y, a, b) for a, b in segs)


class Polygons:
    """Point-in-polygon over many rings (metres) with a bbox pre-filter."""
    def __init__(self, rings):
        self.items = []
        for ring in rings:
            xs, ys = [p[0] for p in ring], [p[1] for p in ring]
            self.items.append((min(xs), min(ys), max(xs), max(ys), ring))

    def contains(self, x, y):
        return self.find(x, y) is not None

    def find(self, x, y):
        """Index of the first ring containing the point, or None."""
        for i, (x0, y0, x1, y1, r) in enumerate(self.items):
            if x0 <= x <= x1 and y0 <= y <= y1 and point_in_ring(x, y, r):
                return i
        return None


def parse_polygon_wkt(wkt):
    outer = wkt[wkt.index('((') + 2:].split(')')[0]
    ring = [[round(float(a), 6), round(float(b), 6)] for a, b in (p.split() for p in outer.split(','))]
    if ring[0] != ring[-1]:
        ring.append(ring[0])
    return ring


# ---------- inputs ----------
def load_ring_file(name):
    with open(os.path.join(MPK_DIR, name), encoding='utf-8') as f:
        return [[to_m(*pt) for pt in feat['geometry']['coordinates'][0]]
                for feat in json.load(f)['features']]


def load_lots(path):
    """Cadastral lots within the study bbox (drops the Kerteh / Dungun lots)."""
    if path:
        with open(path, encoding='utf-8') as f:
            gj = json.load(f)
    else:
        with urllib.request.urlopen(LOTS_URL) as r:
            gj = json.load(r)
    w, s, e, n = BBOX
    lots = []
    for f in gj['features']:
        ring = f['geometry']['coordinates'][0]
        if all(w <= lng <= e and s <= lat <= n for lng, lat in ring):
            p = f['properties']
            lots.append({'type': 'Feature',
                         'properties': {'lot': p['LOT'], 'upi': p['UPI'], 'status': p['STATUS']},
                         'geometry': {'type': 'Polygon',
                                      'coordinates': [[[round(a, 6), round(b, 6)] for a, b in ring]]}})
    return lots


def load_osm(path):
    if path:
        with open(path, encoding='utf-8') as f:
            return json.load(f)
    data = urllib.parse.urlencode({'data': OVERPASS_QUERY})
    for attempt in range(6):
        for url in OVERPASS_URLS:
            try:
                req = urllib.request.Request(f'{url}?{data}', headers={'User-Agent': 'GeospatialAI-MPK-mockup/1.0'})
                with urllib.request.urlopen(req, timeout=150) as r:
                    return json.load(r)
            except Exception as e:                      # busy server -> next mirror / retry
                print(f'  overpass {url}: {e}')
        time.sleep(20)
    raise SystemExit('Overpass unavailable; retry later or pass --osm')


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


# ---------- corridors ----------
def snap_corridor(lines, osm):
    """OSM road segments that run along MPK's corridor line (metres)."""
    mpk_segs = [(to_m(a[1], a[0]), to_m(b[1], b[0])) for line in lines for a, b in zip(line, line[1:])]

    def nearest_dir(x, y):
        a, b = min(mpk_segs, key=lambda s: seg_dist(x, y, *s))
        return math.atan2(b[1] - a[1], b[0] - a[0])

    def along(a, b):
        if dist_to_segments(*a, mpk_segs) > SNAP_DIST_M or dist_to_segments(*b, mpk_segs) > SNAP_DIST_M:
            return False
        mx, my = (a[0] + b[0]) / 2, (a[1] + b[1]) / 2
        diff = abs(math.atan2(b[1] - a[1], b[0] - a[0]) - nearest_dir(mx, my)) % math.pi
        return min(diff, math.pi - diff) <= math.radians(SNAP_ANGLE_DEG)

    def parallel(a, b, max_deg):
        mx, my = (a[0] + b[0]) / 2, (a[1] + b[1]) / 2
        diff = abs(math.atan2(b[1] - a[1], b[0] - a[0]) - nearest_dir(mx, my)) % math.pi
        return min(diff, math.pi - diff) <= math.radians(max_deg)

    all_segs = []
    for way in osm['elements']:
        pts = [to_m(p['lon'], p['lat']) for p in way.get('geometry', [])]
        all_segs.extend(zip(pts, pts[1:]))
    snapped = {s for s in all_segs if along(*s)}

    # A bend in the road strays from MPK's straight chord, so grow outward from the
    # snapped segments through connected OSM segments that stay near the line and run
    # roughly along it (perpendicular side streets are left out).
    by_node = {}
    for s in all_segs:
        for p in s:
            by_node.setdefault(p, []).append(s)
    frontier = list(snapped)
    while frontier:
        s = frontier.pop()
        for p in s:
            for nxt in by_node[p]:
                if nxt in snapped:
                    continue
                if all(dist_to_segments(*q, mpk_segs) <= GROW_DIST_M for q in nxt) and parallel(*nxt, GROW_ANGLE_DEG):
                    snapped.add(nxt)
                    frontier.append(nxt)
    return mpk_segs, sorted(snapped)


def corridor_road(x, y, snapped):
    """OSM road centreline segments near this point, or [] where OSM has no road along
    MPK's line (MPK's straight chord can cut through buildings on a bend, so it is only
    used for corridor membership, never for the road-reserve distance)."""
    return [s for s in snapped if seg_dist(x, y, *s) <= CORRIDOR_HALF_M + SNAP_DIST_M]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--csv', help='pre-filtered Open Buildings CSV (skips the download)')
    ap.add_argument('--osm', help='Overpass JSON with the road ways (skips the query)')
    ap.add_argument('--lots', help='cadastral lots GeoJSON (skips the download)')
    args = ap.parse_args()

    tk_boundary = load_ring_file('tk_sempadan.geojson')
    tk_lots = Polygons(load_ring_file('tk_lot_lulus.geojson'))
    tk_inside = Polygons(tk_boundary)
    tk_edges = [(r[i], r[i + 1]) for r in tk_boundary for i in range(len(r) - 1)]
    tk_x0 = min(p[0] for r in tk_boundary for p in r) - MAX_DIST_M
    tk_x1 = max(p[0] for r in tk_boundary for p in r) + MAX_DIST_M
    tk_y0 = min(p[1] for r in tk_boundary for p in r) - MAX_DIST_M
    tk_y1 = max(p[1] for r in tk_boundary for p in r) + MAX_DIST_M

    lots = load_lots(args.lots)
    lot_index = Polygons([[to_m(*p) for p in f['geometry']['coordinates'][0]] for f in lots])
    osm = load_osm(args.osm)
    corridors = {}
    for key, c in CORRIDORS.items():
        mpk_segs, snapped = snap_corridor(c['lines'], osm)
        xs = [p[0] for s in mpk_segs for p in s]
        ys = [p[1] for s in mpk_segs for p in s]
        pad = CORRIDOR_HALF_M + 20
        corridors[key] = (mpk_segs, snapped, (min(xs) - pad, min(ys) - pad, max(xs) + pad, max(ys) + pad))
        print(f'{key}: {len(snapped)} OSM segments snapped to {len(mpk_segs)} MPK segments')

    features, counts = [], {}
    for row in iter_rows(args.csv):
        lng, lat = float(row['longitude']), float(row['latitude'])
        x, y = to_m(lng, lat)
        props = None

        if tk_x0 <= x <= tk_x1 and tk_y0 <= y <= tk_y1:
            ring = [to_m(*p) for p in parse_polygon_wkt(row['geometry'])[:-1]]
            on_lot = tk_lots.contains(x, y) or sum(tk_lots.contains(*p) for p in ring) * 2 >= len(ring)
            if on_lot and (tk_inside.contains(x, y) or dist_to_segments(x, y, tk_edges) <= MAX_DIST_M):
                props = {'kawasan': 'tk', 'kategori': 'lulus'}
            elif tk_inside.contains(x, y):
                props = {'kawasan': 'tk', 'kategori': 'tiada_lot'}
            else:
                d = dist_to_segments(x, y, tk_edges)
                if d <= MAX_DIST_M:
                    # ceil so the browser's 'jarak_m <= buffer' never over-counts
                    props = {'kawasan': 'tk', 'kategori': 'luar', 'jarak_m': int(math.ceil(d))}

        if props is None:
            for key, (mpk_segs, snapped, (x0, y0, x1, y1)) in corridors.items():
                if not (x0 <= x <= x1 and y0 <= y <= y1):
                    continue
                road = corridor_road(x, y, snapped)
                if dist_to_segments(x, y, road or mpk_segs) > CORRIDOR_HALF_M:
                    continue
                props = {'kawasan': key, 'kategori': 'koridor', 'jarak_jalan_m': None}
                if road:
                    ring = [to_m(*p) for p in parse_polygon_wkt(row['geometry'])[:-1]]
                    d = min(dist_to_segments(px, py, road) for px, py in ring + [(x, y)])
                    props['jarak_jalan_m'] = round(d, 1)
                break

        if props is None:
            continue
        counts[props['kawasan']] = counts.get(props['kawasan'], 0) + 1
        props.update({
            'id': len(features) + 1,
            'area_m2': round(float(row['area_in_meters']), 1),
            'confidence': round(float(row['confidence']), 2),
            'plus_code': row['full_plus_code'],
            'lng': round(lng, 6),
            'lat': round(lat, 6),
        })
        lot_i = lot_index.find(x, y)
        if lot_i is not None:
            props['lot'] = lots[lot_i]['properties']['lot']
            props['upi'] = lots[lot_i]['properties']['upi']
        features.append({'type': 'Feature', 'properties': props,
                         'geometry': {'type': 'Polygon', 'coordinates': [parse_polygon_wkt(row['geometry'])]}})

    by_cat = {}
    for f in features:
        k = (f['properties']['kawasan'], f['properties']['kategori'])
        by_cat[k] = by_cat.get(k, 0) + 1
    print('buildings per kawasan:', counts)
    print('per kawasan/kategori:', dict(sorted(by_cat.items())))
    with_lot = sum('lot' in f['properties'] for f in features)
    print(f'cadastral lots: {len(lots)}, buildings on a lot: {with_lot}')
    for key, n in EXPECTED.items():
        assert counts.get(key) == n, f'{key}: {counts.get(key)} buildings, expected {n}'
    assert len(lots) == EXPECTED_LOTS, f'{len(lots)} cadastral lots, expected {EXPECTED_LOTS}'

    with open(os.path.join(MPK_DIR, 'mpk_buildings.geojson'), 'w', encoding='utf-8') as f:
        json.dump({'type': 'FeatureCollection', 'features': features}, f, separators=(',', ':'))

    def to_lnglat(p):
        return [round(p[0] / KX, 6), round(p[1] / KY, 6)]
    roads = []
    for key, (mpk_segs, snapped, _) in corridors.items():
        segs = snapped or mpk_segs
        roads.append({'type': 'Feature', 'properties': {'kawasan': key, 'name': CORRIDORS[key]['name']},
                      'geometry': {'type': 'MultiLineString',
                                   'coordinates': [[to_lnglat(a), to_lnglat(b)] for a, b in segs]}})
    with open(os.path.join(MPK_DIR, 'koridor_jalan.geojson'), 'w', encoding='utf-8') as f:
        json.dump({'type': 'FeatureCollection', 'features': roads}, f, separators=(',', ':'))
    with open(os.path.join(MPK_DIR, 'lot_kadaster.geojson'), 'w', encoding='utf-8') as f:
        json.dump({'type': 'FeatureCollection', 'features': lots}, f, separators=(',', ':'))
    print('wrote mpk/mpk_buildings.geojson, mpk/koridor_jalan.geojson and mpk/lot_kadaster.geojson')


if __name__ == '__main__':
    main()
