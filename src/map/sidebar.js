/**
 * Sidebar: volcanoes grouped by municipio (Bootstrap collapse list).
 * Reads features once the vector source is ready, then builds the DOM.
 */
export function buildMunicipalitySidebar(map, layer) {
  const collapseMuns = document.getElementById('lista-municipios');
  const vectorSource = layer.getSource();

  // Resolve when the source has actually loaded its GeoJSON features.
  // NOTE: getState() can already be 'ready' before the first fetch completes,
  // so we wait for features to exist or for the source's load events.
  function sourceReady(source) {
    return new Promise((resolve) => {
      if (source.getFeatures().length > 0) return resolve();
      const onLoad = () => {
        cleanup();
        resolve();
      };
      const cleanup = () => {
        source.un('featuresloadend', onLoad);
        source.un('featuresloaderror', onLoad);
      };
      source.on('featuresloadend', onLoad);
      source.on('featuresloaderror', onLoad); // resolve anyway (empty list)
      // Safety net: never leave the sidebar pending forever.
      setTimeout(() => {
        cleanup();
        resolve();
      }, 15000);
    });
  }

  return sourceReady(vectorSource).then(() => {
    const features = vectorSource.getFeatures();

    const mun_volcanoe_list = {};
    let activeVolcanoSpan = null;
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

        // NOTE: the first token of the encoded entry is the volcano NAME
        // (the municipality only names the containing group).
        const [, layerIndex, coords] = volcanoe.split('#');
        const coordsArray = coords.split('&').map(Number);

        const volcanoNameSpan = document.createElement('span');
        volcanoNameSpan.innerHTML = volcanoe.split('#')[0];
        volcanoNameSpan.setAttribute('class', 'badge rounded-pill bg-secondary');

        vbtn.setAttribute('data-layer-index', layerIndex);
        vbtn.onclick = () => {
          // Keep the highlight on the last clicked volcano only.
          if (activeVolcanoSpan && activeVolcanoSpan !== volcanoNameSpan) {
            activeVolcanoSpan.setAttribute('class', 'badge rounded-pill bg-secondary');
          }
          volcanoNameSpan.setAttribute('class', 'badge rounded-pill bg-primary');
          activeVolcanoSpan = volcanoNameSpan;

          // Center the map at the selected volcano coordinates.
          map.getView().setCenter(coordsArray);
          map.getView().setZoom(14);
        };

        vbtn.appendChild(volcanoNameSpan);
        collapseContent.appendChild(vbtn);
      });

      collapseMuns.appendChild(collapseListGroup);
      collapseMuns.appendChild(collapseContent);
    });
  });
}
