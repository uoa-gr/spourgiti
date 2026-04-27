import type { ReactNode } from 'react';

/** Manuscript-feel page wrapper: cream paper, single column, generous margins. */
export function Page({ children }: { children: ReactNode }) {
  return (
    <main
      style={{
        fontFamily: '"EB Garamond", Garamond, "Times New Roman", serif',
        fontSize: 16,
        fontWeight: 500,
        lineHeight: 1.6,
        color: '#1a1a1a',
        backgroundColor: '#f6f1e7',
        minHeight: '100vh',
        padding: '4rem 2rem',
      }}
    >
      <div style={{ maxWidth: 720, margin: '0 auto' }}>{children}</div>
    </main>
  );
}
