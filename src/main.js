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

map.on('click', function (evt) {
  const coordinate = evt.coordinate;
  const fl = map.forEachFeatureAtPixel(evt.pixel, function (feature, lyr) {
    return [feature, lyr];
  });
  try {
    const clickedFeature = fl[0].values_.geometry;
    if (clickedFeature) {
      const hdms = toStringHDMS(coordinate);
      const placeholderText =
        '<p>There is something special about the first two products calculated in Example 7.1.1.</p>';
      content.innerHTML =
        '<span><b>Mi Titulo</b></span><br><br><p>The location you clicked was:</p><code>' +
        hdms +
        '</code><br>' +
        placeholderText;
      popup.setPosition(coordinate);
      console.log(fl[0].getGeometry().getCoordinates());
      console.log(fl[0].values_.index);
    }
  } catch (e) {
    if (e instanceof TypeError) {
      console.log('No feature found near clicked zone.');
    }
  }
});

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
