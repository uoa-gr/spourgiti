import { getSupabaseClient, createProfile } from '@liaskos/supabase-client';
import { IdbBrowserKeystore } from '@liaskos/keystore';
import {
  buildNewIdentity,
  unwrapWithPassword,
  unwrapWithRecoveryCode,
  wrapWithPassword,
  bytesToHex,
  hexToBytes,
} from './crypto-binding.js';
import type { RecoveryKdfParams } from './crypto-binding.js';

const keystore = new IdbBrowserKeystore();

// =========================================================================
// Sign-up
// =========================================================================

export type SignUpResult =
  | {
      ok: true;
      recoveryCodeHex: string;
      privateKey: Uint8Array;
      publicKey: Uint8Array;
    }
  | {
      ok: false;
      reason: 'email_in_use' | 'auth_error' | 'rpc_error';
      message: string;
    };

/**
 * Derive a profile username from the email's local part. Sanitized to
 * `[a-z0-9_]`, truncated to 14 chars, and suffixed with 6 random hex
 * digits to keep the global uniqueness invariant in profiles.username
 * without making the user pick or even see one. Length stays inside
 * the 3–20 char check the RPC enforces.
 */
function deriveUsername(email: string): string {
  const local = email.split('@')[0] ?? 'user';
  const base = local.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 14) || 'user';
  const seed = base.length < 3 ? (base + 'usr').slice(0, 3) : base;
  const suffix = Array.from(crypto.getRandomValues(new Uint8Array(3)))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return `${seed}_${suffix}`;
}

export async function signUp(email: string, password: string): Promise<SignUpResult> {
  const sb = getSupabaseClient();
  const id = await buildNewIdentity(password);

  const { error: authErr } = await sb.auth.signUp({ email, password });
  if (authErr) {
    const msg = authErr.message;
    if (/registered|exists|already/i.test(msg)) {
      return { ok: false, reason: 'email_in_use', message: msg };
    }
    return { ok: false, reason: 'auth_error', message: msg };
  }

  // 6 hex digits = 16M possibilities; collision is negligible. Retry
  // once on the off-chance to keep the contract simple.
  let username = deriveUsername(email);
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await createProfile(sb, {
        username,
        ed25519_public_key: '\\x' + bytesToHex(id.publicKey),
        recovery_blob: '\\x' + bytesToHex(id.recoveryBlob),
        recovery_kdf_params: {
          salt: id.recoveryKdfParams.salt as never,
          ops_limit: id.recoveryKdfParams.ops_limit,
          mem_limit: id.recoveryKdfParams.mem_limit,
        },
      });
      break;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/username_taken/.test(msg) && attempt === 0) {
        username = deriveUsername(email); // re-roll suffix
        continue;
      }
      return { ok: false, reason: 'rpc_error', message: msg };
    }
  }

  await keystore.storeEncryptedKey(id.encryptedKeyForPassword);

  return {
    ok: true,
    recoveryCodeHex: id.recoveryCodeHex,
    privateKey: id.privateKey,
    publicKey: id.publicKey,
  };
}

// =========================================================================
// Sign-in (password)
// =========================================================================

export type SignInResult =
  | { ok: true; privateKey: Uint8Array; publicKey: Uint8Array }
  | {
      ok: false;
      reason: 'auth_error' | 'no_keys_on_device' | 'wrong_password' | 'rpc_error';
      message: string;
    };

export async function signInPassword(email: string, password: string): Promise<SignInResult> {
  const sb = getSupabaseClient();
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) return { ok: false, reason: 'auth_error', message: error.message };

  const stored = await keystore.loadEncryptedKey();
  if (!stored) {
    return {
      ok: false,
      reason: 'no_keys_on_device',
      message: 'No encrypted key on this device',
    };
  }

  let sk: Uint8Array;
  try {
    sk = await unwrapWithPassword(password, stored);
  } catch {
    return { ok: false, reason: 'wrong_password', message: 'Password did not unlock the key' };
  }

  // Fetch the public key from the server's profile so we never trust the
  // local copy alone. Plan 3d adds the TOFU pinning step against this same
  // value; for now we simply read it.
  const { data: userData } = await sb.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) return { ok: false, reason: 'auth_error', message: 'no user id after sign-in' };

  const { data: profile, error: profErr } = await sb
    .from('profiles_public')
    .select('ed25519_public_key')
    .eq('id', userId)
    .maybeSingle();
  if (profErr) return { ok: false, reason: 'rpc_error', message: profErr.message };

  const pkHex = (profile?.ed25519_public_key as string | undefined)?.replace(/^\\x/, '');
  const pk = pkHex ? hexToBytes(pkHex) : sk.subarray(32);

  return { ok: true, privateKey: sk, publicKey: pk };
}

// =========================================================================
// Sign-out
// =========================================================================

export async function signOut(): Promise<void> {
  const sb = getSupabaseClient();
  await sb.auth.signOut();
  // The encrypted key STAYS in IDB so the next login on this device skips recovery.
}

// =========================================================================
// Reset password using recovery code
// =========================================================================
//
// v1 path: requires an active session (the user is already signed in but has
// forgotten their password — e.g., they tapped "use recovery code" while still
// logged in, or they've just signed in and want to rotate). Out-of-band
// recovery (no session) needs Supabase's email reset flow which is deferred
// to v2 per spec section 2.

export type RecoveryResult =
  | { ok: true; privateKey: Uint8Array; publicKey: Uint8Array }
  | {
      ok: false;
      reason: 'no_session' | 'auth_error' | 'wrong_code' | 'rpc_error';
      message: string;
    };

export async function resetWithRecoveryCode(
  codeHex: string,
  newPassword: string,
): Promise<RecoveryResult> {
  const sb = getSupabaseClient();
  const session = await sb.auth.getSession();
  if (!session.data.session) {
    return {
      ok: false,
      reason: 'no_session',
      message: 'recovery requires an active session in v1; sign in first or use email reset (v2)',
    };
  }

  const userId = session.data.session.user.id;

  // Pull recovery_blob + params for this user
  const { data: row, error } = await sb
    .from('profiles')
    .select('recovery_blob, recovery_kdf_params')
    .eq('id', userId)
    .single();
  if (error || !row) {
    return { ok: false, reason: 'rpc_error', message: error?.message ?? 'profile not found' };
  }

  const recoveryBlob = hexToBytes((row.recovery_blob as string).replace(/^\\x/, ''));
  const kdfRaw = row.recovery_kdf_params as { salt: number[]; ops_limit: number; mem_limit: number };
  const kdf: RecoveryKdfParams = {
    salt: kdfRaw.salt,
    ops_limit: kdfRaw.ops_limit,
    mem_limit: kdfRaw.mem_limit,
  };

  let sk: Uint8Array;
  try {
    sk = await unwrapWithRecoveryCode(codeHex, recoveryBlob, kdf);
  } catch {
    return { ok: false, reason: 'wrong_code', message: 'Recovery code did not match' };
  }

  // Update Supabase password
  const upd = await sb.auth.updateUser({ password: newPassword });
  if (upd.error) return { ok: false, reason: 'auth_error', message: upd.error.message };

  // Re-wrap the private key under the new password and persist locally
  const newBlob = await wrapWithPassword(sk, newPassword);
  await keystore.storeEncryptedKey(newBlob);

  // Public key from the same row's profile (use profiles_public for the trimmed shape)
  const { data: pubRow } = await sb
    .from('profiles_public')
    .select('ed25519_public_key')
    .eq('id', userId)
    .maybeSingle();
  const pkHex = (pubRow?.ed25519_public_key as string | undefined)?.replace(/^\\x/, '');
  const pk = pkHex ? hexToBytes(pkHex) : sk.subarray(32);

  return { ok: true, privateKey: sk, publicKey: pk };
}
