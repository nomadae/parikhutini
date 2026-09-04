/**
 * Sidebar: volcanoes grouped by municipio (Bootstrap collapse list).
 * Reads features once the vector source is ready, then builds the DOM.
 */
export function buildMunicipalitySidebar(map, layer) {
  const collapseMuns = document.getElementById('lista-municipios');
  const vectorSource = layer.getSource();

  // Resolve only when the source finished loading its GeoJSON features.
  function sourceReady(source) {
    return new Promise((resolve) => {
      if (source.getState() === 'ready') return resolve();
      source.on('change', () => {
        if (source.getState() === 'ready') resolve();
      });
    });
  }

  return sourceReady(vectorSource).then(() => {
    const features = vectorSource.getFeatures();

    const mun_volcanoe_list = {};
    for (const feature of features) {
      const mun = feature.values_.municipio;
      const volcanoName = feature.values_.nombre;
      const layerIndex = feature.values_.index;
      const coord = feature.getGeometry().getCoordinates();
      if (volcanoName && mun) {
        mun_volcanoe_list[mun] +=
          volcanoName + '#' + layerIndex + '#' + `${coord[0]}&${coord[1]}` + ',';
      }
    }

    // Normalize entries: strip the trailing comma, then drop an "undefined"
    // artifact when a municipality only has anonymous features.
    const orderedVolcanoesByMunName = {};
    Object.keys(mun_volcanoe_list)
      .sort()
      .forEach((mun) => {
        orderedVolcanoesByMunName[mun] = mun_volcanoe_list[mun]
          .replace('undefined', '')
          .slice(0, -1)
          .trim()
          .split(',');
      });

    Object.keys(orderedVolcanoesByMunName).forEach((mun, i) => {
      const volcanoes = orderedVolcanoesByMunName[mun];

      const collapseListGroup = document.createElement('button');
      collapseListGroup.innerHTML = mun;
      collapseListGroup.setAttribute('class', 'list-group-item list-group-item-dark list-group-item-action');
      collapseListGroup.setAttribute('data-bs-toggle', 'collapse');
      collapseListGroup.setAttribute('role', 'button');
      collapseListGroup.setAttribute('data-bs-target', `#munCollapse_${i}`);
      collapseListGroup.setAttribute('aria-expanded', 'false');
      collapseListGroup.setAttribute('aria-controls', `#munCollapse_${i}`);

      const collapseContent = document.createElement('div');
      collapseContent.setAttribute('class', 'collapse');
      collapseContent.setAttribute('id', `munCollapse_${i}`);
      collapseContent.setAttribute('data-bs-parent', '#lista-municipios');

      volcanoes.forEach((volcanoe) => {
        const vbtn = document.createElement('button');
        vbtn.setAttribute('type', 'button');
        vbtn.setAttribute('class', 'btn');
        vbtn.style.padding = '0';

        const [mun, layerIndex, coords] = volcanoe.split('#');
        const coordsArray = coords.split('&').map(Number);

        vbtn.setAttribute('data-layer-index', layerIndex);
        vbtn.onclick = () => {
          map.getView().setCenter(coordsArray);
          map.getView().setZoom(14);
        };

        const volcanoNameSpan = document.createElement('span');
        volcanoNameSpan.innerHTML = mun;
        volcanoNameSpan.setAttribute('class', 'badge rounded-pill text-bg-secondary');
        vbtn.appendChild(volcanoNameSpan);
        collapseContent.appendChild(vbtn);
      });

      collapseMuns.appendChild(collapseListGroup);
      collapseMuns.appendChild(collapseContent);
    });
  });
}
