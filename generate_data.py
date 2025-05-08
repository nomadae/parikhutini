from dbfread import DBF

table = table = DBF('./ce/ce_ccl.dbf', load=True, encoding="utf-8")
print(table.records[0])