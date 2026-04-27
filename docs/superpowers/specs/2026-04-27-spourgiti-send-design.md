# Spourgiti Send — Design Specification

**Date:** 2026-04-27
**Status:** Draft for review
**Supersedes for the file-sharing scope:** [2026-04-27-spourgiti-design.md](2026-04-27-spourgiti-design.md). The original desktop spec covered three features (project file sharing, messaging, secure exchange) inside one Electron app. After Plan 1's release-pipeline pain and the realisation that the three features have very different shapes, the project pivots to **three standalone web apps**, of which *Spourgiti Send* is the first.

---

## 1. Purpose

A web app for **end-to-end encrypted file transfer between named users**. The server (Supabase) only ever sees ciphertext. Two complementary transports are exposed to the sender per send:

- **Cloud (temporary)** — ciphertext sits in Supabase Storage until the recipient fetches it. Async; works when the recipient is offline. Bound by per-user and per-file size limits.
- **Peer-to-peer (live)** — direct WebRTC data channel between two open browser tabs, signalled through Supabase Realtime. No size limit; no Supabase Storage hit. Requires both peers online.

The user picks the transport per send. If the chosen transport is unavailable (e.g. peer offline for P2P, quota exceeded for Cloud), the UI surfaces it explicitly — never silently switches.

This is **not** a folder-sync product. It is a "drag a file, pick a recipient, send it encrypted" product, with an inbox view of received items. The folder-sync workflow lives in the future *project file sharing* app.

## 2. Out of scope (v1)

- Group sends (1 sender → many recipients in one go) — v2.
- Folders / multi-file bundles — v2; v1 sends one file at a time.
- Mobile-specific UX polish — v1 must be functional on mobile but the design lives on desktop first.
- Magic-link / OAuth / passkeys auth — email + password only.
- Email confirmation / password reset / account deletion UI — v2; we'll just rely on Supabase's defaults for any out-of-band recovery.
- Search, tags, notes, expiring links, public links — v2.
- Custom storage TTL, automatic deletion — v1 deletes a Cloud send the moment the recipient fetches it; otherwise the sender can manually revoke from their outbox.
- Anti-spam / abuse handling — v1 is private (sign-up gated), no rate limits; revisit when there are real users.

## 3. Trust boundary

| Component | Trust |
|---|---|
| Browser (the SPA + crypto library) | Trusted. Owns secrets. |
| Supabase Auth | Trusted with email + bcrypt(password). Never sees private keys, never sees plaintext file content. |
| Supabase Storage | Untrusted blob store. Receives only XChaCha20-Poly1305 ciphertext + per-recipient sealed-box-wrapped keys. |
| Supabase Realtime | Untrusted bus. Carries WebRTC signaling (SDP offers/answers/ICE candidates) and "you have a new send" notifications. No secret material. |
| Supabase Postgres | Untrusted DB. Tables are RLS-locked: every row is either authored by the requesting user or addressed to them. |
| Vercel/CF static host | Serves the static SPA bundle. Has read-only access to the bundle; no secrets. |

## 4. Cryptography

We reuse the libsodium primitives we already wrote and tested in `@spourgiti/crypto` during Plan 2. The package ports to the browser unchanged once the Node-only `createRequire` shim is removed (libsodium-wrappers ships a real ESM build that browsers can consume; only the broken sibling-import path that bit us in Node is irrelevant in browsers).

### 4.1 Identity keys

- One **Ed25519** keypair per user, generated client-side at sign-up.
- The Ed25519 keys are converted to **X25519** for sealed-box operations via `crypto_sign_ed25519_{pk,sk}_to_curve25519`. One identity, two roles.
- Public key uploaded to `profiles.public_key`. Private key never leaves the browser.

### 4.2 Private-key storage on the client

- The user's private key is encrypted with a **password-derived key** (Argon2id from libsodium: `crypto_pwhash`, `MODERATE` ops/mem limits) and stored in IndexedDB.
- On every login, the user enters their account password again to unlock the private key. The session JWT (cookie/localStorage) authenticates them to Supabase; the password unlocks crypto. They are decoupled — losing the JWT does not expose the keys; losing the password does not expose Supabase access (you can still sign in, but you cannot decrypt past payloads).
- "Remember me on this device" is **not** offered in v1. Each tab opening prompts for the password, decrypts the private key once into memory, and holds it for the session.

### 4.3 Send-payload encryption

For every send:

1. Generate a fresh 256-bit symmetric key `K` (`randomKey()`).
2. Stream the file plaintext through `crypto_secretstream_xchacha20poly1305` in 64 KB chunks. Last chunk carries `TAG_FINAL` so truncation is detected. Output: a header (24 bytes) + a list of ciphertext chunks.
3. Sign the file's manifest hash with the sender's Ed25519 key. (Manifest = canonical JSON of `{filename, size, sha256_of_plaintext, sender_id}`.)
4. Wrap `K` for the recipient via `crypto_box_seal(K, x25519(recipient_public_key))`.
5. Send the ciphertext stream + manifest + signature + wrapped key over the chosen transport.

The recipient verifies the signature against the sender's cached public key, unwraps `K` with their X25519 secret, and stream-decrypts the chunks. Failure at any verification step drops the payload entirely and surfaces "tampered or wrong recipient — contact sender."

## 5. Data model

### 5.1 Supabase Postgres (RLS on every table)

```
profiles
  id              uuid       primary key, references auth.users(id) on delete cascade
  username        text       unique, not null
  display_name    text
  public_key      bytea      not null    -- Ed25519, 32 bytes
  created_at      timestamptz not null default now()

sends
  id              uuid       primary key default gen_random_uuid()
  sender_id       uuid       not null references profiles(id)
  recipient_id    uuid       not null references profiles(id)
  transport       text       not null check (transport in ('cloud', 'p2p'))
  status          text       not null check (status in (
                              'staged',     -- ciphertext uploaded (cloud) or session ready (p2p)
                              'delivered',  -- recipient fetched / received
                              'revoked'     -- sender cancelled before delivery
                            ))
  filename        text       not null     -- declared filename (also encrypted in manifest; this is for UI listing)
  size_bytes      bigint     not null     -- ciphertext size for cloud, plaintext size for p2p
  storage_object  text                    -- supabase storage object key, only for transport='cloud'
  wrapped_key     bytea      not null     -- crypto_box_seal output, ~80 bytes
  manifest        bytea      not null     -- signed manifest json
  manifest_sig    bytea      not null     -- ed25519 signature, 64 bytes
  created_at      timestamptz not null default now()
  delivered_at    timestamptz

quota_state
  -- single-row table maintained by triggers on sends insert/delete-where-transport=cloud
  total_capacity_bytes  bigint not null    -- e.g. 800 MB (under Supabase 1 GB free tier)
  used_bytes            bigint not null default 0
```

**RLS policies (sketch):**
- `profiles` SELECT: any authenticated user can read `{id, username, display_name, public_key, created_at}` (so they can wrap keys to anyone). Email column is in `auth.users`, never exposed via `profiles`.
- `profiles` UPDATE: only the row owner.
- `sends` SELECT: rows where `sender_id = auth.uid()` OR `recipient_id = auth.uid()`.
- `sends` INSERT: `sender_id = auth.uid()` and the recipient must exist.
- `sends` UPDATE (status='delivered', delivered_at=now()): `recipient_id = auth.uid()` AND current status = 'staged'.
- `sends` UPDATE (status='revoked'): `sender_id = auth.uid()` AND current status = 'staged'.
- `sends` DELETE: never directly. Server-side function on status transition handles storage cleanup.

**Storage policies on bucket `send-payloads`:**
- INSERT: `sender_id = auth.uid()`, object key prefixed with `${sender_id}/` (enforced via path).
- SELECT (download): `recipient_id = auth.uid()` for the `sends` row whose `storage_object` matches.
- DELETE: only via the server function triggered on `delivered` or `revoked`.

### 5.2 Cloud quota governance

- A Postgres function `reserve_quota(size bytea)` atomically checks `total_capacity_bytes - used_bytes >= size`, returns `(ok, free, requested)`. If `ok=true`, it bumps `used_bytes` and inserts a row in a short-lived `pending_uploads` table. The client uses the returned token to actually upload to Storage; on completion (or failure), it calls `commit_upload` / `rollback_upload`.
- Hard limits for v1: **per-file 200 MB, per-user pending-Cloud 500 MB**.
- The pool has **no TTL**. Three deletion triggers (mirrors the original spec, simplified):
  1. Recipient marks `delivered` → server function deletes the storage object and rolls back `used_bytes`.
  2. Sender revokes from outbox → same.
  3. Recipient is deleted from Supabase Auth → cascade plus orphan-cleanup function deletes any sends still addressed to them.

### 5.3 Browser local state (IndexedDB, accessed via `idb`)

```
keystore   { id: 'self' } -> { ciphertext_private_key, salt, ops_limit, mem_limit }
                            -- the encrypted Ed25519 private key + Argon2id params
profile    { id: 'self' } -> { user_id, username, display_name, public_key, ed_secret_pubkey_hint }
inbox_cache  by send_id   -> { ...projection of sends row }
outbox_cache by send_id   -> { ...projection }
```

In-memory only:
- The decrypted Ed25519 private key (after the user enters their password).
- In-flight transfer chunks for active sends/receives.

## 6. Authentication

- Supabase Auth, **email + password**. Email confirmation **disabled in v0** (signup → instant session). Re-enable when the project has real users.
- Sign-up flow:
  1. User enters email, username, password.
  2. Client validates username uniqueness via a Supabase RPC that checks `profiles` (returns `available` or `taken`).
  3. Client calls `supabase.auth.signUp({email, password})`. On success it has a session.
  4. Client generates Ed25519 keypair, derives an Argon2id key from the password, encrypts the private key, stores ciphertext in IndexedDB.
  5. Client `INSERT`s a `profiles` row with `id = auth.uid()`, `username`, `public_key`. This is gated by an RLS policy `auth.uid() = id`.
  6. UI navigates to the inbox view.
- Login flow:
  1. `supabase.auth.signInWithPassword`.
  2. On success, client derives Argon2id key from the password and decrypts the private key from IndexedDB (which must already be there — this device must have been used for signup, or the user must restore from a future-feature export).
  3. If IndexedDB has no encrypted private key (new device), v1 shows "this account has no keys on this device — sign up again or use the device that has them." Multi-device key sync is out of scope for v1.
- Logout flow: clears the in-memory decrypted private key. Encrypted IndexedDB remains so the user can log in again on the same device.

## 7. Send & receive flows

### 7.1 Composing a send

1. User clicks "Send" on the inbox view, opens the composer.
2. Picks a recipient by username (typeahead against `profiles`, debounced, no contacts list in v1).
3. Drags a file in (or uses the file picker).
4. **Picks transport: Cloud or P2P.**
   - Cloud is the default if size ≤ 200 MB AND the per-user pending-Cloud budget has room.
   - P2P is the default if either Cloud constraint fails OR the recipient is currently online (presence tracked via Supabase Realtime). Both options stay available regardless; the UI just suggests the most likely-to-succeed.
5. Composer streams the file through XChaCha20-Poly1305, wraps `K` for the recipient, signs the manifest.
6. **Cloud path:** call `reserve_quota`, multipart-upload ciphertext to `send-payloads/${sender_id}/${send_id}.bin`, insert a `sends` row with `transport='cloud'`, `status='staged'`. The recipient sees a Realtime event from `postgres_changes` on `sends`.
7. **P2P path:** insert a `sends` row with `transport='p2p'`, `status='staged'`, `storage_object=null`. Then open a Supabase Realtime broadcast channel `signal:${send_id}`, advertise an SDP offer, await the recipient's answer + ICE. Once the data channel opens, push framed chunks end-to-end. When the recipient confirms receipt over the data channel, the sender flips status to `delivered` (RLS allows the recipient to flip it; for P2P the sender flips it at end-of-send). If the recipient never connects, the row stays `staged` until the sender revokes.
8. On confirm, the composer shows a per-chunk progress bar and a log of state transitions ("encrypting → uploading → notified Bob → delivered").

### 7.2 Receiving

1. Inbox view shows `sends` rows where `recipient_id = self`. Realtime subscription auto-prepends new ones.
2. User clicks a row → "Download from Alice (200 MB, encrypted)".
3. **Cloud path:** download ciphertext stream from Storage, verify manifest signature, unwrap `K`, stream-decrypt, save via `<a download>` blob. On final chunk verified, call the `mark_delivered` RPC; server deletes the storage object and bumps `used_bytes` down.
4. **P2P path:** subscribe to the signaling channel for the send, send back an SDP answer, accept incoming chunks over the data channel. Same decrypt path. On `TAG_FINAL`, mark delivered.
5. The decrypted file is offered as a download with the original filename. We never write to local storage; the browser hands the file to the OS via the standard download mechanism.

### 7.3 Revoke

- The sender's outbox view lists their `staged` sends with a "Revoke" button. Clicking flips status to `revoked` (RLS-allowed). Server function deletes the storage object (Cloud) or notifies the recipient's tab to discard any in-flight P2P transfer.

## 8. Visual design

The visual reference is the user's own portfolio at [liaskos.eu](https://liaskos.eu): cream paper background, near-black text, calligraphic / classical-serif type, Roman-numeral section markers, generous margins, manuscript-like layout with the user's name as a recurring header motif.

Concrete tokens for v1:

```
--paper        #f6f1e7   /* cream */
--ink          #1a1a1a   /* near-black */
--ink-muted    #6a6a6a
--rule         #d8cfbe   /* subtle horizontal divider */
--accent       #b03a2e   /* a single restrained warm red, used only for actions and warnings */
--shadow       0 1px 2px rgba(0,0,0,0.04)

--font-display "Cormorant Garamond", "EB Garamond", Garamond, "Times New Roman", serif
--font-body    "EB Garamond", Garamond, "Iowan Old Style", "Times New Roman", serif
--font-mono    "JetBrains Mono", "IBM Plex Mono", ui-monospace, monospace
--scale        major-third (1.250)
```

Layout language:
- A single column ~640–720 px wide, centred, with wide page margins. No sidebars in v1.
- Section markers are Roman numerals (I, II, III) in a heavy display weight, like book chapters.
- Buttons are text-link style with a thin underline on hover; "primary" buttons get a bottom border in `--accent` instead of a filled background.
- Form fields are bottom-bordered only; no full borders, no rounded corners. Calligraphic placeholders, monospace for code-like inputs (handle lookup, send IDs).
- Iconography stays minimal — letter "I" with a footnote-style number for steps; Unicode glyphs (⁂, §, ¶) for status indicators.
- Mobile collapses the column to 100% width with the same margins, but font sizes scale down by one step.
- Dark mode is deferred. The cream-paper feel is the brand.

This is a typography-first, manuscript-feel UI. Modern flourishes (drop shadows, gradients, rounded buttons) are intentionally absent. The aesthetic is library, not SaaS.

## 9. Stack

- **Build:** Vite + React + TypeScript (carry over the toolchain from Plan 1).
- **Routing:** React Router (or TanStack Router); the app has only ~5 routes (`/login`, `/signup`, `/inbox`, `/outbox`, `/send`).
- **State:** local component state + a small `nanostores` or `zustand` store for the in-memory crypto context (decrypted private key + active session). No global state library beyond that in v1.
- **Crypto:** `@spourgiti/crypto` (the Plan 2 package), browser entry point.
- **Local DB:** IndexedDB via `idb`. No SQL.
- **Backend:** Supabase (Auth + Postgres + Storage + Realtime). One project: `spourgiti-send`.
- **Realtime:** `supabase-js` v2 channels — `postgres_changes` for inbox notifications, `broadcast` for WebRTC signaling, `presence` for "is the other peer online".
- **WebRTC:** `simple-peer` (browser build) or hand-rolled `RTCPeerConnection`. Probably the latter — it's not much code and we avoid an opinionated wrapper.
- **Tooling:** Vitest for unit tests, Playwright for an end-to-end test against a hosted preview.
- **Hosting:** Vercel (preview per PR + production from `main`). The repo's existing GitHub Actions get a much simpler `release.yml` — `vercel` CLI deploys, no electron-builder.
- **Domain:** TBD. `send.spourgiti.app` or similar. Not a v1 blocker — the Vercel default URL works for testing.

## 10. Repository layout

The pivot lets us reuse most of the existing monorepo. The big change: drop `apps/desktop`, repurpose `apps/renderer` as the web app, drop the Electron-specific packages.

```
spourgiti/
  apps/
    send/                       <-- formerly apps/renderer; the web SPA
      src/
        main.tsx
        App.tsx
        routes/                 login, signup, inbox, outbox, send/[id]
        components/
        crypto/                 thin glue around @spourgiti/crypto for browser-only use
        supabase/               typed client + queries + realtime helpers
        idb/                    IndexedDB schema + accessors
        webrtc/                 simple-peer or native; signaling client
      public/
      index.html
      vite.config.ts
      package.json
      tsconfig.json
  packages/
    crypto/                     KEEP. Drop the createRequire shim; use the standard ESM import.
    shared/                     KEEP. Strip IPC contract, replace with shared API request/response shapes.
    keystore/                   REPLACE. New browser implementation (Argon2id-encrypted IndexedDB).
    supabase-client/            REUSE the slot for typed Supabase wrappers.
    transfer/                   REUSE the slot for compose/encrypt/decrypt/transport pipeline.
    chat/                       drop or freeze (different app).
    fs-watcher/                 DROP.
    vault/                      DROP.
    updater-config/             DROP.
  supabase/
    migrations/                 SQL migrations applied via Supabase MCP `apply_migration`
    policies/                   RLS policy SQL
    functions/                  Edge functions (reserve_quota, mark_delivered, cleanup_storage_object)
  .github/workflows/
    ci.yml                      pnpm install + typecheck + test, no electron rebuild
    release.yml                 deploy to Vercel on push to main
```

The `apps/desktop`, native rebuild scripts, electron-builder config, electron-updater package, and the entire `release-builds/` artifact pipeline are deleted in the cutover commit.

## 11. Build, deploy, "auto-update"

- Push to `main` → GitHub Actions runs `pnpm install && pnpm typecheck && pnpm test` → on green, Vercel hook deploys the new bundle.
- Auto-update is the browser cache busting on the new bundle hash. No installers, no `latest.yml`, no certificates, no SmartScreen. The user gets the new version when they refresh.

## 12. Error handling & failure modes

| Failure | Behaviour |
|---|---|
| Cloud upload exceeds quota | RPC returns `(ok=false, free, requested)`; UI shows shortfall, suggests P2P or revoking own pending sends. |
| P2P signaling fails (other peer offline / NAT) | Surface immediately, offer Cloud fallback if size fits the budget. |
| Manifest signature verification fails | Drop payload, "tampered or wrong recipient — contact sender." Never partial-decrypt. |
| Storage download mid-stream fails | Resumable via Supabase's range support; if not, restart from chunk 0. |
| Browser tab closes mid-send | Cloud send remains `staged`; sender can revoke or re-send. P2P send is dropped (the data channel is gone); recipient sees nothing arrive. |
| Recipient mark-delivered RPC fails after successful local decrypt | Storage object stays until manual revoke or recipient retries; not a correctness issue — the recipient already has the file. |
| User forgets password | They lose the ability to decrypt past sends on this device. v1 has no recovery; they create a new account. |

## 13. Testing strategy

- **Crypto package:** keep the 18 tests from Plan 2; add a browser-target test run via Vitest's `browser` mode (Chromium under Playwright) to confirm the same primitives produce identical bytes in the browser environment.
- **Supabase RLS:** SQL-level pgTAP-style tests run against a Supabase branch:
  - profile rows are universally readable but only owner-writable
  - sends are visible only to sender or recipient
  - storage uploads are constrained to the sender's path prefix
  - `reserve_quota` is atomic under concurrent calls (use `pg_sleep` + parallel inserts)
- **Web app:** unit tests for the crypto-glue layer; one Playwright end-to-end test that signs up two users, sends a 1 MB file from A to B over Cloud, verifies the decrypted bytes match.
- **WebRTC:** harder to test automatically; manual two-tab-on-one-machine smoke test for v1, automated test deferred.

## 14. v2 candidates (deferred, listed so v1 doesn't try to half-build them)

- Multi-device key sync via a passphrase-derived "recovery code" or a server-side public-key bundle.
- Group sends (one ciphertext per recipient, but one upload, with per-recipient wrapped keys).
- Folder sends.
- Asynchronous P2P with TURN relay for restrictive networks.
- A small "your sends will auto-expire after N days" toggle.
- Email confirmation, password reset, account deletion.
- Public-link sharing (sender drops a recipient_id requirement, recipient uses a one-time token).
- Mobile-first redesign.

## 15. Glossary

- **Send** — one file from one sender to one recipient with one transport.
- **Cloud transport** — ciphertext passes through Supabase Storage, deleted on delivery or revoke. Async.
- **P2P transport** — ciphertext passes through a WebRTC data channel between two open browser tabs. No server hop. Synchronous.
- **Quota** — global Supabase storage budget shared across all users; per-user pending-Cloud cap is enforced on top.
- **Pending** — a `staged` Cloud send not yet delivered nor revoked. Pending sends consume the per-user cap.
