const APP_VERSION = "2.4";

function storageGet(key, fallback = null) {
  try {
    const value = localStorage.getItem(key);
    return value === null ? fallback : value;
  } catch (error) {
    console.warn(`Storage read failed for ${key}`, error);
    return fallback;
  }
}

function storageSet(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch (error) {
    console.warn(`Storage write failed for ${key}`, error);
  }
}

function storageGetJSON(key, fallback) {
  const raw = storageGet(key, null);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw);
  } catch (error) {
    console.warn(`Storage JSON parse failed for ${key}`, error);
    return fallback;
  }
}

const SUPABASE_URL = 'https://wntakzfoprthwggkidyq.supabase.co';
const SUPABASE_KEY = 'sb_publishable_gWu_EQ1J3s0iNjeDeINJwQ_xKy8QgAJ';
const THUNDERFOREST_KEY = 'c0ceacbdeb224697bdedd71af8b20abd';

const OWNER_COLORS = {
  Tod: '#d85555',
  Curt: '#f2ae49',
  Steve: '#4e8fd6'
};

const FEATURE_META = {
  note: { label: 'Note pin', geometry: 'point', icon: 'note' },
  parking: { label: 'Parking', geometry: 'point', icon: 'parking' },
  camping: { label: 'Camping', geometry: 'point', icon: 'camping' },
  hazard: { label: 'Hazard', geometry: 'point', icon: 'hazard' },
  stretch: { label: 'Stretch line', geometry: 'line', icon: 'stretch' },
  access: { label: 'Area / access', geometry: 'polygon', icon: 'access' }
};

const DEFAULT_IDENTITY = 'Tod';
const IDENTITY_KEY = 'yellowdog.identity';
const BASEMAP_KEY = 'yellowdog.basemap';
const TERRAIN_KEY = 'yellowdog.terrain';
const OWNER_FILTERS_KEY = 'yellowdog.ownerfilters';

const identityModal = document.getElementById('identityModal');
const settingsModal = document.getElementById('settingsModal');
const featureModal = document.getElementById('featureModal');
const identitySelect = document.getElementById('identitySelect');
const tfKeyField = document.getElementById('tfKeyField');
const featureTitleInput = document.getElementById('featureTitle');
const featureNoteInput = document.getElementById('featureNote');
const featureModalTitle = document.getElementById('featureModalTitle');
const drawHelp = document.getElementById('drawHelp');
const finishShapeBtn = document.getElementById('finishShapeBtn');
const cancelShapeBtn = document.getElementById('cancelShapeBtn');

let currentIdentity = storageGet(IDENTITY_KEY, null);
let currentFeatureType = 'note';
let pendingFeature = null;
let draw = null;
let map = null;
let terrainEnabled = storageGet(TERRAIN_KEY, '0') === '1';
let currentBasemap = storageGet(BASEMAP_KEY, 'outdoors') || 'outdoors';
let ownerFilters = storageGetJSON(OWNER_FILTERS_KEY, { Tod: true, Curt: true, Steve: true });
let supabase = null;
let currentSubscription = null;

const defaultCenter = [-87.886, 46.761];
const defaultZoom = 12.9;
const defaultPitch = 38;
const defaultBearing = -14;
let appStarted = false;

const corridorOuter = {
  type: 'Feature',
  properties: { kind: 'outer-mask' },
  geometry: {
    type: 'Polygon',
    coordinates: [[
      [-88.35,46.95],[-87.35,46.95],[-87.35,46.40],[-88.35,46.40],[-88.35,46.95]
    ]]
  }
};

const corridorInner = {
  type: 'Feature',
  properties: { kind: 'inner-spotlight' },
  geometry: {
    type: 'Polygon',
    coordinates: [[
      [-88.028,46.822],[-87.997,46.838],[-87.963,46.842],[-87.930,46.834],[-87.900,46.824],[-87.877,46.817],[-87.855,46.804],[-87.831,46.796],[-87.807,46.789],[-87.780,46.783],[-87.754,46.776],[-87.728,46.770],[-87.702,46.761],[-87.688,46.744],[-87.706,46.726],[-87.735,46.730],[-87.764,46.735],[-87.789,46.740],[-87.816,46.744],[-87.842,46.751],[-87.867,46.760],[-87.892,46.769],[-87.918,46.779],[-87.944,46.787],[-87.971,46.792],[-87.998,46.796],[-88.024,46.802],[-88.037,46.812],[-88.028,46.822]
    ]]
  }
};

const corridorCore = {
  type: 'Feature',
  properties: { kind: 'river-core' },
  geometry: {
    type: 'LineString',
    coordinates: [
      [-88.016,46.818],[-87.992,46.822],[-87.969,46.823],[-87.943,46.820],[-87.919,46.814],[-87.893,46.805],[-87.868,46.795],[-87.843,46.785],[-87.817,46.776],[-87.791,46.767],[-87.766,46.758],[-87.741,46.751],[-87.716,46.746],[-87.694,46.739]
    ]
  }
};

const sourceState = {
  Tod: featureCollection([]),
  Curt: featureCollection([]),
  Steve: featureCollection([])
};

function startupFail(message, error) {
  console.error(error || message);
  alert(message + (error?.message ? `

${error.message}` : ''));
}

if (window.maplibregl && !window.mapboxgl) {
  window.mapboxgl = window.maplibregl;
}

if (window.MapboxDraw?.constants?.classes) {
  MapboxDraw.constants.classes.CANVAS = 'maplibregl-canvas';
  MapboxDraw.constants.classes.CONTROL_BASE = 'maplibregl-ctrl';
  MapboxDraw.constants.classes.CONTROL_PREFIX = 'maplibregl-ctrl-';
  MapboxDraw.constants.classes.CONTROL_GROUP = 'maplibregl-ctrl-group';
  MapboxDraw.constants.classes.ATTRIBUTION = 'maplibregl-ctrl-attrib';
}

function featureCollection(features) {
  return { type: 'FeatureCollection', features };
}

function setVisible(el, visible) {
  el.classList.toggle('visible', visible);
}

function ownerVisibility(owner) {
  return ownerFilters[owner] !== false ? 'visible' : 'none';
}

function getIdentity() {
  return currentIdentity || DEFAULT_IDENTITY;
}

function saveIdentity(identity) {
  currentIdentity = identity;
  storageSet(IDENTITY_KEY, identity);
  identitySelect.value = identity;
}

function updateFeatureButtonState() {
  document.querySelectorAll('.feature-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.featureType === currentFeatureType);
  });
  const meta = FEATURE_META[currentFeatureType];
  if (meta.geometry === 'point') {
    drawHelp.textContent = `Tap the map to add a ${meta.label.toLowerCase()} as ${getIdentity()}.`;
    finishShapeBtn.classList.add('hidden');
    cancelShapeBtn.classList.add('hidden');
    if (draw) draw.changeMode('simple_select');
  } else if (meta.geometry === 'line') {
    drawHelp.textContent = `Tap to start the stretch line. Keep tapping to add points. Finish when you're done.`;
    finishShapeBtn.classList.remove('hidden');
    cancelShapeBtn.classList.remove('hidden');
    if (draw) draw.changeMode('draw_line_string');
  } else {
    drawHelp.textContent = `Tap to start the area. Keep tapping corners, then finish the shape.`;
    finishShapeBtn.classList.remove('hidden');
    cancelShapeBtn.classList.remove('hidden');
    if (draw) draw.changeMode('draw_polygon');
  }
}

function styleForBasemap(name) {
  const rasterTiles = {
    outdoors: `https://tile.thunderforest.com/outdoors/{z}/{x}/{y}.png?apikey=${THUNDERFOREST_KEY}`,
    satellite: 'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    hybridLabels: 'https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}'
  };

  const style = {
    version: 8,
    glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
    sources: {
      basemap: {
        type: 'raster',
        tiles: [rasterTiles[name]],
        tileSize: 256,
        attribution: name === 'outdoors'
          ? 'Maps © Thunderforest, Data © OpenStreetMap contributors'
          : 'Tiles © Esri'
      },
      ...(name === 'satellite' ? {
        labels: {
          type: 'raster',
          tiles: [rasterTiles.hybridLabels],
          tileSize: 256,
          attribution: 'Labels © Esri'
        }
      } : {}),
      terrainSource: {
        type: 'raster-dem',
        tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
        tileSize: 256,
        encoding: 'terrarium',
        maxzoom: 15,
        attribution: 'Elevation © elevation-tiles-prod'
      },
      corridor: { type: 'geojson', data: featureCollection([corridorOuter, corridorInner, corridorCore]) },
      Tod: { type: 'geojson', data: sourceState.Tod },
      Curt: { type: 'geojson', data: sourceState.Curt },
      Steve: { type: 'geojson', data: sourceState.Steve }
    },
    layers: [
      { id: 'basemap', type: 'raster', source: 'basemap' },
      ...(name === 'satellite' ? [{ id: 'satellite-labels', type: 'raster', source: 'labels', paint: { 'raster-opacity': 0.85 } }] : []),
      {
        id: 'corridor-mask', type: 'fill', source: 'corridor',
        filter: ['==', ['get', 'kind'], 'outer-mask'],
        paint: { 'fill-color': '#041411', 'fill-opacity': 0.26 }
      },
      {
        id: 'corridor-window', type: 'fill', source: 'corridor',
        filter: ['==', ['get', 'kind'], 'inner-spotlight'],
        paint: { 'fill-color': '#dfe7d7', 'fill-opacity': 0.05 }
      },
      {
        id: 'corridor-glow', type: 'line', source: 'corridor',
        filter: ['==', ['get', 'kind'], 'river-core'],
        paint: { 'line-color': '#b8f3e1', 'line-width': 8, 'line-opacity': 0.18 }
      },
      {
        id: 'corridor-core', type: 'line', source: 'corridor',
        filter: ['==', ['get', 'kind'], 'river-core'],
        paint: { 'line-color': '#8ce3cc', 'line-width': 3, 'line-opacity': 0.95 }
      },
      ownerLayers('Tod', OWNER_COLORS.Tod),
      ownerLayers('Curt', OWNER_COLORS.Curt),
      ownerLayers('Steve', OWNER_COLORS.Steve)
    ].flat()
  };
  return style;
}

function ownerLayers(owner, color) {
  return [
    {
      id: `${owner}-polygon-fill`, type: 'fill', source: owner,
      filter: ['==', ['geometry-type'], 'Polygon'],
      layout: { visibility: ownerVisibility(owner) },
      paint: { 'fill-color': color, 'fill-opacity': 0.18 }
    },
    {
      id: `${owner}-polygon-line`, type: 'line', source: owner,
      filter: ['==', ['geometry-type'], 'Polygon'],
      layout: { visibility: ownerVisibility(owner) },
      paint: { 'line-color': color, 'line-width': 3 }
    },
    {
      id: `${owner}-line`, type: 'line', source: owner,
      filter: ['==', ['geometry-type'], 'LineString'],
      layout: { visibility: ownerVisibility(owner), 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': color, 'line-width': 5 }
    },
    {
      id: `${owner}-point-outline`, type: 'circle', source: owner,
      filter: ['==', ['geometry-type'], 'Point'],
      layout: { visibility: ownerVisibility(owner) },
      paint: { 'circle-color': '#ffffff', 'circle-radius': 10, 'circle-opacity': 0.95 }
    },
    {
      id: `${owner}-point`, type: 'circle', source: owner,
      filter: ['==', ['geometry-type'], 'Point'],
      layout: { visibility: ownerVisibility(owner) },
      paint: {
        'circle-color': ['coalesce', ['get', 'color'], color],
        'circle-radius': [
          'match',
          ['get', 'feature_type'],
          'parking', 7,
          'camping', 7,
          'hazard', 7,
          6
        ]
      }
    }
  ];
}

function setTerrainState() {
  if (!map || !map.getSource('terrainSource')) return;
  if (terrainEnabled) {
    map.setTerrain({ source: 'terrainSource', exaggeration: 1.5 });
  } else {
    map.setTerrain(null);
  }
}

function updateOwnerVisibility() {
  ['Tod', 'Curt', 'Steve'].forEach(owner => {
    [`${owner}-polygon-fill`, `${owner}-polygon-line`, `${owner}-line`, `${owner}-point-outline`, `${owner}-point`].forEach(layerId => {
      if (map.getLayer(layerId)) {
        map.setLayoutProperty(layerId, 'visibility', ownerVisibility(owner));
      }
    });
  });
  storageSet(OWNER_FILTERS_KEY, JSON.stringify(ownerFilters));
}

function updateSource(owner, features) {
  sourceState[owner] = featureCollection(features);
  const src = map.getSource(owner);
  if (src) src.setData(sourceState[owner]);
}

async function loadFeatures() {
  const { data, error } = await supabase
    .from('map_features')
    .select('*')
    .order('created_at', { ascending: true });
  if (error) {
    console.error(error);
    alert(`Supabase read failed: ${error.message}`);
    return;
  }
  const grouped = { Tod: [], Curt: [], Steve: [] };
  data.forEach(row => {
    const owner = grouped[row.owner] ? row.owner : 'Tod';
    grouped[owner].push(rowToFeature(row));
  });
  updateSource('Tod', grouped.Tod);
  updateSource('Curt', grouped.Curt);
  updateSource('Steve', grouped.Steve);
}

function rowToFeature(row) {
  return {
    type: 'Feature',
    id: row.id,
    geometry: row.geometry,
    properties: {
      id: row.id,
      owner: row.owner,
      feature_type: row.feature_type,
      title: row.title || '',
      note: row.note || '',
      color: row.color || OWNER_COLORS[row.owner] || '#888888',
      created_at: row.created_at || '',
      updated_at: row.updated_at || ''
    }
  };
}

function geometryLabel(geometryType) {
  if (geometryType === 'Point') return 'Point';
  if (geometryType === 'LineString') return 'Stretch';
  return 'Area';
}

function popupHTML(feature) {
  const p = feature.properties || {};
  const title = escapeHTML(p.title || FEATURE_META[p.feature_type]?.label || 'Map feature');
  const note = escapeHTML(p.note || '');
  return `
    <div class="popup-title">${title}</div>
    <div class="popup-meta">${escapeHTML(p.owner || '')} · ${escapeHTML(p.feature_type || geometryLabel(feature.geometry.type))}</div>
    <div class="popup-note">${note || 'No notes yet.'}</div>
  `;
}

function escapeHTML(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function registerPopupLayers() {
  ['Tod', 'Curt', 'Steve'].forEach(owner => {
    [`${owner}-point`, `${owner}-line`, `${owner}-polygon-fill`].forEach(layerId => {
      map.on('click', layerId, (event) => {
        const feature = event.features?.[0];
        if (!feature) return;
        new maplibregl.Popup({ closeButton: true, closeOnMove: true })
          .setLngLat(event.lngLat)
          .setHTML(popupHTML(feature))
          .addTo(map);
      });
      map.on('mouseenter', layerId, () => map.getCanvas().style.cursor = 'pointer');
      map.on('mouseleave', layerId, () => map.getCanvas().style.cursor = '');
    });
  });
}

function initDraw() {
  draw = new MapboxDraw({
    displayControlsDefault: false,
    controls: {},
    styles: [
      {
        id: 'gl-draw-line', type: 'line', filter: ['all', ['==', '$type', 'LineString'], ['!=', 'mode', 'static']],
        paint: { 'line-color': '#b9fff0', 'line-width': 4 }
      },
      {
        id: 'gl-draw-polygon-fill', type: 'fill', filter: ['all', ['==', '$type', 'Polygon'], ['!=', 'mode', 'static']],
        paint: { 'fill-color': '#b9fff0', 'fill-opacity': 0.22 }
      },
      {
        id: 'gl-draw-polygon-stroke', type: 'line', filter: ['all', ['==', '$type', 'Polygon'], ['!=', 'mode', 'static']],
        paint: { 'line-color': '#b9fff0', 'line-width': 3 }
      },
      {
        id: 'gl-draw-point', type: 'circle', filter: ['all', ['==', '$type', 'Point'], ['!=', 'meta', 'midpoint'], ['!=', 'meta', 'vertex']],
        paint: { 'circle-radius': 6, 'circle-color': '#b9fff0' }
      },
      {
        id: 'gl-draw-vertex', type: 'circle', filter: ['all', ['==', 'meta', 'vertex']],
        paint: { 'circle-radius': 5, 'circle-color': '#ffffff' }
      }
    ]
  });
  map.addControl(draw);
  map.on('draw.create', (event) => {
    const feature = event.features?.[0];
    if (!feature) return;
    pendingFeature = feature;
    featureModalTitle.textContent = `Add ${FEATURE_META[currentFeatureType].label}`;
    featureTitleInput.value = '';
    featureNoteInput.value = '';
    setVisible(featureModal, true);
  });
}

async function savePendingFeature() {
  if (!pendingFeature) return;
  const title = featureTitleInput.value.trim();
  const note = featureNoteInput.value.trim();
  const payload = {
    owner: getIdentity(),
    feature_type: currentFeatureType,
    geometry: pendingFeature.geometry,
    title,
    note,
    color: OWNER_COLORS[getIdentity()] || '#888888'
  };
  const { error } = await supabase.from('map_features').insert(payload);
  if (error) {
    alert(`Save failed: ${error.message}`);
  }
  draw.deleteAll();
  pendingFeature = null;
  setVisible(featureModal, false);
  updateFeatureButtonState();
}

function cancelPendingFeature() {
  draw.deleteAll();
  pendingFeature = null;
  setVisible(featureModal, false);
  updateFeatureButtonState();
}

async function addPointFeature(lngLat) {
  const meta = FEATURE_META[currentFeatureType];
  if (meta.geometry !== 'point') return;
  pendingFeature = {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [lngLat.lng, lngLat.lat] },
    properties: {}
  };
  featureModalTitle.textContent = `Add ${meta.label}`;
  featureTitleInput.value = '';
  featureNoteInput.value = '';
  setVisible(featureModal, true);
}

function cycleBasemap() {
  currentBasemap = currentBasemap === 'outdoors' ? 'satellite' : 'outdoors';
  storageSet(BASEMAP_KEY, currentBasemap);
  const center = map.getCenter();
  const zoom = map.getZoom();
  const pitch = map.getPitch();
  const bearing = map.getBearing();
  map.setStyle(styleForBasemap(currentBasemap));
  map.once('styledata', () => {
    map.jumpTo({ center, zoom, pitch, bearing });
    onStyleReady();
  });
}

function registerRealtime() {
  if (currentSubscription) supabase.removeChannel(currentSubscription);
  currentSubscription = supabase
    .channel('map-features-live')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'map_features' }, () => {
      loadFeatures();
    })
    .subscribe();
}

function onStyleReady() {
  setTerrainState();
  if (draw) { try { map.removeControl(draw); } catch (e) {} draw = null; }
  initDraw();
  registerPopupLayers();
  updateOwnerVisibility();
  loadFeatures();
  document.body.classList.add('app-ready');
}

function initMap() {
  map = new maplibregl.Map({
    container: 'map',
    style: styleForBasemap(currentBasemap),
    center: defaultCenter,
    zoom: defaultZoom,
    pitch: defaultPitch,
    bearing: defaultBearing,
    hash: false,
    antialias: true,
    maxZoom: 18
  });

  map.on('error', event => console.error('Map error', event?.error || event));

  map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-left');
  map.addControl(new maplibregl.ScaleControl({ unit: 'imperial' }), 'bottom-right');

  map.on('load', () => {
    try {
      onStyleReady();
    } catch (error) {
      startupFail('The map loaded, then hit an error while turning on editing tools.', error);
    }
  });
  map.on('click', event => {
    if (FEATURE_META[currentFeatureType].geometry !== 'point' || featureModal.classList.contains('visible')) return;
    const hits = map.queryRenderedFeatures(event.point, { layers: ['Tod-point','Curt-point','Steve-point','Tod-line','Curt-line','Steve-line','Tod-polygon-fill','Curt-polygon-fill','Steve-polygon-fill'] });
    if (hits.length) return;
    addPointFeature(event.lngLat);
  });
}

function bindUI() {
  tfKeyField.value = THUNDERFOREST_KEY;
  identitySelect.value = getIdentity();

  document.querySelectorAll('.identity-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      saveIdentity(btn.dataset.identity);
      document.documentElement.setAttribute('data-has-identity', '1');
      identityModal.classList.remove('visible');
      updateFeatureButtonState();
    });
  });

  document.addEventListener('yd-identity-picked', (event) => {
    const identity = event?.detail?.identity;
    if (!identity) return;
    saveIdentity(identity);
    updateFeatureButtonState();
  });

  document.querySelectorAll('.feature-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      currentFeatureType = btn.dataset.featureType;
      updateFeatureButtonState();
    });
  });

  document.querySelectorAll('#legend input[type="checkbox"]').forEach(cb => {
    cb.checked = ownerFilters[cb.dataset.owner] !== false;
    cb.addEventListener('change', () => {
      ownerFilters[cb.dataset.owner] = cb.checked;
      updateOwnerVisibility();
    });
  });

  document.getElementById('settingsBtn').addEventListener('click', () => {
    identitySelect.value = getIdentity();
    setVisible(settingsModal, true);
  });

  document.getElementById('saveSettingsBtn').addEventListener('click', () => {
    saveIdentity(identitySelect.value);
    setVisible(settingsModal, false);
    updateFeatureButtonState();
  });

  document.getElementById('closeSettingsBtn').addEventListener('click', () => setVisible(settingsModal, false));
  document.getElementById('cancelFeatureBtn').addEventListener('click', cancelPendingFeature);
  document.getElementById('saveFeatureBtn').addEventListener('click', savePendingFeature);
  document.getElementById('basemapBtn').addEventListener('click', cycleBasemap);
  document.getElementById('terrainBtn').addEventListener('click', () => {
    terrainEnabled = !terrainEnabled;
    storageSet(TERRAIN_KEY, terrainEnabled ? '1' : '0');
    setTerrainState();
  });
  document.getElementById('tiltUpBtn').addEventListener('click', () => map.easeTo({ pitch: Math.min(75, map.getPitch() + 8), duration: 250 }));
  document.getElementById('tiltDownBtn').addEventListener('click', () => map.easeTo({ pitch: Math.max(0, map.getPitch() - 8), duration: 250 }));
  document.getElementById('resetViewBtn').addEventListener('click', () => {
    map.easeTo({ center: defaultCenter, zoom: defaultZoom, pitch: defaultPitch, bearing: defaultBearing, duration: 700 });
  });
  finishShapeBtn.addEventListener('click', finishCurrentShape);
  cancelShapeBtn.addEventListener('click', () => {
    draw?.deleteAll();
    updateFeatureButtonState();
  });

  featureModal.addEventListener('click', event => {
    if (event.target === featureModal) cancelPendingFeature();
  });
  settingsModal.addEventListener('click', event => {
    if (event.target === settingsModal) setVisible(settingsModal, false);
  });
  identityModal.addEventListener('click', event => {
    if (event.target === identityModal && currentIdentity) setVisible(identityModal, false);
  });
}

function finishCurrentShape() {
  const mode = draw?.getMode();
  if (mode === 'draw_polygon' || mode === 'draw_line_string') {
    const canvas = map.getCanvas();
    ['keydown','keyup'].forEach(type => canvas.dispatchEvent(new KeyboardEvent(type, { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true })));
  }
}

async function startApp() {
  if (appStarted) return;
  appStarted = true;
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('./service-worker.js').catch(console.error), { once: true });
  }

  if (!window.supabase?.createClient) {
    throw new Error('Supabase library did not load.');
  }
  if (!window.maplibregl?.Map) {
    throw new Error('MapLibre library did not load.');
  }
  if (window.maplibregl && !window.mapboxgl) {
    window.mapboxgl = window.maplibregl;
  }
  if (window.MapboxDraw?.constants?.classes) {
    MapboxDraw.constants.classes.CANVAS = 'maplibregl-canvas';
    MapboxDraw.constants.classes.CONTROL_BASE = 'maplibregl-ctrl';
    MapboxDraw.constants.classes.CONTROL_PREFIX = 'maplibregl-ctrl-';
    MapboxDraw.constants.classes.CONTROL_GROUP = 'maplibregl-ctrl-group';
    MapboxDraw.constants.classes.ATTRIBUTION = 'maplibregl-ctrl-attrib';
  }

  supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
  initMap();
  registerRealtime();
  updateFeatureButtonState();
}

bindUI();

if (!currentIdentity) {
  document.documentElement.setAttribute('data-has-identity', '0');
  identityModal.classList.add('visible');
} else {
  document.documentElement.setAttribute('data-has-identity', '1');
  identitySelect.value = currentIdentity;
  identityModal.classList.remove('visible');
}

startApp().catch(error => startupFail('The map hit a startup error.', error));

window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    if (featureModal.classList.contains('visible')) cancelPendingFeature();
    else if (settingsModal.classList.contains('visible')) setVisible(settingsModal, false);
  }
  if (event.key === 'Enter' && (FEATURE_META[currentFeatureType].geometry === 'line' || FEATURE_META[currentFeatureType].geometry === 'polygon')) {
    finishCurrentShape();
  }
});
