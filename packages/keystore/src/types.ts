/**
 * Browser keystore: holds the user's encrypted private key in IndexedDB.
 * Implementation (Argon2id-derived KEK around the private key) lands
 * in Plan 3c. This file declares the interface so consumers compile.
 */

export interface EncryptedPrivateKey {
  ciphertext: Uint8Array;
  salt: Uint8Array;
  ops_limit: number;
  mem_limit: number;
  kdf_version: number;
}

export interface BrowserKeystore {
  storeEncryptedKey(value: EncryptedPrivateKey): Promise<void>;
  loadEncryptedKey(): Promise<EncryptedPrivateKey | null>;
  clear(): Promise<void>;
}

export class KeystoreError extends Error {
  constructor(
    message: string,
    public readonly code: 'NOT_FOUND' | 'DECRYPT_FAIL' | 'DB_UNAVAILABLE',
  ) {
    super(message);
    this.name = 'KeystoreError';
  }
}
