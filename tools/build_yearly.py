"""Build mpk/yearly.json — one image per year from 2000, per MPK study area.

For every area and year the clearest, most detailed image available is chosen, in order:

  esri     an Esri World Imagery Wayback image captured that year (~30 cm, from
           mpk/wayback.json — buildings visible)
  s2       otherwise the least-cloudy Sentinel-2 month of the year (10 m, from
           mpk/sentinel.json, 2016 onwards)
  landsat  otherwise the least-cloudy Landsat 5/7/8/9 scene of the year (30 m), with cloud
           measured from the QA_PIXEL band over the area itself

Run tools/build_wayback.py and tools/build_sentinel.py first. Pure Python stdlib.

Usage: python tools/build_yearly.py
"""
import datetime
import json
import os
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor

STAC = 'https://planetarycomputer.microsoft.com/api/stac/v1/search'
STATS = ('https://planetarycomputer.microsoft.com/api/data/v1/item/statistics'
         '?collection=landsat-c2-l2&item={item}&assets=qa_pixel&categorical=true&max_size=512')
FIRST_YEAR = 2000
QA_FILL = 1                     # QA_PIXEL bit 0
QA_CLOUD = 0b11110              # bits 1-4: dilated cloud, cirrus, cloud, cloud shadow
MIN_COVERAGE = 70               # % of the area with data (Landsat 7 SLC-off stripes lose ~20%)
# Landsat 7 images since its scan-line corrector failed (31 May 2003) have empty stripes, so
# they only win when every Landsat 5/8/9 scene is this many cloud percentage points worse
SLC_OFF_PENALTY = 20
MPK_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'mpk')

import build_sentinel             # noqa: E402  (shares the area polygons and HTTP helper)


def landsat_scenes(geom, year):
    body = {'collections': ['landsat-c2-l2'], 'intersects': geom,
            'datetime': f'{year}-01-01/{year}-12-31', 'limit': 500,
            'fields': {'include': ['id', 'properties.datetime', 'properties.platform'],
                       'exclude': ['assets', 'links', 'geometry', 'bbox']}}
    return [(f['id'], f['properties']['datetime'][:10], f['properties']['platform'])
            for f in build_sentinel.post_json(STAC, body)['features']]


def landsat_cloud(item, geom):
    """% cloud over the area, or None when the scene covers too little of it."""
    feat = {'type': 'Feature', 'properties': {}, 'geometry': geom}
    try:
        st = build_sentinel.post_json(STATS.format(item=item), feat)['properties']['statistics']['qa_pixel_b1']
    except Exception as e:
        print(f'  stats failed {item}: {e}')
        return None
    counts, values = st['histogram']
    total = sum(counts)
    valid = sum(c for c, v in zip(counts, values) if not int(v) & QA_FILL)
    coverage = st.get('valid_percent', 100) * valid / total if total else 0
    if coverage < MIN_COVERAGE:
        return None
    cloud = sum(c for c, v in zip(counts, values) if not int(v) & QA_FILL and int(v) & QA_CLOUD)
    return round(cloud * 100 / valid, 1)


def main():
    polys = build_sentinel.area_polygons()
    with open(os.path.join(MPK_DIR, 'wayback.json'), encoding='utf-8') as f:
        wayback = json.load(f)['history']
    with open(os.path.join(MPK_DIR, 'sentinel.json'), encoding='utf-8') as f:
        sentinel = json.load(f)['areas']
    last_year = datetime.date.today().year

    picks = {}                    # (area, year) -> entry
    for area in polys:
        for e in wayback:         # oldest release first: keep the first release showing a capture
            cap = e['capture'][area]
            key = (area, int(cap[:4]))
            if key not in picks:
                picks[key] = {'source': 'esri', 'date': cap, 'release': e['release']}
        for year, months in sentinel.get(area, {}).items():
            key = (area, int(year))
            clearest = min((m for m in months if m), key=lambda m: m['cloud'], default=None)
            if key not in picks and clearest:
                picks[key] = {'source': 's2', 'date': clearest['date'], 'item': clearest['item'],
                              'cloud': clearest['cloud']}

    jobs = [(area, year, item, date, platform)
            for area, geom in polys.items()
            for year in range(FIRST_YEAR, 2016) if (area, year) not in picks
            for item, date, platform in landsat_scenes(geom, year)]
    print(f'{len(jobs)} Landsat scenes to check')

    def measure(job):
        area, year, item, date, platform = job
        return job, landsat_cloud(item, polys[area])

    with ThreadPoolExecutor(8) as ex:
        for (area, year, item, date, platform), cloud in ex.map(measure, jobs):
            if cloud is None:
                continue
            key = (area, year)
            score = cloud + (SLC_OFF_PENALTY if platform == 'landsat-7' and date >= '2003-05-31' else 0)
            if key not in picks or score < picks[key]['score']:
                picks[key] = {'source': 'landsat', 'date': date, 'item': item, 'cloud': cloud,
                              'platform': platform, 'score': score}

    for entry in picks.values():
        entry.pop('score', None)
    out = {'generated': datetime.date.today().isoformat(), 'areas': {}}
    for area in polys:
        out['areas'][area] = [dict(year=y, **picks[(area, y)]) if (area, y) in picks else {'year': y, 'source': None}
                              for y in range(FIRST_YEAR, last_year + 1)]
        row = ' '.join({'esri': 'E', 's2': 'S', 'landsat': 'L', None: '-'}[e['source']] for e in out['areas'][area])
        print(f'{area}: {row}   (E=Esri high-res, S=Sentinel-2, L=Landsat, -=none) {FIRST_YEAR}-{last_year}')
    with open(os.path.join(MPK_DIR, 'yearly.json'), 'w', encoding='utf-8') as f:
        json.dump(out, f, separators=(',', ':'))
    print('wrote mpk/yearly.json')


if __name__ == '__main__':
    main()
