import { useRef, type KeyboardEvent } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ErrorState, Loading } from '../components/Feedback';
import { BudgetPanel } from '../components/dashboard/BudgetPanel';
import { ChatPanel } from '../components/dashboard/ChatPanel';
import { IdeasPanel } from '../components/dashboard/IdeasPanel';
import { OverviewPanel } from '../components/dashboard/OverviewPanel';
import { TimelinePanel } from '../components/dashboard/TimelinePanel';
import { VendorsPanel } from '../components/dashboard/VendorsPanel';
import { PageShell } from '../components/layout/PageShell';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useEvent } from '../hooks/useEvent';
import { date } from '../utils/format';
const tabs = [
  { slug: 'overview', label: 'Overview' },
  { slug: 'budget', label: 'Budget' },
  { slug: 'timeline', label: 'Timeline' },
  { slug: 'vendors', label: 'Vendors' },
  { slug: 'ideas', label: 'Ideas' },
  { slug: 'assistant', label: 'Assistant' },
] as const;
type TabSlug = (typeof tabs)[number]['slug'];
export default function EventDashboardPage() {
  const { id = '' } = useParams();
  const controller = useEvent(id);
  const [params, setParams] = useSearchParams();
  const requested = params.get('tab');
  const active: TabSlug = tabs.some((tab) => tab.slug === requested)
    ? (requested as TabSlug)
    : 'overview';
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  useDocumentTitle(controller.plan?.event.title ?? 'Event plan');
  const select = (slug: TabSlug, focus = false) => {
    setParams(slug === 'overview' ? {} : { tab: slug }, { replace: true });
    if (focus)
      queueMicrotask(() =>
        refs.current[tabs.findIndex((tab) => tab.slug === slug)]?.focus(),
      );
  };
  const onKeys = (event: KeyboardEvent, index: number) => {
    let next: number;
    if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
    else if (event.key === 'ArrowLeft')
      next = (index - 1 + tabs.length) % tabs.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = tabs.length - 1;
    else return;
    event.preventDefault();
    select(tabs[next].slug, true);
  };
  return (
    <PageShell>
      {controller.loading && !controller.plan ? (
        <Loading>Loading your event plan…</Loading>
      ) : controller.error && !controller.plan ? (
        <ErrorState message={controller.error} retry={controller.retry} />
      ) : controller.plan ? (
        <article className="dashboard">
          <header className="dashboard-header">
            <div>
              <Link to="/events">← My events</Link>
              <p className="eyebrow">
                {controller.plan.event.type} ·{' '}
                {date(controller.plan.event.date)}
              </p>
              <h1>{controller.plan.event.title}</h1>
              <p>
                {controller.plan.event.city} ·{' '}
                {controller.plan.event.guestCount.toLocaleString()} guests
              </p>
            </div>
            {controller.loading && <span role="status">Refreshing plan…</span>}
          </header>
          {controller.error && (
            <div className="banner" role="alert">
              <strong>Plan update notice</strong>
              <p>{controller.error}</p>
              <button type="button" onClick={controller.retry}>
                Retry refresh
              </button>
            </div>
          )}
          <div className="tabs" role="tablist" aria-label="Event plan sections">
            {tabs.map((tab, index) => (
              <button
                key={tab.slug}
                id={`tab-${tab.slug}`}
                ref={(node) => {
                  refs.current[index] = node;
                }}
                type="button"
                role="tab"
                aria-selected={active === tab.slug}
                aria-controls={`panel-${tab.slug}`}
                tabIndex={active === tab.slug ? 0 : -1}
                onClick={() => select(tab.slug)}
                onKeyDown={(event) => onKeys(event, index)}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <div
            className="tab-panel"
            id={`panel-${active}`}
            role="tabpanel"
            aria-labelledby={`tab-${active}`}
            tabIndex={0}
          >
            {active === 'overview' && <OverviewPanel controller={controller} />}
            {active === 'budget' && <BudgetPanel controller={controller} />}
            {active === 'timeline' && <TimelinePanel controller={controller} />}
            {active === 'vendors' && <VendorsPanel controller={controller} />}
            {active === 'ideas' && (
              <IdeasPanel eventId={id} code={controller.plan.event.currency} />
            )}
            {active === 'assistant' && <ChatPanel eventId={id} />}
          </div>
        </article>
      ) : null}
    </PageShell>
  );
}
