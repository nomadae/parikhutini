from dbfread import DBF
import pandas as pd


dbf = DBF('./data/ce/ce_ccl.dbf', load=True, encoding="utf-8")
df = pd.DataFrame(iter(dbf))
df_localized = df[df['LONGI']!=0]
df_volcanoes = df[df['Nombre'].str.contains('V')]

json_string = df_volcanoes["Nombre"].to_json()
