/**
 * Opaque handle returned by put(); the caller stores it (e.g. in the vault's
 * keystore_meta table) and uses it later to fetch or delete the secret.
 */
export type KeyHandle = string & { readonly __brand: 'KeyHandle' };

export interface Keystore {
  /** Store a secret. Returns the opaque handle to retrieve it later. */
  put(label: string, secret: Uint8Array): Promise<KeyHandle>;

  /** Retrieve a previously stored secret. Throws KeystoreError if missing. */
  get(handle: KeyHandle): Promise<Uint8Array>;

  /** Remove a secret. Idempotent: deleting a missing handle is a no-op. */
  delete(handle: KeyHandle): Promise<void>;

  /** True if the handle currently has a stored secret. */
  has(handle: KeyHandle): Promise<boolean>;
}

export class KeystoreError extends Error {
  constructor(
    message: string,
    public readonly code: 'NOT_FOUND' | 'NOT_AVAILABLE' | 'CORRUPT',
  ) {
    super(message);
    this.name = 'KeystoreError';
  }
}

export function asHandle(s: string): KeyHandle {
  return s as KeyHandle;
}
