import { getSodium } from './sodium-public.js';

export async function randomBytes(length: number): Promise<Uint8Array> {
  const sodium = await getSodium();
  return sodium.randombytes_buf(length);
}

export async function randomKey(): Promise<Uint8Array> {
  return randomBytes(32);
}
