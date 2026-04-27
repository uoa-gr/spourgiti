import { getSodium } from './sodium.js';

export interface StreamEncryptResult {
  header: Uint8Array;
  ciphertexts: Uint8Array[];
}

/**
 * Encrypt plaintext chunks with a fresh XChaCha20-Poly1305 secretstream.
 * Each chunk is authenticated; the final chunk carries the FINAL tag so
 * truncation is detectable on decrypt.
 */
export async function streamEncrypt(
  key: Uint8Array,
  chunks: Uint8Array[],
): Promise<StreamEncryptResult> {
  const sodium = await getSodium();
  const { state, header } = sodium.crypto_secretstream_xchacha20poly1305_init_push(key);

  const ciphertexts: Uint8Array[] = [];
  for (let i = 0; i < chunks.length; i++) {
    const isLast = i === chunks.length - 1;
    const tag = isLast
      ? sodium.crypto_secretstream_xchacha20poly1305_TAG_FINAL
      : sodium.crypto_secretstream_xchacha20poly1305_TAG_MESSAGE;
    ciphertexts.push(
      sodium.crypto_secretstream_xchacha20poly1305_push(state, chunks[i]!, null, tag),
    );
  }
  return { header, ciphertexts };
}

/**
 * Decrypt a sequence of ciphertext chunks. Throws on tampering or
 * truncation (the final chunk's tag must equal FINAL).
 */
export async function streamDecrypt(
  key: Uint8Array,
  header: Uint8Array,
  ciphertexts: Uint8Array[],
): Promise<Uint8Array[]> {
  const sodium = await getSodium();
  const state = sodium.crypto_secretstream_xchacha20poly1305_init_pull(header, key);

  const out: Uint8Array[] = [];
  for (let i = 0; i < ciphertexts.length; i++) {
    const result = sodium.crypto_secretstream_xchacha20poly1305_pull(state, ciphertexts[i]!);
    if (!result) throw new Error(`secretstream chunk ${i} authentication failed`);
    const isLast = i === ciphertexts.length - 1;
    const expectedTag = isLast
      ? sodium.crypto_secretstream_xchacha20poly1305_TAG_FINAL
      : sodium.crypto_secretstream_xchacha20poly1305_TAG_MESSAGE;
    if (result.tag !== expectedTag) {
      throw new Error(
        `secretstream tag mismatch at chunk ${i}: expected ${expectedTag}, got ${result.tag}`,
      );
    }
    out.push(result.message);
  }
  return out;
}
