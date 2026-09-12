# Parhikutini — Mapa Interactivo de Volcanes (Michoacán, México)

Interactive web mapping project for volcanic landforms in Michoacán, centered
on Volcán Paricutín ("Parhikutini" in Purépecha). Built with **OpenLayers**,
**Three.js**, **geotiff.js** and **Vite**, with a Python (GeoPandas) data
pipeline.

## Pages

| URL | What it is |
| --- | --- |
| `/` | Portal map (OpenLayers over a MapTiler basemap). Volcano features from `data/all.json`, grouped by *municipio* in a sidebar; click for popup, hover for tooltip. |
| `/pages/terrain/` | 3D terrain viewer (Three.js) over local DEM rasters. Select a DEM in the UI or preselect with `?mde=<slug>` (`tancitaro`, `ixta`, `nt`, `orizaba`, `popo`). |
| `/pages/dem-inspector/` | DEM/TIFF inspector: load any local GeoTIFF, render elevation, statistics, elevation profile, slope/aspect analysis. |

## Quick start (web)

```bash
npm install
cp .env.example .env && chmod 600 .env   # add your MapTiler key (VITE_MAPTILER_KEY)
npm start                   # http://localhost:5173
```

Build for production:

```bash
npm run build               # bundle + copy small runtime data (no rasters/sources)
npm run build:local         # bundle + also copy data/mde/ for a local preview
npm run serve               # preview the dist output
```

**Note:** the 3D terrain viewer needs DEM rasters under `data/mde/`, which are
gitignored. `npm run build:local` includes them in `dist/`; the production
`npm run build` does not. See `docs/deploy-and-serve-dems.md` for the serving
strategy.

## Tests

```bash
npm test                    # unit (decode engine) + browser E2E
npm run test:unit           # node-only TIFF decode checks (gdalinfo reference values);
                            # validation guards always run, raster checks skip if
                            # data/mde/ is absent (e.g. in CI)
npm run test:e2e            # Brave-headless E2E of the DEM inspector (needs
                            # /opt/brave.com/brave/brave-browser and data/mde/nt/mde_nt.tif)
```

## Security

- **Never commit `VITE_MAPTILER_KEY`.** It is injected at build time and is
  necessarily visible in the shipped bundle, so it must be restricted to your
  origins in the MapTiler dashboard. See `docs/maptiler-key-security.md`.
- All scripts, styles and fonts are self-hosted; `public/_headers` carries the
  Content-Security-Policy and the other security headers, with per-host
  instructions in `docs/security-headers.md`.
- Production builds omit source maps (`vite.config.mjs`) and fail if the
  MapTiler key is missing.
- CI (`.github/workflows/`) runs `npm audit`, the unit tests and a gitleaks
  secret scan; Dependabot keeps npm and Actions dependencies current.

## Data pipeline (Python)

`data/all.json` is generated from the GIS sources in `data/source/michoacan/`:

```bash
python3 -m venv .venv && source .venv/bin/activate
python -m pip install -r tools/requirements.txt
python tools/data_pipeline/generate_all_json.py
```

See `docs/data-pipeline.md` for details.

## Repository layout

```text
index.html                  portal entry (map)
vite.config.mjs             Vite config (multi-page build)
src/
  main.js                   portal bootstrap
  style.css
  map/                      OpenLayers modules (volcano layer, sidebar)
  terrain/                  Three.js engine + DEM catalog (shared)
  tiff/                     TIFF decode engine + vendored UTIF.js (shared page/tests)
  img/                      icons and images
pages/
  terrain/index.html        3D DEM viewer
  dem-inspector/index.html  DEM inspector
tests/                      unit + browser E2E tests
tools/                      Python data pipeline
data/                       committed small datasets + local (gitignored) rasters
public/_headers             CSP / security headers for the deployed site
docs/                       data pipeline, DEM sources, deploy, key & header security
experiments/                archived prototypes (Three.js scenes, heightmap utils)
```

## Data

- `data/all.json` — generated volcano GeoJSON (EPSG:3857).
- `data/source/michoacan/` — raw GIS inputs (volcano catalog, municipality polygons).
- `data/mde/` — **gitignored** DEM rasters, kept local.

See `docs/dem-sources.md` for the raster inventory.
