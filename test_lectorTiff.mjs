#!/usr/bin/env node
// Prueba de la lógica de decodificación TIFF de lectorTiff.html.
// Duplica el fragmento de processTIFF del HTML (mantener en sincronía).
// Valores de referencia (gdalinfo / osgeo.gdal):
//   tancitaro_mde.tif: min 1694.7788 max 3844.9553 mean 2669.407 std 417.482, NoData -9999 (0 píxeles)
//   nt/mde_nt.tif:    min 1918      max 4646      mean 2990.155 std 425.629, NoData -32768 (228982 píxeles)
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const require = createRequire(import.meta.url);
const UTIF = require("./UTIF.js"); // UMD: module.exports = UTIF
const ROOT = path.dirname(fileURLToPath(import.meta.url));

let failures = 0;
function assert(cond, msg) {
    if (cond) console.log(`  ok    ${msg}`);
    else { failures++; console.error(`  FALLO ${msg}`); }
}
function assertClose(actual, expected, tol, msg) {
    const ok = Math.abs(actual - expected) <= tol;
    if (ok) console.log(`  ok    ${msg} (${actual})`);
    else { failures++; console.error(`  FALLO ${msg}: esperado ${expected} +-${tol}, obtenido ${actual}`); }
}

// ---- Espejo de processTIFF() de lectorTiff.html ----
function decodeDem(filePath) {
    const buffer = readFileSync(filePath);
    const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
    const ifds = UTIF.decode(arrayBuffer);
    UTIF.decodeImage(arrayBuffer, ifds[0]);
    const ifd = ifds[0];
    const width = ifd.width, height = ifd.height;
    const bps = ifd["t258"] ? ifd["t258"][0] : 8;
    const sfmt = ifd["t339"] ? ifd["t339"][0] : 1;

    let elevationData, typeName;
    if (bps === 32 && sfmt === 3) {
        if (!ifd.isLE) throw new Error("Float32 big-endian: intercambiar bytes (no aplica a estos MDE)");
        elevationData = new Float32Array(ifd.data.buffer, ifd.data.byteOffset, width * height);
        typeName = "Float32";
    } else if (bps === 16) {
        elevationData = sfmt === 2
            ? new Int16Array(ifd.data.buffer, ifd.data.byteOffset, width * height)
            : new Uint16Array(ifd.data.buffer, ifd.data.byteOffset, width * height);
        typeName = sfmt === 2 ? "Int16" : "Uint16";
    } else if (bps === 8) {
        elevationData = sfmt === 2
            ? new Int8Array(ifd.data.buffer, ifd.data.byteOffset, width * height)
            : new Uint8Array(ifd.data.buffer, ifd.data.byteOffset, width * height);
        typeName = sfmt === 2 ? "Int8" : "Uint8";
    } else {
        throw new Error(`bits por muestra no soportados: ${bps}`);
    }

    const tag = ifd["t42113"];
    let noData = null;
    if (tag && tag.length) {
        const v = Number(String(tag[0]));
        if (Number.isFinite(v)) noData = v;
    }

    let min = Infinity, max = -Infinity, rawMin = Infinity, rawMax = -Infinity;
    let noDataCount = 0, sum = 0, sumSq = 0, count = 0;
    for (let i = 0; i < elevationData.length; i++) {
        const v = elevationData[i];
        if (v < rawMin) rawMin = v;
        if (v > rawMax) rawMax = v;
        if (noData !== null && v === noData) { noDataCount++; continue; }
        if (v < min) min = v;
        if (v > max) max = v;
        sum += v; sumSq += v * v; count++;
    }
    const mean = count ? sum / count : 0;
    const stdDev = count ? Math.sqrt(Math.max(0, sumSq / count - mean * mean)) : 0;

    return { width, height, bps, sfmt, isLE: ifd.isLE, typeName, noData, noDataCount,
             min, max, rawMin, rawMax, mean, stdDev, elevationData };
}

// ---- tancitaro_mde.tif: strips, Float32 ----
console.log("tancitaro_mde.tif (strip, Float32)");
const t = decodeDem(path.join(ROOT, "data/mde/tancitaro_mde.tif"));
assert(t.width === 1208 && t.height === 1060, "dimensiones 1208x1060");
assert(t.bps === 32, "bitsPorMuestra (t258) = 32");
assert(t.sfmt === 3, "sampleFormat (t339) = 3 (float)");
assert(t.isLE === true, "little-endian (II)");
assert(t.typeName === "Float32" && t.elevationData instanceof Float32Array, "vista Float32Array");
assert(t.elevationData.length === 1208 * 1060, `longitud ${t.elevationData.length} === 1280480`);
assert(t.noData === -9999, "NoData (t42113) = -9999");
assert(t.noDataCount === 0, "0 píxeles NoData en este archivo");
assertClose(t.min, 1694.77880859375, 0.01, "min excluye NoData y coincide con gdalinfo (1694.78)");
assertClose(t.max, 3844.955322265625, 0.01, "max coincide con gdalinfo (3844.96)");
assertClose(t.mean, 2669.4068, 0.1, "media ~2669.407");
assertClose(t.stdDev, 417.4824, 0.5, "desviación ~417.48");

// ---- nt/mde_nt.tif: tiles 128x128, Int16 con NoData real ----
console.log("nt/mde_nt.tif (tiled, Int16)");
const n = decodeDem(path.join(ROOT, "data/mde/nt/mde_nt.tif"));
assert(n.width === 2249 && n.height === 2177, "dimensiones 2249x2177");
assert(n.bps === 16, "bitsPorMuestra (t258) = 16");
assert(n.sfmt === 2, "sampleFormat (t339) = 2 (con signo)");
assert(n.isLE === true, "little-endian (II)");
assert(n.typeName === "Int16" && n.elevationData instanceof Int16Array, "vista Int16Array");
assert(n.elevationData.length === 2249 * 2177, `longitud ${n.elevationData.length} === 4896073`);
assert(n.noData === -32768, "NoData (t42113) = -32768");
assert(n.rawMin === -32768, "min bruto = -32768 (el enmascarado sí importa aquí)");
assert(n.noDataCount === 228982, "228982 píxeles NoData (valor actual del archivo)");
assert(n.min === 1918, "min enmascarado = 1918 (gdalinfo)");
assert(n.max === 4646, "max enmascarado = 4646 (gdalinfo)");
assertClose(n.mean, 2990.155, 0.1, "media ~2990.155");
assertClose(n.stdDev, 425.629, 0.5, "desviación ~425.63");

console.log(failures === 0 ? "TODO OK" : `${failures} comprobaciones fallidas`);
process.exit(failures === 0 ? 0 : 1);
