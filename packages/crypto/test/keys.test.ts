import { describe, it, expect } from 'vitest';
import {
  generateIdentityKeyPair,
  ed25519PublicToX25519,
  ed25519SecretToX25519,
} from '../src/keys.js';
import { getSodium } from '../src/sodium-public.js';

describe('generateIdentityKeyPair', () => {
  it('returns a 32-byte public key and 64-byte secret key', async () => {
    const kp = await generateIdentityKeyPair();
    expect(kp.publicKey.length).toBe(32);
    expect(kp.secretKey.length).toBe(64);
  });

  it('produces a unique keypair on each call', async () => {
    const a = await generateIdentityKeyPair();
    const b = await generateIdentityKeyPair();
    expect(Buffer.from(a.publicKey).equals(Buffer.from(b.publicKey))).toBe(false);
  });
});

describe('Ed25519 to X25519 conversion', () => {
  it('converts a public key to a 32-byte X25519 public key', async () => {
    const kp = await generateIdentityKeyPair();
    const x = await ed25519PublicToX25519(kp.publicKey);
    expect(x.length).toBe(32);
  });

  it('converts a secret key to a 32-byte X25519 secret key', async () => {
    const kp = await generateIdentityKeyPair();
    const x = await ed25519SecretToX25519(kp.secretKey);
    expect(x.length).toBe(32);
  });

  it('the converted X25519 keypair satisfies x_pk == scalarmult_base(x_sk)', async () => {
    const sodium = await getSodium();
    const kp = await generateIdentityKeyPair();
    const xPk = await ed25519PublicToX25519(kp.publicKey);
    const xSk = await ed25519SecretToX25519(kp.secretKey);
    const derived = sodium.crypto_scalarmult_base(xSk);
    expect(Buffer.from(derived).equals(Buffer.from(xPk))).toBe(true);
  });
});
