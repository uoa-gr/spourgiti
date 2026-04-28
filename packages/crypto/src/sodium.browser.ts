import sodium from 'libsodium-wrappers-sumo';

let instance: typeof sodium | null = null;
let pending: Promise<typeof sodium> | null = null;

/** Browser entrypoint: native ESM import (Vite plugin patches the
 * upstream broken sibling-import in libsodium-wrappers-sumo's .mjs). */
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
