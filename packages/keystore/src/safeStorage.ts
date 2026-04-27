import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { app, safeStorage } from 'electron';

import { type KeyHandle, type Keystore, KeystoreError, asHandle } from './types.js';

const STORAGE_SUBDIR = 'keystore';

export class SafeStorageKeystore implements Keystore {
  private readonly dir: string;

  constructor(baseDir?: string) {
    this.dir = baseDir ?? join(app.getPath('userData'), STORAGE_SUBDIR);
  }

  private fileFor(handle: KeyHandle): string {
    return join(this.dir, `${handle}.bin`);
  }

  private assertAvailable(): void {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new KeystoreError('OS-level encryption is not available', 'NOT_AVAILABLE');
    }
  }

  async put(label: string, secret: Uint8Array): Promise<KeyHandle> {
    this.assertAvailable();
    await fs.mkdir(this.dir, { recursive: true });
    const handle = asHandle(`${label}-${randomUUID()}`);
    const ciphertext = safeStorage.encryptString(Buffer.from(secret).toString('base64'));
    await fs.writeFile(this.fileFor(handle), ciphertext);
    return handle;
  }

  async get(handle: KeyHandle): Promise<Uint8Array> {
    this.assertAvailable();
    let ciphertext: Buffer;
    try {
      ciphertext = await fs.readFile(this.fileFor(handle));
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new KeystoreError(`no secret for handle ${handle}`, 'NOT_FOUND');
      }
      throw e;
    }
    let plaintextB64: string;
    try {
      plaintextB64 = safeStorage.decryptString(ciphertext);
    } catch (e) {
      throw new KeystoreError(
        `failed to decrypt secret for handle ${handle}: ${e instanceof Error ? e.message : String(e)}`,
        'CORRUPT',
      );
    }
    return new Uint8Array(Buffer.from(plaintextB64, 'base64'));
  }

  async has(handle: KeyHandle): Promise<boolean> {
    try {
      await fs.access(this.fileFor(handle));
      return true;
    } catch {
      return false;
    }
  }

  async delete(handle: KeyHandle): Promise<void> {
    try {
      await fs.unlink(this.fileFor(handle));
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return;
      throw e;
    }
  }
}
