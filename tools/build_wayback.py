"""Build mpk/wayback.json — the Esri World Imagery Wayback releases worth showing for MPK.

Esri republishes its world mosaic every few weeks, but an area only changes when new
imagery arrives, so most releases look identical over Kemaman. For each release this
script asks the release's metadata service for the imagery capture date at one point
per MPK study area, then keeps every release that shows a capture combination not seen
before (oldest first) — the distinct high-resolution images over the study areas. Monthly
imagery comes from Sentinel-2 instead (tools/build_sentinel.py).

Each entry carries the release number (for the tile URL), the release date, the capture
date per area (tk / bpb / bbc) and the release's metadata service (capture-date polygons,
used by change detection to compare only areas imaged on different dates). Pure Python stdlib.

Usage: python tools/build_wayback.py
"""
import datetime
import json
import os
import re
import time
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor

CONFIG_URL = 'https://s3-us-west-2.amazonaws.com/config.maptiles.arcgis.com/waybackconfig.json'
# One sample point per MPK study area (lng, lat)
POINTS = {'tk': (103.452, 4.268), 'bpb': (103.418, 4.185), 'bbc': (103.421, 4.232)}
# Metadata layers from 15 cm to 2.4 m resolution; the first hit is the imagery shown at street zoom
METADATA_LAYERS = (3, 4, 5, 6, 7)
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'mpk', 'wayback.json')


def get_json(url, tries=4):
    for attempt in range(tries):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'GeospatialAI-MPK-mockup/1.0'})
            with urllib.request.urlopen(req, timeout=60) as r:
                return json.load(r)
        except Exception:
            if attempt == tries - 1:
                raise
            time.sleep(2 * (attempt + 1))


def capture_date(metadata_url, lng, lat):
    for layer in METADATA_LAYERS:
        q = urllib.parse.urlencode({'geometry': f'{lng},{lat}', 'geometryType': 'esriGeometryPoint', 'inSR': 4326,
                                    'outFields': 'SRC_DATE2', 'returnGeometry': 'false', 'f': 'json'})
        feats = get_json(f'{metadata_url}/{layer}/query?{q}').get('features', [])
        if feats and feats[0]['attributes'].get('SRC_DATE2'):
            ts = feats[0]['attributes']['SRC_DATE2'] / 1000
            return datetime.datetime.fromtimestamp(ts, datetime.timezone.utc).strftime('%Y-%m-%d')
    return None


def main():
    config = get_json(CONFIG_URL)
    releases = sorted(
        ({'release': int(num), 'date': re.search(r'\d{4}-\d{2}-\d{2}', v['itemTitle']).group(0),
          'metadata': v['metadataLayerUrl']} for num, v in config.items()),
        key=lambda r: r['date'])
    print(f'{len(releases)} releases, {releases[0]["date"]} to {releases[-1]["date"]}')

    def with_capture(r):
        try:
            cap = {k: capture_date(r['metadata'], *p) for k, p in POINTS.items()}
        except Exception as e:                    # metadata service down for this release
            print(f'  skip {r["date"]} ({r["release"]}): {e}')
            return None
        return {'release': r['release'], 'date': r['date'], 'capture': cap, 'metadata': r['metadata']}

    with ThreadPoolExecutor(8) as ex:
        done = [r for r in ex.map(with_capture, releases) if r and all(r['capture'].values())]

    history, seen = [], set()
    for r in done:
        key = tuple(r['capture'][k] for k in POINTS)
        if key not in seen:
            seen.add(key)
            history.append(r)

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, 'w', encoding='utf-8') as f:
        json.dump({'generated': datetime.date.today().isoformat(), 'history': history}, f, indent=1)
    print(f'history: {len(history)} distinct images')
    for r in history:
        print(f'  {r["date"]} r{r["release"]}  {r["capture"]}')
    print('wrote mpk/wayback.json')


if __name__ == '__main__':
    main()
