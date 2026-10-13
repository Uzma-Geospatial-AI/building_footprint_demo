"""Every record of MPK's Teluk Kalong building-plan register, as points for the map.

Source: rekod_semua.csv, the cleaned export of Pelan_Bangunan_Teluk_Kalong.xlsx (sheet Semua_Rekod,
23,214 records): one row per record with its centre in Kertau 1968 / Terengganu Grid (EPSG:4394)
and in WGS84, the original status and its class (see RINGKASAN.md of that export). The register
holds the CAD pieces of each plan, so one building is often many records. Only the centre of each
record is known, so every record is drawn as a point; records with no or impossible coordinates
are counted but cannot be placed.

Writes mpk/rekod_semua.geojson, short property names to keep it small:
  i  ID_Rekod            k  status group: lulus | syarat | lain | tiada
  c  status class        s  status as written (only when it differs from the class)
  f  No_Fail             l  No_Lot            p  applicant      j  building type
  t  approval date       g  geometry type     a  geometry area (m², when > 0)
  d  1 inside the Teluk Kalong core area      u  issue flags, ';'-separated

  python tools/build_rekod_semua.py PATH/TO/rekod_semua.csv
"""
import csv
import json
import os
import sys
from collections import Counter

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'mpk', 'rekod_semua.geojson')
EXPECTED = {'records': 23214, 'valid': 977}
GROUP = {'Lulus': 'lulus', 'Diluluskan': 'lulus', 'Lulus Bersyarat': 'syarat',
         'Sokong': 'lain', 'Sedia Ada': 'lain', 'Tolak': 'lain'}   # everything else: no valid status


def main():
    src = sys.argv[1] if len(sys.argv) > 1 else 'rekod_semua.csv'
    with open(src, encoding='utf-8-sig', newline='') as f:
        rows = list(csv.DictReader(f))
    assert len(rows) == EXPECTED['records'], ('records', len(rows))
    feats, groups, unplaced = [], Counter(), Counter()
    for r in rows:
        k = GROUP.get(r['kelas_status'], 'tiada')
        groups[k] += 1
        if not r['lon'] or not r['lat']:
            unplaced[k] += 1
            continue
        p = {'i': int(r['id']), 'k': k, 'c': r['kelas_status']}
        s = r['status_asal'].strip()
        if s and s.upper() != r['kelas_status'].upper():
            p['s'] = s
        for key, col in (('f', 'no_fail'), ('l', 'no_lot'), ('p', 'pemohon'), ('j', 'jenis_bangunan'),
                         ('t', 'tarikh_lulus'), ('g', 'geometri'), ('u', 'isu')):
            v = r[col].strip()
            if v:
                p[key] = v
        if r['luas_geom_m2'] and float(r['luas_geom_m2']) > 0:
            p['a'] = round(float(r['luas_geom_m2']))
        if r['dalam_teluk_kalong'] == '1':
            p['d'] = 1
        feats.append({'type': 'Feature', 'properties': p,
                      'geometry': {'type': 'Point', 'coordinates': [round(float(r['lon']), 6), round(float(r['lat']), 6)]}})
    assert sum(groups[g] for g in ('lulus', 'syarat', 'lain')) == EXPECTED['valid'], groups
    with open(OUT, 'w', encoding='utf-8') as f:
        json.dump({'type': 'FeatureCollection', 'features': feats}, f, ensure_ascii=False, separators=(',', ':'))
    print('records:', len(rows), dict(groups))
    print('on the map:', len(feats), '| no usable coordinates:', sum(unplaced.values()), dict(unplaced))
    print('inside Teluk Kalong:', sum(1 for x in feats if x['properties'].get('d')))
    print('wrote', OUT, os.path.getsize(OUT), 'bytes')


if __name__ == '__main__':
    main()
