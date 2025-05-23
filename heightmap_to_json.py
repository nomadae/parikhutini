import json
import heightmap


json.dump(heightmap.heightmap.tolist(), open("./data/heightmap.json", "w"))