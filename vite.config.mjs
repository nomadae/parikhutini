import { fileURLToPath, URL } from 'node:url';

const r = (p) => fileURLToPath(new URL(p, import.meta.url));

export default {
  build: {
    sourcemap: true,
    rollupOptions: {
      input: {
        index: r('index.html'),
        terrain: r('pages/terrain/index.html'),
        'dem-inspector': r('pages/dem-inspector/index.html'),
      },
    },
  },
};
