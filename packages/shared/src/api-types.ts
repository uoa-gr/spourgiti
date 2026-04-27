/** RPC request/response shapes. Real bindings come in Plan 3b. */

export interface ReserveQuotaRequest {
  size_bytes: number;
}

export interface ReserveQuotaResponse {
  ok: boolean;
  free: number;
  token: string | null;
}

export interface CommitUploadRequest {
  token: string;
  recipient_id: string;
  transport: 'cloud' | 'p2p';
  storage_object: string | null;
  size_bytes: number;
  encrypted_manifest: Uint8Array;
  manifest_sig: Uint8Array;
  wrapped_key: Uint8Array;
}

export interface CreateProfileRequest {
  username: string;
  ed25519_public_key: Uint8Array;
  recovery_blob: Uint8Array;
  recovery_kdf_params: { salt: Uint8Array; ops_limit: number; mem_limit: number };
}

export interface UsernameAvailableRequest {
  username: string;
}

export interface UsernameAvailableResponse {
  available: boolean;
}
