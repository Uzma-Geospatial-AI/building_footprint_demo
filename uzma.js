
// ============================================================
// STATE
// ============================================================
let map, currentPopup = null;
let selectedFeature = null;
let mapMode = 'navigate';
let currentBasemap = 'google-road';
let datasets = {};
let activeDatasetId = null;
let datasetCounter = 0;
let hoveredFeatureId = null;
let hoverDatasetId = null;
let plotMarkers = [];
let markerShape = 'pin';
let markerColor = '#e53935';

// TRAFFIC LIGHTS STATE
let trafficLightMarkers = [];
let trafficLightsVisible = false;
let tlEmojiSize = 18;

// ROAD NETWORK STATE
let roadNetworkVisible = false;

// WATER LAYER STATE
let waterLayerVisible = false;

// RAILWAY LAYER STATE
let railwayLayerVisible = false;
let railwayMarkers = [];

// POIS LAYER STATE
let poisLayerVisible = false;
let poisMarkers = [];
let poisLayerFilter = {};

// TRANSPORT LAYER STATE
let transportLayerVisible = false;
let transportMarkers = [];
let markerSize = 30;
let currentExportType = 'pdf';
let _searchResults = [];
let _searchTimeout = null;
let _geocodeTimeout = null;

// UZMA-sat state
let uzmaSatActive = false;
let uzmaSatOpacity = 1.0;
let geoJsonOverlayVisible = true;

const SEREMBAN_FILE = 'serembangeo.geojsonn';

// ============================================================
// SELECT BY AREA — Seremban area definitions
// ============================================================
const SEREMBAN_AREAS = [
  {
    id: 'seremban-main',
    name: 'Seremban Town',
    desc: 'Central business district and main urban core',
    icon: '🏙️',
    tags: ['Urban', 'Commercial', 'CBD'],
    center: [101.9424, 2.7297],
    zoom: 14,
    bounds: null,
  },
  {
    id: 'rasah-jaya',
    name: 'Rasah Jaya',
    desc: 'Residential township, south-west of Seremban',
    icon: '🏘️',
    tags: ['Residential', 'Township'],
    center: [101.9207, 2.7015],
    zoom: 14,
    bounds: null,
  },
  {
    id: 'nilai',
    name: 'Nilai',
    desc: 'Industrial and commercial hub, Seremban district',
    icon: '🏭',
    tags: ['Industrial', 'Commercial'],
    center: [101.7986, 2.8193],
    zoom: 13,
    bounds: null,
  },
  {
    id: 'bahau',
    name: 'Bahau',
    desc: 'Agricultural and rural area, Jempol district',
    icon: '🌾',
    tags: ['Agriculture', 'Rural'],
    center: [102.4263, 2.8013],
    zoom: 13,
    bounds: null,
  },
  {
    id: 'tampin',
    name: 'Tampin',
    desc: 'Southern Negeri Sembilan, near Melaka border',
    icon: '🌳',
    tags: ['Rural', 'Border'],
    center: [102.2298, 2.4699],
    zoom: 13,
    bounds: null,
  },
  {
    id: 'port-dickson',
    name: 'Port Dickson',
    desc: 'Coastal resort town with beaches and tourism',
    icon: '🏖️',
    tags: ['Coastal', 'Tourism'],
    center: [101.7974, 2.5222],
    zoom: 13,
    bounds: null,
  },
  {
    id: 'mantin',
    name: 'Mantin',
    desc: 'Small town between Seremban and Nilai',
    icon: '🏡',
    tags: ['Residential', 'Town'],
    center: [101.8777, 2.7896],
    zoom: 14,
    bounds: null,
  },
  {
    id: 'senawang',
    name: 'Senawang',
    desc: 'Industrial estate and mixed development area',
    icon: '⚙️',
    tags: ['Industrial', 'Mixed'],
    center: [101.9511, 2.6799],
    zoom: 14,
    bounds: null,
  },
  {
    id: 'paroi',
    name: 'Paroi',
    desc: 'Residential and light industrial zone',
    icon: '🏗️',
    tags: ['Residential', 'Industrial'],
    center: [101.9677, 2.7539],
    zoom: 14,
    bounds: null,
  },
  {
    id: 'full-extent',
    name: 'Full Seremban Extent',
    desc: 'Fly to full loaded GeoJSON / UZMA-sat coverage area',
    icon: '🗺️',
    tags: ['Dataset', 'Overview'],
    center: [101.9317, 2.7287],
    zoom: 11,
    bounds: [[101.87766085815322, 2.6743293354532471], [101.98574632250876, 2.7830234586744691]],
    isDataset: true,
  },
];

let _allAreaCards = [...SEREMBAN_AREAS];

function openAreaModal() {
  document.getElementById('area-overlay').classList.add('show');
  document.getElementById('area-search-input').value = '';
  renderAreaCards(SEREMBAN_AREAS);
  setTimeout(() => {
    const dsCards = buildDatasetAreaCards();
    if (dsCards.length) {
      _allAreaCards = [...dsCards, ...SEREMBAN_AREAS];
    } else {
      _allAreaCards = [...SEREMBAN_AREAS];
    }
    renderAreaCards(_allAreaCards);
  }, 50);
}

function buildDatasetAreaCards() {
  const cards = [];
  for (const [dsId, ds] of Object.entries(datasets)) {
    if (!ds.bounds) continue;
    const shortName = ds.name.replace(/\.(geojsonn?|json)$/i, '');
    cards.push({
      id: 'ds-' + dsId,
      name: shortName,
      desc: ds.features.length.toLocaleString() + ' features loaded · ' + formatFileSize(ds.fileSize),
      icon: '📂',
      tags: ['Dataset', 'GeoJSON'],
      center: null,
      zoom: null,
      bounds: ds.bounds,
      dsId,
      isDataset: true,
    });
  }
  return cards;
}

function renderAreaCards(areas) {
  const grid = document.getElementById('area-grid');
  if (!areas.length) {
    grid.innerHTML = '<div class="area-card-empty">No areas found.</div>';
    return;
  }
  grid.innerHTML = areas.map(a => {
    const tagColors = { Dataset:'blue', GeoJSON:'blue', Urban:'', Commercial:'', CBD:'', Residential:'', Township:'', Industrial:'', Rural:'', Agriculture:'green', Coastal:'blue', Tourism:'', Mixed:'', Overview:'' };
    const tagsHtml = a.tags.map(t => `<span class="area-card-tag ${tagColors[t]||''}">${t}</span>`).join('');
    return `<button class="area-card" onclick="flyToArea('${a.id}')" data-name="${a.name.toLowerCase()} ${a.desc.toLowerCase()} ${a.tags.join(' ').toLowerCase()}">
      <div class="area-card-icon">${a.icon}</div>
      <div class="area-card-name">${a.name}</div>
      <div class="area-card-desc">${a.desc}</div>
      <div class="area-card-meta">${tagsHtml}</div>
    </button>`;
  }).join('');
}

function filterAreaCards(val) {
  if (!val.trim()) { renderAreaCards(_allAreaCards); return; }
  const q = val.toLowerCase();
  const filtered = _allAreaCards.filter(a =>
    a.name.toLowerCase().includes(q) ||
    a.desc.toLowerCase().includes(q) ||
    a.tags.some(t => t.toLowerCase().includes(q))
  );
  renderAreaCards(filtered);
}

function flyToArea(areaId) {
  const area = _allAreaCards.find(a => a.id === areaId);
  if (!area) return;
  closeAreaModal();

  if (area.bounds) {
    map.fitBounds(area.bounds, { padding: 50, duration: 1200 });
  } else if (area.dsId && datasets[area.dsId]?.bounds) {
    map.fitBounds(datasets[area.dsId].bounds, { padding: 50, duration: 1200 });
    setActiveDataset(area.dsId);
    updateDatasetBadge();
  } else if (area.center) {
    map.flyTo({ center: area.center, zoom: area.zoom || 13, duration: 1200 });
  }

  showToast('📍 Flying to ' + area.name);
  addActivityLog('Area selected: ' + area.name, area.desc);
}

function closeAreaModal() {
  document.getElementById('area-overlay').classList.remove('show');
}

// ============================================================
// UZMA-SAT
// ============================================================
const UZMASAT_COORDS = {
  coordinates: [
    [101.87766085815322, 2.7830234586744691],
    [101.98574632250876, 2.7830234586744691],
    [101.98574632250876, 2.6743293354532471],
    [101.87766085815322, 2.6743293354532471],
  ],
  bounds: [[101.87766085815322, 2.6743293354532471], [101.98574632250876, 2.7830234586744691]],
  center: [101.93170359033098, 2.7286763970638583],
  // ── UPDATED: point directly at the PMTiles file ──
  tifPath: 'seremban.pmtiles',
  resolution: 'PMTiles · zoom 0-16',
  crs: 'WGS84',
  size: 'pmtiles://seremban.pmtiles',
};

// ============================================================
// COLOUR MAPPING
// ============================================================
const CLASS_COLORS = {
  'Perumahan':'#4CAF50','Perkampungan':'#9C27B0','Kemudahan Awam':'#1E88E5',
  'Perniagaan':'#DE9151','Perniagaan/Industri':'#DE9151','Industri':'#FF7043',
  'Hidrografi':'#00BCD4','Pertanian':'#8BC34A','Hutan':'#33691E',
  'Tanah Lapang':'#FDD835','Lain-lain':'#9E9E9E',
};
function getColor(cls) {
  if (!cls) return '#9E9E9E';
  if (CLASS_COLORS[cls]) return CLASS_COLORS[cls];
  for (const [k,v] of Object.entries(CLASS_COLORS)) {
    if (cls.toLowerCase().includes(k.toLowerCase()) || k.toLowerCase().includes(cls.toLowerCase())) return v;
  }
  let hash = 0;
  for (let i = 0; i < cls.length; i++) hash = cls.charCodeAt(i) + ((hash << 5) - hash);
  return `hsl(${Math.abs(hash) % 360},52%,50%)`;
}

// ============================================================
// PROPERTY DETECTION
// ============================================================
const CLASS_PROP_CANDIDATES  = ['KELAS','kelas','CLASS','class','LANDUSE','landuse','GUNA_TANAH','guna_tanah','JENIS','jenis','TYPE','type','FEATURE_CLASS','feature_class','FC','fc','KELAS_CIRI','kelas_ciri'];
const ID_PROP_CANDIDATES     = ['LOT_NO','lot_no','LOT','lot','NO_LOT','no_lot','id','ID','FID','fid','OBJECTID','GID','NAME','name','NAMA','nama','geocoded_address'];
const MUKIM_PROP_CANDIDATES  = ['MUKIM','mukim','KAWASAN','kawasan','AREA','area','DISTRICT','district','DAERAH','daerah'];
const ADDR_PROP_CANDIDATES   = ['ADDRESS','address','ALAMAT','alamat','geocoded_address','ADDR','addr','JALAN','jalan','STREET','street'];
function detectProp(props, candidates) {
  for (const c of candidates) {
    if (props[c] !== undefined && props[c] !== null && props[c] !== '') return c;
  }
  return null;
}

// ============================================================
// UTM CONVERSION
// ============================================================
function utmToWgs84(easting, northing, zone=47) {
  const a=6378137.0,f=1/298.257223563,b=a*(1-f),e2=1-(b*b)/(a*a),ep2=e2/(1-e2),k0=0.9996;
  const x=easting-500000,y=northing;
  const M=y/k0,mu=M/(a*(1-e2/4-3*e2*e2/64-5*e2*e2*e2/256));
  const e1=(1-Math.sqrt(1-e2))/(1+Math.sqrt(1-e2));
  const phi1=mu+(3*e1/2-27*e1*e1*e1/32)*Math.sin(2*mu)+(21*e1*e1/16-55*e1*e1*e1*e1/32)*Math.sin(4*mu)+(151*e1*e1*e1/96)*Math.sin(6*mu);
  const N1=a/Math.sqrt(1-e2*Math.sin(phi1)*Math.sin(phi1));
  const T1=Math.tan(phi1)*Math.tan(phi1),C1=ep2*Math.cos(phi1)*Math.cos(phi1),R1=a*(1-e2)/Math.pow(1-e2*Math.sin(phi1)*Math.sin(phi1),1.5);
  const D=x/(N1*k0);
  const lat=phi1-(N1*Math.tan(phi1)/R1)*(D*D/2-(5+3*T1+10*C1-4*C1*C1-9*ep2)*D*D*D*D/24+(61+90*T1+298*C1+45*T1*T1-252*ep2-3*C1*C1)*D*D*D*D*D*D/720);
  const lon0=(zone*6-183)*Math.PI/180;
  const lon=lon0+(D-(1+2*T1+C1)*D*D*D/6+(5-2*C1+28*T1-3*C1*C1+8*ep2+24*T1*T1)*D*D*D*D*D/120)/Math.cos(phi1);
  return [lon*180/Math.PI, lat*180/Math.PI];
}
function isUTM(coord) { return Math.abs(coord[0]) > 180 || Math.abs(coord[1]) > 90; }
function detectUTMZone(gj) { const s=JSON.stringify(gj.crs||''); const m=s.match(/326(\d\d)/); return m ? parseInt(m[1]) : 47; }
function convertGeometryToWgs84(geometry, zone) {
  if (!geometry) return geometry;
  function cvt(arr) { if (!arr || !arr.length) return arr; if (typeof arr[0]==='number') return utmToWgs84(arr[0],arr[1],zone); return arr.map(cvt); }
  const g = JSON.parse(JSON.stringify(geometry)); g.coordinates = cvt(g.coordinates); return g;
}
function flattenRaw(geometry) {
  if (!geometry) return [];
  const t=geometry.type, c=geometry.coordinates;
  if (t==='Point') return [c];
  if (t==='MultiPoint' || t==='LineString') return c;
  if (t==='Polygon') return c.flat(1);
  if (t==='MultiLineString') return c.flat(1);
  if (t==='MultiPolygon') return c.flat(2);
  return [];
}
function flattenCoords(g) { return flattenRaw(g); }

// ============================================================
// BASEMAPS
// ============================================================
const BASEMAPS = {
  'google-road':      { tiles:['https://mt0.google.com/vt/lyrs=m&x={x}&y={y}&z={z}','https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}'], tileSize:256 },
  'google-satellite': { tiles:['https://mt0.google.com/vt/lyrs=s&x={x}&y={y}&z={z}','https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}'], tileSize:256 },
  'google-hybrid':    { tiles:['https://mt0.google.com/vt/lyrs=y&x={x}&y={y}&z={z}','https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}'], tileSize:256 },
  'osm':              { tiles:['https://tile.openstreetmap.org/{z}/{x}/{y}.png'], tileSize:256 },
  // ── UPDATED: PMTiles — no localhost needed ──
  'uzmasat-tiles':    { pmtiles: true, url: 'pmtiles://seremban.pmtiles', tileSize:256 },
};

function buildMapStyle(key) {
  const bm = BASEMAPS[key];
  // PMTiles raster source uses 'url', not 'tiles'
  if (bm.pmtiles) {
    return {
      version: 8,
      sources: { basemap: { type: 'raster', url: bm.url, tileSize: bm.tileSize } },
      layers: [{ id: 'basemap', type: 'raster', source: 'basemap' }]
    };
  }
  const src = { type:'raster', tiles:bm.tiles, tileSize:bm.tileSize, minzoom:bm.minzoom||0, maxzoom:bm.maxzoom||19 };
  if (bm.scheme) src.scheme = bm.scheme;
  return { version:8, sources:{ basemap:src }, layers:[{ id:'basemap', type:'raster', source:'basemap' }] };
}

// ============================================================
// MAP INIT
// ============================================================
window.addEventListener('load', () => {
  // ── UPDATED: Register PMTiles protocol BEFORE map init ──
  if (window.pmtiles) {
    const protocol = new pmtiles.Protocol();
    maplibregl.addProtocol('pmtiles', protocol.tile.bind(protocol));
    console.log('✅ PMTiles protocol registered');
  } else {
    console.warn('⚠️ pmtiles.js not loaded — UZMA-sat layer will not work');
  }

  map = new maplibregl.Map({
    container: 'map',
    style: buildMapStyle('google-road'),
    center: [101.94, 2.72],
    zoom: 11,
    maxZoom: 20,
    preserveDrawingBuffer: true
  });
  map.addControl(new maplibregl.NavigationControl(), 'top-right');
  map.on('click', onMapClick);
  map.on('mousemove', onMapMouseMove);
  map.on('mouseleave', onMapMouseLeave);
  map.getCanvas().style.cursor = 'grab';
  map.on('load', () => { autoLoadGeoJSON(); });

  const mapEl = document.getElementById('map');
  mapEl.addEventListener('mousemove', e => {
    const cursor = document.getElementById('custom-cursor');
    cursor.style.left = e.clientX + 'px';
    cursor.style.top  = e.clientY + 'px';
  });

  document.getElementById('search-input').addEventListener('input', function() { handleSearch(this.value); });
  document.getElementById('search-input').addEventListener('keydown', function(e) {
    if (e.key === 'Escape') { document.getElementById('search-dropdown').style.display = 'none'; }
  });
  document.addEventListener('click', e => {
    if (!e.target.closest('.topbar-search')) document.getElementById('search-dropdown').style.display = 'none';
    if (!e.target.closest('.basemap-switcher')) {
      document.getElementById('basemap-dropdown').classList.remove('open');
    }
    if (!e.target.closest('.area-overlay') && e.target.classList.contains('area-overlay')) {
      closeAreaModal();
    }
  });
});

async function autoLoadGeoJSON() {
  showLoading('Loading ' + SEREMBAN_FILE + '...', 'Please wait a moment');
  try {
    const res = await fetch(SEREMBAN_FILE);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const geojson = await res.json();
    const size = parseInt(res.headers.get('content-length') || 0);
    hideLoading();
    addDataset(SEREMBAN_FILE, geojson, size, true);
  } catch (err) {
    hideLoading();
    console.warn('Auto-load failed:', err.message);
  }
}

// ============================================================
// TRAFFIC LIGHTS
// ============================================================
function toggleTrafficLights(el) {
  const isOn = el.classList.contains('on');
  if (!isOn) {
    el.className = 'layer-toggle on';
    document.getElementById('tl-detail-panel').style.display = 'block';
    trafficLightsVisible = true;
    renderTrafficLights();
    showToast('🚦 Lampu isyarat dipaparkan — ' + trafficLightsData.features.length + ' titik');
    addActivityLog('Lampu isyarat aktif', trafficLightsData.features.length + ' titik dipaparkan');
  } else {
    el.className = 'layer-toggle off';
    document.getElementById('tl-detail-panel').style.display = 'none';
    trafficLightsVisible = false;
    clearTrafficLights();
    showToast('🔲 Lampu isyarat disembunyikan');
  }
}

function renderTrafficLights() {
  clearTrafficLights();
  const features = trafficLightsData.features;
  const currentZoom = map.getZoom();
  if (currentZoom < 9) {
    showToast('⚠️ Zum masuk untuk lihat lampu isyarat (zoom ≥ 9)');
    return;
  }
  features.forEach(f => {
    const [lng, lat] = f.geometry.coordinates;
    const el = document.createElement('div');
    el.className = 'tl-marker';
    el.style.cssText = 'font-size:' + tlEmojiSize + 'px;line-height:1;cursor:pointer;user-select:none;width:' + (tlEmojiSize+4) + 'px;height:' + (tlEmojiSize+4) + 'px;display:flex;align-items:center;justify-content:center;filter:drop-shadow(0 1px 3px rgba(0,0,0,0.4));transition:filter 0.15s;';
    el.textContent = '🚦';
    el.title = 'Lampu Isyarat #' + f.properties.id;
    el.addEventListener('mouseenter', () => { el.style.filter = 'drop-shadow(0 2px 8px rgba(253,216,53,0.9)) brightness(1.2)'; el.style.zIndex = '99'; });
    el.addEventListener('mouseleave', () => { el.style.filter = 'drop-shadow(0 1px 3px rgba(0,0,0,0.4))'; el.style.zIndex = ''; });
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      new maplibregl.Popup({ offset: 8, closeButton: true })
        .setLngLat([lng, lat])
        .setHTML(`<div class="popup-header" style="background:#FDD835;color:#333;"><div class="popup-fc" style="color:#666;">Lampu Isyarat</div><div class="popup-name" style="color:#333;">🚦 ID #${f.properties.id}</div></div><div class="popup-body"><div class="popup-row"><span class="popup-k">Jenis</span><span class="popup-v">Traffic Signal</span></div><div class="popup-row"><span class="popup-k">Latitude</span><span class="popup-v" style="font-family:monospace;font-size:10px;">${lat.toFixed(6)}</span></div><div class="popup-row"><span class="popup-k">Longitude</span><span class="popup-v" style="font-family:monospace;font-size:10px;">${lng.toFixed(6)}</span></div><div class="popup-row"><span class="popup-k">Sumber</span><span class="popup-v">OSM (.shp)</span></div></div>`)
        .addTo(map);
    });
    const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
      .setLngLat([lng, lat])
      .addTo(map);
    trafficLightMarkers.push(marker);
  });
  showToast('🚦 ' + features.length + ' lampu isyarat dipaparkan');
}

function clearTrafficLights() {
  trafficLightMarkers.forEach(m => m.remove());
  trafficLightMarkers = [];
}

function updateTLSize(val) {
  tlEmojiSize = parseInt(val);
  document.getElementById('tl-size-val').textContent = val + 'px';
  if (trafficLightsVisible) {
    trafficLightMarkers.forEach(m => {
      if (m.getElement()) m.getElement().style.fontSize = val + 'px';
    });
  }
}

// ============================================================
// WATER LAYER
// ============================================================
function toggleWaterLayer(el) {
  const isOn = el.classList.contains('on');
  if (!isOn) {
    el.className = 'layer-toggle on';
    waterLayerVisible = true;
    renderWaterLayer();
    showToast('💧 Lapisan air dipaparkan — ' + waterData.features.length + ' kawasan');
    addActivityLog('Lapisan air aktif', waterData.features.length + ' kawasan air dipaparkan');
  } else {
    el.className = 'layer-toggle off';
    waterLayerVisible = false;
    clearWaterLayer();
    showToast('🔲 Lapisan air disembunyikan');
  }
}

function renderWaterLayer() {
  clearWaterLayer();
  try {
    if (map.getSource('water-source')) return;
    map.addSource('water-source', { type: 'geojson', data: waterData });
    map.addLayer({
      id: 'water-fill',
      type: 'fill',
      source: 'water-source',
      paint: {
        'fill-color': ['case',
          ['==', ['get','f'], 'riverbank'], '#2196F3',
          ['==', ['get','f'], 'water'], '#42A5F5',
          ['==', ['get','f'], 'wetland'], '#00BCD4',
          ['==', ['get','f'], 'wetland_mangrove'], '#26C6DA',
          ['==', ['get','f'], 'marsh'], '#80DEEA',
          '#64B5F6'
        ],
        'fill-opacity': 0.55
      }
    });
    map.addLayer({
      id: 'water-outline',
      type: 'line',
      source: 'water-source',
      paint: { 'line-color': '#1565C0', 'line-width': 0.8, 'line-opacity': 0.6 }
    });
    map.on('click', 'water-fill', (e) => {
      const props = e.features[0].properties;
      const name = props.n || 'Kawasan Air';
      const fclass = props.f || 'water';
      new maplibregl.Popup({ offset: 8 })
        .setLngLat(e.lngLat)
        .setHTML(`<div class="popup-header" style="background:#1565C0;"><div class="popup-fc" style="color:rgba(255,255,255,0.6);">Hidrografi</div><div class="popup-name">💧 ${name}</div></div><div class="popup-body"><div class="popup-row"><span class="popup-k">Kelas</span><span class="popup-v">${fclass}</span></div><div class="popup-row"><span class="popup-k">Sumber</span><span class="popup-v">OSM</span></div></div>`)
        .addTo(map);
    });
    map.on('mouseenter', 'water-fill', () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', 'water-fill', () => { map.getCanvas().style.cursor = ''; });
  } catch(e) { console.error('Water layer error:', e); }
}

function clearWaterLayer() {
  try { map.off('click','water-fill'); map.removeLayer('water-fill'); } catch(e) {}
  try { map.removeLayer('water-outline'); } catch(e) {}
  try { map.removeSource('water-source'); } catch(e) {}
}

// ============================================================
// RAILWAY LAYER
// ============================================================
const RAILWAY_COLORS = {
  rail: '#FF5722', monorail: '#9C27B0', subway: '#3F51B5', light_rail: '#00BCD4', tram: '#4CAF50'
};
const RAILWAY_EMOJIS = {
  rail: '🚆', monorail: '🚝', subway: '🚇', light_rail: '🚊', tram: '🚃'
};

function toggleRailwayLayer(el) {
  const isOn = el.classList.contains('on');
  if (!isOn) {
    el.className = 'layer-toggle on';
    railwayLayerVisible = true;
    renderRailwayLayer();
    showToast('🚆 Laluan kereta api dipaparkan — ' + railwayData.features.length + ' segmen');
    addActivityLog('Lapisan kereta api aktif', railwayData.features.length + ' segmen dipaparkan');
  } else {
    el.className = 'layer-toggle off';
    railwayLayerVisible = false;
    clearRailwayLayer();
    showToast('🔲 Laluan kereta api disembunyikan');
  }
}

function renderRailwayLayer() {
  clearRailwayLayer();
  try {
    if (map.getSource('railway-source')) return;
    map.addSource('railway-source', { type: 'geojson', data: railwayData });
    map.addLayer({
      id: 'railway-glow',
      type: 'line',
      source: 'railway-source',
      paint: {
        'line-color': ['case',
          ['==',['get','f'],'rail'],'#FF5722',
          ['==',['get','f'],'monorail'],'#9C27B0',
          ['==',['get','f'],'subway'],'#3F51B5',
          ['==',['get','f'],'light_rail'],'#00BCD4',
          '#FF5722'
        ],
        'line-width': 6, 'line-opacity': 0.15, 'line-blur': 4
      }
    });
    map.addLayer({
      id: 'railway-line',
      type: 'line',
      source: 'railway-source',
      paint: {
        'line-color': ['case',
          ['==',['get','f'],'rail'],'#FF5722',
          ['==',['get','f'],'monorail'],'#9C27B0',
          ['==',['get','f'],'subway'],'#3F51B5',
          ['==',['get','f'],'light_rail'],'#00BCD4',
          '#FF5722'
        ],
        'line-width': ['interpolate',['linear'],['zoom'],8,1.5,14,4],
        'line-opacity': 0.9
      }
    });
    map.addLayer({
      id: 'railway-dash',
      type: 'line',
      source: 'railway-source',
      filter: ['==',['get','f'],'rail'],
      paint: {
        'line-color': '#fff', 'line-width': ['interpolate',['linear'],['zoom'],8,0.5,14,1.5],
        'line-dasharray': [4, 8], 'line-opacity': 0.6
      }
    });
    map.on('click', 'railway-line', (e) => {
      const props = e.features[0].properties;
      const fclass = props.f || 'rail';
      const emoji = RAILWAY_EMOJIS[fclass] || '🚆';
      const name = props.n || 'Laluan Kereta Api';
      const color = RAILWAY_COLORS[fclass] || '#FF5722';
      new maplibregl.Popup({ offset: 8 })
        .setLngLat(e.lngLat)
        .setHTML(`<div class="popup-header" style="background:${color};"><div class="popup-fc" style="color:rgba(255,255,255,0.6);">Rel/Railway</div><div class="popup-name">${emoji} ${name}</div></div><div class="popup-body"><div class="popup-row"><span class="popup-k">Jenis</span><span class="popup-v">${fclass}</span></div><div class="popup-row"><span class="popup-k">Sumber</span><span class="popup-v">OSM</span></div></div>`)
        .addTo(map);
    });
    map.on('mouseenter', 'railway-line', () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', 'railway-line', () => { map.getCanvas().style.cursor = ''; });
  } catch(e) { console.error('Railway layer error:', e); }

  const stationPoints = new Set();
  railwayData.features.forEach(feat => {
    const fclass = feat.properties.f || 'rail';
    const name = feat.properties.n || '';
    const emoji = RAILWAY_EMOJIS[fclass] || '🚆';
    const geom = feat.geometry;
    let lines = [];
    if (geom.type === 'MultiLineString') lines = geom.coordinates;
    else if (geom.type === 'LineString') lines = [geom.coordinates];
    lines.forEach(line => {
      if (!line || line.length === 0) return;
      const midIdx = Math.floor(line.length / 2);
      const [lng, lat] = line[midIdx];
      const key = lng.toFixed(4) + ',' + lat.toFixed(4);
      if (stationPoints.has(key)) return;
      stationPoints.add(key);
      const el = document.createElement('div');
      el.style.cssText = 'font-size:14px;line-height:1;cursor:pointer;user-select:none;width:18px;height:18px;display:flex;align-items:center;justify-content:center;filter:drop-shadow(0 1px 3px rgba(0,0,0,0.5));transition:filter 0.15s;';
      el.textContent = emoji;
      if (name) el.title = name;
      el.addEventListener('mouseenter', () => { el.style.filter = 'drop-shadow(0 2px 8px rgba(255,87,34,0.9)) brightness(1.2)'; });
      el.addEventListener('mouseleave', () => { el.style.filter = 'drop-shadow(0 1px 3px rgba(0,0,0,0.5))'; });
      const marker = new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat([lng, lat]).addTo(map);
      railwayMarkers.push(marker);
    });
  });
}

function clearRailwayLayer() {
  try { map.off('click','railway-line'); map.removeLayer('railway-glow'); } catch(e) {}
  try { map.removeLayer('railway-line'); } catch(e) {}
  try { map.removeLayer('railway-dash'); } catch(e) {}
  try { map.removeSource('railway-source'); } catch(e) {}
  railwayMarkers.forEach(m => m.remove());
  railwayMarkers = [];
}

function toggleRoadNetwork(el) {
  const isOn = el.classList.contains('on');
  if (!isOn) {
    el.className = 'layer-toggle on';
    roadNetworkVisible = true;
    showToast('🛣️ Rangkaian jalan — menggunakan OSM basemap');
    if (currentBasemap !== 'osm') {
      const optEl = document.querySelector('.basemap-option:nth-child(4)');
      switchBasemap('osm', 'OpenStreetMap', optEl);
    }
  } else {
    el.className = 'layer-toggle off';
    roadNetworkVisible = false;
    showToast('🔲 Rangkaian jalan disembunyikan');
  }
}

// ============================================================
// UZMA-SAT LAYER  ── FULLY UPDATED FOR PMTILES ──
// ============================================================
function loadUzmaSatLayer() {
  removeUzmaSatLayer();
  try {
    // ── Use PMTiles url protocol instead of localhost tiles ──
    map.addSource('uzmasat-source', {
      type: 'raster',
      url: 'pmtiles://seremban.pmtiles',
      tileSize: 256,
      attribution: '© UZMA Berhad',
    });
    map.addLayer({
      id: 'uzmasat-layer',
      type: 'raster',
      source: 'uzmasat-source',
      paint: { 'raster-opacity': uzmaSatOpacity, 'raster-fade-duration': 300 }
    }, getFirstGeoJsonLayerId());
    console.log('✅ UZMA-sat PMTiles layer loaded');
  } catch(e) {
    console.error('UZMA-sat load error:', e);
    showToast('⚠️ PMTiles could not be loaded — check seremban.pmtiles exists in repo root');
  }
}

function removeUzmaSatLayer() {
  try { map.removeLayer('uzmasat-layer'); } catch(e) {}
  try { map.removeSource('uzmasat-source'); } catch(e) {}
}

function getFirstGeoJsonLayerId() {
  for (const [,ds] of Object.entries(datasets)) {
    for (const [,info] of Object.entries(ds.layerVisibility)) {
      try { if (map.getLayer(info.fillId)) return info.fillId; } catch(e) {}
    }
  }
  return undefined;
}

function updateUzmaSatOpacity(val) {
  uzmaSatOpacity = parseInt(val) / 100;
  document.getElementById('opacity-val').textContent = val + '%';
  try { map.setPaintProperty('uzmasat-layer', 'raster-opacity', uzmaSatOpacity); } catch(e) {}
}

function toggleGeoJsonOverlay(el) {
  geoJsonOverlayVisible = el.classList.contains('on');
  el.className = 'layer-toggle ' + (geoJsonOverlayVisible ? 'off' : 'on');
  geoJsonOverlayVisible = !geoJsonOverlayVisible;
  for (const [,ds] of Object.entries(datasets)) {
    for (const [,info] of Object.entries(ds.layerVisibility)) {
      const vis = geoJsonOverlayVisible ? 'visible' : 'none';
      try { map.setLayoutProperty(info.fillId,    'visibility', vis); } catch(e) {}
      try { map.setLayoutProperty(info.outlineId, 'visibility', vis); } catch(e) {}
    }
  }
  showToast(geoJsonOverlayVisible ? '✅ GeoJSON lot overlay shown' : '🔲 GeoJSON lot overlay hidden');
}

function activateUzmaSat(el) {
  const isOn = el.classList.contains('on');
  if (!isOn) {
    el.className = 'layer-toggle on';
    document.getElementById('uzmasat-layer-info').style.display = 'block';
    document.getElementById('badge-uzmasat').textContent = 'Active';
    document.getElementById('badge-uzmasat').classList.add('demo');
    loadUzmaSatLayer();
    switchBasemap('uzma-sat', 'UZMA-sat', null);
    uzmaSatActive = true;
    addActivityLog('UZMA-sat activated', 'seremban.pmtiles · PMTiles · zoom 0–16');
    showToast('🛰️ UZMA-sat loaded — seremban.pmtiles · PMTiles');
  } else {
    el.className = 'layer-toggle off';
    document.getElementById('uzmasat-layer-info').style.display = 'none';
    document.getElementById('badge-uzmasat').textContent = 'Available';
    document.getElementById('badge-uzmasat').classList.remove('demo');
    removeUzmaSatLayer();
    uzmaSatActive = false;
    const firstOpt = document.querySelector('.basemap-option');
    switchBasemap('google-road', 'Google Maps', firstOpt);
    showToast('🔲 UZMA-sat deactivated');
  }
}

// ============================================================
// MULTI-DATASET
// ============================================================
function generateDatasetId() { return 'ds_' + (++datasetCounter); }

function addDataset(fileName, geojson, fileSize, isDefault=false) {
  if (!geojson.features || !geojson.features.length) { showToast('⚠️ GeoJSON has no features'); return; }

  const sampleCoord = flattenRaw(geojson.features[0].geometry)[0];
  let processedGeoJSON = geojson;
  if (sampleCoord && isUTM(sampleCoord)) {
    const zone = detectUTMZone(geojson);
    processedGeoJSON = { ...geojson, features: geojson.features.map(f => ({ ...f, geometry: convertGeometryToWgs84(f.geometry, zone) })) };
  }

  const features = processedGeoJSON.features;
  const sampleProps = features[0].properties || {};
  const classProp = detectProp(sampleProps, CLASS_PROP_CANDIDATES);
  const idProp    = detectProp(sampleProps, ID_PROP_CANDIDATES);
  const mukimProp = detectProp(sampleProps, MUKIM_PROP_CANDIDATES);
  const addrProp  = detectProp(sampleProps, ADDR_PROP_CANDIDATES);

  const classCount = {};
  features.forEach(f => {
    const cls = classProp ? (f.properties[classProp] || 'Other') : 'Data';
    classCount[cls] = (classCount[cls] || 0) + 1;
  });

  const mukimCount = {};
  if (mukimProp) features.forEach(f => {
    const m = f.properties[mukimProp] || 'Unknown';
    mukimCount[m] = (mukimCount[m] || 0) + 1;
  });

  let minLng=180, maxLng=-180, minLat=90, maxLat=-90, hasCoords=false;
  features.forEach(f => {
    flattenCoords(f.geometry).forEach(c => {
      if (!Array.isArray(c) || c.length < 2) return;
      const [lng, lat] = c;
      if (typeof lng !== 'number' || typeof lat !== 'number') return;
      if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return;
      if (lng < minLng) minLng = lng; if (lng > maxLng) maxLng = lng;
      if (lat < minLat) minLat = lat; if (lat > maxLat) maxLat = lat;
      hasCoords = true;
    });
  });

  const dsId = generateDatasetId();
  datasets[dsId] = {
    id: dsId, name: fileName, geojson: processedGeoJSON, features,
    classCount, mukimCount, classProp, idProp, mukimProp, addrProp,
    layerVisibility: {},
    bounds: hasCoords && isFinite(minLng) ? [[minLng, minLat], [maxLng, maxLat]] : null,
    fileSize, loadedAt: new Date()
  };

  addLayersForDataset(dsId);
  setActiveDataset(dsId);
  addActivityLog('Dataset loaded — ' + features.length.toLocaleString() + ' features', fileName);
  showToast('✅ ' + features.length.toLocaleString() + ' lots loaded · ' + fileName);
  updateDatasetBadge();
  updateDatasetModalList();
  document.getElementById('no-data-state').classList.add('hidden');
  document.getElementById('btn-fly').style.display = 'flex';
  document.getElementById('btn-semula').style.display = 'flex';
  document.getElementById('layer-badge').style.display = 'block';
}

function addLayersForDataset(dsId) {
  const ds = datasets[dsId];
  const sourceId = 'geojson-' + dsId;
  map.addSource(sourceId, { type:'geojson', data:ds.geojson, generateId:true });

  const classes = Object.keys(ds.classCount);
  ds.layerVisibility = {};
  classes.forEach(cls => {
    const safeCls = cls.replace(/[^a-zA-Z0-9]/g, '-');
    const fillId    = dsId + '-fill-'    + safeCls;
    const outlineId = dsId + '-outline-' + safeCls;
    const color = getColor(cls);
    const filter = ds.classProp ? ['==', ['get', ds.classProp], cls] : ['literal', true];

    map.addLayer({ id:fillId, type:'fill', source:sourceId, filter, paint:{
      'fill-color': color,
      'fill-opacity': ['case', ['boolean',['feature-state','hover'],false], 0.75, ['boolean',['feature-state','selected'],false], 0.85, 0.45]
    }});
    map.addLayer({ id:outlineId, type:'line', source:sourceId, filter, paint:{
      'line-color': ['case', ['boolean',['feature-state','hover'],false], '#FFFFFF', color],
      'line-width': ['interpolate',['linear'],['zoom'], 12, ['case',['boolean',['feature-state','hover'],false],2,0.5], 16, ['case',['boolean',['feature-state','hover'],false],3,1.5]],
      'line-opacity': ['case', ['boolean',['feature-state','hover'],false], 1, 0.7]
    }});

    ds.layerVisibility[cls] = { fillId, outlineId, sourceId, visible:true, color, count:ds.classCount[cls] };
  });
}

function setActiveDataset(dsId) {
  activeDatasetId = dsId;
  const ds = datasets[dsId];
  window._classProp = ds.classProp;
  window._idProp    = ds.idProp;
  window._mukimProp = ds.mukimProp;
  window._addrProp  = ds.addrProp;
  window._activeDsId = dsId;

  if (ds.bounds) { map.fitBounds(ds.bounds, { padding:60, duration:1000 }); window._dataBounds = ds.bounds; }
  updateStatsFromData(ds.features, ds.classCount);
  updateLayerBadge(dsId, ds.layerVisibility);
  updateOverviewCharts(ds.classCount, ds.mukimCount, ds.features.length, ds.name, ds.fileSize, ds.loadedAt);
  updateTopbarInfo(ds.features.length, ds.name);
  updateDatasetBadge();
}

function removeDataset(dsId) {
  const ds = datasets[dsId]; if (!ds) return;
  for (const [,info] of Object.entries(ds.layerVisibility)) {
    try { map.removeLayer(info.fillId); } catch(e) {}
    try { map.removeLayer(info.outlineId); } catch(e) {}
  }
  try { map.removeSource('geojson-' + dsId); } catch(e) {}
  delete datasets[dsId];
  updateDatasetBadge(); updateDatasetModalList();
  const remaining = Object.keys(datasets);
  if (remaining.length > 0) { setActiveDataset(remaining[remaining.length - 1]); showToast('🗑️ Dataset removed'); }
  else { activeDatasetId = null; document.getElementById('no-data-state').classList.remove('hidden'); resetUI(); showToast('🗑️ All datasets removed'); }
}

function resetUI() {
  document.getElementById('stat-total').textContent = '—';
  document.getElementById('stat-selected').textContent = '—';
  document.getElementById('overview-no-data').style.display = 'block';
  document.getElementById('overview-charts').style.display = 'none';
  document.getElementById('layer-badge').style.display = 'none';
  document.getElementById('dataset-badge').style.display = 'none';
  document.getElementById('btn-fly').style.display = 'none';
  document.getElementById('btn-semula').style.display = 'none';
}

// ============================================================
// UI UPDATES
// ============================================================
function updateStatsFromData(features, classCount) {
  document.getElementById('stat-total').textContent = features.length.toLocaleString();
  const pCount = countClass(classCount, ['Perumahan']);
  const kCount = countClass(classCount, ['Perkampungan','Kampung']);
  const nCount = countClass(classCount, ['Perniagaan','Industri','Niaga']);
  if (pCount > 0) { document.getElementById('stat-perumahan').textContent = pCount.toLocaleString(); document.getElementById('sc-perumahan').style.display = 'flex'; }
  if (kCount > 0) { document.getElementById('stat-kampung').textContent   = kCount.toLocaleString(); document.getElementById('sc-kampung').style.display = 'flex'; }
  if (nCount > 0) { document.getElementById('stat-niaga').textContent     = nCount.toLocaleString(); document.getElementById('sc-niaga').style.display = 'flex'; }
}
function countClass(classCount, names) {
  let t = 0;
  for (const [k,v] of Object.entries(classCount)) {
    if (names.some(n => k.toLowerCase().includes(n.toLowerCase()))) t += v;
  }
  return t;
}

function updateTopbarInfo(total, fileName) {
  document.getElementById('page-title').textContent = 'Land Use Dashboard — ' + fileName.replace(/\.(geojsonn?|json)$/i, '');
  document.getElementById('page-sub').textContent   = 'Geospatial AI (UZMA Berhad) · ' + total.toLocaleString() + ' lots · ' + Object.keys(datasets).length + ' dataset(s)';
  document.getElementById('panel-sub').textContent  = fileName + ' · ' + total.toLocaleString() + ' features';
}

// ============================================================
// LAYER BADGE
// ============================================================
function updateLayerBadge(dsId, visibility) {
  const container = document.getElementById('layer-items-container');
  container.innerHTML = '';

  if (uzmaSatActive) {
    const uzmaDiv = document.createElement('div');
    uzmaDiv.innerHTML = `<div style="font-size:8px;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;color:rgba(66,66,66,0.3);margin-bottom:5px;padding-top:2px;display:flex;align-items:center;gap:5px;">🛰 UZMA-SAT ACTIVE</div>`;
    container.appendChild(uzmaDiv);
  }

  for (const [cls, info] of Object.entries(visibility)) {
    const safeId = 'ltog-' + dsId + '-' + cls.replace(/[^a-z0-9]/gi, '_');
    const div = document.createElement('div');
    div.className = 'layer-item';
    div.innerHTML = `
      <div class="layer-dot" style="background:${info.color};"></div>
      <div class="layer-name">${cls}</div>
      <div class="layer-count">${info.count.toLocaleString()}</div>
      <div class="layer-toggle on" id="${safeId}"></div>
    `;
    div.querySelector('.layer-toggle').addEventListener('click', () => toggleLayer(dsId, cls, div.querySelector('.layer-toggle')));
    container.appendChild(div);
  }
}

// ============================================================
// DATASET BADGE
// ============================================================
function updateDatasetBadge() {
  const dsCount = Object.keys(datasets).length;
  const badge = document.getElementById('dataset-badge');
  if (dsCount < 2) { badge.style.display = 'none'; return; }
  badge.style.display = 'block';
  const container = document.getElementById('dataset-items-container');
  container.innerHTML = '';
  for (const [dsId, ds] of Object.entries(datasets)) {
    const isActive = dsId === activeDatasetId;
    const shortName = ds.name.replace(/\.(geojsonn?|json)$/i, '');
    const div = document.createElement('div');
    div.className = 'dataset-item';
    div.innerHTML = `<div class="dataset-radio ${isActive ? 'active' : ''}"></div><div class="dataset-name" title="${ds.name}">${shortName}</div><div class="dataset-count">${ds.features.length.toLocaleString()}</div>`;
    div.querySelector('.dataset-radio').addEventListener('click', () => { setActiveDataset(dsId); updateDatasetBadge(); });
    container.appendChild(div);
  }
}

function updateDatasetModalList() {
  const container = document.getElementById('datasets-modal-items');
  const wrapper = document.getElementById('datasets-modal-list');
  const dsCount = Object.keys(datasets).length;
  if (!dsCount) { wrapper.style.display = 'none'; return; }
  wrapper.style.display = 'block';
  container.innerHTML = '';
  for (const [dsId, ds] of Object.entries(datasets)) {
    const isActive = dsId === activeDatasetId;
    const shortName = ds.name.replace(/\.(geojsonn?|json)$/i, '');
    const div = document.createElement('div');
    div.className = 'dataset-modal-item';
    div.innerHTML = `
      <div><div class="dm-name">${shortName}</div><div class="dm-count">${ds.features.length.toLocaleString()} features · ${formatFileSize(ds.fileSize)}</div></div>
      <div style="display:flex;align-items:center;gap:6px;">
        ${isActive ? '<span class="dm-active">Active</span>' : ''}
        <button class="dm-btn">Remove</button>
      </div>`;
    div.querySelector('.dm-btn').addEventListener('click', () => removeDataset(dsId));
    container.appendChild(div);
  }
}

function updateOverviewCharts(classCount, mukimCount, total, fileName, fileSize, loadedAt) {
  document.getElementById('overview-no-data').style.display = 'none';
  document.getElementById('overview-charts').style.display = 'block';

  const heroVal = document.getElementById('summary-total-val');
  if (heroVal) {
    heroVal.textContent = total.toLocaleString();
    const heroSub = document.getElementById('summary-hero-sub');
    if (heroSub) heroSub.textContent = fileName.replace(/\.(geojsonn?|json)$/i,'') + ' · Negeri Sembilan';
  }

  const kpiPostcodes = document.getElementById('kpi-postcodes');
  const kpiGeocoded  = document.getElementById('kpi-geocoded');
  const kpiClasses   = document.getElementById('kpi-classes');
  if (activeDatasetId && datasets[activeDatasetId]) {
    const features = datasets[activeDatasetId].features;
    const postcodeSet = new Set();
    let geocodedCount = 0;
    const postcodeCount = {};
    features.forEach(f => {
      const pc = f.properties?.postcode;
      if (pc) { postcodeSet.add(pc); postcodeCount[pc] = (postcodeCount[pc]||0) + 1; }
      if (f.properties?.centroid_lat || f.properties?.geocoded_address) geocodedCount++;
    });
    if (kpiPostcodes) kpiPostcodes.textContent = postcodeSet.size;
    if (kpiGeocoded)  kpiGeocoded.textContent  = geocodedCount.toLocaleString();
    if (kpiClasses)   kpiClasses.textContent   = Object.keys(classCount).length || postcodeSet.size;

    const pcDiv = document.getElementById('postcode-distribution');
    if (pcDiv && Object.keys(postcodeCount).length) {
      const pcSorted = Object.entries(postcodeCount).sort((a,b) => b[1]-a[1]).slice(0,7);
      const pcMax = pcSorted[0][1];
      const pcColors = ['#DE9151','#4CAF50','#1E88E5','#9C27B0','#00BCD4','#FF7043','#FDD835'];
      pcDiv.innerHTML = pcSorted.map(([pc,cnt], i) => {
        const w = Math.max(3, (cnt/pcMax)*100);
        const pct = ((cnt/total)*100).toFixed(1);
        return `<div class="postcode-row">
          <span class="postcode-label">${pc||'?'}</span>
          <div class="postcode-bar-track"><div class="postcode-bar-fill" style="width:${w}%;background:${pcColors[i%pcColors.length]};"></div></div>
          <span class="postcode-count">${cnt.toLocaleString()} (${pct}%)</span>
        </div>`;
      }).join('');
    } else if (pcDiv) {
      pcDiv.innerHTML = '<div style="font-size:11px;color:rgba(66,66,66,0.38);padding:6px 0;">Tiada data poskod</div>';
    }
  }

  const barContainer = document.getElementById('bar-chart-container');
  barContainer.innerHTML = '';
  const maxCount = Math.max(...Object.values(classCount));
  for (const [cls, count] of Object.entries(classCount)) {
    const pct = Math.max(4, (count / maxCount) * 100);
    const col = document.createElement('div');
    col.className = 'bar-col';
    col.innerHTML = `<div class="bar" style="height:${pct}%;background:${getColor(cls)};"></div><div class="bar-label">${cls.length > 8 ? cls.substring(0,7) + '…' : cls}</div>`;
    col.querySelector('.bar').addEventListener('click', () => filterToClass(cls));
    barContainer.appendChild(col);
  }

  const luList = document.getElementById('lu-list');
  luList.innerHTML = '';
  const sorted = Object.entries(classCount).sort((a,b) => b[1] - a[1]);
  sorted.forEach(([cls, count]) => {
    const pct = ((count / total) * 100).toFixed(1);
    const barW = Math.max(2, (count / sorted[0][1]) * 100);
    luList.innerHTML += `<div class="lu-item"><div class="lu-dot" style="background:${getColor(cls)};"></div><div class="lu-name">${cls}</div><div class="lu-bar-wrap"><div class="lu-bar-fill" style="width:${barW}%;background:${getColor(cls)};"></div></div><div class="lu-count" style="margin-right:3px;">${count.toLocaleString()}</div><div class="lu-pct">${pct}%</div></div>`;
  });

  const mukimList = document.getElementById('mukim-list');
  mukimList.innerHTML = '';
  if (Object.keys(mukimCount).length > 0) {
    Object.entries(mukimCount).sort((a,b) => b[1]-a[1]).slice(0,10).forEach(([mukim, count]) => {
      mukimList.innerHTML += `<div class="lu-item"><div class="lu-dot" style="background:#424242;border-radius:50%;"></div><div class="lu-name">${mukim}</div><div class="lu-pct">${count.toLocaleString()}</div></div>`;
    });
  } else {
    mukimList.innerHTML = '<div style="font-size:11.5px;color:rgba(66,66,66,0.38);text-align:center;padding:7px;">Tiada data sub-daerah</div>';
  }

  document.getElementById('info-filename').textContent = fileName;
  document.getElementById('info-total').textContent    = total.toLocaleString();
  document.getElementById('info-filesize').textContent = formatFileSize(fileSize);
  document.getElementById('info-loaded').textContent   = loadedAt.toLocaleString('en-MY');
}

function formatFileSize(bytes) {
  if (!bytes) return '—';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024*1024) return (bytes/1024).toFixed(1) + ' KB';
  return (bytes/(1024*1024)).toFixed(2) + ' MB';
}

// ============================================================
// MAP INTERACTIONS
// ============================================================
function onMapClick(e) {
  if (mapMode === 'plot') { addPlotMarker(e.lngLat); return; }
  if (mapMode !== 'select') return;

  const allFillLayers = [];
  for (const [,ds] of Object.entries(datasets))
    for (const [,info] of Object.entries(ds.layerVisibility))
      allFillLayers.push(info.fillId);
  if (!allFillLayers.length) return;

  const features = map.queryRenderedFeatures(e.point, { layers: allFillLayers });
  if (!features.length) return;

  const feature = features[0];
  showParcelInfo(feature, e.lngLat);
  document.getElementById('stat-selected').textContent = '1';
  selectedFeature = feature;

  const pulse = document.getElementById('selection-pulse');
  const rect  = document.getElementById('map').getBoundingClientRect();
  pulse.style.left = (e.point.x + rect.left) + 'px';
  pulse.style.top  = (e.point.y + rect.top)  + 'px';
  pulse.style.display = 'block';
  pulse.style.animation = 'none';
  pulse.offsetHeight;
  pulse.style.animation = 'ringExpand 0.8s cubic-bezier(0.25,0.46,0.45,0.94) forwards';
  setTimeout(() => { pulse.style.display = 'none'; }, 850);
}

function onMapMouseMove(e) {
  if (mapMode !== 'select') return;
  const allFillLayers = [];
  for (const [,ds] of Object.entries(datasets))
    for (const [,info] of Object.entries(ds.layerVisibility))
      if (info.visible) allFillLayers.push(info.fillId);
  if (!allFillLayers.length) return;

  const features = map.queryRenderedFeatures(e.point, { layers: allFillLayers });
  if (hoveredFeatureId !== null && hoverDatasetId) {
    try { map.setFeatureState({ source:'geojson-'+hoverDatasetId, id:hoveredFeatureId }, { hover:false }); } catch(ex) {}
    hoveredFeatureId = null; hoverDatasetId = null;
  }
  if (features.length > 0) {
    const f = features[0];
    for (const [dsId, ds] of Object.entries(datasets)) {
      for (const [,info] of Object.entries(ds.layerVisibility)) {
        if (info.fillId === f.layer.id) {
          hoveredFeatureId = f.id; hoverDatasetId = dsId;
          try { map.setFeatureState({ source:'geojson-'+dsId, id:f.id }, { hover:true }); } catch(ex) {}
          break;
        }
      }
      if (hoveredFeatureId !== null) break;
    }
  }
}

function onMapMouseLeave() {
  if (hoveredFeatureId !== null && hoverDatasetId) {
    try { map.setFeatureState({ source:'geojson-'+hoverDatasetId, id:hoveredFeatureId }, { hover:false }); } catch(ex) {}
    hoveredFeatureId = null; hoverDatasetId = null;
  }
}

function showParcelInfo(feature, lngLat) {
  if (currentPopup) currentPopup.remove();
  const props  = feature.properties || {};
  const cls    = window._classProp ? props[window._classProp] : 'Lot';
  const lotId  = window._idProp    ? props[window._idProp]    : (feature.id || 'N/A');
  const popupRows = Object.entries(props).slice(0,6).map(([k,v]) =>
    `<div class="popup-row"><span class="popup-k">${k}</span><span class="popup-v">${v}</span></div>`
  ).join('');

  currentPopup = new maplibregl.Popup({ offset:8 })
    .setLngLat(lngLat)
    .setHTML(`<div class="popup-header"><div class="popup-fc">${cls||'Feature'}</div><div class="popup-name">${lotId}</div></div><div class="popup-body">${popupRows}</div>`)
    .addTo(map);

  document.getElementById('parcel-id').textContent = lotId;
  const propsContainer = document.getElementById('parcel-props-container');
  let html = '<div class="pc-section-title">📋 All Properties</div>';
  for (const [k,v] of Object.entries(props))
    html += `<div class="pc-row"><span class="pc-k">${k}</span><span class="pc-v">${v ?? '—'}</span></div>`;
  propsContainer.innerHTML = html;

  const c = lngLat;
  propsContainer.innerHTML += `
    <div class="pc-section-title">📐 Click Coordinates</div>
    <div class="pc-row"><span class="pc-k">Latitude</span><span class="pc-v" id="p-lat" style="font-family:monospace;font-size:9.5px;">${c.lat.toFixed(7)}</span></div>
    <div class="pc-row"><span class="pc-k">Longitude</span><span class="pc-v" id="p-lng" style="font-family:monospace;font-size:9.5px;">${c.lng.toFixed(7)}</span></div>`;

  document.getElementById('no-parcel-msg').style.display  = 'none';
  document.getElementById('parcel-detail').style.display  = 'block';
  document.querySelectorAll('.ptab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('[id^="tab-"]').forEach(t => t.style.display = 'none');
  document.getElementById('tab-parcel').style.display = 'block';
  document.querySelectorAll('.ptab').forEach(t => {
    if (t.getAttribute('onclick') && t.getAttribute('onclick').includes('parcel')) t.classList.add('active');
  });
}

// ============================================================
// SEARCH
// ============================================================
function handleSearch(val) {
  clearTimeout(_searchTimeout);
  clearTimeout(_geocodeTimeout);
  const dd = document.getElementById('search-dropdown');
  if (!val.trim()) { dd.style.display = 'none'; return; }
  const localResults = getLocalSearchResults(val);
  if (localResults.length > 0) {
    renderSearchDropdown(localResults, []);
    dd.style.display = 'block';
  } else {
    dd.innerHTML = `<div class="search-loading"><div class="search-spinner"></div> Searching for address...</div>`;
    dd.style.display = 'block';
  }
  if (val.trim().length >= 3) {
    _geocodeTimeout = setTimeout(() => runGeocode(val, localResults), 600);
  }
}

function getLocalSearchResults(val) {
  if (!activeDatasetId) return [];
  const ds = datasets[activeDatasetId];
  const q = val.toLowerCase();
  return ds.features.filter(f =>
    Object.values(f.properties || {}).some(v => String(v).toLowerCase().includes(q))
  ).slice(0, 8);
}

async function runGeocode(query, localResults) {
  const dd = document.getElementById('search-dropdown');
  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query + ', Malaysia')}&format=json&limit=5&countrycodes=MY&viewbox=101.5,2.4,102.5,3.1&bounded=0`;
    const res = await fetch(url, { headers: { 'Accept-Language': 'en' } });
    if (!res.ok) throw new Error('Geocode failed');
    const geocodeResults = await res.json();
    renderSearchDropdown(localResults, geocodeResults);
    if (!localResults.length && !geocodeResults.length)
      dd.innerHTML = `<div style="padding:12px 13px;font-size:12px;color:rgba(66,66,66,0.4);">No results found</div>`;
  } catch(e) {
    renderSearchDropdown(localResults, []);
    if (!localResults.length)
      dd.innerHTML = `<div style="padding:12px 13px;font-size:12px;color:rgba(66,66,66,0.4);">No results found</div>`;
  }
  dd.style.display = 'block';
}

function renderSearchDropdown(localResults, geocodeResults) {
  _searchResults = localResults;
  const dd = document.getElementById('search-dropdown');
  let html = '';
  if (localResults.length > 0) {
    html += `<div class="search-section-header">📂 Lots / Local Data</div>`;
    localResults.forEach((f, idx) => {
      const ds = activeDatasetId ? datasets[activeDatasetId] : null;
      const id  = (ds && ds.idProp)    ? (f.properties[ds.idProp]    || 'Feature') : 'Feature';
      const cls = (ds && ds.classProp) ? (f.properties[ds.classProp] || '')        : '';
      const addr = (ds && ds.addrProp) ? f.properties[ds.addrProp] : '';
      const sub  = [cls, addr].filter(Boolean).join(' · ') || 'Geospatial Data';
      html += `<div class="search-item local-result" data-idx="${idx}"><div class="search-item-icon">📌</div><div class="search-item-body"><div class="search-item-id">${id}</div><div class="search-item-cls">${sub}</div></div></div>`;
    });
  }
  if (geocodeResults.length > 0) {
    html += `<div class="search-section-header">🔍 Address / Location</div>`;
    geocodeResults.forEach((place) => {
      const shortName = place.display_name.split(',').slice(0,3).join(', ');
      const type = place.type ? place.type.replace(/_/g,' ') : place.class || '';
      html += `<div class="search-item geocode-result" data-lat="${place.lat}" data-lng="${place.lon}" data-name="${shortName.replace(/"/g,'&quot;')}"><div class="search-item-icon">${getGeocodeIcon(place.class, place.type)}</div><div class="search-item-body"><div class="search-item-id">${shortName}</div><div class="search-item-cls">${type} · ${place.display_name.split(',').slice(2,4).join(',').trim()}</div></div></div>`;
    });
  }
  if (!html) html = `<div style="padding:12px 13px;font-size:12px;color:rgba(66,66,66,0.4);">No results found</div>`;
  dd.innerHTML = html;
  dd.querySelectorAll('.local-result').forEach(el => {
    el.addEventListener('click', () => selectSearchResult(parseInt(el.getAttribute('data-idx'))));
  });
  dd.querySelectorAll('.geocode-result').forEach(el => {
    el.addEventListener('click', () => flyToGeocode(parseFloat(el.getAttribute('data-lat')), parseFloat(el.getAttribute('data-lng')), el.getAttribute('data-name')));
  });
}

function getGeocodeIcon(cls, type) {
  const t = (type||'').toLowerCase(), c = (cls||'').toLowerCase();
  if (t.includes('school')||t.includes('university')) return '🏫';
  if (t.includes('hospital')||t.includes('clinic')) return '🏥';
  if (t.includes('mosque')||t.includes('religious')) return '🕌';
  if (c==='highway'||t.includes('road')||t.includes('motorway')) return '🛣️';
  if (c==='place'&&(t.includes('town')||t.includes('city')||t.includes('village'))) return '🏘️';
  if (c==='amenity') return '🏢';
  if (c==='boundary'||t.includes('district')||t.includes('state')) return '🗺️';
  if (c==='natural'||t.includes('river')||t.includes('water')) return '💧';
  return '📍';
}

function flyToGeocode(lat, lng, name) {
  document.getElementById('search-dropdown').style.display = 'none';
  document.getElementById('search-input').value = '';
  map.flyTo({ center:[lng, lat], zoom:16, duration:1200 });
  if (window._geocodeMarker) window._geocodeMarker.remove();
  const el = document.createElement('div');
  el.style.cssText = 'pointer-events:none;';
  el.innerHTML = `<svg width="32" height="40" viewBox="0 0 32 40" fill="none"><path d="M16 0C7.163 0 0 7.163 0 16c0 10.8 16 24 16 24s16-13.2 16-24C32 7.163 24.837 0 16 0z" fill="#1E88E5"/><circle cx="16" cy="16" r="6" fill="white"/></svg>`;
  window._geocodeMarker = new maplibregl.Marker({ element:el, anchor:'bottom' }).setLngLat([lng, lat]).addTo(map);
  setTimeout(() => {
    new maplibregl.Popup({ offset:8, closeOnClick:true })
      .setLngLat([lng, lat])
      .setHTML(`<div class="popup-header" style="background:#1E88E5;"><div class="popup-fc">Address Found</div><div class="popup-name" style="font-size:11px;line-height:1.4;">${name}</div></div><div class="popup-body"><div class="popup-row"><span class="popup-k">Latitude</span><span class="popup-v" style="font-family:monospace;font-size:10px;">${lat.toFixed(6)}</span></div><div class="popup-row"><span class="popup-k">Longitude</span><span class="popup-v" style="font-family:monospace;font-size:10px;">${lng.toFixed(6)}</span></div></div>`)
      .addTo(map);
  }, 800);
  addActivityLog('Address searched: ' + name, lat.toFixed(5) + ', ' + lng.toFixed(5));
}

function selectSearchResult(idx) {
  document.getElementById('search-dropdown').style.display = 'none';
  document.getElementById('search-input').value = '';
  if (!activeDatasetId || !_searchResults[idx]) return;
  const feature = _searchResults[idx];
  const coords  = flattenCoords(feature.geometry);
  if (!coords.length) return;
  const avgLng = coords.reduce((s,[lng]) => s + lng, 0) / coords.length;
  const avgLat = coords.reduce((s,[,lat]) => s + lat, 0) / coords.length;
  map.flyTo({ center:[avgLng, avgLat], zoom:16, duration:1000 });
  setTimeout(() => { showParcelInfo(feature, { lng:avgLng, lat:avgLat }); selectedFeature = feature; document.getElementById('stat-selected').textContent = '1'; }, 800);
}

// ============================================================
// GEOSPATIAL CATEGORY TOGGLES
// ============================================================
const GEO_CAT_STATE = { topo:false, hydro:false, transport:false, admin:false, buildings:true, landuse:true, utility:false, gazetteer:false };
const GEO_CAT_CLASS_MAP = {
  buildings: ['Perumahan','Perkampungan','Kemudahan Awam','Industri','Perniagaan','Perniagaan/Industri'],
  landuse:   ['Pertanian','Hutan','Tanah Lapang','Hidrografi','Lain-lain'],
  hydro:     ['Hidrografi','Sungai','Tasik'],
  admin:     ['Sempadan','Admin'],
};

function toggleGeoCat(cat, el) {
  const isOn = el.classList.contains('on');
  el.className = 'layer-toggle ' + (isOn ? 'off' : 'on');
  GEO_CAT_STATE[cat] = !isOn;
  const newState = !isOn;
  if (!activeDatasetId) {
    showToast(newState ? '⚠️ No active data for this category' : '');
    if (newState) el.className = 'layer-toggle off';
    return;
  }
  const ds = datasets[activeDatasetId];
  const affectedClasses = GEO_CAT_CLASS_MAP[cat];
  if (!affectedClasses) {
    if (newState) { showToast(`ℹ️ ${getCatName(cat)}: Data not yet integrated`); el.className = 'layer-toggle off'; GEO_CAT_STATE[cat] = false; }
    return;
  }
  let toggled = 0;
  for (const [cls, info] of Object.entries(ds.layerVisibility)) {
    const matches = affectedClasses.some(kw => cls.toLowerCase().includes(kw.toLowerCase()));
    if (matches) {
      info.visible = newState;
      const vis = newState ? 'visible' : 'none';
      try { map.setLayoutProperty(info.fillId,    'visibility', vis); } catch(e) {}
      try { map.setLayoutProperty(info.outlineId, 'visibility', vis); } catch(e) {}
      const badgeId = 'ltog-' + activeDatasetId + '-' + cls.replace(/[^a-z0-9]/gi, '_');
      const tog = document.getElementById(badgeId);
      if (tog) tog.className = 'layer-toggle ' + (newState ? 'on' : 'off');
      toggled++;
    }
  }
  if (toggled > 0) showToast(`${newState ? '✅' : '🔲'} ${getCatName(cat)} — ${toggled} class(es) ${newState ? 'shown' : 'hidden'}`);
  else showToast(`ℹ️ ${getCatName(cat)}: No matching classes in active dataset`);
}

function getCatName(cat) {
  const names = { topo:'Topography', hydro:'Hydrography', transport:'Transportation', admin:'Administrative Boundaries', buildings:'Buildings & Structures', landuse:'Land Use', utility:'Utilities', gazetteer:'Places/Gazetteer' };
  return names[cat] || cat;
}

// ============================================================
// PLOT MARKERS
// ============================================================
function setMarkerShape(shape, el) { markerShape = shape; document.querySelectorAll('.pt-shape').forEach(b => b.classList.remove('active')); el.classList.add('active'); }
function setMarkerColor(color, el) { markerColor = color; document.querySelectorAll('.pt-color').forEach(b => b.classList.remove('active')); el.classList.add('active'); }

function addPlotMarker(lngLat) {
  const markerEl = document.createElement('div');
  markerEl.style.cssText = 'cursor:pointer;user-select:none;display:flex;align-items:center;justify-content:center;';
  const sz = markerSize;
  if (markerShape === 'pin') markerEl.innerHTML = `<svg width="${sz}" height="${sz}" viewBox="0 0 24 24" fill="${markerColor}" style="filter:drop-shadow(0 2px 4px rgba(0,0,0,0.3));"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>`;
  else if (markerShape === 'circle') markerEl.innerHTML = `<div style="width:${sz*0.7}px;height:${sz*0.7}px;border-radius:50%;background:${markerColor};border:2.5px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.3);"></div>`;
  else if (markerShape === 'flag') markerEl.innerHTML = `<svg width="${sz}" height="${sz}" viewBox="0 0 24 24" fill="${markerColor}" style="filter:drop-shadow(0 2px 4px rgba(0,0,0,0.3));"><path d="M14.4 6L14 4H5v17h2v-7h5.6l.4 2h7V6z"/></svg>`;
  else if (markerShape === 'star') markerEl.innerHTML = `<svg width="${sz}" height="${sz}" viewBox="0 0 24 24" fill="${markerColor}" style="filter:drop-shadow(0 2px 4px rgba(0,0,0,0.3));"><polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26"/></svg>`;
  else if (markerShape === 'cross') markerEl.innerHTML = `<svg width="${sz}" height="${sz}" viewBox="0 0 24 24" fill="${markerColor}" style="filter:drop-shadow(0 2px 4px rgba(0,0,0,0.3));"><rect x="10" y="4" width="4" height="16" rx="1"/><rect x="4" y="10" width="16" height="4" rx="1"/></svg>`;

  const marker = new maplibregl.Marker({ element:markerEl, anchor:'bottom' }).setLngLat(lngLat).addTo(map);
  const idx = plotMarkers.length + 1;
  const markerData = { marker, lngLat, shape:markerShape, color:markerColor, size:markerSize, idx };
  plotMarkers.push(markerData);

  markerEl.addEventListener('click', e => {
    e.stopPropagation();
    new maplibregl.Popup({ offset:10 }).setLngLat(lngLat).setHTML(`
      <div class="popup-header" style="background:${markerColor};padding:9px 14px;"><div class="marker-popup-title">Marker #${markerData.idx}</div></div>
      <div class="popup-body">
        <div class="popup-row"><span class="popup-k">Latitude</span><span class="popup-v" style="font-family:monospace;font-size:10px;">${lngLat.lat.toFixed(7)}</span></div>
        <div class="popup-row"><span class="popup-k">Longitude</span><span class="popup-v" style="font-family:monospace;font-size:10px;">${lngLat.lng.toFixed(7)}</span></div>
        <div class="popup-row"><span class="popup-k">Shape</span><span class="popup-v">${markerData.shape}</span></div>
        <div style="margin-top:9px;"><button id="del-marker-${markerData.idx}" style="width:100%;height:28px;border:1px solid rgba(229,57,53,0.3);background:none;border-radius:6px;font-family:'DM Sans',sans-serif;font-size:11px;color:#e53935;cursor:pointer;">🗑️ Remove</button></div>
      </div>`).addTo(map);
    setTimeout(() => { const btn = document.getElementById('del-marker-' + markerData.idx); if (btn) btn.addEventListener('click', () => removeMarkerByIdx(markerData.idx)); }, 100);
  });

  updateMarkerCount();
  addActivityLog(`Marker #${idx} plotted`, `${lngLat.lat.toFixed(5)}, ${lngLat.lng.toFixed(5)}`);
}

function removeMarkerByIdx(idx) {
  const i = plotMarkers.findIndex(m => m.idx === idx);
  if (i === -1) return;
  plotMarkers[i].marker.remove();
  plotMarkers.splice(i, 1);
  updateMarkerCount();
  showToast('🗑️ Marker removed');
}

function clearAllMarkers() { plotMarkers.forEach(m => m.marker.remove()); plotMarkers = []; updateMarkerCount(); showToast('🗑️ All markers removed'); }
function updateMarkerCount() { const n = plotMarkers.length; document.getElementById('stat-markers').textContent = n; document.getElementById('marker-count-label').textContent = n + ' marker' + (n !== 1 ? 's' : ''); }

// ============================================================
// LAYER TOGGLE
// ============================================================
function toggleLayer(dsId, cls, el) {
  const ds = datasets[dsId]; if (!ds) return;
  const info = ds.layerVisibility[cls]; if (!info) return;
  info.visible = !info.visible;
  el.className = 'layer-toggle ' + (info.visible ? 'on' : 'off');
  const vis = info.visible ? 'visible' : 'none';
  try { map.setLayoutProperty(info.fillId,    'visibility', vis); } catch(e) {}
  try { map.setLayoutProperty(info.outlineId, 'visibility', vis); } catch(e) {}
}

function filterToClass(cls) {
  if (!activeDatasetId) return;
  const ds = datasets[activeDatasetId];
  for (const [c, info] of Object.entries(ds.layerVisibility)) {
    const makeVisible = (c === cls);
    info.visible = makeVisible;
    const vis = makeVisible ? 'visible' : 'none';
    try { map.setLayoutProperty(info.fillId,    'visibility', vis); } catch(e) {}
    try { map.setLayoutProperty(info.outlineId, 'visibility', vis); } catch(e) {}
    const badgeId = 'ltog-' + activeDatasetId + '-' + c.replace(/[^a-z0-9]/gi, '_');
    const tog = document.getElementById(badgeId);
    if (tog) tog.className = 'layer-toggle ' + (makeVisible ? 'on' : 'off');
  }
  showToast('🔍 Filtering: ' + cls);
}

// ============================================================
// POIS LAYER
// ============================================================
const POI_EMOJIS = {
  school:'🏫', hospital:'🏥', clinic:'🏥', park:'🌳', playground:'🛝',
  mall:'🛍️', supermarket:'🛒', marketplace:'🏪', restaurant:'🍽️',
  fast_food:'🍔', cafe:'☕', food_court:'🍱', hotel:'🏨', hostel:'🏨',
  chalet:'🏡', university:'🎓', college:'🎓', kindergarten:'👶',
  police:'👮', fire_station:'🚒', library:'📚', community_centre:'🏛️',
  sports_centre:'⚽', swimming_pool:'🏊', golf_course:'⛳', stadium:'🏟️',
  pitch:'⚽', track:'🏃', attraction:'🎡', water_tower:'🗼',
  water_works:'💧', wastewater_plant:'🏭', graveyard:'⚰️',
  shelter:'⛺', toilet:'🚻', fountain:'⛲', post_office:'📮',
  car_dealership:'🚗', furniture_shop:'🪑', clothes:'👗',
  department_store:'🏬', convenience:'🏪', bank:'🏦',
  pharmacy:'💊', dentist:'🦷', veterinary:'🐾', cinema:'🎬',
  theatre:'🎭', museum:'🏛️', art:'🎨', mosque:'🕌', church:'⛪',
  temple:'⛩️', airport:'✈️', helipad:'🚁', bus_station:'🚌',
  ferry_terminal:'⛴️', railway_station:'🚆', taxi:'🚕',
  charging_station:'⚡', parking:'🅿️', bicycle:'🚲',
};
const POI_COLORS = {
  education: {classes:['school','university','college','kindergarten','library'], color:'#4CAF50', label:'Pendidikan'},
  health: {classes:['hospital','clinic','pharmacy','dentist','veterinary'], color:'#F44336', label:'Kesihatan'},
  recreation: {classes:['park','playground','sports_centre','swimming_pool','golf_course','stadium','pitch','track','attraction'], color:'#2196F3', label:'Rekreasi'},
  food: {classes:['restaurant','fast_food','cafe','food_court','supermarket','marketplace','convenience','mall','department_store'], color:'#FF9800', label:'Makanan & Membeli-belah'},
  accommodation: {classes:['hotel','hostel','chalet'], color:'#9C27B0', label:'Penginapan'},
  services: {classes:['police','fire_station','community_centre','post_office','toilet','shelter','water_tower','water_works','wastewater_plant','graveyard','fountain'], color:'#607D8B', label:'Perkhidmatan'},
  other: {classes:[], color:'#9E9E9E', label:'Lain-lain'},
};

function getPOIColor(fclass) {
  for (const [,cat] of Object.entries(POI_COLORS)) {
    if (cat.classes.includes(fclass)) return cat.color;
  }
  return '#9E9E9E';
}

function togglePoisLayer(el) {
  const isOn = el.classList.contains('on');
  if (!isOn) {
    el.className = 'layer-toggle on';
    document.getElementById('pois-detail-panel').style.display = 'block';
    poisLayerVisible = true;
    renderPoisFilterGrid();
    renderPoisLayer(null);
    const total = Object.values(POIS_DATA).reduce((s,a)=>s+a.length,0);
    showToast('🏛️ POI dipaparkan — ' + total.toLocaleString() + ' lokasi');
    addActivityLog('POI layer aktif', total.toLocaleString() + ' lokasi (128 kelas)');
  } else {
    el.className = 'layer-toggle off';
    document.getElementById('pois-detail-panel').style.display = 'none';
    poisLayerVisible = false;
    clearPoisMarkers();
    poisLayerFilter = {};
    showToast('🔲 POI disembunyikan');
  }
}

function renderPoisFilterGrid() {
  const grid = document.getElementById('pois-filter-grid');
  grid.innerHTML = '';
  const catBtn = (key, cat) => {
    const btn = document.createElement('button');
    btn.style.cssText = `height:22px;padding:0 8px;border:1px solid ${cat.color}40;border-radius:20px;font-family:'DM Sans',sans-serif;font-size:10px;color:${cat.color};background:${cat.color}10;cursor:pointer;transition:all 0.15s;white-space:nowrap;`;
    btn.textContent = cat.label;
    btn.dataset.key = key;
    btn.dataset.active = 'false';
    btn.addEventListener('click', () => {
      const isActive = btn.dataset.active === 'true';
      btn.dataset.active = isActive ? 'false' : 'true';
      btn.style.background = isActive ? cat.color + '10' : cat.color;
      btn.style.color = isActive ? cat.color : 'white';
      if (!isActive) poisLayerFilter[key] = true;
      else delete poisLayerFilter[key];
      renderPoisLayer(Object.keys(poisLayerFilter).length ? poisLayerFilter : null);
    });
    grid.appendChild(btn);
  };
  for (const [key, cat] of Object.entries(POI_COLORS)) {
    if (key !== 'other') catBtn(key, cat);
  }
  const allBtn = document.createElement('button');
  allBtn.style.cssText = `height:22px;padding:0 8px;border:1px solid rgba(66,66,66,0.2);border-radius:20px;font-family:'DM Sans',sans-serif;font-size:10px;color:var(--charcoal);background:rgba(66,66,66,0.05);cursor:pointer;`;
  allBtn.textContent = 'Semua';
  allBtn.addEventListener('click', () => {
    grid.querySelectorAll('button[data-key]').forEach(b => { b.dataset.active = 'false'; const c = POI_COLORS[b.dataset.key]; b.style.background = c.color + '10'; b.style.color = c.color; });
    poisLayerFilter = {};
    renderPoisLayer(null);
  });
  grid.insertBefore(allBtn, grid.firstChild);
}

function renderPoisLayer(filterCats) {
  clearPoisMarkers();
  if (!poisLayerVisible) return;
  const zoom = map.getZoom();
  const maxPerClass = zoom < 10 ? 20 : zoom < 12 ? 100 : zoom < 14 ? 500 : 9999;

  for (const [fclass, pts] of Object.entries(POIS_DATA)) {
    if (filterCats) {
      let matched = false;
      for (const [catKey, cat] of Object.entries(POI_COLORS)) {
        if (filterCats[catKey] && cat.classes.includes(fclass)) { matched = true; break; }
      }
      if (!matched) continue;
    }
    const emoji = POI_EMOJIS[fclass] || '📍';
    const color = getPOIColor(fclass);
    const shown = pts.slice(0, maxPerClass);
    shown.forEach(([lng, lat, name]) => {
      const el = document.createElement('div');
      el.style.cssText = 'font-size:13px;line-height:1;cursor:pointer;user-select:none;filter:drop-shadow(0 1px 3px rgba(0,0,0,0.35));transition:filter 0.15s;';
      el.textContent = emoji;
      el.title = (name || fclass) + ' · ' + fclass;
      el.addEventListener('mouseenter', () => { el.style.filter = 'drop-shadow(0 2px 8px rgba(0,0,0,0.6)) brightness(1.15)'; });
      el.addEventListener('mouseleave', () => { el.style.filter = 'drop-shadow(0 1px 3px rgba(0,0,0,0.35))'; });
      el.addEventListener('click', e => {
        e.stopPropagation();
        new maplibregl.Popup({ offset: 8 })
          .setLngLat([lng, lat])
          .setHTML('<div class="popup-header" style="background:' + color + ';"><div class="popup-fc" style="color:rgba(255,255,255,0.65);">POI · ' + fclass + '</div><div class="popup-name">' + emoji + ' ' + (name || fclass) + '</div></div><div class="popup-body"><div class="popup-row"><span class="popup-k">Jenis</span><span class="popup-v">' + fclass + '</span></div><div class="popup-row"><span class="popup-k">Lat</span><span class="popup-v" style="font-family:monospace;font-size:10px;">' + lat.toFixed(6) + '</span></div><div class="popup-row"><span class="popup-k">Lng</span><span class="popup-v" style="font-family:monospace;font-size:10px;">' + lng.toFixed(6) + '</span></div><div class="popup-row"><span class="popup-k">Sumber</span><span class="popup-v">OSM</span></div></div>')
          .addTo(map);
      });
      const marker = new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat([lng, lat]).addTo(map);
      poisMarkers.push(marker);
    });
  }
  const shown = poisMarkers.length;
  document.getElementById('pois-count-badge').textContent = shown.toLocaleString() + ' pts';
}

function clearPoisMarkers() {
  poisMarkers.forEach(m => m.remove());
  poisMarkers = [];
}

// ============================================================
// TRANSPORT LAYER
// ============================================================
const TRANSPORT_EMOJIS = {
  airport: '✈️', airfield: '🛩️', apron: '🛫', helipad: '🚁',
  bus_station: '🚌', bus_stop: '🚏', ferry_terminal: '⛴️',
  railway_station: '🚉', railway_halt: '🚂', taxi: '🚕',
};
const TRANSPORT_COLORS = {
  airport: '#FF5722', airfield: '#FF7043', apron: '#FFAB91',
  helipad: '#9C27B0', bus_station: '#1E88E5', bus_stop: '#42A5F5',
  ferry_terminal: '#00BCD4', railway_station: '#F44336', railway_halt: '#E57373',
  taxi: '#FDD835',
};
const TRANSPORT_LABELS = {
  airport: 'Lapangan Terbang', airfield: 'Lapangan Udara', apron: 'Apron',
  helipad: 'Helipad', bus_station: 'Stesen Bas', bus_stop: 'Hentian Bas',
  ferry_terminal: 'Terminal Feri', railway_station: 'Stesen KTM/LRT',
  railway_halt: 'Perhentian KTM', taxi: 'Teksi',
};

function toggleTransportLayer(el) {
  const isOn = el.classList.contains('on');
  if (!isOn) {
    el.className = 'layer-toggle on';
    document.getElementById('transport-detail-panel').style.display = 'block';
    transportLayerVisible = true;
    renderTransportTypeList();
    renderTransportLayer(null);
    const total = Object.values(TRANSPORT_DATA).reduce((s,a)=>s+a.length,0);
    showToast('🚌 Pengangkutan dipaparkan — ' + total.toLocaleString() + ' lokasi');
    addActivityLog('Transport layer aktif', total.toLocaleString() + ' lokasi (10 kelas)');
  } else {
    el.className = 'layer-toggle off';
    document.getElementById('transport-detail-panel').style.display = 'none';
    transportLayerVisible = false;
    clearTransportMarkers();
    showToast('🔲 Pengangkutan disembunyikan');
  }
}

function renderTransportTypeList() {
  const list = document.getElementById('transport-type-list');
  list.innerHTML = '';
  for (const [fclass, pts] of Object.entries(TRANSPORT_DATA)) {
    const emoji = TRANSPORT_EMOJIS[fclass] || '📍';
    const color = TRANSPORT_COLORS[fclass] || '#607D8B';
    const label = TRANSPORT_LABELS[fclass] || fclass;
    const btn = document.createElement('button');
    btn.style.cssText = `height:24px;padding:0 9px;border:1px solid ${color}40;border-radius:20px;font-family:'DM Sans',sans-serif;font-size:10px;color:${color};background:${color}10;cursor:pointer;transition:all 0.15s;white-space:nowrap;display:flex;align-items:center;gap:4px;`;
    btn.innerHTML = `<span>${emoji}</span><span>${label}</span><span style="opacity:0.55;margin-left:2px;">(${pts.length})</span>`;
    btn.dataset.fclass = fclass;
    btn.dataset.active = 'true';
    btn.addEventListener('click', () => {
      const isActive = btn.dataset.active === 'true';
      btn.dataset.active = isActive ? 'false' : 'true';
      btn.style.background = isActive ? color + '10' : color;
      btn.style.color = isActive ? color : 'white';
      renderTransportLayer(getActiveTransportFilters());
    });
    list.appendChild(btn);
  }
}

function getActiveTransportFilters() {
  const btns = document.querySelectorAll('#transport-type-list button[data-fclass]');
  const active = [];
  btns.forEach(b => { if (b.dataset.active === 'true') active.push(b.dataset.fclass); });
  return active.length === Object.keys(TRANSPORT_DATA).length ? null : active;
}

function renderTransportLayer(filterClasses) {
  clearTransportMarkers();
  if (!transportLayerVisible) return;
  for (const [fclass, pts] of Object.entries(TRANSPORT_DATA)) {
    if (filterClasses && !filterClasses.includes(fclass)) continue;
    const emoji = TRANSPORT_EMOJIS[fclass] || '📍';
    const color = TRANSPORT_COLORS[fclass] || '#607D8B';
    const label = TRANSPORT_LABELS[fclass] || fclass;
    pts.forEach(([lng, lat, name]) => {
      const el = document.createElement('div');
      const size = ['airport','airfield','railway_station','ferry_terminal','bus_station'].includes(fclass) ? 18 : 14;
      el.style.cssText = 'font-size:' + size + 'px;line-height:1;cursor:pointer;user-select:none;filter:drop-shadow(0 1px 4px rgba(0,0,0,0.4));transition:filter 0.15s;';
      el.textContent = emoji;
      el.title = (name || label) + ' · ' + label;
      el.addEventListener('mouseenter', () => { el.style.filter = 'drop-shadow(0 2px 10px rgba(0,0,0,0.6)) brightness(1.15)'; });
      el.addEventListener('mouseleave', () => { el.style.filter = 'drop-shadow(0 1px 4px rgba(0,0,0,0.4))'; });
      el.addEventListener('click', e => {
        e.stopPropagation();
        new maplibregl.Popup({ offset: 8 })
          .setLngLat([lng, lat])
          .setHTML('<div class="popup-header" style="background:' + color + ';"><div class="popup-fc" style="color:rgba(255,255,255,0.65);">Pengangkutan</div><div class="popup-name">' + emoji + ' ' + (name || label) + '</div></div><div class="popup-body"><div class="popup-row"><span class="popup-k">Jenis</span><span class="popup-v">' + label + '</span></div><div class="popup-row"><span class="popup-k">Kelas</span><span class="popup-v">' + fclass + '</span></div><div class="popup-row"><span class="popup-k">Lat</span><span class="popup-v" style="font-family:monospace;font-size:10px;">' + lat.toFixed(6) + '</span></div><div class="popup-row"><span class="popup-k">Lng</span><span class="popup-v" style="font-family:monospace;font-size:10px;">' + lng.toFixed(6) + '</span></div><div class="popup-row"><span class="popup-k">Sumber</span><span class="popup-v">OSM</span></div></div>')
          .addTo(map);
      });
      const marker = new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat([lng, lat]).addTo(map);
      transportMarkers.push(marker);
    });
  }
}

function clearTransportMarkers() {
  transportMarkers.forEach(m => m.remove());
  transportMarkers = [];
}

// ============================================================
// MAP MODE
// ============================================================
function setMapMode(mode, el) {
  mapMode = mode;
  const mapEl    = document.getElementById('map');
  const cursor   = document.getElementById('custom-cursor');
  const indicator = document.getElementById('mode-indicator');
  const toolbar  = document.getElementById('plot-toolbar');

  document.querySelectorAll('.map-ctrl-btn').forEach(b => {
    if (b.id?.startsWith('mode-')) b.classList.remove('active','select-active','plot-active');
  });
  indicator.classList.remove('show','plot-mode');
  toolbar.classList.remove('show');
  mapEl.classList.remove('cursor-select-mode','cursor-plot-mode');
  cursor.classList.remove('visible');

  if (mode === 'select') {
    el.classList.add('select-active');
    mapEl.classList.add('cursor-select-mode');
    cursor.classList.add('visible');
    indicator.classList.add('show');
    document.getElementById('mode-indicator-text').textContent = 'Lot Select Mode — Click a lot for information';
  } else if (mode === 'plot') {
    el.classList.add('plot-active');
    mapEl.classList.add('cursor-plot-mode');
    indicator.classList.add('show','plot-mode');
    document.getElementById('mode-indicator-text').textContent = 'Plot Marker Mode — Click on the map to place a marker';
    toolbar.classList.add('show');
  } else {
    el.classList.add('active');
    map.getCanvas().style.cursor = 'grab';
  }
}

// ============================================================
// BASEMAP  ── UPDATED switchBasemap for PMTiles ──
// ============================================================
function toggleBasemapDropdown() {
  const dd = document.getElementById('basemap-dropdown');
  dd.classList.toggle('open');
}

function switchBasemap(key, label, el) {
  document.querySelectorAll('.basemap-option').forEach(o => o.classList.remove('active'));
  if (el) el.classList.add('active');
  document.getElementById('basemap-label').textContent = label;
  currentBasemap = key;

  const uzmaControls = document.getElementById('uzmasat-controls');

  if (key === 'uzma-sat') {
    uzmaControls.style.display = 'block';
    if (!uzmaSatActive) {
      uzmaSatActive = true;
      document.getElementById('tog-uzmasat').className = 'layer-toggle on';
      document.getElementById('uzmasat-layer-info').style.display = 'block';
      document.getElementById('badge-uzmasat').textContent = 'Active';
      document.getElementById('badge-uzmasat').classList.add('demo');
      map.fitBounds(UZMASAT_COORDS.bounds, { padding: 40, duration: 1200 });
      addActivityLog('UZMA-sat activated', 'seremban.pmtiles · PMTiles · zoom 0–16');
      showToast('🛰️ UZMA-sat loaded · seremban.pmtiles · zoom 0–16');
    }
    // ── Load PMTiles layer if not already loaded ──
    if (!map.getSource('uzmasat-source')) loadUzmaSatLayer();
    return;
  }

  // Switching to non-UZMA basemap — close dropdown
  document.getElementById('basemap-dropdown').classList.remove('open');
  uzmaControls.style.display = 'none';

  if (uzmaSatActive && key !== 'uzma-sat') {
    removeUzmaSatLayer();
    uzmaSatActive = false;
    document.getElementById('tog-uzmasat').className = 'layer-toggle off';
    document.getElementById('uzmasat-layer-info').style.display = 'none';
    document.getElementById('badge-uzmasat').textContent = 'Available';
    document.getElementById('badge-uzmasat').classList.remove('demo');
    if (!geoJsonOverlayVisible) {
      geoJsonOverlayVisible = true;
      document.getElementById('tog-overlay-on').className = 'layer-toggle on';
      for (const [,ds] of Object.entries(datasets)) {
        for (const [,info] of Object.entries(ds.layerVisibility)) {
          if (info.visible) {
            try { map.setLayoutProperty(info.fillId, 'visibility', 'visible'); } catch(e) {}
            try { map.setLayoutProperty(info.outlineId, 'visibility', 'visible'); } catch(e) {}
          }
        }
      }
    }
  }

  const bm = BASEMAPS[key];
  if (bm && !bm.pmtiles) {
    try {
      map.getSource('basemap')?.setTiles(bm.tiles);
    } catch(e) {
      const center = map.getCenter();
      const zoom   = map.getZoom();
      map.setStyle(buildMapStyle(key));
      map.once('style.load', () => {
        map.setCenter(center);
        map.setZoom(zoom);
        for (const dsId of Object.keys(datasets)) {
          addLayersForDataset(dsId);
        }
      });
    }
  }
}

// ============================================================
// UPLOAD
// ============================================================
function openUploadModal()  { document.getElementById('upload-overlay').classList.add('show'); updateDatasetModalList(); }
function closeUploadModal() { document.getElementById('upload-overlay').classList.remove('show'); resetUploadUI(); }
function resetUploadUI()    { document.getElementById('upload-progress').style.display = 'none'; document.getElementById('progress-fill').style.width = '0%'; document.getElementById('file-input').value = ''; }
function handleDragOver(e)  { e.preventDefault(); document.getElementById('drop-zone').classList.add('drag-over'); }
function handleDragLeave(e) { document.getElementById('drop-zone').classList.remove('drag-over'); }
function handleDrop(e)      { e.preventDefault(); document.getElementById('drop-zone').classList.remove('drag-over'); const f = e.dataTransfer.files[0]; if (f) processGeoJSONFile(f); }
function handleFileSelect(e){ const f = e.target.files[0]; if (f) processGeoJSONFile(f); }

function processGeoJSONFile(file) {
  if (!file.name.match(/\.(geojsonn?|json)$/i)) { showToast('❌ File must be .geojson or .json format'); return; }
  document.getElementById('upload-progress').style.display = 'block';
  setProgress(10, 'Reading file...');
  const reader = new FileReader();
  reader.onprogress = e => { if (e.lengthComputable) setProgress(10 + (e.loaded/e.total)*40, 'Reading file...'); };
  reader.onload = e => {
    setProgress(55, 'Processing GeoJSON...');
    setTimeout(() => {
      try {
        const geojson = JSON.parse(e.target.result);
        setProgress(80, 'Loading to map...');
        setTimeout(() => {
          closeUploadModal();
          showLoading('Loading ' + file.name, 'Rendering ' + (geojson.features?.length||0).toLocaleString() + ' features...');
          setTimeout(() => { addDataset(file.name, geojson, file.size); hideLoading(); }, 300);
        }, 200);
      } catch(err) { setProgress(0,''); showToast('❌ Invalid GeoJSON file: ' + err.message); }
    }, 100);
  };
  reader.onerror = () => showToast('❌ Failed to read file');
  reader.readAsText(file);
}
function setProgress(pct, text) { document.getElementById('progress-fill').style.width = pct + '%'; document.getElementById('progress-text').textContent = text; }

// ============================================================
// EXPORT
// ============================================================
function selectExportType(type, el) {
  currentExportType = type;
  document.querySelectorAll('.export-opt').forEach(o => o.classList.remove('selected'));
  el.classList.add('selected');
  const showTitle   = type === 'pdf';
  const showMap     = type === 'pdf';
  const showMarkers = type === 'pdf' || type === 'png';
  const showStats   = type === 'pdf';
  document.getElementById('exp-setting-title').style.display   = showTitle   ? 'flex' : 'none';
  document.getElementById('exp-setting-map').style.display     = showMap     ? 'flex' : 'none';
  document.getElementById('exp-setting-markers').style.display = showMarkers ? 'flex' : 'none';
  document.getElementById('exp-setting-stats').style.display   = showStats   ? 'flex' : 'none';
}
function openExportModal() { document.getElementById('export-overlay').classList.add('show'); document.getElementById('export-progress').style.display = 'none'; }
function closeExportModal() { document.getElementById('export-overlay').classList.remove('show'); }

async function captureMapWithMarkers() {
  const mapWrapper = document.getElementById('mapWrapper');
  const canvas = await html2canvas(mapWrapper, {
    useCORS: true, allowTaint: true, scale: 1.5, logging: false,
    ignoreElements: (el) => el.classList?.contains('map-controls') || el.classList?.contains('mode-indicator') || el.classList?.contains('no-data-state') || el.classList?.contains('plot-toolbar') || el.id === 'selection-pulse'
  });
  return canvas;
}

async function runExport() {
  const type         = currentExportType;
  const title        = document.getElementById('exp-title-input').value || 'Geospatial Report';
  const includeMap   = document.getElementById('exp-include-map').checked;
  const includeMarkers = document.getElementById('exp-include-markers').checked;
  const includeStats = document.getElementById('exp-include-stats').checked;
  document.getElementById('export-progress').style.display = 'block';
  document.getElementById('export-progress-text').textContent = 'Preparing export...';
  try {
    if (type === 'geojson') {
      if (!activeDatasetId) { showToast('⚠️ No active dataset'); return; }
      const ds = datasets[activeDatasetId];
      const blob = new Blob([JSON.stringify(ds.geojson, null, 2)], { type:'application/json' });
      triggerDownload(blob, ds.name.replace(/\.(geojsonn?|json)$/i,'') + '-export.geojson');
      closeExportModal(); showToast('✅ GeoJSON exported');
    } else if (type === 'csv') {
      if (!activeDatasetId) { showToast('⚠️ No active dataset'); return; }
      const ds = datasets[activeDatasetId];
      const headers = new Set();
      ds.features.forEach(f => Object.keys(f.properties||{}).forEach(k => headers.add(k)));
      const cols = [...headers];
      let csv = cols.map(c => '"' + c + '"').join(',') + '\n';
      ds.features.forEach(f => { const p = f.properties || {}; csv += cols.map(c => { const v = p[c] ?? ''; return '"' + String(v).replace(/"/g,'""') + '"'; }).join(',') + '\n'; });
      triggerDownload(new Blob([csv], { type:'text/csv' }), 'lot-data-' + new Date().toISOString().slice(0,10) + '.csv');
      closeExportModal(); showToast('✅ CSV exported');
    } else if (type === 'png') {
      document.getElementById('export-progress-text').textContent = 'Capturing map + markers...';
      const canvas = await captureMapWithMarkers();
      canvas.toBlob(blob => { if (blob) { triggerDownload(blob, 'map-' + new Date().toISOString().slice(0,10) + '.png'); closeExportModal(); showToast('✅ Map image exported'); } }, 'image/png');
    } else if (type === 'pdf') {
      await exportPDF(title, includeMap, includeMarkers, includeStats);
    }
  } catch(err) {
    console.error('Export error:', err);
    showToast('❌ Export failed: ' + err.message);
  } finally {
    document.getElementById('export-progress').style.display = 'none';
  }
}

async function exportPDF(title, includeMap, includeMarkers, includeStats) {
  document.getElementById('export-progress-text').textContent = 'Capturing map + markers...';
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ orientation:'portrait', unit:'mm', format:'a4' });
  const W=210, H=297, margin=15;
  let y = margin;

  pdf.setFillColor(46,46,46); pdf.rect(0,0,W,28,'F');
  pdf.setTextColor(255,255,255); pdf.setFont('helvetica','bold'); pdf.setFontSize(14);
  pdf.text(title, margin, 12);
  pdf.setFont('helvetica','normal'); pdf.setFontSize(8); pdf.setTextColor(200,200,200);
  pdf.text('Platform: Geospatial AI (UZMA Berhad)    Date: ' + new Date().toLocaleDateString('en-MY') + '    System: GDM2000', margin, 19);
  pdf.setTextColor(222,145,81); pdf.setFont('helvetica','bold'); pdf.setFontSize(7);
  pdf.text('GEOSPATIAL AI', W-margin-30, 12);
  pdf.setFont('helvetica','normal'); pdf.setTextColor(180,130,80); pdf.setFontSize(6);
  pdf.text('UZMA BERHAD', W-margin-22, 17);
  y = 34;

  if (uzmaSatActive) {
    pdf.setFillColor(254,248,243); pdf.setDrawColor(222,145,81); pdf.setLineWidth(0.3);
    pdf.rect(margin, y, W-margin*2, 7, 'FD');
    pdf.setFont('helvetica','bold'); pdf.setFontSize(7); pdf.setTextColor(192,114,64);
    pdf.text('🛰 UZMA-sat ACTIVE: seremban.pmtiles · PMTiles · WGS84 · Seremban Area, Negeri Sembilan', margin+3, y+4.5);
    y += 10;
  }

  if (includeMap) {
    document.getElementById('export-progress-text').textContent = 'Capturing map screenshot...';
    try {
      const canvas = await captureMapWithMarkers();
      const imgData = canvas.toDataURL('image/jpeg', 0.88);
      const mapW = W - margin*2;
      const mapH = Math.min(Math.round(mapW * canvas.height / canvas.width), 90);
      pdf.setDrawColor(220,220,220); pdf.setLineWidth(0.3);
      pdf.rect(margin, y, mapW, mapH);
      pdf.addImage(imgData, 'JPEG', margin, y, mapW, mapH);
      y += mapH + 4;
      pdf.setFontSize(7); pdf.setTextColor(150,150,150); pdf.setFont('helvetica','normal');
      pdf.text('Figure 1: Current map screenshot' + (uzmaSatActive ? ' with UZMA-sat overlay (seremban.pmtiles)' : '') + ' · Basemap: ' + document.getElementById('basemap-label').textContent + ' · ' + plotMarkers.length + ' marker(s)', margin, y);
      y += 7;
    } catch(e) {
      console.warn('Map capture failed:', e);
      pdf.setFontSize(8); pdf.setTextColor(150,150,150);
      pdf.text('[Map could not be exported]', margin, y + 5); y += 12;
    }
  }

  if (includeMarkers && plotMarkers.length > 0) {
    if (y > H - 50) { pdf.addPage(); y = margin; }
    y += 2;
    pdf.setFont('helvetica','bold'); pdf.setFontSize(9); pdf.setTextColor(46,46,46);
    pdf.text('Plot Markers (' + plotMarkers.length + ')', margin, y); y += 5;
    const colW=[15,55,55,30,25], headers=['#','Latitude','Longitude','Shape','Colour'];
    pdf.setFillColor(46,46,46); pdf.rect(margin,y,W-margin*2,6,'F');
    pdf.setTextColor(255,255,255); pdf.setFontSize(7.5);
    let cx = margin + 2;
    headers.forEach((h,i) => { pdf.text(h, cx, y+4); cx += colW[i]; });
    y += 6;
    plotMarkers.slice(0,20).forEach((m,i) => {
      pdf.setFillColor(i%2===0?250:255, i%2===0?248:255, i%2===0?243:255);
      pdf.rect(margin,y,W-margin*2,5.5,'F');
      pdf.setTextColor(66,66,66); pdf.setFontSize(7);
      cx = margin + 2;
      [m.idx, m.lngLat.lat.toFixed(6), m.lngLat.lng.toFixed(6), m.shape, m.color].forEach((v,j) => { pdf.text(String(v), cx, y+3.8); cx += colW[j]; });
      y += 5.5;
    });
    if (plotMarkers.length > 20) { pdf.setFontSize(7); pdf.setTextColor(150,150,150); pdf.text('... and ' + (plotMarkers.length-20) + ' more', margin, y+3); y += 6; }
    y += 4;
  }

  if (includeStats && activeDatasetId) {
    const ds = datasets[activeDatasetId];
    if (y > H - 60) { pdf.addPage(); y = margin; }
    pdf.setFont('helvetica','bold'); pdf.setFontSize(9); pdf.setTextColor(46,46,46);
    pdf.text('Dataset Statistics: ' + ds.name, margin, y); y += 5;
    const boxes = [
      { label:'Total Lots', val: ds.features.length.toLocaleString() },
      { label:'Land Use Classes', val: Object.keys(ds.classCount).length },
      { label:'Plot Markers', val: plotMarkers.length },
    ];
    const bw = (W - margin*2 - 8) / 3;
    boxes.forEach((b, i) => {
      const bx = margin + i*(bw+4);
      pdf.setFillColor(254,248,243); pdf.setDrawColor(222,145,81); pdf.setLineWidth(0.5);
      pdf.roundedRect(bx, y, bw, 14, 2, 2, 'FD');
      pdf.setFont('helvetica','bold'); pdf.setFontSize(11); pdf.setTextColor(46,46,46);
      pdf.text(String(b.val), bx+bw/2, y+7, { align:'center' });
      pdf.setFont('helvetica','normal'); pdf.setFontSize(6.5); pdf.setTextColor(150,150,150);
      pdf.text(b.label, bx+bw/2, y+11.5, { align:'center' });
    });
    y += 18;
    pdf.setFont('helvetica','bold'); pdf.setFontSize(8); pdf.setTextColor(46,46,46);
    pdf.text('Land Use Class Distribution', margin, y); y += 4;
    const total = ds.features.length;
    Object.entries(ds.classCount).sort((a,b) => b[1]-a[1]).slice(0,12).forEach(([cls,count],i) => {
      if (y > H - 20) { pdf.addPage(); y = margin; }
      pdf.setFillColor(i%2===0?250:255, i%2===0?248:255, i%2===0?243:255);
      pdf.rect(margin, y, W-margin*2, 5.5, 'F');
      pdf.setFont('helvetica','normal'); pdf.setFontSize(7); pdf.setTextColor(66,66,66);
      pdf.text(cls, margin+2, y+3.8);
      pdf.text(count.toLocaleString(), margin+90, y+3.8);
      pdf.text(((count/total)*100).toFixed(1)+'%', margin+115, y+3.8);
      const barW = (count/total) * (W-margin*2-135);
      pdf.setFillColor(222,145,81); pdf.rect(margin+130, y+1.5, barW, 2.5, 'F');
      y += 5.5;
    });
    y += 5;
  }

  const totalPages = pdf.internal.getNumberOfPages();
  for (let pg=1; pg<=totalPages; pg++) {
    pdf.setPage(pg);
    pdf.setFillColor(46,46,46); pdf.rect(0, H-10, W, 10, 'F');
    pdf.setFont('helvetica','normal'); pdf.setFontSize(6.5); pdf.setTextColor(200,200,200);
    pdf.text('Geospatial AI — UZMA Berhad | Generated on ' + new Date().toLocaleString('en-MY'), margin, H-4);
    pdf.text('Page ' + pg + ' / ' + totalPages, W-margin, H-4, { align:'right' });
  }

  document.getElementById('export-progress-text').textContent = 'Downloading PDF...';
  pdf.save(title.replace(/\s+/g,'-').toLowerCase() + '-' + new Date().toISOString().slice(0,10) + '.pdf');
  closeExportModal();
  showToast('✅ PDF exported successfully!');
  addActivityLog('PDF exported', title);
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// ============================================================
// UTILITY
// ============================================================
function flyToData() {
  if (uzmaSatActive) { map.fitBounds(UZMASAT_COORDS.bounds, { padding:40, duration:800 }); return; }
  if (window._dataBounds) map.fitBounds(window._dataBounds, { padding:60, duration:800 });
}

function zoomToSelected() {
  if (!selectedFeature) return;
  const coords = flattenCoords(selectedFeature.geometry); if (!coords.length) return;
  const avgLng = coords.reduce((s,[lng]) => s+lng, 0) / coords.length;
  const avgLat = coords.reduce((s,[,lat]) => s+lat, 0) / coords.length;
  map.flyTo({ center:[avgLng, avgLat], zoom:17 });
}

function copyCoords() {
  const lat = document.getElementById('p-lat')?.textContent;
  const lng = document.getElementById('p-lng')?.textContent;
  if (lat && lng && lat !== '—') { navigator.clipboard.writeText(`${lat}, ${lng}`); showToast('📋 Coordinates copied'); }
}

function switchTab(el, tabId) {
  document.querySelectorAll('.ptab').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  document.querySelectorAll('[id^="tab-"]').forEach(t => t.style.display = 'none');
  document.getElementById('tab-' + tabId).style.display = 'block';
}

// ============================================================
// LOT LIST
// ============================================================
let llAllRows = [];
let llFilteredRows = [];
let llPage = 1;
const LL_PAGE_SIZE = 50;
let llSortCol = null;
let llSortDir = 1;
let llColumns = [];

function openLotListModal() {
  document.getElementById('lotlist-overlay').classList.add('show');
  buildLotList();
}
function closeLotListModal() {
  document.getElementById('lotlist-overlay').classList.remove('show');
}

function buildLotList() {
  if (!activeDatasetId || !datasets[activeDatasetId]) {
    document.getElementById('lotlist-no-data').style.display = 'block';
    document.getElementById('lotlist-table').style.display = 'none';
    document.getElementById('lotlist-pagination').style.display = 'none';
    document.getElementById('lotlist-sub').textContent = 'No dataset loaded';
    document.getElementById('lotlist-count-badge').textContent = '0 lots';
    return;
  }
  const ds = datasets[activeDatasetId];
  const features = ds.features;

  const keyCounts = {};
  features.forEach(f => { Object.keys(f.properties || {}).forEach(k => { keyCounts[k] = (keyCounts[k]||0)+1; }); });
  llColumns = Object.entries(keyCounts).sort((a,b) => b[1]-a[1]).slice(0,8).map(([k]) => k);

  llAllRows = features.map((f, i) => ({ _idx: i, _feature: f, ...f.properties }));
  llSortCol = null;

  const classSel = document.getElementById('lotlist-class-filter');
  classSel.innerHTML = '<option value="">All Classes</option>';
  Object.keys(ds.classCount).sort().forEach(cls => {
    classSel.innerHTML += `<option value="${cls}">${cls} (${ds.classCount[cls].toLocaleString()})</option>`;
  });

  document.getElementById('lotlist-no-data').style.display = 'none';
  document.getElementById('lotlist-table').style.display = 'table';
  document.getElementById('lotlist-sub').textContent = ds.name + ' · ' + features.length.toLocaleString() + ' lots';
  document.getElementById('lotlist-search-input').value = '';

  llFilteredRows = [...llAllRows];
  llPage = 1;
  renderLotListTable();
}

function renderLotListTable() {
  const ds = activeDatasetId ? datasets[activeDatasetId] : null;
  const thead = document.getElementById('lotlist-thead');
  thead.innerHTML = `<tr>
    <th style="width:40px;">#</th>
    ${llColumns.map(col => `<th onclick="lotListSort('${col}')" class="${llSortCol===col?'sorted':''}">
      ${col}<span class="sort-arrow">${llSortCol===col ? (llSortDir===1?'▲':'▼') : '⇅'}</span>
    </th>`).join('')}
    <th style="width:80px;">Action</th>
  </tr>`;

  const total = llFilteredRows.length;
  const totalPages = Math.max(1, Math.ceil(total / LL_PAGE_SIZE));
  llPage = Math.min(llPage, totalPages);
  const start = (llPage - 1) * LL_PAGE_SIZE;
  const end   = Math.min(start + LL_PAGE_SIZE, total);
  const pageRows = llFilteredRows.slice(start, end);

  const tbody = document.getElementById('lotlist-tbody');
  if (!pageRows.length) {
    tbody.innerHTML = `<tr><td colspan="${llColumns.length + 2}" style="text-align:center;padding:36px;color:rgba(66,66,66,0.38);font-size:12px;">No lots match your search</td></tr>`;
  } else {
    tbody.innerHTML = pageRows.map((row, i) => {
      const cls = ds && ds.classProp ? (row[ds.classProp] || '') : '';
      const color = cls ? getColor(cls) : 'rgba(66,66,66,0.15)';
      const cells = llColumns.map(col => {
        const val = row[col] ?? '—';
        if (col === ds?.classProp) return `<td><span class="lot-class-badge" style="background:${color}22;color:${color};">${val}</span></td>`;
        return `<td title="${val}">${val}</td>`;
      }).join('');
      return `<tr>
        <td style="color:rgba(66,66,66,0.35);font-size:10px;">${start + i + 1}</td>
        ${cells}
        <td><button class="lot-action-btn" onclick="lotListZoomTo(${row._idx})">🔍 Zoom</button></td>
      </tr>`;
    }).join('');
  }

  document.getElementById('lotlist-pagination').style.display = total > 0 ? 'flex' : 'none';
  document.getElementById('ll-page-info').textContent = total > 0 ? `Showing ${start+1}–${end} of ${total.toLocaleString()}` : 'No results';
  document.getElementById('lotlist-count-badge').textContent = total.toLocaleString() + ' lot' + (total !== 1 ? 's' : '');

  const paginEl = document.getElementById('ll-page-btns');
  let pageBtns = '';
  pageBtns += `<button class="ll-page-btn" onclick="llGoPage(${llPage-1})" ${llPage===1?'disabled':''}>‹</button>`;
  const range = buildPageRange(llPage, Math.max(1, Math.ceil(total / LL_PAGE_SIZE)), 5);
  range.forEach(p => {
    if (p === '…') pageBtns += `<button class="ll-page-btn" disabled style="border:none;background:none;">…</button>`;
    else pageBtns += `<button class="ll-page-btn ${p===llPage?'active':''}" onclick="llGoPage(${p})">${p}</button>`;
  });
  pageBtns += `<button class="ll-page-btn" onclick="llGoPage(${llPage+1})" ${llPage===Math.max(1,Math.ceil(total/LL_PAGE_SIZE))?'disabled':''}>›</button>`;
  paginEl.innerHTML = pageBtns;
}

function buildPageRange(current, total, delta) {
  const range = [];
  for (let i = Math.max(1, current - delta); i <= Math.min(total, current + delta); i++) range.push(i);
  if (range[0] > 1) { if (range[0] > 2) range.unshift('…'); range.unshift(1); }
  if (range[range.length-1] < total) { if (range[range.length-1] < total-1) range.push('…'); range.push(total); }
  return range;
}

function llGoPage(p) {
  const total = llFilteredRows.length;
  const totalPages = Math.max(1, Math.ceil(total / LL_PAGE_SIZE));
  llPage = Math.max(1, Math.min(p, totalPages));
  renderLotListTable();
  document.querySelector('.lotlist-table-wrap').scrollTop = 0;
}

function lotListSearch(val) {
  const q = val.toLowerCase().trim();
  const classFilter = document.getElementById('lotlist-class-filter').value;
  const ds = activeDatasetId ? datasets[activeDatasetId] : null;
  llFilteredRows = llAllRows.filter(row => {
    const classMatch = !classFilter || (ds && row[ds.classProp] === classFilter);
    const textMatch  = !q || llColumns.some(col => String(row[col]||'').toLowerCase().includes(q));
    return classMatch && textMatch;
  });
  llPage = 1;
  renderLotListTable();
}

function lotListFilterClass(cls) {
  const q = document.getElementById('lotlist-search-input').value.toLowerCase().trim();
  const ds = activeDatasetId ? datasets[activeDatasetId] : null;
  llFilteredRows = llAllRows.filter(row => {
    const classMatch = !cls || (ds && row[ds.classProp] === cls);
    const textMatch  = !q || llColumns.some(col => String(row[col]||'').toLowerCase().includes(q));
    return classMatch && textMatch;
  });
  llPage = 1;
  renderLotListTable();
}

function lotListSort(col) {
  if (llSortCol === col) llSortDir *= -1;
  else { llSortCol = col; llSortDir = 1; }
  llFilteredRows.sort((a, b) => {
    const av = a[col] ?? '', bv = b[col] ?? '';
    if (!isNaN(av) && !isNaN(bv)) return (parseFloat(av) - parseFloat(bv)) * llSortDir;
    return String(av).localeCompare(String(bv)) * llSortDir;
  });
  llPage = 1;
  renderLotListTable();
}

function lotListZoomTo(featureIdx) {
  if (!activeDatasetId) return;
  const ds = datasets[activeDatasetId];
  const feature = ds.features[featureIdx];
  if (!feature) return;
  const coords = flattenCoords(feature.geometry);
  if (!coords.length) return;
  const avgLng = coords.reduce((s,[lng]) => s+lng, 0) / coords.length;
  const avgLat = coords.reduce((s,[,lat]) => s+lat, 0) / coords.length;
  map.flyTo({ center:[avgLng, avgLat], zoom:17 });
  closeLotListModal();
  showToast('🔍 Zoomed to lot');
}

function exportLotListCSV() {
  if (!activeDatasetId) { showToast('⚠️ No dataset loaded'); return; }
  const ds = datasets[activeDatasetId];
  const rows = llFilteredRows.length > 0 ? llFilteredRows : llAllRows;
  const header = llColumns.join(',');
  const body = rows.map(row => llColumns.map(col => {
    const val = row[col] ?? '';
    return typeof val === 'string' && (val.includes(',') || val.includes('"')) ? `"${val.replace(/"/g,'""')}"` : val;
  }).join(',')).join('\n');
  const blob = new Blob([header + '\n' + body], { type:'text/csv' });
  triggerDownload(blob, ds.name.replace(/\.[^.]+$/,'') + '-lotlist.csv');
  showToast('✅ CSV exported · ' + rows.length.toLocaleString() + ' rows');
  addActivityLog('Lot list exported (CSV)', rows.length.toLocaleString() + ' rows · ' + ds.name);
}

// ============================================================
// HISTORY ANALYSIS
// ============================================================
const historyLog = [
  { title: 'Dashboard initialised', detail: 'Ready to receive GeoJSON data', time: new Date().toLocaleTimeString('en-MY'), category: 'system', icon: '🚀' }
];
let historyFilter = 'all';

function addActivityLog(title, sub) {
  const now  = new Date().toLocaleTimeString('en-MY');
  const list = document.getElementById('activity-list');
  const item = document.createElement('div');
  item.className = 'activity-item';
  item.innerHTML = `<div class="act-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/></svg></div><div class="act-info"><div class="act-title">${title}</div><div class="act-time">${now} · ${sub}</div></div>`;
  list.insertBefore(item, list.firstChild);

  let category = 'system', icon = '⚙️';
  const t = title.toLowerCase();
  if (t.includes('dataset') || t.includes('loaded') || t.includes('upload')) { category = 'dataset'; icon = '📂'; }
  else if (t.includes('marker') || t.includes('plotted') || t.includes('removed')) { category = 'marker'; icon = '📍'; }
  else if (t.includes('export') || t.includes('pdf') || t.includes('png') || t.includes('geojson export')) { category = 'export'; icon = '📄'; }
  else if (t.includes('basemap') || t.includes('uzma-sat') || t.includes('zoom') || t.includes('filter')) { category = 'map'; icon = '🗺️'; }

  historyLog.unshift({ title, detail: sub, time: now, category, icon });
  renderHistoryTimeline();
}

function openHistoryModal() {
  renderHistoryTimeline();
  document.getElementById('history-overlay').classList.add('show');
}

function closeHistoryModal() {
  document.getElementById('history-overlay').classList.remove('show');
}

function filterHistory(cat, el) {
  historyFilter = cat;
  document.querySelectorAll('.hfilt').forEach(b => b.classList.remove('active'));
  el.classList.add('active');
  renderHistoryTimeline();
}

function clearHistoryLog() {
  historyLog.length = 0;
  historyLog.push({ title: 'Log cleared', detail: 'History reset by user', time: new Date().toLocaleTimeString('en-MY'), category: 'system', icon: '🗑️' });
  document.getElementById('activity-list').innerHTML = '';
  renderHistoryTimeline();
}

function renderHistoryTimeline() {
  const timeline = document.getElementById('history-timeline');
  const filtered = historyFilter === 'all' ? historyLog : historyLog.filter(e => e.category === historyFilter);

  document.getElementById('history-footer-count').textContent = filtered.length + ' event' + (filtered.length !== 1 ? 's' : '');
  document.getElementById('history-count-sub').textContent = historyLog.length + ' total events · ' + (historyFilter === 'all' ? 'All categories' : historyFilter);

  if (!filtered.length) {
    timeline.innerHTML = '<div class="history-empty"><div style="font-size:28px;margin-bottom:8px;">📋</div><div style="font-size:12.5px;color:rgba(66,66,66,0.38);">No activity in this category</div></div>';
    return;
  }

  const tagClass = { dataset:'tag-dataset', marker:'tag-marker', export:'tag-export', map:'tag-map', system:'tag-system' };
  const iconBg   = { dataset:'rgba(76,175,80,0.12)', marker:'rgba(229,57,53,0.1)', export:'rgba(30,136,229,0.1)', map:'rgba(156,39,176,0.1)', system:'rgba(66,66,66,0.08)' };

  timeline.innerHTML = filtered.map((e, i) => `
    <div class="hist-item">
      <div class="hist-icon" style="background:${iconBg[e.category]||'rgba(66,66,66,0.08)'};">${e.icon}</div>
      <div class="hist-body">
        <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
          <span class="hist-title">${e.title}</span>
          <span class="hist-tag ${tagClass[e.category]||'tag-system'}">${e.category}</span>
        </div>
        <div class="hist-detail">${e.detail}</div>
        <div class="hist-time">${e.time}</div>
      </div>
    </div>`).join('');
}

function showToast(msg, dur=3000) {
  if (!msg) return;
  const t = document.getElementById('toast');
  t.textContent = msg; t.style.display = 'block';
  setTimeout(() => t.style.display = 'none', dur);
}
function showLoading(text, sub) {
  document.getElementById('loading-text').textContent = text;
  document.getElementById('loading-sub').textContent  = sub;
  document.getElementById('loading-overlay').classList.add('show');
}
function hideLoading() { document.getElementById('loading-overlay').classList.remove('show'); }
