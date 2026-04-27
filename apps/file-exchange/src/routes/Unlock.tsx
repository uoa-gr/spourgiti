import { useState, type FormEvent } from 'react';
import { Page } from '../components/Page.js';
import { Field } from '../components/Field.js';
import { Button } from '../components/Button.js';
import { IdbBrowserKeystore } from '@liaskos/keystore';
import { unwrapWithPassword, hexToBytes } from '../auth/crypto-binding.js';
import { getSupabaseClient } from '@liaskos/supabase-client';
import { useCryptoStore } from '../store/cryptoContext.js';
import { signOut } from '../auth/api.js';

const keystore = new IdbBrowserKeystore();

export function Unlock() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setPending(true);
    try {
      const stored = await keystore.loadEncryptedKey();
      if (!stored) {
        setError('No encryption keys on this device. Sign out and use recovery code.');
        return;
      }
      const sk = await unwrapWithPassword(password, stored);

      // Pull the public key from profiles_public for trust-on-first-use later.
      const sb = getSupabaseClient();
      const { data: u } = await sb.auth.getUser();
      const userId = u.user?.id;
      let pk: Uint8Array;
      if (userId) {
        const { data: row } = await sb
          .from('profiles_public')
          .select('ed25519_public_key')
          .eq('id', userId)
          .maybeSingle();
        const hex = (row?.ed25519_public_key as string | undefined)?.replace(/^\\x/, '');
        pk = hex ? hexToBytes(hex) : sk.subarray(32);
      } else {
        pk = sk.subarray(32);
      }

      useCryptoStore.getState().setUnlocked(sk, pk);
    } catch {
      setError('Password didn’t unlock the key.');
    } finally {
      setPending(false);
    }
  }

  return (
    <Page>
      <h1 style={{ fontFamily: '"Cormorant Garamond", Garamond, serif', fontWeight: 600, fontSize: 32 }}>
        Unlock
      </h1>
      <p style={{ color: '#5a5a5a' }}>
        Enter your password to read your messages on this device.
      </p>
      <form onSubmit={onSubmit} noValidate>
        <Field
          label="Password"
          type="password"
          autoComplete="current-password"
          required
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={error || undefined}
        />
        <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center', marginTop: '1rem' }}>
          <Button type="submit" variant="primary" disabled={pending}>
            {pending ? 'Unlocking…' : 'Unlock'}
          </Button>
          <button
            type="button"
            onClick={async () => { await signOut(); }}
            style={{ background: 'none', border: 'none', color: '#5a5a5a', cursor: 'pointer', font: 'inherit', minHeight: 44 }}
          >
            Sign out
          </button>
        </div>
      </form>
    </Page>
  );
}
