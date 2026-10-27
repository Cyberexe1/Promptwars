import { useEffect, useState, type FormEvent } from 'react';
import type { VendorItem, VendorStatus } from '../../api/types';
import type { EventController } from '../../hooks/useEvent';
import { currency, errorMessage } from '../../utils/format';
const statuses: VendorStatus[] = [
  'to-research',
  'contacted',
  'quoted',
  'booked',
];
function VendorCard({
  vendor,
  code,
  save,
}: {
  vendor: VendorItem;
  code: string;
  save: (input: { status?: VendorStatus; quote?: number }) => Promise<unknown>;
}) {
  const [status, setStatus] = useState(vendor.status);
  const [quote, setQuote] = useState(
    vendor.quote === undefined ? '' : String(vendor.quote),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    if (dirty) return;
    setStatus(vendor.status);
    setQuote(vendor.quote === undefined ? '' : String(vendor.quote));
  }, [dirty, vendor]);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const amount = quote === '' ? undefined : Number(quote);
    if (
      amount !== undefined &&
      (!/^\d+(\.\d{1,2})?$/.test(quote) || amount > 100_000_000)
    ) {
      setError('Quote must be non-negative with up to 2 decimal places.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await save({
        status,
        ...(amount === undefined ? {} : { quote: amount }),
      });
      setDirty(false);
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  };
  return (
    <article className="card">
      <p className="eyebrow">{vendor.category}</p>
      <h3>{vendor.name}</h3>
      <p>{vendor.whyNeeded}</p>
      <p>
        Suggested budget: {currency(vendor.suggestedBudget, code)} · Lead time:{' '}
        {vendor.leadTimeDays} days
      </p>
      <form className="stack" onSubmit={(e) => void submit(e)}>
        <div className="field">
          <label htmlFor={`status-${vendor.id}`}>Status</label>
          <select
            id={`status-${vendor.id}`}
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as VendorStatus);
              setDirty(true);
            }}
          >
            {statuses.map((item) => (
              <option value={item} key={item}>
                {item.replace('-', ' ')}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor={`quote-${vendor.id}`}>Quote ({code})</label>
          <input
            id={`quote-${vendor.id}`}
            inputMode="decimal"
            value={quote}
            onChange={(e) => {
              setQuote(e.target.value);
              setDirty(true);
            }}
            aria-invalid={!!error}
            aria-describedby={error ? `vendor-error-${vendor.id}` : undefined}
          />
          {error && (
            <p className="field-error" id={`vendor-error-${vendor.id}`}>
              {error}
            </p>
          )}
        </div>
        <button disabled={busy}>{busy ? 'Saving…' : 'Save vendor'}</button>
      </form>
      <details>
        <summary>Questions to ask</summary>
        <ul>
          {vendor.questions.map((question) => (
            <li key={question}>{question}</li>
          ))}
        </ul>
      </details>
    </article>
  );
}
export function VendorsPanel({ controller }: { controller: EventController }) {
  const plan = controller.plan!;
  return (
    <section aria-labelledby="vendors-title">
      <h2 id="vendors-title">Vendors</h2>
      {plan.vendors.length ? (
        <div className="card-grid">
          {plan.vendors.map((vendor) => (
            <VendorCard
              key={vendor.id}
              vendor={vendor}
              code={plan.event.currency}
              save={(input) => controller.updateVendor(vendor.id, input)}
            />
          ))}
        </div>
      ) : (
        <p className="state">No vendor suggestions are needed for this plan.</p>
      )}
    </section>
  );
}
