#!/usr/bin/env node
// Copy the runtime data needed by the built site into dist/data.
//
//   published by default : data/all.json and other small committed datasets
//   never published      : data/source/**  (raw GIS inputs, authoring only)
//   opt-in only          : data/mde/**     (large DEM rasters)
//
// The rasters are ~35 MB and are not needed by the portal; the terrain viewer
// can either ship them (`npm run build:local`) or load them from a separate
// origin/CDN (see docs/deploy-and-serve-dems.md).
import { cpSync, mkdirSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(root, 'data');
const dest = path.join(root, 'dist', 'data');

const withDems = process.argv.includes('--with-dems');

// `source/` holds the raw GIS inputs the Python pipeline consumes; it is never
// part of the deployed site and would publish the whole dataset.
const excluded = new Set(['source']);
if (!withDems) excluded.add('mde');

mkdirSync(dest, { recursive: true });

let copied = 0;
for (const entry of readdirSync(src, { withFileTypes: true })) {
  if (excluded.has(entry.name)) continue;
  cpSync(path.join(src, entry.name), path.join(dest, entry.name), { recursive: true });
  copied++;
}

const skipped = [...excluded].sort().join(', ');
console.log(`copied ${copied} item(s) ${src} -> ${dest}`);
if (skipped) console.log(`skipped: ${skipped}${withDems ? '' : ' (pass --with-dems to include DEM rasters)'}`);
