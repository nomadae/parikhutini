import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// Scene setup
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// Load heightmap data
fetch('./data/heightmap.json')
  .then(response => response.json())
  .then(heightmap => {
    const width = heightmap[0].length;
    const height = heightmap.length;


    // Create a geometry from the heightmap
    const geometry = new THREE.PlaneGeometry(width, height, width - 1, height - 1);
    const vertices = geometry.attributes.position.array;

    // Apply elevation data to the geometry
    for (let i = 0, j = 0; i < vertices.length; i += 3, j++) {
      const x = j % width;
      const y = Math.floor(j / width);
      vertices[i + 2] = heightmap[y][x] * 0.3; // Scale elevation for better visualization
    }

    // Create material and mesh
    const material = new THREE.MeshPhongMaterial({
      color: 0x654321, // Brown color for the volcano
      flatShading: true,
    });
    const terrain = new THREE.Mesh(geometry, material);
    terrain.rotation.x = -Math.PI / 2; // Rotate to make it stand upright
    scene.add(terrain);

    // Add lighting
    const light = new THREE.DirectionalLight(0xffffff, 1);
    light.position.set(1, 1, 1).normalize();
    scene.add(light);

    // Position the camera
    camera.position.set(0, 250, 0);
    camera.lookAt(0, 100, 200);

    // Add interactivity (orbit controls)
   const controls = new OrbitControls(camera, renderer.domElement);

    // Animation loop
    function animate() {
      requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    }
    animate();
  });