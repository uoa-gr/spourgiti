import { getSodium } from './sodium-public.js';

/**
 * Wrap a symmetric key for a recipient using their X25519 public key.
 * Anonymous: no sender identity is encoded in the ciphertext (sender
 * identity lives in the signed manifest at a higher layer).
 */
export async function sealKey(
  symmetricKey: Uint8Array,
  recipientX25519PublicKey: Uint8Array,
): Promise<Uint8Array> {
  const sodium = await getSodium();
  return sodium.crypto_box_seal(symmetricKey, recipientX25519PublicKey);
}

/**
 * Unwrap a sealed key with the recipient's X25519 keypair.
 * Throws if the ciphertext was not addressed to this recipient or is corrupt.
 */
export async function openSealedKey(
  wrapped: Uint8Array,
  recipientX25519PublicKey: Uint8Array,
  recipientX25519SecretKey: Uint8Array,
): Promise<Uint8Array> {
  const sodium = await getSodium();
  return sodium.crypto_box_seal_open(wrapped, recipientX25519PublicKey, recipientX25519SecretKey);
}
