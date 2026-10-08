"""Build mpk/sentinel.json — the least-cloudy Sentinel-2 image of every month, per MPK area.

For each study area (Teluk Kalong, Bandar Putra – Berenjut, Binjai – Bandar Chukai) and each
month from 2016 to the latest image, this script lists every Sentinel-2 L2A scene on
Microsoft Planetary Computer, measures the cloud over *the study area itself* (scene cloud
cover describes the whole 100 km tile and is misleading), and keeps the clearest scene.

Local cloud = share of the area's pixels that the scene classification (SCL) marks as cloud
shadow (3), cloud medium/high probability (8, 9) or thin cirrus (10). Scenes covering less
than MIN_COVERAGE % of the area (swath edges) are ignored.

Output per area and year: 12 entries, each {"item", "date", "cloud"} or null when the month
has no usable scene. Pure Python stdlib.

Usage: python tools/build_sentinel.py
"""
import datetime
import json
import os
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor

STAC = 'https://planetarycomputer.microsoft.com/api/stac/v1/search'
STATS = ('https://planetarycomputer.microsoft.com/api/data/v1/item/statistics'
         '?collection=sentinel-2-l2a&item={item}&assets=SCL&categorical=true&max_size=512')
FIRST_YEAR = 2016
CLOUD_CLASSES = {3, 8, 9, 10}
MIN_COVERAGE = 80                      # % of the area the scene must cover
PAD_M = 100                            # padding around each area's extent
MPK_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'mpk')


def post_json(url, body, tries=5):
    for attempt in range(tries):
        try:
            req = urllib.request.Request(url, data=json.dumps(body).encode(),
                                         headers={'Content-Type': 'application/json',
                                                  'User-Agent': 'GeospatialAI-MPK-mockup/1.0'})
            with urllib.request.urlopen(req, timeout=120) as r:
                return json.load(r)
        except Exception:
            if attempt == tries - 1:
                raise
            time.sleep(3 * (attempt + 1))


def extent(features):
    xs, ys = [], []

    def visit(c):
        if isinstance(c[0], (int, float)):
            xs.append(c[0]); ys.append(c[1])
        else:
            for x in c:
                visit(x)
    for f in features:
        visit(f['geometry']['coordinates'])
    dx, dy = PAD_M / 111000, PAD_M / 110574
    return min(xs) - dx, min(ys) - dy, max(xs) + dx, max(ys) + dy


def area_polygons():
    with open(os.path.join(MPK_DIR, 'tk_sempadan.geojson'), encoding='utf-8') as f:
        tk = json.load(f)['features']
    with open(os.path.join(MPK_DIR, 'koridor_jalan.geojson'), encoding='utf-8') as f:
        roads = json.load(f)['features']
    areas = {'tk': extent(tk),
             'bpb': extent([r for r in roads if r['properties']['kawasan'] == 'bpb']),
             'bbc': extent([r for r in roads if r['properties']['kawasan'] == 'bbc'])}
    return {k: {'type': 'Polygon', 'coordinates': [[[w, s], [e, s], [e, n], [w, n], [w, s]]]}
            for k, (w, s, e, n) in areas.items()}


def scenes(geom, year):
    body = {'collections': ['sentinel-2-l2a'], 'intersects': geom,
            'datetime': f'{year}-01-01/{year}-12-31', 'limit': 500,
            'fields': {'include': ['id', 'properties.datetime'], 'exclude': ['assets', 'links', 'geometry', 'bbox']}}
    return [(f['id'], f['properties']['datetime'][:10]) for f in post_json(STAC, body)['features']]


def local_cloud(item, geom):
    """% cloud over the area, or None when the scene covers too little of it."""
    feat = {'type': 'Feature', 'properties': {}, 'geometry': geom}
    try:
        st = post_json(STATS.format(item=item), feat)['properties']['statistics']['SCL_b1']
    except Exception as e:
        print(f'  stats failed {item}: {e}')
        return None
    counts, classes = st['histogram']
    total = sum(counts)
    valid = sum(c for c, k in zip(counts, classes) if int(k) != 0)    # 0 = no data
    if not total or valid * 100 / total < MIN_COVERAGE or st.get('valid_percent', 100) < MIN_COVERAGE:
        return None
    cloud = sum(c for c, k in zip(counts, classes) if int(k) in CLOUD_CLASSES)
    return round(cloud * 100 / valid, 1)


def main():
    polys = area_polygons()
    this_year = datetime.date.today().year
    jobs = []                                  # (area, year, month, item, date)
    for area, geom in polys.items():
        for year in range(FIRST_YEAR, this_year + 1):
            for item, date in scenes(geom, year):
                jobs.append((area, year, int(date[5:7]), item, date))
        print(f'{area}: {sum(1 for j in jobs if j[0] == area)} scenes')

    def measure(job):
        area, year, month, item, date = job
        return job, local_cloud(item, polys[area])

    with ThreadPoolExecutor(8) as ex:
        results = list(ex.map(measure, jobs))

    best = {}
    for (area, year, month, item, date), cloud in results:
        if cloud is None:
            continue
        key = (area, year, month)
        if key not in best or cloud < best[key]['cloud']:
            best[key] = {'item': item, 'date': date, 'cloud': cloud}

    out = {'generated': datetime.date.today().isoformat(), 'areas': {}}
    for area in polys:
        years = {}
        for year in range(FIRST_YEAR, this_year + 1):
            months = [best.get((area, year, m)) for m in range(1, 13)]
            if any(months):
                years[str(year)] = months
        out['areas'][area] = years
        filled = sum(1 for y in years.values() for m in y if m)
        clear = sum(1 for y in years.values() for m in y if m and m['cloud'] <= 20)
        print(f'{area}: {filled} months with an image, {clear} of them <= 20% cloud')

    with open(os.path.join(MPK_DIR, 'sentinel.json'), 'w', encoding='utf-8') as f:
        json.dump(out, f, separators=(',', ':'))
    print('wrote mpk/sentinel.json')


if __name__ == '__main__':
    main()
