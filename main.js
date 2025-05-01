import './style.css';
import {Map, View} from 'ol';
import {useGeographic} from 'ol/proj.js';
// import TileLayer from 'ol/layer/Tile';
// import OSM from 'ol/source/OSM';
import Attribution from 'ol/control/Attribution'
import Feature from 'ol/Feature.js';
import Point from 'ol/geom/Point.js';
import apply from 'ol-mapbox-style';



useGeographic();

const key = 'uQqIJhG3KGvtz6fLtKWj';
const styleJson = `https://api.maptiler.com/maps/hybrid/style.json?key=${key}`;

const attribution = new Attribution({
  collapsible: false,
});

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


