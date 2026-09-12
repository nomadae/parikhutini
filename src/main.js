// Self-hosted third-party assets (no CDN <script>/<link>, so the app runs
// under a strict Content-Security-Policy; see public/_headers).
import 'bootstrap/dist/css/bootstrap.min.css';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/poppins/600.css';
import '@fontsource/poppins/700.css';
import 'bootstrap/dist/js/bootstrap.bundle.min.js';

import { Map, Overlay, View } from 'ol';
import { useGeographic } from 'ol/proj.js';
import Feature from 'ol/Feature.js';
import { toStringHDMS } from 'ol/coordinate';
import apply from 'ol-mapbox-style';

import './style.css'; // imports ol/ol.css as well
import { buildMunicipalitySidebar } from './map/sidebar.js';
import { createVolcanoLayer, volcanoFeatureStyle } from './map/volcanoLayer.js';

////////////////////////////////////////////
////        Map Configuration           ////
////////////////////////////////////////////
useGeographic();

const key = import.meta.env.VITE_MAPTILER_KEY;
const styleJson = `https://api.maptiler.com/maps/hybrid/style.json?key=${encodeURIComponent(key ?? '')}`;

const map = new Map({
  target: 'map',
  view: new View({
    projection: 'EPSG:3857',
    constrainResolution: true,
    center: [-102.25131182429995, 19.494074355290678],
    zoom: 14,
  }),
});

// Startup loader (defined inline in index.html). Hide it once the basemap
// style is applied and the first complete frame — volcano vector layer
// included — has been drawn.
const startupLoader = document.getElementById('startup-loader');

function hideStartupLoader() {
  if (!startupLoader || startupLoader.classList.contains('is-hidden')) return;
  startupLoader.classList.add('is-hidden');
  const remove = () => startupLoader.remove();
  startupLoader.addEventListener('transitionend', remove, { once: true });
  setTimeout(remove, 700);
}

Promise.resolve(apply(map, styleJson))
  .catch((error) => {
    console.error('No se pudo cargar el estilo del mapa:', error);
  })
  .then(() => {
    // rendercomplete waits for pending tile/vector loads; render() makes sure
    // it fires even when the map is already idle by the time the style lands.
    map.once('rendercomplete', hideStartupLoader);
    map.render();
  });

// Safety net: never leave the loader covering the app.
setTimeout(hideStartupLoader, 12000);

////////////////////////////////////////////
////         Information Layers         ////
////////////////////////////////////////////

const layer = createVolcanoLayer();
map.addLayer(layer);

////////////////////////////////////////////
////              Popup                 ////
////////////////////////////////////////////

const container = document.getElementById('popup');
const content = document.getElementById('popup-content');
const closer = document.getElementById('popup-closer');

const popup = new Overlay({
  element: container,
  autoPan: {
    animation: {
      duration: 250,
    },
  },
});

/**
 * Add a click handler to hide the popup.
 * @return {boolean} Don't follow the href.
 */
closer.onclick = function () {
  popup.setPosition(undefined);
  closer.blur();
  return false;
};

map.addOverlay(popup);

// Track popup visibility on the body so small screens can yield the corner
// where the floating panel toggle would otherwise cover the popup.
popup.on('change:position', function () {
  document.body.classList.toggle('popup-open', popup.getPosition() !== undefined);
});

// ------------------------------------------------------------------
//  Morphometry from the volcano catalog (data/all.json fields wco,
//  wcr, hco, vol, h_o). Catalog units are km / km^3; h_o is the
//  cone height-to-width ratio. Zero/blank cells mean "not measured"
//  and are displayed as "s/d" (sin dato). `max` is a physical
//  plausibility ceiling: the original catalog contains a few capture
//  errors (e.g. hco of 120 km) that are suppressed instead of shown.
// ------------------------------------------------------------------
const MORPHOMETRY = [
  { key: 'wco', label: 'Ancho de la base', unit: 'km', max: 30, hint: 'diámetro de la base del cono (columna del catálogo: wco)' },
  { key: 'wcr', label: 'Ancho del cráter', unit: 'km', max: 10, hint: 'diámetro del cráter (columna del catálogo: wcr)' },
  { key: 'hco', label: 'Altura del cono', unit: 'km', max: 3, hint: 'altura del cono sobre su base (columna del catálogo: hco)' },
  { key: 'vol', label: 'Volumen', unit: 'km³', max: 100, hint: 'volumen estimado del edificio volcánico (columna del catálogo: vol)' },
  { key: 'h_o', label: 'Altura / ancho', unit: '', max: 1, hint: 'relación de forma altura-ancho del cono (columna del catálogo: h_o)' },
];

/** Clean catalog numbers: drop stray spaces (e.g. "0. 73") and commas. */
function parseCatalogNumber(value) {
  if (value === null || value === undefined) return NaN;
  const cleaned = String(value).replace(/\s+/g, '').replace(',', '.');
  if (cleaned === '' || cleaned === '-') return NaN;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : NaN;
}

/** Format a positive measure; null means "no usable value". */
function formatMeasure(value, max = Infinity) {
  if (!Number.isFinite(value) || value <= 0 || value > max) return null;
  return value.toLocaleString('en-US', { maximumSignificantDigits: 3 });
}

/**
 * Morphometry table as a DOM fragment (null when the feature has none).
 * Built with DOM APIs, so catalog values are never interpreted as HTML.
 */
function morphometryFragment(props) {
  let anyValue = false;
  const rows = MORPHOMETRY.map((def) => {
    const value = formatMeasure(parseCatalogNumber(props[def.key]), def.max);
    if (value !== null) anyValue = true;

    const term = document.createElement('dt');
    term.title = def.hint;
    term.textContent = def.label;

    const detail = document.createElement('dd');
    detail.textContent = value === null ? 's/d' : value + (def.unit ? ` ${def.unit}` : '');
    if (value === null) detail.className = 'is-missing';

    return [term, detail];
  });
  if (!anyValue) return null;

  const title = document.createElement('h5');
  title.className = 'popup-attrs-title';
  title.textContent = 'Morfometría';

  const list = document.createElement('dl');
  list.className = 'popup-attrs';
  for (const [term, detail] of rows) list.append(term, detail);

  const note = document.createElement('p');
  note.className = 'popup-note';
  note.textContent = 'Catálogo de volcanes · s/d = sin dato';

  const fragment = document.createDocumentFragment();
  fragment.append(title, list, note);
  return fragment;
}

/** Render the popup for a clicked feature without any innerHTML. */
function renderPopupContent(props, coordinate) {
  content.replaceChildren();

  const title = document.createElement('h4');
  title.className = 'popup-title';
  title.textContent = props.nombre || 'Volcán';
  content.append(title);

  const meta = document.createElement('p');
  meta.className = 'popup-meta';
  meta.textContent = `Municipio: ${props.municipio || '—'}`;
  content.append(meta);

  const coords = document.createElement('p');
  coords.className = 'popup-coords';
  coords.append('Coordenadas: ');
  const code = document.createElement('code');
  code.textContent = toStringHDMS(coordinate);
  coords.append(code);
  content.append(coords);

  const attributes = morphometryFragment(props);
  if (attributes) content.append(attributes);
}

map.on('click', function (evt) {
  const coordinate = evt.coordinate;
  const feature = map.forEachFeatureAtPixel(evt.pixel, function (f) {
    return f;
  });
  if (!(feature instanceof Feature)) {
    // Tapping empty terrain dismisses the open popup (the popup covers the
    // toggle on narrow screens, so it must be easy to close).
    popup.setPosition(undefined);
    return;
  }

  renderPopupContent(feature.values_ || {}, coordinate);
  popup.setPosition(coordinate);
});

////////////////////////////////////////////
////              Cursor                ////
////////////////////////////////////////////

const changeCursorStyle = function (pixel, target) {
  const feature =
    target instanceof Element && !target.closest('.ol-control')
      ? map.forEachFeatureAtPixel(pixel, function (f) {
          return f;
        })
      : undefined;
  if (feature instanceof Feature) {
    target.style.cursor = 'pointer';
  } else {
    target.style.cursor = '';
  }
};

map.on('pointermove', function (evt) {
  changeCursorStyle(evt.pixel, evt.originalEvent.target);
});

////////////////////////////////////////////
////            Tooltip                /////
////////////////////////////////////////////

const info = document.getElementById('info');

let currentFeature;
const displayFeatureInfo = function (pixel, target) {
  const feature =
    target instanceof Element && !target.closest('.ol-control')
      ? map.forEachFeatureAtPixel(pixel, function (f) {
          return f;
        })
      : undefined;
  if (feature instanceof Feature) {
    info.style.left = pixel[0] + 10 + 'px';
    info.style.top = pixel[1] + 'px';
    if (feature !== currentFeature) {
      info.style.visibility = 'visible';
      info.innerText = feature.values_.nombre;
    }
  } else {
    info.style.visibility = 'hidden';
  }
  currentFeature = feature;
};

// Touch devices have no hover: the tooltip would stay stuck after a tap (no
// pointerleave) and duplicate the popup title, so it is pointer-only.
const pointerCapable = window.matchMedia('(hover: hover) and (pointer: fine)');

map.on('pointermove', function (evt) {
  if (!pointerCapable.matches || evt.dragging) {
    info.style.visibility = 'hidden';
    currentFeature = undefined;
    return;
  }
  displayFeatureInfo(evt.pixel, evt.originalEvent.target);
});

map.on('click', function (evt) {
  if (!pointerCapable.matches) return;
  displayFeatureInfo(evt.pixel, evt.originalEvent.target);
});

map.getTargetElement().addEventListener('pointerleave', function () {
  currentFeature = undefined;
  info.style.visibility = 'hidden';
});

////////////////////////////////////////////
////          Selection icon            ////
////////////////////////////////////////////

let selectedFeature;
map.on('click', function (evt) {
  if (currentFeature) {
    clearIcon();
  }
  const hit = map.forEachFeatureAtPixel(evt.pixel, function (feature, lyr) {
    return [feature, lyr];
  });
  const clickedFeature = hit ? hit[0] : undefined;
  selectedFeature = clickedFeature;
  if (clickedFeature instanceof Feature) {
    clickedFeature.setStyle(volcanoFeatureStyle(true));
  }
});

function clearIcon() {
  if (selectedFeature) {
    selectedFeature.setStyle(volcanoFeatureStyle(false));
  }
}

////////////////////////////////////////////
////          Panel Controls           /////
////////////////////////////////////////////

// Sidebar toggle: responsive default is open on desktop, closed on mobile.
// (Moved out of an inline <script> so the page can run without
// 'unsafe-inline' in script-src.)
const mobilePanel = window.matchMedia('(max-width: 900px)');
let setPanelOpen = () => {};

(function initPanelToggle() {
  const body = document.body;
  const toggle = document.getElementById('panel-toggle');
  const scrim = document.getElementById('panel-scrim');
  let open = !mobilePanel.matches;

  function apply() {
    body.classList.toggle('panel-open', open);
    body.classList.toggle('panel-closed', !open);
    if (toggle) {
      toggle.textContent = open ? '\u2715' : '\u2630';
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      toggle.setAttribute('aria-label', open ? 'Ocultar el panel' : 'Mostrar el panel');
    }
  }

  setPanelOpen = (next) => {
    open = next;
    apply();
  };

  if (toggle) {
    toggle.addEventListener('click', () => setPanelOpen(!open));
  }
  if (scrim) {
    scrim.addEventListener('click', () => setPanelOpen(false));
  }
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && open && mobilePanel.matches) setPanelOpen(false);
  });
  // Crossing the breakpoint resets the drawer to the layout's default.
  mobilePanel.addEventListener('change', (event) => {
    open = !event.matches;
    apply();
  });
  apply();
})();

buildMunicipalitySidebar(map, layer, {
  // On phones the drawer covers the map, so close it once a volcano is picked
  // to reveal the recentred map.
  onSelectVolcano() {
    if (mobilePanel.matches) setPanelOpen(false);
  },
});
