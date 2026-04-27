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
