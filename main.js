import './style.css';
import {Map, View} from 'ol';
import {useGeographic} from 'ol/proj.js';
// import TileLayer from 'ol/layer/Tile';
// import OSM from 'ol/source/OSM';
import Feature from 'ol/Feature.js';
import Point from 'ol/geom/Point.js';
import apply from 'ol-mapbox-style';
import {Vector} from 'ol/source';
import VectorLayer from 'ol/layer/Vector';
import { Icon, Style } from 'ol/style';


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

const initFeature = new Feature({
  geometry: new Point([-102.25131182429995, 19.494074355290678 ]),
  type: 'icon',
  name: 'Volcan Paricutin'
});


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
