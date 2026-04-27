import { describe, it, expect } from 'vitest';
import type { Envelope, VerifyResult } from '../src/types.js';

describe('transfer types', () => {
  it('Envelope shape compiles', () => {
    const e: Envelope = {
      encrypted_manifest: new Uint8Array(0),
      manifest_sig: new Uint8Array(64),
      wrapped_key: new Uint8Array(80),
      body: new Uint8Array(0),
    };
    expect(e.manifest_sig.length).toBe(64);
  });

  it('VerifyResult discriminates on ok', () => {
    const r: VerifyResult = { ok: false, reason: 'recipient_mismatch' };
    if (!r.ok) expect(r.reason).toBe('recipient_mismatch');
  });
});
