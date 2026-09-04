# Tools (Python)

Python side of the project: data preparation for the web apps.

| Path | Purpose |
| --- | --- |
| `data_pipeline/generate_all_json.py` | Build `data/all.json` from `data/source/michoacan/` GIS inputs |
| `requirements.txt` | Pinned dependencies (GeoPandas stack) |

## Setup

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r tools/requirements.txt
```

## Running the pipeline

```bash
python tools/data_pipeline/generate_all_json.py
```

Reads `data/source/michoacan/` (volcano catalog DBF + municipality polygons),
overlays them and writes `data/all.json`. See `docs/data-pipeline.md`.

Archived/experimental Python scripts live in `experiments/`.
