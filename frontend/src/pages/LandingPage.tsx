import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getHealth } from '../api/auth';
import { PageShell } from '../components/layout/PageShell';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
type State = 'loading' | 'ready' | 'error';
export default function LandingPage() {
  useDocumentTitle('Plan meaningful events');
  const [state, setState] = useState<State>('loading');
  const check = (signal?: AbortSignal) => {
    setState('loading');
    void getHealth(signal)
      .then(() => setState('ready'))
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === 'AbortError'))
          setState('error');
      });
  };
  useEffect(() => {
    const controller = new AbortController();
    check(controller.signal);
    return () => controller.abort();
  }, []);
  return (
    <PageShell>
      <section className="hero" aria-labelledby="hero-title">
        <p className="eyebrow">Plan together. Celebrate better.</p>
        <h1 id="hero-title">Turn your event idea into a plan you can use.</h1>
        <p className="hero-copy">
          Build a practical budget, timeline, vendor checklist, and fresh ideas
          in one calm workspace.
        </p>
        <div className="actions">
          <Link className="button" to="/signup">
            Start planning free
          </Link>
          <Link className="text-link" to="/login">
            Log in
          </Link>
        </div>
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
        <div className={`status status--${state}`} role="status">
          <span className="status-dot" aria-hidden="true" />
          {state === 'loading'
            ? 'Checking backend…'
            : state === 'ready'
              ? 'Backend connected'
              : 'Backend unavailable'}
        </div>
        {state === 'error' && (
          <button type="button" onClick={() => check()}>
            Try again
          </button>
        )}
      </section>
    </PageShell>
  );
}
