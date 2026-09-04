/**
 * DEM catalog shared by the terrain viewer.
 * Paths are origin-relative (/data/...) so they resolve the same from the
 * portal root and from pages/terrain (see docs/deploy-and-serve-dems.md).
 */
export const DEMS = [
  { name: 'Tancítaro', slug: 'tancitaro', path: '/data/mde/tancitaro_mde.tif' },
  { name: 'Iztaccíhuatl', slug: 'ixta', path: '/data/mde/ixta/mde_ixta14.tif' },
  { name: 'Nevado de Toluca', slug: 'nt', path: '/data/mde/nt/mde_nt.tif' },
  { name: 'Pico de Orizaba', slug: 'orizaba', path: '/data/mde/PicodeOrizaba/mde_po14.tif' },
  { name: 'Popocatépetl', slug: 'popo', path: '/data/mde/Popocatepetl/mde_popoca14.tif' },
];

export const stripDiacritics = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

/** Resolve a ?mde=<slug|name> parameter (diacritics/case-insensitive). */
export function resolveInitialDem(query = '') {
  const q = stripDiacritics(String(query)).toLowerCase();
  return (
    DEMS.find((d) => d.slug === q || stripDiacritics(d.name).toLowerCase() === q) || DEMS[0]
  );
}
