import { describe, it, expect } from 'vitest';
import type { BrowserKeystore, EncryptedPrivateKey } from '../src/types.js';
import { KeystoreError } from '../src/types.js';

describe('keystore types', () => {
  it('KeystoreError carries a code', () => {
    const err = new KeystoreError('missing', 'NOT_FOUND');
    expect(err.code).toBe('NOT_FOUND');
    expect(err).toBeInstanceOf(Error);
  });

  it('EncryptedPrivateKey shape compiles', () => {
    const v: EncryptedPrivateKey = {
      ciphertext: new Uint8Array(0),
      salt: new Uint8Array(16),
      ops_limit: 1,
      mem_limit: 1,
      kdf_version: 1,
    };
    expect(v.kdf_version).toBe(1);
  });

  it('BrowserKeystore interface is implementable', () => {
    const impl: BrowserKeystore = {
      async storeEncryptedKey() {},
      async loadEncryptedKey() { return null; },
      async clear() {},
    };
    expect(typeof impl.clear).toBe('function');
  });
});
