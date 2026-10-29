import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getHealth } from '../api/auth';
import { Icon, type IconName } from '../components/Icons';
import { PageShell } from '../components/layout/PageShell';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
type State = 'loading' | 'ready' | 'error';
const features: { icon: IconName; title: string; text: string }[] = [
  {
    icon: 'budget',
    title: 'Budget that adds up',
    text: 'Get a category split for your total, then track real spending and see overspending the moment it happens.',
  },
  {
    icon: 'timeline',
    title: 'Timeline that keeps pace',
    text: 'Tasks are grouped into phases and dated backwards from the big day, with urgent and overdue items flagged.',
  },
  {
    icon: 'vendors',
    title: 'Vendor checklist',
    text: 'Know who to book, how early, and what to ask. Save quotes and move each vendor from research to booked.',
  },
  {
    icon: 'sparkle',
    title: 'AI ideas and assistant',
    text: 'Ask for themes, menus, decor, and more. If AI is unavailable, your plan and fallback ideas still work.',
  },
];
const steps = [
  {
    title: 'Describe your event',
    text: 'Pick the type, date, city, guest count, and budget in a short guided form.',
  },
  {
    title: 'Get your starting plan',
    text: 'Gatherly builds the budget, timeline, and vendor list from proven planning rules.',
  },
  {
    title: 'Refine with AI',
    text: 'Preview suggested changes, then apply only the ones you like.',
  },
];
const kinds: { icon: IconName; title: string; text: string }[] = [
  {
    icon: 'heart',
    title: 'Weddings',
    text: 'Long lead times, many vendors, one clear plan.',
  },
  {
    icon: 'cake',
    title: 'Birthdays',
    text: 'From a backyard party to a milestone celebration.',
  },
  {
    icon: 'community',
    title: 'Community events',
    text: 'Volunteers, venues, and budgets that stay balanced.',
  },
];
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
        <div className="hero-content">
          <p className="eyebrow">Plan together. Celebrate better.</p>
          <h1 id="hero-title">Turn your event idea into a plan you can use.</h1>
          <p className="hero-copy">
            Build a practical budget, timeline, vendor checklist, and fresh
            ideas in one calm workspace.
          </p>
          <div className="actions">
            <Link className="button large" to="/signup">
              Start planning free
              <Icon name="arrow" />
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
        </div>
        <div className="hero-visual" aria-hidden="true">
          <div className="preview-card">
            <div className="preview-head">
              <span className="preview-badge">Wedding</span>
              <span className="preview-days">42 days to go</span>
            </div>
            <p className="preview-title">Maya &amp; Daniel</p>
            <div className="preview-meter">
              <span className="preview-meter__label">Tasks complete</span>
              <span className="preview-meter__track">
                <span className="preview-meter__fill preview-meter__fill--a" />
              </span>
            </div>
            <div className="preview-meter">
              <span className="preview-meter__label">Budget used</span>
              <span className="preview-meter__track">
                <span className="preview-meter__fill preview-meter__fill--b" />
              </span>
            </div>
            <ul className="preview-tasks">
              <li className="is-done">
                <Icon name="check" /> Confirm guest count
              </li>
              <li className="is-done">
                <Icon name="check" /> Book the venue
              </li>
              <li>
                <Icon name="calendar" /> Send invitations
              </li>
            </ul>
          </div>
          <div className="float-chip float-chip--one">
            <Icon name="sparkle" /> AI idea ready
          </div>
          <div className="float-chip float-chip--two">
            <Icon name="wallet" /> On budget
          </div>
        </div>
      </section>

      <section className="section" aria-labelledby="features-title">
        <div className="section-intro">
          <p className="eyebrow">Everything in one place</p>
          <h2 id="features-title">Less spreadsheet, more celebration</h2>
        </div>
        <ul className="feature-grid clean-list">
          {features.map((feature) => (
            <li className="feature" key={feature.title}>
              <span className="feature-icon">
                <Icon name={feature.icon} />
              </span>
              <h3>{feature.title}</h3>
              <p>{feature.text}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="section" aria-labelledby="how-title">
        <div className="section-intro">
          <p className="eyebrow">How it works</p>
          <h2 id="how-title">From idea to plan in three steps</h2>
        </div>
        <ol className="steps clean-list">
          {steps.map((step) => (
            <li className="step" key={step.title}>
              <h3>{step.title}</h3>
              <p>{step.text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="section" aria-labelledby="kinds-title">
        <div className="section-intro">
          <p className="eyebrow">Built for real events</p>
          <h2 id="kinds-title">Whatever you are celebrating</h2>
        </div>
        <ul className="kind-grid clean-list">
          {kinds.map((kind) => (
            <li className="kind" key={kind.title}>
              <Icon name={kind.icon} />
              <h3>{kind.title}</h3>
              <p>{kind.text}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="cta-band" aria-labelledby="cta-title">
        <div>
          <h2 id="cta-title">Ready to plan something good?</h2>
          <p>Create your first event in about two minutes.</p>
        </div>
        <Link className="button light large" to="/signup">
          Create your free account
          <Icon name="arrow" />
        </Link>
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
