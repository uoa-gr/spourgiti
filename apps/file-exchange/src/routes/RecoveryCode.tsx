import { useLocation, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { Page } from '../components/Page.js';
import { Button } from '../components/Button.js';
import { formatRecoveryCode } from '../auth/crypto-binding.js';

interface State {
  recoveryCodeHex?: string;
}

export function RecoveryCode() {
  const navigate = useNavigate();
  const { state } = useLocation();
  const code = (state as State)?.recoveryCodeHex;

  const [acked, setAcked] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!code) {
    // No code in route state — user reloaded the page. Redirect to inbox.
    navigate('/inbox', { replace: true });
    return null;
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(code!);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: ignore — user can select & copy manually
    }
  }

  return (
    <Page>
      <h1 style={{ fontFamily: '"Cormorant Garamond", Garamond, serif', fontWeight: 600, fontSize: 32 }}>
        Save your recovery code
      </h1>
      <p style={{ color: '#1a1a1a' }}>
        This is the only way to recover messages if you forget your password. Write it down, save it in a password manager, or print it. <strong>We can’t reset it for you.</strong>
      </p>

      <div
        role="textbox"
        aria-readonly="true"
        aria-label="Recovery code"
        style={{
          fontFamily: '"JetBrains Mono", "IBM Plex Mono", ui-monospace, monospace',
          fontSize: 18,
          padding: '1rem 1.25rem',
          margin: '2rem 0',
          background: '#ffffff',
          border: '1px solid #5a5a5a',
          letterSpacing: '0.05em',
          wordBreak: 'break-all',
          userSelect: 'all',
          minHeight: 44,
        }}
      >
        {formatRecoveryCode(code)}
      </div>

      <Button onClick={copy}>{copied ? 'Copied' : 'Copy'}</Button>

      <label
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          marginTop: '2.5rem',
          cursor: 'pointer',
        }}
      >
        <input
          type="checkbox"
          checked={acked}
          onChange={(e) => setAcked(e.target.checked)}
          style={{ width: 24, height: 24, accentColor: '#b03a2e' }}
        />
        <span>I’ve saved my recovery code somewhere safe.</span>
      </label>

      <div style={{ marginTop: '2rem' }}>
        <Button
          variant="primary"
          disabled={!acked}
          onClick={() => navigate('/inbox', { replace: true })}
        >
          Continue
        </Button>
      </div>
    </Page>
  );
}
