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

df_geo = df_localized[['Nombre', 'LONGI', 'Latit', 'observacio', 'x_1', 'y_1']]

df_geo = df_geo.rename(columns={'Nombre':'nombre', 'LONGI': 'longitud', 'Latit':'latitud', 'observacio': 'obs', 'x_1': 'x', 'y_1': 'y'})

gdf = geopandas.GeoDataFrame(
    df_geo,
    geometry=geopandas.points_from_xy(df_geo.x, df_geo.y),
    crs="EPSG:3857",
    # crs="EPSG:3347"
)


print(gdf.head())

gdf.plot()
plt.show()

# gdf = gdf.to_crs(epsg=3857)

gdf.to_file('./data/all.json', driver="GeoJSON", index=True)

# df_volcanoes = df[df['Nombre'].str.contains('V')]

# json_string = df_volcanoes["Nombre"].to_json()
