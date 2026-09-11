import { fileURLToPath, URL } from 'node:url';
import { defineConfig, loadEnv } from 'vite';

const r = (p) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const key = (env.VITE_MAPTILER_KEY || '').trim();

  if (!key) {
    const message =
      'VITE_MAPTILER_KEY is not set. Copy .env.example to .env and fill in your ' +
      'MapTiler key (or provide it as an environment variable).';
    // Never ship a production bundle with a silently broken basemap.
    if (mode === 'production') throw new Error(`[vite.config] ${message}`);
    console.warn(`\n[vite.config] WARNING: ${message}\n`);
  }

  return {
    build: {
      // Source maps are a development aid only. Publishing them leaks the full
      // application source to every visitor, so production builds omit them.
      sourcemap: mode !== 'production',
      rollupOptions: {
        input: {
          index: r('index.html'),
          terrain: r('pages/terrain/index.html'),
          'dem-inspector': r('pages/dem-inspector/index.html'),
        },
      },
    },
  };
});
