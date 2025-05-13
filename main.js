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
  element: document.getElementById('popup'),
});
map.addOverlay(popup);

const element = popup.getElement();
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
      popup.setPosition(coordinate);
      let popover = bootstrap.Popover.getInstance(element);
      if (popover) {
        popover.dispose();
      }
      popover = new bootstrap.Popover(element, {
        animation: false,
        container: element,
        content: '<p>The location you clicked was:</p><code>' + hdms + '</code>',
        html: true,
        placement: 'top',
        title: 'Welcome to OpenLayers',
      });
      popover.show();
    }
  } catch (e) {
      if (e instanceof TypeError) {
        // console.error(e);
        console.log('No feature found near clicked zone.');
      }
    }
});