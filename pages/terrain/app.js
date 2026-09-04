/**
 * 3D terrain viewer (pages/terrain).
 * Scene/renderer wiring + controls over the shared engine in src/terrain.
 * DEM catalog and mesh building live in src/terrain (see demCatalog.js).
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

import { DEMS, resolveInitialDem } from '../../src/terrain/demCatalog.js';
import { createTerrainMesh, loadTIFF } from '../../src/terrain/mesh.js';

// Preselectable DEM via ?mde=<slug|name>
const mdeParam = new URLSearchParams(location.search).get('mde') || '';
const initialDem = resolveInitialDem(mdeParam);

// Scene
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb); // sky blue

// Camera
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 10000);
camera.position.z = 500;

// Renderer
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);

// Controls
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;

// Lighting
const ambientLight = new THREE.AmbientLight(0x404040);
scene.add(ambientLight);
const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
directionalLight.position.set(1, 1, 1);
directionalLight.castShadow = true;
scene.add(directionalLight);
scene.add(new THREE.AxesHelper(50));

// DEM selector
const demSelect = document.getElementById('demSelect');
DEMS.forEach((dem) => {
  const option = document.createElement('option');
  option.value = dem.path;
  option.textContent = dem.name;
  demSelect.appendChild(option);
});
demSelect.value = initialDem.path;

const loading = document.getElementById('loading');
let terrain = null;
let data = null;
let width = 0;
let height = 0;
let zScale = 0.01;
let loadToken = 0;

function showLoadError(error) {
  loading.style.display = 'block';
  loading.textContent = `Error loading TIFF: ${error.message}`;
  console.error(error);
}

async function loadDEM(tiffUrl) {
  const token = ++loadToken;
  loading.style.display = 'block';
  loading.textContent = `Loading ${tiffUrl} ...`;
  try {
    const loaded = await loadTIFF(tiffUrl);
    if (token !== loadToken) return;
    data = loaded.data;
    width = loaded.width;
    height = loaded.height;

    const mesh = createTerrainMesh(data, width, height, { scale: 1, zScale, wireframe: wireframe.checked });
    if (token !== loadToken) return;

    if (terrain) scene.remove(terrain);
    terrain = mesh;
    scene.add(terrain);

    loading.style.display = 'none';

    const centerX = width / 2;
    const centerY = height / 2;
    camera.position.set(centerX, centerY, Math.max(width, height));
    controls.target.set(centerX, centerY, 0);
  } catch (error) {
    if (token === loadToken) showLoadError(error);
  }
}

demSelect.addEventListener('change', function () {
  loadDEM(this.value);
});

const heightScale = document.getElementById('heightScale');
heightScale.addEventListener('input', function (e) {
  zScale = parseFloat(e.target.value);
  if (!terrain) return;
  scene.remove(terrain);
  terrain = createTerrainMesh(data, width, height, { scale: 1, zScale, wireframe: wireframe.checked });
  scene.add(terrain);
});

const wireframe = document.getElementById('wireframe');
wireframe.addEventListener('change', function (e) {
  if (terrain) terrain.material.wireframe = e.target.checked;
});

loadDEM(initialDem.path);

// Animation loop
function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}
animate();

// Handle window resize
window.addEventListener('resize', function () {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
