import './style.css';
import {Map, Overlay, View} from 'ol';
import {toLonLat, useGeographic} from 'ol/proj.js';
import Feature from 'ol/Feature.js';
import Point from 'ol/geom/Point.js';
import apply from 'ol-mapbox-style';
import {Vector} from 'ol/source';
import VectorLayer from 'ol/layer/Vector';
import { Icon, Style } from 'ol/style';
import { toStringHDMS } from 'ol/coordinate';
import GeoJSON from 'ol/format/GeoJSON.js'

////////////////////////////////////////////
////        Map Configuration           ////
////////////////////////////////////////////

useGeographic();

const key = import.meta.env.VITE_MAPTILER_KEY;
const styleJson = `https://api.maptiler.com/maps/hybrid/style.json?key=${key}`;

const map = new Map({
  target: 'map',
  view: new View({
    constrainResolution: true,
    center: [-102.25131182429995, 19.494074355290678 ],
    zoom: 14
  })
});

apply(map, styleJson);

////////////////////////////////////////////
////         Information Layers         ////
////////////////////////////////////////////

// const layer = new VectorLayer({
//   zIndex: 1000,
//   source: new Vector({
//     features: [
//       new Feature({
//         geometry: new Point([-102.25131182429995, 19.494074355290678]),
//         name: "Volcán Paricutín",
//       })
//     ]
//   }),
//   style: new Style({
//     image: new Icon({
//       anchor: [0.5, 1],
//       crossOrigin: 'anonymous',
//       src: 'icon4.png',
//       // color: '#75FB4C'
//     })
//   })
// });

const layer = new VectorLayer({
  zIndex: 1000,
  source: new Vector({
    url: './data/all.json',
    format: new GeoJSON(),
  }),
  style: new Style({
    image: new Icon({
      anchor: [0.5, 1],
      crossOrigin: 'anonymous',
      src: 'icon4.png',
      // color: '#75FB4C'
    })
  })
});


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
  // checar si cerca de la coordenada donde se hizo click existe algun marcador
  // y desplegar el popover
  
  var fl = map.forEachFeatureAtPixel(evt.pixel,
    function(feature, layer) {
      return [feature, layer];
  });
  try{
    let clickedFeature = fl[0].values_.geometry;
    if(clickedFeature) {
      const hdms = toStringHDMS(coordinate);
      let largeTextPlaceholderHTML = `<p>There is something special about the first two products calculated in Example 7.1.1. Notice that for each, AX=kX where k is some scalar. \ 
                                    When this equation holds for some X and k, we call the scalar k an eigenvalue of A. We often use the special symbol λ instead of k when referring to eigenvalues.\
                                    In Example 7.1.1, the values 10 and 0 are eigenvalues for the matrix A and we can label these as λ1=10 and λ2=0. \
                                    When AX=λX for some X≠0, we call such an X an eigenvector of the matrix A. The eigenvectors of A are associated to an eigenvalue. \
                                    Hence, if λ1 is an eigenvalue of A and AX=λ1X, we can label this eigenvector as X1. \ 
                                    Note again that in order to be an eigenvector, X must be nonzero. There is also a geometric significance to eigenvectors. \
                                    When you have a nonzero vector which, when multiplied by a matrix results in another vector which is parallel to the first or equal to 0, this vector is called an eigenvector of the matrix. This is the meaning when the vectors are in Rn. \
                                    The formal definition of eigenvalues and eigenvectors is as follows.</p>`
      content.innerHTML = '<span><b>Mi Titulo</b></span><br><br><p>The location you clicked was:</p><code>' + hdms + '</code><br>' + largeTextPlaceholderHTML;
      popup.setPosition(coordinate);
      // popup.setPosition(clickedFeature.getCoordinates());
      // let popover = bootstrap.Popover.getInstance(element);
      // if (popover) {
      //   popover.dispose();
      // }
      // popover = new bootstrap.Popover(element, {
      //   animation: false,
      //   container: element,
      //   content: '<p>The location you clicked was:</p><code>' + hdms + '</code>',
      //   html: true,
      //   placement: 'top',
      //   title: 'Welcome to OpenLayers',
      // });
      // popover.show();
      console.log(fl[0].getGeometry().getCoordinates());
      console.log(fl[0].values_.index);

    }
  } catch (e) {
      if (e instanceof TypeError) {
        // console.error(e);
        console.log('No feature found near clicked zone.');
      }
    }
});

////////////////////////////////////////////
////              Cursor                ////
////////////////////////////////////////////

const changeCursorStyle = function(pixel, target) {
  const feature = target.closest('.ol-control')
    ? undefined
    : map.forEachFeatureAtPixel(pixel, function (feature) {
        return feature;
  });
  if (feature instanceof Feature) {
    target.style.cursor = 'pointer';
  } else {
    target.style.cursor = '';
  }
}

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
    : map.forEachFeatureAtPixel(pixel, function (feature) {
        return feature;
      });
  if (feature instanceof Feature) {
    info.style.left = (pixel[0]+10) + 'px';
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
////          Panel Controls           /////
////////////////////////////////////////////

const leftPanelContainer = document.getElementById('pane');

const vectorSource = layer.getSource();
let features;
const keys = [];
// vectorSource.on('change', function(evt){
//     var source=evt.target;
//     if(source.getState() === 'ready'){
//         features = vectorSource.getFeatures();
        
//         for (let i=0; i < features.length; i++) {
//         //  keys.push(layerFeatures[i].get("index"));
//           let featureButton = document.createElement('button');
//           featureButton.innerHTML = features[i].values_.nombre;
//           featureButton.data = features[i].values_.index;
//           featureButton.onclick = function(e) {
//             map.getView().setCenter(features[i].getGeometry().getCoordinates());
//           }
//           leftPanelContainer.appendChild(featureButton);
//           keys.push(features[i].values_.index);
//         }
//         console.log(keys[0])
//         // console.info(vectorSource.getFeatures());
//     }
// });

async function waitForChangeEvent(element) {
  return new Promise(resolve => {
    element.addEventListener('change', () => {
      resolve();
    }, {once: true});
  });
}

async function waitForVectorSourceReady() {
  await waitForChangeEvent(vectorSource);
  // console.log('Change occurred!');
  if (vectorSource.getState() === 'ready') {
    features = vectorSource.getFeatures();
        
    for (let i=0; i < features.length; i++) {
    //  keys.push(layerFeatures[i].get("index"));
      let featureButton = document.createElement('button');
      featureButton.innerHTML = features[i].values_.nombre;
      featureButton.data = features[i].values_.index;
      featureButton.onclick = function(e) {
        map.getView().setCenter(features[i].getGeometry().getCoordinates());
      }
      leftPanelContainer.appendChild(featureButton);
      keys.push(features[i].values_.index);
    }
  }
  // console.log(keys[0])
  // console.info(vectorSource.getFeatures());
}

waitForVectorSourceReady();

