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
