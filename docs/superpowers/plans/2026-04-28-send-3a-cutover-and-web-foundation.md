# Plan 3a — Cutover & Web Foundation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Leave the repo on a green main branch where the Electron-era code is archived in a git tag and removed, the new `apps/send` web SPA boots and renders a stub page, the `@spourgiti/crypto` package works in both Node and browser via a dual-export map, the `@spourgiti/transfer` package is scaffolded with the crypto-pipeline types, the `@spourgiti/shared` package is rewritten to web-only domain types, the `@spourgiti/keystore` package has a fresh browser-targeted interface, an IndexedDB schema file with versioning is in place, the `cryptoState` zustand store skeleton compiles, and CI runs typecheck + Node tests + Vitest browser-mode tests green.

**No backend work in this plan.** Supabase project, migrations, RLS, RPCs, supabase-client wrapper → Plan 3b. Auth flows → 3c. Cloud send/receive → 3d. P2P → 3e. Polish/deploy/E2E → 3f.

**Architecture:** A clean cutover commit drops every Electron-era file in one shot (after a `desktop-archive` tag preserves history). The crypto package gains a `package.json` `exports` map so the browser uses native ESM `import sodium from 'libsodium-wrappers'` and Node uses the existing `createRequire` shim. The new `@spourgiti/transfer` package owns pure-function compose/verify pipeline types; `apps/send` orchestrates transports. The new `@spourgiti/keystore` exposes a browser-only `BrowserKeystore` interface (Argon2id implementation lands in Plan 3c). `@spourgiti/shared` becomes domain types + RPC shapes. The web SPA is a Vite + React + TS app that compiles, boots, and renders a placeholder page.

**Tech Stack:** TypeScript 5.6, Vite 5, React 18, Vitest 2.1 (with `@vitest/browser` + Playwright provider), `idb` 8, libsodium-wrappers 0.7, zustand 5, react-router-dom 6.

**Plan parent:** [docs/superpowers/specs/2026-04-27-spourgiti-send-design.md](../specs/2026-04-27-spourgiti-send-design.md)
**Predecessor plan:** [Plan 2 — crypto + keystore + vault libraries](2026-04-27-crypto-keystore-vault.md)

---

## File structure (end-state of Plan 3a)

```
spourgiti/
  apps/
    send/                                 NEW (formerly apps/renderer's slot)
      package.json, tsconfig.json, vite.config.ts, index.html, public/
      src/main.tsx                        React entrypoint
      src/App.tsx                         placeholder shell
      src/store/cryptoContext.ts          zustand CryptoState skeleton
      src/idb/schema.ts                   DB_VERSION=1 + idb upgrade handler
      src/env.d.ts
  packages/
    crypto/                               MODIFIED — dual exports
      src/sodium.node.ts                  renamed from sodium.ts
      src/sodium.browser.ts               NEW: native ESM import
      src/sodium-public.ts                NEW: re-exports through exports map
      vitest.browser.config.ts            NEW
    transfer/                             FILLED (was placeholder)
      src/types.ts                        Envelope, VerifyResult
    keystore/                             REPLACED
      src/types.ts                        BrowserKeystore interface
    shared/                               REPLACED
      src/domain.ts                       Send, Profile, Manifest types
      src/api-types.ts                    RPC shapes
    supabase-client/                      UNCHANGED PLACEHOLDER (filled in 3b)
  .github/workflows/
    ci.yml                                rewritten — drops electron rebuild

DELETED: apps/desktop, packages/{vault,fs-watcher,updater-config,chat},
         electron-builder.yml, release-builds/, .github/workflows/release.yml
```

---

## Task 1 — Tag and push `desktop-archive`

**Files:** none (git operation only)

- [ ] **Step 1: Confirm working tree clean**

Run: `git status -sb`
Expected: `## main...origin/main` with no pending changes.

- [ ] **Step 2: Tag and push**

```
git tag -a desktop-archive -m "Electron-era code (Plans 1+2) preserved before web cutover"
git push origin desktop-archive
```
Expected: `[new tag] desktop-archive -> desktop-archive`. Verify on the GitHub tags page.

The tag is the only path back to the Electron tree. **Do not proceed with Task 2 until the tag is on origin.**

---

## Task 2 — Cutover commit: drop Electron-era apps and packages

**Files:**
- Delete: `apps/desktop/` (whole directory)
- Delete: `packages/vault/`, `packages/fs-watcher/`, `packages/updater-config/`, `packages/chat/`
- Delete: `electron-builder.yml`, `release-builds/`, `.github/workflows/release.yml`

- [ ] **Step 1: Verify the tag is on origin**

```
git ls-remote --tags origin desktop-archive
```
Expected: prints the tag SHA. If absent, return to Task 1.

- [ ] **Step 2: Delete the directories and files**

```
rm -rf apps/desktop
rm -rf packages/vault packages/fs-watcher packages/updater-config packages/chat
rm -f electron-builder.yml
rm -rf release-builds
rm -f .github/workflows/release.yml
```

- [ ] **Step 3: Stage and commit**

```
git add -A
git commit -m "cutover: drop Electron stack (preserved at desktop-archive tag)

Removes apps/desktop, packages/{vault,fs-watcher,updater-config,chat},
electron-builder.yml, release-builds/, .github/workflows/release.yml.
The web stack lands in subsequent commits in this plan.

Recover with: git checkout desktop-archive

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 4: Verify pnpm install still resolves**

```
pnpm install
```
Expected: completes without error. Some packages have no deps yet; that's fine.

---

## Task 3 — Update root `package.json`

**Files:**
- Modify: `package.json` (root)

- [ ] **Step 1: Replace contents**

```json
{
  "name": "spourgiti",
  "version": "0.1.0",
  "private": true,
  "productName": "Spourgiti",
  "description": "End-to-end encrypted file sharing — web edition",
  "author": { "name": "Spourgiti", "email": "noreply@example.com" },
  "packageManager": "pnpm@9.12.0",
  "engines": { "node": "20.x" },
  "scripts": {
    "typecheck": "pnpm -r typecheck",
    "test": "pnpm -r test",
    "test:browser": "pnpm --filter @spourgiti/crypto test:browser",
    "build": "pnpm --filter @spourgiti/send build",
    "dev": "pnpm --filter @spourgiti/send dev"
  },
  "devDependencies": {
    "@types/node": "^20.14.0",
    "prettier": "^3.3.3",
    "typescript": "^5.6.3",
    "vitest": "^2.1.4"
  }
}
```

Removed: `@electron/rebuild`, `electron`, `electron-builder`, eslint packages, `lint`/`build:renderer`/`build:desktop`/`package`/`release` scripts.

- [ ] **Step 2: Reinstall and commit**

```
pnpm install
git add package.json pnpm-lock.yaml
git commit -m "chore(root): drop Electron deps and scripts; bump to v0.1.0

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4 — Rename `apps/renderer` to `apps/send`

**Files:**
- Move: `apps/renderer/` → `apps/send/`
- Modify: `apps/send/package.json`

- [ ] **Step 1: Move the directory (preserves history)**

```
git mv apps/renderer apps/send
```

- [ ] **Step 2: Replace `apps/send/package.json`**

```json
{
  "name": "@spourgiti/send",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "typecheck": "tsc -b --noEmit",
    "test": "vitest run --passWithNoTests"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-router-dom": "^6.27.0",
    "zustand": "^5.0.1",
    "idb": "^8.0.0",
    "@spourgiti/crypto": "workspace:*",
    "@spourgiti/transfer": "workspace:*",
    "@spourgiti/keystore": "workspace:*",
    "@spourgiti/shared": "workspace:*"
  },
  "devDependencies": {
    "@types/react": "^18.3.12",
    "@types/react-dom": "^18.3.1",
    "@vitejs/plugin-react": "^4.3.3",
    "typescript": "^5.6.3",
    "vite": "^5.4.10",
    "vitest": "^2.1.4"
  }
}
```

Removed any `@spourgiti/updater-config` dep. Added `react-router-dom`, `zustand`, `idb`.

- [ ] **Step 3: Reinstall and commit**

```
pnpm install
git add apps/send pnpm-lock.yaml
git commit -m "feat(send): rename apps/renderer to apps/send; web deps + workspace wiring

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 5 — Crypto package dual exports + browser test job

**Files:**
- Rename: `packages/crypto/src/sodium.ts` → `packages/crypto/src/sodium.node.ts`
- Create: `packages/crypto/src/sodium.browser.ts`
- Create: `packages/crypto/src/sodium-public.ts`
- Modify: `packages/crypto/src/index.ts`, all primitive files, `packages/crypto/package.json`
- Create: `packages/crypto/vitest.browser.config.ts`

- [ ] **Step 1: Rename the existing sodium file**

```
git mv packages/crypto/src/sodium.ts packages/crypto/src/sodium.node.ts
```

- [ ] **Step 2: Create the browser entrypoint**

`packages/crypto/src/sodium.browser.ts`:

```ts
import sodium from 'libsodium-wrappers';

let instance: typeof sodium | null = null;
let pending: Promise<typeof sodium> | null = null;

/** Browser entrypoint: native ESM import, no createRequire shim. */
export async function getSodium(): Promise<typeof sodium> {
  if (instance) return instance;
  if (!pending) {
    pending = sodium.ready.then(() => {
      instance = sodium;
      return sodium;
    });
  }
  return pending;
}
```

- [ ] **Step 3: Create the conditional re-export module**

`packages/crypto/src/sodium-public.ts`:

```ts
// Re-exports getSodium through the package's own exports map.
// The runtime (Node vs browser) picks which sodium file is loaded.
export { getSodium } from '@spourgiti/crypto/sodium';
```

- [ ] **Step 4: Update primitive imports**

In each of `packages/crypto/src/random.ts`, `keys.ts`, `sign.ts`, `seal.ts`, `stream.ts`, change the existing import line from:

```ts
import { getSodium } from './sodium.js';
```

to:

```ts
import { getSodium } from './sodium-public.js';
```

- [ ] **Step 5: Update `packages/crypto/src/index.ts`**

Replace contents:

```ts
export * from './sodium-public.js';
export * from './random.js';
export * from './keys.js';
export * from './sign.js';
export * from './seal.js';
export * from './stream.js';
```

- [ ] **Step 6: Update `packages/crypto/package.json` with the dual exports map**

```json
{
  "name": "@spourgiti/crypto",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": {
      "browser": "./src/index.ts",
      "node":    "./src/index.ts",
      "default": "./src/index.ts"
    },
    "./sodium": {
      "browser": "./src/sodium.browser.ts",
      "node":    "./src/sodium.node.ts",
      "default": "./src/sodium.node.ts"
    }
  },
  "scripts": {
    "typecheck": "tsc --noEmit",
    "test": "vitest run --passWithNoTests",
    "test:browser": "vitest run --config vitest.browser.config.ts --passWithNoTests"
  },
  "dependencies": {
    "libsodium-wrappers": "^0.7.15"
  },
  "devDependencies": {
    "@types/libsodium-wrappers": "^0.7.14",
    "@vitest/browser": "^2.1.4",
    "playwright": "^1.48.0",
    "typescript": "^5.6.3",
    "vitest": "^2.1.4"
  }
}
```

- [ ] **Step 7: Create `packages/crypto/vitest.browser.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    browser: {
      enabled: true,
      provider: 'playwright',
      name: 'chromium',
      headless: true,
    },
    include: ['test/**/*.test.ts'],
  },
});
```

- [ ] **Step 8: Reinstall, install Playwright Chromium, and verify both test runs**

```
pnpm install
pnpm --filter @spourgiti/crypto exec playwright install chromium
pnpm --filter @spourgiti/crypto typecheck
pnpm --filter @spourgiti/crypto test
pnpm --filter @spourgiti/crypto test:browser
```

Expected: typecheck clean; Node tests 18/18 pass; browser tests 18/18 pass in headless Chromium.

- [ ] **Step 9: Commit**

```
git add packages/crypto pnpm-lock.yaml
git commit -m "feat(crypto): dual exports for Node + browser; add Vitest browser job

Splits sodium.ts into sodium.node.ts (createRequire shim) and
sodium.browser.ts (native ESM). exports map routes browser condition
to the latter. All 18 Plan 2 tests pass in both Node and Chromium.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 6 — Replace `@spourgiti/keystore` with the browser interface

**Files:**
- Delete: `packages/keystore/src/memory.ts`, `packages/keystore/src/safeStorage.ts`, their tests
- Replace: `packages/keystore/src/types.ts`, `packages/keystore/src/index.ts`, `packages/keystore/package.json`
- Create: `packages/keystore/test/types.test.ts`

- [ ] **Step 1: Delete the Electron-era files**

```
rm packages/keystore/src/memory.ts
rm packages/keystore/src/safeStorage.ts
rm packages/keystore/test/memory.test.ts
rm packages/keystore/test/safeStorage.test.ts
```

- [ ] **Step 2: Replace `packages/keystore/package.json`**

```json
{
  "name": "@spourgiti/keystore",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": {
    "typecheck": "tsc --noEmit",
    "test": "vitest run --passWithNoTests"
  },
  "dependencies": {
    "@spourgiti/crypto": "workspace:*"
  },
  "devDependencies": {
    "typescript": "^5.6.3",
    "vitest": "^2.1.4"
  }
}
```

- [ ] **Step 3: Replace `packages/keystore/src/types.ts`**

```ts
/**
 * Browser keystore: holds the user's encrypted private key in IndexedDB.
 * Implementation (Argon2id-derived KEK around the private key) lands
 * in Plan 3c. This file declares the interface so consumers compile.
 */

export interface EncryptedPrivateKey {
  ciphertext: Uint8Array;
  salt: Uint8Array;
  ops_limit: number;
  mem_limit: number;
  kdf_version: number;
}

export interface BrowserKeystore {
  storeEncryptedKey(value: EncryptedPrivateKey): Promise<void>;
  loadEncryptedKey(): Promise<EncryptedPrivateKey | null>;
  clear(): Promise<void>;
}

export class KeystoreError extends Error {
  constructor(
    message: string,
    public readonly code: 'NOT_FOUND' | 'DECRYPT_FAIL' | 'DB_UNAVAILABLE',
  ) {
    super(message);
    this.name = 'KeystoreError';
  }
}
```

- [ ] **Step 4: Replace `packages/keystore/src/index.ts`**

```ts
export * from './types.js';
```

- [ ] **Step 5: Add a smoke test**

`packages/keystore/test/types.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import type { BrowserKeystore, EncryptedPrivateKey } from '../src/types.js';
import { KeystoreError } from '../src/types.js';

describe('keystore types', () => {
  it('KeystoreError carries a code', () => {
    const err = new KeystoreError('missing', 'NOT_FOUND');
    expect(err.code).toBe('NOT_FOUND');
    expect(err).toBeInstanceOf(Error);
  });

  it('EncryptedPrivateKey shape compiles', () => {
    const v: EncryptedPrivateKey = {
      ciphertext: new Uint8Array(0),
      salt: new Uint8Array(16),
      ops_limit: 1,
      mem_limit: 1,
      kdf_version: 1,
    };
    expect(v.kdf_version).toBe(1);
  });

  it('BrowserKeystore interface is implementable', () => {
    const impl: BrowserKeystore = {
      async storeEncryptedKey() {},
      async loadEncryptedKey() { return null; },
      async clear() {},
    };
    expect(typeof impl.clear).toBe('function');
  });
});
```

- [ ] **Step 6: Verify and commit**

```
pnpm --filter @spourgiti/keystore typecheck
pnpm --filter @spourgiti/keystore test
git add packages/keystore pnpm-lock.yaml
git commit -m "feat(keystore): replace Electron impl with BrowserKeystore interface

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 7 — Replace `@spourgiti/shared` with web domain types

**Files:**
- Delete: `packages/shared/src/ipc-contract.ts`
- Create: `packages/shared/src/domain.ts`, `packages/shared/src/api-types.ts`
- Replace: `packages/shared/src/index.ts`

- [ ] **Step 1: Delete the Electron IPC contract**

```
rm packages/shared/src/ipc-contract.ts
```

- [ ] **Step 2: Create `packages/shared/src/domain.ts`**

```ts
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
```

- [ ] **Step 3: Create `packages/shared/src/api-types.ts`**

```ts
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
```

- [ ] **Step 4: Replace `packages/shared/src/index.ts`**

```ts
export * from './domain.js';
export * from './api-types.js';
export * from './version.js';
```

- [ ] **Step 5: Verify and commit**

```
pnpm --filter @spourgiti/shared typecheck
pnpm --filter @spourgiti/shared test
git add packages/shared
git commit -m "feat(shared): replace IPC contract with web domain + RPC types

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 8 — Scaffold `@spourgiti/transfer` (types only)

**Files:**
- Modify: `packages/transfer/package.json`
- Create: `packages/transfer/src/types.ts`
- Replace: `packages/transfer/src/index.ts`
- Create: `packages/transfer/test/types.test.ts`

- [ ] **Step 1: Update `packages/transfer/package.json`**

```json
{
  "name": "@spourgiti/transfer",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": {
    "typecheck": "tsc --noEmit",
    "test": "vitest run --passWithNoTests"
  },
  "dependencies": {
    "@spourgiti/crypto": "workspace:*",
    "@spourgiti/shared": "workspace:*"
  },
  "devDependencies": {
    "typescript": "^5.6.3",
    "vitest": "^2.1.4"
  }
}
```

- [ ] **Step 2: Create `packages/transfer/src/types.ts`**

```ts
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
```

- [ ] **Step 3: Replace `packages/transfer/src/index.ts`**

```ts
export * from './types.js';
```

- [ ] **Step 4: Add a smoke test**

`packages/transfer/test/types.test.ts`:

```ts
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
```

- [ ] **Step 5: Verify and commit**

```
pnpm install
pnpm --filter @spourgiti/transfer typecheck
pnpm --filter @spourgiti/transfer test
git add packages/transfer pnpm-lock.yaml
git commit -m "feat(transfer): scaffold envelope + verify-result types

Pure-function compose() and verify() come in Plans 3c/3d.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 9 — Wire up the `apps/send` Vite + React shell

**Files:**
- Replace: `apps/send/index.html`, `apps/send/src/main.tsx`, `apps/send/src/App.tsx`, `apps/send/src/env.d.ts`
- Replace: `apps/send/vite.config.ts`, `apps/send/tsconfig.json`
- Delete: `apps/send/src/ipc.ts`

- [ ] **Step 1: Delete the Electron-era ipc wrapper**

```
rm apps/send/src/ipc.ts
```

- [ ] **Step 2: Replace `apps/send/index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <meta name="theme-color" content="#f6f1e7" />
    <meta http-equiv="Content-Security-Policy"
          content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' https://*.supabase.co wss://*.supabase.co; font-src 'self' data: https://fonts.gstatic.com; style-src-elem 'self' 'unsafe-inline' https://fonts.googleapis.com;" />
    <title>Spourgiti Send</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 3: Replace `apps/send/vite.config.ts`**

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: '/',
  build: { outDir: 'dist', emptyOutDir: true, target: 'es2022' },
  server: { port: 5173, strictPort: true },
  resolve: { conditions: ['browser', 'import', 'default'] },
});
```

- [ ] **Step 4: Replace `apps/send/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "jsx": "react-jsx",
    "outDir": "./dist",
    "types": ["vite/client"],
    "lib": ["ES2022", "DOM", "DOM.Iterable"]
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 5: Replace `apps/send/src/env.d.ts`**

```ts
/// <reference types="vite/client" />
export {};
```

- [ ] **Step 6: Replace `apps/send/src/main.tsx`**

```tsx
import { createRoot } from 'react-dom/client';
import { App } from './App.js';

const container = document.getElementById('root');
if (!container) throw new Error('root element missing');
createRoot(container).render(<App />);
```

- [ ] **Step 7: Replace `apps/send/src/App.tsx`**

```tsx
import { APP_VERSION } from '@spourgiti/shared';

export function App() {
  return (
    <main style={{ fontFamily: '"EB Garamond", Garamond, "Times New Roman", serif', padding: '4rem 2rem', maxWidth: 720, margin: '0 auto', backgroundColor: '#f6f1e7', color: '#1a1a1a', minHeight: '100vh' }}>
      <h1 style={{ fontFamily: '"Cormorant Garamond", Garamond, serif', fontWeight: 600 }}>Spourgiti Send</h1>
      <p>End-to-end encrypted file sharing. Web edition v{APP_VERSION}.</p>
      <p style={{ color: '#5a5a5a' }}>
        The real UI lands in Plans 3c–3f. This page exists to prove the build chain works end-to-end.
      </p>
    </main>
  );
}
```

- [ ] **Step 8: Build + dev-launch sanity check**

```
pnpm --filter @spourgiti/send typecheck
pnpm --filter @spourgiti/send build
pnpm --filter @spourgiti/send dev
```

Expected: typecheck clean; build outputs `apps/send/dist/index.html` + assets; `dev` serves on `http://localhost:5173`. Visit in a browser; should see "Spourgiti Send", version v0.1.0, body copy. Stop the dev server before continuing.

- [ ] **Step 9: Commit**

```
git add apps/send
git commit -m "feat(send): web SPA shell — Vite + React + TypeScript boots a placeholder

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 10 — IDB schema + `cryptoState` skeleton

**Files:**
- Create: `apps/send/src/idb/schema.ts`
- Create: `apps/send/src/store/cryptoContext.ts`

- [ ] **Step 1: Create `apps/send/src/idb/schema.ts`**

```ts
import { openDB, type IDBPDatabase, type DBSchema } from 'idb';
import type { EncryptedPrivateKey } from '@spourgiti/keystore';

export const DB_NAME = 'spourgiti-send';
export const DB_VERSION = 1;

export interface SendDB extends DBSchema {
  keystore: { key: 'self'; value: EncryptedPrivateKey };
  profile: {
    key: 'self';
    value: {
      user_id: string;
      username: string;
      display_name: string | null;
      ed25519_public_key: Uint8Array;
      ed25519_pubkey_fp: string;
    };
  };
  fingerprints: {
    key: string;
    value: {
      user_id: string;
      ed25519_public_key: Uint8Array;
      first_seen_at: number;
      manually_trusted_at: number | null;
    };
  };
  seen_sends: {
    key: string;
    value: { send_id: string; seen_at: number };
    indexes: { 'by-seen_at': number };
  };
  inbox_cache: {
    key: string;
    value: unknown;
    indexes: { 'by-created_at': number };
  };
  outbox_cache: {
    key: string;
    value: unknown;
    indexes: { 'by-created_at': number };
  };
}

export async function openSendDb(): Promise<IDBPDatabase<SendDB>> {
  return openDB<SendDB>(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion) {
      if (oldVersion < 1) {
        db.createObjectStore('keystore');
        db.createObjectStore('profile');
        db.createObjectStore('fingerprints', { keyPath: 'user_id' });
        const seen = db.createObjectStore('seen_sends', { keyPath: 'send_id' });
        seen.createIndex('by-seen_at', 'seen_at');
        const inbox = db.createObjectStore('inbox_cache');
        inbox.createIndex('by-created_at', 'created_at');
        const outbox = db.createObjectStore('outbox_cache');
        outbox.createIndex('by-created_at', 'created_at');
      }
      // Future versions add upgrade branches here. Bump DB_VERSION; never delete branches.
    },
  });
}
```

- [ ] **Step 2: Create `apps/send/src/store/cryptoContext.ts`**

```ts
import { create } from 'zustand';

/**
 * Three orthogonal state machines per spec section 6:
 *   SUPABASE SESSION (handled by supabase-js, Plan 3b)
 *   CRYPTO UNLOCK    (this store)
 *   IN-FLIGHT XFER   (per-transfer stores in Plans 3d/3e)
 *
 * SESSION=active + CRYPTO=locked is reachable: tab reload restores
 * the session from localStorage but the in-memory key is gone.
 * Route guards must check both.
 */

export type CryptoState =
  | { status: 'locked' }
  | { status: 'unlocking'; error?: string }
  | { status: 'unlocked'; privateKey: Uint8Array; publicKey: Uint8Array };

interface CryptoStore {
  state: CryptoState;
  lock(): void;
  setUnlocking(): void;
  setUnlockError(error: string): void;
  setUnlocked(privateKey: Uint8Array, publicKey: Uint8Array): void;
}

export const useCryptoStore = create<CryptoStore>((set) => ({
  state: { status: 'locked' },
  lock: () => set({ state: { status: 'locked' } }),
  setUnlocking: () => set({ state: { status: 'unlocking' } }),
  setUnlockError: (error) => set({ state: { status: 'unlocking', error } }),
  setUnlocked: (privateKey, publicKey) =>
    set({ state: { status: 'unlocked', privateKey, publicKey } }),
}));
```

- [ ] **Step 3: Verify the SPA still typechecks and builds**

```
pnpm --filter @spourgiti/send typecheck
pnpm --filter @spourgiti/send build
```

- [ ] **Step 4: Commit**

```
git add apps/send/src/idb apps/send/src/store
git commit -m "feat(send): IDB schema (v1) + cryptoState zustand store skeleton

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 11 — Rewrite the CI workflow for the web stack

**Files:**
- Replace: `.github/workflows/ci.yml`

- [ ] **Step 1: Replace contents**

```yaml
name: CI

on:
  pull_request:
  push:
    branches: [main]

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 9.12.0
      - uses: actions/setup-node@v4
        with:
          node-version: 20.18.0
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm typecheck
      - run: pnpm test

  browser-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 9.12.0
      - uses: actions/setup-node@v4
        with:
          node-version: 20.18.0
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter @spourgiti/crypto exec playwright install --with-deps chromium
      - run: pnpm test:browser
```

Drops the Electron-rebuild step. Adds the `browser-tests` job that runs Vitest browser-mode against Chromium.

- [ ] **Step 2: Commit and push**

```
git add .github/workflows/ci.yml
git commit -m "ci: rewrite for web stack (drop electron rebuild; add browser-tests job)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
git push origin main
```

- [ ] **Step 3: Verify CI is green**

```
gh run list --workflow ci.yml --limit 3
```

Expected: latest run shows `completed success` with both jobs (`check` and `browser-tests`) green. If failing, `gh run view <id> --log-failed | tail -100` and diagnose.

---

## Task 12 — Final smoke + Plan 3a milestone tag

**Files:** none (verification only)

- [ ] **Step 1: Workspace-wide verification**

```
pnpm install
pnpm typecheck
pnpm test
pnpm test:browser
pnpm build
```

Expected: every step exits 0. `pnpm build` produces `apps/send/dist/`.

- [ ] **Step 2: Tag the milestone**

```
git tag plan-3a-foundation
git push origin plan-3a-foundation
```

The tag marks a stable foundation for Plans 3b–3f to build on.

---

## Self-review notes

**Spec coverage (vs Send spec):**
- §9 Stack — Tasks 4 (deps), 5 (crypto dual exports), 9 (Vite shell), 10 (idb + zustand), 11 (CI). ✓
- §10 Repo layout — Tasks 1, 2, 4, 5, 6, 7, 8 (cutover + package replacements). ✓
- §11 Build/Deploy — Task 11 covers CI. Vercel deploy is Plan 3f. ✓ (deferred)
- §13 Testing — Task 5 wires Vitest browser mode; full RLS-replacement suite is Plan 3b's. ✓ (partial)

**No placeholders.** Every task ships exact code or exact commands.

**Frequent commits.** 11 commits across 12 tasks (Tasks 1 + 12 are tag/verify only). Easy to bisect.

**State-machine boundary** — `cryptoState` skeleton in Task 10 lands the discriminated union the architecture review demanded. Plan 3c wires it to real Argon2id + IDB.

**Deferred intentionally:**
- RPC bindings → Plan 3b
- Auth UI → Plan 3c
- Routing beyond placeholder → Plan 3c
- Real Vercel deploy → Plan 3f
- Onboarding / a11y polish → Plan 3f
