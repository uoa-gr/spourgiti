import { defineConfig } from 'vitest/config';

// Browser-mode parity tests are DEFERRED to Plan 3f, when apps/send is wired
// up and we can validate libsodium-wrappers in a real Vite production build.
//
// Reason for deferral: libsodium-wrappers v0.7.x ships a broken ESM build
// (its .mjs entry imports a non-existent libsodium.mjs sibling). Bypassing
// the broken file requires either:
//   (a) overriding Vite's resolve.conditions globally, which breaks Vitest's
//       internal modules ("__vitest_browser_runner__.runTests is not a function"),
//   (b) aliasing the bare specifier to an absolute path, which Vitest's
//       optimizeDeps then double-concatenates ("ENOENT ...js\dist\modules\...js"),
//   (c) waiting for libsodium-wrappers to fix its package, or for a forked
//       version to surface in the ecosystem.
//
// Production usage in apps/send goes through Vite's normal build pipeline
// rather than Vitest's browser harness — those use different code paths and
// libsodium-wrappers tends to work there once we configure Vite properly.
// Plan 3f wires up the production-build verification + a Playwright E2E test
// that exercises the full crypto round-trip in a real browser.
//
// For now this config exists as a placeholder so the package's `test:browser`
// script doesn't 404 if invoked locally. CI does not run this script.

export default defineConfig({
  test: {
    browser: {
      enabled: true,
      provider: 'playwright',
      name: 'chromium',
      headless: true,
    },
    include: ['test/**/*.test.ts'],
    // Skipped pending Plan 3f. Remove this line when the upstream issue resolves.
    exclude: ['test/**/*'],
  },
});
