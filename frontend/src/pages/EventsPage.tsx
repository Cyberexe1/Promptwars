import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import * as api from '../api/events';
import type { EventRecord } from '../api/types';
import { ErrorState, Loading } from '../components/Feedback';
import { PageShell } from '../components/layout/PageShell';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { currency, date, errorMessage } from '../utils/format';
export default function EventsPage() {
  useDocumentTitle('My events');
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError('');
    try {
      setEvents((await api.listEvents(signal)).events);
    } catch (reason) {
      if (!(reason instanceof DOMException && reason.name === 'AbortError'))
        setError(errorMessage(reason));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);
  const remove = async (event: EventRecord) => {
    if (!window.confirm(`Delete ${event.title}? This cannot be undone.`))
      return;
    try {
      await api.deleteEvent(event.id);
      setEvents((all) => all.filter((item) => item.id !== event.id));
    } catch (reason) {
      setError(errorMessage(reason));
    }
  };
  return (
    <PageShell>
      <section>
        <div className="section-heading">
          <div>
            <p className="eyebrow">Your plans</p>
            <h1>My events</h1>
          </div>
          <Link className="button" to="/events/new">
            Create an event
          </Link>
        </div>
        {loading ? (
          <Loading>Loading your events…</Loading>
        ) : error ? (
          <ErrorState message={error} retry={() => void load()} />
        ) : events.length === 0 ? (
          <div className="state">
            <h2>No events yet</h2>
            <p>Create your first event and we’ll build the starting plan.</p>
            <Link className="button" to="/events/new">
              Create an event
            </Link>
          </div>
        ) : (
          <ul className="card-grid clean-list">
            {events.map((event) => (
              <li className="card" key={event.id}>
                <p className="eyebrow">{event.type}</p>
                <h2>
                  <Link to={`/events/${encodeURIComponent(event.id)}`}>
                    {event.title}
                  </Link>
                </h2>
                <p>
                  {date(event.date)} · {event.city}
                </p>
                <p>
                  {event.guestCount.toLocaleString()} guests ·{' '}
                  {currency(event.totalBudget, event.currency)}
                </p>
                <div className="actions">
                  <Link
                    className="button small"
                    to={`/events/${encodeURIComponent(event.id)}`}
                  >
                    Open plan
                  </Link>
                  <button
                    className="danger secondary"
                    type="button"
                    onClick={() => void remove(event)}
                  >
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </PageShell>
  );
}
