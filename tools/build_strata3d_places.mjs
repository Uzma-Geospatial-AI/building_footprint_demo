// Strata search: named places from OpenStreetMap for the two Strata regions, so the area search finds
// stations, malls, schools, mosques, parks, roads and neighbourhoods without a live geocoder.
//   node tools/build_strata3d_places.mjs
// Writes strata3d/places.json: [{ n: name, k: kind label, a: extra search words, r: 'dp' | 'mpk', c: [lng, lat] }].
// Addresses that are not in this index (house numbers and the like) are looked up live (Nominatim) by mpk-strata3d.js.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const REGIONS = {
  dp: [3.125, 101.575, 3.205, 101.655],   // Damansara Perdana, Mutiara Damansara, Bandar Utama (s, w, n, e)
  mpk: [4.205, 103.380, 4.315, 103.485],  // Teluk Kalong, Binjai, Bandar Chukai
};
const SELECT = [
  'nwr["railway"="station"]', 'nwr["public_transport"="station"]', 'nwr["amenity"="bus_station"]',
  'nwr["shop"~"^(mall|supermarket|department_store|hardware|car)$"]["name"]',
  'nwr["amenity"~"^(school|college|university|kindergarten|hospital|clinic|place_of_worship|police|fire_station|post_office|townhall|library|marketplace|community_centre|bank|fuel|courthouse|restaurant|cafe)$"]["name"]',
  'nwr["office"~"^(government|company)$"]["name"]', 'nwr["leisure"~"^(park|sports_centre|stadium|golf_course)$"]["name"]',
  'nwr["tourism"~"^(hotel|attraction|museum)$"]["name"]', 'nwr["building"]["name"]', 'nwr["landuse"~"^(industrial|commercial|retail|residential)$"]["name"]',
  'node["place"~"^(suburb|neighbourhood|village|hamlet|town|quarter)$"]', 'way["highway"]["name"]',
];
const KIND = t => {
  // public_transport=station without railway=station is a bus hub or a jetty, not a rail station
  if (t.public_transport === 'station' && t.railway !== 'station') {
    return t.amenity === 'ferry_terminal' || /jeti|jetty|ferry/i.test(t.name || '') ? ['Ferry terminal', 'jetty jeti'] : ['Bus station', 'bus terminal hub stesen bas'];
  }
  if (t.railway === 'station') {
    const s = t.station || '', net = (t.network || t.line || '').replace(/ station$/, '');
    const mode = s === 'subway' ? 'MRT' : s === 'light_rail' ? 'LRT' : s === 'monorail' ? 'Monorail' : 'Rail';
    return [`${mode} station${net ? ' · ' + net : ''}`, `${mode} station stesen train rail ${t.ref || ''} ${net}`];
  }
  if (t.amenity === 'bus_station') return ['Bus station', 'bus terminal'];
  if (t.highway) return ['Road', 'street jalan lorong persiaran'];
  if (t.place) return ['Neighbourhood', 'taman area'];
  if (t.amenity === 'place_of_worship') return [t.religion === 'muslim' ? 'Mosque / surau' : 'Place of worship', 'masjid surau temple church'];
  const v = t.shop || t.amenity || t.office || t.leisure || t.tourism || (t.landuse && t.landuse + ' area') || 'Building';
  return [v.charAt(0).toUpperCase() + v.slice(1).replace(/_/g, ' '), t.shop === 'mall' ? 'shopping centre mall' : ''];
};

// one small query per selector: a single combined query times out on the public servers
async function overpass(bbox) {
  const b = bbox.join(','), all = [];
  for (const sel of SELECT) {
    const q = `[out:json][timeout:90];${sel}(${b});out center tags;`;
    let got = null, why = '';
    // the public server rate-limits bursts (429 / 504): wait and retry
    for (let attempt = 0; attempt < 5 && !got; attempt++) {
      if (attempt) await new Promise(r => setTimeout(r, 8000 * attempt));
      try {
        const r = await fetch('https://overpass-api.de/api/interpreter', { method: 'POST', body: 'data=' + encodeURIComponent(q), signal: AbortSignal.timeout(120000),
          headers: { 'User-Agent': 'buildvision-strata-search/1.0', 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' } });
        if (r.ok) got = (await r.json()).elements; else why = 'HTTP ' + r.status;
      } catch (e) { why = e.message; }
    }
    if (!got) throw new Error(`Overpass unavailable for ${sel}: ${why}`);
    await new Promise(r => setTimeout(r, 1500));
    all.push(...got);
  }
  return all;
}

const out = [];
for (const [r, bbox] of Object.entries(REGIONS)) {
  const els = await overpass(bbox), seen = new Map();
  for (const e of els) {
    const t = e.tags || {}, c = e.center ? [e.center.lon, e.center.lat] : [e.lon, e.lat];
    const name = t['name:en'] && !/[^\x00-\x7F]/.test(t['name:en']) ? t['name:en'] : t.name;
    if (!name || c[0] == null) continue;
    const [k, a] = KIND(t);
    // one entry per name and kind within ~300 m (roads are many ways, stations are several entrances)
    const key = name.toLowerCase() + '|' + k, prev = seen.get(key);
    if (prev && Math.hypot(prev.c[0] - c[0], prev.c[1] - c[1]) < 0.003) continue;
    const alias = [a, t.name !== name ? t.name : '', t['name:ms'] || '', t['addr:street'] || '', t.operator || ''].filter(Boolean).join(' ').trim();
    const rec = { n: name, k, ...(alias ? { a: alias } : {}), r, c: [Math.round(c[0] * 1e6) / 1e6, Math.round(c[1] * 1e6) / 1e6] };
    seen.set(key, rec);
    out.push(rec);
  }
  console.log(r, els.length, 'elements →', out.filter(x => x.r === r).length, 'places');
}
fs.writeFileSync(path.join(ROOT, 'strata3d', 'places.json'), JSON.stringify(out));
console.log('strata3d/places.json:', out.length, 'places,', (fs.statSync(path.join(ROOT, 'strata3d', 'places.json')).size / 1024).toFixed(0), 'KB');
