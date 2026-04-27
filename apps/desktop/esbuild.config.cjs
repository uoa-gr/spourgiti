const esbuild = require('esbuild');

const common = {
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  // Only true natives stay external. electron is provided by the runtime;
  // better-sqlite3 ships a .node binding (asarUnpack handles it). All other
  // deps are pure JS and bundle cleanly, sidestepping pnpm symlink fragility.
  external: ['electron', 'better-sqlite3'],
  sourcemap: true,
  outdir: 'dist',
  logLevel: 'info',
};

Promise.all([
  esbuild.build({ ...common, entryPoints: ['src/main.ts'] }),
  esbuild.build({ ...common, entryPoints: ['src/preload.ts'] }),
]).catch((err) => {
  console.error(err);
  process.exit(1);
});
