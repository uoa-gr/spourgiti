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
