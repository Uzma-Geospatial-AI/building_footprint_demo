"""Building heights for the study-area buildings (Teluk Kalong inside the boundary, Binjai - Chukai corridor).

No survey of building heights exists for Kemaman, so each building gets the best open estimate:
  1. OpenStreetMap   a mapped building:height or building:levels (x 3.5 m) whose centre lies in the footprint
  2. GHSL Built-H    JRC's Global Human Settlement Layer, average net building height 2018, 3 arc-second
                     (~90 m) grid (GHS_BUILT_H_ANBH_E2018_GLOBE_R2023A_4326_3ss, tile R9_C29), read at the
                     building's centre; cells with no height take the highest of their 8 neighbours
  3. otherwise one floor (3.5 m)
Overture Maps (2026-09-23.1) was checked as well: none of its 30,817 buildings here carries a height.

Writes to mpk/mpk_buildings.geojson, study buildings only:
  tinggi_m     height in metres (one decimal)
  tingkat_est  floors = max(1, round(height / 3.5))
  tinggi_src   'OSM levels' | 'OSM height' | 'GHSL 2018 (90 m)' | 'default'
Run after tools/build_mpk_manual.py (which rewrites the file).

  python tools/build_heights.py PATH/TO/GHS_BUILT_H_ANBH_E2018_GLOBE_R2023A_4326_3ss_V1_0_R9_C29.tif
  (tile: https://jeodpp.jrc.ec.europa.eu/ftp/jrc-opendata/GHSL/GHS_BUILT_H_GLOBE_R2023A/
         GHS_BUILT_H_ANBH_E2018_GLOBE_R2023A_4326_3ss/V1-0/tiles/)
Needs rasterio.
"""
import json
import os
import sys
import urllib.parse
import urllib.request
from collections import Counter

import rasterio

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'mpk')
BUILDINGS = os.path.join(ROOT, 'mpk_buildings.geojson')
FLOOR_M = 3.5
OVERPASS = 'https://overpass-api.de/api/interpreter'


def inside(pt, ring):
    x, y = pt
    ins, j = False, len(ring) - 1
    for i in range(len(ring)):
        xi, yi = ring[i][0], ring[i][1]
        xj, yj = ring[j][0], ring[j][1]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
            ins = not ins
        j = i
    return ins


def ring_of(f):
    g = f['geometry']
    return g['coordinates'][0] if g['type'] == 'Polygon' else max((q[0] for q in g['coordinates']), key=len)


def osm_heights(bbox):
    s, w, n, e = bbox
    q = (f'[out:json][timeout:90];(way["building"]["height"]({s},{w},{n},{e});'
         f'way["building"]["building:levels"]({s},{w},{n},{e}););out tags center;')
    req = urllib.request.Request(OVERPASS, data=urllib.parse.urlencode({'data': q}).encode(), headers={'User-Agent': 'BuildVision/1.0'})
    with urllib.request.urlopen(req, timeout=120) as r:
        els = json.loads(r.read().decode('utf-8'))['elements']
    out = []
    for el in els:
        t, c = el.get('tags', {}), el.get('center')
        if not c:
            continue
        try:
            if t.get('height'):
                out.append(((c['lon'], c['lat']), float(str(t['height']).split()[0]), 'OSM height'))
            elif t.get('building:levels'):
                out.append(((c['lon'], c['lat']), float(t['building:levels']) * FLOOR_M, 'OSM levels'))
        except ValueError:
            pass
    return out


def main():
    tif = sys.argv[1]
    data = json.load(open(BUILDINGS, encoding='utf-8'))
    study = [f for f in data['features'] if (f['properties']['kawasan'] == 'tk' and f['properties'].get('dalam')) or f['properties']['kawasan'] == 'bbc']
    lngs = [f['properties']['lng'] for f in study]
    lats = [f['properties']['lat'] for f in study]
    bbox = (min(lats) - 0.002, min(lngs) - 0.002, max(lats) + 0.002, max(lngs) + 0.002)
    osm = osm_heights(bbox)
    print('OSM buildings with a height or levels:', len(osm))
    src = rasterio.open(tif)
    band = src.read(1)

    def ghsl(lng, lat):
        row, col = src.index(lng, lat)
        v = float(band[row, col])
        if v > 0:
            return v
        near = [float(band[r, c]) for r in range(row - 1, row + 2) for c in range(col - 1, col + 2)
                if 0 <= r < band.shape[0] and 0 <= c < band.shape[1]]
        return max(near) if near and max(near) > 0 else 0

    used = Counter()
    for f in study:
        p, ring = f['properties'], ring_of(f)
        hit = [o for o in osm if inside(o[0], ring)]
        if hit:
            h, s = max(hit, key=lambda o: o[1])[1:]
        else:
            h = ghsl(p['lng'], p['lat'])
            s = 'GHSL 2018 (90 m)' if h > 0 else 'default'
            if not h:
                h = FLOOR_M
        h = max(h, FLOOR_M * 0.85)
        p['tinggi_m'] = round(h, 1)
        p['tingkat_est'] = max(1, round(h / FLOOR_M))
        p['tinggi_src'] = s
        used[s] += 1
    print('heights by source:', dict(used))
    print('floors:', dict(sorted(Counter(f['properties']['tingkat_est'] for f in study).items())))
    with open(BUILDINGS, 'w', encoding='utf-8') as fh:
        json.dump(data, fh, ensure_ascii=False, separators=(',', ':'))
    print('wrote', BUILDINGS)


if __name__ == '__main__':
    main()
