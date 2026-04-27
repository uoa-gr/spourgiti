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
