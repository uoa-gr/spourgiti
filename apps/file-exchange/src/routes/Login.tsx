import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Page } from '../components/Page.js';
import { Field } from '../components/Field.js';
import { Button } from '../components/Button.js';
import { signInPassword } from '../auth/api.js';
import { useCryptoStore } from '../store/cryptoContext.js';

export function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>('');
  const [needsRecovery, setNeedsRecovery] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setPending(true);
    const r = await signInPassword(email, password);
    setPending(false);

    if (!r.ok) {
      switch (r.reason) {
        case 'wrong_password':
          setError('Password didn’t match.');
          break;
        case 'no_keys_on_device':
          setNeedsRecovery(true);
          setError('Your encryption keys live on the device where you signed up. Open File Exchange there to read your messages, or use your recovery code to set up this device.');
          break;
        case 'auth_error':
          setError(r.message);
          break;
        case 'rpc_error':
          setError('Couldn’t reach the server. Try again.');
          break;
      }
      return;
    }

    useCryptoStore.getState().setUnlocked(r.privateKey, r.publicKey);
    navigate('/inbox', { replace: true });
  }

  return (
    <Page>
      <h1 style={{ fontFamily: '"Cormorant Garamond", Garamond, serif', fontWeight: 600, fontSize: 32 }}>Sign in</h1>
      <form onSubmit={onSubmit} noValidate>
        <Field
          label="Email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Field
          label="Password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={error || undefined}
        />
        <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center', marginTop: '1rem' }}>
          <Button type="submit" variant="primary" disabled={pending}>
            {pending ? 'Signing in…' : 'Sign in'}
          </Button>
          <Link to="/signup" style={{ color: '#5a5a5a' }}>Create account</Link>
          {needsRecovery && (
            <Link to="/recovery" style={{ color: '#5a5a5a' }}>Use recovery code</Link>
          )}
        </div>
      </form>
    </Page>
  );
}
