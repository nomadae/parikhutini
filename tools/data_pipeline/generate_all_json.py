#!/usr/bin/env python3
"""Generate data/all.json (GeoJSON, EPSG:3857) for the Parhikutini portal.

Merges the volcano catalog (DBF) with Michoacán municipality polygons so each
volcano feature carries a `municipio` attribute, then writes the joined
GeoDataFrame to <repo>/data/all.json.

Usage (from anywhere):
    python tools/data_pipeline/generate_all_json.py
"""
from collections import defaultdict
from pathlib import Path

import pandas as pd
import geopandas
from dbfread import DBF

ROOT = Path(__file__).resolve().parents[2]
CATALOG = ROOT / "data" / "source" / "michoacan" / "ce_epsg3857.dbf"
MUNICIPIOS = ROOT / "data" / "source" / "michoacan" / "16_MICH_MUNICIPIOS.shp"
OUTPUT = ROOT / "data" / "all.json"

dbf = DBF(str(CATALOG), load=True, encoding="utf-8")
df = pd.DataFrame(iter(dbf))
df_localized = df[df["LONGI"] != 0]

df_geo = df_localized[
    ["Nombre", "LONGI", "Latit", "observacio", "x_1", "y_1", "wco", "wcr", "hco", "vol", "h_o"]
].rename(
    columns={
        "Nombre": "nombre",
        "LONGI": "longitud",
        "Latit": "latitud",
        "observacio": "obs",
        "x_1": "x",
        "y_1": "y",
    }
)

volcanes_gdf = geopandas.GeoDataFrame(
    df_geo,
    geometry=geopandas.points_from_xy(df_geo.x, df_geo.y),
    crs="EPSG:3857",
)

municipios_gdf = geopandas.read_file(MUNICIPIOS)
municipios_gdf_reproj = municipios_gdf.to_crs("EPSG:3857")

# Assign each volcano to the municipality polygon that contains it.
volcan_municipio = {}
for i in range(len(municipios_gdf_reproj)):
    mun = municipios_gdf_reproj.iloc[i]
    for j in range(len(volcanes_gdf)):
        v = volcanes_gdf.iloc[j]
        if mun.geometry.contains(v.geometry):
            volcan_municipio[v.nombre] = mun.NOM_MUN

nd = defaultdict(list)
for i in range(len(volcanes_gdf)):
    v = volcanes_gdf.iloc[i]
    try:
        mun = volcan_municipio[v.nombre]
        nd["nombre"].append(v.nombre)
        nd["wco"].append(v.wco)
        nd["wcr"].append(v.wcr)
        nd["hco"].append(v.hco)
        nd["vol"].append(v.vol)
        nd["h_o"].append(v.h_o)
        nd["municipio"].append(mun)
        nd["geometry"].append(v.geometry)
    except KeyError:
        continue

gdf = geopandas.GeoDataFrame(nd, crs="EPSG:3857")
gdf.to_file(OUTPUT, driver="GeoJSON", index=True)
print(f"wrote {len(gdf)} features -> {OUTPUT}")
