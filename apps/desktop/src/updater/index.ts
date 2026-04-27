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
