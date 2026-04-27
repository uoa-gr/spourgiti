import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { useCryptoStore } from './store/cryptoContext.js';
import { bindAuthSessionToCryptoStore } from './auth/session-listener.js';
import { getSupabaseClient } from '@liaskos/supabase-client';
import { Login } from './routes/Login.js';
import { SignUp } from './routes/SignUp.js';
import { RecoveryCode } from './routes/RecoveryCode.js';
import { Recovery } from './routes/Recovery.js';
import { Unlock } from './routes/Unlock.js';
import { ProtectedShell } from './routes/ProtectedShell.js';
import { Inbox } from './routes/Inbox.js';
import { Outbox } from './routes/Outbox.js';
import { Send } from './routes/Send.js';

function useSessionActive(): boolean | 'loading' {
  const [v, setV] = useState<boolean | 'loading'>('loading');
  useEffect(() => {
    const sb = getSupabaseClient();
    let mounted = true;
    sb.auth.getSession().then(({ data }) => {
      if (mounted) setV(Boolean(data.session));
    });
    const sub = sb.auth.onAuthStateChange((_event, session) => {
      if (mounted) setV(Boolean(session));
    });
    return () => {
      mounted = false;
      sub.data.subscription.unsubscribe();
    };
  }, []);
  return v;
}

function Protected() {
  const session = useSessionActive();
  const cryptoStatus = useCryptoStore((s) => s.state.status);
  if (session === 'loading') return null;
  if (!session) return <Navigate to="/login" replace />;
  if (cryptoStatus !== 'unlocked') return <Unlock />;
  return <Outlet />;
}

export function App() {
  useEffect(() => {
    bindAuthSessionToCryptoStore();
  }, []);

  // Vite respects PAGES_BASE_URL at build; on GitHub Pages, BrowserRouter
  // needs the same basename so client routes resolve under /file-exchange/.
  const basename = (import.meta.env.BASE_URL || '/').replace(/\/$/, '') || undefined;

  return (
    <BrowserRouter basename={basename}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<SignUp />} />
        <Route path="/signup/recovery-code" element={<RecoveryCode />} />
        <Route path="/recovery" element={<Recovery />} />
        <Route element={<Protected />}>
          <Route element={<ProtectedShell />}>
            <Route path="/inbox" element={<Inbox />} />
            <Route path="/outbox" element={<Outbox />} />
            <Route path="/send" element={<Send />} />
            <Route path="/" element={<Navigate to="/inbox" replace />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/inbox" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
