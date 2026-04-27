import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { Page } from '../components/Page.js';
import { signOut } from '../auth/api.js';

const navStyle = {
  fontFamily: '"Cormorant Garamond", Garamond, serif',
  fontSize: 18,
  fontWeight: 600,
  color: '#1a1a1a',
  textDecoration: 'none',
  paddingBottom: 4,
  borderBottom: '1px solid transparent',
};

const navActive = { ...navStyle, borderBottom: '2px solid #b03a2e' };

export function ProtectedShell() {
  const navigate = useNavigate();
  return (
    <Page>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '3rem' }}>
        <Link to="/inbox" style={{ ...navStyle, fontSize: 28 }}>File Exchange</Link>
        <nav aria-label="Primary" style={{ display: 'flex', gap: '2rem', alignItems: 'baseline' }}>
          <NavLink to="/inbox" style={({ isActive }) => (isActive ? navActive : navStyle)} aria-label="Section 1: Inbox">
            <span aria-hidden="true">I.</span> Inbox
          </NavLink>
          <NavLink to="/outbox" style={({ isActive }) => (isActive ? navActive : navStyle)} aria-label="Section 2: Outbox">
            <span aria-hidden="true">II.</span> Outbox
          </NavLink>
          <NavLink to="/send" style={({ isActive }) => (isActive ? navActive : navStyle)} aria-label="Section 3: Send">
            <span aria-hidden="true">III.</span> Send
          </NavLink>
          <button
            type="button"
            onClick={async () => { await signOut(); navigate('/login', { replace: true }); }}
            style={{ background: 'none', border: 'none', color: '#5a5a5a', font: 'inherit', cursor: 'pointer', minHeight: 44 }}
          >
            Sign out
          </button>
        </nav>
      </header>
      <Outlet />
    </Page>
  );
}
