/**
 * DEM inspector app (pages/dem-inspector).
 * UI + analysis glue over the shared engine in src/tiff/decode.mjs.
 * Decoding/stat helpers live in the engine; this module only reads the DOM,
 * renders canvases and exposes the analysis actions used by the page buttons
 * (and by the E2E harness) on window.
 */
import { decodeDem } from '../../src/tiff/decode.mjs';

let elevationData = null;
let metadata = {};
let canvasContext = null;
let profileContext = null;

function setLoadedDem(decoded) {
  elevationData = decoded.elevationData;
  metadata = {
    width: decoded.width,
    height: decoded.height,
    minElevation: decoded.minElevation,
    maxElevation: decoded.maxElevation,
    dataType: decoded.dataType,
    noData: decoded.noData,
  };
  // Legacy/test surface: analysis buttons (inline onclick) and the E2E
  // harness read these from window.
  window.metadata = metadata;
  window.elevationData = elevationData;
}

// ---------- boot ----------
function init() {
  const canvas = document.getElementById('elevationCanvas');
  const profileCanvas = document.getElementById('profileCanvas');
  canvasContext = canvas.getContext('2d');
  profileContext = profileCanvas.getContext('2d');
  document.getElementById('tiffFile').addEventListener('change', handleFileSelect);
}
init();

// ---------- file handling ----------
async function handleFileSelect(event) {
  const file = event.target.files[0];
  if (!file) return;
  document.getElementById('fileName').textContent = `Archivo: ${file.name}`;
  document.getElementById('fileInfo').textContent = 'Procesando archivo TIFF...';

  try {
    const arrayBuffer = await file.arrayBuffer();
    await processTIFF(arrayBuffer);
  } catch (error) {
    console.error('Error:', error);
    document.getElementById('fileInfo').textContent = 'Error al procesar el archivo: ' + error.message;
  }
}

async function processTIFF(arrayBuffer) {
  try {
    const decoded = decodeDem(window.UTIF, arrayBuffer);
    setLoadedDem(decoded);
    displayFileInfo();
    visualizeElevation();
    updateStatistics();
  } catch (error) {
    throw new Error('Formato TIFF no compatible o archivo corrupto');
  }
}

// ---------- info & rendering ----------
function displayFileInfo() {
  const info = `
      <p><strong>Dimensiones:</strong> ${metadata.width} × ${metadata.height} píxeles</p>
      <p><strong>Rango de elevación:</strong> ${metadata.minElevation.toFixed(2)} - ${metadata.maxElevation.toFixed(2)} unidades</p>
      <p><strong>Tipo de datos:</strong> ${metadata.dataType}</p>
      <p><strong>Amplitud de elevación (máx − mín):</strong> ${(metadata.maxElevation - metadata.minElevation).toFixed(2)} unidades</p>
  `;
  document.getElementById('fileInfo').innerHTML = info;
}

function visualizeElevation() {
  const canvas = document.getElementById('elevationCanvas');
  canvas.width = metadata.width;
  canvas.height = metadata.height;

  const min = metadata.minElevation;
  const max = metadata.maxElevation;
  const range = max - min || 1;
  const noData = metadata.noData;

  const imageData = canvasContext.createImageData(metadata.width, metadata.height);

  for (let y = 0; y < metadata.height; y++) {
    for (let x = 0; x < metadata.width; x++) {
      const index = y * metadata.width + x;
      const elevation = elevationData[index];
      const pixelIndex = index * 4;

      if (noData !== null && elevation === noData) {
        imageData.data[pixelIndex + 3] = 0; // píxel NoData => transparente
        continue;
      }
      const normalized = (elevation - min) / range;
      const color = getColorFromElevation(normalized);
      imageData.data[pixelIndex] = color.r;
      imageData.data[pixelIndex + 1] = color.g;
      imageData.data[pixelIndex + 2] = color.b;
      imageData.data[pixelIndex + 3] = 255;
    }
  }

  canvasContext.putImageData(imageData, 0, 0);
  canvas.addEventListener('click', handleCanvasClick);
}

function getColorFromElevation(normalized) {
  // Escala de colores: azul (bajo) -> verde -> amarillo -> rojo (alto)
  if (normalized < 0.25) {
    return { r: 0, g: 0, b: Math.floor(255 * (normalized * 4)) };
  } else if (normalized < 0.5) {
    return { r: 0, g: Math.floor(255 * ((normalized - 0.25) * 4)), b: 255 };
  } else if (normalized < 0.75) {
    return { r: Math.floor(255 * ((normalized - 0.5) * 4)), g: 255, b: 0 };
  } else {
    return { r: 255, g: Math.floor(255 * (1 - (normalized - 0.75) * 4)), b: 0 };
  }
}

// ---------- statistics ----------
function updateStatistics() {
  const stats = calculateStatistics();
  const statsHTML = `
      <div class="stat-box">
          <h4>Elevación Media</h4>
          <p>${stats.mean.toFixed(2)}</p>
      </div>
      <div class="stat-box">
          <h4>Desviación Estándar</h4>
          <p>${stats.stdDev.toFixed(2)}</p>
      </div>
      <div class="stat-box">
          <h4>Mediana</h4>
          <p>${stats.median.toFixed(2)}</p>
      </div>
      <div class="stat-box">
          <h4>Pendiente Media</h4>
          <p>${stats.avgSlope.toFixed(2)}°</p>
      </div>
  `;
  document.getElementById('statsContainer').innerHTML = statsHTML;
}

function calculateStatistics() {
  const noData = metadata.noData;
  const total = elevationData.length;

  let sum = 0;
  let sumSquared = 0;
  let count = 0;
  for (let i = 0; i < total; i++) {
    const v = elevationData[i];
    if (noData !== null && v === noData) continue;
    sum += v;
    sumSquared += v * v;
    count++;
  }

  // Copia compacta de valores válidos para la mediana
  const valid = new Float64Array(count);
  let j = 0;
  for (let i = 0; i < total; i++) {
    const v = elevationData[i];
    if (noData !== null && v === noData) continue;
    valid[j++] = v;
  }
  valid.sort();

  const mean = count ? sum / count : 0;
  const variance = count ? sumSquared / count - mean * mean : 0;
  const stdDev = Math.sqrt(Math.max(0, variance));
  const mid = valid.length >> 1;
  const median = valid.length % 2 === 1 ? valid[mid] : (valid[mid - 1] + valid[mid]) / 2;

  // Pendiente promedio aproximada (ignora vecinos NoData)
  let slopeSum = 0;
  let slopeCount = 0;
  for (let y = 1; y < metadata.height - 1; y++) {
    for (let x = 1; x < metadata.width - 1; x++) {
      const center = elevationData[y * metadata.width + x];
      const right = elevationData[y * metadata.width + (x + 1)];
      const bottom = elevationData[(y + 1) * metadata.width + x];
      if (noData !== null && (center === noData || right === noData || bottom === noData)) continue;
      slopeSum += Math.atan2(Math.abs(right - center), 1) * (180 / Math.PI);
      slopeSum += Math.atan2(Math.abs(bottom - center), 1) * (180 / Math.PI);
      slopeCount += 2;
    }
  }
  const avgSlope = slopeCount ? slopeSum / slopeCount : 0;

  return { mean, stdDev, median, avgSlope };
}

// ---------- elevation profile ----------
function handleCanvasClick(event) {
  const canvas = event.target;
  const rect = canvas.getBoundingClientRect();
  // El canvas se muestra escalado por CSS: convertir píxel mostrado a píxel del ráster
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  const x = Math.min(metadata.width - 1, Math.max(0, Math.floor((event.clientX - rect.left) * scaleX)));
  const y = Math.min(metadata.height - 1, Math.max(0, Math.floor((event.clientY - rect.top) * scaleY)));

  const elevation = elevationData[y * metadata.width + x];
  document.getElementById('profileInfo').textContent =
    metadata.noData !== null && elevation === metadata.noData
      ? `Posición: (${x}, ${y}) - Sin datos (NoData)`
      : `Posición: (${x}, ${y}) - Elevación: ${elevation.toFixed(2)}`;
  document.getElementById('profileRange').textContent =
    `Máx: ${metadata.maxElevation.toFixed(1)} · Mín: ${metadata.minElevation.toFixed(1)}`;

  drawElevationProfile(x);
}

function drawElevationProfile(x) {
  const profileData = [];
  for (let y = 0; y < metadata.height; y++) {
    profileData.push(elevationData[y * metadata.width + x]);
  }

  const canvas = document.getElementById('profileCanvas');
  const cssWidth = canvas.getBoundingClientRect().width || 278;
  const width = Math.max(200, Math.round(cssWidth));
  const height = Math.round(width * 0.45);
  canvas.width = width;
  canvas.height = height;
  profileContext.clearRect(0, 0, width, height);

  const noData = metadata.noData;
  const range = metadata.maxElevation - metadata.minElevation || 1;
  profileContext.beginPath();
  let started = false;
  for (let i = 0; i < profileData.length; i++) {
    if (noData !== null && profileData[i] === noData) {
      started = false;
      continue;
    }
    const xPos = (i / profileData.length) * width;
    const yPos = height - ((profileData[i] - metadata.minElevation) / range) * height;
    if (!started) {
      profileContext.moveTo(xPos, yPos);
      started = true;
    } else {
      profileContext.lineTo(xPos, yPos);
    }
  }

  profileContext.strokeStyle = '#3498db';
  profileContext.lineWidth = 2;
  profileContext.stroke();
}

// ---------- analysis tools (page buttons) ----------
function calculateSlope() {
  document.getElementById('analysisResults').innerHTML =
    '<p>Análisis de pendientes calculado. Pendiente media: ' +
    calculateStatistics().avgSlope.toFixed(2) +
    '°</p>';
}

function calculateAspect() {
  if (!elevationData || !metadata.width) {
    document.getElementById('analysisResults').innerHTML =
      '<p>Carga primero un archivo MDE para calcular la orientación.</p>';
    return;
  }
  const w = metadata.width;
  const h = metadata.height;
  const noData = metadata.noData;
  const classNames = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const classes = new Array(8).fill(0);
  let sinSum = 0;
  let cosSum = 0;
  let valid = 0;
  let flat = 0;

  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const idx = y * w + x;
      const c = elevationData[idx];
      if (
        noData !== null &&
        (c === noData ||
          elevationData[idx - 1] === noData ||
          elevationData[idx + 1] === noData ||
          elevationData[idx - w] === noData ||
          elevationData[idx + w] === noData)
      )
        continue;
      // Diferencias finitas de Horn (la imagen crece en y hacia el sur)
      const dzdx = (elevationData[idx + 1] - elevationData[idx - 1]) / 2;
      const dzdy = (elevationData[idx + w] - elevationData[idx - w]) / 2;
      if (dzdx === 0 && dzdy === 0) {
        flat++;
        continue;
      }
      // 0° = norte, 90° = este (dirección de máxima pendiente descendente)
      let aspect = Math.atan2(-dzdx, dzdy) * (180 / Math.PI);
      if (aspect < 0) aspect += 360;
      const rad = aspect * (Math.PI / 180);
      sinSum += Math.sin(rad);
      cosSum += Math.cos(rad);
      classes[Math.round(aspect / 45) % 8]++;
      valid++;
    }
  }

  let result;
  if (valid === 0) {
    result = '<p>No hay celdas válidas para calcular la orientación.</p>';
  } else {
    let meanAspect = Math.atan2(sinSum, cosSum) * (180 / Math.PI);
    if (meanAspect < 0) meanAspect += 360;
    let dominant = 0;
    for (let i = 1; i < 8; i++) if (classes[i] > classes[dominant]) dominant = i;
    result =
      `<p>Orientación media: ${meanAspect.toFixed(1)}° (clase dominante: ${classNames[dominant]})</p>` +
      `<p>Celdas válidas: ${valid.toLocaleString('es-MX')} · planas: ${flat.toLocaleString('es-MX')}</p>` +
      '<p>Clases: ' + classNames.map((n, i) => `${n} ${classes[i].toLocaleString('es-MX')}`).join(' · ') + '</p>';
  }
  document.getElementById('analysisResults').innerHTML = result;
}

function findHighestPoint() {
  const maxIndex = elevationData.indexOf(metadata.maxElevation);
  const y = Math.floor(maxIndex / metadata.width);
  const x = maxIndex % metadata.width;
  document.getElementById('analysisResults').innerHTML =
    `<p>Punto más alto: (${x}, ${y}) - Elevación: ${metadata.maxElevation.toFixed(2)}</p>`;
}

function findLowestPoint() {
  const minIndex = elevationData.indexOf(metadata.minElevation);
  const y = Math.floor(minIndex / metadata.width);
  const x = minIndex % metadata.width;
  document.getElementById('analysisResults').innerHTML =
    `<p>Punto más bajo: (${x}, ${y}) - Elevación: ${metadata.minElevation.toFixed(2)}</p>`;
}

// Page buttons use inline onclick attributes -> expose as globals.
window.calculateSlope = calculateSlope;
window.calculateAspect = calculateAspect;
window.findHighestPoint = findHighestPoint;
window.findLowestPoint = findLowestPoint;
