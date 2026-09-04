# Serving DEM rasters at deploy time (strategy — draft)

## Problem

`data/mde/` contains large GeoTIFF rasters (~35 MB). They are **not** committed
to git (`data/mde/` is gitignored) and only exist on local machines. The web
apps fetch them over HTTP:

- `src/terrain/demCatalog.js` → `/data/mde/<slug>.tif` (terrain viewer)
- DEM inspector: user picks a local file — no server data needed

For a deployed app these URLs must resolve to real files.

## Current behaviour (local)

- `npm start` (Vite dev): serves `data/mde/...` straight from the repo.
- `npm run build`: Vite bundles the app, then `scripts/copy-static.mjs` copies
  `data/` into `dist/data/`, so the built site also works locally.

## Options (choose when deploying)

1. **Static/CDN hosting mounted at `/data/mde/`** — upload the rasters to the
   same origin (or a CDN with a rewrite rule) so existing absolute URLs work
   with zero code change. Simplest.
2. **COG + HTTP range requests** — store as Cloud Optimized GeoTIFFs behind a
   range-request-capable object store; `geotiff.js` already fetches only the
   needed tiles/overviews. Best for large or many rasters; requires a real
   backend.
3. **Signed URLs / DEM API** — keep rasters private; the app resolves a URL per
   DEM through an endpoint. Most control, most work.

## Open questions / TODOs

- [ ] Decide origin layout (same-origin path vs CDN subdomain vs API).
- [ ] If option 1, exclude `data/mde` from the copied `dist` in production and
      publish only small data (`data/all.json`, `data/source/...`) to the site.
- [ ] Add license/provenance metadata (`docs/dem-sources.md`) before publishing
      any raster.
- [ ] If the site is hosted under a sub-path (e.g. GitHub Pages project site),
      revisit absolute `/data/...` URLs and Vite `base`.
