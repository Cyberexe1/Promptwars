import { useEffect, useState, type FormEvent } from 'react';
import type { BudgetItem } from '../../api/types';
import type { EventController } from '../../hooks/useEvent';
import { currency, errorMessage } from '../../utils/format';
function BudgetRow({
  item,
  code,
  save,
}: {
  item: BudgetItem;
  code: string;
  save: (spent: number) => Promise<unknown>;
}) {
  const [value, setValue] = useState(String(item.spent));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => setValue(String(item.spent)), [item.spent]);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const amount = Number(value);
    if (
      !/^\d+(\.\d{1,2})?$/.test(value) ||
      amount < 0 ||
      amount > 100_000_000
    ) {
      setError('Enter a non-negative total with up to 2 decimal places.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await save(amount);
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  };
  const percent =
    item.allocated > 0
      ? (item.spent / item.allocated) * 100
      : item.spent > 0
        ? 100
        : 0;
  const visual = Math.max(0, Math.min(100, percent));
  const overspent = item.spent > item.allocated;
  return (
    <tr>
      <th scope="row">{item.label}</th>
      <td>{currency(item.allocated, code)}</td>
      <td>
        <div className="budget-bar" aria-hidden="true">
          <span style={{ width: `${visual}%` }} />
        </div>
        <span>
          {currency(item.spent, code)} spent ({Math.round(percent)}%)
        </span>
        {overspent && (
          <strong className="overspend">
            Overspent by {currency(item.spent - item.allocated, code)}
          </strong>
        )}
      </td>
      <td>{currency(item.allocated - item.spent, code)} remaining</td>
      <td>
        <form className="inline-form" onSubmit={(e) => void submit(e)}>
          <label htmlFor={`spent-${item.category}`}>
            Replacement total spent
          </label>
          <input
            id={`spent-${item.category}`}
            inputMode="decimal"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            aria-invalid={!!error}
            aria-describedby={
              error ? `spent-error-${item.category}` : undefined
            }
          />
          <button disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
          {error && (
            <p id={`spent-error-${item.category}`} className="field-error">
              {error}
            </p>
          )}
        </form>
      </td>
    </tr>
  );
}
export function BudgetPanel({ controller }: { controller: EventController }) {
  const plan = controller.plan!;
  const allocated = plan.budget.reduce((sum, item) => sum + item.allocated, 0);
  const spent = plan.budget.reduce((sum, item) => sum + item.spent, 0);
  return (
    <section aria-labelledby="budget-title">
      <h2 id="budget-title">Budget</h2>
      <p>
        <strong>
          {currency(allocated, plan.event.currency)} allocated ·{' '}
          {currency(spent, plan.event.currency)} spent ·{' '}
          {currency(allocated - spent, plan.event.currency)} remaining
        </strong>
      </p>
      <div
        className="table-scroll"
        role="region"
        aria-label="Budget table"
        tabIndex={0}
      >
        <table>
          <caption>Budget allocation and replacement spend totals</caption>
          <thead>
            <tr>
              <th scope="col">Category</th>
              <th scope="col">Allocated</th>
              <th scope="col">Spent</th>
              <th scope="col">Remaining</th>
              <th scope="col">Update spend</th>
            </tr>
          </thead>
          <tbody>
            {plan.budget.map((item) => (
              <BudgetRow
                key={item.category}
                item={item}
                code={plan.event.currency}
                save={(spentValue) =>
                  controller.updateBudget(item.category, spentValue)
                }
              />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
