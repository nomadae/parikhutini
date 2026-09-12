/**
 * 3D terrain viewer (pages/terrain).
 * Scene/renderer wiring + controls over the shared engine in src/terrain.
 * DEM catalog and mesh building live in src/terrain (see demCatalog.js).
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

import { DEMS, resolveInitialDem } from '../../src/terrain/demCatalog.js';
import { createTerrainMesh, loadTIFF } from '../../src/terrain/mesh.js';
import { PALETTES, DEFAULT_PALETTE_ID, getPalette, legendStops } from '../../src/terrain/symbology.js';

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

// Input state tracking
const PAN_SPEED = 1.5;
const ZOOM_SPEED = 3.0;
const ORIENTATION_SPEED = 0.01;
const keysPressed = {};
const visualControlsPressed = {};

window.addEventListener('keydown', (e) => {
  if (e.key.startsWith('Arrow') || ['w', 'a', 's', 'd', 'W', 'A', 'S', 'D', 'q', 'e', 'Q', 'E'].includes(e.key)) {
    keysPressed[e.key] = true;
  }
});
window.addEventListener('keyup', (e) => {
  if (e.key.startsWith('Arrow') || ['w', 'a', 's', 'd', 'W', 'A', 'S', 'D', 'q', 'e', 'Q', 'E'].includes(e.key)) {
    keysPressed[e.key] = false;
  }
});

const visualButtons = {
  'moveNorth': 'up',
  'moveSouth': 'down',
  'moveWest': 'left',
  'moveEast': 'right',
  'zoomIn': 'zoomIn',
  'zoomOut': 'zoomOut'
};

Object.entries(visualButtons).forEach(([id, action]) => {
  const btn = document.getElementById(id);
  if (!btn) return;

  const setPressed = (val) => { visualControlsPressed[action] = val; };
  btn.addEventListener('mousedown', () => setPressed(true));
  btn.addEventListener('mouseup', () => setPressed(false));
  btn.addEventListener('mouseleave', () => setPressed(false));
  btn.addEventListener('touchstart', (e) => { e.preventDefault(); setPressed(true); });
  btn.addEventListener('touchend', () => setPressed(false));
});

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
let terrainPivot = null;
let data = null;
let width = 0;
let height = 0;
let zScale = 0.01;
let minElevation = null;
let maxElevation = null;
let currentPaletteId = DEFAULT_PALETTE_ID;
let loadToken = 0;

// Symbology palette selector (after state init: references currentPaletteId)
const paletteSelect = document.getElementById('paletteSelect');
PALETTES.forEach((palette) => {
  const option = document.createElement('option');
  option.value = palette.id;
  option.textContent = palette.name;
  paletteSelect.appendChild(option);
});
paletteSelect.value = currentPaletteId;
paletteSelect.addEventListener('change', function (e) {
  currentPaletteId = e.target.value;
  if (data) buildTerrain(); // rebuild recolors the mesh with the new ramp
});

function showLoadError(error) {
  loading.style.display = 'block';
  loading.replaceChildren();

  const heading = document.createElement('h2');
  heading.textContent = 'No se pudo cargar el modelo de elevación';

  const explanation = document.createElement('p');
  if (Number.isInteger(error.status)) {
    explanation.textContent =
      `El archivo del MDE no está disponible en este sitio (HTTP ${error.status}). ` +
      'Es probable que los rásteres no se hayan publicado junto con el resto del sitio.';
  } else {
    explanation.textContent =
      `No se pudo leer el archivo del MDE: ${error.message}. ` +
      'Puede ser un problema de red o un formato no compatible.';
  }

  const hint = document.createElement('p');
  hint.textContent =
    'Prueba con otro MDE del selector, o abre el inspector y carga un GeoTIFF de tu equipo.';

  const actions = document.createElement('div');
  actions.className = 'loading-actions';

  const retry = document.createElement('button');
  retry.type = 'button';
  retry.textContent = 'Reintentar';
  retry.addEventListener('click', () => loadDEM(demSelect.value));
  actions.append(retry);

  const inspector = document.createElement('a');
  inspector.href = '../dem-inspector/';
  inspector.textContent = 'Abrir el inspector de MDE';
  actions.append(inspector);

  const back = document.createElement('a');
  back.href = '../../';
  back.textContent = 'Volver al mapa';
  actions.append(back);

  loading.append(heading, explanation, hint, actions);
  console.error(error);
}

/** Attach a rebuilt mesh to the (lazily created) pivot, keeping it centered. */
function addTerrainToScene(mesh) {
  if (!terrainPivot) {
    terrainPivot = new THREE.Group();
    scene.add(terrainPivot);
  }

  if (terrain) terrainPivot.remove(terrain);
  terrain = mesh;
  terrainPivot.add(terrain);

  // Center the mesh within the pivot
  terrain.position.set(-width / 2, -height / 2, 0);
  terrainPivot.position.set(width / 2, height / 2, 0);
}

/** Rebuild the terrain mesh from the current DEM + symbology settings. */
function buildTerrain() {
  if (!data) return;
  const mesh = createTerrainMesh(data, width, height, {
    scale: 1,
    zScale,
    wireframe: wireframe.checked,
    palette: currentPaletteId,
    minElevation,
    maxElevation,
  });
  addTerrainToScene(mesh);
  updateLegend();
}

/** Refresh the on-screen gradient legend for the active palette + DEM range. */
function updateLegend() {
  const legend = document.getElementById('legend');
  const hasDem = Number.isFinite(minElevation) && Number.isFinite(maxElevation);
  legend.classList.toggle('visible', hasDem);
  if (!hasDem) return;

  const palette = getPalette(currentPaletteId);
  document.getElementById('legendTitle').textContent = palette.name;
  document.getElementById('legendMin').textContent =
    `${Math.round(minElevation).toLocaleString('es-MX')} m`;
  document.getElementById('legendMax').textContent =
    `${Math.round(maxElevation).toLocaleString('es-MX')} m`;

  const stops = legendStops(palette, minElevation, maxElevation);
  document.getElementById('legendBar').style.background =
    `linear-gradient(to right, ${stops.map((s) => `${s.color} ${s.pos}%`).join(', ')})`;
}

async function loadDEM(tiffUrl) {
  const token = ++loadToken;
  loading.style.display = 'block';
  loading.textContent = `Cargando ${tiffUrl}…`;
  try {
    const loaded = await loadTIFF(tiffUrl);
    if (token !== loadToken) return;
    data = loaded.data;
    width = loaded.width;
    height = loaded.height;
    minElevation = loaded.minElevation;
    maxElevation = loaded.maxElevation;

    buildTerrain();
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
  if (data) buildTerrain();
});

const wireframe = document.getElementById('wireframe');
wireframe.addEventListener('change', function (e) {
  if (terrain) terrain.material.wireframe = e.target.checked;
});

const lockCamera = document.getElementById('lockCamera');

loadDEM(initialDem.path);

// Animation loop
function animate() {
  requestAnimationFrame(animate);

  // Panning logic (WASD, Arrow keys and Pan D-pad)
  // To mimic Right-Click pan, we must move both the target and the camera
  let panX = 0;
  let panY = 0;

  if (keysPressed['w'] || keysPressed['W'] || keysPressed['ArrowUp'] || visualControlsPressed['up']) {
    panY += PAN_SPEED;
  }
  if (keysPressed['s'] || keysPressed['S'] || keysPressed['ArrowDown'] || visualControlsPressed['down']) {
    panY -= PAN_SPEED;
  }
  if (keysPressed['a'] || keysPressed['A'] || keysPressed['ArrowLeft'] || visualControlsPressed['left']) {
    panX -= PAN_SPEED;
  }
  if (keysPressed['d'] || keysPressed['D'] || keysPressed['ArrowRight'] || visualControlsPressed['right']) {
    panX += PAN_SPEED;
  }

  if (panX !== 0 || panY !== 0) {
    controls.target.x += panX;
    controls.target.y += panY;

    // If camera is NOT locked, move the camera too (slide effect)
    if (!lockCamera.checked) {
      camera.position.x += panX;
      camera.position.y += panY;
    }
  }

  // Terrain Mesh Orientation (Q and E keys)
  if (terrainPivot) {
    if (keysPressed['q'] || keysPressed['Q']) {
      terrainPivot.rotation.z += ORIENTATION_SPEED;
    }
    if (keysPressed['e'] || keysPressed['E']) {
      terrainPivot.rotation.z -= ORIENTATION_SPEED;
    }
  }

  // Zooming logic
  if (visualControlsPressed['zoomIn'] || visualControlsPressed['zoomOut']) {
    const dir = new THREE.Vector3().subVectors(camera.position, controls.target).normalize();
    if (visualControlsPressed['zoomIn']) {
      camera.position.addScaledVector(dir, -ZOOM_SPEED);
    }
    if (visualControlsPressed['zoomOut']) {
      camera.position.addScaledVector(dir, ZOOM_SPEED);
    }
  }

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
