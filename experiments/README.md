# Experiments (archived)

Prototypes and one-off tooling from earlier iterations. Kept for reference;
**not** part of the maintained app (not built, not tested).

| File | What it was |
| --- | --- |
| `scene.html` + `tjs.js` | First Three.js heightmap model (loads `data/heightmap.json`, regenerable via `heightmap.py`) |
| `scene2.html` | Three.js mountain demo (CDN modules) |
| `scene3.html` | Volcano-with-lava Three.js demo (CDN modules) |
| `geo.js` | Early GeoTIFF → Three.js terrain mesh helper (superseded by `src/terrain/`) |
| `heightmap.py` + `heightmap_to_json.py` | GDAL DEM → heightmap conversion experiments (superseded by the in-browser tooling) |

Notes:

- The CDN-based demos (`scene2`, `scene3`) need network access for their
  import maps; run them through the Vite dev server (`npm start`) at
  `/experiments/...`.
- `heightmap.py` writes `volcano_heightmap.npy/.png` and `data/heightmap.json`
  (gitignored) relative to the repo root when run from there.
