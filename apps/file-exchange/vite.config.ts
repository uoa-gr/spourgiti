import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

// Base path:
//   - Vercel serves at the apex (/), so PAGES_BASE_URL is unset → '/'.
//   - GitHub Pages serves at /<repo>/, so the pages workflow sets
//     PAGES_BASE_URL='/file-exchange/' (override in repo Variables to '/'
//     when a custom domain is in use).
const base = process.env.PAGES_BASE_URL ?? '/';

// libsodium-wrappers-sumo v0.7.x ships a broken ESM build (the .mjs entry
// imports a non-existent libsodium.mjs sibling). Alias the bare specifier
// to the working CJS dist via an absolute filesystem path so esbuild can
// transform it for the browser.
const sumoCjs = fileURLToPath(
  new URL(
    '../../node_modules/libsodium-wrappers-sumo/dist/modules-sumo/libsodium-wrappers.js',
    import.meta.url,
  ),
);

export default defineConfig({
  plugins: [react()],
  base,
  build: { outDir: 'dist', emptyOutDir: true, target: 'es2022' },
  server: { port: 5173, strictPort: true },
  resolve: {
    conditions: ['browser', 'import', 'default'],
    alias: {
      'libsodium-wrappers-sumo': sumoCjs,
    },
  },
  optimizeDeps: {
    include: ['libsodium-wrappers-sumo'],
  },
});
