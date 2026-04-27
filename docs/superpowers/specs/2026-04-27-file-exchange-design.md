# File Exchange — Design Specification

**Date:** 2026-04-27 (rev. 2026-04-28 after multi-reviewer pass)
**Status:** Approved for Plan 3
**Supersedes for the file-sharing scope:** [2026-04-27-file-exchange-design.md](2026-04-27-file-exchange-design.md). The original desktop spec covered three features (project file sharing, messaging, secure exchange) inside one Electron app. After Plan 1's release-pipeline pain and the realisation that the three features have very different shapes, the project pivots to **three standalone web apps**, of which *File Exchange* is the first.

---

## 1. Purpose

A web app for **end-to-end encrypted file transfer between named users**. The wedge is *cryptographically known sender to a known recipient* — every send is signed by an Ed25519 identity bound to a username, with continuity checks that warn loudly on key change. Server (Supabase) only ever sees ciphertext and minimal routing metadata.

Two transports back the same wire format. **The transport is an implementation detail; the user sees a single "Send" action.**

- **Cloud (default for offline recipients or smaller files)** — ciphertext lives in Supabase Storage until the recipient fetches it. Bound by per-user pending-cap and a global pool. Auto-deleted on delivery, on revoke, or after TTL.
- **Peer-to-peer (default for larger sends with online recipients)** — direct WebRTC data channel, signalled through Supabase Realtime. No Supabase Storage hit. No size limit.

Selection is automatic; an "Advanced" disclosure offers `Force direct (P2P)` for users who want to bypass the server entirely.

The product is **not** a folder-sync tool. The folder-sync workflow lives in the future *project file sharing* app.

## 2. Out of scope (v1)

- **Multi-device key sync.** v1 = account is bound to the device that signed up; logging in elsewhere prompts the user to install on the original device. The recovery code from §6 covers password loss only, not multi-device.
- Group sends (1 sender → many recipients in one go) — v2.
- No-account "send to a link" mode — v2 (deferred deliberately; Send's wedge is named-recipient, not anonymous).
- Drag-and-drop onto the inbox — v2.
- Read receipts / download notifications — v2.
- Resumable uploads (TUS) — v2.
- Password-protected link mode separate from account auth — v2.
- "Reading mode" / Atkinson Hyperlegible alternate font — v2.
- Self-host / OSS the SPA — v2 (flagged as differentiator early).
- SRI / signed bundle for the SPA — v2; document the Vercel-trust assumption in §11.
- WebAuthn-wrapped private key (replaces Argon2id) — v2.
- Account deletion flow — v2.
- Fuzz tests on canonicalization / signing — v2.
- Mobile WebRTC wake-lock — document the limitation in §12; full handling v2.
- Email confirmation, password reset by email link — v2 (recovery code at signup is v1's recovery story).
- Search, tags, notes, public links, custom TTL — v2.

## 3. Trust boundary

| Component | Sees what | Does not see |
|---|---|---|
| Browser (SPA + crypto) | Plaintext, private key in memory only after password unlock | — |
| Supabase Auth | email, bcrypt(password), session JWT | private key, plaintext file content, plaintext filename |
| Supabase Storage | XChaCha20-Poly1305 ciphertext blobs at random paths | manifest, filenames, plaintext content, recipient identity (storage objects are addressed by `${sender_id}/${send_id}.bin`; recipient identity is in Postgres, not the path) |
| Supabase Postgres | sender_id, recipient_id, send_id, ciphertext size, timestamps, public_key directory, **encrypted manifest blob** (filename + plaintext hash live inside the encrypted manifest) | the contents of the encrypted manifest, the wrapped key (which is bytea but useless without the recipient's X25519 secret) |
| Supabase Realtime | postgres_changes notifications + opaque WebRTC SDP/ICE during P2P | secret material |
| Vercel/CF static host | the static SPA bundle | runtime data |

**Accepted residual leakage:** social graph (which user sent to which user, when, ciphertext size). Removing it requires onion routing or sealed-sender techniques out of scope for v1. Documented openly so users know.

**Trust assumption explicitly recorded for v2:** the SPA bundle integrity depends on Vercel + the build pipeline. A compromised host can replace the bundle with a key-exfiltrating one at next reload. SRI + published bundle hash mitigates this — v2 work item.

## 4. Cryptography

We reuse the libsodium primitives we wrote and tested in `@liaskos/crypto` during Plan 2. The package gains a dual `exports` map (Node entry keeps the existing `createRequire` shim; new browser entry uses native ESM `import sodium from 'libsodium-wrappers'`). The 18 Plan 2 tests stay valid; a new Vitest browser-mode run pins parity.

### 4.1 Identity keys

- One **Ed25519** keypair per user, generated client-side at sign-up.
- Convert to **X25519** for sealed-box operations via `crypto_sign_ed25519_{pk,sk}_to_curve25519`. One identity, two roles.
- Public key uploaded to `profiles.ed25519_public_key` (renamed from "public_key" to avoid future confusion if a second curve appears).
- Single-key compromise breaks both signing and decryption. Accepted for v1 simplicity.
- Private key never leaves the browser.

### 4.2 Private-key storage on the client

- Encrypted with a **password-derived key** (libsodium Argon2id, **`OPSLIMIT_INTERACTIVE` / `MEMLIMIT_INTERACTIVE`** ≈ 64 MB / 0.1 s). Mobile Safari survives this; iOS WASM has a ~380 MB cap and `MODERATE` (256 MB) routinely OOMs there. Trade-off accepted for v1; the v2 path is WebAuthn-wrapped keys which sidestep the question entirely.
- Salt: 16 random bytes, fresh per user, stored alongside the ciphertext.
- Stored in IndexedDB as `{ ciphertext_private_key, salt, ops_limit, mem_limit, kdf_version }` keyed `id='self'`. `kdf_version` lets v2 migrate users to stronger params without breaking v1 ciphertexts.
- The user's account password drives the KDF. The Supabase JWT is independent (see §6). Losing the JWT does not expose keys; losing the password does not lose Supabase access (you can sign in but cannot decrypt).
- "Remember me on this device" is **not** offered in v1. Each tab opening prompts for the password, decrypts the private key once into JS heap memory, and holds it for the session. (UX reviewer flagged this as friction; revisit when WebAuthn lands.)

### 4.3 Recovery code

At signup, after the keypair is generated, the client derives a **secondary KEK** from a 24-byte random "recovery code" (libsodium Argon2id, `INTERACTIVE`) and stores a second copy of `ciphertext_private_key` encrypted under it inside `profiles.recovery_blob` (server-visible bytea — the server cannot decrypt it).

- The recovery code is shown to the user **once**, at signup, with a non-dismissable confirmation: "Save this. Without it, a forgotten password loses all messages sent to this account."
- The user can later "reset password" by entering the recovery code: the client decrypts the private key with the code-derived KEK, re-encrypts under a new password-derived key, replaces the local `ciphertext_private_key`, and uploads a new `recovery_blob` (same code, fresh salt).
- The recovery code is also a backup of the identity if the local IndexedDB is wiped.
- This pattern is the same as Bitwarden / Standard Notes / many password managers; no novel cryptography.

### 4.4 Send-payload encryption

Every send produces a signed envelope. The envelope is the unit that flows over either transport unchanged.

#### Inputs
- One or more **plaintext files** (multi-file is supported per decision 7).
- A single fresh **256-bit symmetric key `K`** generated per envelope.
- The **recipient's X25519 public key** (derived from their Ed25519 `profiles.ed25519_public_key`).
- The **sender's Ed25519 secret key**.

#### Per-file body
Each file is streamed through `crypto_secretstream_xchacha20poly1305` keyed with `K`. 64 KB chunk size. The 24-byte secretstream header is prepended to the chunk stream. The last chunk carries `TAG_FINAL` so truncation is detected. Resulting per-file ciphertext: `header || chunk_1 || chunk_2 || ... || chunk_N`.

#### Manifest
A binary structure (canonical encoding via **JSON Canonicalization Scheme, RFC 8785** — a defined canonicalization, not "informal canonical JSON") containing:

```
{
  v: 1,                          // wire format version
  send_id: <uuid>,
  sender_id: <uuid>,
  recipient_id: <uuid>,
  nonce: <16 random bytes>,      // anti-replay
  timestamp: <unix seconds>,
  files: [
    { path: <relative>, size: <bytes>, plaintext_sha256: <32 bytes>, header_offset: <bytes> },
    ...
  ],
  ciphertext_stream_sha256: <32 bytes>,    // hash of concatenated per-file ciphertexts
  wrapped_key_sha256: <32 bytes>,           // hash of crypto_box_seal(K, recipient_x25519_pk)
  webrtc_dtls_fingerprint: <bytes or null>  // P2P only; binds the channel
}
```

The manifest is **encrypted to the recipient** (per decision 3) using `crypto_box_seal(JCS(manifest), recipient_x25519_pk)`. The **encrypted manifest** is what gets stored in Postgres / signaled over Realtime / sent over P2P.

The manifest hash (over the JCS bytes, before encryption) is **signed by the sender's Ed25519 key** with `crypto_sign_detached`. This signature is server-visible bytea but binds nothing the server can read on its own.

#### Wrapped key
`wrapped_key = crypto_box_seal(K, recipient_x25519_pk)` — the standard sealed-box construction, anonymous, ~80 bytes.

#### Verification on receive
1. Decrypt the manifest envelope with the recipient's X25519 secret key.
2. Verify the manifest signature against `manifest_hash = SHA256(JCS(manifest))` and the cached/looked-up sender's Ed25519 public key. **Fingerprint pinning** kicks in here (§4.5).
3. Verify `manifest.recipient_id === self`. Reject otherwise — prevents forwarded-replay.
4. Verify `manifest.wrapped_key_sha256 === SHA256(observed_wrapped_key)`. Catches storage-write tampering of the wrapped key.
5. Verify `manifest.timestamp` is within ±48 h of now. Replay window.
6. Verify `manifest.send_id` not seen before in IndexedDB (anti-replay log, capped 10k entries TTL'd by timestamp).
7. Unwrap `K` via `crypto_box_seal_open`.
8. Stream-decrypt the ciphertext, verifying each chunk's tag and asserting the final chunk has `TAG_FINAL`. Recompute the running `ciphertext_stream_sha256` and assert equality with the manifest. **Recompute each file's `plaintext_sha256` and assert equality.** Fail-closed at any mismatch.
9. For P2P: assert the established WebRTC channel's DTLS fingerprint equals `manifest.webrtc_dtls_fingerprint`. Mitigates Realtime signaling hijack.

The signed manifest binds **sender, recipient, send_id, nonce, timestamp, file metadata, ciphertext content hash, wrapped key hash, and (for P2P) DTLS fingerprint**. A malicious recipient cannot forward and re-attribute; a Storage-write attacker cannot swap the wrapped key; a Realtime hijacker cannot redirect P2P; a replayed envelope is rejected on the nonce or timestamp check.

### 4.5 Public-key trust (fingerprint pinning)

On the very first time the user *sends to* (or receives from) a given recipient/sender, the client caches `(user_id, ed25519_public_key)` in IndexedDB with a `first_seen_at` timestamp. Subsequent operations require a match. On mismatch — i.e., the server returned a different key — the UI shows a hard-block warning ("This person's identity key has changed since you last interacted with them. They may have re-installed, or this could be an attempted impersonation. Verify out of band before continuing.") with a deliberate "I trust this new key" override and a record of the fact in the local log.

This is TOFU pinning, not perfect, but it converts a silent server compromise into a visible one. The server cannot rotate a user's key undetected.

A small **safety number** (4-word + 6-digit, BIP-39-derived from `SHA256(public_key || username)`) is shown in the recipient picker so users can verify out of band if they want.

## 5. Data model

### 5.1 Supabase Postgres (RLS on every table)

```sql
-- Schema lives in supabase/migrations/*.sql, applied via supabase CLI in CI.
-- "Apply via Supabase MCP" is a dev-time convenience only; production goes through
-- `supabase db push` from the migrations directory.

create extension if not exists citext;
create extension if not exists pg_trgm;

create table profiles (
  id                       uuid       primary key references auth.users(id) on delete cascade,
  username                 citext     unique not null,
  display_name             text,
  ed25519_public_key       bytea      not null check (octet_length(ed25519_public_key) = 32),
  recovery_blob            bytea      not null,                          -- encrypted-private-key under recovery-code-derived KEK
  recovery_kdf_params      jsonb      not null,                          -- { salt, ops_limit, mem_limit }
  created_at               timestamptz not null default now(),
  check (username ~ '^[a-z0-9_]{3,20}$')
);

create index profiles_username_trgm on profiles using gin (username gin_trgm_ops);

create table sends (
  id                       uuid       primary key default gen_random_uuid(),
  sender_id                uuid       not null references profiles(id) on delete cascade,
  recipient_id             uuid       not null references profiles(id) on delete cascade,
  transport                text       not null check (transport in ('cloud', 'p2p')),
  status                   text       not null check (status in ('staged', 'delivered', 'revoked', 'expired')),
  size_bytes               bigint     not null,
  storage_object           text,                                          -- only for transport='cloud'
  encrypted_manifest       bytea      not null,                           -- crypto_box_seal output
  manifest_sig             bytea      not null check (octet_length(manifest_sig) = 64),
  wrapped_key              bytea      not null check (octet_length(wrapped_key) = 80),
  created_at               timestamptz not null default now(),
  delivered_at             timestamptz,
  expires_at               timestamptz not null default (now() + interval '7 days'),
  check ((status = 'delivered') = (delivered_at is not null)),
  check ((transport = 'cloud') = (storage_object is not null))
);

create index sends_recipient_status_created on sends (recipient_id, status, created_at desc);
create index sends_sender_created           on sends (sender_id, created_at desc);
create index sends_storage_object           on sends (storage_object) where storage_object is not null;
create index sends_expires_at               on sends (expires_at) where status = 'staged';

alter publication supabase_realtime add table sends;

create table user_quota_state (
  user_id              uuid primary key references profiles(id) on delete cascade,
  pending_bytes        bigint not null default 0,
  updated_at           timestamptz not null default now()
);

create table global_quota_state (
  id                   smallint primary key default 1 check (id = 1),    -- single-row
  total_capacity_bytes bigint not null,
  used_bytes           bigint not null default 0
);

create table pending_uploads (
  token         uuid       primary key default gen_random_uuid(),
  sender_id     uuid       not null references profiles(id) on delete cascade,
  size_bytes    bigint     not null,
  expires_at    timestamptz not null default (now() + interval '15 minutes')
);

create index pending_uploads_expires_at on pending_uploads (expires_at);

create table object_deletion_jobs (
  storage_object   text       primary key,
  enqueued_at      timestamptz not null default now(),
  attempts         int        not null default 0
);
```

**Storage bucket** `send-payloads` (private). Object keys are `${sender_id}/${send_id}.bin`. Storage RLS policies:

```sql
create policy sender_upload on storage.objects for insert
  with check (
    bucket_id = 'send-payloads'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy recipient_download on storage.objects for select
  using (
    bucket_id = 'send-payloads'
    and exists (
      select 1 from public.sends s
      where s.storage_object = storage.objects.name
        and s.recipient_id = auth.uid()
        and s.status = 'staged'
    )
  );
```

**Postgres RLS sketch on `profiles`:** authenticated users SELECT through a `profiles_public` view that exposes only `(id, username, display_name, ed25519_public_key, created_at)` — never `recovery_blob` or `recovery_kdf_params`. Each user can UPDATE their own row only.

**Postgres RLS on `sends`:**
- SELECT: `sender_id = auth.uid() OR recipient_id = auth.uid()`.
- INSERT: only via `commit_upload` RPC; direct inserts denied.
- UPDATE: only via RPCs (`mark_delivered`, `revoke_send`); a `BEFORE UPDATE` trigger asserts that bare UPDATEs from clients are rejected. RLS row-level access does not allow column rewriting — Sec reviewer's concern about a recipient rewriting `wrapped_key` is closed by the RPC-only path.
- DELETE: never directly; cleanup happens via `object_deletion_jobs` worker after status flips to `delivered` / `revoked` / `expired`.

**Realtime Authorization** (using the Realtime RLS preview): a policy on `realtime.messages` admits a client to topic `signal:${send_id}` only if `auth.uid() in (sends.sender_id, sends.recipient_id)` for that row.

### 5.2 RPCs (concrete, not prose)

```sql
-- Atomic global + per-user reservation. 200 MB per-file enforced client-side and re-asserted here.
-- Per-user pending cap = 500 MB (P0-4 in synthesis: kept as anti-abuse, not user-visible quota).
create or replace function reserve_quota(p_size bigint)
  returns table (ok boolean, free bigint, token uuid)
  language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_user_used bigint; v_token uuid;
begin
  if v_uid is null then raise exception 'unauthenticated' using errcode = 'P0001'; end if;
  if p_size > 200 * 1024 * 1024 then
    return query select false, 0::bigint, null::uuid; return;
  end if;

  select coalesce(pending_bytes, 0) into v_user_used from user_quota_state where user_id = v_uid;
  if coalesce(v_user_used, 0) + p_size > 500 * 1024 * 1024 then
    return query select false, (500 * 1024 * 1024 - coalesce(v_user_used, 0))::bigint, null::uuid; return;
  end if;

  update global_quota_state
    set used_bytes = used_bytes + p_size
    where used_bytes + p_size <= total_capacity_bytes
    returning total_capacity_bytes - used_bytes into v_token;

  if not found then
    return query select false, 0::bigint, null::uuid; return;
  end if;

  insert into user_quota_state (user_id, pending_bytes) values (v_uid, p_size)
    on conflict (user_id) do update set pending_bytes = user_quota_state.pending_bytes + p_size,
                                         updated_at = now();

  v_token := gen_random_uuid();
  insert into pending_uploads (token, sender_id, size_bytes) values (v_token, v_uid, p_size);

  return query select true, (select total_capacity_bytes - used_bytes from global_quota_state)::bigint, v_token;
end$$;

-- Validates the storage object exists, then atomically inserts the sends row.
create or replace function commit_upload(
  p_token uuid,
  p_recipient_id uuid,
  p_transport text,
  p_storage_object text,
  p_size_bytes bigint,
  p_encrypted_manifest bytea,
  p_manifest_sig bytea,
  p_wrapped_key bytea
) returns sends language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_pending pending_uploads%rowtype; r sends;
begin
  if v_uid is null then raise exception 'unauthenticated'; end if;
  delete from pending_uploads where token = p_token and sender_id = v_uid returning * into v_pending;
  if not found then raise exception 'invalid_or_expired_token'; end if;
  if v_pending.size_bytes <> p_size_bytes then raise exception 'size_mismatch'; end if;
  -- Storage existence check is best-effort via storage.objects view (server-side); if the row is missing, rollback the reservation.
  if p_transport = 'cloud' and not exists (select 1 from storage.objects where name = p_storage_object and bucket_id = 'send-payloads') then
    update global_quota_state set used_bytes = used_bytes - p_pending.size_bytes;
    update user_quota_state set pending_bytes = greatest(0, pending_bytes - p_pending.size_bytes) where user_id = v_uid;
    raise exception 'storage_object_missing';
  end if;
  insert into sends (sender_id, recipient_id, transport, status, size_bytes, storage_object,
                     encrypted_manifest, manifest_sig, wrapped_key)
    values (v_uid, p_recipient_id, p_transport, 'staged', p_size_bytes,
            case when p_transport = 'cloud' then p_storage_object else null end,
            p_encrypted_manifest, p_manifest_sig, p_wrapped_key)
    returning * into r;
  return r;
end$$;

create or replace function mark_delivered(p_send_id uuid)
  returns void language plpgsql security definer set search_path = public as $$
declare r sends%rowtype;
begin
  update sends set status = 'delivered', delivered_at = now()
    where id = p_send_id and recipient_id = auth.uid() and status = 'staged'
    returning * into r;
  if not found then raise exception 'not_found_or_already_delivered'; end if;
  -- Quota rollback for cloud (P2P never debited the global pool).
  if r.transport = 'cloud' then
    update global_quota_state set used_bytes = greatest(0, used_bytes - r.size_bytes);
    update user_quota_state set pending_bytes = greatest(0, pending_bytes - r.size_bytes) where user_id = r.sender_id;
    insert into object_deletion_jobs (storage_object) values (r.storage_object) on conflict do nothing;
  end if;
end$$;

create or replace function revoke_send(p_send_id uuid)
  returns void language plpgsql security definer set search_path = public as $$
declare r sends%rowtype;
begin
  update sends set status = 'revoked'
    where id = p_send_id and sender_id = auth.uid() and status = 'staged'
    returning * into r;
  if not found then raise exception 'not_found_or_not_staged'; end if;
  if r.transport = 'cloud' then
    update global_quota_state set used_bytes = greatest(0, used_bytes - r.size_bytes);
    update user_quota_state set pending_bytes = greatest(0, pending_bytes - r.size_bytes) where user_id = r.sender_id;
    insert into object_deletion_jobs (storage_object) values (r.storage_object) on conflict do nothing;
  end if;
end$$;

-- Atomic signup-step-2: creates profile + uploads recovery_blob; rolls back auth.users if username taken.
create or replace function create_profile(p_username citext, p_ed25519_public_key bytea,
                                          p_recovery_blob bytea, p_recovery_kdf_params jsonb)
  returns profiles language plpgsql security definer set search_path = public as $$
declare r profiles;
begin
  if auth.uid() is null then raise exception 'unauthenticated'; end if;
  insert into profiles (id, username, ed25519_public_key, recovery_blob, recovery_kdf_params)
    values (auth.uid(), p_username, p_ed25519_public_key, p_recovery_blob, p_recovery_kdf_params)
    returning * into r;
  return r;
exception when unique_violation then
  -- Schedule the auth user for deletion via a separate Edge Function with service role; raise here.
  raise exception 'username_taken' using errcode = 'P0001';
end$$;

-- pg_cron jobs: sweep abandoned reservations + expire stale sends + drain object_deletion_jobs.
select cron.schedule('sweep_pending', '* * * * *', $$
  with expired as (delete from pending_uploads where expires_at < now() returning sender_id, size_bytes)
  update global_quota_state q
    set used_bytes = greatest(0, used_bytes - (select coalesce(sum(size_bytes), 0) from expired));
$$);

select cron.schedule('expire_sends', '*/5 * * * *', $$
  update sends set status = 'expired'
    where status = 'staged' and expires_at < now();
  insert into object_deletion_jobs (storage_object)
    select storage_object from sends where status = 'expired' and storage_object is not null
    on conflict do nothing;
$$);
```

Storage object deletion is performed by a separate Supabase Edge Function on a 1-minute cron that drains `object_deletion_jobs` against the Storage admin API (idempotent — DELETE on a missing object is a no-op). This decouples Postgres atomicity from the Storage REST call.

### 5.3 Browser local state (IndexedDB via `idb`)

A single canonical schema file at `apps/send/src/idb/schema.ts` declares `DB_VERSION = 1` and the upgrade handler. v2 migrations bump the version and add upgrade branches.

```
keystore     id='self'            { ciphertext_private_key, salt, ops_limit, mem_limit, kdf_version }
profile      id='self'            { user_id, username, display_name, ed25519_public_key, ed25519_pubkey_fp }
fingerprints by user_id           { user_id, ed25519_public_key, first_seen_at, manually_trusted_at? }
seen_sends   by send_id           { send_id, seen_at }                  -- replay log, capped 10k, TTL'd by seen_at
inbox_cache  by send_id           { ...projection of sends row, decrypted manifest cache }
outbox_cache by send_id           { ...projection }
```

In-memory only:
- The decrypted Ed25519 private key, after the user enters their password.
- In-flight transfer chunks (streamed; not held whole).

**Multi-tab consistency:** the inbox uses the Web Locks API to serialise decrypt+`mark_delivered` per `send:${id}`. A tab that loses the lock on a `staged` row simply renders "received in another session" if the storage download 404s after status flips.

## 6. Authentication & onboarding

- Supabase Auth, **email + password**. Email confirmation **disabled in v0** — Supabase's `email_confirm` flag set to false; users can sign up and immediately use the account. v1 user base is small enough that abuse is not a realistic concern.

### 6.1 Sign-up flow

1. User enters email, username, password.
2. Client validates username against the regex `^[a-z0-9_]{3,20}$` and calls a `username_available(name)` RPC for an early check (race-free: the unique index in step 6 is the source of truth).
3. Client calls `supabase.auth.signUp({ email, password })`. On success it has a session.
4. Client generates the Ed25519 keypair.
5. Client derives the **password KEK** via Argon2id `INTERACTIVE` and encrypts the private key. Stored in IndexedDB.
6. Client generates a **24-byte random recovery code**, derives a recovery KEK via Argon2id `INTERACTIVE` (fresh salt), and encrypts a second copy of the private key. The encrypted blob and KDF params go to Postgres via the atomic `create_profile` RPC. If the RPC raises `username_taken`, the user is shown the typeahead picker again; the now-orphaned `auth.users` row is reaped by an Edge Function on a 5-minute cron.
7. UI shows the recovery code on a non-dismissable screen with a checkbox: **"I have saved my recovery code somewhere safe."** The screen explains: "If you forget your password, this code is the only way to recover messages already sent to you."
8. UI shows the user their own username + safety number (BIP-39 fingerprint of their Ed25519 key) and routes to inbox.

### 6.2 Login flow

1. `supabase.auth.signInWithPassword`.
2. Client derives the Argon2id KEK from the password.
3. Client decrypts `ciphertext_private_key` from IndexedDB. If IndexedDB has no key (new device), show: **"Your encryption keys live on the device where you signed up. Open File Exchange there to read messages, or use your recovery code to set up a new device."** Below it: a "Use recovery code" affordance.
4. Recovery-code path: client downloads `recovery_blob` from `profiles`, derives the recovery KEK, decrypts the private key, re-encrypts under the password KEK, stores in this device's IndexedDB. Now the device is "registered."

### 6.3 Reset password (uses recovery code)

1. User enters their recovery code on the login screen.
2. Client downloads `recovery_blob` and `recovery_kdf_params` from `profiles`.
3. Decrypt `ciphertext_private_key`. If decryption fails → "Recovery code wrong, or has been rotated."
4. User picks a new password.
5. Client re-encrypts under new password KEK; uploads a new `recovery_blob` (same code, fresh salt — code stays stable until user explicitly rotates it via a v2 affordance).

### 6.4 Logout

Clears in-memory decrypted private key. Encrypted IndexedDB remains so next login on the same device skips the recovery path.

## 7. Send & receive flows

### 7.1 Composing a send

1. User clicks **Send** on the inbox. Composer opens.
2. Picks one or more files (multi-file in v1 per decision 7). Drag-drop on desktop, tap-to-pick on mobile (drag-drop is desktop-only; the picker is the primary affordance).
3. Picks recipient by username via debounced typeahead. The recipient picker shows the recipient's safety number; if `fingerprints` already has a row for them, "Verified previously" appears. If their `ed25519_public_key` from `profiles` differs from the cached fingerprint, a hard-block dialog fires (§4.5).
4. Composer **automatically picks transport**: P2P if (combined size > 200 MB) OR (recipient is online via Supabase Realtime presence and we're feeling generous); Cloud otherwise. An **Advanced** disclosure offers `Force direct (P2P)`. The user does not see the words "Cloud" or "P2P" in the primary flow; they see "Send" and (after click) "Sending…".
5. Composer encrypts: streams each file through `secretstream` keyed with `K`, builds the manifest, encrypts it to the recipient, signs the manifest hash. Per-chunk progress UI; the textual state log is hidden behind "Show details."
6. **Cloud path:** call `reserve_quota`, multipart-upload ciphertext to `send-payloads/${sender_id}/${send_id}.bin`, then call `commit_upload` to atomically insert the `sends` row. The recipient sees a Realtime `postgres_changes` event filtered server-side by `recipient_id=eq.${self}`.
7. **P2P path:** open Realtime broadcast topic `signal:${send_id}` (Realtime Authorization restricts membership to sender + recipient). Send SDP offer including the local DTLS fingerprint, embed that fingerprint in the manifest **before** signing. Wait for SDP answer + ICE. On data channel open, verify the remote DTLS fingerprint equals `manifest.webrtc_dtls_fingerprint` (sender) / `peerConnection.remoteDescription` matches the manifest (recipient). Stream framed chunks. On end-of-stream the recipient calls `mark_delivered` — the same RPC as Cloud (decision: **recipient is delivery authority for both transports**, resolving the §7.1/§5.1 contradiction the synthesizer flagged P0-3).
8. Composer shows a single status line: `Sending to alice…` → `Delivered`. State log behind "Show details."

### 7.2 Receiving

1. Inbox view: rows where `recipient_id = self`, ordered by `created_at desc`. Realtime subscription with server-side filter prepends new ones.
2. User clicks a row → "Download from Bob (3 files, 200 MB total)." Composer opens; user clicks Download.
3. Web Locks API takes a per-`send_id` lock so a sibling tab does not race.
4. Cloud path: stream-download from Storage. P2P path: subscribe to `signal:${send_id}` and receive chunks over the data channel.
5. Verify per §4.4. Fail-closed at any mismatch with the user-facing copy from §12.
6. Decrypted bytes are saved via the **File System Access API** where available (`showSaveFilePicker`), with a **streaming-saver** fallback (`StreamSaver.js` or equivalent) on browsers that lack it. The decrypted plaintext does not buffer fully in JS heap; a 200 MB receive on iOS Safari is feasible.
7. On `TAG_FINAL` of the last chunk and final hash equality, call `mark_delivered`. RPC handles status flip + storage object deletion enqueue.
8. If a sibling tab won the lock and the storage object 404s on download, render: **"This send was already received in another session."** Document the limitation in §12.

### 7.3 Revoke

The sender's outbox view lists `staged` sends with a **Cancel send** action (the verb "revoke" is jargon, replaced everywhere user-facing with "cancel"). Confirm dialog: "Cancel this send? Bob hasn't downloaded it yet." Confirm calls `revoke_send`; storage object is enqueued for deletion. Cancellation does not un-fetch a partially-downloaded P2P chunk stream — that's documented openly in the cancel dialog.

### 7.4 TTL / expiry

`sends.expires_at` defaults to `now() + 7 days`. The `expire_sends` cron flips `staged` rows to `expired` and enqueues their storage objects. The sender's outbox shows a discreet timer; expired rows render greyed with "Expired (the recipient never collected)."

## 8. Visual design

The reference is [liaskos.eu](https://liaskos.eu): cream paper, near-black ink, classical-serif type, Roman-numeral section markers, generous margins. The aesthetic is the differentiation — UX reviewer called it "genuinely differentiated; in a sea of identical SaaS apps, this is brand equity." We keep it. We also fix every accessibility failure the UX reviewer found.

### 8.1 Tokens

```css
--paper            #f6f1e7;   /* cream */
--ink              #1a1a1a;   /* near-black, 15.8:1 on paper, AAA */
--ink-muted        #5a5a5a;   /* 5.4:1 on paper, AA — was #6a6a6a (4.27:1, fail) */
--rule             #5a5a5a;   /* form-field bottom border; was #d8cfbe (1.27:1, fail 1.4.11) */
--accent           #b03a2e;   /* warm red, 5.6:1 — used for primary action border AND error; always paired with text/icon */
--focus-ring       #b03a2e;   /* 2px solid, 2px offset, mandatory on every focusable element */
--shadow           0 1px 2px rgba(0,0,0,0.04);

--font-display     "Cormorant Garamond", "EB Garamond", Garamond, "Times New Roman", serif;
--font-body        "EB Garamond", Garamond, "Iowan Old Style", "Times New Roman", serif;
--font-mono        "JetBrains Mono", "IBM Plex Mono", ui-monospace, monospace;

--body-min         16px;       /* never below this on any viewport */
--body-weight-min  500;        /* Cormorant 400 is too thin for body */
--leading-body     1.6;        /* serif body needs generous leading */
--measure-max      75ch;       /* line-length cap */

/* Fluid type: H1 31.25 / H2 25 / H3 20 / body 16 (desktop)
                  → H1 25  / H2 20 / H3 18 / body 16 (mobile) */
```

### 8.2 Layout

- Single column, max 720 px, centred. Wide page margins on desktop; full width on mobile.
- Manuscript-feel sections with **Roman numerals always paired** with a plain-language label: `II. Inbox` not `II.`. Each numeral carries `aria-label="Section 2: Inbox"` for screen readers.
- Buttons are text-link style; primary buttons get a `--accent` bottom border on hover/focus. No filled rectangles, no rounded corners, no drop shadows.
- Form fields: bottom-border only with `--rule` (now `#5a5a5a`, AA-compliant). **Persistent visible labels above the field** (placeholder is supplemental, never the only label). 44 × 44 px minimum tap target on every interactive element on touch viewports.
- Focus ring: `2px solid var(--focus-ring)` with `2px` offset, applied on `:focus-visible`. Mandatory.
- Reduced motion respected (`@media (prefers-reduced-motion: reduce)`). Progress bars become instantaneous fills, transitions disabled.
- Color scheme: **respect `prefers-color-scheme: dark`** with a neutral fallback: `--paper #1f1c17`, `--ink #e8e2d3`. (Full dark theme is v2; this is the minimum-respect version.)
- Status glyphs (⁂, §, ¶) carry `aria-label="status: …"` and are paired with text. Never glyph-only.

### 8.3 States

Every queue surface has explicitly-designed empty / loading / error states:

- **Empty inbox:** "Nothing has arrived yet. When someone sends you a file it'll appear here. Your address is `@you` — share it with anyone who wants to send to you."
- **Empty outbox:** "Nothing sent yet. **[Send a file]**"
- **Loading:** light italic "Loading…" with a slow-fading underline; no spinner.
- **Network error:** "Couldn't reach the server. Reconnecting…" — auto-retries.
- **Realtime disconnected:** unobtrusive top-right indicator: a single dot pulsing in `--ink-muted` with `aria-label="Live updates disconnected, reconnecting…"`.

### 8.4 Onboarding (5 steps, first-time only)

1. **Welcome:** "File Exchange is end-to-end encrypted. Only you and the people you send to can read your files. Not even we can." [Continue]
2. **Your address:** "This is your address: `@<username>`. Share it with anyone you want to receive from. It works like an email address but only with File Exchange accounts." [Copy] [Continue]
3. **Recovery code:** the recovery-code screen from §6.1. Mandatory checkbox before [Continue].
4. **Empty inbox:** "Nothing here yet. **[Send a file]**" or [Skip for now]
5. **First-send coachmark:** points at recipient field — "Type a username; we'll find them." Then dropzone — "Drop files or tap to pick." No mention of transport.

### 8.5 Help

A `?` glyph in the corner opens a drawer with: the safety-number explanation, the difference from email, the recovery-code reminder, the v1-multi-device limitation. Plain-language, three short paragraphs each.

## 9. Stack

- **Build:** Vite + React + TypeScript (carry over the toolchain).
- **Routing:** React Router v6 — five routes (`/login`, `/signup`, `/inbox`, `/outbox`, `/send/:id?`). Route guards check the `(SESSION, CRYPTO)` state.
- **State:** **`zustand`** (decision: zustand over nanostores, per Arch reviewer P2-2) for the small client state — `cryptoState`, current user profile, in-flight transfers.
- **Crypto:** `@liaskos/crypto` with **dual exports** in its `package.json` `exports` map:
  ```jsonc
  "exports": {
    ".": {
      "browser": "./src/sodium.browser.ts",  // plain ESM import
      "node":    "./src/sodium.node.ts",     // existing createRequire shim
      "default": "./src/sodium.node.ts"
    }
  }
  ```
  All other primitive files (`keys.ts`, `sign.ts`, `seal.ts`, `stream.ts`, `random.ts`) are environment-neutral.
- **Crypto pipeline (encrypt/decrypt/sign/verify) lives in `@liaskos/transfer`** as pure functions (Arch P1-1). `apps/send` only orchestrates transports.
- **Local DB:** IndexedDB via `idb`, schema in `apps/send/src/idb/schema.ts` with versioning.
- **Backend:** Supabase. One project: `file-exchange` (new, in `eu-north-1` org Liaskos). Migrations live in `supabase/migrations/*.sql`, applied via `supabase db push` from CI.
- **Realtime:** `supabase-js` v2. `postgres_changes` for inbox notifications (server-side filter), `broadcast` for WebRTC signaling (gated by Realtime Authorization), `presence` for "is the other peer online".
- **WebRTC:** **native `RTCPeerConnection`**, not `simple-peer` (decision: Arch reviewer's call — no dep, full control, signaling auth integrates cleaner with the signed manifest). ~200 lines, budgeted explicitly.
- **Tooling:** Vitest with **browser mode enabled** (`@vitest/browser` + Playwright provider) for the crypto package's parity tests. Playwright for one E2E (two-user signup → send → receive) against `supabase start` in CI, not a hosted preview.
- **Hosting:** Vercel (preview per PR, production from `main`). `vercel` CLI deploys from CI; no electron-builder.
- **Domain:** TBD; Vercel default works for v1.

## 10. Repository layout

The pivot lets us reuse most of the existing monorepo. The cutover commit drops Electron-era packages and apps and rewires the rest.

```
file-exchange/
  apps/
    send/                       <-- formerly apps/renderer, now the web SPA
      src/
        main.tsx
        App.tsx
        routes/                 login, signup, inbox, outbox, send/[id]
        components/
        idb/
          schema.ts             DB_VERSION + upgrade handler
          accessors/
        store/
          cryptoContext.ts      CryptoState discriminated union (locked|unlocking|unlocked)
        crypto-glue/            thin wrapper around @liaskos/crypto + @liaskos/transfer for the SPA
      public/
      index.html
      vite.config.ts
      package.json
      tsconfig.json
  packages/
    crypto/                     KEEP. Add dual exports map; new sodium.browser.ts entry.
    transfer/                   FILL. Pure-function crypto pipeline (compose envelope, verify envelope).
    keystore/                   REPLACE. New BrowserKeystore interface (storeEncryptedKey, loadEncryptedKey, clear). The Plan 2 Electron impl is removed.
    shared/                     REPLACE. Delete ipc-contract.ts. Add domain.ts (Send, Profile, Transport, SendStatus) and api-types.ts (RPC request/response shapes).
    supabase-client/            FILL. Typed createClient + auto-generated types via `supabase gen types` + RPC wrappers + Realtime helpers.
  supabase/
    migrations/                 SQL migrations applied via `supabase db push` in CI
    functions/                  Edge functions: storage-deletion-worker, orphan-auth-user-reaper
  .github/workflows/
    ci.yml                      pnpm install + typecheck + test + supabase start + Vitest browser
    deploy.yml                  push to main → vercel deploy

DROPPED in cutover commit:
  apps/desktop/
  packages/vault/
  packages/fs-watcher/
  packages/updater-config/
  packages/chat/                (frozen, deleted; tagged in git as `desktop-archive` first)
  electron-builder.yml
  electron-related root devDeps (electron, electron-builder, @electron/rebuild)
  release-builds/
```

A `desktop-archive` git tag is pushed before the cutover so the Electron-era code is recoverable.

## 11. Build, deploy, "auto-update"

- Push to `main` → GitHub Actions runs `pnpm install && pnpm typecheck && pnpm test` (incl. Vitest browser), runs the `supabase-client` integration tests against the live `file-exchange` project, on green Vercel deploys (preview per PR, production from `main`).
- Migrations: `supabase db push` from CI against the `file-exchange` project. (Plan 3f wires this; Plan 3b applies migrations via the Supabase MCP and commits the SQL files to git.)
- Auto-update is browser cache-busting on the new bundle hash. No installers, no signing, no updater package.
- **SRI on the bundle entry chunk + a published bundle hash is v2 work** (documented in §3 as a known trust assumption: a compromised Vercel can push a malicious SPA).

### 11.1 Vercel-native telemetry (added 2026-04-28)

Two Vercel-provided libraries get mounted in `apps/send` at production-build time:

- **`@vercel/analytics`** — page-view + custom-event tracking. Cookieless and privacy-respecting per Vercel's stated GDPR posture. Mounted as `<Analytics />` inside the React tree.
- **`@vercel/speed-insights`** — Web Vitals (LCP, INP, CLS, TTFB, FCP). Mounted as `<SpeedInsights />`.

**Privacy posture for v1:**
- Both are mounted **only after the user has signed in** — anonymous landing-page traffic is not tracked.
- Both honour `Do Not Track` (DNT) and `prefers-reduced-data` automatically (Vercel's stated behaviour) and we do not override.
- No custom events that would correlate file-content shape (sizes, recipients, frequencies) are emitted; only page-view and standard Web Vitals.
- A Settings → Privacy toggle to disable telemetry per-user lands in v2.
- The privacy/help drawer (§8.5) explicitly tells users that anonymized page navigation + Web Vitals are sent to Vercel's analytics.

**Wiring (lands in Plan 3f):**
1. Add `@vercel/analytics` and `@vercel/speed-insights` to `apps/send` deps.
2. In a top-level `<AuthenticatedShell>` component (the inbox/outbox/send routes), include:
   ```tsx
   import { Analytics } from '@vercel/analytics/react';
   import { SpeedInsights } from '@vercel/speed-insights/react';
   ...
   <>
     <Analytics />
     <SpeedInsights />
     <Outlet />
   </>
   ```
3. The unauthenticated routes (`/login`, `/signup`, `/recovery`) do NOT mount these.
4. Update the CSP `connect-src` to allow `https://va.vercel-scripts.com` and `https://vitals.vercel-insights.com` (Vercel's collector endpoints; subject to change — verify against Vercel docs at deploy time).
5. Vercel project settings → Analytics + Speed Insights toggled on (the libraries no-op without it).

**v2 considerations:**
- Real consent dialog with explicit opt-in.
- Aggregated funnel events (signup completion, first-send completion) gated behind that opt-in.
- Self-hostable analytics (Plausible / Umami) as an alternative for the OSS self-host path.

## 12. Failure modes

| Failure | Behaviour | User-visible copy |
|---|---|---|
| Cloud upload exceeds quota | RPC returns `(ok=false, free, requested)` | "This file is 200 MB but you have 120 MB of cloud space left. Send directly instead, or cancel a pending send." |
| P2P signaling fails (peer offline / NAT) | Surface immediately; offer Cloud fallback if size fits | "We couldn't reach Bob's browser. Try again later, or send through our server (encrypted)." |
| Manifest signature verification fails | Drop payload | "We couldn't safely open this file. It may have been changed in transit, or it wasn't meant for you. Ask the sender to send it again." |
| Wrapped key decryption fails | Drop payload, distinct from manifest verify | "This message wasn't sent to you, or your encryption keys have changed. Ask the sender to verify and resend." |
| Secretstream chunk tag mismatch | Drop payload | "The file failed an integrity check while transferring. Ask the sender to resend." |
| `TAG_FINAL` missing on last chunk | Drop payload | "The transfer was cut short. Ask the sender to resend." |
| Plaintext SHA-256 mismatch on receive | Drop payload | (same copy as integrity check) |
| Public-key fingerprint mismatch (TOFU) | Hard-block dialog | "This person's identity key has changed since you last interacted with them. They may have re-installed, or this could be impersonation. Verify with them out of band before continuing." [Cancel] [Trust new key (advanced)] |
| Storage download mid-stream fails | Resumable via Supabase range; on hard fail, restart from chunk 0 | (silent retry up to 3) |
| Recipient browser closed mid-Cloud-receive | Cloud send remains `staged` until next login; `mark_delivered` not called | (no message; row remains in inbox) |
| Sibling tab won the receive lock; Storage 404 | Render specific notice | "This send was already received in another session." |
| `SESSION=active` but `CRYPTO=locked` | Route guard: render password-prompt for unlock, not the inbox itself | "Enter your password to read your messages." |
| Forgot password | Recovery-code path from §6.3 | "Forgot password? Use your recovery code." (link on login screen) |
| Recovery code wrong | Decryption fails distinctly | "That recovery code didn't match. Check that you've got every word and digit right." |
| Auto-update download fails | Browser cache miss is auto-handled | (transparent) |
| Mobile P2P interrupted by screen lock | v1 limitation; surface explicitly | "Heads up: keep this tab open until the transfer finishes. Mobile browsers may pause the connection if the screen locks." (warning before P2P starts on mobile) |

## 13. Testing strategy

- **Crypto package** (`@liaskos/crypto`): keep the 18 Plan 2 tests; add a Vitest browser-mode run (Playwright provider, Chromium) that asserts byte-equality of every primitive with the Node tests.
- **Transfer package** (`@liaskos/transfer`): unit tests of envelope compose + verify with all the §4.4 verification steps as separate test cases (recipient-mismatch rejected, replayed nonce rejected, tampered wrapped_key rejected, tampered ciphertext rejected, missing TAG_FINAL rejected, plaintext-hash mismatch rejected, manifest signature from wrong sender rejected, fingerprint pin mismatch rejected).
- **Supabase backend**: drop pgTAP. Use `supabase-js` with the service-role client in Vitest against a local `supabase start` instance. Tests:
  - non-member SELECT on another user's send returns no rows
  - non-member cannot INSERT a `sends` row directly (only `commit_upload`)
  - recipient cannot UPDATE wrapped_key on their row
  - `reserve_quota` is atomic under concurrent calls (50 parallel reservations)
  - `mark_delivered` enqueues an `object_deletion_jobs` row
  - `revoke_send` only works on `staged` rows belonging to the caller
  - `expire_sends` cron flips stale rows
  - storage RLS denies download when status != 'staged'
- **State-machine tests**: unit tests for the `cryptoState` discriminated union and the route guards across `(SESSION, CRYPTO)` × `(idle, in-flight)` combinations. Includes session-expires-mid-transfer and wrong-password paths.
- **Playwright E2E** (against local `supabase start` in CI): create two users in two browser contexts; user A signs up, sees recovery code; user B signs up; A sends a 1 MB file to B (Cloud); B receives, decrypts, file matches. Two-context P2P loopback test as a stretch goal.
- **WebRTC**: manual two-tab smoke test for v1 P2P; automated harness deferred to v2.

## 14. Deferred to v2 (track here so v1 doesn't half-build any of these)

- Multi-device key sync via QR-pairing or sealed-bundle handoff
- Group sends (one ciphertext, per-recipient wrapped keys)
- Folder sends with directory structure preservation
- Email confirmation, password reset by email, account deletion UI
- Public-link mode (no-account recipient)
- Read receipts / download notifications
- Resumable uploads (TUS)
- Drag-and-drop onto inbox surface
- Mobile WebRTC wake-lock + foreground keepalive
- "Reading mode" / Atkinson Hyperlegible alternate font
- Full dark mode (v1 respects `prefers-color-scheme` with neutral fallback only)
- Self-host / OSS the SPA
- SRI on bundle entry chunk + published hash
- WebAuthn-wrapped private key (replaces Argon2id)
- Custom TTL per send
- Search, tags, notes
- Fuzz tests on canonicalization / signing
- TURN relay for restrictive P2P networks
- Mobile-first redesign
- Account-level quota raise (paid tier)

## 15. Glossary

- **Send / envelope** — one or more files encrypted under one symmetric key, addressed to one recipient, with one signed manifest.
- **Cloud transport** — ciphertext via Supabase Storage; deleted on delivery, revoke, or expiry.
- **P2P transport** — ciphertext via WebRTC data channel; no server hop.
- **Quota** — global Supabase storage budget shared across all users (`global_quota_state`); per-user pending cap (`user_quota_state.pending_bytes`) prevents one user from exhausting the pool.
- **Pending** — a `staged` Cloud send not yet delivered, revoked, or expired.
- **Recovery code** — a 24-byte random secret shown once at signup; the only path back to past messages after a forgotten password.
- **Safety number** — a BIP-39-style fingerprint derived from a user's Ed25519 public key, surfaced in the recipient picker for out-of-band verification.
- **TOFU pin** — the cached `(user_id, ed25519_public_key)` row in IndexedDB. Mismatch = hard block.
