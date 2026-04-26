# Foundation & Release Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the SPOURGITI monorepo and ship an installable, self-updating Electron app to GitHub Releases — with no product features yet, but with every release-pipeline mechanism in place that later plans depend on.

**Architecture:** A `pnpm` workspace monorepo. Electron main process loads a Vite-built React renderer. A typed IPC contract package (`@spourgiti/shared`) defines every cross-process call. `electron-builder` builds OS-specific installers; `electron-updater` checks GitHub Releases and self-updates. CI matrix-builds on Win/mac/Linux runners and publishes on git tag. `better-sqlite3` is wired and rebuilt for Electron so later plans can drop in the vault without setup churn.

**Tech Stack:** Node 20, pnpm 9, Electron 32, Vite 5, React 18, TypeScript 5.5, electron-builder 24, electron-updater 6, better-sqlite3 11, @electron/rebuild, Vitest, ESLint, Prettier, GitHub Actions.

**Plan parent:** [docs/superpowers/specs/2026-04-27-spourgiti-design.md](../specs/2026-04-27-spourgiti-design.md)

---

## File Structure

This plan creates the following files. Subsequent plans will populate the `packages/` directories with real code.

```
spourgiti/
  .github/
    workflows/
      ci.yml                          PR checks: install, lint, typecheck, test
      release.yml                     Tag-driven build + GitHub Releases publish
  .gitignore
  .editorconfig
  .nvmrc                              node version pin
  package.json                        root, private, workspace declarations + scripts
  pnpm-workspace.yaml
  tsconfig.base.json                  shared TS settings
  electron-builder.yml                build + publish + auto-update config
  README.md                           dev quickstart only
  apps/
    desktop/
      package.json
      tsconfig.json
      src/
        main.ts                       Electron main entrypoint
        preload.ts                    contextBridge -> renderer
        ipc/
          register.ts                 wires handlers to ipcMain
          handlers/
            ping.ts                   sample handler used to prove IPC works
            updater.ts                update-check, download, install handlers
        updater/
          index.ts                    electron-updater wrapper, GitHub provider
        windows/
          mainWindow.ts               BrowserWindow factory
        db/
          smokeTest.ts                opens a better-sqlite3 in-memory DB at startup, logs version
      build/
        icon.png                      placeholder icon (256x256 transparent)
    renderer/
      package.json
      tsconfig.json
      vite.config.ts
      index.html
      src/
        main.tsx                      React entry
        App.tsx                       minimal "Hello + version + check-for-update" UI
        ipc.ts                        typed wrapper around window.spourgiti
        env.d.ts                      vite/electron type augmentation
  packages/
    shared/
      package.json
      tsconfig.json
      src/
        index.ts                      barrel
        ipc-contract.ts               typed IPC channel definitions
        version.ts                    APP_VERSION constant from package.json
    crypto/
      package.json                    placeholder, declares deps; src added in Plan 2
      tsconfig.json
      src/index.ts                    `export {}` placeholder
    keystore/
      package.json
      tsconfig.json
      src/index.ts                    `export {}` placeholder
    vault/
      package.json
      tsconfig.json
      src/index.ts                    `export {}` placeholder
    supabase-client/
      package.json
      tsconfig.json
      src/index.ts                    `export {}` placeholder
    transfer/
      package.json
      tsconfig.json
      src/index.ts                    `export {}` placeholder
    fs-watcher/
      package.json
      tsconfig.json
      src/index.ts                    `export {}` placeholder
    chat/
      package.json
      tsconfig.json
      src/index.ts                    `export {}` placeholder
    updater-config/
      package.json                    NOT used at runtime; only a centralised JSON of GH owner/repo
      tsconfig.json
      src/index.ts
  tests/
    e2e/
      placeholder.test.ts             Vitest sanity test
```

The placeholder packages exist now (with empty exports + working build/test scripts) so later plans never have to touch the workspace or tsconfig wiring — they just fill `src/`.

---

## Task 1: Initialise the monorepo skeleton

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `.gitignore`
- Create: `.editorconfig`
- Create: `.nvmrc`
- Create: `tsconfig.base.json`
- Create: `README.md`

- [ ] **Step 1: Pin Node**

Create `.nvmrc`:

```
20.18.0
```

- [ ] **Step 2: Write `.gitignore`**

```
node_modules/
dist/
build/
release/
out/
.cache/
.parcel-cache/
.vite/
*.log
.DS_Store
Thumbs.db
.env
.env.local
*.tsbuildinfo
coverage/
.turbo/
.pnpm-store/
# Electron build outputs
apps/desktop/dist/
apps/renderer/dist/
release-builds/
```

- [ ] **Step 3: Write `.editorconfig`**

```ini
root = true

[*]
charset = utf-8
end_of_line = lf
indent_style = space
indent_size = 2
insert_final_newline = true
trim_trailing_whitespace = true

[*.md]
trim_trailing_whitespace = false
```

- [ ] **Step 4: Write `pnpm-workspace.yaml`**

```yaml
packages:
  - "apps/*"
  - "packages/*"
```

- [ ] **Step 5: Write `tsconfig.base.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "isolatedModules": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "verbatimModuleSyntax": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  }
}
```

- [ ] **Step 6: Write root `package.json`**

```json
{
  "name": "spourgiti",
  "version": "0.0.0",
  "private": true,
  "packageManager": "pnpm@9.12.0",
  "engines": {
    "node": "20.x"
  },
  "scripts": {
    "lint": "eslint .",
    "typecheck": "pnpm -r typecheck",
    "test": "pnpm -r test",
    "build:renderer": "pnpm --filter @spourgiti/renderer build",
    "build:desktop": "pnpm --filter @spourgiti/desktop build",
    "dev": "pnpm --filter @spourgiti/desktop dev",
    "package": "pnpm build:renderer && pnpm build:desktop && electron-builder --publish never",
    "release": "pnpm build:renderer && pnpm build:desktop && electron-builder --publish always"
  },
  "devDependencies": {
    "@electron/rebuild": "^3.7.0",
    "@types/node": "^20.14.0",
    "electron": "^32.2.0",
    "electron-builder": "^25.1.8",
    "eslint": "^9.13.0",
    "@typescript-eslint/parser": "^8.11.0",
    "@typescript-eslint/eslint-plugin": "^8.11.0",
    "prettier": "^3.3.3",
    "typescript": "^5.6.3",
    "vitest": "^2.1.4"
  }
}
```

- [ ] **Step 7: Write `README.md`**

```markdown
# SPOURGITI

Local-first collaborative file-sync desktop app. See [docs/superpowers/specs/](docs/superpowers/specs/) for the design.

## Dev quickstart

```bash
nvm use            # Node 20
corepack enable    # pnpm via corepack
pnpm install
pnpm dev           # launches Electron with Vite HMR
```

## Build

```bash
pnpm package       # local build, no publish
pnpm release       # publishes to GitHub Releases (CI only)
```
```

- [ ] **Step 8: Verify pnpm install runs**

Run: `pnpm install`
Expected: completes without errors; creates `pnpm-lock.yaml`. (Workspace packages don't exist yet, so pnpm just installs root devDeps.)

- [ ] **Step 9: Commit**

```bash
git add .gitignore .editorconfig .nvmrc package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json README.md
git commit -m "chore: bootstrap pnpm workspace and base tooling"
```

---

## Task 2: Create the shared package (IPC contract types)

**Files:**
- Create: `packages/shared/package.json`
- Create: `packages/shared/tsconfig.json`
- Create: `packages/shared/src/index.ts`
- Create: `packages/shared/src/ipc-contract.ts`
- Create: `packages/shared/src/version.ts`

- [ ] **Step 1: Package manifest**

`packages/shared/package.json`:

```json
{
  "name": "@spourgiti/shared",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": {
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "devDependencies": {
    "typescript": "^5.6.3",
    "vitest": "^2.1.4"
  }
}
```

- [ ] **Step 2: tsconfig**

`packages/shared/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 3: IPC contract**

`packages/shared/src/ipc-contract.ts`:

```ts
/**
 * Single source of truth for every cross-process call.
 * Renderer imports the request/response types; main registers handlers
 * keyed by IpcChannel; the preload bridge maps each channel to an
 * invoke<TReq, TRes>(channel, req) call.
 */

export const IpcChannel = {
  Ping: 'ping',
  UpdaterCheck: 'updater:check',
  UpdaterDownload: 'updater:download',
  UpdaterInstall: 'updater:install',
} as const;

export type IpcChannel = (typeof IpcChannel)[keyof typeof IpcChannel];

export interface PingRequest { msg: string }
export interface PingResponse { echoed: string; appVersion: string }

export interface UpdaterCheckRequest {}
export interface UpdaterCheckResponse {
  status: 'no-update' | 'available' | 'error';
  version?: string;
  releaseNotes?: string;
  error?: string;
}

export interface UpdaterDownloadRequest {}
export interface UpdaterDownloadResponse {
  status: 'downloaded' | 'in-progress' | 'error';
  error?: string;
}

export interface UpdaterInstallRequest {}
export interface UpdaterInstallResponse {
  status: 'restarting' | 'error';
  error?: string;
}

export interface IpcContract {
  [IpcChannel.Ping]: (req: PingRequest) => Promise<PingResponse>;
  [IpcChannel.UpdaterCheck]: (req: UpdaterCheckRequest) => Promise<UpdaterCheckResponse>;
  [IpcChannel.UpdaterDownload]: (req: UpdaterDownloadRequest) => Promise<UpdaterDownloadResponse>;
  [IpcChannel.UpdaterInstall]: (req: UpdaterInstallRequest) => Promise<UpdaterInstallResponse>;
}
```

- [ ] **Step 4: Version constant**

`packages/shared/src/version.ts`:

```ts
import pkg from '../../../package.json' with { type: 'json' };
export const APP_VERSION: string = pkg.version;
```

- [ ] **Step 5: Barrel**

`packages/shared/src/index.ts`:

```ts
export * from './ipc-contract.js';
export * from './version.js';
```

- [ ] **Step 6: Verify typecheck**

Run: `pnpm --filter @spourgiti/shared typecheck`
Expected: no output, exit 0.

- [ ] **Step 7: Commit**

```bash
git add packages/shared
git commit -m "feat(shared): add IPC contract and version export"
```

---

## Task 3: Create placeholder packages

Each placeholder lets later plans drop code into a known location with no setup churn. The structure is identical across them, so this task produces nine near-identical packages.

**Files:** for each of `crypto`, `keystore`, `vault`, `supabase-client`, `transfer`, `fs-watcher`, `chat`, `updater-config`:
- Create: `packages/<name>/package.json`
- Create: `packages/<name>/tsconfig.json`
- Create: `packages/<name>/src/index.ts`

- [ ] **Step 1: Write the placeholder generator script (one-shot, removed after use)**

Save as `scripts/scaffold-placeholders.mjs`:

```js
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const names = ['crypto', 'keystore', 'vault', 'supabase-client', 'transfer', 'fs-watcher', 'chat', 'updater-config'];

for (const name of names) {
  const dir = join('packages', name);
  mkdirSync(join(dir, 'src'), { recursive: true });

  writeFileSync(join(dir, 'package.json'), JSON.stringify({
    name: `@spourgiti/${name}`,
    version: '0.0.0',
    private: true,
    type: 'module',
    main: './src/index.ts',
    types: './src/index.ts',
    scripts: {
      typecheck: 'tsc --noEmit',
      test: 'vitest run --passWithNoTests'
    },
    devDependencies: {
      typescript: '^5.6.3',
      vitest: '^2.1.4'
    }
  }, null, 2) + '\n');

  writeFileSync(join(dir, 'tsconfig.json'), JSON.stringify({
    extends: '../../tsconfig.base.json',
    compilerOptions: { outDir: './dist', rootDir: './src' },
    include: ['src/**/*']
  }, null, 2) + '\n');

  writeFileSync(join(dir, 'src/index.ts'), 'export {};\n');
  console.log('scaffolded', name);
}
```

- [ ] **Step 2: Run it**

Run: `node scripts/scaffold-placeholders.mjs`
Expected: prints `scaffolded <name>` for each of the 8 packages.

- [ ] **Step 3: Reinstall to wire workspaces**

Run: `pnpm install`
Expected: pnpm reports adding the new workspace packages.

- [ ] **Step 4: Verify all typecheck**

Run: `pnpm -r typecheck`
Expected: every package reports clean.

- [ ] **Step 5: Verify all test scripts pass with no tests**

Run: `pnpm -r test`
Expected: each placeholder reports "No test files found, exiting with code 0" (Vitest's `--passWithNoTests`).

- [ ] **Step 6: Delete the scaffolder (we don't need it again)**

```bash
rm scripts/scaffold-placeholders.mjs
rmdir scripts
```

- [ ] **Step 7: Commit**

```bash
git add packages pnpm-lock.yaml
git commit -m "chore: scaffold placeholder packages for future plans"
```

---

## Task 4: Create the renderer (Vite + React)

**Files:**
- Create: `apps/renderer/package.json`
- Create: `apps/renderer/tsconfig.json`
- Create: `apps/renderer/vite.config.ts`
- Create: `apps/renderer/index.html`
- Create: `apps/renderer/src/main.tsx`
- Create: `apps/renderer/src/App.tsx`
- Create: `apps/renderer/src/ipc.ts`
- Create: `apps/renderer/src/env.d.ts`

- [ ] **Step 1: Package manifest**

`apps/renderer/package.json`:

```json
{
  "name": "@spourgiti/renderer",
  "version": "0.0.0",
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

- [ ] **Step 2: tsconfig**

`apps/renderer/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "jsx": "react-jsx",
    "outDir": "./dist",
    "types": ["vite/client"]
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 3: Vite config**

`apps/renderer/vite.config.ts`:

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Renderer is loaded in production from file://, so base must be relative.
export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'chrome120',
  },
  server: {
    port: 5173,
    strictPort: true,
  },
});
```

- [ ] **Step 4: HTML entry**

`apps/renderer/index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta http-equiv="Content-Security-Policy"
          content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:;" />
    <title>SPOURGITI</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 5: Renderer entry**

`apps/renderer/src/main.tsx`:

```tsx
import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';

const container = document.getElementById('root');
if (!container) throw new Error('root element missing');
createRoot(container).render(<App />);
```

- [ ] **Step 6: Env augmentation**

`apps/renderer/src/env.d.ts`:

```ts
/// <reference types="vite/client" />

import type { IpcChannel, IpcContract } from '@spourgiti/shared';

declare global {
  interface Window {
    spourgiti: {
      invoke<C extends IpcChannel>(
        channel: C,
        req: Parameters<IpcContract[C]>[0],
      ): ReturnType<IpcContract[C]>;
    };
  }
}

export {};
```

- [ ] **Step 7: Typed IPC wrapper**

`apps/renderer/src/ipc.ts`:

```ts
import { IpcChannel, type IpcContract } from '@spourgiti/shared';

export const ipc = {
  ping: (msg: string) =>
    window.spourgiti.invoke(IpcChannel.Ping, { msg }),
  checkForUpdate: () =>
    window.spourgiti.invoke(IpcChannel.UpdaterCheck, {}),
  downloadUpdate: () =>
    window.spourgiti.invoke(IpcChannel.UpdaterDownload, {}),
  installUpdate: () =>
    window.spourgiti.invoke(IpcChannel.UpdaterInstall, {}),
};
```

- [ ] **Step 8: App component (minimal: shows version + check-for-update button)**

`apps/renderer/src/App.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { ipc } from './ipc.js';

export function App() {
  const [version, setVersion] = useState<string>('?');
  const [updateStatus, setUpdateStatus] = useState<string>('');

  useEffect(() => {
    ipc.ping('hello').then((r) => setVersion(r.appVersion));
  }, []);

  async function handleCheck() {
    setUpdateStatus('checking…');
    const r = await ipc.checkForUpdate();
    if (r.status === 'available') {
      setUpdateStatus(`v${r.version} available`);
    } else if (r.status === 'no-update') {
      setUpdateStatus('up to date');
    } else {
      setUpdateStatus(`error: ${r.error ?? 'unknown'}`);
    }
  }

  return (
    <main style={{ fontFamily: 'system-ui', padding: 24 }}>
      <h1>SPOURGITI</h1>
      <p>Version: <code>{version}</code></p>
      <button onClick={handleCheck}>Check for update</button>
      <p>{updateStatus}</p>
    </main>
  );
}
```

- [ ] **Step 9: Install + typecheck**

Run: `pnpm install && pnpm --filter @spourgiti/renderer typecheck`
Expected: clean.

- [ ] **Step 10: Verify Vite build**

Run: `pnpm build:renderer`
Expected: outputs `apps/renderer/dist/index.html` and a `dist/assets/` folder.

- [ ] **Step 11: Commit**

```bash
git add apps/renderer pnpm-lock.yaml
git commit -m "feat(renderer): scaffold Vite + React renderer with typed IPC wrapper"
```

---

## Task 5: Create the Electron main process (no updater yet)

**Files:**
- Create: `apps/desktop/package.json`
- Create: `apps/desktop/tsconfig.json`
- Create: `apps/desktop/src/main.ts`
- Create: `apps/desktop/src/preload.ts`
- Create: `apps/desktop/src/windows/mainWindow.ts`
- Create: `apps/desktop/src/ipc/register.ts`
- Create: `apps/desktop/src/ipc/handlers/ping.ts`
- Create: `apps/desktop/src/db/smokeTest.ts`
- Create: `apps/desktop/build/icon.png` (256×256 transparent PNG; placeholder is fine)

- [ ] **Step 1: Package manifest**

`apps/desktop/package.json`:

```json
{
  "name": "@spourgiti/desktop",
  "version": "0.0.0",
  "private": true,
  "type": "commonjs",
  "main": "./dist/main.js",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc --noEmit",
    "test": "vitest run --passWithNoTests",
    "dev": "pnpm build && cross-env NODE_ENV=development electron .",
    "rebuild-native": "electron-rebuild -f -w better-sqlite3"
  },
  "dependencies": {
    "@spourgiti/shared": "workspace:*",
    "better-sqlite3": "^11.5.0",
    "electron-updater": "^6.3.9"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.11",
    "cross-env": "^7.0.3",
    "typescript": "^5.6.3",
    "vitest": "^2.1.4"
  }
}
```

- [ ] **Step 2: tsconfig (CommonJS for Electron main)**

`apps/desktop/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "module": "CommonJS",
    "moduleResolution": "Node",
    "target": "ES2022",
    "outDir": "./dist",
    "rootDir": "./src",
    "verbatimModuleSyntax": false,
    "types": ["node"]
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 3: Main entrypoint**

`apps/desktop/src/main.ts`:

```ts
import { app, BrowserWindow } from 'electron';
import { createMainWindow } from './windows/mainWindow';
import { registerIpcHandlers } from './ipc/register';
import { runDbSmokeTest } from './db/smokeTest';

let mainWindow: BrowserWindow | null = null;

app.whenReady().then(async () => {
  runDbSmokeTest();
  registerIpcHandlers();
  mainWindow = createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
```

- [ ] **Step 4: Window factory**

`apps/desktop/src/windows/mainWindow.ts`:

```ts
import { BrowserWindow, app } from 'electron';
import * as path from 'node:path';

export function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1100,
    height: 720,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  if (process.env.NODE_ENV === 'development') {
    win.loadURL('http://localhost:5173');
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    const rendererIndex = path.join(app.getAppPath(), 'renderer', 'index.html');
    win.loadFile(rendererIndex);
  }

  win.once('ready-to-show', () => win.show());
  return win;
}
```

- [ ] **Step 5: Preload**

`apps/desktop/src/preload.ts`:

```ts
import { contextBridge, ipcRenderer } from 'electron';
import { IpcChannel } from '@spourgiti/shared';

const allowed = new Set(Object.values(IpcChannel));

contextBridge.exposeInMainWorld('spourgiti', {
  invoke: (channel: string, req: unknown) => {
    if (!allowed.has(channel as (typeof IpcChannel)[keyof typeof IpcChannel])) {
      return Promise.reject(new Error(`ipc channel not allowed: ${channel}`));
    }
    return ipcRenderer.invoke(channel, req);
  },
});
```

- [ ] **Step 6: IPC registration**

`apps/desktop/src/ipc/register.ts`:

```ts
import { ipcMain } from 'electron';
import { IpcChannel } from '@spourgiti/shared';
import { handlePing } from './handlers/ping';

export function registerIpcHandlers(): void {
  ipcMain.handle(IpcChannel.Ping, (_e, req) => handlePing(req));
}
```

- [ ] **Step 7: Ping handler**

`apps/desktop/src/ipc/handlers/ping.ts`:

```ts
import { app } from 'electron';
import type { PingRequest, PingResponse } from '@spourgiti/shared';

export async function handlePing(req: PingRequest): Promise<PingResponse> {
  return { echoed: req.msg, appVersion: app.getVersion() };
}
```

- [ ] **Step 8: SQLite smoke test (proves rebuild works)**

`apps/desktop/src/db/smokeTest.ts`:

```ts
import Database from 'better-sqlite3';

export function runDbSmokeTest(): void {
  const db = new Database(':memory:');
  const row = db.prepare('SELECT sqlite_version() AS v').get() as { v: string };
  console.log(`[db] better-sqlite3 OK, sqlite ${row.v}`);
  db.close();
}
```

- [ ] **Step 9: Placeholder icon**

Place a 256×256 transparent PNG at `apps/desktop/build/icon.png`. Any valid PNG works for now; electron-builder will use it for installer art. If you don't have one handy:

```bash
node -e "const {writeFileSync} = require('fs'); const b = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAQAAAAEACAYAAABccqhmAAAAEklEQVR42mNk+M9QzwAEMyMAAAlcAv4iSdAdAAAAAElFTkSuQmCC','base64'); writeFileSync('apps/desktop/build/icon.png', b);"
```

- [ ] **Step 10: Install + native rebuild**

Run: `pnpm install && pnpm --filter @spourgiti/desktop rebuild-native`
Expected: `electron-rebuild` rebuilds `better-sqlite3` against the installed Electron version. Final line: `Rebuild Complete`.

- [ ] **Step 11: Build and dev-launch sanity check**

Run (terminal A): `pnpm --filter @spourgiti/renderer dev`
Run (terminal B): `pnpm --filter @spourgiti/desktop dev`

Expected: an Electron window opens, console prints `[db] better-sqlite3 OK, sqlite 3.x.x`, the renderer shows "Version: 0.0.0" (from the ping handler), the "Check for update" button is visible (will fail in next task; that's fine for now).

Close the window before continuing.

- [ ] **Step 12: Commit**

```bash
git add apps/desktop pnpm-lock.yaml
git commit -m "feat(desktop): Electron main + preload + sqlite smoke test"
```

---

## Task 6: Wire `electron-updater` against GitHub Releases

**Files:**
- Create: `apps/desktop/src/updater/index.ts`
- Create: `apps/desktop/src/ipc/handlers/updater.ts`
- Modify: `apps/desktop/src/ipc/register.ts`
- Modify: `apps/desktop/src/main.ts`
- Create: `packages/updater-config/src/index.ts`

- [ ] **Step 1: Centralise GitHub owner/repo**

`packages/updater-config/src/index.ts`:

```ts
export const GITHUB_REPO = {
  owner: 'REPLACE_OWNER',
  repo: 'REPLACE_REPO',
} as const;
```

> Replace `REPLACE_OWNER` / `REPLACE_REPO` with the actual GitHub owner and repository name before tagging the first release. Until then `electron-updater` will refuse to check (which is the correct behaviour for unreleased dev builds).

- [ ] **Step 2: Updater wrapper**

`apps/desktop/src/updater/index.ts`:

```ts
import { autoUpdater, type UpdateInfo } from 'electron-updater';
import { GITHUB_REPO } from '@spourgiti/updater-config';
import { app } from 'electron';

let configured = false;
let lastCheckedInfo: UpdateInfo | null = null;
let downloadInFlight: Promise<void> | null = null;

function configure(): void {
  if (configured) return;
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.setFeedURL({
    provider: 'github',
    owner: GITHUB_REPO.owner,
    repo: GITHUB_REPO.repo,
  });
  autoUpdater.logger = null;
  configured = true;
}

export async function checkForUpdate(): Promise<
  | { status: 'no-update' }
  | { status: 'available'; version: string; releaseNotes?: string }
  | { status: 'error'; error: string }
> {
  configure();
  if (process.env.NODE_ENV === 'development') {
    return { status: 'error', error: 'updater disabled in dev' };
  }
  try {
    const result = await autoUpdater.checkForUpdates();
    const info = result?.updateInfo;
    if (!info) return { status: 'no-update' };
    if (info.version === app.getVersion()) return { status: 'no-update' };
    lastCheckedInfo = info;
    return {
      status: 'available',
      version: info.version,
      releaseNotes: typeof info.releaseNotes === 'string' ? info.releaseNotes : undefined,
    };
  } catch (e) {
    return { status: 'error', error: e instanceof Error ? e.message : String(e) };
  }
}

export async function downloadUpdate(): Promise<
  | { status: 'downloaded' }
  | { status: 'in-progress' }
  | { status: 'error'; error: string }
> {
  configure();
  if (!lastCheckedInfo) return { status: 'error', error: 'no update info; call checkForUpdate first' };
  if (downloadInFlight) return { status: 'in-progress' };
  try {
    downloadInFlight = autoUpdater.downloadUpdate().then(() => {});
    await downloadInFlight;
    downloadInFlight = null;
    return { status: 'downloaded' };
  } catch (e) {
    downloadInFlight = null;
    return { status: 'error', error: e instanceof Error ? e.message : String(e) };
  }
}

export function installUpdate():
  | { status: 'restarting' }
  | { status: 'error'; error: string }
{
  try {
    autoUpdater.quitAndInstall();
    return { status: 'restarting' };
  } catch (e) {
    return { status: 'error', error: e instanceof Error ? e.message : String(e) };
  }
}

export function startBackgroundUpdateLoop(): void {
  // First check 30s after launch; subsequent checks every 6h.
  if (process.env.NODE_ENV === 'development') return;
  setTimeout(() => { void checkForUpdate(); }, 30_000);
  setInterval(() => { void checkForUpdate(); }, 6 * 60 * 60 * 1000);
}
```

- [ ] **Step 3: Updater IPC handlers**

`apps/desktop/src/ipc/handlers/updater.ts`:

```ts
import type {
  UpdaterCheckRequest,
  UpdaterCheckResponse,
  UpdaterDownloadRequest,
  UpdaterDownloadResponse,
  UpdaterInstallRequest,
  UpdaterInstallResponse,
} from '@spourgiti/shared';
import { checkForUpdate, downloadUpdate, installUpdate } from '../../updater';

export async function handleUpdaterCheck(
  _req: UpdaterCheckRequest,
): Promise<UpdaterCheckResponse> {
  const r = await checkForUpdate();
  if (r.status === 'available') {
    return { status: 'available', version: r.version, releaseNotes: r.releaseNotes };
  }
  if (r.status === 'error') return { status: 'error', error: r.error };
  return { status: 'no-update' };
}

export async function handleUpdaterDownload(
  _req: UpdaterDownloadRequest,
): Promise<UpdaterDownloadResponse> {
  return downloadUpdate();
}

export async function handleUpdaterInstall(
  _req: UpdaterInstallRequest,
): Promise<UpdaterInstallResponse> {
  return installUpdate();
}
```

- [ ] **Step 4: Register handlers**

Replace `apps/desktop/src/ipc/register.ts`:

```ts
import { ipcMain } from 'electron';
import { IpcChannel } from '@spourgiti/shared';
import { handlePing } from './handlers/ping';
import {
  handleUpdaterCheck,
  handleUpdaterDownload,
  handleUpdaterInstall,
} from './handlers/updater';

export function registerIpcHandlers(): void {
  ipcMain.handle(IpcChannel.Ping, (_e, req) => handlePing(req));
  ipcMain.handle(IpcChannel.UpdaterCheck, (_e, req) => handleUpdaterCheck(req));
  ipcMain.handle(IpcChannel.UpdaterDownload, (_e, req) => handleUpdaterDownload(req));
  ipcMain.handle(IpcChannel.UpdaterInstall, (_e, req) => handleUpdaterInstall(req));
}
```

- [ ] **Step 5: Start background update loop on app ready**

Replace `apps/desktop/src/main.ts`:

```ts
import { app, BrowserWindow } from 'electron';
import { createMainWindow } from './windows/mainWindow';
import { registerIpcHandlers } from './ipc/register';
import { runDbSmokeTest } from './db/smokeTest';
import { startBackgroundUpdateLoop } from './updater';

let mainWindow: BrowserWindow | null = null;

app.whenReady().then(async () => {
  runDbSmokeTest();
  registerIpcHandlers();
  mainWindow = createMainWindow();
  startBackgroundUpdateLoop();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
```

- [ ] **Step 6: Typecheck**

Run: `pnpm --filter @spourgiti/desktop typecheck`
Expected: clean.

- [ ] **Step 7: Dev-launch sanity check**

Run (two terminals as before): renderer + desktop.
Expected: clicking "Check for update" returns `error: updater disabled in dev`. (We will validate the production update path via CI once Task 8 ships a release.)

- [ ] **Step 8: Commit**

```bash
git add apps/desktop packages/updater-config
git commit -m "feat(updater): wire electron-updater against GitHub Releases"
```

---

## Task 7: `electron-builder` configuration

**Files:**
- Create: `electron-builder.yml`
- Modify: root `package.json` (add `build` field, app id)

- [ ] **Step 1: Add `build` field to root `package.json`**

Open root `package.json` and merge in (under `"version"` and before `"scripts"`):

```json
"productName": "Spourgiti",
"description": "Local-first collaborative file-sync desktop app",
"author": {
  "name": "Spourgiti",
  "email": "noreply@example.com"
},
```

- [ ] **Step 2: Write `electron-builder.yml`**

```yaml
appId: app.spourgiti.desktop
productName: Spourgiti
directories:
  output: release-builds
  buildResources: apps/desktop/build
files:
  - "apps/desktop/dist/**/*"
  - "apps/desktop/package.json"
  - "node_modules/**/*"
extraResources:
  - from: "apps/renderer/dist"
    to: "renderer"
asar: true
asarUnpack:
  - "**/*.node"
publish:
  - provider: github
    owner: REPLACE_OWNER
    repo: REPLACE_REPO
    vPrefixedTagName: true
    releaseType: release
win:
  target:
    - target: nsis
      arch: [x64]
  artifactName: "Spourgiti-Setup-${version}.${ext}"
  # Code-signing slot. Absent env vars -> unsigned build proceeds.
  # When ready, set WIN_CSC_LINK + WIN_CSC_KEY_PASSWORD in CI secrets.
nsis:
  oneClick: false
  perMachine: false
  allowToChangeInstallationDirectory: true
  deleteAppDataOnUninstall: false
mac:
  category: public.app-category.productivity
  target:
    - target: dmg
      arch: [x64, arm64]
    - target: zip
      arch: [x64, arm64]
  artifactName: "Spourgiti-${version}-${arch}.${ext}"
  # CSC_LINK + CSC_KEY_PASSWORD slot in for signing.
  # notarize is intentionally omitted; enable when an Apple Developer ID is in CI.
linux:
  target:
    - AppImage
    - deb
  category: Office
  artifactName: "Spourgiti-${version}-${arch}.${ext}"
```

- [ ] **Step 3: Update `apps/desktop/src/windows/mainWindow.ts` to load the renderer from `extraResources`**

Replace the `else` branch's `loadFile` line in `mainWindow.ts`:

```ts
  } else {
    // In production, renderer is copied to extraResources/renderer/.
    // app.getAppPath() returns the .asar root; resourcesPath is the parent that holds extraResources.
    const rendererIndex = path.join(process.resourcesPath, 'renderer', 'index.html');
    win.loadFile(rendererIndex);
  }
```

(Replace the corresponding line you wrote in Task 5. The dev branch and other code remain unchanged.)

- [ ] **Step 4: Replace `REPLACE_OWNER` / `REPLACE_REPO`**

Run search-and-replace across the repo, replacing both placeholder strings with the actual GitHub owner and repository slug. Files affected: `electron-builder.yml`, `packages/updater-config/src/index.ts`.

- [ ] **Step 5: Local package smoke test**

Run: `pnpm package`
Expected: produces an installer in `release-builds/` for the host OS. Open it; install; launch the installed app; observe the same window from Task 5. Uninstall when done.

> The Mac/Linux builds are exercised by CI (Task 8). Don't worry about cross-building from a single machine.

- [ ] **Step 6: Commit**

```bash
git add electron-builder.yml package.json apps/desktop/src/windows/mainWindow.ts packages/updater-config/src/index.ts
git commit -m "build: electron-builder config with GitHub publish + signing slots"
```

---

## Task 8: GitHub Actions — CI and Release workflows

**Files:**
- Create: `.github/workflows/ci.yml`
- Create: `.github/workflows/release.yml`

- [ ] **Step 1: CI workflow (PRs and main)**

`.github/workflows/ci.yml`:

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
```

- [ ] **Step 2: Release workflow (tag-driven, three OSes)**

`.github/workflows/release.yml`:

```yaml
name: Release

on:
  push:
    tags:
      - 'v*'

jobs:
  build:
    strategy:
      fail-fast: false
      matrix:
        os: [ubuntu-latest, macos-latest, windows-latest]
    runs-on: ${{ matrix.os }}
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
      - run: pnpm --filter @spourgiti/desktop rebuild-native
      - run: pnpm build:renderer
      - run: pnpm build:desktop
      - name: Build & publish
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          # Code-signing secrets (optional). Empty = unsigned build.
          WIN_CSC_LINK: ${{ secrets.WIN_CSC_LINK }}
          WIN_CSC_KEY_PASSWORD: ${{ secrets.WIN_CSC_KEY_PASSWORD }}
          CSC_LINK: ${{ secrets.CSC_LINK }}
          CSC_KEY_PASSWORD: ${{ secrets.CSC_KEY_PASSWORD }}
        run: pnpm exec electron-builder --publish always
```

- [ ] **Step 3: Verify YAML parses**

Run: `node -e "console.log(require('js-yaml').load(require('fs').readFileSync('.github/workflows/release.yml','utf8')).jobs.build.strategy.matrix.os)"`

If `js-yaml` isn't already installed, skip this step — it's belt-and-suspenders. Visual inspection is fine.

- [ ] **Step 4: Push to a new branch and open a PR to confirm CI runs**

```bash
git checkout -b foundation
git add .github
git commit -m "ci: add CI and tag-driven release workflows"
git push -u origin foundation
```

Open a PR. Expected: the `check` job runs and goes green.

- [ ] **Step 5: Merge to main**

Merge the PR via the GitHub UI (squash or merge — engineer's choice).

---

## Task 9: First release — end-to-end auto-update verification

This is the integration test for the entire pipeline. We tag `v0.0.1`, let CI publish it, install it on a machine, then bump to `v0.0.2`, tag, and verify the installed app self-updates.

- [ ] **Step 1: Bump version to 0.0.1 on main**

```bash
git checkout main && git pull
```

Edit root `package.json`: `"version": "0.0.1"`.
Edit `apps/desktop/package.json`: `"version": "0.0.1"`.
Edit `apps/renderer/package.json`: `"version": "0.0.1"`.

```bash
git add package.json apps/desktop/package.json apps/renderer/package.json
git commit -m "chore: release v0.0.1"
git tag v0.0.1
git push origin main --tags
```

- [ ] **Step 2: Watch CI**

Open the Actions tab. The `Release` workflow should run on all three OSes. When green, the `v0.0.1` GitHub Release should contain installers + `latest.yml`, `latest-mac.yml`, `latest-linux.yml`.

- [ ] **Step 3: Install on the dev machine**

Download the installer for your OS from the Release page, run it, launch the installed app. The window should open and show "Version: 0.0.1".

- [ ] **Step 4: Bump to 0.0.2**

Make any trivial change (e.g., update `README.md`).

```bash
# Edit README.md (any change)
git add README.md
git commit -m "docs: trivial change for v0.0.2 update test"
```

Edit the same three `package.json` files: `"version": "0.0.2"`.

```bash
git add package.json apps/desktop/package.json apps/renderer/package.json
git commit -m "chore: release v0.0.2"
git tag v0.0.2
git push origin main --tags
```

- [ ] **Step 5: Wait for `v0.0.2` Release to publish**

When CI is green, leave the still-running v0.0.1 install open (or relaunch it). Click "Check for update".

Expected: the UI shows `v0.0.2 available`. Within 30 seconds the background loop will also have detected it.

- [ ] **Step 6: Verify the download + install path**

Wire a one-off manual test from the renderer DevTools console:

```js
await window.spourgiti.invoke('updater:download', {})
// expect { status: 'downloaded' }
await window.spourgiti.invoke('updater:install', {})
// app restarts; on next launch the version reads 0.0.2
```

If the install completes and the relaunched app shows "Version: 0.0.2", **the entire foundation is verified end-to-end**.

- [ ] **Step 7: Commit nothing; the test result is the artifact**

Document the success in a short note in `README.md` under a new "Release verification" section:

```markdown
## Release verification

End-to-end auto-update verified at v0.0.1 → v0.0.2 on Windows / macOS / Linux on YYYY-MM-DD.
```

```bash
git add README.md
git commit -m "docs: record release-pipeline verification"
git push
```

---

## Self-Review Notes

**Spec coverage check (matched to design doc §):**
- §2 Stack: Tasks 1, 4, 5 (Electron+Vite+React+TS+pnpm).
- §4 Module layout: Tasks 2, 3 (placeholder packages create the structure later plans use).
- §12 Build/Release/Auto-update: Tasks 6, 7, 8, 9 (electron-builder, electron-updater, GH Actions, signing slots, full E2E test).
- Other spec sections (§3 trust, §5 crypto, §6 schema, §7 lifecycle, §8 chats, §9 buffer, §10 auth, §11 errors, §13 testing) are **deferred to subsequent plans** — this plan is intentionally scoped to "release pipeline + skeleton."

**Type consistency:** all IPC types are defined once in `@spourgiti/shared` and consumed elsewhere by name; updater types match between handler, wrapper, and renderer.

**No placeholders left in actual code shipped to users** — the only literal placeholders are `REPLACE_OWNER` / `REPLACE_REPO`, which Task 7 Step 4 explicitly substitutes before any release ships.

**Frequent commits:** every task ends with a commit; Tasks 1-7 produce 7 commits, Task 8 adds CI, Task 9 produces the first two release tags.
