import { Map, Overlay, View } from 'ol';
import { useGeographic } from 'ol/proj.js';
import Feature from 'ol/Feature.js';
import { toStringHDMS } from 'ol/coordinate';
import apply from 'ol-mapbox-style';

import './style.css';
import { buildMunicipalitySidebar } from './map/sidebar.js';
import { createVolcanoLayer, volcanoFeatureStyle } from './map/volcanoLayer.js';

////////////////////////////////////////////
////        Map Configuration           ////
////////////////////////////////////////////
useGeographic();

const key = import.meta.env.VITE_MAPTILER_KEY;
const styleJson = `https://api.maptiler.com/maps/hybrid/style.json?key=${key}`;

const map = new Map({
  target: 'map',
  view: new View({
    projection: 'EPSG:3857',
    constrainResolution: true,
    center: [-102.25131182429995, 19.494074355290678],
    zoom: 14,
  }),
});

apply(map, styleJson);

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

/** HTML for the popup morphometry table ('' when the feature has none). */
function morphometryHtml(props) {
  let anyValue = false;
  const rows = MORPHOMETRY.map((def) => {
    const value = formatMeasure(parseCatalogNumber(props[def.key]), def.max);
    if (value !== null) anyValue = true;
    const text = value === null ? 's/d' : value + (def.unit ? ` ${def.unit}` : '');
    return (
      `<dt title="${def.hint}">${def.label}</dt>` +
      `<dd class="${value === null ? 'is-missing' : ''}">${text}</dd>`
    );
  });
  if (!anyValue) return '';
  return (
    '<h5 class="popup-attrs-title">Morfometría</h5>' +
    '<dl class="popup-attrs">' +
    rows.join('') +
    '</dl>' +
    '<p class="popup-note">Catálogo de volcanes · s/d = sin dato</p>'
  );
}

map.on('click', function (evt) {
  const coordinate = evt.coordinate;
  const feature = map.forEachFeatureAtPixel(evt.pixel, function (f) {
    return f;
  });
  if (!(feature instanceof Feature)) return;

  const props = feature.values_ || {};
  const hdms = toStringHDMS(coordinate);
  const name = props.nombre ? escapeHtml(props.nombre) : 'Volcán';
  const municipio = props.municipio ? escapeHtml(props.municipio) : '—';
  content.innerHTML =
    `<h4 class="popup-title">${name}</h4>` +
    `<p class="popup-meta">Municipio: ${municipio}</p>` +
    `<p class="popup-coords">Coordenadas: <code>${hdms}</code></p>` +
    morphometryHtml(props);
  popup.setPosition(coordinate);
});

/** Escape user/feature-provided strings before injecting them as HTML. */
function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

////////////////////////////////////////////
////              Cursor                ////
////////////////////////////////////////////

const changeCursorStyle = function (pixel, target) {
  const feature = target.closest('.ol-control')
    ? undefined
    : map.forEachFeatureAtPixel(pixel, function (f) {
        return f;
      });
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
  const feature = target.closest('.ol-control')
    ? undefined
    : map.forEachFeatureAtPixel(pixel, function (f) {
        return f;
      });
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

map.on('pointermove', function (evt) {
  if (evt.dragging) {
    info.style.visibility = 'hidden';
    currentFeature = undefined;
    return;
  }
  displayFeatureInfo(evt.pixel, evt.originalEvent.target);
});

map.on('click', function (evt) {
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
  const fl = map.forEachFeatureAtPixel(evt.pixel, function (feature, lyr) {
    return [feature, lyr];
  });
  try {
    const clickedFeature = fl[0];
    selectedFeature = clickedFeature;
    if (clickedFeature) {
      console.log(clickedFeature);
      clickedFeature.setStyle(volcanoFeatureStyle(true));
    }
  } catch (e) {
    console.error(e);
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

buildMunicipalitySidebar(map, layer);
