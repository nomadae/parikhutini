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


useGeographic();

const key = import.meta.env.VITE_MAPTILER_KEY;
const styleJson = `https://api.maptiler.com/maps/hybrid/style.json?key=${key}`;


const container = document.getElementById('popup');
const content = document.getElementById('popup-content');
const closer = document.getElementById('popup-closer');


const map = new Map({
  target: 'map',
  view: new View({
    constrainResolution: true,
    center: [-102.25131182429995, 19.494074355290678 ],
    zoom: 14
  })
});

apply(map, styleJson);


const layer = new VectorLayer({
  zIndex: 1000,
  source: new Vector({
    features: [
      new Feature({
        geometry: new Point([-102.25131182429995, 19.494074355290678])
      })
    ]
  }),
  style: new Style({
    image: new Icon({
      anchor: [0.5, 1],
      crossOrigin: 'anonymous',
      src: 'icon.png'
    })
  })
});

map.addLayer(layer);

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
    }
  } catch (e) {
      if (e instanceof TypeError) {
        // console.error(e);
        console.log('No feature found near clicked zone.');
      }
    }
});