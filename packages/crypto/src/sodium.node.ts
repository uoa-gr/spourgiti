import { createRequire } from 'node:module';
import type sodiumNs from 'libsodium-wrappers';

// libsodium-wrappers v0.7.16 ships a broken ESM build whose .mjs file
// imports a missing './libsodium.mjs'. Bypass it by going through the
// CJS bundle via createRequire — works in Node, Vitest, and esbuild
// (which prefers the CJS condition for native bundling targets).
const require = createRequire(import.meta.url);
const sodium = require('libsodium-wrappers') as typeof sodiumNs;

let instance: typeof sodium | null = null;
let pending: Promise<typeof sodium> | null = null;

/**
 * Returns the libsodium-wrappers instance after sodium.ready resolves.
 * Idempotent: subsequent calls return the same memoised instance.
 */
export async function getSodium(): Promise<typeof sodium> {
  if (instance) return instance;
  if (!pending) {
    pending = sodium.ready.then(() => {
      instance = sodium;
      return sodium;
    });
  }
  return pending;
}
