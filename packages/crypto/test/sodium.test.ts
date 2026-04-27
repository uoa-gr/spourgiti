import { describe, it, expect } from 'vitest';
import { getSodium } from '../src/sodium.js';

describe('getSodium', () => {
  it('resolves to the libsodium instance with crypto_box constants available', async () => {
    const sodium = await getSodium();
    expect(typeof sodium.crypto_box_SEALBYTES).toBe('number');
    expect(sodium.crypto_box_SEALBYTES).toBeGreaterThan(0);
  });

  it('returns the same instance across calls', async () => {
    const a = await getSodium();
    const b = await getSodium();
    expect(a).toBe(b);
  });
});
