import { type KeyHandle, type Keystore, KeystoreError, asHandle } from './types.js';

export class InMemoryKeystore implements Keystore {
  private readonly store = new Map<KeyHandle, Uint8Array>();
  private counter = 0;

  async put(label: string, secret: Uint8Array): Promise<KeyHandle> {
    const handle = asHandle(`${label}#${++this.counter}`);
    this.store.set(handle, new Uint8Array(secret));
    return handle;
  }

  async get(handle: KeyHandle): Promise<Uint8Array> {
    const stored = this.store.get(handle);
    if (!stored) {
      throw new KeystoreError(`no secret for handle ${handle}`, 'NOT_FOUND');
    }
    return new Uint8Array(stored);
  }

  async delete(handle: KeyHandle): Promise<void> {
    this.store.delete(handle);
  }

  async has(handle: KeyHandle): Promise<boolean> {
    return this.store.has(handle);
  }
}
