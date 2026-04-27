// Browser entrypoint: use the working CommonJS build
// libsodium-wrappers v0.7.16 ESM is broken (references missing ./libsodium.mjs)
// so we load via the dist/modules CommonJS build which is functional

let instance: any = null;
let pending: Promise<any> | null = null;

/** Browser entrypoint for libsodium. */
export async function getSodium(): Promise<any> {
  if (instance) return instance;
  if (!pending) {
    pending = (async () => {
      // Dynamically import the CommonJS version that actually works
      // The transform plugin in vitest.browser.config rewrites this to the correct path
      const sodium = await import('libsodium-wrappers/dist/modules/libsodium-wrappers.js');
      const lib = (sodium as any).default || sodium;
      if (lib.ready && typeof lib.ready.then === 'function') {
        await lib.ready;
      }
      instance = lib;
      return lib;
    })();
  }
  return pending;
}
