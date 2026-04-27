import { describe, it, expect } from 'vitest';
import { signDetached, verifyDetached } from '../src/sign.js';
import { generateIdentityKeyPair } from '../src/keys.js';
import { randomBytes } from '../src/random.js';

describe('signDetached / verifyDetached', () => {
  it('produces a 64-byte signature that verifies against the same message + public key', async () => {
    const kp = await generateIdentityKeyPair();
    const msg = await randomBytes(128);
    const sig = await signDetached(msg, kp.secretKey);
    expect(sig.length).toBe(64);
    expect(await verifyDetached(sig, msg, kp.publicKey)).toBe(true);
  });

  it('rejects a tampered message', async () => {
    const kp = await generateIdentityKeyPair();
    const msg = new Uint8Array([1, 2, 3, 4]);
    const sig = await signDetached(msg, kp.secretKey);
    const tampered = new Uint8Array([1, 2, 3, 5]);
    expect(await verifyDetached(sig, tampered, kp.publicKey)).toBe(false);
  });

  it('rejects a signature from a different keypair', async () => {
    const a = await generateIdentityKeyPair();
    const b = await generateIdentityKeyPair();
    const msg = new Uint8Array([1, 2, 3]);
    const sig = await signDetached(msg, a.secretKey);
    expect(await verifyDetached(sig, msg, b.publicKey)).toBe(false);
  });
});
