import { APP_VERSION } from '@spourgiti/shared';

export function App() {
  return (
    <main style={{ fontFamily: '"EB Garamond", Garamond, "Times New Roman", serif', padding: '4rem 2rem', maxWidth: 720, margin: '0 auto', backgroundColor: '#f6f1e7', color: '#1a1a1a', minHeight: '100vh' }}>
      <h1 style={{ fontFamily: '"Cormorant Garamond", Garamond, serif', fontWeight: 600 }}>Spourgiti Send</h1>
      <p>End-to-end encrypted file sharing. Web edition v{APP_VERSION}.</p>
      <p style={{ color: '#5a5a5a' }}>
        The real UI lands in Plans 3c–3f. This page exists to prove the build chain works end-to-end.
      </p>
    </main>
  );
}
