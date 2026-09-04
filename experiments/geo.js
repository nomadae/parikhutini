import * as THREE from 'three';
import * as GeoTIFF from 'geotiff';


async function loadTIFF(fileUrl) {
  const response = await fetch(fileUrl);
  const arrayBuffer = await response.arrayBuffer();
  const tiff = await GeoTIFF.fromArrayBuffer(arrayBuffer);
  const image = await tiff.getImage();
  const width = image.getWidth();
  const height = image.getHeight();
  const data = await image.readRasters();
  
  return { width, height, data: data[0] }; // data[0] contiene los valores de elevación
}

function createTerrainMesh(elevationData, width, height, options = {}) {
  const { scale = 1, zScale = 1 } = options;
  
  const geometry = new THREE.BufferGeometry();
  const vertices = [];
  const indices = [];
  
  // Crear vértices
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      const z = elevationData[idx] * zScale;
      vertices.push(x * scale, y * scale, z);
    }
  }
  
  // Crear índices para caras
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
  
  // Calcular normales para iluminación adecuada
  geometry.computeVertexNormals();
  
  return geometry;
}

async function init() {
  // Escena Three.js
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.body.appendChild(renderer.domElement);
  
  // Luz
  const light = new THREE.DirectionalLight(0xffffff, 1);
  light.position.set(1, 1, 1);
  scene.add(light);
  scene.add(new THREE.AmbientLight(0x404040));
  
  // Cargar datos TIFF
  const { width, height, data } = await loadTIFF('./data/mde/tancitaro_mde.tif');
  
  // Crear terreno
  const geometry = createTerrainMesh(data, width, height, {
    scale: 0.1,  // Escala en X/Y
    zScale: 0.01 // Escala en Z (altura)
  });
  
  const material = new THREE.MeshPhongMaterial({
    color: 0x00ff00,
    wireframe: false,
    flatShading: false,
    side: THREE.DoubleSide
  });
  
  const terrain = new THREE.Mesh(geometry, material);
  scene.add(terrain);
  
  // Posicionar cámara
  camera.position.set(width * 0.05, height * 0.05, 50);
  camera.lookAt(width * 0.05 * 0.5, height * 0.05 * 0.5, 0);
  
  // Animación
  function animate() {
    requestAnimationFrame(animate);
    renderer.render(scene, camera);
  }
  animate();
}

// Manejar redimensionamiento
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

init();