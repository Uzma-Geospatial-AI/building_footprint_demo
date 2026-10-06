"""Vectorise MPK's "Kawasan Industri Teluk Kalong" map image.

The image (supplied by MPK, not committed) shows approved lots in purple and the PBT
boundary as a red dashed line, with vertex coordinates printed on it. This script
georeferences the image from those vertices, then writes:

  mpk/tk_lot_lulus.geojson   approved-lot polygons (purple), each grown by 1 px so the
                             dark lot outlines between neighbours are covered
  mpk/tk_sempadan.geojson    the red dashed boundary as polygon(s)

Needs numpy, scipy, scikit-image, Pillow. Usage:
  python tools/vectorize_teluk_kalong.py path/to/teluk_kalong.png
"""
import json
import os
import sys

import numpy as np
import scipy.ndimage as nd
from PIL import Image
from skimage.measure import approximate_polygon, find_contours

# (lat, lng) printed on the map -> pixel (x, y) of that vertex on the red line,
# picked by hand on the 676x913 image. Points whose label disagrees with the drawn
# line by >15 px are dropped automatically below.
CONTROL_POINTS = [
    ((4.304165, 103.446555), (243, 122)), ((4.304951, 103.456995), (373, 110)),
    ((4.297428, 103.456154), (372, 200)), ((4.289425, 103.457832), (383, 290)),
    ((4.286453, 103.457999), (385, 330)), ((4.282746, 103.465749), (475, 368)),
    ((4.266844, 103.467603), (500, 555)), ((4.257569, 103.471323), (540, 650)),
    ((4.250640, 103.470418), (530, 750)), ((4.250486, 103.468871), (510, 745)),
    ((4.259318, 103.444431), (235, 640)), ((4.270374, 103.435626), (122, 515)),
    ((4.287035, 103.435980), (125, 320)), ((4.292219, 103.437096), (137, 255)),
    ((4.295289, 103.438785), (155, 218)), ((4.271126, 103.452213), (318, 515)),
    ((4.246511, 103.459434), (403, 898)), ((4.246430, 103.458221), (380, 898)),
    ((4.254159, 103.451853), (325, 725)), ((4.248116, 103.455141), (365, 800)),
]
MAX_RESIDUAL_PX = 15
# The red dashed boundary traced by hand (pixel x, y), clockwise from the south-west
# corner of the northern block. Dashes are too sparse to close automatically.
BOUNDARY_PX = [
    (120, 515), (121, 470), (121, 400), (121, 330), (127, 290), (135, 250), (150, 230),
    (175, 205), (200, 175), (225, 150), (250, 122), (270, 135), (285, 145), (300, 150),
    (325, 140), (350, 120), (377, 116), (372, 150), (366, 200), (378, 245), (385, 285),
    (395, 302), (392, 322), (396, 340), (420, 355), (452, 365), (477, 363), (472, 400),
    (475, 450), (490, 495), (497, 540), (505, 580), (520, 625), (535, 655), (548, 680),
    (545, 745), (528, 755), (508, 750), (510, 720), (522, 690), (520, 670), (490, 668),
    (450, 672), (430, 688), (418, 705), (412, 760), (407, 810), (405, 870), (390, 872),
    (378, 872), (378, 820), (382, 770), (385, 745), (370, 760), (355, 778), (345, 770),
    (330, 730), (305, 700), (285, 688), (262, 670), (245, 662), (232, 642), (245, 625),
    (275, 610), (290, 622), (300, 632), (340, 642), (370, 638), (392, 630), (388, 607),
    (372, 602), (345, 595), (320, 580), (312, 560), (312, 515), (250, 515), (180, 515),
]
FRAME = (20, 97, 663, 903)          # x0, y0, x1, y1 of the map inside the black border
MIN_LOT_PX = 12
OUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'mpk')


def fit_affine(points):
    a = np.array([[lng, lat, 1] for (lat, lng), _ in points])
    d = np.array([xy for _, xy in points], float)
    m = np.linalg.lstsq(a, d, rcond=None)[0]
    return m, np.linalg.norm(a @ m - d, axis=1)


def georeference():
    points = list(CONTROL_POINTS)
    while True:
        m, res = fit_affine(points)
        worst = int(res.argmax())
        if res[worst] <= MAX_RESIDUAL_PX:
            break
        points.pop(worst)
    print(f'georeference: {len(points)}/{len(CONTROL_POINTS)} control points, '
          f'mean residual {res.mean():.1f} px, max {res.max():.1f} px')
    return m


def pixel_to_lnglat(m, xy):
    lin, t = m[:2], m[2]
    return (np.asarray(xy, float) - t) @ np.linalg.inv(lin)


def ring_from_mask(mask, m, tolerance=0.8):
    padded = np.pad(mask, 1)
    contours = find_contours(padded.astype(float), 0.5)
    if not contours:
        return None
    c = approximate_polygon(max(contours, key=len), tolerance)
    xy = np.stack([c[:, 1] - 1, c[:, 0] - 1], axis=1)       # (row, col) -> (x, y)
    ring = [[round(float(lng), 6), round(float(lat), 6)] for lng, lat in pixel_to_lnglat(m, xy)]
    if ring[0] != ring[-1]:
        ring.append(ring[0])
    return ring if len(ring) >= 4 else None


def main():
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    img = np.array(Image.open(sys.argv[1]).convert('RGB')).astype(int)
    r, g, b = img[..., 0], img[..., 1], img[..., 2]
    frame = np.zeros(r.shape, bool)
    x0, y0, x1, y1 = FRAME
    frame[y0:y1, x0:x1] = True

    m = georeference()

    # Approved lots: purple fill, split into lots by the dark outlines between them
    purple = frame & (r > 110) & (b > 150) & (g < 95) & (b - g > 70)
    purple = nd.binary_opening(purple, np.ones((2, 2)))
    labels, n = nd.label(purple)
    lots = []
    for i, sl in enumerate(nd.find_objects(labels), 1):
        comp = labels[sl] == i
        if comp.sum() < MIN_LOT_PX:
            continue
        sl_big = tuple(slice(max(s.start - 2, 0), s.stop + 2) for s in sl)
        grown = nd.binary_dilation(labels[sl_big] == i, np.ones((3, 3)))
        ring = ring_from_mask(grown, np.vstack([m[:2], m[2] - [sl_big[1].start, sl_big[0].start]]))
        if ring:
            lots.append({'type': 'Feature', 'properties': {'id': len(lots) + 1},
                         'geometry': {'type': 'Polygon', 'coordinates': [ring]}})

    ring = [[round(float(lng), 6), round(float(lat), 6)] for lng, lat in pixel_to_lnglat(m, BOUNDARY_PX)]
    ring.append(ring[0])
    boundary = [{'type': 'Feature', 'properties': {'name': 'Sempadan Kawasan Industri Teluk Kalong'},
                 'geometry': {'type': 'Polygon', 'coordinates': [ring]}}]

    print(f'lots: {len(lots)} polygons, boundary: {len(boundary)} polygon(s), '
          f'{sum(len(f["geometry"]["coordinates"][0]) for f in boundary)} vertices')
    os.makedirs(OUT_DIR, exist_ok=True)
    for name, feats in (('tk_lot_lulus.geojson', lots), ('tk_sempadan.geojson', boundary)):
        with open(os.path.join(OUT_DIR, name), 'w', encoding='utf-8') as f:
            json.dump({'type': 'FeatureCollection', 'features': feats}, f, separators=(',', ':'))
    print('wrote mpk/tk_lot_lulus.geojson and mpk/tk_sempadan.geojson')


if __name__ == '__main__':
    main()
