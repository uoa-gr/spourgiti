import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let tempUserData: string;
let encryptionAvailable = true;

vi.mock('electron', () => {
  const PREFIX = Buffer.from('SAFE:');
  return {
    safeStorage: {
      isEncryptionAvailable: () => encryptionAvailable,
      encryptString: (s: string) => Buffer.concat([PREFIX, Buffer.from(s, 'utf8')]),
      decryptString: (buf: Buffer) => buf.subarray(PREFIX.length).toString('utf8'),
    },
    app: {
      getPath: (key: string) => {
        if (key !== 'userData') throw new Error(`unexpected getPath: ${key}`);
        return tempUserData;
      },
    },
  };
});

beforeEach(() => {
  tempUserData = mkdtempSync(join(tmpdir(), 'spourgiti-keystore-test-'));
  encryptionAvailable = true;
});

describe('SafeStorageKeystore', () => {
  it('round-trips a secret on disk via safeStorage', async () => {
    const { SafeStorageKeystore } = await import('../src/safeStorage.js');
    const ks = new SafeStorageKeystore();
    const handle = await ks.put('user-identity', new Uint8Array([1, 2, 3, 4]));
    expect(await ks.has(handle)).toBe(true);
    const out = await ks.get(handle);
    expect(Buffer.from(out).equals(Buffer.from([1, 2, 3, 4]))).toBe(true);
  });

  it('throws NOT_AVAILABLE when safeStorage reports unavailable', async () => {
    encryptionAvailable = false;
    const { SafeStorageKeystore } = await import('../src/safeStorage.js');
    const ks = new SafeStorageKeystore();
    await expect(ks.put('k', new Uint8Array([1]))).rejects.toMatchObject({ code: 'NOT_AVAILABLE' });
  });

  it('NOT_FOUND on missing handle', async () => {
    const { SafeStorageKeystore } = await import('../src/safeStorage.js');
    const ks = new SafeStorageKeystore();
    await expect(ks.get('nope' as never)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('delete is idempotent and removes the file', async () => {
    const { SafeStorageKeystore } = await import('../src/safeStorage.js');
    const ks = new SafeStorageKeystore();
    const handle = await ks.put('k', new Uint8Array([1]));
    await ks.delete(handle);
    await ks.delete(handle);
    expect(await ks.has(handle)).toBe(false);
  });
});
