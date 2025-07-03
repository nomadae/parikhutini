from collections import defaultdict

from dbfread import DBF
import pandas as pd
import geopandas
import matplotlib.pyplot as plt
# import matplotlib
# matplotlib.use('qt5agg')
# %matplotlib inline

dbf = DBF('./data/ce/ce_epsg3857.dbf', load=True, encoding="utf-8")
df = pd.DataFrame(iter(dbf))
df_localized = df[df['LONGI']!=0]
# df_localized = df_localized[df_localized["Nombre"].str.startswith('V.')]

df_geo = df_localized[['Nombre', 'LONGI', 'Latit', 'observacio', 'x_1', 'y_1', 'wco', 'wcr', 'hco', 'vol', 'h_o']]

df_geo = df_geo.rename(columns={'Nombre':'nombre', 'LONGI': 'longitud', 'Latit':'latitud', 'observacio': 'obs', 'x_1': 'x', 'y_1': 'y'})

volcanes_gdf = geopandas.GeoDataFrame(
    df_geo,
    geometry=geopandas.points_from_xy(df_geo.x, df_geo.y),
    crs="EPSG:3857",
    # crs="EPSG:3347"
)


# print(volcanes_gdf.head())

# volcanes_gdf.plot()
# plt.show()

municipios_gdf = geopandas.read_file("./data/ce/16_MICH_MUNICIPIOS.shp")
municipios_gdf_reproj = municipios_gdf.to_crs("EPSG:3857")

# volcanes = geopandas.read_file("./data/ce/ce_epsg3857.shp")


volcan_municipio = {}

for i in range(len(municipios_gdf_reproj)):
    mun = municipios_gdf_reproj.iloc[i]
    for j in range(len(volcanes_gdf)):
        v = volcanes_gdf.iloc[j]
        if mun.geometry.contains(v.geometry):
            volcan_municipio[v.nombre] = mun.NOM_MUN
        # if(j == 1): break

    # if (i == 1): break

nd = defaultdict(list)

for i in range(len(volcanes_gdf)):
    v = volcanes_gdf.iloc[i]
    try:
        mun = volcan_municipio[v.nombre]
        nd['nombre'].append(v.nombre)
        nd['wco'].append(v.wco)
        nd['wcr'].append(v.wcr)
        nd['hco'].append(v.hco)
        nd['vol'].append(v.vol)
        nd['h_o'].append(v.h_o)
        nd['municipio'].append(mun)
        nd['geometry'].append(v.geometry)

    except(KeyError):
        continue

gdf = geopandas.GeoDataFrame(nd, crs="EPSG:3857")


# print(len(volcanes) == len(volcan_municipio))
# gdf = gdf.to_crs(epsg=3857)

gdf.to_file('./data/all.json', driver="GeoJSON", index=True)

# df_volcanoes = df[df['Nombre'].str.contains('V')]

# json_string = df_volcanoes["Nombre"].to_json()
