/**
 * Shared DEM/TIFF decode engine.
 *
 * Pure module: the caller provides the UTIF decoder instance (window.UTIF in
 * the browser via src/tiff/vendor/UTIF.js, or a require()d copy in Node).
 * Used by pages/dem-inspector and by the node unit test so both exercise the
 * exact same decoding logic (no duplicated fragments).
 */

/** NoData value declared in the TIFF (GDAL tag 42113, ASCII, e.g. "-9999"). */
function readNoData(ifd) {
  const tag = ifd['t42113'];
  if (!tag || tag.length === 0) return null;
  const raw = tag[0];
  let val;
  if (typeof raw === 'string') val = parseFloat(raw);
  else if (typeof raw === 'number') val = raw;
  else return null;
  return Number.isFinite(val) ? val : null;
}

/**
 * Decode the first image of a TIFF/GeoTIFF into an elevation typed array.
 *
 * @param {object} UTIF UTIF decoder API (decode/decodeImage)
 * @param {ArrayBuffer} arrayBuffer raw TIFF bytes
 * @returns {object} width, height, bps, sfmt, isLE, dataType/typeName,
 *   noData, noDataCount, rawMin/rawMax (incl. NoData), min/max
 *   (excl. NoData; also aliased as minElevation/maxElevation),
 *   mean, stdDev and elevationData (typed array over the decoded buffer).
 */
export function decodeDem(UTIF, arrayBuffer) {
  const ifds = UTIF.decode(arrayBuffer);
  UTIF.decodeImage(arrayBuffer, ifds[0]);
  const ifd = ifds[0];

  const width = ifd.width;
  const height = ifd.height;
  const bps = ifd['t258'] ? ifd['t258'][0] : 8; // bits por muestra
  const sfmt = ifd['t339'] ? ifd['t339'][0] : 1; // 1=sin signo, 2=con signo, 3=float

  // ifds[0].data contiene las muestras crudas ya en orden little-endian:
  // UTIF.js intercambia los 16-bit big-endian en decodeImage. Creamos una
  // VISTA tipada sobre el mismo buffer (sin copia byte a byte).
  let elevationData;
  let typeName;
  if (bps === 32 && sfmt === 3) {
    // Float32: UTIF no intercambia los big-endian de 32 bits, se hace aquí.
    if (!ifd.isLE) {
      const swapped = new Uint8Array(ifd.data.byteLength);
      for (let i = 0; i < swapped.length; i += 4) {
        swapped[i] = ifd.data[i + 3];
        swapped[i + 1] = ifd.data[i + 2];
        swapped[i + 2] = ifd.data[i + 1];
        swapped[i + 3] = ifd.data[i];
      }
      elevationData = new Float32Array(swapped.buffer, 0, width * height);
    } else {
      elevationData = new Float32Array(ifd.data.buffer, ifd.data.byteOffset, width * height);
    }
    typeName = 'Float32';
  } else if (bps === 16) {
    elevationData =
      sfmt === 2
        ? new Int16Array(ifd.data.buffer, ifd.data.byteOffset, width * height)
        : new Uint16Array(ifd.data.buffer, ifd.data.byteOffset, width * height);
    typeName = sfmt === 2 ? 'Int16' : 'Uint16';
  } else if (bps === 8) {
    elevationData =
      sfmt === 2
        ? new Int8Array(ifd.data.buffer, ifd.data.byteOffset, width * height)
        : new Uint8Array(ifd.data.buffer, ifd.data.byteOffset, width * height);
    typeName = sfmt === 2 ? 'Int8' : 'Uint8';
  } else {
    throw new Error(`Bits por muestra no soportados: ${bps}`);
  }

  const noData = readNoData(ifd);

  // min/max y estadísticas excluyen los píxeles NoData; rawMin/rawMax no.
  let rawMin = Infinity;
  let rawMax = -Infinity;
  let min = Infinity;
  let max = -Infinity;
  let noDataCount = 0;
  let sum = 0;
  let sumSq = 0;
  let count = 0;
  for (let i = 0; i < elevationData.length; i++) {
    const v = elevationData[i];
    if (v < rawMin) rawMin = v;
    if (v > rawMax) rawMax = v;
    if (noData !== null && v === noData) {
      noDataCount++;
      continue;
    }
    if (v < min) min = v;
    if (v > max) max = v;
    sum += v;
    sumSq += v * v;
    count++;
  }

  const mean = count ? sum / count : 0;
  const stdDev = count ? Math.sqrt(Math.max(0, sumSq / count - mean * mean)) : 0;
  const safeMin = min === Infinity ? 0 : min;
  const safeMax = max === -Infinity ? 0 : max;

  return {
    width,
    height,
    bps,
    sfmt,
    isLE: ifd.isLE,
    dataType: typeName,
    typeName,
    noData,
    noDataCount,
    rawMin,
    rawMax,
    min: safeMin,
    max: safeMax,
    minElevation: safeMin,
    maxElevation: safeMax,
    mean,
    stdDev,
    elevationData,
  };
}
