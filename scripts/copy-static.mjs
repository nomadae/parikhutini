#!/usr/bin/env node
// Copy data/ (committed datasets + local DEM rasters) into dist/data so the
// built site can serve /data/* (see docs/deploy-and-serve-dems.md).
// Production deployments may exclude data/mde and serve rasters separately.
import { cpSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(root, 'data');
const dest = path.join(root, 'dist', 'data');

mkdirSync(dest, { recursive: true });
cpSync(src, dest, { recursive: true });
console.log(`copied ${src} -> ${dest}`);
