import { describe, it, expect } from 'vitest';
import { streamEncrypt, streamDecrypt } from '../src/stream.js';
import { randomKey } from '../src/random.js';

describe('streamEncrypt / streamDecrypt', () => {
  it('round-trips a multi-chunk plaintext', async () => {
    const key = await randomKey();
    const chunks = [
      new Uint8Array([1, 2, 3, 4]),
      new Uint8Array([5, 6, 7, 8]),
      new Uint8Array([9, 10]),
    ];
    const { header, ciphertexts } = await streamEncrypt(key, chunks);
    const decrypted = await streamDecrypt(key, header, ciphertexts);
    expect(decrypted.length).toBe(chunks.length);
    for (let i = 0; i < chunks.length; i++) {
      expect(Buffer.from(decrypted[i]!).equals(Buffer.from(chunks[i]!))).toBe(true);
    }
  });

  it('detects a tampered ciphertext chunk', async () => {
    const key = await randomKey();
    const chunks = [new Uint8Array([1, 2, 3])];
    const { header, ciphertexts } = await streamEncrypt(key, chunks);
    ciphertexts[0]![0] ^= 0xff;
    await expect(streamDecrypt(key, header, ciphertexts)).rejects.toThrow();
  });

  it('detects truncation (a missing final chunk)', async () => {
    const key = await randomKey();
    const chunks = [new Uint8Array([1]), new Uint8Array([2]), new Uint8Array([3])];
    const { header, ciphertexts } = await streamEncrypt(key, chunks);
    const truncated = ciphertexts.slice(0, -1);
    await expect(streamDecrypt(key, header, truncated)).rejects.toThrow();
  });
});
