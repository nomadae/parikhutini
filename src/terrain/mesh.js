/**
 * Terrain engine: GeoTIFF DEM loading and Three.js mesh building.
 * Shared by pages/terrain (was inline in scene4.html).
 */
import * as THREE from 'three';
import * as GeoTIFF from 'geotiff';

/**
 * Fetch a GeoTIFF and return normalized (0..1) elevation data.
 * NoData cells and flat rasters normalize to 0.
 */
export async function loadTIFF(fileUrl) {
  const response = await fetch(fileUrl);
  const arrayBuffer = await response.arrayBuffer();
  const tiff = await GeoTIFF.fromArrayBuffer(arrayBuffer);
  const image = await tiff.getImage();

  const width = image.getWidth();
  const height = image.getHeight();
  const data = await image.readRasters();
  const rawNoData = image.getGDALNoData();
  const nodata = rawNoData === null || rawNoData === undefined ? null : Number(rawNoData);

  // min/max for normalization, ignoring NoData cells
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < data[0].length; i++) {
    const val = data[0][i];
    if (nodata !== null && val === nodata) continue;
    if (val < min) min = val;
    if (val > max) max = val;
  }
  const range = max - min;

  const normalizedData = new Float32Array(data[0].length);
  for (let i = 0; i < data[0].length; i++) {
    const val = data[0][i];
    normalizedData[i] = (nodata !== null && val === nodata) || range === 0 ? 0 : (val - min) / range;
  }

  console.log(`Loaded TIFF: ${width}x${height}, Elevation range: ${min} to ${max}`);

  return { width, height, data: normalizedData, minElevation: min, maxElevation: max };
}

/**
 * Build a colored terrain mesh from normalized elevation data.
 * @param {Float32Array} elevationData normalized 0..1 values
 * @param {number} width raster width (px)
 * @param {number} height raster height (px)
 * @param {{scale?:number, zScale?:number, wireframe?:boolean}} options
 */
export function createTerrainMesh(elevationData, width, height, options = {}) {
  const { scale = 1, zScale = 1, wireframe = false } = options;

  const geometry = new THREE.BufferGeometry();
  const vertices = [];
  const indices = [];
  const colors = [];

  // Vertices + colors based on elevation
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      const elevation = elevationData[idx];
      const z = elevation * 3000 * zScale; // height exaggeration

      vertices.push(x * scale, y * scale, z);

      let color;
      if (elevation < 0.2) color = new THREE.Color(0, 0, 0.5); // deep water
      else if (elevation < 0.3) color = new THREE.Color(0, 0, 1); // shallow water
      else if (elevation < 0.4) color = new THREE.Color(0.8, 0.8, 0.2); // sand
      else if (elevation < 0.6) color = new THREE.Color(0, 0.5, 0); // grass
      else if (elevation < 0.8) color = new THREE.Color(0.3, 0.2, 0.1); // mountain
      else color = new THREE.Color(1, 1, 1); // snow
      colors.push(color.r, color.g, color.b);
    }
  }

  // Faces (two triangles per cell)
  for (let y = 0; y < height - 1; y++) {
    for (let x = 0; x < width - 1; x++) {
      const a = y * width + x;
      const b = y * width + x + 1;
      const c = (y + 1) * width + x;
      const d = (y + 1) * width + x + 1;
      indices.push(a, b, c);
      indices.push(b, d, c);
    }
  }

  geometry.setIndex(indices);
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();

  const material = new THREE.MeshPhongMaterial({
    vertexColors: true,
    wireframe,
    flatShading: false,
    side: THREE.DoubleSide,
  });

  return new THREE.Mesh(geometry, material);
}
