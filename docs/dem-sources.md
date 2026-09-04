# DEM rasters — inventory & provenance

Digital Elevation Models (MDE in Spanish) used by the 3D terrain viewer
(`pages/terrain`) and the DEM inspector (`pages/dem-inspector`).

## Location & status

Rasters live under `data/mde/` and are **gitignored** (see
`docs/deploy-and-serve-dems.md`). They exist only on local machines unless a
deployment strategy is set up.

| Viewer slug | Name | File | Notes |
| --- | --- | --- | --- |
| `tancitaro` | Tancítaro | `data/mde/tancitaro_mde.tif` | strips, Float32, NoData -9999 (0 px) |
| `ixta` | Iztaccíhuatl | `data/mde/ixta/mde_ixta14.tif` | tiled, Int16, NoData -32768 |
| `nt` | Nevado de Toluca | `data/mde/nt/mde_nt.tif` | tiled 128×128, Int16, NoData -32768 (228 982 px) |
| `orizaba` | Pico de Orizaba | `data/mde/PicodeOrizaba/mde_po14.tif` | tiled, Int16 |
| `popo` | Popocatépetl | `data/mde/Popocatepetl/mde_popoca14.tif` | tiled, Int16 |

Reference statistics (from `gdalinfo`):

- `tancitaro_mde.tif`: min 1694.7788, max 3844.9553, mean 2669.407, std 417.482
- `mde_nt.tif`: min 1918, max 4646, mean 2990.155, std 425.629

## Provenance

The DEMs are elevation models of Mexican volcanoes (INEGI-style MDE sources)
collected for the Parhikutini project. Record the exact source/date/license of
each file here when you add a new raster — required before any public
deployment.

## Adding a new DEM

1. Place the GeoTIFF under `data/mde/<slug>/<file>.tif`.
2. Register it in `src/terrain/demCatalog.js` (name, slug, path) so it appears
   in the viewer selector and via `?mde=<slug>`.
3. Optionally update the reference stats above and add a gdalinfo check to
   `tests/tiff-decode.test.mjs`.
