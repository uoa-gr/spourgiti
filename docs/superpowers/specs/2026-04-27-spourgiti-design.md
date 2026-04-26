# SPOURGITI — Design Specification

**Date:** 2026-04-27
**Status:** Draft for review

## 1. Purpose & Philosophy

SPOURGITI is a desktop application for professional teams that need **absolute authority** over their own data. The core invariant: **no file inside a user's project folder is ever created, modified, or deleted without that user's explicit manual instruction.** The local file system is the sole source of truth; the app observes, tracks contributions, and facilitates secure transfers, but never autonomously changes content.

Files are immutable artifacts: to "edit" a file, the user manually creates a new version (`logo_v2.png`) and may later remove the old one. The app records authorship and origin. Collaboration happens through whole-file change-set exchanges, supervised by humans on both ends. The server (Supabase) holds only ciphertext and routing metadata; it never sees plaintext file content or chat content.

## 2. Stack & Runtime

- **Desktop shell:** Electron, built with `electron-builder`, auto-updated by `electron-updater` against public GitHub releases.
- **Renderer:** React + Vite + TypeScript. Sandboxed; talks to main only through a typed IPC bridge (`contextBridge`).
- **Main process:** Node.js. Owns the file system, SQLite vault, OS keychain, libsodium crypto, `chokidar` watcher, Supabase client, and the updater agent.
- **WebRTC:** runs inside the renderer (Chromium's native `RTCPeerConnection`), driven by `simple-peer`; chunks streamed over IPC to/from main where files live. Avoids the unmaintained `wrtc` Node binding.
- **Local store:** `better-sqlite3` (`asarUnpack: ['**/*.node']`, rebuilt with `@electron/rebuild` per Electron version).
- **Crypto library:** `libsodium-wrappers`.
- **Backend:** Supabase (Auth, Postgres + Realtime, Storage). Row-Level Security on every table.
- **Package manager / monorepo:** `pnpm` workspaces.

## 3. Trust Boundary

| Component | Trust |
|---|---|
| Main process | Trusted. Owns secrets and disk. |
| Renderer | Sandboxed. No direct disk or network. All sensitive ops via IPC. |
| Supabase server | **Untrusted for content.** Trusted only for routing, presence, and ciphertext storage. Every byte that leaves the device is encrypted client-side with keys the server does not hold. |

## 4. Module Layout

```
spourgiti/
  apps/
    desktop/                    Electron main + preload
    renderer/                   Vite + React UI
  packages/
    crypto/                     libsodium wrappers (sealed boxes, XChaCha20-Poly1305 secretstream, Ed25519/X25519 conversion)
    keystore/                   abstract Keystore interface; SafeStorageKeystore impl
    vault/                      SQLite schema, migrations, queries (better-sqlite3)
    fs-watcher/                 chokidar wrapper; emits descriptive events only, never writes
    transfer/                   change-set composer, zstd compression, encryption pipeline,
                                P2P session manager, buffer client. Single entry points:
                                sendUpdate(spec) / receiveUpdate(id)
    supabase-client/            typed wrapper, RLS-aware queries, realtime subscriptions
    chat/                       thread + message store (mirrored), reference token renderer
    updater/                    electron-updater wrapper, GitHub provider config
    shared/                     TS types, IPC contract, error taxonomy
  supabase/
    migrations/                 SQL migrations
    policies/                   RLS policies
    functions/                  Edge Functions (e.g., reserve_buffer_space, cleanup_buffer)
  .github/workflows/
    release.yml                 tag-driven multi-OS build + publish to GitHub Releases
    ci.yml                      lint, typecheck, unit + RLS tests on PR
```

Each `packages/*` has a documented public interface and is independently testable. The renderer never imports from `vault/`, `keystore/`, or `crypto/` directly — only via the typed IPC contract in `shared/`.

## 5. Cryptography

### 5.1 Identity keys
- One **Ed25519** key pair per user, generated at sign-up. Public key uploaded to `profiles.public_key`. Private key stays on device.
- The Ed25519 keys are converted to **X25519** for sealed-box operations using `crypto_sign_ed25519_{pk,sk}_to_curve25519`. One identity, two uses (signing + asymmetric encryption).
- Private key at rest: encrypted via Electron `safeStorage` (Windows DPAPI / macOS Keychain / libsecret on Linux), behind a `Keystore` interface so passphrase or hardware-backed implementations can slot in later without changing call sites.

### 5.2 Update payload encryption
For every update:
1. Generate a fresh 256-bit symmetric key `K`.
2. Build manifest + framed file stream. Compress each chunk with `zstd` (lossless).
3. Encrypt the chunk stream with `crypto_secretstream_xchacha20poly1305` — built for streaming, authenticates every chunk, detects truncation/replay. Hardware-independent (unlike libsodium AES-GCM, which requires AES-NI).
4. Sign the manifest hash with sender's Ed25519 key.
5. Wrap `K` for each recipient via `crypto_box_seal(K, x25519(recipient_pk))`. Ephemeral pubkey is attached by the sealed-box construction.

Recipients verify the signature (using sender's cached public key) before decrypting.

### 5.3 Chat encryption
- Each `chat_thread` has a per-thread symmetric key `T`, generated at thread creation.
- `T` is `crypto_box_seal`-wrapped per member into `chat_thread_members.wrapped_key`. When a member is added later, any current member re-wraps `T` for them.
- Messages: single-shot `crypto_aead_xchacha20poly1305_ietf_encrypt` with random 192-bit nonce. Server stores ciphertext only.

## 6. Data Model

### 6.1 Supabase (RLS on every table)

```
profiles            id (auth.users.id), username, display_name, public_key (Ed25519, bytea), created_at
projects            id (uuid), name, owner_id, created_at
project_members     project_id, user_id, role (admin|member), added_at  -- PK (project_id, user_id)
buffer_objects      id, sender_id, project_id (nullable; null = user-to-user transfer),
                    object_key (random), size_bytes, sha256, created_at
buffer_recipients   buffer_id, recipient_id, fetched_at (nullable), wrapped_key (bytea)
                    PK (buffer_id, recipient_id)
buffer_quota        single-row table: total_capacity_bytes, used_bytes
                    -- maintained by triggers on buffer_objects insert/delete
chat_threads        id, scope (project|dm), project_id (nullable), title, created_by, created_at, last_message_at
chat_thread_members thread_id, user_id, joined_at, wrapped_key (bytea)
                    -- for DM threads, exactly two rows
chat_messages       id, thread_id, sender_id, ciphertext (bytea), nonce (bytea), created_at
data_requests       id, requester_id, target_id, message, ref_project_id (nullable),
                    ref_path (nullable), status (pending|accepted|declined|fulfilled), created_at
```

**Storage bucket:** `sync-buffer` (private). RLS-equivalent policies: only sender can upload to keys they own; only listed recipients can download; only sender can delete.

**Edge Functions / RPCs:**
- `reserve_buffer_space(size bytes) → {ok, free, requested}` — atomic check-and-bump on `buffer_quota.used_bytes` before upload.
- `cleanup_buffer_object(buffer_id)` — invoked when last `buffer_recipients.fetched_at` flips non-null, OR when last unfetched recipient is removed from the project (recipient-removal eviction). Deletes storage object + rows; triggers decrement `used_bytes`.
- Buffer entries have **no TTL**. They live until either (a) all recipients have fetched, or (b) the sender revokes manually, or (c) the last unfetched recipient leaves/is-removed from the project.

### 6.2 Local SQLite (`vault.db`, per device)

```
projects            id (uuid matching .project-id), name, folder_path,
                    last_seen_path, status (linked|missing|relocated)
project_members_cache  project_id, user_id, username, public_key, role
files               project_id, relative_path, sha256, size, mtime,
                    introduced_by_user_id, parent_file_sha (nullable, version chains)
sync_points         project_id, peer_user_id, manifest_sha256, created_at
                    -- last common state per (project, peer) pair
updates_outbound    id, project_id, recipients_json, status (composing|sent|revoked),
                    transport (p2p|buffer), buffer_object_id (nullable), created_at, sent_at
updates_inbound     id, project_id (nullable for user-to-user), sender_id, transport,
                    status (pending|merged|declined), received_at, merged_at
chat_threads_cache  + chat_messages_cache    -- offline-readable mirror
keystore_meta       key_handle (opaque pointer to OS keychain entry), created_at
schema_version      single row, runs migrations at app start before any read
```

Project-folder marker: hidden file `.project-id` containing the project UUID, written at project creation. Folder relocation is detected by walking the saved path; if missing, status flips to `missing` and the user is prompted to relocate. Any folder containing a matching `.project-id` re-links seamlessly.

## 7. Update Lifecycle

### 7.1 Composing (sender)
1. User clicks "Send Update" on project P. Vault loads `sync_points[P, recipient_r]` for each chosen recipient.
2. Walker compares current folder against `files` table → emits diff `{added, removed, identityChanged}`. Identity = `sha256(content) + relative_path`. Mtime is never used for equality.
3. UI shows the diff per recipient; user deselects items, picks transport (P2P or buffer).
4. Packaging pipeline (identical for both transports):
   - Manifest JSON: `{updateId, projectId|null, baseManifestSha, addedFiles[{path, sha256, size}], removedPaths[], introducedBy{path: userId}}`.
   - Framed stream of length-prefixed records (manifest + each new file's content). No symlinks, no real tar — keep it simple and deterministic.
   - Compress chunks with `zstd`.
   - Encrypt with `crypto_secretstream_xchacha20poly1305` using fresh symmetric key `K`.
   - Sign manifest hash with sender's Ed25519 key.
   - Per recipient: `wrappedKey_r = crypto_box_seal(K, x25519(recipient_pk))`.
5. Transport:
   - **P2P:** signaling on Supabase broadcast channel `signal:{senderId}:{recipientId}` (offer/answer/ICE), then WebRTC data channel streams chunks. Wrapped key + signature ride in the first frame.
   - **Buffer:** `reserve_buffer_space(size)` RPC. If OK, multipart upload to `sync-buffer/{objectKey}` → insert `buffer_objects` + one `buffer_recipients` row per recipient. CDC notifies recipients.
6. After all transports confirm, sender writes new sync point and marks update **Sent**.

### 7.2 Receiving
1. Notification arrives via CDC (`buffer_recipients` insert) or P2P signaling broadcast.
2. User clicks "Receive Update" → fetch payload → unwrap `K` via `crypto_box_seal_open` with own X25519 key → verify Ed25519 signature on manifest → stream-decrypt + decompress chunks into staging dir `{projectFolder}/.spourgiti/staging/{updateId}/`. The live project folder is not touched yet.
3. Merge wizard categorises the manifest:
   - **New** files/folders — user picks which to import.
   - **Deletions** — user decides whether to apply locally.
   - **Conflicts** — same `relative_path`, different `sha256` than `baseManifestSha` says it should be. User resolves: keep local, keep remote, or rename remote to `name (from {sender}).ext`.
4. On confirm, atomic rename from staging into project folder (per file, same volume). Update vault `files` and `sync_points[P, sender]`. Mark **Merged**. If declined, staging is deleted; sync point unchanged.
5. Buffer cleanup: when the last `buffer_recipients.fetched_at` flips non-null, server deletes the storage object + rows. Same cleanup runs when the last unfetched recipient is removed from the project.

### 7.3 User-to-user data exchange (project-independent)
- Same packaging pipeline with `projectId = null`.
- Sender picks arbitrary file/folder paths from disk. Receiver chooses a save location in the merge wizard (no auto-merge into a project).
- A **request** is a `data_requests` row, often originated from a chat reference chip. Accepting opens the standard "Send Update" composer pre-filled with the requested path and recipient.

### 7.4 Initial project clone
- Treated as `update_from(empty_state)` — same code path. Any project member can serve. Selective tree picker is enabled in the merge wizard from the very first clone; remaining folders can be requested later. Buffer is used opportunistically when the snapshot fits in the global pool's free space, otherwise P2P. No special "clone" code.

### 7.5 Selective subset transfers
The merge wizard's tree picker is the single mechanism for "fetch only part of an update," used for both initial clones and subsequent updates. Skipped items remain available to fetch later via a separate request.

## 8. Chats

- **Threads:** any project member can create new named threads inside a project (separation of concerns: `#general`, `#design-review`, etc.). Either party in a 1:1 user pair can create new named threads between the two of them. Thread list sorted by `last_message_at`.
- **Messages:** text only. No attachments. No typing indicators or read receipts in v0.
- **References** are structured tokens embedded in plaintext message bodies:
  - `[[ref:project:{uuid}]]` — renders as a project chip.
  - `[[ref:file:{uuid}:{relPath}:{sha256}]]` — renders as a file chip.
  Renderer parses tokens into chips. Behaviour:
  - Receiver has the project locally and `sha256` matches → "Open in folder" / "Reveal in explorer."
  - Missing → "Request from {sender}" → opens the user-to-user data-request flow.
  - References are pure metadata. No file payload travels through chat.

## 9. Cloud Sync Buffer Governance

- **Single global pool.** `buffer_quota.total_capacity_bytes` is a configured constant; `used_bytes` is maintained by triggers on `buffer_objects` insert/delete.
- **Gating:** before any upload the client calls `reserve_buffer_space(size)`. The RPC performs an atomic check-and-bump under a lock; a successful return reserves the space until the upload either completes (commits) or aborts (rolls back).
- **No TTL.** Packages live until either:
  1. All recipients fetch (the last `fetched_at` flips non-null) → server deletes the package.
  2. Sender manually revokes from their outbox.
  3. The last *unfetched* recipient is removed from the project → server deletes the package (recipient-removal eviction).
- **Sender outbox UI:** lists every pending buffered package the user has uploaded, with per-recipient fetch status, with a Revoke button. This is the only knob the sender has for early cleanup.
- **Why this satisfies "no TTL" without wedging the pool:** clock-driven expiry is forbidden; the pool only frees space on legitimate state transitions (fetch / revoke / departure). Departed members do not permanently consume quota.

## 10. Authentication & Identity

- Supabase Auth with email + username + password. Username uniqueness enforced server-side.
- On sign-up: client generates Ed25519 key pair → uploads public key to `profiles` → stores private key via `Keystore`.
- All identity references in the system use Supabase user IDs; usernames are display-only.

## 11. Error Handling & Recovery

| Failure | Behaviour |
|---|---|
| P2P connect fails (NAT, peer offline) | Surface immediately; offer fallback to buffer if size fits the global pool. |
| Buffer upload exceeds quota | RPC returns `{ok:false, free, requested}`; UI shows shortfall and suggests P2P or revoking own pending packages. |
| Decrypt or signature verification fails | Drop the package; show "tampered or wrong recipient — contact sender." Never partial-merge. |
| Project folder missing on launch | Project enters `missing` state with a banner offering "Relocate." Watcher pauses; outbound updates blocked; inbound stays queued. |
| Conflict during merge | Always user-resolved. "Keep both" creates `name (from {sender}).ext` (deterministic naming). |
| Auto-update download fails | Toast notifies; user keeps using current version. Updater never crashes the app. |
| Crash mid-merge | Staging dir survives restart. On next launch the vault sees an unfinished merge and offers Resume or Discard. |
| Schema migration failure | App refuses to start, surfaces the error, and instructs the user to back up `vault.db` before trying again. No automatic destructive recovery. |

## 12. Build, Release, Auto-Update

- **Build:** `electron-builder.yml` declares targets — Win `nsis`, mac `dmg` + `zip`, Linux `AppImage` + `deb`. `publish: github` with `vPrefixedTagName: true`. `asarUnpack: ['**/*.node']` for `better-sqlite3`.
- **Release CI** (`.github/workflows/release.yml`): triggered on tag `v*`, matrix-builds across `ubuntu-latest`, `macos-latest`, `windows-latest`, runs `electron-builder --publish always`. Code-signing is gated on env-var presence (`WIN_CSC_LINK`, `CSC_LINK`, etc.) — absent → unsigned build proceeds; present → signed. **Adding signing later is a CI-secret change, no code change.**
- **Auto-update:** `autoUpdater.checkForUpdatesAndNotify()` 30 s after launch and every 6 h while running. User sees a "Update available — restart to apply" toast. Provider: `github` (public).
- **Versioning:** SemVer. Pre-1.0 minor bumps may break the vault schema; the migration runner runs at app start before any DB read and refuses to start on a vault from a future schema version.

## 13. Testing Strategy

- **Crypto** — vector tests against libsodium spec, full round-trip tests, signature-tamper detection, wrong-recipient detection, truncated-stream detection.
- **Vault** — golden-file migration tests; in-memory SQLite for unit tests; foreign-key constraint coverage.
- **Transfer** — composer determinism (same inputs → same manifest hash); end-to-end loopback (sender + receiver in one process, mock transport); chunk-boundary fuzz.
- **Supabase RLS** — `pgTAP` / `supabase test db` against a local Supabase stack. Required cases:
  - Non-member cannot read another project's `buffer_objects`.
  - Non-member cannot fetch wrapped keys not addressed to them.
  - Non-member cannot read other users' DM threads or messages.
  - Sender can revoke own buffer objects; admins cannot revoke for others.
  - `reserve_buffer_space` is atomic under concurrent calls.
- **E2E** — Playwright driving two Electron instances on one machine, full send/receive roundtrip via real WebRTC (loopback) and via a local Supabase stack.
- **Manual matrix** — Windows SmartScreen on first install, macOS Gatekeeper unsigned-app flow, Linux AppImage launch.

## 14. Out of Scope (v2+)

- Granular permissions beyond admin/member (contributor vs. reviewer).
- Activity timeline view of file additions/deletions.
- Vault export/import for disaster recovery.
- Customizable conflict auto-naming.
- Hardware-backed keys (TPM / Secure Enclave).
- Chat attachments, typing indicators, read receipts.
- Mobile clients.

## 15. Glossary

- **Project** — a local folder marked with a `.project-id` UUID, registered with Supabase, with a member roster.
- **Update** — a change-set since the last sync point with a given recipient: added files, removed paths, conflicts.
- **Sync point** — manifest hash of the last common state between this device and a specific peer for a specific project. One per `(project, peer)` pair.
- **Vault** — local SQLite database of all metadata for this device.
- **Cloud Sync Buffer** — global Supabase Storage pool holding encrypted update packages awaiting fetch.
- **Reference** — structured token in a chat message pointing to a project or file by metadata only; carries no payload.
