import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Page } from '../components/Page.js';
import { Field } from '../components/Field.js';
import { Button } from '../components/Button.js';
import { resetWithRecoveryCode } from '../auth/api.js';
import { useCryptoStore } from '../store/cryptoContext.js';

export function Recovery() {
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (newPassword.length < 12) { setError('New password must be at least 12 characters.'); return; }
    setPending(true);
    const r = await resetWithRecoveryCode(code.replace(/\s+/g, ''), newPassword);
    setPending(false);

    if (!r.ok) {
      switch (r.reason) {
        case 'wrong_code': setError('That recovery code didn’t match.'); break;
        case 'no_session': setError(r.message); break;
        case 'auth_error': setError(r.message); break;
        case 'rpc_error': setError('Couldn’t reach the server. Try again.'); break;
      }
      return;
    }

    useCryptoStore.getState().setUnlocked(r.privateKey, r.publicKey);
    navigate('/inbox', { replace: true });
  }

  return (
    <Page>
      <h1 style={{ fontFamily: '"Cormorant Garamond", Garamond, serif', fontWeight: 600, fontSize: 32 }}>
        Use recovery code
      </h1>
      <p style={{ color: '#1a1a1a' }}>
        Enter the 24-byte recovery code you saved when you created your account, plus a new password. Spaces and middle-dots are ignored.
      </p>
      <form onSubmit={onSubmit} noValidate>
        <Field
          label="Recovery code"
          required
          value={code}
          onChange={(e) => setCode(e.target.value)}
          style={{ fontFamily: '"JetBrains Mono", "IBM Plex Mono", ui-monospace, monospace' }}
          autoComplete="off"
          spellCheck={false}
        />
        <Field
          label="New password"
          type="password"
          autoComplete="new-password"
          required
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          error={error || undefined}
        />
        <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center', marginTop: '1rem' }}>
          <Button type="submit" variant="primary" disabled={pending}>
            {pending ? 'Resetting…' : 'Reset password'}
          </Button>
          <Link to="/login" style={{ color: '#5a5a5a' }}>Back to sign-in</Link>
        </div>
      </form>
    </Page>
  );
}
