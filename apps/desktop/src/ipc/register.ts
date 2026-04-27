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
