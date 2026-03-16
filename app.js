const VERSION = '3.2.1';
const SUPABASE_URL = 'https://wntakzfoprthwggkidyq.supabase.co';
const SUPABASE_KEY = 'sb_publishable_gWu_EQ1J3s0iNjeDeINJwQ_xKy8QgAJ';
const THUNDERFOREST_KEY = 'c0ceacbdeb224697bdedd71af8b20abd';

const IDENTITY_KEY = 'yellowdog.identity';
const BASEMAP_KEY = 'yellowdog.basemap';

const DEFAULT_CENTER = [46.762, -87.892];
const DEFAULT_ZOOM = 13;

const OWNER_COLORS = { Tod: '#d95a5a', Curt: '#efb349', Steve: '#4e8fd6' };
const TYPE_DEFAULTS = { note:'Note', parking:'Parking', camping:'Camping', hazard:'Hazard', stretch:'Stretch', access:'Area / Access' };

let currentIdentity = safeStorageGet(IDENTITY_KEY, '');
let currentBasemap = safeStorageGet(BASEMAP_KEY, 'outdoors');
let ownerFilters = { Tod:true, Curt:true, Steve:true };
let pendingLayer = null;
let featureGroups = {};
let map = null;
let activeBaseLayer = null;
let pollHandle = null;
let lastHash = '';

const statusBadge = document.getElementById('statusBadge');
const identityModal = document.getElementById('identityModal');
const featureModal = document.getElementById('featureModal');
const identitySelect = document.getElementById('identitySelect');
const featureTypeSelect = document.getElementById('featureType');
const featureTitleInput = document.getElementById('featureTitle');
const featureNoteInput = document.getElementById('featureNote');

function safeStorageGet(key, fallback) {
  try { const v = localStorage.getItem(key); return v === null ? fallback : v; } catch (e) { return fallback; }
}
function safeStorageSet(key, value) {
  try { localStorage.setItem(key, value); } catch (e) {}
}
function safeStorageGetJSON(key, fallback) {
  const raw = safeStorageGet(key, '');
  if (!raw) return fallback;
  try { return JSON.parse(raw); } catch (e) { return fallback; }
}
function setStatus(message) {
  statusBadge.style.display = 'block';
  statusBadge.textContent = message;
}
function hideStatusSoon(ms=1400) {
  setTimeout(() => { statusBadge.style.display = 'none'; }, ms);
}
function setReady() {
  document.body.classList.add('app-ready');
  hideStatusSoon();
}
function escapeHTML(value) {
  return String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
}
function popupHTML(properties) {
  const title = escapeHTML(properties.title || TYPE_DEFAULTS[properties.feature_type] || 'Feature');
  const owner = escapeHTML(properties.owner || '');
  const type = escapeHTML(properties.feature_type || '');
  const note = escapeHTML(properties.note || '');
  return `<div class="popup-title">${title}</div><div class="popup-meta">${owner} · ${type}</div><div class="popup-note">${note || 'No notes yet.'}</div>`;
}
function createOwnerIcon(owner) {
  return L.divIcon({ className:'', html:`<div class="custom-owner-icon owner-${owner}"></div>`, iconSize:[18,18], iconAnchor:[9,9], popupAnchor:[0,-8] });
}
function styleForOwner(owner, geometryType) {
  const color = OWNER_COLORS[owner] || '#888888';
  return { color, weight: geometryType === 'Polygon' ? 3 : 5, fillColor: color, fillOpacity: 0.18 };
}
function baseFactories() {
  return {
    outdoors: () => L.tileLayer(`https://tile.thunderforest.com/outdoors/{z}/{x}/{y}.png?apikey=${THUNDERFOREST_KEY}`, { maxZoom:19, attribution:'Maps © Thunderforest, Data © OpenStreetMap contributors' }),
    satellite: () => L.layerGroup([
      L.tileLayer('https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom:19, attribution:'Tiles © Esri' }),
      L.tileLayer('https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', { maxZoom:19, attribution:'Labels © Esri' })
    ]),
    osm: () => L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom:19, attribution:'© OpenStreetMap contributors' })
  };
}
const basemaps = baseFactories();

function setBaseLayer(name) {
  const chosen = basemaps[name] ? name : 'osm';
  if (activeBaseLayer) map.removeLayer(activeBaseLayer);
  activeBaseLayer = basemaps[chosen]();
  activeBaseLayer.addTo(map);
  currentBasemap = chosen;
  safeStorageSet(BASEMAP_KEY, chosen);
  setStatus(`Showing ${chosen} basemap.`);
  hideStatusSoon(900);

  if (chosen === 'outdoors' && activeBaseLayer && activeBaseLayer.on) {
    let swapped = false;
    activeBaseLayer.on('tileerror', () => {
      if (!swapped) {
        swapped = true;
        setStatus('Thunderforest failed. Falling back to OSM.');
        setBaseLayer('osm');
      }
    });
  }
}
function cycleBasemap() {
  const order = ['outdoors', 'satellite', 'osm'];
  const idx = order.indexOf(currentBasemap);
  setBaseLayer(order[(idx + 1) % order.length]);
}
function initMap() {
  if (!window.L) throw new Error('Leaflet library did not load.');

  setStatus('Rendering base map…');
  map = L.map('map', { zoomControl:true, preferCanvas:true }).setView(DEFAULT_CENTER, DEFAULT_ZOOM);
  setBaseLayer(currentBasemap || 'outdoors');

  map.whenReady(() => {
    setStatus('Map rendered. Shared notes loading next.');
    setReady();
  });

  featureGroups = { Tod:L.featureGroup().addTo(map), Curt:L.featureGroup().addTo(map), Steve:L.featureGroup().addTo(map) };
  L.control.scale({ imperial:true, metric:false }).addTo(map);

  if (window.L.Control && window.L.Control.Draw) {
    const drawControl = new L.Control.Draw({
      position:'topleft',
      draw: {
        marker: true,
        polyline: { shapeOptions: styleForOwner(currentIdentity || 'Tod', 'LineString') },
        polygon: { allowIntersection:false, showArea:true, shapeOptions: styleForOwner(currentIdentity || 'Tod', 'Polygon') },
        rectangle: { shapeOptions: styleForOwner(currentIdentity || 'Tod', 'Polygon') },
        circle: false,
        circlemarker: false
      },
      edit: false
    });
    map.addControl(drawControl);
    map.on(L.Draw.Event.CREATED, event => openFeatureModal(event.layer));
  } else {
    setStatus('Map rendered. Draw tools did not load.');
  }

  document.getElementById('basemapBtn').addEventListener('click', cycleBasemap);
  document.getElementById('refreshBtn').addEventListener('click', loadFeatures);
}
function rowToLayer(row) {
  const owner = featureGroups[row.owner] ? row.owner : 'Tod';
  return L.geoJSON(row.geometry, {
    pointToLayer: (_, latlng) => L.marker(latlng, { icon: createOwnerIcon(owner) }),
    style: () => styleForOwner(owner, row.geometry.type),
    onEachFeature: (_, layer) => layer.bindPopup(popupHTML({ owner: row.owner, feature_type: row.feature_type, title: row.title, note: row.note }))
  });
}
function applyOwnerFilters() {
  Object.keys(featureGroups).forEach(owner => {
    if (ownerFilters[owner] === false) {
      if (map.hasLayer(featureGroups[owner])) map.removeLayer(featureGroups[owner]);
    } else {
      if (!map.hasLayer(featureGroups[owner])) map.addLayer(featureGroups[owner]);
    }
  });
}
async function restFetch(path, options = {}) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      ...(options.method === 'POST' ? { 'Content-Type': 'application/json', 'Prefer': 'return=representation' } : {}),
      ...(options.headers || {})
    }
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`${response.status} ${text}`);
  }
  const type = response.headers.get('content-type') || '';
  return type.includes('application/json') ? response.json() : response.text();
}
async function loadFeatures() {
  try {
    setStatus('Loading shared notes from Supabase…');
    const data = await restFetch('map_features?select=*&order=created_at.asc');
    const newHash = JSON.stringify(data.map(row => [row.id, row.updated_at]));
    if (newHash === lastHash) { hideStatusSoon(300); return; }
    lastHash = newHash;

    Object.values(featureGroups).forEach(group => group.clearLayers());
    data.forEach(row => {
      const owner = featureGroups[row.owner] ? row.owner : 'Tod';
      featureGroups[owner].addLayer(rowToLayer(row));
    });
    applyOwnerFilters();
    setStatus('Shared notes updated.');
    hideStatusSoon(700);
  } catch (error) {
    console.error(error);
    setStatus(`Supabase failed, but map is alive: ${error.message}`);
  }
}
function bindIdentityUI() {
  identitySelect.value = currentIdentity || 'Tod';
  document.querySelectorAll('.identityBtn').forEach(btn => {
    btn.addEventListener('click', () => {
      currentIdentity = btn.dataset.name;
      safeStorageSet(IDENTITY_KEY, currentIdentity);
      identitySelect.value = currentIdentity;
      identityModal.classList.remove('visible');
    });
  });
  if (!currentIdentity) identityModal.classList.add('visible');
}
function guessTypeFromLayer(layer) {
  if (layer instanceof L.Marker) return 'note';
  if (layer instanceof L.Polygon) return 'access';
  if (layer instanceof L.Polyline) return 'stretch';
  return 'note';
}
function openFeatureModal(layer) {
  pendingLayer = layer;
  featureTypeSelect.value = guessTypeFromLayer(layer);
  featureTitleInput.value = '';
  featureNoteInput.value = '';
  featureModal.classList.add('visible');
}
function cancelPendingFeature() {
  if (pendingLayer) { try { map.removeLayer(pendingLayer); } catch (e) {} }
  pendingLayer = null;
  featureModal.classList.remove('visible');
}
async function savePendingFeature() {
  if (!pendingLayer) return;
  try {
    const featureType = featureTypeSelect.value;
    let geometry = null;
    if (pendingLayer instanceof L.Marker) {
      const ll = pendingLayer.getLatLng();
      geometry = { type:'Point', coordinates:[ll.lng, ll.lat] };
    } else if (pendingLayer instanceof L.Polygon) {
      const ring = pendingLayer.getLatLngs()[0].map(ll => [ll.lng, ll.lat]);
      if (ring.length && (ring[0][0] !== ring[ring.length - 1][0] || ring[0][1] !== ring[ring.length - 1][1])) ring.push([ring[0][0], ring[0][1]]);
      geometry = { type:'Polygon', coordinates:[ring] };
    } else if (pendingLayer instanceof L.Polyline) {
      geometry = { type:'LineString', coordinates: pendingLayer.getLatLngs().map(ll => [ll.lng, ll.lat]) };
    }
    const payload = {
      owner: currentIdentity || 'Tod',
      feature_type: featureType,
      geometry,
      title: featureTitleInput.value.trim(),
      note: featureNoteInput.value.trim(),
      color: OWNER_COLORS[currentIdentity || 'Tod']
    };
    await restFetch('map_features', { method:'POST', body: JSON.stringify(payload) });
    pendingLayer = null;
    featureModal.classList.remove('visible');
    await loadFeatures();
  } catch (error) {
    console.error(error);
    alert(`Save failed: ${error.message}`);
  }
}
function bindFeatureModal() {
  document.getElementById('cancelFeatureBtn').addEventListener('click', cancelPendingFeature);
  document.getElementById('saveFeatureBtn').addEventListener('click', savePendingFeature);
  featureModal.addEventListener('click', event => { if (event.target === featureModal) cancelPendingFeature(); });
  identityModal.addEventListener('click', event => { if (event.target === identityModal && currentIdentity) identityModal.classList.remove('visible'); });
}
function startPolling() {
  if (pollHandle) clearInterval(pollHandle);
  pollHandle = setInterval(loadFeatures, 12000);
}
function startApp() {
  bindIdentityUI();
  bindFeatureModal();
  initMap();
  setTimeout(() => { loadFeatures(); startPolling(); }, 250);
}
try {
  startApp();
} catch (error) {
  console.error(error);
  setStatus(`Startup error: ${error.message}`);
  alert(`Startup error: ${error.message}`);
}
