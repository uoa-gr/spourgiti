import sodium from 'libsodium-wrappers';

let instance: typeof sodium | null = null;
let pending: Promise<typeof sodium> | null = null;

/** Browser entrypoint: native ESM import, no createRequire shim. */
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
