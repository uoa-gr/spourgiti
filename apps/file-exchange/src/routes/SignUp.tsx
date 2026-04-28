import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Page, PageTitle, PageHelper } from '../components/Page.js';
import { Field } from '../components/Field.js';
import { Button } from '../components/Button.js';
import { signUp } from '../auth/api.js';
import { useCryptoStore } from '../store/cryptoContext.js';

export function SignUp() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string>('');
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (password.length < 12) { setError('Password must be at least 12 characters.'); return; }

    setPending(true);
    const r = await signUp(email, password);
    setPending(false);

    if (!r.ok) {
      switch (r.reason) {
        case 'email_in_use': setError('That email is already registered. Try signing in.'); break;
        case 'auth_error':
        case 'rpc_error': setError(r.message); break;
      }
      return;
    }

    useCryptoStore.getState().setUnlocked(r.privateKey, r.publicKey);
    navigate('/signup/recovery-code', { replace: true, state: { recoveryCodeHex: r.recoveryCodeHex } });
  }

  return (
    <Page>
      <PageTitle>Create account</PageTitle>
      <PageHelper>Your keys are generated on this device. We never see your password or your messages.</PageHelper>
      <form onSubmit={onSubmit} className="form" noValidate>
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
          autoComplete="new-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={error || undefined}
          hint="At least 12 characters."
        />
        <Button type="submit" disabled={pending}>
          {pending ? 'Creating account…' : 'Create account'}
        </Button>
      </form>
      <p className="linkrow">
        Already have one?<Link to="/login">Sign in</Link>
      </p>
    </Page>
  );
}
