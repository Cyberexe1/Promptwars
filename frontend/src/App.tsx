import { useEffect, useState } from 'react';
import { getHealth } from './api/client';

type ConnectionState = 'checking' | 'connected' | 'unavailable';

function wasAborted(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

export function App() {
  const [connection, setConnection] = useState<ConnectionState>('checking');

  useEffect(() => {
    const controller = new AbortController();

    void getHealth(controller.signal)
      .then(() => setConnection('connected'))
      .catch((error: unknown) => {
        if (!wasAborted(error)) setConnection('unavailable');
      });

    return () => controller.abort();
  }, []);

  const retryConnection = async () => {
    setConnection('checking');

    try {
      await getHealth();
      setConnection('connected');
    } catch {
      setConnection('unavailable');
    }
  };

  return (
    <div className="page-shell">
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      <header className="site-header">
        <a className="brand" href="/" aria-label="Gatherly home">
          Gatherly
        </a>
        <span className="phase-label">Foundation preview</span>
      </header>

      <main id="main-content">
        <section className="hero" aria-labelledby="hero-title">
          <p className="eyebrow">Plan together. Celebrate better.</p>
          <h1 id="hero-title">Turn your event idea into a plan you can use.</h1>
          <p className="hero-copy">
            Build practical budgets, timelines, vendor checklists, and personal
            ideas for weddings, birthdays, and community events.
          </p>
          <div className="event-types" aria-label="Supported event types">
            <span>Weddings</span>
            <span>Birthdays</span>
            <span>Community events</span>
          </div>
        </section>

        <section className="connection-card" aria-labelledby="connection-title">
          <div>
            <p className="eyebrow">System status</p>
            <h2 id="connection-title">Planning services</h2>
          </div>
          <div className={`status status--${connection}`} role="status">
            <span className="status-dot" aria-hidden="true" />
            {connection === 'checking' && 'Checking backend…'}
            {connection === 'connected' && 'Backend connected'}
            {connection === 'unavailable' && 'Backend unavailable'}
          </div>
          {connection === 'unavailable' && (
            <button type="button" onClick={() => void retryConnection()}>
              Try again
            </button>
          )}
        </section>
      </main>

      <footer>
        <p>Designed for memorable moments and practical decisions.</p>
      </footer>
    </div>
  );
}
