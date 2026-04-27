/** Domain types shared between apps/send and the Supabase backend. */

export type Transport = 'cloud' | 'p2p';
export type SendStatus = 'staged' | 'delivered' | 'revoked' | 'expired';

export interface Profile {
  id: string;
  username: string;
  display_name: string | null;
  ed25519_public_key: Uint8Array;
  created_at: string;
}

export interface Send {
  id: string;
  sender_id: string;
  recipient_id: string;
  transport: Transport;
  status: SendStatus;
  size_bytes: number;
  storage_object: string | null;
  encrypted_manifest: Uint8Array;
  manifest_sig: Uint8Array;
  wrapped_key: Uint8Array;
  created_at: string;
  delivered_at: string | null;
  expires_at: string;
}

export interface FileEntry {
  path: string;
  size: number;
  plaintext_sha256: Uint8Array;
  header_offset: number;
}

export interface Manifest {
  v: 1;
  send_id: string;
  sender_id: string;
  recipient_id: string;
  nonce: Uint8Array;
  timestamp: number;
  files: FileEntry[];
  ciphertext_stream_sha256: Uint8Array;
  wrapped_key_sha256: Uint8Array;
  webrtc_dtls_fingerprint: Uint8Array | null;
}
