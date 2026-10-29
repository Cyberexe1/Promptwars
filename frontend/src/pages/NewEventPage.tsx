import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { createEvent } from '../api/events';
import type {
  CreateEventInput,
  EventAudience,
  EventSetting,
  EventType,
} from '../api/types';
import { PageShell } from '../components/layout/PageShell';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { currency, errorMessage } from '../utils/format';

const steps = [
  'Type',
  'Basics',
  'Guests and Budget',
  'Preferences',
  'Review',
] as const;
const currencies = ['USD', 'INR', 'GBP', 'EUR', 'CAD', 'AUD'];
type Draft = {
  type: EventType | '';
  title: string;
  date: string;
  city: string;
  guestCount: string;
  totalBudget: string;
  currency: string;
  indoorOutdoor: EventSetting;
  audience: EventAudience;
  preferences: string;
};
const initial: Draft = {
  type: '',
  title: '',
  date: '',
  city: '',
  guestCount: '',
  totalBudget: '',
  currency: 'USD',
  indoorOutdoor: 'either',
  audience: 'mixed',
  preferences: '',
};
function decimalMoney(value: string) {
  return (
    /^\d+(\.\d{1,2})?$/.test(value) &&
    Number(value) > 0 &&
    Number(value) <= 100_000_000
  );
}
export default function NewEventPage() {
  useDocumentTitle('Create an event');
  const navigate = useNavigate();
  const heading = useRef<HTMLHeadingElement>(null);
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [apiError, setApiError] = useState('');
  useEffect(() => {
    heading.current?.focus();
  }, [step]);
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft((old) => ({ ...old, [key]: value }));
    setErrors((old) => ({ ...old, [key]: '' }));
  };
  const validate = () => {
    const next: Record<string, string> = {};
    if (step === 0 && !draft.type) next.type = 'Choose an event type.';
    if (step === 1) {
      if (draft.title.trim().length < 2)
        next.title = 'Enter a title with at least 2 characters.';
      if (!draft.city || draft.city.trim().length < 2)
        next.city = 'Enter a city with at least 2 characters.';
      if (
        !draft.date ||
        new Date(`${draft.date}T23:59:59.999Z`).getTime() <= Date.now()
      )
        next.date = 'Choose a future date.';
    }
    if (step === 2) {
      const guests = Number(draft.guestCount);
      if (!Number.isInteger(guests) || guests < 1 || guests > 2000)
        next.guestCount = 'Guests must be a whole number from 1 to 2,000.';
      if (!decimalMoney(draft.totalBudget))
        next.totalBudget =
          'Budget must be positive with no more than 2 decimal places.';
    }
    if (step === 3) {
      const preferences = draft.preferences
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
      if (preferences.length > 15)
        next.preferences = 'Add no more than 15 preferences.';
      else if (preferences.some((item) => item.length < 2 || item.length > 50))
        next.preferences = 'Each preference must be 2 to 50 characters.';
    }
    setErrors(next);
    const firstInvalid = Object.keys(next)[0];
    if (firstInvalid) {
      queueMicrotask(() => {
        const control =
          firstInvalid === 'type'
            ? document.querySelector<HTMLElement>('input[name="type"]')
            : document.getElementById(firstInvalid);
        control?.focus();
      });
    }
    return Object.keys(next).length === 0;
  };
  const next = () => {
    if (validate()) setStep((value) => Math.min(4, value + 1));
  };
  const inputProps = (name: keyof Draft) => ({
    'aria-invalid': !!errors[name],
    'aria-describedby': errors[name] ? `${name}-error` : undefined,
  });
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (step < 4) {
      next();
      return;
    }
    setBusy(true);
    setApiError('');
    const input: CreateEventInput = {
      type: draft.type as EventType,
      title: draft.title.trim(),
      date: draft.date,
      city: draft.city.trim(),
      guestCount: Number(draft.guestCount),
      totalBudget: Number(draft.totalBudget),
      currency: draft.currency,
      indoorOutdoor: draft.indoorOutdoor,
      audience: draft.audience,
      preferences: draft.preferences
        .split(',')
        .map((item) => item.trim())
        .filter((item) => item.length >= 2)
        .slice(0, 15),
    };
    try {
      const plan = await createEvent(input);
      navigate(`/events/${encodeURIComponent(plan.event.id)}`, {
        replace: true,
      });
    } catch (reason) {
      setApiError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  };
  const perGuest =
    Number(draft.guestCount) > 0 && Number(draft.totalBudget) > 0
      ? Number(draft.totalBudget) / Number(draft.guestCount)
      : 0;
  return (
    <PageShell>
      <section className="wizard narrow-wide">
        <p className="eyebrow">Create an event</p>
        <h1 ref={heading} tabIndex={-1}>
          {steps[step]}
        </h1>
        <ol className="stepper" aria-label="Creation progress">
          {steps.map((label, index) => (
            <li key={label} aria-current={index === step ? 'step' : undefined}>
              <span>{index + 1}</span>
              {label}
            </li>
          ))}
        </ol>
        {apiError && (
          <div className="error-summary" role="alert">
            <strong>We couldn’t build your plan</strong>
            <p>{apiError}</p>
          </div>
        )}
        <form onSubmit={(e) => void submit(e)} noValidate>
          {step === 0 && (
            <fieldset aria-describedby={errors.type ? 'type-error' : undefined}>
              <legend>What are you planning?</legend>
              <div className="choice-grid">
                {(['wedding', 'birthday', 'community'] as EventType[]).map(
                  (type) => (
                    <label className="choice" key={type}>
                      <input
                        type="radio"
                        name="type"
                        value={type}
                        checked={draft.type === type}
                        onChange={() => set('type', type)}
                      />{' '}
                      <strong>{type[0].toUpperCase() + type.slice(1)}</strong>
                    </label>
                  ),
                )}
              </div>
              {errors.type && (
                <p id="type-error" className="field-error" role="alert">
                  {errors.type}
                </p>
              )}
            </fieldset>
          )}
          {step === 1 && (
            <div className="stack">
              <div className="field">
                <label htmlFor="title">Event title</label>
                <input
                  id="title"
                  value={draft.title}
                  maxLength={120}
                  onChange={(e) => set('title', e.target.value)}
                  {...inputProps('title')}
                />
                {errors.title && (
                  <p id="title-error" className="field-error">
                    {errors.title}
                  </p>
                )}
              </div>
              <div className="field">
                <label htmlFor="date">Event date</label>
                <input
                  id="date"
                  type="date"
                  value={draft.date}
                  onChange={(e) => set('date', e.target.value)}
                  {...inputProps('date')}
                />
                {errors.date && (
                  <p id="date-error" className="field-error">
                    {errors.date}
                  </p>
                )}
              </div>
              <div className="field">
                <label htmlFor="city">City</label>
                <input
                  id="city"
                  value={draft.city}
                  maxLength={100}
                  onChange={(e) => set('city', e.target.value)}
                  {...inputProps('city')}
                />
                {errors.city && (
                  <p id="city-error" className="field-error">
                    {errors.city}
                  </p>
                )}
              </div>
            </div>
          )}
          {step === 2 && (
            <div className="stack">
              <div className="field">
                <label htmlFor="guestCount">Number of guests</label>
                <input
                  id="guestCount"
                  type="number"
                  min="1"
                  max="2000"
                  step="1"
                  value={draft.guestCount}
                  onChange={(e) => set('guestCount', e.target.value)}
                  {...inputProps('guestCount')}
                />
                {errors.guestCount && (
                  <p id="guestCount-error" className="field-error">
                    {errors.guestCount}
                  </p>
                )}
              </div>
              <div className="field">
                <label htmlFor="totalBudget">Total budget</label>
                <div className="input-pair">
                  <select
                    aria-label="Currency"
                    value={draft.currency}
                    onChange={(e) => set('currency', e.target.value)}
                  >
                    {currencies.map((code) => (
                      <option key={code}>{code}</option>
                    ))}
                  </select>
                  <input
                    id="totalBudget"
                    inputMode="decimal"
                    value={draft.totalBudget}
                    onChange={(e) => set('totalBudget', e.target.value)}
                    {...inputProps('totalBudget')}
                  />
                </div>
                {errors.totalBudget && (
                  <p id="totalBudget-error" className="field-error">
                    {errors.totalBudget}
                  </p>
                )}
                {perGuest > 0 && (
                  <p className="hint" role="status">
                    That’s about {currency(perGuest, draft.currency)} per guest.
                  </p>
                )}
              </div>
            </div>
          )}
          {step === 3 && (
            <div className="stack">
              <fieldset>
                <legend>Setting</legend>
                {(['indoor', 'outdoor', 'either'] as EventSetting[]).map(
                  (value) => (
                    <label className="inline-choice" key={value}>
                      <input
                        type="radio"
                        name="setting"
                        checked={draft.indoorOutdoor === value}
                        onChange={() => set('indoorOutdoor', value)}
                      />{' '}
                      {value}
                    </label>
                  ),
                )}
              </fieldset>
              <fieldset>
                <legend>Audience</legend>
                {(['adults', 'mixed', 'kids'] as EventAudience[]).map(
                  (value) => (
                    <label className="inline-choice" key={value}>
                      <input
                        type="radio"
                        name="audience"
                        checked={draft.audience === value}
                        onChange={() => set('audience', value)}
                      />{' '}
                      {value}
                    </label>
                  ),
                )}
              </fieldset>
              <div className="field">
                <label htmlFor="preferences">Preferences</label>
                <textarea
                  id="preferences"
                  rows={4}
                  maxLength={800}
                  value={draft.preferences}
                  onChange={(e) => set('preferences', e.target.value)}
                  aria-invalid={!!errors.preferences}
                  aria-describedby={
                    errors.preferences
                      ? 'preferences-hint preferences-error'
                      : 'preferences-hint'
                  }
                />
                <p id="preferences-hint" className="hint">
                  Separate up to 15 preferences with commas, for example
                  “vegetarian menu, relaxed atmosphere”.
                </p>
                {errors.preferences && (
                  <p id="preferences-error" className="field-error">
                    {errors.preferences}
                  </p>
                )}
              </div>
            </div>
          )}
          {step === 4 && (
            <section className="review" aria-labelledby="review-title">
              <h2 id="review-title">Review your event</h2>
              <dl>
                <div>
                  <dt>Type</dt>
                  <dd>{draft.type}</dd>
                </div>
                <div>
                  <dt>Title</dt>
                  <dd>{draft.title}</dd>
                </div>
                <div>
                  <dt>Date and city</dt>
                  <dd>
                    {draft.date} · {draft.city}
                  </dd>
                </div>
                <div>
                  <dt>Guests</dt>
                  <dd>{draft.guestCount}</dd>
                </div>
                <div>
                  <dt>Budget</dt>
                  <dd>{currency(Number(draft.totalBudget), draft.currency)}</dd>
                </div>
                <div>
                  <dt>Setting and audience</dt>
                  <dd>
                    {draft.indoorOutdoor} · {draft.audience}
                  </dd>
                </div>
                <div>
                  <dt>Preferences</dt>
                  <dd>{draft.preferences || 'None added'}</dd>
                </div>
              </dl>
            </section>
          )}
          <div className="wizard-actions">
            {step > 0 && (
              <button
                className="secondary"
                type="button"
                disabled={busy}
                onClick={() => setStep((value) => value - 1)}
              >
                Back
              </button>
            )}
            <button type="submit" disabled={busy}>
              {busy
                ? 'Building your plan…'
                : step === 4
                  ? 'Build my plan'
                  : 'Next'}
            </button>
          </div>
          <p className="sr-only" role="status">
            {busy ? 'Building your plan' : ''}
          </p>
        </form>
      </section>
    </PageShell>
  );
}
