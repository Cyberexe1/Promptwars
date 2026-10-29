import type { ReactNode } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { Icon } from '../Icons';
export function PageShell({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  return (
    <div className="page-shell">
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      <header className="site-header">
        <div className="site-header__inner">
          <Link className="brand" to="/" aria-label="Gatherly home">
            <span className="brand-mark" aria-hidden="true">
              <Icon name="sparkle" />
            </span>
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
        </div>
      </header>
      <main id="main-content" tabIndex={-1}>
        {children}
      </main>
      <footer className="site-footer">
        <p>Designed for memorable moments and practical decisions.</p>
      </footer>
    </div>
  );
}
