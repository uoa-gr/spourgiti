import { getSodium } from './sodium-public.js';

export interface IdentityKeyPair {
  publicKey: Uint8Array;
  secretKey: Uint8Array;
}

export async function generateIdentityKeyPair(): Promise<IdentityKeyPair> {
  const sodium = await getSodium();
  const kp = sodium.crypto_sign_keypair();
  return { publicKey: kp.publicKey, secretKey: kp.privateKey };
}

export async function ed25519PublicToX25519(ed25519PublicKey: Uint8Array): Promise<Uint8Array> {
  const sodium = await getSodium();
  return sodium.crypto_sign_ed25519_pk_to_curve25519(ed25519PublicKey);
}

export async function ed25519SecretToX25519(ed25519SecretKey: Uint8Array): Promise<Uint8Array> {
  const sodium = await getSodium();
  return sodium.crypto_sign_ed25519_sk_to_curve25519(ed25519SecretKey);
}
