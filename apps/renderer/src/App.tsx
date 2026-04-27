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
