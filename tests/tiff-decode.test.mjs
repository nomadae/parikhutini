#!/usr/bin/env node
// Unit test for the shared TIFF decode engine (src/tiff/decode.mjs).
// The engine is the single source of truth used by both pages/dem-inspector
// and this test, so the checks below must hold for the app too.
// Reference values (gdalinfo / osgeo.gdal):
//   tancitaro_mde.tif: min 1694.7788 max 3844.9553 mean 2669.407 std 417.482, NoData -9999 (0 píxeles)
//   nt/mde_nt.tif:    min 1918      max 4646      mean 2990.155 std 425.629, NoData -32768 (228982 píxeles)
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { decodeDem } from '../src/tiff/decode.mjs';

const require = createRequire(import.meta.url);
const UTIF = require('../src/tiff/vendor/UTIF.js'); // UMD: module.exports = UTIF

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let failures = 0;
function assert(cond, msg) {
  if (cond) console.log(`  ok    ${msg}`);
  else {
    failures++;
    console.error(`  FALLO ${msg}`);
  }
}
function assertClose(actual, expected, tol, msg) {
  const ok = Math.abs(actual - expected) <= tol;
  if (ok) console.log(`  ok    ${msg} (${actual})`);
  else {
    failures++;
    console.error(`  FALLO ${msg}: esperado ${expected} +-${tol}, obtenido ${actual}`);
  }
}

function decodeDemFile(filePath) {
  const buffer = readFileSync(filePath);
  const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  return decodeDem(UTIF, arrayBuffer);
}

// ---- tancitaro_mde.tif: strips, Float32 ----
console.log('tancitaro_mde.tif (strip, Float32)');
const t = decodeDemFile(path.join(ROOT, 'data/mde/tancitaro_mde.tif'));
assert(t.width === 1208 && t.height === 1060, 'dimensiones 1208x1060');
assert(t.bps === 32, 'bitsPorMuestra (t258) = 32');
assert(t.sfmt === 3, 'sampleFormat (t339) = 3 (float)');
assert(t.isLE === true, 'little-endian (II)');
assert(t.typeName === 'Float32' && t.elevationData instanceof Float32Array, 'vista Float32Array');
assert(t.elevationData.length === 1208 * 1060, `longitud ${t.elevationData.length} === 1280480`);
assert(t.noData === -9999, 'NoData (t42113) = -9999');
assert(t.noDataCount === 0, '0 píxeles NoData en este archivo');
assertClose(t.min, 1694.77880859375, 0.01, 'min excluye NoData y coincide con gdalinfo (1694.78)');
assertClose(t.max, 3844.955322265625, 0.01, 'max coincide con gdalinfo (3844.96)');
assertClose(t.mean, 2669.4068, 0.1, 'media ~2669.407');
assertClose(t.stdDev, 417.4824, 0.5, 'desviación ~417.48');

// ---- nt/mde_nt.tif: tiles 128x128, Int16 con NoData real ----
console.log('nt/mde_nt.tif (tiled, Int16)');
const n = decodeDemFile(path.join(ROOT, 'data/mde/nt/mde_nt.tif'));
assert(n.width === 2249 && n.height === 2177, 'dimensiones 2249x2177');
assert(n.bps === 16, 'bitsPorMuestra (t258) = 16');
assert(n.sfmt === 2, 'sampleFormat (t339) = 2 (con signo)');
assert(n.isLE === true, 'little-endian (II)');
assert(n.typeName === 'Int16' && n.elevationData instanceof Int16Array, 'vista Int16Array');
assert(n.elevationData.length === 2249 * 2177, `longitud ${n.elevationData.length} === 4896073`);
assert(n.noData === -32768, 'NoData (t42113) = -32768');
assert(n.rawMin === -32768, 'min bruto = -32768 (el enmascarado sí importa aquí)');
assert(n.noDataCount === 228982, '228982 píxeles NoData (valor actual del archivo)');
assert(n.min === 1918, 'min enmascarado = 1918 (gdalinfo)');
assert(n.max === 4646, 'max enmascarado = 4646 (gdalinfo)');
assertClose(n.mean, 2990.155, 0.1, 'media ~2990.155');
assertClose(n.stdDev, 425.629, 0.5, 'desviación ~425.63');

console.log(failures === 0 ? 'TODO OK' : `${failures} comprobaciones fallidas`);
process.exit(failures === 0 ? 0 : 1);
