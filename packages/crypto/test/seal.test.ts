import { describe, it, expect } from 'vitest';
import { sealKey, openSealedKey } from '../src/seal.js';
import {
  generateIdentityKeyPair,
  ed25519PublicToX25519,
  ed25519SecretToX25519,
} from '../src/keys.js';
import { randomKey } from '../src/random.js';

describe('sealKey / openSealedKey', () => {
  it('wraps a 32-byte symmetric key for a recipient and the recipient unwraps it', async () => {
    const recipient = await generateIdentityKeyPair();
    const recipientX_pk = await ed25519PublicToX25519(recipient.publicKey);
    const recipientX_sk = await ed25519SecretToX25519(recipient.secretKey);

    const symmetricKey = await randomKey();
    const wrapped = await sealKey(symmetricKey, recipientX_pk);

    expect(wrapped.length).toBe(symmetricKey.length + 48);

    const unwrapped = await openSealedKey(wrapped, recipientX_pk, recipientX_sk);
    expect(Buffer.from(unwrapped).equals(Buffer.from(symmetricKey))).toBe(true);
  });

  it('refuses to unwrap with the wrong secret key', async () => {
    const alice = await generateIdentityKeyPair();
    const aliceX_pk = await ed25519PublicToX25519(alice.publicKey);
    const bob = await generateIdentityKeyPair();
    const bobX_pk = await ed25519PublicToX25519(bob.publicKey);
    const bobX_sk = await ed25519SecretToX25519(bob.secretKey);

    const symmetricKey = await randomKey();
    const wrappedForAlice = await sealKey(symmetricKey, aliceX_pk);

    await expect(openSealedKey(wrappedForAlice, bobX_pk, bobX_sk)).rejects.toThrow();
  });
});
