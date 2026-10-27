import type { ReactNode } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
export function PageShell({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  return (
    <div className="page-shell">
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      <header className="site-header">
        <Link className="brand" to="/" aria-label="Gatherly home">
          Gatherly
        </Link>
        <nav aria-label="Primary navigation">
          {user ? (
            <>
              <NavLink to="/events">My events</NavLink>
              <button className="button-link" type="button" onClick={logout}>
                Log out
              </button>
            </>
          ) : (
            <>
              <NavLink to="/login">Log in</NavLink>
              <Link className="button small" to="/signup">
                Get started
              </Link>
            </>
          )}
        </nav>
      </header>
      <main id="main-content" tabIndex={-1}>
        {children}
      </main>
      <footer>
        <p>Designed for memorable moments and practical decisions.</p>
      </footer>
    </div>
  );
}
