/**
 * Terrain symbology: elevation color ramps defined in absolute meters.
 * Shared by the 3D terrain viewer (pages/terrain).
 *
 * A palette is:
 *   { id: string, name: string, stops: [{ at: <meters>, color: '#rrggbb' }, ...] }
 * with strictly ascending `at` values. Colors between two stops are linearly
 * interpolated in sRGB; outside the stop range the color clamps to the
 * first/last stop, so palettes stay meaningful for DEMs that only cover a
 * slice of the ramp (e.g. a volcano whose minimum is ~1700 m).
 *
 * Because ramps are anchored to real elevation (not to each DEM's min/max),
 * the same stop means the same altitude on every DEM.
 */

export const PALETTES = [
  {
    id: 'hypsometric',
    name: 'Tintes hipsométricos',
    stops: [
      { at: 0, color: '#2c6e3f' }, // tropical lowland / deep green
      { at: 1200, color: '#58a05a' }, // montane forest
      { at: 2200, color: '#9bc36a' }, // pine-oak woodland
      { at: 3000, color: '#d0bd63' }, // alpine grassland (khaki)
      { at: 3800, color: '#b97f4a' }, // rocky slopes (tan-brown)
      { at: 4600, color: '#875a39' }, // volcanic scree (dark brown)
      { at: 5200, color: '#cfd2d9' }, // bare rock / ice (light gray)
      { at: 5600, color: '#ffffff' }, // permanent snow
    ],
  },
  {
    id: 'heat',
    name: 'Incandescente (calor)',
    stops: [
      { at: 0, color: '#3f0d0d' },
      { at: 1400, color: '#a61c1c' },
      { at: 2600, color: '#e05f14' },
      { at: 3800, color: '#f5b21e' },
      { at: 5000, color: '#fdeaa0' },
      { at: 5600, color: '#ffffff' },
    ],
  },
  {
    id: 'gray',
    name: 'Relieve en escala de grises',
    stops: [
      { at: 0, color: '#1e1e1e' },
      { at: 1100, color: '#4a4a4a' },
      { at: 2200, color: '#787878' },
      { at: 3300, color: '#a5a5a5' },
      { at: 4400, color: '#cfcfcf' },
      { at: 5600, color: '#f5f5f5' },
    ],
  },
];

export const DEFAULT_PALETTE_ID = PALETTES[0].id;

/** Look up a palette by id; unknown ids fall back to the default palette. */
export function getPalette(id) {
  return PALETTES.find((p) => p.id === id) || PALETTES[0];
}

// Parse once per hex color, then reuse.
const hexCache = new Map();

function hexToRgb01(hex) {
  if (!hexCache.has(hex)) {
    const n = parseInt(hex.slice(1), 16);
    hexCache.set(hex, [
      ((n >> 16) & 255) / 255,
      ((n >> 8) & 255) / 255,
      (n & 255) / 255,
    ]);
  }
  return hexCache.get(hex);
}

function rgb01ToHex(r, g, b) {
  const to = (v) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`;
}

/**
 * Color of a palette at an absolute elevation (meters).
 * Writes into `out` ([r, g, b] in 0..1) and returns it, so per-vertex calls
 * can reuse a single array instead of allocating millions of objects.
 */
export function colorAtMeters(palette, meters, out = [0, 0, 0]) {
  const stops = palette.stops;
  const first = stops[0];
  if (meters <= first.at) {
    const c = hexToRgb01(first.color);
    out[0] = c[0]; out[1] = c[1]; out[2] = c[2];
    return out;
  }
  const last = stops[stops.length - 1];
  if (meters >= last.at) {
    const c = hexToRgb01(last.color);
    out[0] = c[0]; out[1] = c[1]; out[2] = c[2];
    return out;
  }
  for (let i = 1; i < stops.length; i++) {
    const s = stops[i];
    if (meters <= s.at) {
      const prev = stops[i - 1];
      const t = (meters - prev.at) / (s.at - prev.at || 1);
      const a = hexToRgb01(prev.color);
      const b = hexToRgb01(s.color);
      out[0] = a[0] + (b[0] - a[0]) * t;
      out[1] = a[1] + (b[1] - a[1]) * t;
      out[2] = a[2] + (b[2] - a[2]) * t;
      return out;
    }
  }
  return out;
}

/**
 * Colors to draw a CSS gradient legend for the meters window [min, max].
 * Returns [{ color: '#rrggbb', pos: <0..100> }, ...] with positions sorted;
 * colors are sampled at the window edges and at every ramp stop inside it, so
 * the CSS linear-gradient exactly matches colorAtMeters() in that window.
 */
export function legendStops(palette, minMeters, maxMeters) {
  const range = maxMeters - minMeters;
  const out = [];
  const add = (meters) => {
    const pos = +(range === 0 ? 0 : ((meters - minMeters) / range) * 100).toFixed(2);
    if (out.length && Math.abs(out[out.length - 1].pos - pos) < 0.001) return; // duplicate edge/stop
    const c = colorAtMeters(palette, meters, [0, 0, 0]);
    out.push({ color: rgb01ToHex(c[0], c[1], c[2]), pos });
  };
  add(minMeters);
  for (const stop of palette.stops) {
    if (stop.at > minMeters && stop.at < maxMeters) add(stop.at);
  }
  add(maxMeters);
  return out;
}
