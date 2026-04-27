import { describe, it, expect } from 'vitest';
import { randomBytes, randomKey } from '../src/random.js';

describe('randomBytes', () => {
  it('returns a Uint8Array of the requested length', async () => {
    const buf = await randomBytes(32);
    expect(buf).toBeInstanceOf(Uint8Array);
    expect(buf.length).toBe(32);
  });

  it('produces non-deterministic output', async () => {
    const a = await randomBytes(16);
    const b = await randomBytes(16);
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(false);
  });
});

describe('randomKey', () => {
  it('returns a 32-byte symmetric key suitable for secretstream', async () => {
    const k = await randomKey();
    expect(k.length).toBe(32);
  });
});
