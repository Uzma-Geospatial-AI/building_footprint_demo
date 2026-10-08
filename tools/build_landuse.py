"""Build mpk/landuse.geojson — land-use zones of Kemaman district from OpenStreetMap.

OpenStreetMap `landuse=*` polygons (plus `leisure=park`) inside the Kemaman district
boundary (admin_level 6), grouped into a few planning-style classes, and the district
boundary itself. This is community-mapped land use, NOT the official RTD zoning
(PLANMalaysia i-Plan `gunatanah_zoning_terengganu`); replace this file when MPK provides
the official shapefile.

Pure Python stdlib. Usage: python tools/build_landuse.py [--osm OVERPASS.json]
"""
import argparse
import json
import os
import time
import urllib.parse
import urllib.request

OVERPASS_URLS = ['https://overpass-api.de/api/interpreter',
                 'https://overpass.kumi.systems/api/interpreter',
                 'https://maps.mail.ru/osm/tools/overpass/api/interpreter']
QUERY = """[out:json][timeout:180];
area["name"="Kemaman"]["admin_level"="6"]->.k;
rel["name"="Kemaman"]["admin_level"="6"];out geom;
(way["landuse"](area.k);relation["landuse"](area.k);
 way["leisure"="park"](area.k);relation["leisure"="park"](area.k););
out geom;"""

# OSM landuse value -> class shown on the map
CLASSES = {
    'industrial': 'industrial', 'quarry': 'industrial', 'landfill': 'industrial', 'harbour': 'industrial',
    'port': 'industrial', 'depot': 'industrial', 'garages': 'industrial', 'railway': 'industrial',
    'residential': 'residential',
    'commercial': 'commercial', 'retail': 'commercial',
    'institutional': 'institutional', 'institution': 'institutional', 'education': 'institutional',
    'government': 'institutional', 'religious': 'institutional', 'civic_safety': 'institutional',
    'military': 'institutional', 'cemetery': 'institutional',
    'recreation_ground': 'recreation', 'grass': 'recreation', 'village_green': 'recreation', 'park': 'recreation',
    'farmland': 'agriculture', 'orchard': 'agriculture', 'plantation': 'agriculture', 'farmyard': 'agriculture',
    'plant_nursery': 'agriculture', 'meadow': 'agriculture', 'aquaculture': 'agriculture',
    'forest': 'forest',
    'reservoir': 'water', 'basin': 'water',
    'construction': 'development', 'brownfield': 'development', 'greenfield': 'development',
}
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'mpk', 'landuse.geojson')


def overpass():
    data = urllib.parse.urlencode({'data': QUERY})
    for attempt in range(6):
        for url in OVERPASS_URLS:
            try:
                req = urllib.request.Request(f'{url}?{data}', headers={'User-Agent': 'GeospatialAI-MPK-mockup/1.0'})
                with urllib.request.urlopen(req, timeout=240) as r:
                    return json.load(r)
            except Exception as e:                     # busy server -> next mirror / retry
                print(f'  overpass {url}: {e}')
        time.sleep(20)
    raise SystemExit('Overpass unavailable; retry later or pass --osm')


def pt(p):
    return [round(p['lon'], 6), round(p['lat'], 6)]


def join_rings(lines):
    """Join way geometries (lists of [lng, lat]) end to end into closed rings."""
    lines = [l[:] for l in lines if len(l) >= 2]
    rings = []
    while lines:
        ring = lines.pop(0)
        changed = True
        while ring[0] != ring[-1] and changed:
            changed = False
            for i, l in enumerate(lines):
                if l[0] == ring[-1]:
                    ring += l[1:]
                elif l[-1] == ring[-1]:
                    ring += l[::-1][1:]
                elif l[-1] == ring[0]:
                    ring = l[:-1] + ring
                elif l[0] == ring[0]:
                    ring = l[::-1][:-1] + ring
                else:
                    continue
                lines.pop(i)
                changed = True
                break
        if ring[0] == ring[-1] and len(ring) >= 4:
            rings.append(ring)
    return rings


def geometry(el):
    if el['type'] == 'way':
        ring = [pt(p) for p in el.get('geometry', [])]
        return {'type': 'Polygon', 'coordinates': [ring]} if len(ring) >= 4 and ring[0] == ring[-1] else None
    outer = join_rings([[pt(p) for p in m['geometry']] for m in el.get('members', [])
                        if m.get('role') in ('outer', '') and m.get('geometry')])
    inner = join_rings([[pt(p) for p in m['geometry']] for m in el.get('members', [])
                        if m.get('role') == 'inner' and m.get('geometry')])
    if not outer:
        return None
    if len(outer) == 1:
        return {'type': 'Polygon', 'coordinates': [outer[0]] + inner}
    return {'type': 'MultiPolygon', 'coordinates': [[r] for r in outer]}   # holes dropped for multi-part


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--osm', help='Overpass JSON (skips the query)')
    args = ap.parse_args()
    if args.osm:
        with open(args.osm, encoding='utf-8') as f:
            osm = json.load(f)
    else:
        osm = overpass()

    district, zones, skipped = None, [], {}
    for el in osm['elements']:
        tags = el.get('tags', {})
        if tags.get('admin_level') == '6' and tags.get('boundary') == 'administrative':
            district = geometry(el)
            continue
        value = tags.get('landuse') or ('park' if tags.get('leisure') == 'park' else None)
        cls = CLASSES.get(value)
        if not cls:
            skipped[value] = skipped.get(value, 0) + 1
            continue
        geom = geometry(el)
        if not geom:
            continue
        props = {'zone': cls, 'osm': value}
        if tags.get('name'):
            props['name'] = tags['name']
        zones.append({'type': 'Feature', 'properties': props, 'geometry': geom})

    assert district, 'Kemaman district boundary not found'
    counts = {}
    for z in zones:
        counts[z['properties']['zone']] = counts.get(z['properties']['zone'], 0) + 1
    print('zones:', dict(sorted(counts.items(), key=lambda kv: -kv[1])), 'total', len(zones))
    if skipped:
        print('not mapped to a class:', skipped)
    out = {'type': 'FeatureCollection', 'features': [
        {'type': 'Feature', 'properties': {'zone': 'district', 'name': 'Daerah Kemaman'}, 'geometry': district},
        *zones]}
    with open(OUT, 'w', encoding='utf-8') as f:
        json.dump(out, f, separators=(',', ':'))
    print(f'wrote mpk/landuse.geojson ({os.path.getsize(OUT) // 1024} KB)')


if __name__ == '__main__':
    main()
