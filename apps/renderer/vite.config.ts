import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Renderer is loaded in production from file://, so base must be relative.
export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'chrome120',
  },
  server: {
    port: 5173,
    strictPort: true,
  },
});
