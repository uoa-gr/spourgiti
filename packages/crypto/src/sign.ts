import { getSodium } from './sodium.js';

export async function signDetached(
  message: Uint8Array,
  secretKey: Uint8Array,
): Promise<Uint8Array> {
  const sodium = await getSodium();
  return sodium.crypto_sign_detached(message, secretKey);
}

export async function verifyDetached(
  signature: Uint8Array,
  message: Uint8Array,
  publicKey: Uint8Array,
): Promise<boolean> {
  const sodium = await getSodium();
  return sodium.crypto_sign_verify_detached(signature, message, publicKey);
}
