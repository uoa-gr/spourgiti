import type { FileEntry, Manifest } from '@spourgiti/shared';

export interface Envelope {
  encrypted_manifest: Uint8Array;
  manifest_sig: Uint8Array;
  wrapped_key: Uint8Array;
  body: Uint8Array;
}

export interface VerifyOk {
  ok: true;
  manifest: Manifest;
  files: { entry: FileEntry; plaintext: Uint8Array }[];
}

export type VerifyError =
  | { ok: false; reason: 'manifest_decrypt_failed' }
  | { ok: false; reason: 'signature_invalid' }
  | { ok: false; reason: 'recipient_mismatch' }
  | { ok: false; reason: 'wrapped_key_hash_mismatch' }
  | { ok: false; reason: 'replay_or_stale'; detail: 'nonce_seen' | 'timestamp_out_of_window' }
  | { ok: false; reason: 'ciphertext_hash_mismatch' }
  | { ok: false; reason: 'plaintext_hash_mismatch'; file_index: number }
  | { ok: false; reason: 'truncated_or_tampered_chunk'; file_index: number; chunk_index: number }
  | { ok: false; reason: 'fingerprint_mismatch' };

export type VerifyResult = VerifyOk | VerifyError;
