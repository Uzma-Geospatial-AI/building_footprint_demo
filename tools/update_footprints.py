"""Rebuild the MPK buildings when the hand-digitised footprints on S3 change.

The footprints (aoi_mpk_esri_2026-09-24_z18.geojson) are updated in place as the digitising goes on. This
checks the file's ETag against mpk/sumber.json and, when it differs (or with --force), runs:
  1. tools/build_mpk_manual.py   footprints → study areas / outside, ids kept for unchanged footprints
  2. tools/apply_pelan_lulus.py  approved / rejected plans and the register records onto the buildings
  3. tools/build_heights.py      heights and floors for the study areas (the GHSL tile is downloaded once
                                 into .cache/)
then writes mpk/sumber.json (source URL, ETag, Last-Modified, counts, check and build times) for the app,
which shows the date and uses it to fetch fresh data. The GitHub workflow .github/workflows/update-footprints.yml
runs this every hour and commits and deploys the result.

  python tools/update_footprints.py [--force]
Prints changed=true|false (also to $GITHUB_OUTPUT when set).
"""
import argparse
import json
import os
import subprocess
import sys
import urllib.request
import zipfile
from collections import Counter
from datetime import datetime, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, '..')
MPK = os.path.join(ROOT, 'mpk')
SRC_URL = 'https://digitalearthgeojson.s3.ap-southeast-5.amazonaws.com/building/aoi_mpk_esri_2026-09-24_z18.geojson'
INFO = os.path.join(MPK, 'sumber.json')
GHSL_NAME = 'GHS_BUILT_H_ANBH_E2018_GLOBE_R2023A_4326_3ss_V1_0_R9_C29'
GHSL_URL = ('https://jeodpp.jrc.ec.europa.eu/ftp/jrc-opendata/GHSL/GHS_BUILT_H_GLOBE_R2023A/'
            'GHS_BUILT_H_ANBH_E2018_GLOBE_R2023A_4326_3ss/V1-0/tiles/' + GHSL_NAME + '.zip')
CACHE = os.path.join(ROOT, '.cache')


def head(url):
    req = urllib.request.Request(url, method='HEAD')
    with urllib.request.urlopen(req, timeout=60) as r:
        return {'etag': (r.headers.get('ETag') or '').strip('"'), 'last_modified': r.headers.get('Last-Modified') or '',
                'bytes': int(r.headers.get('Content-Length') or 0)}


def run(*args, env=None):
    print('$', ' '.join(args), flush=True)
    subprocess.run([sys.executable, *args], cwd=ROOT, check=True, env={**os.environ, 'PYTHONIOENCODING': 'utf-8', **(env or {})})


def ghsl_tile():
    tif = os.path.join(CACHE, GHSL_NAME + '.tif')
    if not os.path.exists(tif):
        os.makedirs(CACHE, exist_ok=True)
        z = os.path.join(CACHE, GHSL_NAME + '.zip')
        print('downloading the GHSL height tile ...', flush=True)
        urllib.request.urlretrieve(GHSL_URL, z)
        with zipfile.ZipFile(z) as zf:
            zf.extract(GHSL_NAME + '.tif', CACHE)
        os.remove(z)
    return tif


def output(changed):
    print(f'changed={"true" if changed else "false"}')
    if os.environ.get('GITHUB_OUTPUT'):
        with open(os.environ['GITHUB_OUTPUT'], 'a') as f:
            f.write(f'changed={"true" if changed else "false"}\n')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--force', action='store_true')
    args = ap.parse_args()
    now = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
    remote = head(SRC_URL)
    info = json.load(open(INFO, encoding='utf-8')) if os.path.exists(INFO) else {}
    if not args.force and info.get('etag') == remote['etag']:
        print('footprints unchanged:', remote['etag'], remote['last_modified'])
        output(False)
        return
    print('footprints changed:', info.get('etag'), '->', remote['etag'], remote['last_modified'])
    run(os.path.join('tools', 'build_mpk_manual.py'))
    run(os.path.join('tools', 'apply_pelan_lulus.py'), env={'MPK_NO_EXPECT': '1'})
    run(os.path.join('tools', 'build_heights.py'), ghsl_tile())
    study = json.load(open(os.path.join(MPK, 'mpk_buildings.geojson'), encoding='utf-8'))['features']
    others = json.load(open(os.path.join(MPK, 'mpk_buildings_luar.geojson'), encoding='utf-8'))['features']
    per = Counter(f['properties']['kawasan'] for f in study)
    info = {'url': SRC_URL, 'etag': remote['etag'], 'last_modified': remote['last_modified'], 'bytes': remote['bytes'],
            'built': now, 'checked': now, 'version': remote['etag'][:10],
            'buildings': {'tk': per.get('tk', 0), 'bbc': per.get('bbc', 0), 'outside': len(others), 'total': len(study) + len(others)}}
    with open(INFO, 'w', encoding='utf-8') as f:
        json.dump(info, f, ensure_ascii=False, indent=1)
    print('wrote', INFO, info['buildings'])
    output(True)


if __name__ == '__main__':
    main()
