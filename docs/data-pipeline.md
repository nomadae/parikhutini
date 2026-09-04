# Data pipeline

The web portal loads volcano features from `data/all.json` (GeoJSON, EPSG:3857).
That file is a **generated artifact** — do not edit it by hand; regenerate it
with the Python tooling instead.

## Inputs

- `data/source/michoacan/ce_epsg3857.*` — volcano catalog (shapefile + DBF,
  EPSG:3857). Columns: `Nombre`, `LONGI`, `Latit`, `x_1`, `y_1`, `wco`, `wcr`,
  `hco`, `vol`, `h_o`, `observacio`.
- `data/source/michoacan/16_MICH_MUNICIPIOS.*` — Michoacán municipality
  polygons (used to assign each volcano a `municipio`).

## Regenerating `data/all.json`

```bash
python3 -m venv .venv            # or reuse the existing venv/
source .venv/bin/activate
python -m pip install -r tools/requirements.txt
python tools/data_pipeline/generate_all_json.py
```

What the script does:

1. Reads the volcano DBF (`dbfread`) into a `pandas` DataFrame, keeps only rows
   with a non-zero longitude and builds a GeoDataFrame in EPSG:3857.
2. Overlays the municipality polygons and, for each volcano contained in a
   polygon, records `municipio = NOM_MUN`.
3. Writes the joined result to `data/all.json` (index column `index` becomes
   the feature `index` property used by the portal).

## Conventions

- Keep the committed copy of `data/all.json` in sync whenever the source
  shapefiles change.
- Municipality names in `data/all.json` are single-encoded UTF-8 (see
  history: double-encoded names were repaired in
  `fix: repair double-encoded municipality names in all.json`).
