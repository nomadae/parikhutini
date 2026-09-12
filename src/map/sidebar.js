/**
 * Sidebar: volcanoes grouped by municipio (Bootstrap collapse list).
 * Reads features once the vector source is ready, then builds the DOM.
 * @param {import('ol/Map').default} map
 * @param {import('ol/layer/Vector').default} layer
 * @param {{ onSelectVolcano?: () => void }} [options] called after a volcano
 *   is chosen (used by the portal to close the mobile drawer).
 */
export function buildMunicipalitySidebar(map, layer, options = {}) {
  const { onSelectVolcano } = options;
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
    // Group features by municipio, dropping anonymous / unplaced entries.
    // A Map (not a plain object) keeps untrusted attribute values such as
    // "__proto__" from colliding with Object.prototype.
    const byMunicipio = new Map();
    for (const feature of vectorSource.getFeatures()) {
      const props = feature.values_ || {};
      if (!props.nombre || !props.municipio) continue;
      const municipio = String(props.municipio);
      if (!byMunicipio.has(municipio)) byMunicipio.set(municipio, []);
      const coords = feature.getGeometry().getCoordinates();
      byMunicipio.get(municipio).push({ nombre: props.nombre, coords });
    }

    const municipios = [...byMunicipio.keys()].sort();
    let activeBadge = null;

    municipios.forEach((municipio, i) => {
      const volcanoes = byMunicipio.get(municipio).sort((a, b) =>
        a.nombre.localeCompare(b.nombre, 'es')
      );

      // Municipality header (collapse trigger) with a volcano count badge.
      const header = document.createElement('button');
      header.type = 'button';
      header.className = 'list-group-item list-group-item-dark list-group-item-action';
      header.setAttribute('data-bs-toggle', 'collapse');
      header.setAttribute('data-bs-target', `#munCollapse_${i}`);
      header.setAttribute('aria-expanded', 'false');
      header.setAttribute('aria-controls', `munCollapse_${i}`);

      const nameSpan = document.createElement('span');
      nameSpan.textContent = municipio;

      const countBadge = document.createElement('span');
      countBadge.className = 'muni-count';
      countBadge.textContent = volcanoes.length;

      header.append(nameSpan, countBadge);

      // Collapsible list of volcanoes for this municipality.
      const collapseContent = document.createElement('div');
      collapseContent.className = 'collapse';
      collapseContent.id = `munCollapse_${i}`;
      collapseContent.setAttribute('data-bs-parent', '#lista-municipios');

      volcanoes.forEach((volcano) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn';

        const badge = document.createElement('span');
        badge.className = 'badge rounded-pill bg-secondary';
        badge.textContent = volcano.nombre;
        badge.title = volcano.nombre;

        btn.onclick = () => {
          // Keep the highlight on the last clicked volcano only.
          if (activeBadge && activeBadge !== badge) {
            activeBadge.className = 'badge rounded-pill bg-secondary';
          }
          badge.className = 'badge rounded-pill bg-primary';
          activeBadge = badge;

          // Center the map at the selected volcano coordinates.
          if (volcano.coords) {
            map.getView().setCenter(volcano.coords);
            map.getView().setZoom(14);
          }

          if (onSelectVolcano) onSelectVolcano();
        };

        btn.appendChild(badge);
        collapseContent.appendChild(btn);
      });

      collapseMuns.append(header, collapseContent);
    });
  });
}
