import { describe, it, expect } from 'vitest';
import { InMemoryKeystore } from '../src/memory.js';
import { KeystoreError } from '../src/types.js';

function bytes(...n: number[]): Uint8Array {
  return new Uint8Array(n);
}

describe('InMemoryKeystore', () => {
  it('round-trips a secret', async () => {
    const ks = new InMemoryKeystore();
    const handle = await ks.put('alice-key', bytes(1, 2, 3));
    expect(await ks.has(handle)).toBe(true);
    const out = await ks.get(handle);
    expect(Buffer.from(out).equals(Buffer.from(bytes(1, 2, 3)))).toBe(true);
  });

  it('returns distinct handles for the same label', async () => {
    const ks = new InMemoryKeystore();
    const a = await ks.put('k', bytes(1));
    const b = await ks.put('k', bytes(2));
    expect(a).not.toBe(b);
    expect(Buffer.from(await ks.get(a)).equals(Buffer.from(bytes(1)))).toBe(true);
    expect(Buffer.from(await ks.get(b)).equals(Buffer.from(bytes(2)))).toBe(true);
  });

  it('throws KeystoreError(NOT_FOUND) on missing handle', async () => {
    const ks = new InMemoryKeystore();
    await expect(ks.get('does-not-exist' as never)).rejects.toThrow(KeystoreError);
  });

  it('delete is idempotent', async () => {
    const ks = new InMemoryKeystore();
    const handle = await ks.put('k', bytes(1));
    await ks.delete(handle);
    await ks.delete(handle);
    expect(await ks.has(handle)).toBe(false);
  });

  it('returns a defensive copy from get()', async () => {
    const ks = new InMemoryKeystore();
    const handle = await ks.put('k', bytes(1, 2, 3));
    const first = await ks.get(handle);
    first[0] = 0xff;
    const second = await ks.get(handle);
    expect(second[0]).toBe(1);
  });
});
