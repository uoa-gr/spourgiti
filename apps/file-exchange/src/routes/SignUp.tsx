import { useState, useEffect, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Page } from '../components/Page.js';
import { Field } from '../components/Field.js';
import { Button } from '../components/Button.js';
import { signUp } from '../auth/api.js';
import { getSupabaseClient, usernameAvailable } from '@liaskos/supabase-client';
import { useCryptoStore } from '../store/cryptoContext.js';

const USERNAME_RE = /^[a-z0-9_]{3,20}$/;

export function SignUp() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [usernameError, setUsernameError] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [pending, setPending] = useState(false);

  // Debounced username availability check
  useEffect(() => {
    if (!username) { setUsernameError(''); return; }
    if (!USERNAME_RE.test(username)) {
      setUsernameError('3–20 chars, lowercase letters, digits, underscores.');
      return;
    }
    setUsernameError('');
    const t = setTimeout(async () => {
      try {
        const ok = await usernameAvailable(getSupabaseClient(), username);
        if (!ok) setUsernameError('Already taken.');
      } catch {
        // network glitch — let the submit re-check
      }
    }, 400);
    return () => clearTimeout(t);
  }, [username]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (usernameError) return;
    if (password.length < 12) { setError('Password must be at least 12 characters.'); return; }

    setPending(true);
    const r = await signUp(email, username, password);
    setPending(false);

    if (!r.ok) {
      switch (r.reason) {
        case 'email_in_use':
          setError('That email is already registered. Try signing in.');
          break;
        case 'username_taken':
          setUsernameError('Already taken.');
          break;
        case 'auth_error':
        case 'rpc_error':
          setError(r.message);
          break;
      }
      return;
    }

    useCryptoStore.getState().setUnlocked(r.privateKey, r.publicKey);
    navigate('/signup/recovery-code', {
      replace: true,
      state: { recoveryCodeHex: r.recoveryCodeHex },
    });
  }

  return (
    <Page>
      <h1 style={{ fontFamily: '"Cormorant Garamond", Garamond, serif', fontWeight: 600, fontSize: 32 }}>Create account</h1>
      <p style={{ color: '#5a5a5a' }}>
        End-to-end encrypted file transfer between named people. No-one but you and the person you send to can read your files — not even us.
      </p>
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
          label="Username"
          autoComplete="username"
          required
          value={username}
          onChange={(e) => setUsername(e.target.value.toLowerCase())}
          error={usernameError || undefined}
          placeholder="3–20 chars, a-z 0-9 _"
        />
        <Field
          label="Password"
          type="password"
          autoComplete="new-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={error || undefined}
        />
        <p style={{ fontSize: 14, color: '#5a5a5a', marginTop: '-0.5rem', marginBottom: '1rem' }}>
          You’ll see a recovery code next — the only way to recover messages if you forget your password. Save it somewhere safe.
        </p>
        <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center', marginTop: '1rem' }}>
          <Button type="submit" variant="primary" disabled={pending}>
            {pending ? 'Creating…' : 'Create account'}
          </Button>
          <Link to="/login" style={{ color: '#5a5a5a' }}>Already have one</Link>
        </div>
      </form>
    </Page>
  );
}
