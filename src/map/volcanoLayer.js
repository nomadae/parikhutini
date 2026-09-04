import GeoJSON from 'ol/format/GeoJSON.js';
import VectorLayer from 'ol/layer/Vector';
import { Vector } from 'ol/source';
import { Icon, Style } from 'ol/style';

import cerro from '../img/cerro.png';
import volcan from '../img/volcan.png';

/** GeoJSON of volcano features consumed by the portal (served from /data). */
export const VOLCANO_DATA_URL = './data/all.json';

/**
 * Feature style for volcano markers.
 * @param {boolean} selected highlight style for the last-clicked volcano
 */
export function volcanoFeatureStyle(selected = false) {
  return new Style({
    image: new Icon({
      anchor: [0.5, 1],
      crossOrigin: 'anonymous',
      src: selected ? volcan : cerro,
      // Default icon is white-tinted; the selected one keeps its own colors.
      ...(selected ? {} : { color: '#fff' }),
      width: selected ? 60 : 50,
      height: selected ? 75 : 70,
    }),
  });
}

/** Vector layer over data/all.json with the default volcano marker style. */
export function createVolcanoLayer() {
  return new VectorLayer({
    zIndex: 1000,
    source: new Vector({
      url: VOLCANO_DATA_URL,
      format: new GeoJSON(),
    }),
    style: volcanoFeatureStyle(false),
  });
}
