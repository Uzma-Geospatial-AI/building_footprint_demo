"""Build mpk/landsat.json — the least-cloudy Landsat image of every month, per MPK area.

Same shape as mpk/sentinel.json: for each study area and each month from 2000, every
Landsat Collection 2 Level-2 scene (Landsat 5, 7, 8, 9) on Microsoft Planetary Computer is
checked and the clearest kept. Cloud is measured over the study area itself from the
QA_PIXEL band (dilated cloud, cirrus, cloud, cloud shadow).

Landsat 7 images after its scan-line corrector failed (31 May 2003) have empty stripes, so
they only win a month when every Landsat 5/8/9 scene is SLC_OFF_PENALTY points cloudier.

Output per area and year: 12 entries, each {"item", "date", "cloud", "platform"} or null.
Pure Python stdlib. Usage: python tools/build_landsat.py
"""
import datetime
import json
import os
from concurrent.futures import ThreadPoolExecutor

import build_sentinel             # shares the area polygons and HTTP helper

STAC = 'https://planetarycomputer.microsoft.com/api/stac/v1/search'
STATS = ('https://planetarycomputer.microsoft.com/api/data/v1/item/statistics'
         '?collection=landsat-c2-l2&item={item}&assets=qa_pixel&categorical=true&max_size=512')
FIRST_YEAR = 2000
QA_FILL = 1                     # QA_PIXEL bit 0
QA_CLOUD = 0b11110              # bits 1-4: dilated cloud, cirrus, cloud, cloud shadow
MIN_COVERAGE = 70               # % of the area with data (Landsat 7 stripes lose ~20%)
SLC_OFF_PENALTY = 20
MPK_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'mpk')


def scenes(geom, year):
    body = {'collections': ['landsat-c2-l2'], 'intersects': geom,
            'datetime': f'{year}-01-01/{year}-12-31', 'limit': 500,
            'fields': {'include': ['id', 'properties.datetime', 'properties.platform'],
                       'exclude': ['assets', 'links', 'geometry', 'bbox']}}
    return [(f['id'], f['properties']['datetime'][:10], f['properties']['platform'])
            for f in build_sentinel.post_json(STAC, body)['features']]


def local_cloud(item, geom):
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
    this_year = datetime.date.today().year
    jobs = []
    for area, geom in polys.items():
        for year in range(FIRST_YEAR, this_year + 1):
            for item, date, platform in scenes(geom, year):
                jobs.append((area, year, int(date[5:7]), item, date, platform))
        print(f'{area}: {sum(1 for j in jobs if j[0] == area)} scenes', flush=True)

    def measure(job):
        return job, local_cloud(job[3], polys[job[0]])

    best = {}
    with ThreadPoolExecutor(8) as ex:
        for (area, year, month, item, date, platform), cloud in ex.map(measure, jobs):
            if cloud is None:
                continue
            score = cloud + (SLC_OFF_PENALTY if platform == 'landsat-7' and date >= '2003-05-31' else 0)
            key = (area, year, month)
            if key not in best or score < best[key][0]:
                best[key] = (score, {'item': item, 'date': date, 'cloud': cloud, 'platform': platform})

    out = {'generated': datetime.date.today().isoformat(), 'areas': {}}
    for area in polys:
        years = {}
        for year in range(FIRST_YEAR, this_year + 1):
            months = [best[(area, year, m)][1] if (area, year, m) in best else None for m in range(1, 13)]
            if any(months):
                years[str(year)] = months
        out['areas'][area] = years
        filled = sum(1 for y in years.values() for m in y if m)
        clear = sum(1 for y in years.values() for m in y if m and m['cloud'] <= 20)
        print(f'{area}: {len(years)} years, {filled} months with an image, {clear} of them <= 20% cloud')
    with open(os.path.join(MPK_DIR, 'landsat.json'), 'w', encoding='utf-8') as f:
        json.dump(out, f, separators=(',', ':'))
    print('wrote mpk/landsat.json')


if __name__ == '__main__':
    main()
